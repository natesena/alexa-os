"""Local Whisper STT implementation using faster-whisper."""

import logging
import numpy as np
from typing import Optional
from faster_whisper import WhisperModel

from livekit.agents.stt import (
    STT,
    SpeechEvent,
    SpeechEventType,
    SpeechData,
    STTCapabilities,
)
from livekit.agents.utils import AudioBuffer
from livekit.agents import APIConnectOptions

logger = logging.getLogger("alexa-os.stt")


class FasterWhisperSTT(STT):
    """
    Local Speech-to-Text using faster-whisper (CTranslate2-based Whisper).

    This is a non-streaming STT - use with StreamAdapter + VAD for real-time use.

    Models available:
    - tiny, tiny.en (39M params)
    - base, base.en (74M params)
    - small, small.en (244M params)
    - medium, medium.en (769M params)
    - large-v2, large-v3 (1550M params)
    - distil-large-v3 (756M params, faster)

    For Apple Silicon, use compute_type="auto" to leverage Metal acceleration.
    """

    def __init__(
        self,
        model: str = "base.en",
        device: str = "auto",
        compute_type: str = "auto",
        language: str = "en",
        download_root: Optional[str] = None,
    ):
        """
        Initialize the Whisper STT.

        Args:
            model: Whisper model size (tiny, base, small, medium, large-v3, etc.)
            device: Device to use ("auto", "cpu", "cuda", "mps")
            compute_type: Quantization ("auto", "int8", "float16", "float32")
            language: Target language code
            download_root: Directory to store downloaded models
        """
        super().__init__(
            capabilities=STTCapabilities(
                streaming=False,  # Whisper doesn't support native streaming
                interim_results=False,
            )
        )

        self._model_name = model
        self._device = device
        self._compute_type = compute_type
        self._language = language
        self._download_root = download_root
        self._model: Optional[WhisperModel] = None

        logger.info(f"Initializing FasterWhisperSTT with model: {model}")

    def _ensure_model_loaded(self) -> WhisperModel:
        """Lazy load the model on first use."""
        if self._model is None:
            logger.info(f"Loading Whisper model: {self._model_name} (device={self._device})")
            self._model = WhisperModel(
                self._model_name,
                device=self._device,
                compute_type=self._compute_type,
                download_root=self._download_root,
            )
            logger.info(f"Whisper model loaded successfully")
        return self._model

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: str | None = None,
        conn_options: APIConnectOptions,
    ) -> SpeechEvent:
        """
        Transcribe audio buffer using Whisper.

        Args:
            buffer: Audio buffer containing PCM audio data
            language: Optional language override
            conn_options: Connection options (unused for local inference)

        Returns:
            SpeechEvent containing transcription results
        """
        model = self._ensure_model_loaded()
        lang = language or self._language

        # Convert audio buffer to numpy array
        # AudioBuffer provides audio as int16 PCM at 16kHz
        audio_data = buffer.data
        if isinstance(audio_data, bytes):
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        else:
            audio_array = np.array(audio_data, dtype=np.float32)
            if audio_array.max() > 1.0:
                audio_array = audio_array / 32768.0

        # Run transcription
        segments, info = model.transcribe(
            audio_array,
            language=lang,
            beam_size=5,
            vad_filter=True,  # Use Silero VAD for better segmentation
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200,
            ),
        )

        # Collect all segments into final transcript
        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text.strip())

        transcript = " ".join(transcript_parts).strip()

        logger.debug(f"Transcribed: '{transcript}' (language: {info.language}, prob: {info.language_probability:.2f})")

        # Return final transcript event
        return SpeechEvent(
            type=SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[
                SpeechData(
                    text=transcript,
                    language=info.language,
                    confidence=info.language_probability,
                )
            ],
        )

    async def aclose(self) -> None:
        """Clean up model resources."""
        if self._model is not None:
            # faster-whisper doesn't have explicit cleanup, but we can dereference
            self._model = None
            logger.info("Whisper model unloaded")
