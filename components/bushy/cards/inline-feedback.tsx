"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface InlineFeedbackProps {
  /** Thread ID for context linking */
  threadId: string | null;
  /** Callback to send a follow-up message to Bushy (triggers save_feedback tool) */
  onSendMessage?: (text: string) => void;
}

type FeedbackState = "idle" | "thumbs_up" | "thumbs_down" | "tell_buac" | "submitted";

export function InlineFeedback({ threadId, onSendMessage }: InlineFeedbackProps) {
  const [state, setState] = useState<FeedbackState>("idle");
  const [message, setMessage] = useState("");

  async function handleThumbsUp() {
    setState("thumbs_up");
    // Silent log — insert directly, no need to bother Bushy
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from("feedback_log").insert({
          user_id: session.user.id,
          thread_id: threadId,
          feedback_type: "praise",
          severity: "low",
        });
      }
    } catch (e) {
      console.error("Feedback log error:", e);
    }
    // Brief "Thanks!" then fade
    setTimeout(() => setState("submitted"), 1200);
  }

  function handleThumbsDown() {
    setState("thumbs_down");
    // Bushy asks what was off — send as follow-up message
    onSendMessage?.("That wasn't quite right.");
    setTimeout(() => setState("submitted"), 800);
  }

  function handleTellBuac() {
    setState("tell_buac");
  }

  function handleSubmitMessage() {
    if (!message.trim()) return;
    // Send as a feature request via Bushy (triggers save_feedback tool)
    onSendMessage?.(`Tell bu/ac: ${message.trim()}`);
    setState("submitted");
    setMessage("");
  }

  // Already interacted — show nothing or faded confirmation
  if (state === "submitted") {
    return null;
  }

  if (state === "thumbs_up") {
    return (
      <div className="flex items-center gap-1.5 px-3.5 pb-2 pt-1">
        <span className="text-xs text-prairie">Thanks!</span>
      </div>
    );
  }

  if (state === "thumbs_down") {
    return (
      <div className="flex items-center gap-1.5 px-3.5 pb-2 pt-1">
        <span className="text-xs text-muted-foreground">Noted — Bushy will follow up.</span>
      </div>
    );
  }

  if (state === "tell_buac") {
    return (
      <div className="px-3.5 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmitMessage()}
            placeholder="What should I tell bu/ac?"
            className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-canola"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSubmitMessage}
            disabled={!message.trim()}
            className="rounded-lg bg-canola px-2.5 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  // Default idle state — show feedback options
  return (
    <div className="flex items-center gap-3 px-3.5 pb-2.5 pt-1">
      <span className="text-[11px] text-muted-foreground">Helpful?</span>
      <button
        type="button"
        onClick={handleThumbsUp}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-prairie/10 hover:text-prairie"
        aria-label="Helpful"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleThumbsDown}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
        aria-label="Not helpful"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleTellBuac}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-canola/10 hover:text-canola"
      >
        <MessageCircle className="h-3 w-3" />
        Tell bu/ac
      </button>
    </div>
  );
}
