"""Voice pipeline component factories for STT, TTS, VAD, and LLM."""

import logging
from livekit.agents.stt import StreamAdapter
from livekit.plugins import silero, openai as openai_plugin

from .config import settings
from .stt_whisper import FasterWhisperSTT
from .wake_word import WakeWordDetector

logger = logging.getLogger("alexa-os")


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


def create_vad(vad_settings: dict | None = None):
    """Create Silero VAD for voice activity detection.

    Args:
        vad_settings: Optional dict with activation_threshold, min_speech_duration,
                      min_silence_duration. Falls back to config defaults if not provided.
    """
    # Use provided settings or fall back to config defaults
    activation_threshold = settings.vad_threshold
    min_speech_duration = settings.vad_min_speech_duration
    min_silence_duration = settings.vad_min_silence_duration

    if vad_settings:
        activation_threshold = vad_settings.get("activation_threshold", activation_threshold)
        min_speech_duration = vad_settings.get("min_speech_duration", min_speech_duration)
        min_silence_duration = vad_settings.get("min_silence_duration", min_silence_duration)

    logger.info(f"Creating Silero VAD: threshold={activation_threshold}, "
                f"min_speech={min_speech_duration}s, min_silence={min_silence_duration}s")

    vad = silero.VAD.load(
        min_speech_duration=min_speech_duration,
        min_silence_duration=min_silence_duration,
        activation_threshold=activation_threshold,
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
        base_url = settings.kokoro_url.rstrip('/') + '/v1'
        logger.info(f"Creating Kokoro TTS at {base_url}")

        import openai
        client = openai.AsyncClient(
            api_key="not-needed",
            base_url=base_url,
        )

        return openai_plugin.TTS(
            model="kokoro",
            voice=settings.kokoro_voice,
            speed=settings.kokoro_speed,
            client=client,
        )
    else:
        raise ValueError(f"Unknown TTS provider: {settings.tts_provider}")


def create_llm():
    """Create LLM instance - Ollama via OpenAI-compatible API."""
    import httpx

    if settings.llm_provider == "ollama":
        base_url = settings.ollama_host.rstrip('/') + '/v1'
        logger.info(f"Creating Ollama LLM via OpenAI plugin: {settings.ollama_model} at {base_url}")

        return openai_plugin.LLM(
            model=settings.ollama_model,
            base_url=base_url,
            api_key="ollama",
            timeout=httpx.Timeout(None),  # No timeout - wait indefinitely
        )
    elif settings.llm_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY required for Anthropic provider")
        raise NotImplementedError("Anthropic provider not yet implemented")
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")


def create_wake_word_detector():
    """Create wake word detector for 'Hey Jarvis' activation."""
    if not settings.wake_word_enabled:
        logger.info("Wake word detection disabled")
        return None

    logger.info(
        f"Creating wake word detector: model={settings.wake_word_model}, "
        f"threshold={settings.wake_word_threshold}"
    )

    return WakeWordDetector(
        model_names=[settings.wake_word_model],
        threshold=settings.wake_word_threshold,
        cooldown_seconds=settings.wake_word_cooldown,
    )
