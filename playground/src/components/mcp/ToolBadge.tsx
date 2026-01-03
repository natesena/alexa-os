"use client";

import { useState } from "react";

interface ToolBadgeProps {
  name: string;
  description?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

// Get icon based on tool name patterns
function getToolIcon(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("query") || lowerName.includes("search") || lowerName.includes("find")) {
    return "search";
  }
  if (lowerName.includes("store") || lowerName.includes("save") || lowerName.includes("write")) {
    return "database";
  }
  if (lowerName.includes("list") || lowerName.includes("get")) {
    return "list";
  }
  if (lowerName.includes("reinforce") || lowerName.includes("boost")) {
    return "zap";
  }
  if (lowerName.includes("delete") || lowerName.includes("remove")) {
    return "trash";
  }
  return "tool";
}

// SVG icons
const icons: Record<string, JSX.Element> = {
  search: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  database: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  ),
  list: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  zap: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  trash: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  tool: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export function ToolBadge({ name, description, enabled, onToggle, disabled }: ToolBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const iconType = getToolIcon(name);

  return (
    <button
      onClick={() => !disabled && onToggle(!enabled)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={disabled}
      className={`
        relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
        ${enabled
          ? "bg-blue-900/30 border-blue-700/50 text-blue-300"
          : "bg-gray-800/50 border-gray-700/50 text-gray-500"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-blue-500/50 cursor-pointer"}
      `}
      title={description || name}
    >
      {/* Icon */}
      <span className={enabled ? "text-blue-400" : "text-gray-500"}>
        {icons[iconType]}
      </span>

      {/* Name */}
      <span className="font-mono text-xs truncate max-w-[120px]">
        {name}
      </span>

      {/* Checkbox indicator */}
      <span
        className={`
          w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
          ${enabled
            ? "bg-blue-600 border-blue-500"
            : "bg-gray-800 border-gray-600"
          }
        `}
      >
        {enabled && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>

      {/* Tooltip on hover */}
      {isHovered && description && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 whitespace-nowrap z-10 max-w-[200px] truncate">
          {description}
        </div>
      )}
    </button>
  );
}

export default ToolBadge;
