"use client";

import { LoadingSVG } from "@/components/button/LoadingSVG";
import { ChatTile } from "@/components/chat/ChatTile";
import { PlaygroundHeader } from "@/components/playground/PlaygroundHeader";
import { PlaygroundTile } from "@/components/playground/PlaygroundTile";
import { SettingsDrawer } from "@/components/playground/SettingsDrawer";
import { useConfig } from "@/hooks/useConfig";
import {
  SessionProvider,
  StartAudio,
  RoomAudioRenderer,
  useSession,
  useAgent,
  useSessionMessages,
  useTracks,
  useVoiceAssistant,
} from "@livekit/components-react";
import {
  ConnectionState,
  TokenSourceConfigurable,
  TokenSourceFetchOptions,
  Track,
  type Room,
} from "livekit-client";
import { PartialMessage } from "@bufbuild/protobuf";
import { ReactNode, useCallback, useEffect, useState } from "react";
import tailwindTheme from "../../lib/tailwindTheme.preval";
import { RoomAgentDispatch } from "livekit-server-sdk";
import { useAgentRpc } from "@/hooks/useAgentRpc";
import { useVoicePipeline } from "@/hooks/useVoicePipeline";
import { useWakeWord } from "@/hooks/useWakeWord";
import { useAgentTelemetry } from "@/hooks/useAgentTelemetry";
import { TrackReferenceOrPlaceholder } from "@livekit/components-core";

export interface PlaygroundMeta {
  name: string;
  value: string;
}

export interface PlaygroundProps {
  logo?: ReactNode;
  themeColors: string[];
  tokenSource: TokenSourceConfigurable;
  agentOptions?: PartialMessage<RoomAgentDispatch>;
  autoConnect?: boolean;
}

const headerHeight = 56;

// Inner component that uses hooks requiring SessionProvider context
interface ChatAreaProps {
  accentColor: string;
  agentName: string;
  onInterrupt?: () => void;
  interruptLoading?: boolean;
  isMicEnabled: boolean;
  onMicToggle: () => void;
  messages: any;
  onSend: any;
}

function ChatArea({
  accentColor,
  agentName,
  onInterrupt,
  interruptLoading,
  isMicEnabled,
  onMicToggle,
  messages,
  onSend,
}: ChatAreaProps) {
  // Use useVoiceAssistant for reliable agent detection and state
  const { state: voiceAssistantState, audioTrack: agentAudioTrack } = useVoiceAssistant();

  // Use useVoicePipeline for voice pipeline state
  const { pipelineState } = useVoicePipeline();

  // Use useAgentTelemetry for tool call tracking
  const { toolCalls } = useAgentTelemetry();

  // Get local participant's microphone track
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const userMicrophoneTrack = tracks.find((t) => t.participant.isLocal);

  // Get agent's microphone track from all tracks
  const agentMicrophoneTrack = tracks.find((t) => !t.participant.isLocal);

  return (
    <ChatTile
      messages={messages}
      accentColor={accentColor}
      onSend={onSend}
      agentState={voiceAssistantState as any}
      pipelineState={pipelineState}
      agentName={agentName}
      microphoneTrack={agentMicrophoneTrack}
      userMicrophoneTrack={userMicrophoneTrack}
      onInterrupt={onInterrupt}
      interruptLoading={interruptLoading}
      isMicEnabled={isMicEnabled}
      onMicToggle={onMicToggle}
      toolCalls={toolCalls}
    />
  );
}

