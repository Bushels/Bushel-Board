"use client";

import { useState } from "react";
import { logDelivery } from "@/app/(dashboard)/my-farm/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LogDeliveryModalProps {
  grain: string;
  isOpen: boolean;
  onClose: () => void;
}

const UNIT_TO_TONNES: Record<string, number> = {
  tonnes: 1,
  kg: 0.001,
  lbs: 0.000453592,
};

function createSubmissionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const segment = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${segment()}${segment()}-${segment()}-4${segment().slice(1)}-8${segment().slice(1)}-${segment()}${segment()}${segment()}`;
}

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function LogDeliveryModal({ grain, isOpen, onClose }: LogDeliveryModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<"tonnes" | "kg" | "lbs">("tonnes");
  const [submissionId] = useState(createSubmissionId);

  if (!isOpen) return null;

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    formData.set("grain", grain);
    // Convert user input to kt for storage
    const rawAmount = Number(formData.get("amount_raw") || 0);
    const tonnes = rawAmount * UNIT_TO_TONNES[unit];
    const kt = tonnes / 1000;
    formData.set("amount_kt", String(kt));
    formData.delete("amount_raw");
    try {
      const result = await logDelivery(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onClose();
    } catch (err) {
      console.error("Failed to log delivery:", err);
      setError("Delivery logging is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-display font-semibold mb-4">
          Log Delivery — {grain}
        </h3>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="submission_id" value={submissionId} />
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={todayLocal()}
            />
          </div>
          <div>
            <Label htmlFor="amount_raw">Amount</Label>
            <div className="flex gap-2">
              <Input
                id="amount_raw"
                name="amount_raw"
                type="number"
                step="any"
                min="0"
                required
                placeholder={unit === "tonnes" ? "e.g. 30" : unit === "kg" ? "e.g. 30000" : "e.g. 66000"}
                className="flex-1"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as "tonnes" | "kg" | "lbs")}
                className="rounded-md border bg-card px-3 py-2 text-sm"
              >
                <option value="tonnes">tonnes</option>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="destination">Destination (optional)</Label>
            <Input
              id="destination"
              name="destination"
              type="text"
              placeholder="e.g. Viterra Rosetown"
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Logging..." : "Log Delivery"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
