"""Wake Word Detection using openWakeWord.

This module provides "Hey Jarvis" wake word detection for activating
the voice assistant without pressing any buttons.

openWakeWord runs locally with pre-trained models and supports:
- Real-time audio streaming detection
- Multiple simultaneous wake word models
- Low latency (80ms frame processing)
"""

import logging
import asyncio
import numpy as np
from typing import Callable, Optional, Awaitable
from pathlib import Path

logger = logging.getLogger("alexa-os.wakeword")

# Model constants
SAMPLE_RATE = 16000  # 16kHz audio required
FRAME_SIZE = 1280  # 80ms at 16kHz (optimal for openWakeWord)
DEFAULT_THRESHOLD = 0.5  # Detection confidence threshold


class WakeWordDetector:
    """
    Wake word detector using openWakeWord.

    Detects "Hey Jarvis" wake word from audio streams and triggers
    callbacks when detected.

    Usage:
        detector = WakeWordDetector(
            model_names=["hey_jarvis"],
            on_wake_word=handle_wake_word,
            threshold=0.5
        )
        await detector.start()

        # Feed audio frames
        detector.process_audio(audio_frame)

        # Stop when done
        await detector.stop()
    """

    def __init__(
        self,
        model_names: list[str] | None = None,
        on_wake_word: Optional[Callable[[str, float], Awaitable[None]]] = None,
        threshold: float = DEFAULT_THRESHOLD,
        model_path: Optional[str] = None,
        cooldown_seconds: float = 2.0,
    ):
        """
        Initialize the wake word detector.

        Args:
            model_names: List of wake word model names to load.
                        Defaults to ["hey_jarvis_v0.1"] for built-in model.
            on_wake_word: Async callback when wake word detected.
                         Called with (model_name, confidence).
            threshold: Detection confidence threshold (0.0 to 1.0).
            model_path: Optional custom model path directory.
            cooldown_seconds: Minimum seconds between detections.
        """
        self._model_names = model_names or ["hey_jarvis_v0.1"]
        self._on_wake_word = on_wake_word
        self._threshold = threshold
        self._model_path = model_path
        self._cooldown_seconds = cooldown_seconds

        self._model = None
        self._running = False
        self._last_detection_time = 0.0
        self._audio_buffer = bytearray()

        logger.info(
            f"WakeWordDetector initialized: models={self._model_names}, "
            f"threshold={threshold}, cooldown={cooldown_seconds}s"
        )

    async def start(self) -> None:
        """Load the wake word model and start detection."""
        if self._running:
            logger.warning("WakeWordDetector already running")
            return

        try:
            # Import openwakeword (lazy import to avoid startup cost)
            import openwakeword
            from openwakeword.model import Model

            # Download models if not present
            logger.info("Checking/downloading openWakeWord models...")
            openwakeword.utils.download_models()

            # Load the model
            logger.info(f"Loading wake word models: {self._model_names}")
            self._model = Model(
                wakeword_models=self._model_names,
                inference_framework="onnx",  # Use ONNX for cross-platform
            )

            self._running = True
            logger.info("WakeWordDetector started successfully")

        except ImportError as e:
            logger.error(f"Failed to import openwakeword: {e}")
            logger.error("Install with: pip install openwakeword")
            raise
        except Exception as e:
            logger.error(f"Failed to load wake word model: {e}")
            raise

    async def stop(self) -> None:
        """Stop detection and clean up resources."""
        self._running = False
        self._model = None
        self._audio_buffer.clear()
        logger.info("WakeWordDetector stopped")

    def process_audio(self, audio_data: bytes | np.ndarray) -> Optional[tuple[str, float]]:
        """
        Process an audio frame for wake word detection.

        Audio should be 16-bit PCM at 16kHz sample rate.
        Frames are buffered internally to process in 80ms chunks.

        Args:
            audio_data: Audio bytes or numpy array (int16 or float32)

        Returns:
            Tuple of (model_name, confidence) if wake word detected,
            None otherwise.
        """
        if not self._running or self._model is None:
            return None

        # Convert to bytes if numpy array
        if isinstance(audio_data, np.ndarray):
            if audio_data.dtype == np.float32:
                # Convert float32 [-1.0, 1.0] to int16
                audio_data = (audio_data * 32767).astype(np.int16)
            audio_data = audio_data.tobytes()

        # Buffer audio
        self._audio_buffer.extend(audio_data)

        # Process when we have enough data (80ms frame = 1280 samples = 2560 bytes)
        frame_bytes = FRAME_SIZE * 2  # 2 bytes per int16 sample

        detection_result = None

        while len(self._audio_buffer) >= frame_bytes:
            # Extract frame
            frame = bytes(self._audio_buffer[:frame_bytes])
            self._audio_buffer = self._audio_buffer[frame_bytes:]

            # Convert to numpy for openWakeWord
            audio_array = np.frombuffer(frame, dtype=np.int16)

            # Run prediction
            predictions = self._model.predict(audio_array)

            # Check each model's prediction
            import time
            current_time = time.time()

            for model_name, confidence in predictions.items():
                if confidence >= self._threshold:
                    # Check cooldown
                    if current_time - self._last_detection_time >= self._cooldown_seconds:
                        self._last_detection_time = current_time
                        logger.info(
                            f"Wake word detected: {model_name} "
                            f"(confidence: {confidence:.2f})"
                        )
                        detection_result = (model_name, confidence)

                        # Trigger callback asynchronously
                        if self._on_wake_word:
                            asyncio.create_task(
                                self._on_wake_word(model_name, confidence)
                            )

        return detection_result

    def reset(self) -> None:
        """Reset the detector state (clear buffers, reset model state)."""
        self._audio_buffer.clear()
        if self._model is not None:
            self._model.reset()
        logger.debug("WakeWordDetector reset")

    @property
    def is_running(self) -> bool:
        """Check if the detector is currently running."""
        return self._running

    @property
    def threshold(self) -> float:
        """Get the current detection threshold."""
        return self._threshold

    @threshold.setter
    def threshold(self, value: float) -> None:
        """Set the detection threshold."""
        self._threshold = max(0.0, min(1.0, value))
        logger.info(f"Wake word threshold set to: {self._threshold}")


