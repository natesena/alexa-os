import { useState, useRef, useEffect, useMemo } from "react";
import { Room } from "livekit-client";
import { ConfigurationPanelItem } from "@/components/config/ConfigurationPanelItem";
import {
  useAgentTelemetry,
  TelemetryEvent,
  LLMRequest,
  ToolCall,
} from "@/hooks/useAgentTelemetry";

type TelemetryPanelProps = {
  room: Room | null;
  themeColor: string;
};

type TabType = "Timeline" | "LLM" | "Tools";

const MAX_DISPLAY_EVENTS = 50;

// Helper to format timestamp
const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return timestamp;
  }
};

// Helper to truncate request_id for display
const truncateRequestId = (id?: string): string => {
  if (!id) return "N/A";
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
};

// Get color class for event type
const getEventTypeColor = (type: string): string => {
  if (type.startsWith("llm_")) return "text-blue-400";
  if (type.startsWith("tool_")) return "text-purple-400";
  if (type === "error") return "text-red-400";
  return "text-gray-400";
};

// Status indicator component
const StatusIndicator = ({
  status,
}: {
  status: "pending" | "streaming" | "running" | "complete" | "error";
}) => {
  const colorMap = {
    pending: "bg-yellow-500",
    streaming: "bg-blue-500 animate-pulse",
    running: "bg-blue-500 animate-pulse",
    complete: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colorMap[status]}`}
      title={status}
    />
  );
};

// Streaming indicator (pulsing dot)
const StreamingIndicator = ({ isStreaming }: { isStreaming: boolean }) => {
  if (!isStreaming) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-green-400 text-xs">Streaming</span>
    </div>
  );
};

// Timeline Event Item
const TimelineEventItem = ({ event }: { event: TelemetryEvent }) => {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 hover:bg-gray-800/50 rounded font-mono text-xs border-l-2 border-gray-700">
      <span className="text-gray-500 shrink-0">
        {formatTimestamp(event.timestamp)}
      </span>
      <span className={`shrink-0 ${getEventTypeColor(event.type)}`}>
        [{event.type}]
      </span>
      <span className="text-gray-400 truncate">
        {truncateRequestId(event.request_id)}
      </span>
    </div>
  );
};

// LLM Request Item
const LLMRequestItem = ({ request }: { request: LLMRequest }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-700 rounded mb-2 overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-800/50 cursor-pointer hover:bg-gray-800"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <StatusIndicator status={request.status} />
          <span className="font-mono text-xs text-blue-400">
            {request.model}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-mono">
            {formatTimestamp(request.startTime)}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
      {isExpanded && (
        <div className="px-3 py-2 bg-gray-900 border-t border-gray-700">
          <div className="text-xs text-gray-400 mb-1">Response:</div>
          <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap break-words max-h-48 overflow-y-auto bg-black/30 p-2 rounded">
            {request.fullResponse || "(no response yet)"}
          </pre>
          {request.endTime && (
            <div className="text-xs text-gray-500 mt-2">
              Completed: {formatTimestamp(request.endTime)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Tool Call Item
const ToolCallItem = ({ toolCall }: { toolCall: ToolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-700 rounded mb-2 overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-800/50 cursor-pointer hover:bg-gray-800"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <StatusIndicator status={toolCall.status} />
          <span className="font-mono text-xs text-purple-400">
            {toolCall.toolName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-mono">
            {formatTimestamp(toolCall.startTime)}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
      {isExpanded && (
        <div className="px-3 py-2 bg-gray-900 border-t border-gray-700 space-y-2">
          <div>
            <div className="text-xs text-gray-400 mb-1">Arguments:</div>
            <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-black/30 p-2 rounded">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>
          {toolCall.result && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Result:</div>
              <pre className="font-mono text-xs text-green-300 whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-black/30 p-2 rounded">
                {toolCall.result}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <div className="text-xs text-gray-400 mb-1">Error:</div>
              <pre className="font-mono text-xs text-red-400 whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-black/30 p-2 rounded">
                {toolCall.error}
              </pre>
            </div>
          )}
          {toolCall.endTime && (
            <div className="text-xs text-gray-500">
              Completed: {formatTimestamp(toolCall.endTime)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Tab Button component
const TabButton = ({
  tab,
  activeTab,
  onClick,
  themeColor,
}: {
  tab: TabType;
  activeTab: TabType;
  onClick: () => void;
  themeColor: string;
}) => {
  const isActive = tab === activeTab;
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
        isActive
          ? "text-white"
          : "text-gray-400 hover:text-gray-300 bg-transparent hover:bg-gray-800"
      }`}
      style={isActive ? { backgroundColor: themeColor } : undefined}
    >
      {tab}
    </button>
  );
};

