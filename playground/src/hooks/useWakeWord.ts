import { useCallback, useEffect, useState } from "react";
import { Room, RoomEvent, DataPacket_Kind } from "livekit-client";

export type WakeWordState = "disabled" | "listening" | "detected" | "active" | "timeout";

export interface WakeWordStatus {
  enabled: boolean;
  state: WakeWordState;
  model: string | null;
  lastDetectionConfidence: number;
}

/**
 * Hook for receiving wake word detection state from the agent.
 *
 * Listens for wake_word data channel messages and provides current state.
 *
 * @param room - LiveKit room instance (null if not connected)
 * @param agentIdentity - The identity of the agent participant
 * @returns Current wake word status
 */
export function useWakeWord(
  room: Room | null,
  agentIdentity: string | null
): WakeWordStatus {
  const [status, setStatus] = useState<WakeWordStatus>({
    enabled: false,
    state: "disabled",
    model: null,
    lastDetectionConfidence: 0,
  });

  // Handle incoming data channel messages
  const handleDataReceived = useCallback(
    (
      payload: Uint8Array,
      participant?: any,
      kind?: DataPacket_Kind,
      topic?: string
    ) => {
      // Only process wake_word topic messages from the agent
      if (topic !== "wake_word") return;
      if (agentIdentity && participant?.identity !== agentIdentity) return;

      try {
        const message = JSON.parse(new TextDecoder().decode(payload));

        if (message.type === "wake_word_state") {
          setStatus((prev) => ({
            ...prev,
            enabled: true,
            state: message.state as WakeWordState,
            model: message.model || prev.model,
            lastDetectionConfidence:
              message.confidence || prev.lastDetectionConfidence,
          }));
        }
      } catch (error) {
        console.error("Failed to parse wake word message:", error);
      }
    },
    [agentIdentity]
  );

  // Subscribe to room data events
  useEffect(() => {
    if (!room) {
      setStatus({
        enabled: false,
        state: "disabled",
        model: null,
        lastDetectionConfidence: 0,
      });
      return;
    }

    room.on(RoomEvent.DataReceived, handleDataReceived);

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, handleDataReceived]);

  return status;
}

/**
 * Get display text for wake word state
 */
export function getWakeWordStateText(state: WakeWordState): string {
  switch (state) {
    case "disabled":
      return "Wake word disabled";
    case "listening":
      return 'Say "Hey Jarvis"';
    case "detected":
      return "Wake word detected!";
    case "active":
      return "Listening...";
    case "timeout":
      return "Session ended";
    default:
      return "";
  }
}

/**
 * Get CSS class for wake word state indicator
 */
export function getWakeWordStateClass(state: WakeWordState): string {
  switch (state) {
    case "disabled":
      return "bg-gray-500";
    case "listening":
      return "bg-yellow-500 animate-pulse";
    case "detected":
      return "bg-green-500 animate-ping";
    case "active":
      return "bg-green-500";
    case "timeout":
      return "bg-orange-500";
    default:
      return "bg-gray-500";
  }
}
