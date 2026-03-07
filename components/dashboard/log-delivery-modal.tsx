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

export function LogDeliveryModal({ grain, isOpen, onClose }: LogDeliveryModalProps) {
  const [pending, setPending] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(formData: FormData) {
    setPending(true);
    formData.set("grain", grain);
    try {
      await logDelivery(formData);
      onClose();
    } catch (err) {
      console.error("Failed to log delivery:", err);
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
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={new Date().toISOString().split("T")[0]}
            />
          </div>
          <div>
            <Label htmlFor="amount_kt">Amount (Ktonnes)</Label>
            <Input
              id="amount_kt"
              name="amount_kt"
              type="number"
              step="0.001"
              min="0"
              required
              placeholder="e.g. 0.5"
            />
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
