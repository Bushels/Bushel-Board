"use client";

import { useState } from "react";
import { CheckCircle2, SmilePlus } from "lucide-react";
import type { VerificationPromptData } from "../types";

interface VerificationPromptProps {
  data: VerificationPromptData;
  onConfirm: () => void;
  onDeny: () => void;
}

function headerText(dataType: string): string {
  switch (dataType) {
    case "basis":
    case "elevator_price":
    case "input_price":
      return "Quick check";
    case "yield_estimate":
      return "Yield check";
    case "seeding_progress":
    case "harvest_progress":
      return "Progress check";
    default:
      return "Quick check";
  }
}

function promptText(data: VerificationPromptData): string {
  const elevator = data.elevatorName ? ` at ${data.elevatorName}` : "";
  switch (data.dataType) {
    case "basis":
      return `Sounds like basis is around ${data.inferredValue}${elevator}. That right?`;
    case "elevator_price":
      return `So ${data.elevatorName ?? "the elevator"} is quoting ${data.inferredValue}? Just want to make sure I heard you right.`;
    case "input_price":
      return `You paid ${data.inferredValue} for ${data.grain}? Tell me that's real and I'll tell you how your neighbors did.`;
    case "crop_condition":
      return `I'm picking up that conditions are ${data.inferredValue} in your area. Sound about right?`;
    case "yield_estimate":
      return `Noted ${data.inferredValue} bu/acre for ${data.grain}. Does that track?`;
    case "seeding_progress":
      return `So you're about ${data.inferredValue}% done seeding ${data.grain}? Just confirming.`;
    case "harvest_progress":
      return `About ${data.inferredValue}% done on ${data.grain} harvest?`;
    case "acres_planned":
      return `${data.inferredValue} acres of ${data.grain} this year?`;
    default:
      return `Just to confirm: ${data.inferredValue} for ${data.grain}${elevator}?`;
  }
}

function confirmedMessage(dataType: string): string {
  switch (dataType) {
    case "basis":
    case "elevator_price":
    case "input_price":
      return "Logged — let me pull up how that compares...";
    case "yield_estimate":
      return "Thanks — I'll show you how that stacks up in your area.";
    case "acres_planned":
      return "Noted — I'll remember that for your crop plan.";
    default:
      return "Confirmed — thanks!";
  }
}

function iconForDataType(dataType: string): string {
  switch (dataType) {
    case "basis": return "dollar-sign";
    case "elevator_price": return "building-2";
    case "input_price": return "shopping-cart";
    case "crop_condition": return "leaf";
    case "yield_estimate": return "bar-chart-3";
    case "seeding_progress": return "trending-up";
    case "harvest_progress": return "scissors";
    case "acres_planned": return "map";
    default: return "help-circle";
  }
}

export function VerificationPrompt({
  data,
  onConfirm,
  onDeny,
}: VerificationPromptProps) {
  const [responded, setResponded] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:bg-wheat-900/80">
      <div className="p-3.5">
        {/* Header */}
        <div className="flex items-center gap-2 text-xs font-semibold text-canola">
          <span>{headerText(data.dataType)}</span>
        </div>

        {/* Prompt text — Bushy voice */}
        <p className="mt-2 text-sm text-foreground">{promptText(data)}</p>

        {!responded ? (
          <div className="mt-3 space-y-2">
            {/* Confirm button */}
            <button
              type="button"
              onClick={() => {
                setResponded(true);
                onConfirm();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-prairie/12 px-4 py-3 text-sm font-medium text-prairie transition-all active:scale-[0.97]"
            >
              <CheckCircle2 className="h-4 w-4" />
              {data.confirmLabel}
            </button>

            {/* Deny button */}
            <button
              type="button"
              onClick={() => {
                setResponded(true);
                onDeny();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-wheat-200/40 px-4 py-3 text-sm text-muted-foreground transition-all active:scale-[0.97] dark:bg-wheat-700/30"
            >
              <SmilePlus className="h-4 w-4" />
              {data.denyLabel}
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-prairie" />
            <span>{confirmedMessage(data.dataType)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
