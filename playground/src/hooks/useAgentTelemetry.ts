import { useDataChannel } from "@livekit/components-react";
import { ReceivedDataMessage } from "@livekit/components-core";
import { useCallback, useEffect, useRef, useState } from "react";

// Constants
const TELEMETRY_TOPIC = "agent_telemetry";
const MAX_EVENTS = 100;

// Telemetry event types
export type TelemetryEventType =
  | "llm_request_start"
  | "llm_chunk"
  | "llm_request_end"
  | "tool_call_start"
  | "tool_call_end"
  | "agent_state_change"
  | "error";

// Base telemetry event structure
export interface TelemetryEvent {
  type: TelemetryEventType;
  timestamp: string;
  data: Record<string, unknown>;
  request_id?: string;
}

// LLM request tracking
export interface LLMRequest {
  id: string;
  model: string;
  startTime: string;
  endTime?: string;
  chunks: string[];
  fullResponse: string;
  status: "pending" | "streaming" | "complete" | "error";
}

// Tool call tracking
export interface ToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  startTime: string;
  endTime?: string;
  result?: string;
  error?: string;
  status: "pending" | "running" | "complete" | "error";
}

// Hook return type
export interface AgentTelemetryState {
  events: TelemetryEvent[];
  llmRequests: Map<string, LLMRequest>;
  toolCalls: Map<string, ToolCall>;
  isStreaming: boolean;
  clearEvents: () => void;
}

/**
 * Parse JSON payload from Uint8Array
 */
const parsePayload = (payload: Uint8Array): TelemetryEvent | null => {
  try {
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(payload);
    const parsed = JSON.parse(jsonString) as TelemetryEvent;
    return parsed;
  } catch (error) {
    console.error("[useAgentTelemetry] Failed to parse payload:", error);
    return null;
  }
};

/**
 * Hook for tracking agent telemetry events via LiveKit data channel.
 * Uses useDataChannel hook for cleaner code, automatic cleanup, and better type safety.
 *
 * NOTE: This hook must be used within a LiveKit room context (SessionProvider or RoomContext.Provider).
 *
 * @returns Agent telemetry state and controls
 */
export const useAgentTelemetry = (): AgentTelemetryState => {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [llmRequests, setLlmRequests] = useState<Map<string, LLMRequest>>(
    () => new Map()
  );
  const [toolCalls, setToolCalls] = useState<Map<string, ToolCall>>(
    () => new Map()
  );
  const [isStreaming, setIsStreaming] = useState(false);

  // Use refs to track streaming state for updates within closures
  const llmRequestsRef = useRef<Map<string, LLMRequest>>(new Map());
  const toolCallsRef = useRef<Map<string, ToolCall>>(new Map());

  // Sync refs with state
  useEffect(() => {
    llmRequestsRef.current = llmRequests;
  }, [llmRequests]);

  useEffect(() => {
    toolCallsRef.current = toolCalls;
  }, [toolCalls]);

  /**
   * Process a telemetry event and update state
   */
  const processEvent = useCallback((event: TelemetryEvent) => {
    // Add event to timeline (limit to MAX_EVENTS)
    setEvents((prev) => {
      const newEvents = [...prev, event];
      if (newEvents.length > MAX_EVENTS) {
        return newEvents.slice(-MAX_EVENTS);
      }
      return newEvents;
    });

    const requestId = event.request_id;

    switch (event.type) {
      case "llm_request_start": {
        if (!requestId) break;
        const { model, message_count } = event.data as {
          model: string;
          message_count: number;
        };

        const newRequest: LLMRequest = {
          id: requestId,
          model: model || "unknown",
          startTime: event.timestamp,
          chunks: [],
          fullResponse: "",
          status: "pending",
        };

        setLlmRequests((prev) => {
          const updated = new Map(prev);
          updated.set(requestId, newRequest);
          return updated;
        });
        setIsStreaming(true);
        break;
      }

      case "llm_chunk": {
        if (!requestId) break;
        const { chunk } = event.data as { chunk: string };

        setLlmRequests((prev) => {
          const updated = new Map(prev);
          const existing = updated.get(requestId);
          if (existing) {
            updated.set(requestId, {
              ...existing,
              chunks: [...existing.chunks, chunk],
              fullResponse: existing.fullResponse + chunk,
              status: "streaming",
            });
          }
          return updated;
        });
        break;
      }

      case "llm_request_end": {
        if (!requestId) break;
        const { total_tokens } = event.data as { total_tokens: number };

        setLlmRequests((prev) => {
          const updated = new Map(prev);
          const existing = updated.get(requestId);
          if (existing) {
            updated.set(requestId, {
              ...existing,
              endTime: event.timestamp,
              status: "complete",
            });
          }
          return updated;
        });
        setIsStreaming(false);
        break;
      }

      case "tool_call_start": {
        if (!requestId) break;
        const { tool_name, arguments: args } = event.data as {
          tool_name: string;
          arguments: Record<string, unknown>;
        };

        const newToolCall: ToolCall = {
          id: requestId,
          toolName: tool_name,
          arguments: args || {},
          startTime: event.timestamp,
          status: "running",
        };

        setToolCalls((prev) => {
          const updated = new Map(prev);
          updated.set(requestId, newToolCall);
          return updated;
        });
        break;
      }

      case "tool_call_end": {
        if (!requestId) break;
        const { result, error } = event.data as {
          result?: string;
          error?: string;
        };

        setToolCalls((prev) => {
          const updated = new Map(prev);
          const existing = updated.get(requestId);
          if (existing) {
            updated.set(requestId, {
              ...existing,
              endTime: event.timestamp,
              result: result,
              error: error,
              status: error ? "error" : "complete",
            });
          }
          return updated;
        });
        break;
      }

      case "agent_state_change": {
        // State changes are recorded in events timeline
        // Could be extended to track current agent state
        break;
      }

      case "error": {
        const { message, details } = event.data as {
          message: string;
          details?: unknown;
        };
        console.error(
          "[useAgentTelemetry] Agent error:",
          message,
          details
        );

        // If there's a request_id, mark the associated request as error
        if (requestId) {
          setLlmRequests((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(requestId);
            if (existing && existing.status !== "complete") {
              updated.set(requestId, {
                ...existing,
                endTime: event.timestamp,
                status: "error",
              });
            }
            return updated;
          });
          setIsStreaming(false);
        }
        break;
      }

      default:
        console.warn(
          "[useAgentTelemetry] Unknown event type:",
          event.type
        );
    }
  }, []);

  /**
   * Clear all events and reset state
   */
  const clearEvents = useCallback(() => {
    setEvents([]);
    setLlmRequests(new Map());
    setToolCalls(new Map());
    setIsStreaming(false);
  }, []);

  // Handle incoming data channel messages
  const handleMessage = useCallback(
    (msg: ReceivedDataMessage<typeof TELEMETRY_TOPIC>) => {
      const event = parsePayload(msg.payload);
      if (event) {
        processEvent(event);
      }
    },
    [processEvent]
  );

  // Use useDataChannel hook for automatic cleanup and topic filtering
  // The hook handles subscribing/unsubscribing automatically
  useDataChannel(TELEMETRY_TOPIC, handleMessage);

  return {
    events,
    llmRequests,
    toolCalls,
    isStreaming,
    clearEvents,
  };
};

export default useAgentTelemetry;
