"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MapPin, Send, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

const FIELD_CONDITIONS = [
  {
    id: "normal",
    label: "Normal",
    description: "No unusual wetness or dryness",
    group: "normal",
  },
  {
    id: "too_wet",
    label: "Too wet",
    description: "Field is saturated or delayed",
    group: "wet",
  },
  {
    id: "standing_water",
    label: "Standing water",
    description: "Water visible in crop or low spots",
    group: "wet",
  },
  {
    id: "access_blocked",
    label: "Access blocked",
    description: "Roads or field access affected",
    group: "wet",
  },
  {
    id: "dry_topsoil",
    label: "Dry topsoil",
    description: "Topsoil is dry, hard, or cracking",
    group: "dry",
  },
  {
    id: "drought_stress",
    label: "Drought stress",
    description: "Crop rolling, wilting, or firing",
    group: "dry",
  },
] as const;

type FieldCondition = (typeof FIELD_CONDITIONS)[number]["id"];
type SubmitState = "idle" | "submitting" | "sent" | "error";

interface FloodWatchFeedbackProps {
  eventLabel: string;
  eventStart: string;
  eventEnd: string;
}

export function FloodWatchFeedback({ eventLabel, eventStart, eventEnd }: FloodWatchFeedbackProps) {
  const [condition, setCondition] = useState<FieldCondition>("too_wet");
  const [location, setLocation] = useState("");
  const [crop, setCrop] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<SubmitState>("idle");

  async function submitFieldCheck() {
    if (!location.trim() || state === "submitting") return;
    setState("submitting");

    try {
      const response = await fetch("/api/environmental/field-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          condition,
          location,
          crop,
          note,
          eventLabel,
          eventStart,
          eventEnd,
          website,
        }),
      });

      if (!response.ok) throw new Error("Field report was not saved.");

      setState("sent");
      setLocation("");
      setCrop("");
      setNote("");
      setWebsite("");
    } catch (error) {
      console.error("Flood watch feedback error:", error);
      setState("error");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/80 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-[#2f6f91]" />
            Field check
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Public wet and dry reports help calibrate the moisture watch against real field
            conditions. No sign-in required. Reports stay feedback-only until reviewed.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          <ShieldAlert className="h-3.5 w-3.5" />
          Not damage proof
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_CONDITIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setCondition(item.id);
              if (state !== "submitting") setState("idle");
            }}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors",
              condition === item.id
                ? "border-canola bg-canola/10 text-foreground"
                : "border-border bg-background/50 text-muted-foreground hover:border-canola/50 hover:text-foreground",
            )}
          >
            <span className="text-sm font-semibold">{item.label}</span>
            <span className="mt-1 block text-xs leading-5">{item.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,0.7fr)_minmax(0,1.25fr)_auto] md:items-end">
        <label className="space-y-1.5 text-sm font-medium">
          Location
          <input
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              if (state !== "submitting") setState("idle");
            }}
            placeholder="Nearest town, RM, county, or FSA"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-canola"
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Crop
          <input
            value={crop}
            onChange={(event) => {
              setCrop(event.target.value);
              if (state !== "submitting") setState("idle");
            }}
            placeholder="Optional"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-canola"
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Note
          <input
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              if (state !== "submitting") setState("idle");
            }}
            placeholder="Optional: acres, visible water, dry soil, crop stress"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-canola"
          />
        </label>
        <label className="sr-only" aria-hidden="true" tabIndex={-1}>
          Website
          <input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={submitFieldCheck}
          disabled={!location.trim() || state === "submitting"}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-canola px-4 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
        >
          {state === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </button>
      </div>

      {state === "sent" ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#2f7f72]">
          <CheckCircle2 className="h-4 w-4" />
          Public field report saved for review.
        </p>
      ) : null}
      {state === "error" ? (
        <p className="mt-3 text-sm text-destructive">Field report was not saved. Try again after refreshing.</p>
      ) : null}
    </div>
  );
}
