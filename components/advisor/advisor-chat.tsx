"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Wheat } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { GlassCard } from "@/components/ui/glass-card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AdvisorChatProps {
  initialGrain?: string;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: `I'm your Bushel Board advisor — trained on grain marketing frameworks from leading publications and updated weekly with CGC pipeline data, futures prices, CFTC positioning, and platform-wide delivery sentiment.\n\nAsk me anything about your grain — delivery timing, basis, contracts, or how your pace compares to the platform.`,
};

export function AdvisorChat({ initialGrain }: AdvisorChatProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string>("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setLoadingPhase("Looking at your data...");

      try {
        const response = await fetch("/api/advisor/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            threadId,
            grain: initialGrain,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            (errorData as { error?: string }).error ?? `HTTP ${response.status}`
          );
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        const assistantId = `assistant-${Date.now()}`;

        // Add empty assistant message that we'll fill
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6)) as {
                    content?: string;
                    threadId?: string;
                  };
                  if (data.content) {
                    assistantContent += data.content;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantId
                          ? { ...msg, content: assistantContent }
                          : msg
                      )
                    );
                  }
                  if (data.threadId) {
                    setThreadId(data.threadId);
                  }
                } catch {
                  // Skip malformed SSE lines
                }
              }
            }
          }
        }
      } catch (error) {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `I'm having trouble connecting right now. Give me a minute and try again. ${error instanceof Error ? error.message : ""}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        setLoadingPhase("");
      }
    },
    [threadId, initialGrain]
  );

  return (
    <GlassCard className="flex h-[600px] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-wheat-200 dark:border-wheat-700 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-canola/10">
          <Wheat className="h-5 w-5 text-canola" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Kitchen Table Advisor
          </h3>
          <p className="text-xs text-muted-foreground">
            AI-powered market analysis &middot; Not financial advice
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {loadingPhase}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </GlassCard>
  );
}
