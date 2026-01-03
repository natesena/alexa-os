import { ChatBubble } from "./ChatBubble";
import { BarVisualizer } from "@livekit/components-react";
import { TrackReferenceOrPlaceholder } from "@livekit/components-core";

type UserSpeakingIndicatorProps = {
  accentColor: string;
  microphoneTrack: TrackReferenceOrPlaceholder;
};

export const UserSpeakingIndicator = ({
  accentColor,
  microphoneTrack,
}: UserSpeakingIndicatorProps) => {
  return (
    <div className="flex flex-col gap-1 pt-4">
      <div className="text-gray-500 text-xs font-medium text-right">
        You
      </div>
      <div className="flex justify-end">
        <ChatBubble variant="user" accentColor={accentColor}>
          <div className="flex items-center h-6 min-w-[80px] [--lk-va-bar-width:3px] [--lk-va-bar-gap:2px] [--lk-fg:rgba(255,255,255,0.9)]">
            <BarVisualizer
              state="speaking"
              trackRef={microphoneTrack}
              barCount={8}
              options={{ minHeight: 3 }}
            />
          </div>
        </ChatBubble>
      </div>
    </div>
  );
};
