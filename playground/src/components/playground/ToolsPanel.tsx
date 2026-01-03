"use client";

import { useState, useCallback, useEffect } from "react";
import type { Room } from "livekit-client";
import { ConfigurationPanelItem } from "@/components/config/ConfigurationPanelItem";
import { Button } from "@/components/button/Button";
import { LoadingSVG } from "@/components/button/LoadingSVG";
import { useAgentRpc, ToolInfo } from "@/hooks/useAgentRpc";

interface ToolsPanelProps {
  room: Room | null;
  agentIdentity: string | null;
  themeColor: string;
}

export function ToolsPanel({
  room,
  agentIdentity,
  themeColor,
}: ToolsPanelProps) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const { listTools } = useAgentRpc(room, agentIdentity);

  const handleRefresh = useCallback(async () => {
    if (!room || !agentIdentity) {
      setError("Not connected to agent");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await listTools();
      if (response.success && response.tools) {
        setTools(response.tools);
      } else {
        setError(response.error || "Failed to fetch tools");
        setTools([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tools");
      setTools([]);
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, [room, agentIdentity, listTools]);

  // Auto-fetch tools when room and agent become available
  useEffect(() => {
    if (room && agentIdentity && !hasFetched) {
      handleRefresh();
    }
  }, [room, agentIdentity, hasFetched, handleRefresh]);

  return (
    <ConfigurationPanelItem
      title="MCP Tools"
      collapsible={true}
      defaultCollapsed={true}
    >
      <div className="flex flex-col gap-3">
        {/* Header with refresh button and count */}
        <div className="flex items-center justify-between">
          <Button
            accentColor={themeColor}
            onClick={handleRefresh}
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
          {hasFetched && !isLoading && (
            <span className="text-xs text-gray-400">
              {tools.length} tool{tools.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-2 py-1">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-4 text-gray-400">
            <LoadingSVG diameter={16} strokeWidth={2} />
            <span className="ml-2 text-xs">Fetching tools...</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && hasFetched && tools.length === 0 && !error && (
          <div className="text-xs text-gray-500 text-center py-4">
            No MCP tools configured
          </div>
        )}

        {/* Tools list */}
        {!isLoading && tools.length > 0 && (
          <div className="max-h-64 overflow-y-auto border border-gray-800 rounded">
            <div className="divide-y divide-gray-800">
              {tools.map((tool, index) => (
                <div
                  key={`${tool.server}-${tool.name}-${index}`}
                  className="p-2 hover:bg-gray-800/50 transition-colors"
                >
                  {/* Tool name */}
                  <div
                    className={`font-mono text-sm text-${themeColor}-400`}
                    style={{ color: `var(--${themeColor}-400, #60a5fa)` }}
                  >
                    {tool.name}
                  </div>

                  {/* Tool description */}
                  {tool.description && (
                    <div
                      className="text-xs text-gray-400 mt-1 truncate"
                      title={tool.description}
                    >
                      {tool.description}
                    </div>
                  )}

                  {/* Server source */}
                  <div className="text-[10px] text-gray-500 mt-1">
                    via {tool.server}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Initial state - prompt to refresh */}
        {!isLoading && !hasFetched && !error && (
          <div className="text-xs text-gray-500 text-center py-2">
            Click Refresh to load available tools
          </div>
        )}
      </div>
    </ConfigurationPanelItem>
  );
}

export default ToolsPanel;
