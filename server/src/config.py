"""Configuration for Alexa-OS Voice Assistant."""

import os
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # LiveKit Configuration
    livekit_api_key: str = Field(default="devkey", alias="LIVEKIT_API_KEY")
    livekit_api_secret: str = Field(default="secret", alias="LIVEKIT_API_SECRET")
    livekit_url: str = Field(default="ws://localhost:7880", alias="LIVEKIT_URL")

    # LLM Configuration - Ollama by default, can swap to Anthropic
    llm_provider: str = Field(default="ollama", alias="LLM_PROVIDER")  # "ollama" or "anthropic"
    ollama_host: str = Field(default="http://localhost:11434", alias="OLLAMA_HOST")
    ollama_model: str = Field(default="llama3.2", alias="OLLAMA_MODEL")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-sonnet-4-20250514", alias="ANTHROPIC_MODEL")

    # STT Configuration - Local Whisper by default
    stt_provider: str = Field(default="whisper", alias="STT_PROVIDER")  # "whisper" only for now
    whisper_model: str = Field(default="large-v3-turbo", alias="WHISPER_MODEL")
    whisper_device: str = Field(default="auto", alias="WHISPER_DEVICE")  # auto, cpu, cuda, mps
    whisper_compute_type: str = Field(default="auto", alias="WHISPER_COMPUTE_TYPE")
    whisper_language: str = Field(default="en", alias="WHISPER_LANGUAGE")

    # TTS Configuration - Kokoro via FastAPI
    tts_provider: str = Field(default="kokoro", alias="TTS_PROVIDER")  # "kokoro" or "openai"
    kokoro_url: str = Field(default="http://localhost:8880", alias="KOKORO_URL")
    kokoro_voice: str = Field(default="af_bella", alias="KOKORO_VOICE")
    kokoro_speed: float = Field(default=1.0, alias="KOKORO_SPEED")

    # VAD Configuration
    # activation_threshold: 0.6 recommended for noisy environments (default Silero is 0.5)
    vad_threshold: float = Field(default=0.6, alias="VAD_THRESHOLD")
    vad_min_speech_duration: float = Field(default=0.1, alias="VAD_MIN_SPEECH_DURATION")
    vad_min_silence_duration: float = Field(default=0.5, alias="VAD_MIN_SILENCE_DURATION")

    # OpenMemory MCP
    openmemory_url: str | None = Field(default=None, alias="OPENMEMORY_URL")

    # Wake Word Detection - openWakeWord for "Hey Jarvis"
    wake_word_enabled: bool = Field(default=True, alias="WAKE_WORD_ENABLED")
    wake_word_model: str = Field(default="hey_jarvis_v0.1", alias="WAKE_WORD_MODEL")
    wake_word_threshold: float = Field(default=0.5, alias="WAKE_WORD_THRESHOLD")
    wake_word_cooldown: float = Field(default=2.0, alias="WAKE_WORD_COOLDOWN")
    wake_word_timeout: float = Field(default=10.0, alias="WAKE_WORD_TIMEOUT")

    # Model download directory (defaults to ~/.cache/alexa-os for local dev)
    model_cache_dir: str = Field(
        default=os.path.expanduser("~/.cache/alexa-os/models"),
        alias="MODEL_CACHE_DIR"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Global settings instance
settings = Settings()
