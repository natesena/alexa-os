"use client";

import React from "react";
import type { Room } from "livekit-client";
import { useAgentRpc } from "@/hooks/useAgentRpc";
import { LoadingSVG } from "@/components/button/LoadingSVG";

interface InterruptButtonProps {
  room: Room | null;
  agentIdentity: string | null;
  themeColor: string;
  isAgentSpeaking: boolean;
}

const StopIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="2" y="2" width="10" height="10" rx="1" />
  </svg>
);

export const InterruptButton: React.FC<InterruptButtonProps> = ({
  room,
  agentIdentity,
  themeColor,
  isAgentSpeaking,
}) => {
  const { interrupt, isLoading } = useAgentRpc(room, agentIdentity);

  const isConnected = room !== null && agentIdentity !== null;
  const isEnabled = isAgentSpeaking && isConnected && !isLoading;

  const handleClick = async () => {
    if (!isEnabled) return;
    try {
      await interrupt();
    } catch (error) {
      console.error("Failed to interrupt agent:", error);
    }
  };

  // Dynamic color classes based on speaking state
  const colorClasses = isAgentSpeaking
    ? "text-red-500 border-red-500 hover:bg-red-500 hover:text-white"
    : "text-gray-400 border-gray-400";

  return (
    <button
      onClick={handleClick}
      disabled={!isEnabled}
      className={`flex items-center justify-center w-8 h-8 rounded-md border transition ease-out duration-250 ${colorClasses} ${
        !isEnabled ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
      }`}
      title={isAgentSpeaking ? "Stop agent" : "Agent is not speaking"}
      aria-label="Interrupt agent"
    >
      {isLoading ? <LoadingSVG diameter={14} strokeWidth={2} /> : <StopIcon />}
    </button>
  );
};

export default InterruptButton;
