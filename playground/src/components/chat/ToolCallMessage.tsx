"use client";

import { useState } from "react";
import type { ToolCall } from "@/hooks/useAgentTelemetry";

interface ToolCallMessageProps {
  toolCall: ToolCall;
}

// Get icon based on tool name
function getToolIcon(name: string): JSX.Element {
  const lowerName = name.toLowerCase();

  if (lowerName.includes("query") || lowerName.includes("search")) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    );
  }
  if (lowerName.includes("store") || lowerName.includes("save")) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
    );
  }
  if (lowerName.includes("list") || lowerName.includes("get")) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    );
  }

  // Default tool icon
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// Status colors and icons
function getStatusIndicator(status: ToolCall["status"]): JSX.Element {
  switch (status) {
    case "running":
      return (
        <div className="flex items-center gap-1 text-yellow-400">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs">Running</span>
        </div>
      );
    case "complete":
      return (
        <div className="flex items-center gap-1 text-green-400">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs">Complete</span>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-1 text-red-400">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-xs">Error</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1 text-gray-400">
          <span className="text-xs">Pending</span>
        </div>
      );
  }
}

export function ToolCallMessage({ toolCall }: ToolCallMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasArgs = Object.keys(toolCall.arguments).length > 0;
  const hasResult = toolCall.result && toolCall.result.length > 0;

  return (
    <div className="flex justify-center my-2">
      <div
        className={`
          max-w-md w-full rounded-lg border transition-all
          ${toolCall.status === "error"
            ? "bg-red-900/20 border-red-800/50"
            : "bg-gray-800/50 border-gray-700/50"
          }
        `}
      >
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-700/30 transition-colors rounded-lg"
        >
          {/* Tool icon */}
          <span className="text-blue-400 flex-shrink-0">
            {getToolIcon(toolCall.toolName)}
          </span>

          {/* Tool name */}
          <span className="font-mono text-sm text-gray-200 truncate flex-1">
            {toolCall.toolName}
          </span>

          {/* Status indicator */}
          {getStatusIndicator(toolCall.status)}

          {/* Expand indicator */}
          {(hasArgs || hasResult) && (
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

        {/* Expanded details */}
        {isExpanded && (hasArgs || hasResult || toolCall.error) && (
          <div className="px-3 pb-3 space-y-2 border-t border-gray-700/50">
            {/* Arguments */}
            {hasArgs && (
              <div className="pt-2">
                <div className="text-xs text-gray-500 mb-1">Arguments</div>
                <pre className="text-xs text-gray-300 bg-gray-900/50 rounded p-2 overflow-x-auto max-h-32">
                  {JSON.stringify(toolCall.arguments, null, 2)}
                </pre>
              </div>
            )}

            {/* Result */}
            {hasResult && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Result</div>
                <pre className="text-xs text-gray-300 bg-gray-900/50 rounded p-2 overflow-x-auto max-h-32">
                  {toolCall.result}
                </pre>
              </div>
            )}

            {/* Error */}
            {toolCall.error && (
              <div>
                <div className="text-xs text-red-500 mb-1">Error</div>
                <pre className="text-xs text-red-300 bg-red-900/30 rounded p-2 overflow-x-auto">
                  {toolCall.error}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ToolCallMessage;
