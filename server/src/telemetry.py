"""Telemetry emitter for agent observability."""

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from livekit.rtc import Room

logger = logging.getLogger("alexa-os")


class TelemetryEventType(str, Enum):
    LLM_REQUEST_START = "llm_request_start"
    LLM_REQUEST_END = "llm_request_end"
    LLM_CHUNK = "llm_chunk"
    TOOL_CALL_START = "tool_call_start"
    TOOL_CALL_END = "tool_call_end"
    STT_RESULT = "stt_result"
    TTS_START = "tts_start"
    TTS_END = "tts_end"
    AGENT_STATE_CHANGE = "agent_state_change"
    ERROR = "error"


@dataclass
class TelemetryEvent:
    type: TelemetryEventType
    timestamp: str
    data: dict
    request_id: Optional[str] = None


class TelemetryEmitter:
    """Emits telemetry events to UI via LiveKit data channel."""

    TOPIC = "agent_telemetry"

    def __init__(self, room: Room):
        self.room = room
        self._enabled = True
        self._request_counter = 0

    def generate_request_id(self) -> str:
        """Generate unique request ID."""
        self._request_counter += 1
        return f"req_{self._request_counter}_{int(datetime.now().timestamp() * 1000)}"

    async def emit(
        self,
        event_type: TelemetryEventType,
        data: dict,
        request_id: Optional[str] = None,
    ):
        """Emit a telemetry event to all participants."""
        if not self._enabled:
            return

        event = TelemetryEvent(
            type=event_type,
            timestamp=datetime.now().isoformat(),
            data=data,
            request_id=request_id,
        )

        try:
            # Convert enum to string for JSON serialization
            event_dict = asdict(event)
            event_dict["type"] = event_type.value
            payload = json.dumps(event_dict).encode("utf-8")

            await self.room.local_participant.publish_data(
                payload=payload,
                reliable=False,  # Use unreliable for high-frequency telemetry
                topic=self.TOPIC,
            )
        except Exception as e:
            logger.warning(f"Failed to emit telemetry: {e}")

    async def llm_request_start(self, model: str, message_count: int) -> str:
        """Emit LLM request start event. Returns request_id."""
        request_id = self.generate_request_id()
        await self.emit(
            TelemetryEventType.LLM_REQUEST_START,
            {"model": model, "message_count": message_count},
            request_id,
        )
        logger.debug(f"LLM request started: {request_id}")
        return request_id

    async def llm_chunk(self, request_id: str, chunk: str):
        """Emit LLM response chunk."""
        await self.emit(
            TelemetryEventType.LLM_CHUNK,
            {"chunk": chunk},
            request_id,
        )

    async def llm_request_end(
        self, request_id: str, total_tokens: Optional[int] = None
    ):
        """Emit LLM request end event."""
        await self.emit(
            TelemetryEventType.LLM_REQUEST_END,
            {"total_tokens": total_tokens},
            request_id,
        )
        logger.debug(f"LLM request ended: {request_id}")

    async def tool_call_start(self, tool_name: str, arguments: dict) -> str:
        """Emit tool call start event. Returns request_id."""
        request_id = self.generate_request_id()
        await self.emit(
            TelemetryEventType.TOOL_CALL_START,
            {"tool_name": tool_name, "arguments": arguments},
            request_id,
        )
        logger.debug(f"Tool call started: {tool_name} ({request_id})")
        return request_id

    async def tool_call_end(
        self, request_id: str, result: Any, error: Optional[str] = None
    ):
        """Emit tool call end event."""
        await self.emit(
            TelemetryEventType.TOOL_CALL_END,
            {"result": str(result)[:1000], "error": error},
            request_id,
        )
        logger.debug(f"Tool call ended: {request_id}")

    async def stt_result(self, text: str, is_final: bool):
        """Emit STT result event."""
        await self.emit(
            TelemetryEventType.STT_RESULT,
            {"text": text, "is_final": is_final},
        )

    async def tts_start(self, text: str):
        """Emit TTS start event."""
        request_id = self.generate_request_id()
        await self.emit(
            TelemetryEventType.TTS_START,
            {"text": text[:200]},  # Truncate for telemetry
            request_id,
        )
        return request_id

    async def tts_end(self, request_id: str):
        """Emit TTS end event."""
        await self.emit(
            TelemetryEventType.TTS_END,
            {},
            request_id,
        )

    async def agent_state_change(self, new_state: str):
        """Emit agent state change event."""
        await self.emit(
            TelemetryEventType.AGENT_STATE_CHANGE,
            {"state": new_state},
        )
        logger.debug(f"Agent state changed: {new_state}")

    async def error(self, message: str, details: Optional[dict] = None):
        """Emit error event."""
        await self.emit(
            TelemetryEventType.ERROR,
            {"message": message, "details": details or {}},
        )
        logger.error(f"Telemetry error: {message}")

    def enable(self):
        """Enable telemetry emission."""
        self._enabled = True
        logger.info("Telemetry enabled")

    def disable(self):
        """Disable telemetry emission."""
        self._enabled = False
        logger.info("Telemetry disabled")
