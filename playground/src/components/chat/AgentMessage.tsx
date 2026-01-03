import { ChatBubble } from "./ChatBubble";
import { BarVisualizer } from "@livekit/components-react";
import { TrackReferenceOrPlaceholder } from "@livekit/components-core";

type AgentMessageProps = {
  message?: string;
  accentColor: string;
  name: string;
  hideName?: boolean;
  isSpeaking?: boolean;
  microphoneTrack?: TrackReferenceOrPlaceholder;
};

export const AgentMessage = ({
  message,
  accentColor,
  name,
  hideName,
  isSpeaking,
  microphoneTrack,
}: AgentMessageProps) => {
  return (
    <div className={`flex flex-col gap-1 ${hideName ? "pt-1" : "pt-4"}`}>
      {!hideName && (
        <div className={`text-${accentColor}-500 text-xs font-medium`}>
          {name}
        </div>
      )}
      <div className="flex justify-start">
        {isSpeaking && microphoneTrack ? (
          <ChatBubble variant="agent" accentColor={accentColor}>
            <div className="flex items-center h-6 [--lk-va-bar-width:3px] [--lk-va-bar-gap:2px] [--lk-fg:var(--lk-theme-color)]">
              <BarVisualizer
                state="speaking"
                trackRef={microphoneTrack}
                barCount={5}
                options={{ minHeight: 3 }}
              />
            </div>
          </ChatBubble>
        ) : message ? (
          <ChatBubble variant="agent" accentColor={accentColor}>
            {message}
          </ChatBubble>
        ) : null}
      </div>
    </div>
  );
};
