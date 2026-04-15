import { Loader2 } from "lucide-react";
import type { ChatMessage } from "./types";
import { MarketSummaryCard } from "./cards/market-summary-card";
import { RecommendationCard } from "./cards/recommendation-card";
import { VerificationPrompt } from "./cards/verification-prompt";
import { TrustFooter } from "./cards/trust-footer";
import { InlineFeedback } from "./cards/inline-feedback";

interface MessageBubbleProps {
  message: ChatMessage;
  threadId?: string | null;
  onVerify?: (confirmed: boolean) => void;
  onSendMessage?: (text: string) => void;
}

export function MessageBubble({ message, threadId, onVerify, onSendMessage }: MessageBubbleProps) {
  // Status line — loading indicator
  if (message.role === "status") {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {message.content}
      </div>
    );
  }

  // User message
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-canola px-3.5 py-2.5 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  // Analyst message — dispatch to card or plain text
  const { cardData, trustFooter } = message;

  if (cardData) {
    switch (cardData.type) {
      case "market_summary":
        return (
          <div className="max-w-[95%]">
            <MarketSummaryCard data={cardData.data} />
            <InlineFeedback threadId={threadId ?? null} onSendMessage={onSendMessage} />
          </div>
        );

      case "recommendation":
        return (
          <div className="max-w-[95%]">
            <RecommendationCard data={cardData.data} />
            <InlineFeedback threadId={threadId ?? null} onSendMessage={onSendMessage} />
          </div>
        );

      case "verification_prompt":
        return (
          <div className="max-w-[95%]">
            <VerificationPrompt
              data={cardData.data}
              onConfirm={() => onVerify?.(true)}
              onDeny={() => onVerify?.(false)}
            />
          </div>
        );

      case "status_line":
        return (
          <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {cardData.text}
          </div>
        );

      case "plain_text":
        // Fall through to plain text rendering below
        break;
    }
  }

  // Plain text analyst response
  return (
    <div className="max-w-[95%]">
      <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-wheat-900/80">
        <div className="whitespace-pre-wrap">{message.content}</div>
      </div>
      {trustFooter && (
        <div className="mt-1">
          <TrustFooter data={trustFooter} />
        </div>
      )}
    </div>
  );
}
