"use client";

import { useEffect, useState } from "react";
import { logDelivery } from "@/app/(dashboard)/my-farm/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { convertToMetricTonnes } from "@/lib/utils/grain-units";

interface LogDeliveryModalProps {
  grain: string;
  bushelWeightLbs: number;
  contractedKt: number;
  openKt: number;
  remainingKt: number;
  isOpen: boolean;
  onClose: () => void;
}

const UNIT_TO_TONNES: Record<"tonnes" | "kg" | "lbs", number> = {
  tonnes: 1,
  kg: 0.001,
  lbs: 0.000453592,
};

type DeliveryUnit = "tonnes" | "kg" | "lbs" | "bushels";

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

function formatTonnes(kt: number): string {
  return (kt * 1000).toLocaleString("en-CA", { maximumFractionDigits: 0 });
}

export function LogDeliveryModal({
  grain,
  bushelWeightLbs,
  contractedKt,
  openKt,
  remainingKt,
  isOpen,
  onClose,
}: LogDeliveryModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<DeliveryUnit>("tonnes");
  const [deliveryBushelWeightLbs, setDeliveryBushelWeightLbs] = useState(
    bushelWeightLbs
  );
  const [marketingType, setMarketingType] = useState<"contracted" | "open">(
    contractedKt > 0 ? "contracted" : "open"
  );
  const [submissionId] = useState(createSubmissionId);

  useEffect(() => {
    setMarketingType(contractedKt > 0 ? "contracted" : "open");
  }, [contractedKt, grain, isOpen]);

  useEffect(() => {
    setDeliveryBushelWeightLbs(bushelWeightLbs);
  }, [bushelWeightLbs, grain, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    formData.set("grain", grain);

    const rawAmount = Number(formData.get("amount_raw") || 0);
    if (unit === "bushels" && deliveryBushelWeightLbs <= 0) {
      setError("Bushel weight must be greater than 0 when logging bushels.");
      setPending(false);
      return;
    }

    const tonnes =
      unit === "bushels"
        ? convertToMetricTonnes(rawAmount, "bushels", deliveryBushelWeightLbs)
        : rawAmount * UNIT_TO_TONNES[unit];
    const kt = tonnes / 1000;
    formData.set("amount_kt", String(kt));
    formData.set("marketing_type", marketingType);
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
        <h3 className="mb-4 text-lg font-display font-semibold">
          Log Delivery - {grain}
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
                placeholder={
                  unit === "tonnes"
                    ? "e.g. 30"
                    : unit === "kg"
                      ? "e.g. 30000"
                      : unit === "bushels"
                        ? "e.g. 1102"
                      : "e.g. 66000"
                }
                className="flex-1"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as DeliveryUnit)}
                className="rounded-md border bg-card px-3 py-2 text-sm"
              >
                <option value="tonnes">tonnes</option>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
                <option value="bushels">bushels</option>
              </select>
            </div>
            {unit === "bushels" && (
              <div className="mt-2 space-y-2">
                <Label htmlFor="delivery-bushel-weight">Bushel Weight (lb/bu)</Label>
                <Input
                  id="delivery-bushel-weight"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={deliveryBushelWeightLbs}
                  onChange={(event) =>
                    setDeliveryBushelWeightLbs(Number(event.target.value || 0))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Used only to convert this load to metric tonnes before saving.
                </p>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="marketing_type">Sale Type</Label>
            <select
              id="marketing_type"
              value={marketingType}
              onChange={(e) => setMarketingType(e.target.value as "contracted" | "open")}
              className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
            >
              <option value="contracted" disabled={contractedKt <= 0}>
                Contracted load ({formatTonnes(contractedKt)} t remaining)
              </option>
              <option value="open" disabled={openKt <= 0}>
                Free market / open load ({formatTonnes(openKt)} t remaining)
              </option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Remaining position: {formatTonnes(remainingKt)} t left to sell.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Contracted loads are already priced into the market. Logging them moves tonnes
              from contracted to delivered without increasing your priced percentage.
            </p>
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

          <div className="flex justify-end gap-3">
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
