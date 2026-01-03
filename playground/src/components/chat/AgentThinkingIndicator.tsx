import { ChatBubble } from "./ChatBubble";

type AgentThinkingIndicatorProps = {
  accentColor: string;
  name?: string;
  hideName?: boolean;
};

/**
 * Displays a pulsing "Thinking..." indicator as an agent message bubble.
 *
 * Uses a pulsing dot animation with:
 * - Scale: 1 -> 1.1
 * - Opacity: 1 -> 0.7
 * - Duration: 1.2s cycle
 */
export const AgentThinkingIndicator = ({
  accentColor,
  name = "Jarvis",
  hideName = false,
}: AgentThinkingIndicatorProps) => {
  return (
    <div className={`flex flex-col gap-1 ${hideName ? "pt-1" : "pt-4"}`}>
      {!hideName && (
        <div className={`text-${accentColor}-500 text-xs font-medium`}>
          {name}
        </div>
      )}
      <div className="flex justify-start">
        <ChatBubble variant="agent" accentColor={accentColor}>
          <div className="flex items-center gap-2">
            {/* Pulsing dot with animation */}
            <span
              className="inline-block w-2 h-2 rounded-full animate-thinking-pulse"
              style={{
                backgroundColor: `var(--lk-theme-color, #3b82f6)`,
              }}
            />
            <span className="text-gray-300">Thinking...</span>
          </div>
        </ChatBubble>
      </div>

      {/* CSS for the pulsing animation */}
      <style jsx>{`
        @keyframes thinking-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.7;
          }
        }
        .animate-thinking-pulse {
          animation: thinking-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default AgentThinkingIndicator;
