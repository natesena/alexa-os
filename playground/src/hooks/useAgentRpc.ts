"use client";

import { useCallback, useState } from "react";
import type { Room } from "livekit-client";

// Response types for each RPC method
export interface ModelInfo {
  name: string;
  size: number;
  modified_at: string;
}

export interface ListModelsResponse {
  success: boolean;
  models?: ModelInfo[];
  current_model?: string;
  error?: string;
}

export interface SwitchModelResponse {
  success: boolean;
  old_model?: string;
  new_model?: string;
  error?: string;
}

export interface InterruptResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  server: string;
}

export interface ListToolsResponse {
  success: boolean;
  tools?: ToolInfo[];
  count?: number;
  error?: string;
}

export interface VadSettings {
  activation_threshold: number;
  min_speech_duration: number;
  min_silence_duration: number;
}

export interface AgentStateResponse {
  success: boolean;
  llm_model?: string;
  stt_model?: string;
  tts_provider?: string;
  vad_settings?: VadSettings;
  mcp_servers_count?: number;
  error?: string;
}

export interface UseAgentRpcReturn {
  // State
  isLoading: boolean;
  error: string | null;

  // RPC methods
  listModels: () => Promise<ListModelsResponse>;
  switchModel: (model: string) => Promise<SwitchModelResponse>;
  interrupt: () => Promise<InterruptResponse>;
  listTools: () => Promise<ListToolsResponse>;
  getAgentState: () => Promise<AgentStateResponse>;

  // Utility
  clearError: () => void;
}

/**
 * Hook for making RPC calls to control the agent
 *
 * @param room - The LiveKit Room instance
 * @param agentIdentity - The identity of the agent participant to send RPC calls to
 * @returns Object containing RPC methods and state
 */
export function useAgentRpc(
  room: Room | null,
  agentIdentity: string | null
): UseAgentRpcReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generic RPC call handler that manages loading state, error handling, and JSON parsing
   */
  const performRpcCall = useCallback(
    async <T extends { success: boolean; error?: string }>(
      method: string,
      payload?: Record<string, unknown>
    ): Promise<T> => {
      if (!room) {
        throw new Error("Room is not available");
      }
      if (!agentIdentity) {
        throw new Error("Agent identity is not available");
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await room.localParticipant.performRpc({
          destinationIdentity: agentIdentity,
          method,
          payload: payload ? JSON.stringify(payload) : "",
        });

        const result = JSON.parse(response) as T;

        // Check for success: false and extract error message
        if (!result.success) {
          const errorMessage = result.error || `RPC call '${method}' failed`;
          setError(errorMessage);
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : `RPC call '${method}' failed`;
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [room, agentIdentity]
  );

  /**
   * List available models from the agent
   * Returns the list of models and the currently active model
   */
  const listModels = useCallback(async (): Promise<ListModelsResponse> => {
    return performRpcCall<ListModelsResponse>("list_models");
  }, [performRpcCall]);

  /**
   * Switch the agent to use a different model
   * @param model - The name of the model to switch to
   */
  const switchModel = useCallback(
    async (model: string): Promise<SwitchModelResponse> => {
      return performRpcCall<SwitchModelResponse>("switch_model", { model });
    },
    [performRpcCall]
  );

  /**
   * Interrupt the agent's current operation
   */
  const interrupt = useCallback(async (): Promise<InterruptResponse> => {
    return performRpcCall<InterruptResponse>("interrupt");
  }, [performRpcCall]);

  /**
   * List available tools from the agent's MCP servers
   * Returns tool information including name, description, and source server
   */
  const listTools = useCallback(async (): Promise<ListToolsResponse> => {
    return performRpcCall<ListToolsResponse>("list_tools");
  }, [performRpcCall]);

  /**
   * Get the current state of the agent
   * Returns the current model and MCP server count
   */
  const getAgentState = useCallback(async (): Promise<AgentStateResponse> => {
    return performRpcCall<AgentStateResponse>("get_agent_state");
  }, [performRpcCall]);

  /**
   * Clear the current error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    listModels,
    switchModel,
    interrupt,
    listTools,
    getAgentState,
    clearError,
  };
}

export default useAgentRpc;
