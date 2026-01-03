"use client";

import { useState, useCallback, useEffect } from "react";
import type { Room } from "livekit-client";
import { ConfigurationPanelItem } from "@/components/config/ConfigurationPanelItem";
import { Button } from "@/components/button/Button";
import { LoadingSVG } from "@/components/button/LoadingSVG";
import {
  useMCPManagement,
  MCPServerInfo,
  MCPToolInfo,
} from "@/hooks/useMCPManagement";
import { ToolBadge } from "@/components/mcp/ToolBadge";

interface MCPPanelProps {
  room: Room | null;
  agentIdentity: string | null;
  themeColor: string;
}

// Status indicator component
function StatusIndicator({
  status,
}: {
  status: "connected" | "error" | "disabled" | "unknown";
}) {
  const colors = {
    connected: "bg-green-500",
    error: "bg-red-500",
    disabled: "bg-gray-500",
    unknown: "bg-yellow-500",
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status]}`}
      title={status}
    />
  );
}

// Toggle switch component
function ToggleSwitch({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        enabled ? "bg-blue-600" : "bg-gray-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-4.5" : "translate-x-1"
        }`}
        style={{ transform: enabled ? "translateX(18px)" : "translateX(4px)" }}
      />
    </button>
  );
}

// Server tools list component
function ServerToolsList({
  serverName,
  room,
  agentIdentity,
  themeColor,
}: {
  serverName: string;
  room: Room | null;
  agentIdentity: string | null;
  themeColor: string;
}) {
  const [tools, setTools] = useState<MCPToolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const { listMCPTools, toggleMCPTool } = useMCPManagement(room, agentIdentity);

  const fetchTools = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await listMCPTools(serverName);
      if (response.success && response.tools) {
        setTools(response.tools);
      }
    } catch (err) {
      console.error("Failed to fetch tools:", err);
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, [serverName, listMCPTools]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const handleToolToggle = async (toolName: string, enabled: boolean) => {
    try {
      await toggleMCPTool(serverName, toolName, enabled);
      // Refresh tools list
      await fetchTools();
    } catch (err) {
      console.error("Failed to toggle tool:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-gray-400">
        <LoadingSVG diameter={12} strokeWidth={2} />
        <span className="text-xs">Loading tools...</span>
      </div>
    );
  }

  if (hasFetched && tools.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-2 px-3">No tools available</div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-2">
      {tools.map((tool) => (
        <ToolBadge
          key={tool.name}
          name={tool.name}
          description={tool.description}
          enabled={tool.enabled}
          onToggle={(enabled) => handleToolToggle(tool.name, enabled)}
        />
      ))}
    </div>
  );
}

// Add server form component
function AddServerForm({
  onAdd,
  onCancel,
  isLoading,
  themeColor,
}: {
  onAdd: (name: string, url: string, headers?: Record<string, string>) => void;
  onCancel: () => void;
  isLoading: boolean;
  themeColor: string;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && url.trim()) {
      const headers = bearerToken.trim()
        ? { Authorization: `Bearer ${bearerToken.trim()}` }
        : undefined;
      onAdd(name.trim(), url.trim(), headers);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-2 bg-gray-800/50 rounded">
      <input
        type="text"
        placeholder="Server name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
        disabled={isLoading}
      />
      <input
        type="url"
        placeholder="http://localhost:8080/mcp"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
        disabled={isLoading}
      />
      <input
        type="password"
        placeholder="Bearer token (optional)"
        value={bearerToken}
        onChange={(e) => setBearerToken(e.target.value)}
        className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded focus:border-blue-500 focus:outline-none"
        disabled={isLoading}
      />
      <div className="flex gap-2">
        <Button
          accentColor={themeColor}
          type="submit"
          disabled={isLoading || !name.trim() || !url.trim()}
          className="flex-1 text-xs"
        >
          {isLoading ? <LoadingSVG diameter={12} strokeWidth={2} /> : "Add"}
        </Button>
        <Button
          accentColor="gray"
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="text-xs"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Main MCP Panel component
export function MCPPanel({ room, agentIdentity, themeColor }: MCPPanelProps) {
  const [servers, setServers] = useState<MCPServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  const {
    listMCPServers,
    addMCPServer,
    removeMCPServer,
    toggleMCPServer,
    isLoading: rpcLoading,
  } = useMCPManagement(room, agentIdentity);

  const fetchServers = useCallback(async () => {
    if (!room || !agentIdentity) {
      setError("Not connected to agent");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await listMCPServers();
      if (response.success && response.servers) {
        setServers(response.servers);
      } else {
        setError(response.error || "Failed to fetch servers");
        setServers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch servers");
      setServers([]);
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, [room, agentIdentity, listMCPServers]);

  // Auto-fetch servers when room and agent become available
  useEffect(() => {
    if (room && agentIdentity && !hasFetched) {
      fetchServers();
    }
  }, [room, agentIdentity, hasFetched, fetchServers]);

  const handleAddServer = async (name: string, url: string, headers?: Record<string, string>) => {
    try {
      const response = await addMCPServer(name, url, headers);
      if (response.success) {
        setShowAddForm(false);
        await fetchServers();
      } else {
        setError(response.error || "Failed to add server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server");
    }
  };

  const handleRemoveServer = async (name: string) => {
    if (!confirm(`Remove MCP server "${name}"?`)) return;

    try {
      const response = await removeMCPServer(name);
      if (response.success) {
        await fetchServers();
      } else {
        setError(response.error || "Failed to remove server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove server");
    }
  };

  const handleToggleServer = async (name: string, enabled: boolean) => {
    try {
      const response = await toggleMCPServer(name, enabled);
      if (response.success) {
        await fetchServers();
      } else {
        setError(response.error || "Failed to toggle server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle server");
    }
  };

  return (
    <ConfigurationPanelItem
      title="MCP Servers"
      collapsible={true}
      defaultCollapsed={true}
    >
      <div className="flex flex-col gap-3">
        {/* Header with refresh and add buttons */}
        <div className="flex items-center justify-between gap-2">
          <Button
            accentColor={themeColor}
            onClick={fetchServers}
            disabled={isLoading || !room || !agentIdentity}
            className="text-xs flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <LoadingSVG diameter={12} strokeWidth={2} />
                Loading...
              </>
            ) : (
              <>
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </>
            )}
          </Button>

          <div className="flex items-center gap-2">
            {hasFetched && !isLoading && (
              <span className="text-xs text-gray-400">
                {servers.length} server{servers.length !== 1 ? "s" : ""}
              </span>
            )}
            <Button
              accentColor="green"
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm || !room || !agentIdentity}
              className="text-xs"
            >
              + Add
            </Button>
          </div>
        </div>

        {/* Add server form */}
        {showAddForm && (
          <AddServerForm
            onAdd={handleAddServer}
            onCancel={() => setShowAddForm(false)}
            isLoading={rpcLoading}
            themeColor={themeColor}
          />
        )}

        {/* Error state */}
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-2 py-1">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-300 hover:text-red-100"
            >
              x
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-4 text-gray-400">
            <LoadingSVG diameter={16} strokeWidth={2} />
            <span className="ml-2 text-xs">Fetching servers...</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && hasFetched && servers.length === 0 && !error && (
          <div className="text-xs text-gray-500 text-center py-4">
            No MCP servers configured. Click "Add" to add one.
          </div>
        )}

        {/* Servers list */}
        {!isLoading && servers.length > 0 && (
          <div className="max-h-96 overflow-y-auto border border-gray-800 rounded">
            <div className="divide-y divide-gray-800">
              {servers.map((server) => (
                <div key={server.name} className="bg-gray-900/50">
                  {/* Server header row */}
                  <div className="flex items-center gap-2 p-2 hover:bg-gray-800/50 transition-colors">
                    {/* Expand/collapse button */}
                    <button
                      onClick={() =>
                        setExpandedServer(
                          expandedServer === server.name ? null : server.name
                        )
                      }
                      className="text-gray-400 hover:text-white"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          expandedServer === server.name ? "rotate-90" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>

                    {/* Status indicator */}
                    <StatusIndicator status={server.status} />

                    {/* Server info */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-mono text-sm truncate"
                        style={{ color: `var(--${themeColor}-400, #60a5fa)` }}
                      >
                        {server.name}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {server.url}
                      </div>
                    </div>

                    {/* Tool count */}
                    <span className="text-xs text-gray-400">
                      {server.tool_count} tools
                    </span>

                    {/* Toggle switch */}
                    <ToggleSwitch
                      enabled={server.enabled}
                      onChange={(enabled) =>
                        handleToggleServer(server.name, enabled)
                      }
                    />

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveServer(server.name)}
                      className="text-red-400 hover:text-red-300 p-1"
                      title="Remove server"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Error message */}
                  {server.error && (
                    <div className="text-xs text-red-400 px-8 pb-2">
                      Error: {server.error}
                    </div>
                  )}

                  {/* Expanded tools section */}
                  {expandedServer === server.name && server.enabled && (
                    <div className="bg-gray-800/30 border-t border-gray-800">
                      <div className="px-2 py-1 text-xs text-gray-400 font-medium">
                        Tools
                      </div>
                      <ServerToolsList
                        serverName={server.name}
                        room={room}
                        agentIdentity={agentIdentity}
                        themeColor={themeColor}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Initial state - prompt to refresh */}
        {!isLoading && !hasFetched && !error && (
          <div className="text-xs text-gray-500 text-center py-2">
            Click Refresh to load MCP servers
          </div>
        )}
      </div>
    </ConfigurationPanelItem>
  );
}

export default MCPPanel;
