"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useBushySSE } from "./use-bushy-sse";
import { BushyWelcome } from "./bushy-welcome";
import { BushyComposer } from "./bushy-composer";
import { MessageBubble } from "./message-bubble";
import { createClient } from "@/lib/supabase/client";
import { getCurrentCropYear } from "@/lib/utils/crop-year";

interface BushyChatProps {
  /** Auto-send this prompt on mount (for deep-link support) */
  initialPrompt?: string;
  /** When set, scopes chat to a specific grain (used on grain detail pages) */
  grainContext?: { grain: string; grainWeek: number };
}

const DEFAULT_CHIPS = ["Haul or hold?", "My area", "Basis check"];
const GRAIN_CHIPS = ["Show me exports", "Compare to last year", "Terminal flow", "What would you do?"];

export function BushyChat({ initialPrompt, grainContext }: BushyChatProps) {
  const { messages, isLoading, sendMessage, threadId } = useBushySSE(grainContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [chips, setChips] = useState<string[]>(DEFAULT_CHIPS);
  const initialSent = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load quick chips — grain-scoped pages get grain-specific chips,
  // standalone chat loads from crop_plans
  useEffect(() => {
    if (grainContext) {
      setChips(GRAIN_CHIPS);
      return;
    }

    async function loadChips() {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const cropYear = getCurrentCropYear();
        const { data } = await supabase
          .from("crop_plans")
          .select("grain")
          .eq("user_id", session.user.id)
          .eq("crop_year", cropYear);

        if (data && data.length > 0) {
          const grainChips = data.map(
            (row: { grain: string }) => row.grain
          );
          setChips([...grainChips, ...DEFAULT_CHIPS]);
        } else {
          setChips(["Wheat", "Canola", ...DEFAULT_CHIPS]);
        }
      } catch {
        setChips(["Wheat", "Canola", ...DEFAULT_CHIPS]);
      }
    }
    loadChips();
  }, [grainContext]);

  // Auto-send initial prompt (deep-link)
  useEffect(() => {
    if (initialPrompt && !initialSent.current) {
      initialSent.current = true;
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, sendMessage]);

  const handleVerify = useCallback(
    async (confirmed: boolean, messageId: string) => {
      // Find the verification prompt data
      const msg = messages.find((m) => m.id === messageId);
      if (!msg?.cardData || msg.cardData.type !== "verification_prompt") return;

      const vp = msg.cardData.data;
      const newConfidence = confirmed ? "verified" : "reported";

      // Update stored intel confidence directly via Supabase (bypass LLM round-trip)
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("local_market_intel")
          .update({ confidence: newConfidence })
          .eq("user_id", user.id)
          .eq("grain", vp.grain)
          .eq("data_type", vp.dataType)
          .order("reported_at", { ascending: false })
          .limit(1);
      }

      // Also send as chat message so Bushy acknowledges it conversationally
      const verificationText = confirmed
        ? `[VERIFIED] ${vp.dataType} for ${vp.grain}: ${vp.inferredValue}`
        : `[SKIPPED] ${vp.dataType} for ${vp.grain}`;
      sendMessage(verificationText);
    },
    [messages, sendMessage]
  );

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none overscroll-contain">
        {!hasMessages ? (
          <BushyWelcome
            onChipSelect={(chip) => sendMessage(chip)}
          />
        ) : (
          <div className="mx-auto max-w-lg space-y-3 px-3 py-4">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                threadId={threadId}
                onVerify={(confirmed) => handleVerify(confirmed, msg.id)}
                onSendMessage={sendMessage}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer — sticky bottom */}
      <BushyComposer
        onSend={sendMessage}
        chips={hasMessages ? chips : []}
        disabled={isLoading}
      />
    </div>
  );
}
