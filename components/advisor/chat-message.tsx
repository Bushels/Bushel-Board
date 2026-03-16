"use client";

import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-canola/10 text-foreground border border-canola/20"
            : "bg-wheat-100 dark:bg-wheat-800 text-foreground",
          isStreaming && "animate-pulse"
        )}
      >
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}
