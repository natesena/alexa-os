import { ChatBubble } from "./ChatBubble";

type UserMessageProps = {
  message: string;
  accentColor: string;
  hideName?: boolean;
};

export const UserMessage = ({
  message,
  accentColor,
  hideName,
}: UserMessageProps) => {
  return (
    <div className={`flex flex-col gap-1 ${hideName ? "pt-1" : "pt-4"}`}>
      {!hideName && (
        <div className="text-gray-500 text-xs font-medium text-right">
          You
        </div>
      )}
      <div className="flex justify-end">
        <ChatBubble variant="user" accentColor={accentColor}>
          {message}
        </ChatBubble>
      </div>
    </div>
  );
};
