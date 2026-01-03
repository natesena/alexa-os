import { useDataChannel } from "@livekit/components-react";
import { ReceivedDataMessage } from "@livekit/components-core";
import { useCallback, useState } from "react";

// Constants
const TELEMETRY_TOPIC = "agent_telemetry";

/**
 * Pipeline states representing the voice agent's current activity.
 * These states provide UX feedback about what's happening in the pipeline.
 */
export type PipelineState =
  | "idle"
  | "listening"
  | "user_speaking"
  | "transcribing"
  | "thinking"
  | "generating"
  | "speaking"
  | "user_away"
  | "initializing";

/**
 * User-friendly labels for each pipeline state.
 */
const STATE_LABELS: Record<PipelineState, string> = {
  idle: "Ready",
  listening: "Listening...",
  user_speaking: "Listening...",
  transcribing: "Transcribing...",
  thinking: "Thinking...",
  generating: "Generating response...",
  speaking: "Speaking...",
  user_away: "Waiting...",
  initializing: "Starting up...",
};

/**
 * States that indicate active processing.
 */
const PROCESSING_STATES = new Set<PipelineState>([
  "transcribing",
  "thinking",
  "generating",
]);

// Telemetry event structure for agent state changes
interface AgentStateChangeEvent {
  type: "agent_state_change";
  timestamp: string;
  data: {
    state: string;
  };
  request_id?: string;
}

// Hook return type
export interface VoicePipelineState {
  /** Current pipeline state */
  pipelineState: PipelineState;
  /** User-friendly label for current state */
  stateLabel: string;
  /** Whether the agent is actively processing (transcribing, thinking, generating) */
  isProcessing: boolean;
  /** Whether the agent is currently speaking */
  isSpeaking: boolean;
  /** Whether the agent is thinking */
  isThinking: boolean;
  /** Whether the user is speaking */
  isUserSpeaking: boolean;
}

/**
 * Parse telemetry payload from Uint8Array
 */
const parsePayload = (payload: Uint8Array): AgentStateChangeEvent | null => {
  try {
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(payload);
    const parsed = JSON.parse(jsonString);

    // Only process agent_state_change events
    if (parsed.type !== "agent_state_change") {
      return null;
    }

    return parsed as AgentStateChangeEvent;
  } catch (error) {
    console.error("[useVoicePipeline] Failed to parse payload:", error);
    return null;
  }
};

/**
 * Map raw state string to PipelineState type
 */
const mapState = (rawState: string): PipelineState => {
  // Handle known states
  const stateMap: Record<string, PipelineState> = {
    idle: "idle",
    listening: "listening",
    user_speaking: "user_speaking",
    user_stopped_speaking: "listening",
    transcribing: "transcribing",
    thinking: "thinking",
    generating: "generating",
    speaking: "speaking",
    user_away: "user_away",
    initializing: "initializing",
  };

  return stateMap[rawState] || "idle";
};

/**
 * Hook for tracking voice pipeline state via LiveKit telemetry data channel.
 * Uses useDataChannel hook for cleaner code, automatic cleanup, and better type safety.
 *
 * NOTE: This hook must be used within a LiveKit room context (SessionProvider or RoomContext.Provider).
 *
 * @returns Voice pipeline state and derived values
 *
 * @example
 * ```tsx
 * const { pipelineState, stateLabel, isProcessing, isThinking } = useVoicePipeline();
 *
 * if (isThinking) {
 *   return <ThinkingIndicator label={stateLabel} />;
 * }
 * ```
 */
export const useVoicePipeline = (): VoicePipelineState => {
  const [pipelineState, setPipelineState] = useState<PipelineState>("idle");

  // Handle incoming data channel messages
  const handleMessage = useCallback(
    (msg: ReceivedDataMessage<typeof TELEMETRY_TOPIC>) => {
      const event = parsePayload(msg.payload);
      if (event && event.data?.state) {
        const newState = mapState(event.data.state);
        setPipelineState(newState);
      }
    },
    []
  );

  // Use useDataChannel hook for automatic cleanup and topic filtering
  // The hook handles subscribing/unsubscribing automatically
  useDataChannel(TELEMETRY_TOPIC, handleMessage);

  // Derived values
  const stateLabel = STATE_LABELS[pipelineState];
  const isProcessing = PROCESSING_STATES.has(pipelineState);
  const isSpeaking = pipelineState === "speaking";
  const isThinking = pipelineState === "thinking";
  const isUserSpeaking = pipelineState === "user_speaking";

  return {
    pipelineState,
    stateLabel,
    isProcessing,
    isSpeaking,
    isThinking,
    isUserSpeaking,
  };
};

export default useVoicePipeline;