class WakeWordGatedSession:
    """
    Manages wake word gated voice sessions.

    This class coordinates the flow between:
    1. Listening mode: Wake word detection active, STT/LLM inactive
    2. Active mode: Wake word detection paused, STT/LLM active
    3. Timeout: Return to listening mode after inactivity

    Usage with LiveKit agents:
        gated_session = WakeWordGatedSession(
            detector=detector,
            timeout_seconds=10.0,
            on_activate=start_agent_session,
            on_deactivate=pause_agent_session,
        )
    """

    def __init__(
        self,
        detector: WakeWordDetector,
        timeout_seconds: float = 10.0,
        on_activate: Optional[Callable[[], Awaitable[None]]] = None,
        on_deactivate: Optional[Callable[[], Awaitable[None]]] = None,
    ):
        """
        Initialize the gated session manager.

        Args:
            detector: WakeWordDetector instance
            timeout_seconds: Seconds of inactivity before returning to listening
            on_activate: Called when wake word detected (start conversation)
            on_deactivate: Called when session times out (return to listening)
        """
        self._detector = detector
        self._timeout_seconds = timeout_seconds
        self._on_activate = on_activate
        self._on_deactivate = on_deactivate

        self._is_active = False
        self._last_activity_time = 0.0
        self._timeout_task: Optional[asyncio.Task] = None

        logger.info(
            f"WakeWordGatedSession initialized: timeout={timeout_seconds}s"
        )

    async def start(self) -> None:
        """Start the gated session in listening mode."""
        # Set up wake word callback
        original_callback = self._detector._on_wake_word

        async def wake_word_handler(model_name: str, confidence: float):
            await self._handle_wake_word(model_name, confidence)
            if original_callback:
                await original_callback(model_name, confidence)

        self._detector._on_wake_word = wake_word_handler
        await self._detector.start()

        logger.info("WakeWordGatedSession started in listening mode")

    async def stop(self) -> None:
        """Stop the gated session."""
        if self._timeout_task:
            self._timeout_task.cancel()
        await self._detector.stop()
        logger.info("WakeWordGatedSession stopped")

    async def _handle_wake_word(self, model_name: str, confidence: float) -> None:
        """Handle wake word detection."""
        if self._is_active:
            # Already active, just refresh timeout
            self.refresh_activity()
            return

        logger.info(f"Activating session: wake word '{model_name}' detected")
        self._is_active = True
        self.refresh_activity()

        # Start timeout monitoring
        self._timeout_task = asyncio.create_task(self._monitor_timeout())

        # Trigger activation callback
        if self._on_activate:
            await self._on_activate()

    async def _monitor_timeout(self) -> None:
        """Monitor for session timeout."""
        import time

        while self._is_active:
            await asyncio.sleep(1.0)

            elapsed = time.time() - self._last_activity_time
            if elapsed >= self._timeout_seconds:
                await self._deactivate()
                break

    async def _deactivate(self) -> None:
        """Deactivate the session and return to listening mode."""
        if not self._is_active:
            return

        logger.info("Session timed out, returning to listening mode")
        self._is_active = False

        # Reset detector for clean wake word detection
        self._detector.reset()

        # Trigger deactivation callback
        if self._on_deactivate:
            await self._on_deactivate()

    def refresh_activity(self) -> None:
        """Refresh the activity timer (call on user/agent speech)."""
        import time
        self._last_activity_time = time.time()

    @property
    def is_active(self) -> bool:
        """Check if the session is currently active."""
        return self._is_active
