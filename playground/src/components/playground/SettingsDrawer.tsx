"use client";

import React, { useEffect, useState } from "react";
import { X, Settings } from "lucide-react";
import type { Room } from "livekit-client";
import { ConnectionState } from "livekit-client";
import { ModelSelector } from "./ModelSelector";
import { ToolsPanel } from "./ToolsPanel";
import { MCPPanel } from "./MCPPanel";
import { ColorPicker } from "@/components/colorPicker/ColorPicker";
import { useAgentRpc, VadSettings } from "@/hooks/useAgentRpc";
import { useMediaDeviceSelect } from "@livekit/components-react";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room | null;
  agentIdentity: string | null;
  themeColor: string;
  themeColors: string[];
  onThemeChange: (color: string) => void;
  connectionState: ConnectionState;
  roomName?: string;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  room,
  agentIdentity,
  themeColor,
  themeColors,
  onThemeChange,
  connectionState,
  roomName,
}) => {
  const isConnected = connectionState === ConnectionState.Connected;
  const { getAgentState } = useAgentRpc(room, agentIdentity);
  const [sttModel, setSttModel] = useState<string | null>(null);
  const [ttsProvider, setTtsProvider] = useState<string | null>(null);
  const [vadSettings, setVadSettings] = useState<VadSettings | null>(null);

  // Microphone device selection
  const { devices: audioDevices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind: "audioinput" });

  // Fetch agent state when drawer opens
  useEffect(() => {
    if (isOpen && isConnected && agentIdentity) {
      getAgentState().then((state) => {
        if (state.success) {
          setSttModel(state.stt_model || null);
          setTtsProvider(state.tts_provider || null);
          setVadSettings(state.vad_settings || null);
        }
      }).catch(() => {
        // Ignore errors
      });
    }
  }, [isOpen, isConnected, agentIdentity, getAgentState]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-gray-950 border-l border-gray-800 z-50 transform transition-transform duration-300 ease-out overflow-y-auto ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 sticky top-0 bg-gray-950">
          <div className="flex items-center gap-2 text-white">
            <Settings className="w-5 h-5" />
            <span className="font-semibold">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Connection Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Status</label>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-500"}`} />
              <span className={`text-sm ${isConnected ? `text-${themeColor}-500` : "text-gray-500"}`}>
                {connectionState}
              </span>
            </div>
            {isConnected && roomName && (
              <div className="text-xs text-gray-500">Room: {roomName}</div>
            )}
            {isConnected && agentIdentity && (
              <div className="text-xs text-gray-500">Agent: {agentIdentity}</div>
            )}
          </div>

          {/* Microphone Selection */}
          {isConnected && audioDevices.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Microphone</label>
              <select
                value={activeDeviceId || ""}
                onChange={(e) => setActiveMediaDevice(e.target.value)}
                className={`w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-${themeColor}-500 cursor-pointer`}
              >
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* LLM Model Section */}
          {isConnected && agentIdentity && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">LLM Model</label>
              <ModelSelector
                room={room}
                agentIdentity={agentIdentity}
                themeColor={themeColor}
              />
            </div>
          )}

          {/* STT Model */}
          {isConnected && sttModel && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">STT Model</label>
              <div className={`text-sm text-${themeColor}-400`}>{sttModel}</div>
            </div>
          )}

          {/* TTS Provider */}
          {isConnected && ttsProvider && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">TTS</label>
              <div className={`text-sm text-${themeColor}-400`}>{ttsProvider}</div>
            </div>
          )}

          {/* VAD Settings Section */}
          {isConnected && vadSettings && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400">Voice Activity Detection</label>
              <div className="bg-gray-900 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Activation Threshold</span>
                  <span className={`text-xs text-${themeColor}-400 font-mono`}>
                    {vadSettings.activation_threshold.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Min Speech Duration</span>
                  <span className={`text-xs text-${themeColor}-400 font-mono`}>
                    {vadSettings.min_speech_duration.toFixed(2)}s
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Min Silence Duration</span>
                  <span className={`text-xs text-${themeColor}-400 font-mono`}>
                    {vadSettings.min_silence_duration.toFixed(2)}s
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* MCP Servers Section */}
          {isConnected && agentIdentity && (
            <MCPPanel
              room={room}
              agentIdentity={agentIdentity}
              themeColor={themeColor}
            />
          )}

          {/* Tools Section */}
          {isConnected && agentIdentity && (
            <ToolsPanel
              room={room}
              agentIdentity={agentIdentity}
              themeColor={themeColor}
            />
          )}

          {/* Theme Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Theme</label>
            <ColorPicker
              colors={themeColors}
              selectedColor={themeColor}
              onSelect={onThemeChange}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsDrawer;
