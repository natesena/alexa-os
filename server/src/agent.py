"""Alexa-OS Voice Agent - Main agent logic with local STT/TTS/LLM."""

import logging
import asyncio
from livekit.agents import JobContext, WorkerOptions, cli
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.stt import StreamAdapter
from livekit.plugins import silero, openai as openai_plugin
import ollama

from .config import settings
from .stt_whisper import FasterWhisperSTT

logger = logging.getLogger("alexa-os")


class OllamaLLM:
    """
    Wrapper to make Ollama compatible with LiveKit agents.

    LiveKit expects an LLM with async chat interface that yields streaming responses.
    """

    def __init__(self, model: str, host: str):
        self.model = model
        self.host = host
        self._client = None
        logger.info(f"Initialized OllamaLLM: {model} at {host}")

    @property
    def client(self):
        if self._client is None:
            self._client = ollama.AsyncClient(host=self.host)
        return self._client

    async def chat(
        self,
        *,
        chat_ctx,
        tools=None,
        tool_choice=None,
        conn_options=None,
    ):
        """
        Chat completion with Ollama.

        Args:
            chat_ctx: Chat context with message history
            tools: Optional tools/functions (not yet supported)
            tool_choice: Tool selection mode (not yet supported)
            conn_options: Connection options

        Yields:
            Streaming response chunks
        """
        # Convert chat context to Ollama message format
        messages = []
        for msg in chat_ctx.messages:
            role = msg.role
            if role == "assistant":
                role = "assistant"
            elif role == "user":
                role = "user"
            elif role == "system":
                role = "system"

            content = msg.content if hasattr(msg, "content") else str(msg)
            messages.append({"role": role, "content": content})

        logger.debug(f"Ollama chat with {len(messages)} messages")

        # Stream response from Ollama
        response = await self.client.chat(
            model=self.model,
            messages=messages,
            stream=True,
        )

        async for chunk in response:
            if "message" in chunk and "content" in chunk["message"]:
                yield chunk["message"]["content"]


def create_stt():
    """Create local Whisper STT instance."""
    logger.info(f"Creating local Whisper STT: model={settings.whisper_model}")

    whisper_stt = FasterWhisperSTT(
        model=settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
        language=settings.whisper_language,
        download_root=settings.model_cache_dir,
    )

    return whisper_stt


def create_vad():
    """Create Silero VAD for voice activity detection."""
    logger.info("Creating Silero VAD")

    vad = silero.VAD.load(
        min_speech_duration=settings.vad_min_speech_duration,
        min_silence_duration=settings.vad_min_silence_duration,
    )

    return vad


def create_streaming_stt(stt, vad):
    """
    Wrap non-streaming STT with StreamAdapter for real-time use.

    The StreamAdapter uses VAD to detect speech boundaries and sends
    complete speech segments to Whisper for transcription.
    """
    logger.info("Creating StreamAdapter for non-streaming STT")

    return StreamAdapter(
        stt=stt,
        vad=vad,
    )


def create_tts():
    """Create TTS instance - Kokoro via OpenAI-compatible API."""
    if settings.tts_provider == "kokoro":
        logger.info(f"Creating Kokoro TTS at {settings.kokoro_url}")

        # Kokoro-FastAPI provides an OpenAI-compatible TTS endpoint
        return openai_plugin.TTS(
            model="kokoro",
            voice=settings.kokoro_voice,
            speed=settings.kokoro_speed,
            base_url=settings.kokoro_url,
        )
    else:
        raise ValueError(f"Unknown TTS provider: {settings.tts_provider}")


def create_llm():
    """Create LLM instance - Ollama by default."""
    if settings.llm_provider == "ollama":
        logger.info(f"Creating Ollama LLM: {settings.ollama_model} at {settings.ollama_host}")
        return OllamaLLM(
            model=settings.ollama_model,
            host=settings.ollama_host,
        )
    elif settings.llm_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY required for Anthropic provider")
        # Would need livekit-plugins-anthropic
        raise NotImplementedError("Anthropic provider not yet implemented")
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")


async def entrypoint(ctx: JobContext):
    """Main entrypoint for the voice agent."""
    logger.info(f"=" * 60)
    logger.info(f"Starting Alexa-OS Voice Agent")
    logger.info(f"Room: {ctx.room.name}")
    logger.info(f"=" * 60)

    # Connect to the LiveKit room
    await ctx.connect()

    # Create components
    logger.info("Initializing voice pipeline components...")

    # STT: Local Whisper + VAD + StreamAdapter
    whisper_stt = create_stt()
    vad = create_vad()
    streaming_stt = create_streaming_stt(whisper_stt, vad)

    # TTS: Kokoro via FastAPI
    tts = create_tts()

    # LLM: Ollama
    llm = create_llm()

    logger.info("Voice pipeline components:")
    logger.info(f"  STT: Local Whisper ({settings.whisper_model})")
    logger.info(f"  VAD: Silero")
    logger.info(f"  TTS: Kokoro ({settings.kokoro_voice})")
    logger.info(f"  LLM: Ollama ({settings.ollama_model})")

    # System prompt for the assistant
    system_prompt = """You are Jarvis, a helpful voice assistant.

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

    # Create and start the agent session
    session = AgentSession(
        stt=streaming_stt,
        tts=tts,
        vad=vad,
    )

    await session.start(
        room=ctx.room,
        agent=Agent(
            instructions=system_prompt,
            llm=llm,
        ),
    )

    logger.info("=" * 60)
    logger.info("Agent ready - listening for voice input...")
    logger.info("=" * 60)


def run_agent():
    """Run the voice agent worker."""
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            api_key=settings.livekit_api_key,
            api_secret=settings.livekit_api_secret,
            ws_url=settings.livekit_url,
        )
    )