export const TelemetryPanel = ({ room, themeColor }: TelemetryPanelProps) => {
  // useAgentTelemetry now uses useDataChannel internally - no need to pass room
  const { events, llmRequests, toolCalls, isStreaming, clearEvents } =
    useAgentTelemetry();

  const [activeTab, setActiveTab] = useState<TabType>("Timeline");
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll timeline to bottom when new events arrive
  useEffect(() => {
    if (timelineContainerRef.current && activeTab === "Timeline") {
      timelineContainerRef.current.scrollTop =
        timelineContainerRef.current.scrollHeight;
    }
  }, [events, activeTab]);

  // Get events sorted newest first (limited to MAX_DISPLAY_EVENTS)
  const displayEvents = useMemo(() => {
    return [...events].reverse().slice(0, MAX_DISPLAY_EVENTS);
  }, [events]);

  // Convert Maps to arrays for rendering (newest first)
  const llmRequestsArray = useMemo(() => {
    return Array.from(llmRequests.values()).reverse();
  }, [llmRequests]);

  const toolCallsArray = useMemo(() => {
    return Array.from(toolCalls.values()).reverse();
  }, [toolCalls]);

  return (
    <ConfigurationPanelItem
      title="Agent Telemetry"
      collapsible={true}
      defaultCollapsed={false}
    >
      <div className="flex flex-col gap-3">
        {/* Header with tabs, streaming indicator, and clear button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <TabButton
              tab="Timeline"
              activeTab={activeTab}
              onClick={() => setActiveTab("Timeline")}
              themeColor={themeColor}
            />
            <TabButton
              tab="LLM"
              activeTab={activeTab}
              onClick={() => setActiveTab("LLM")}
              themeColor={themeColor}
            />
            <TabButton
              tab="Tools"
              activeTab={activeTab}
              onClick={() => setActiveTab("Tools")}
              themeColor={themeColor}
            />
          </div>
          <div className="flex items-center gap-3">
            <StreamingIndicator isStreaming={isStreaming} />
            <button
              onClick={clearEvents}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-gray-900/50 rounded border border-gray-800">
          {/* Timeline Tab */}
          {activeTab === "Timeline" && (
            <div
              ref={timelineContainerRef}
              className="h-64 overflow-y-auto p-2"
            >
              {displayEvents.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                  No events yet. Connect to an agent to see telemetry.
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {displayEvents.map((event, index) => (
                    <TimelineEventItem
                      key={`${event.timestamp}-${index}`}
                      event={event}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LLM Tab */}
          {activeTab === "LLM" && (
            <div className="h-64 overflow-y-auto p-2">
              {llmRequestsArray.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                  No LLM requests yet.
                </div>
              ) : (
                <div className="flex flex-col">
                  {llmRequestsArray.map((request) => (
                    <LLMRequestItem key={request.id} request={request} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tools Tab */}
          {activeTab === "Tools" && (
            <div className="h-64 overflow-y-auto p-2">
              {toolCallsArray.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                  No tool calls yet.
                </div>
              ) : (
                <div className="flex flex-col">
                  {toolCallsArray.map((toolCall) => (
                    <ToolCallItem key={toolCall.id} toolCall={toolCall} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats footer */}
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>
            Events: {events.length}
            {events.length > MAX_DISPLAY_EVENTS && ` (showing ${MAX_DISPLAY_EVENTS})`}
          </span>
          <span>
            LLM: {llmRequests.size} | Tools: {toolCalls.size}
          </span>
        </div>
      </div>
    </ConfigurationPanelItem>
  );
};

export default TelemetryPanel;
