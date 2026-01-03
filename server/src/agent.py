"""Alexa-OS Voice Agent - Main entrypoint."""

import logging
import asyncio
import os
import json
from livekit.agents import JobContext, WorkerOptions, cli
from livekit.agents.voice import Agent, AgentSession, AgentStateChangedEvent, UserStateChangedEvent

from .config import settings
from .rpc_handlers import AgentRpcHandlers
from .telemetry import TelemetryEmitter
from .wake_word import WakeWordGatedSession
from .mcp_manager import MCPServerManager
from .voice_pipeline import (
    create_stt,
    create_vad,
    create_streaming_stt,
    create_tts,
    create_llm,
    create_wake_word_detector,
)

logger = logging.getLogger("alexa-os")

# System prompt for the assistant
SYSTEM_PROMPT = """You are Jarvis, a helpful voice assistant.

Key behaviors:
- Keep responses concise and conversational - this is voice, not text
- Be friendly and natural in tone
- When you don't know something, say so directly
- For complex questions, break down the answer into digestible parts
- Use simple language, avoid jargon unless asked

You can help with:
- Answering questions on any topic
- Having casual conversations
- Providing information and explanations
- Helping with tasks and planning

Remember: You're speaking, not writing. Keep it brief and natural."""


async def entrypoint(ctx: JobContext):
    """Main entrypoint for the voice agent."""
    logger.info("=" * 60)
    logger.info("Starting Alexa-OS Voice Agent")
    logger.info(f"Room: {ctx.room.name}")
    logger.info("=" * 60)

    await ctx.connect()

    # Initialize handlers and telemetry
    rpc_handlers = AgentRpcHandlers(room=ctx.room, ollama_host=settings.ollama_host)
    telemetry = TelemetryEmitter(room=ctx.room)

    # Create voice pipeline components
    logger.info("Initializing voice pipeline components...")
    whisper_stt = create_stt()
    vad = create_vad()
    streaming_stt = create_streaming_stt(whisper_stt, vad)
    tts = create_tts()
    llm = create_llm()

    # MCP Server Manager
    mcp_manager = MCPServerManager(rpc_handlers)
    await mcp_manager.load_from_config()
    mcp_servers = mcp_manager.servers

    # Wake Word Detector
    wake_word_detector = create_wake_word_detector()
    wake_word_gated_session = None

    # Wake word state helper
    async def send_wake_word_state(state: str, model_name: str = "", confidence: float = 0.0):
        try:
            data = json.dumps({
                "type": "wake_word_state",
                "state": state,
                "model": model_name,
                "confidence": confidence,
            }).encode("utf-8")
            await ctx.room.local_participant.publish_data(data, reliable=True, topic="wake_word")
        except Exception as e:
            logger.error(f"Failed to publish wake word state: {e}")

    # Configure RPC handlers
    rpc_handlers.set_model(settings.ollama_model)
    rpc_handlers.set_stt_model(settings.whisper_model)
    rpc_handlers.set_tts_provider(f"{settings.tts_provider} ({settings.kokoro_voice})")
    rpc_handlers.set_vad_settings({
        "activation_threshold": settings.vad_threshold,
        "min_speech_duration": settings.vad_min_speech_duration,
        "min_silence_duration": settings.vad_min_silence_duration,
    })
    rpc_handlers.set_mcp_servers(mcp_servers)

    if wake_word_detector:
        rpc_handlers.set_wake_word_config(enabled=True, model=settings.wake_word_model)
    else:
        rpc_handlers.set_wake_word_config(enabled=False)

    # Callbacks
    def on_model_change(new_model: str):
        logger.info(f"Model change: {llm.model} -> {new_model}")
        llm.model = new_model

    def on_interrupt():
        logger.info("Interrupt requested via RPC")

    async def on_mcp_change():
        logger.info("MCP configuration changed, reloading...")
        await mcp_manager.reload()
        nonlocal mcp_servers
        mcp_servers = mcp_manager.servers

    rpc_handlers.set_model_change_callback(on_model_change)
    rpc_handlers.set_interrupt_callback(on_interrupt)
    rpc_handlers.set_mcp_change_callback(on_mcp_change)
    await rpc_handlers.register_all()

    logger.info("Voice pipeline components:")
    logger.info(f"  STT: Local Whisper ({settings.whisper_model})")
    logger.info(f"  VAD: Silero")
    logger.info(f"  TTS: Kokoro ({settings.kokoro_voice})")
    logger.info(f"  LLM: Ollama ({settings.ollama_model})")
    logger.info(f"  MCP: {len(mcp_servers)} server(s)")
    logger.info(f"  Wake Word: {'Enabled' if wake_word_detector else 'Disabled'}")

    # Create agent session
    session = AgentSession(
        stt=streaming_stt,
        tts=tts,
        vad=vad,
        mcp_servers=mcp_servers if mcp_servers else None,
    )

    # Event handlers for telemetry
    @session.on("agent_state_changed")
    def on_agent_state_changed(event: AgentStateChangedEvent):
        state = event.new_state
        logger.info(f"Agent state: {event.old_state} -> {state}")

        if state == "thinking":
            asyncio.create_task(telemetry.agent_state_change("thinking"))
        elif state == "speaking":
            asyncio.create_task(telemetry.agent_state_change("speaking"))
            if wake_word_gated_session and wake_word_gated_session.is_active:
                wake_word_gated_session.refresh_activity()
        elif state == "listening":
            asyncio.create_task(telemetry.agent_state_change("listening"))
        elif state == "initializing":
            asyncio.create_task(telemetry.agent_state_change("initializing"))

    @session.on("user_state_changed")
    def on_user_state_changed(event: UserStateChangedEvent):
        state = event.new_state
        logger.info(f"User state: {event.old_state} -> {state}")

        if state == "speaking":
            asyncio.create_task(telemetry.agent_state_change("user_speaking"))
            if wake_word_gated_session and wake_word_gated_session.is_active:
                wake_word_gated_session.refresh_activity()
        elif state == "listening":
            asyncio.create_task(telemetry.agent_state_change("user_stopped_speaking"))
        elif state == "away":
            asyncio.create_task(telemetry.agent_state_change("user_away"))

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event):
        if hasattr(event, 'transcript') and event.transcript:
            asyncio.create_task(telemetry.stt_result(event.transcript, is_final=True))
            asyncio.create_task(telemetry.agent_state_change("transcribing"))

    @session.on("function_tools_executed")
    def on_function_tools_executed(event):
        """Emit tool call telemetry when MCP tools complete."""
        async def emit_tool_telemetry():
            for call, output in event.zipped():
                tool_name = getattr(call, 'name', str(call))
                arguments = getattr(call, 'arguments', {})
                result = getattr(output, 'content', str(output))
                error = getattr(output, 'error', None) if hasattr(output, 'error') else None

                request_id = await telemetry.tool_call_start(tool_name, arguments)
                await telemetry.tool_call_end(request_id, result, error)

                logger.info(f"Tool executed: {tool_name}")

        asyncio.create_task(emit_tool_telemetry())

    await session.start(
        room=ctx.room,
        agent=Agent(instructions=SYSTEM_PROMPT, llm=llm),
    )

    await telemetry.agent_state_change("idle")

    # Wake word detection
    if wake_word_detector:
        async def on_wake_word_detected(model_name: str, confidence: float):
            logger.info(f"Wake word '{model_name}' detected ({confidence:.2f})")
            rpc_handlers.set_wake_word_state("active")
            await send_wake_word_state("detected", model_name, confidence)
            await asyncio.sleep(0.3)
            await send_wake_word_state("active", model_name, confidence)

        async def on_session_activate():
            logger.info("Wake word session activated")
            rpc_handlers.set_wake_word_state("active")

        async def on_session_deactivate():
            logger.info("Wake word session deactivated")
            rpc_handlers.set_wake_word_state("listening")
            await send_wake_word_state("timeout")
            await asyncio.sleep(0.1)
            await send_wake_word_state("listening")

        wake_word_detector._on_wake_word = on_wake_word_detected

        wake_word_gated_session = WakeWordGatedSession(
            detector=wake_word_detector,
            timeout_seconds=settings.wake_word_timeout,
            on_activate=on_session_activate,
            on_deactivate=on_session_deactivate,
        )

        await wake_word_detector.start()
        await send_wake_word_state("listening")
        logger.info(f"Wake word active: Say '{settings.wake_word_model.replace('_', ' ')}'")

    logger.info("=" * 60)
    logger.info("Agent ready - listening for voice input...")
    logger.info("=" * 60)


def run_agent():
    """Run the voice agent worker."""
    cache_dir = settings.model_cache_dir
    os.makedirs(cache_dir, exist_ok=True)

    os.environ.setdefault("HF_HOME", cache_dir)
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", cache_dir)

    logger.info(f"Model cache directory: {cache_dir}")

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
            ws_url=settings.livekit_url,
        )
    )
