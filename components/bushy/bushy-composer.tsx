"use client";

import { useRef, useCallback } from "react";
import { Send } from "lucide-react";
import { QuickChips } from "./quick-chips";

interface BushyComposerProps {
  onSend: (text: string) => void;
  chips: string[];
  disabled?: boolean;
}

export function BushyComposer({ onSend, chips, disabled }: BushyComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const text = textareaRef.current?.value.trim();
    if (!text || disabled) return;
    onSend(text);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
  }, [onSend, disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Cap at ~4 lines (4 * 20px line-height = 80px)
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, []);

  return (
    <div className="border-t border-border/40 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:bg-wheat-900/95">
      {/* Quick chips */}
      <QuickChips
        chips={chips}
        onSelect={(chip) => {
          if (!disabled) onSend(chip);
        }}
        disabled={disabled}
      />

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 pb-3">
        <textarea
          ref={textareaRef}
          placeholder="Ask Bushy..."
          disabled={disabled}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-border/50 bg-white/80 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-canola/40 focus:outline-none focus:ring-1 focus:ring-canola/20 disabled:opacity-50 dark:bg-wheat-800/50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canola text-white transition-colors hover:bg-canola/90 active:scale-95 disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
