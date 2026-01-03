"use client";

import { useCallback, useState } from "react";
import type { Room } from "livekit-client";

// Types for MCP management
export interface MCPServerInfo {
  name: string;
  url: string;
  enabled: boolean;
  allowed_tools: string[] | null;
  status: "connected" | "error" | "disabled" | "unknown";
  error?: string | null;
  tool_count: number;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  enabled: boolean;
}

export interface ListMCPServersResponse {
  success: boolean;
  servers?: MCPServerInfo[];
  error?: string;
}

export interface AddMCPServerResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface RemoveMCPServerResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ToggleMCPServerResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ListMCPToolsResponse {
  success: boolean;
  server?: string;
  tools?: MCPToolInfo[];
  count?: number;
  error?: string;
}

export interface ToggleMCPToolResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface UseMCPManagementReturn {
  // State
  isLoading: boolean;
  error: string | null;

  // RPC methods
  listMCPServers: () => Promise<ListMCPServersResponse>;
  addMCPServer: (name: string, url: string, headers?: Record<string, string>, enabled?: boolean) => Promise<AddMCPServerResponse>;
  removeMCPServer: (name: string) => Promise<RemoveMCPServerResponse>;
  toggleMCPServer: (name: string, enabled?: boolean) => Promise<ToggleMCPServerResponse>;
  listMCPTools: (serverName: string) => Promise<ListMCPToolsResponse>;
  toggleMCPTool: (serverName: string, toolName: string, enabled: boolean) => Promise<ToggleMCPToolResponse>;

  // Utility
  clearError: () => void;
}

/**
 * Hook for managing MCP servers via RPC
 */
export function useMCPManagement(
  room: Room | null,
  agentIdentity: string | null
): UseMCPManagementReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generic RPC call handler
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
   * List all configured MCP servers
   */
  const listMCPServers = useCallback(async (): Promise<ListMCPServersResponse> => {
    return performRpcCall<ListMCPServersResponse>("list_mcp_servers");
  }, [performRpcCall]);

  /**
   * Add a new MCP server
   */
  const addMCPServer = useCallback(
    async (name: string, url: string, headers?: Record<string, string>, enabled: boolean = true): Promise<AddMCPServerResponse> => {
      return performRpcCall<AddMCPServerResponse>("add_mcp_server", { name, url, headers, enabled });
    },
    [performRpcCall]
  );

  /**
   * Remove an MCP server
   */
  const removeMCPServer = useCallback(
    async (name: string): Promise<RemoveMCPServerResponse> => {
      return performRpcCall<RemoveMCPServerResponse>("remove_mcp_server", { name });
    },
    [performRpcCall]
  );

  /**
   * Toggle an MCP server on/off
   */
  const toggleMCPServer = useCallback(
    async (name: string, enabled?: boolean): Promise<ToggleMCPServerResponse> => {
      return performRpcCall<ToggleMCPServerResponse>("toggle_mcp_server", { name, enabled });
    },
    [performRpcCall]
  );

  /**
   * List tools for a specific MCP server
   */
  const listMCPTools = useCallback(
    async (serverName: string): Promise<ListMCPToolsResponse> => {
      return performRpcCall<ListMCPToolsResponse>("list_mcp_tools", { name: serverName });
    },
    [performRpcCall]
  );

  /**
   * Toggle a specific tool on/off
   */
  const toggleMCPTool = useCallback(
    async (serverName: string, toolName: string, enabled: boolean): Promise<ToggleMCPToolResponse> => {
      return performRpcCall<ToggleMCPToolResponse>("toggle_mcp_tool", {
        server: serverName,
        tool: toolName,
        enabled,
      });
    },
    [performRpcCall]
  );

  /**
   * Clear the current error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    listMCPServers,
    addMCPServer,
    removeMCPServer,
    toggleMCPServer,
    listMCPTools,
    toggleMCPTool,
    clearError,
  };
}

export default useMCPManagement;
