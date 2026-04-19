"use client";

import { useMemo, useState, useTransition, type RefObject } from "react";
import { submitTrialSignupClient } from "./trial-client";
import { trackEvent } from "@/components/analytics/google-analytics";
import type { TrialOdometerHandle } from "./trial-odometer";

const CROPS = [
  "Canola", "Spring Wheat", "Durum", "Barley",
  "Oats", "Field Peas", "Lentils", "Soybeans",
  "Corn", "Flax", "Hay / Forage", "Other",
];

const PRICE_PER_ACRE_CENTS = 280;
const moneyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

interface Props {
  odometerRef: RefObject<TrialOdometerHandle | null>;
}

export function TrialForm({ odometerRef }: Props) {
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [acres, setAcres] = useState<string>("");
  const [logistics, setLogistics] = useState<"" | "pickup_fob_calgary" | "ship">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const acresNum = Number.parseInt(acres, 10);
  const acresSubtotalText = useMemo(() => {
    if (!acresNum || acresNum < 1) return "—";
    return moneyFormatter.format((acresNum * PRICE_PER_ACRE_CENTS) / 100);
  }, [acresNum]);

  function toggleCrop(c: string) {
    setSelectedCrops((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);

    const payload = {
      name: (data.get("name") || "").toString().trim(),
      farm_name: (data.get("farm") || "").toString().trim(),
      email: (data.get("email") || "").toString().trim(),
      phone: (data.get("phone") || "").toString().trim(),
      province_state: (data.get("region") || "").toString().trim(),
      rm_county: (data.get("rm") || "").toString().trim(),
      crops: selectedCrops,
      crops_other: (data.get("other_crop") || "").toString().trim(),
      acres: acresNum,
      logistics_method: logistics,
      delivery_street: (data.get("delivery_street") || "").toString().trim(),
      delivery_city: (data.get("delivery_city") || "").toString().trim(),
      delivery_postal: (data.get("delivery_postal") || "").toString().trim(),
    };

    startTransition(async () => {
      const result = await submitTrialSignupClient(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      trackEvent("trial_signup", {
        acres: payload.acres,
        logistics_method: payload.logistics_method,
        crops: payload.crops.join(","),
        province_state: payload.province_state,
      });
      setSuccess(true);
      odometerRef.current?.rollTo(result.newTotal);

      // Fire-and-forget notification email. The signup is already persisted
      // in Postgres at this point, so any email failure is non-fatal — we
      // deliberately swallow the rejection so the user's APPROVED state
      // never flickers. Errors are surfaced in the server log.
      void fetch("/api/trial-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, new_total: result.newTotal }),
        keepalive: true,
      }).catch((err) => {
        console.warn("[trial-form] notification email failed:", err);
      });
      const el = document.getElementById("trial-odometer-anchor");
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }
    });
  }

  if (success) {
    return (
      <div className="form-success">
        <div className="stamp-approved">APPROVED</div>
        <p className="big-hand">Thanks — you're on the list.</p>
        <p className="sub-hand">
          We'll be in touch within 48 hours. Your acres just rolled onto the counter up top. ↑
        </p>
      </div>
    );
  }

  const otherChecked = selectedCrops.includes("Other");
  const isShip = logistics === "ship";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="row two">
        <label className="field">
          <span className="lbl">Name</span>
          <input type="text" name="name" required autoComplete="name" />
          <span className="pencil-underline" />
        </label>
        <label className="field">
          <span className="lbl">Farm name</span>
          <input type="text" name="farm" required />
          <span className="pencil-underline" />
        </label>
      </div>

      <div className="row two">
        <label className="field">
          <span className="lbl">Email</span>
          <input type="email" name="email" required autoComplete="email" />
          <span className="pencil-underline" />
        </label>
        <label className="field">
          <span className="lbl">Phone</span>
          <input type="tel" name="phone" autoComplete="tel" />
          <span className="pencil-underline" />
        </label>
      </div>

      <div className="row two">
        <label className="field">
          <span className="lbl">Province / State</span>
          <select name="region" required defaultValue="">
            <option value="" disabled>— select —</option>
            <optgroup label="Canada">
              <option>AB — Alberta</option>
              <option>SK — Saskatchewan</option>
              <option>MB — Manitoba</option>
              <option>ON — Ontario</option>
              <option>QC — Québec</option>
              <option>BC — British Columbia</option>
              <option>NS — Nova Scotia</option>
              <option>NB — New Brunswick</option>
              <option>PE — Prince Edward Island</option>
              <option>NL — Newfoundland & Labrador</option>
              <option>YT — Yukon</option>
              <option>NT — Northwest Territories</option>
              <option>NU — Nunavut</option>
            </optgroup>
            <optgroup label="United States">
              {US_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </optgroup>
          </select>
          <span className="pencil-underline" />
        </label>
        <label className="field">
          <span className="lbl">RM or County</span>
          <input type="text" name="rm" />
          <span className="pencil-underline" />
        </label>
      </div>

      <fieldset className="crops">
        <legend className="lbl">
          Primary crops <span className="lbl-aside">(tick all that apply)</span>
        </legend>
        <div className="crop-grid">
          {CROPS.map((c) => (
            <label key={c} className="crop">
              <input
                type="checkbox"
                value={c}
                checked={selectedCrops.includes(c)}
                onChange={() => toggleCrop(c)}
              />
              <span className="crop-box" aria-hidden="true" />
              <span className="crop-text">{c}</span>
            </label>
          ))}
        </div>
        {otherChecked && (
          <label className="field other-field">
            <span className="lbl">What else?</span>
            <input type="text" name="other_crop" />
            <span className="pencil-underline" />
          </label>
        )}
      </fieldset>

      <div className="row one">
        <label className="field acres-field">
          <span className="lbl">Approx. acres you&apos;d trial on</span>
          <input
            type="number"
            name="acres"
            min={1}
            step={1}
            placeholder="e.g. 40"
            value={acres}
            onChange={(e) => setAcres(e.target.value)}
          />
          <span className="pencil-underline" />
        </label>
      </div>
      <p className="acres-subtotal">
        At $2.80/ac, your trial cost works out to <strong>{acresSubtotalText}</strong>.
        Order any volume you like — we&apos;ll confirm in follow-up.
      </p>

      <fieldset className="crops" style={{ marginTop: 22 }}>
        <legend className="lbl">How would you like to receive your product?</legend>
        <div className="logistics-choice">
          <label className="logistics-opt">
            <input
              type="radio"
              name="logistics"
              value="pickup_fob_calgary"
              checked={logistics === "pickup_fob_calgary"}
              onChange={() => setLogistics("pickup_fob_calgary")}
              required
            />
            <span>Pickup FOB Calgary</span>
          </label>
          <label className="logistics-opt">
            <input
              type="radio"
              name="logistics"
              value="ship"
              checked={logistics === "ship"}
              onChange={() => setLogistics("ship")}
              required
            />
            <span>Ship to me</span>
          </label>
        </div>
        {isShip && (
          <div className="ship-block">
            <label className="field">
              <span className="lbl">Delivery street address</span>
              <input type="text" name="delivery_street" autoComplete="street-address" required />
              <span className="pencil-underline" />
            </label>
            <div className="row two">
              <label className="field">
                <span className="lbl">City / Town</span>
                <input type="text" name="delivery_city" autoComplete="address-level2" required />
                <span className="pencil-underline" />
              </label>
              <label className="field">
                <span className="lbl">Postal code</span>
                <input type="text" name="delivery_postal" autoComplete="postal-code" required />
                <span className="pencil-underline" />
              </label>
            </div>
          </div>
        )}
      </fieldset>

      <div className="submit-row">
        <button type="submit" className="rubber-stamp" disabled={isPending}>
          <span className="rs-inner">
            <span className="rs-l1">{isPending ? "Stamping..." : "Sign Me"}</span>
            <span className="rs-l2">Up</span>
            <span className="rs-arc">▲ 2026 TRIAL ▲</span>
          </span>
        </button>
        <p className="microcopy">
          Limited trial spots for 2026.
          <br />We&apos;ll reach out within 48 hours.
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

const US_STATES = [
  "AL — Alabama", "AK — Alaska", "AZ — Arizona", "AR — Arkansas", "CA — California",
  "CO — Colorado", "CT — Connecticut", "DE — Delaware", "FL — Florida", "GA — Georgia",
  "HI — Hawaii", "ID — Idaho", "IL — Illinois", "IN — Indiana", "IA — Iowa",
  "KS — Kansas", "KY — Kentucky", "LA — Louisiana", "ME — Maine", "MD — Maryland",
  "MA — Massachusetts", "MI — Michigan", "MN — Minnesota", "MS — Mississippi", "MO — Missouri",
  "MT — Montana", "NE — Nebraska", "NV — Nevada", "NH — New Hampshire", "NJ — New Jersey",
  "NM — New Mexico", "NY — New York", "NC — North Carolina", "ND — North Dakota", "OH — Ohio",
  "OK — Oklahoma", "OR — Oregon", "PA — Pennsylvania", "RI — Rhode Island", "SC — South Carolina",
  "SD — South Dakota", "TN — Tennessee", "TX — Texas", "UT — Utah", "VT — Vermont",
  "VA — Virginia", "WA — Washington", "WV — West Virginia", "WI — Wisconsin", "WY — Wyoming",
];
