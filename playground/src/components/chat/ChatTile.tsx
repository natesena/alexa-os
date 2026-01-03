import { AgentMessage } from "@/components/chat/AgentMessage";
import { AgentThinkingIndicator } from "@/components/chat/AgentThinkingIndicator";
import { UserMessage } from "@/components/chat/UserMessage";
import { UserSpeakingIndicator } from "@/components/chat/UserSpeakingIndicator";
import { ChatMessageInput } from "@/components/chat/ChatMessageInput";
import { ToolCallMessage } from "@/components/chat/ToolCallMessage";
import { PipelineState } from "@/hooks/useVoicePipeline";
import type { ToolCall } from "@/hooks/useAgentTelemetry";
import { ReceivedMessage, TrackMutedIndicator } from "@livekit/components-react";
import { useEffect, useRef, useMemo } from "react";
import { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { Mic, MicOff, Square } from "lucide-react";

// Timeline item type for merging messages and tool calls
type TimelineItem =
  | { type: "message"; data: ReceivedMessage; timestamp: number }
  | { type: "toolCall"; data: ToolCall; timestamp: number };

const inputHeight = 56;
const maxWidth = 700;

type AgentState = "speaking" | "listening" | "thinking" | "idle";

type ChatTileProps = {
  messages: ReceivedMessage[];
  accentColor: string;
  onSend?: (message: string) => Promise<ReceivedMessage>;
  agentState?: AgentState;
  pipelineState?: PipelineState;
  agentName?: string;
  microphoneTrack?: TrackReferenceOrPlaceholder;
  userMicrophoneTrack?: TrackReferenceOrPlaceholder;
  onInterrupt?: () => void;
  interruptLoading?: boolean;
  isMicEnabled?: boolean;
  onMicToggle?: () => void;
  toolCalls?: Map<string, ToolCall>;
};

export const ChatTile = ({
  messages,
  accentColor,
  onSend,
  agentState = "idle",
  pipelineState = "idle",
  agentName = "Jarvis",
  microphoneTrack,
  userMicrophoneTrack,
  onInterrupt,
  interruptLoading,
  isMicEnabled = true,
  onMicToggle,
  toolCalls,
}: ChatTileProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [containerRef, messages, agentState, pipelineState]);

  const isSpeaking = agentState === "speaking";
  const isThinking = pipelineState === "thinking";

  // Merge messages and tool calls into chronological timeline
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    // Add messages with timestamps
    messages.forEach((msg) => {
      let timestamp = Date.now();
      if (msg.timestamp) {
        if (msg.timestamp instanceof Date) {
          timestamp = msg.timestamp.getTime();
        } else if (typeof msg.timestamp === 'number') {
          timestamp = msg.timestamp;
        } else if (typeof msg.timestamp === 'string') {
          timestamp = new Date(msg.timestamp).getTime();
        }
      }
      items.push({ type: "message", data: msg, timestamp });
    });

    // Add tool calls with timestamps
    if (toolCalls) {
      Array.from(toolCalls.values()).forEach((tc) => {
        const timestamp = new Date(tc.startTime).getTime();
        items.push({ type: "toolCall", data: tc, timestamp });
      });
    }

    // Sort by timestamp
    items.sort((a, b) => a.timestamp - b.timestamp);

    return items;
  }, [messages, toolCalls]);

  return (
    <div className="flex flex-col w-full h-full items-center">
      {/* Chat messages area with max-width for readability */}
      <div
        ref={containerRef}
        className="overflow-y-auto w-full flex-1 px-4"
      >
        <div
          className="flex flex-col min-h-full justify-end mx-auto pb-4"
          style={{ maxWidth: `${maxWidth}px` }}
        >
          {timeline.map((item, index) => {
            if (item.type === "toolCall") {
              return (
                <ToolCallMessage key={`tool-${item.data.id}`} toolCall={item.data} />
              );
            }

            // Message item
            const message = item.data;
            const prevItem = timeline[index - 1];
            const hideName =
              prevItem?.type === "message" &&
              prevItem.data.from === message.from;
            const isSelf = message.from?.isLocal ?? false;

            if (isSelf) {
              return (
                <UserMessage
                  key={`msg-${index}`}
                  hideName={hideName}
                  message={message.message}
                  accentColor={accentColor}
                />
              );
            } else {
              return (
                <AgentMessage
                  key={`msg-${index}`}
                  hideName={hideName}
                  name={message.from?.name ?? agentName}
                  message={message.message}
                  accentColor={accentColor}
                />
              );
            }
          })}

          {/* Agent thinking indicator */}
          {isThinking && !isSpeaking && (
            <AgentThinkingIndicator
              name={agentName}
              accentColor={accentColor}
            />
          )}

          {/* Agent speaking indicator */}
          {isSpeaking && microphoneTrack && (
            <AgentMessage
              name={agentName}
              accentColor={accentColor}
              isSpeaking={true}
              microphoneTrack={microphoneTrack}
            />
          )}

          {/* User speaking indicator */}
          {isMicEnabled && userMicrophoneTrack && !isSpeaking && (
            <UserSpeakingIndicator
              accentColor={accentColor}
              microphoneTrack={userMicrophoneTrack}
            />
          )}
        </div>
      </div>

      {/* Input area with max-width */}
      <div
        className="w-full px-4 pb-2"
        style={{ maxWidth: `${maxWidth + 32}px` }}
      >
        <div
          className="flex items-center gap-3"
          style={{ height: inputHeight }}
        >
          {/* Text input */}
          <div className="flex-1">
            <ChatMessageInput
              height={inputHeight - 8}
              placeholder="Type a message"
              accentColor={accentColor}
              onSend={onSend}
            />
          </div>

          {/* Track muted indicator - shows LiveKit track mute state */}
          {userMicrophoneTrack && (
            <div className="flex items-center text-gray-400">
              <TrackMutedIndicator trackRef={userMicrophoneTrack} show="muted" />
            </div>
          )}

          {/* Stop button when speaking, Mic button otherwise */}
          {isSpeaking && onInterrupt ? (
            <button
              onClick={onInterrupt}
              disabled={interruptLoading}
              className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors
                bg-red-500 text-white hover:bg-red-600
                ${interruptLoading ? "opacity-50 cursor-not-allowed" : ""}
              `}
              title="Stop"
            >
              <Square className="w-5 h-5 fill-current" />
            </button>
          ) : onMicToggle ? (
            <button
              onClick={onMicToggle}
              className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors ${
                isMicEnabled
                  ? `bg-${accentColor}-500 text-white hover:bg-${accentColor}-600`
                  : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
              title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
