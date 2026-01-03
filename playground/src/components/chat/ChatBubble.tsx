import { ReactNode } from "react";

type ChatBubbleProps = {
  children: ReactNode;
  variant: "user" | "agent";
  accentColor: string;
};

export const ChatBubble = ({
  children,
  variant,
  accentColor,
}: ChatBubbleProps) => {
  const isUser = variant === "user";

  return (
    <div
      className={`
        px-4 py-2 rounded-2xl max-w-[80%] text-sm whitespace-pre-line
        ${isUser
          ? `bg-${accentColor}-600 text-white rounded-br-md`
          : "bg-gray-800 text-gray-100 rounded-bl-md"
        }
      `}
    >
      {children}
    </div>
  );
};