export default function Playground({
  logo,
  themeColors,
  tokenSource,
  agentOptions: initialAgentOptions,
  autoConnect,
}: PlaygroundProps) {
  const { config, setUserSettings } = useConfig();

  const [hasConnected, setHasConnected] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [tokenFetchOptions, setTokenFetchOptions] = useState<TokenSourceFetchOptions>();

  // initialize token fetch options from initial values
  useEffect(() => {
    if (tokenFetchOptions !== undefined || initialAgentOptions === undefined) {
      return;
    }
    setTokenFetchOptions({
      agentName: initialAgentOptions?.agentName ?? "",
      agentMetadata: initialAgentOptions?.metadata ?? "",
    });
  }, [tokenFetchOptions, initialAgentOptions, initialAgentOptions?.agentName, initialAgentOptions?.metadata]);

  const session = useSession(tokenSource, tokenFetchOptions);
  const { connectionState } = session;
  const agent = useAgent(session);
  const messages = useSessionMessages(session);

  // RPC hook for agent controls
  const agentIdentity = agent.internal.agentParticipant?.identity ?? null;
  const { interrupt, isLoading: interruptLoading } = useAgentRpc(
    connectionState === ConnectionState.Connected ? session.room : null,
    agentIdentity
  );

  // Wake word state hook
  const wakeWordStatus = useWakeWord(
    connectionState === ConnectionState.Connected ? session.room : null,
    agentIdentity
  );

  const handleInterrupt = useCallback(async () => {
    try {
      await interrupt();
    } catch (error) {
      console.error("Failed to interrupt agent:", error);
    }
  }, [interrupt]);

  const startSession = useCallback(() => {
    if (session.isConnected) {
      return;
    }
    session.start();
    setHasConnected(true);
  }, [session, session.isConnected]);

  useEffect(() => {
    if (autoConnect && !hasConnected) {
      startSession();
    }
  }, [autoConnect, hasConnected, startSession]);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      session.room.localParticipant.setMicrophoneEnabled(isMicEnabled);
    }
  }, [isMicEnabled, session.room.localParticipant, connectionState]);

  const handleMicToggle = useCallback(() => {
    setIsMicEnabled((prev) => !prev);
  }, []);

  // Set theme color
  useEffect(() => {
    document.body.style.setProperty(
      "--lk-theme-color",
      // @ts-ignore
      tailwindTheme.colors[config.settings.theme_color]["500"],
    );
    document.body.style.setProperty(
      "--lk-drop-shadow",
      `var(--lk-theme-color) 0px 0px 18px`,
    );
  }, [config.settings.theme_color]);

  // Disconnected state
  const disconnectedContent = (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
      <div className="text-lg">Welcome to Alexa-OS</div>
      <div className="text-sm">Click Connect to start a conversation</div>
    </div>
  );

  // Waiting for agent
  const waitingContent = (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
      <LoadingSVG />
      <div className="text-sm">Waiting for agent...</div>
    </div>
  );

  // Check if agent is available (has identity means agent joined the room)
  const hasAgent = agentIdentity !== null;

  // Main chat content
  const chatContent = connectionState === ConnectionState.Connected ? (
    <ChatArea
      messages={messages.messages}
      accentColor={config.settings.theme_color}
      onSend={messages.send}
      agentName="Jarvis"
      onInterrupt={hasAgent ? handleInterrupt : undefined}
      interruptLoading={interruptLoading}
      isMicEnabled={isMicEnabled}
      onMicToggle={handleMicToggle}
    />
  ) : (
    disconnectedContent
  );

  return (
    <SessionProvider session={session}>
      <div className="flex flex-col h-full w-full">
        <PlaygroundHeader
          title={config.title}
          logo={logo}
          githubLink={config.github_link}
          height={headerHeight}
          accentColor={config.settings.theme_color}
          connectionState={connectionState}
          onConnectClicked={() => {
            if (connectionState === ConnectionState.Disconnected) {
              startSession();
            } else if (connectionState === ConnectionState.Connected) {
              session.end();
            }
          }}
          onSettingsClick={() => setSettingsOpen(true)}
          wakeWordState={wakeWordStatus.state}
          wakeWordConfidence={wakeWordStatus.lastDetectionConfidence}
        />

        {/* Main chat area - takes full space */}
        <div
          className={`flex py-4 px-4 grow w-full selection:bg-${config.settings.theme_color}-900`}
          style={{ height: `calc(100% - ${headerHeight}px)` }}
        >
          <PlaygroundTile
            className="w-full h-full"
            childrenClassName="h-full"
          >
            {chatContent}
          </PlaygroundTile>
        </div>

        {/* Settings Drawer */}
        <SettingsDrawer
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          room={connectionState === ConnectionState.Connected ? session.room : null}
          agentIdentity={agentIdentity}
          themeColor={config.settings.theme_color}
          themeColors={themeColors}
          onThemeChange={(color) => {
            const userSettings = { ...config.settings };
            userSettings.theme_color = color;
            setUserSettings(userSettings);
          }}
          connectionState={connectionState}
          roomName={session.room?.name}
        />

        <RoomAudioRenderer />
        <StartAudio label="Click to enable audio playback" />
      </div>
    </SessionProvider>
  );
}
