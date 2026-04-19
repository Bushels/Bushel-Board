import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

// Server-side notification endpoint for Buperac trial signups.
//
// Flow: browser submits trial-form → RPC saves the row in Postgres →
// browser then hits this route with the same payload → we format an email
// and send via Resend to TRIAL_NOTIFY_TO. The email is best-effort: a
// delivery failure MUST NOT affect the user's success UI, because the
// signup is already persisted in the database.
//
// Security notes:
// - RESEND_API_KEY never leaves the server. Browser calls this route with
//   just the form payload; no credentials are exposed in the client bundle.
// - We re-validate with Zod here (not just the client) so someone hitting
//   this route directly with junk can't trigger email spam.
// - There is no rate limiting here yet. If that becomes a concern, add it
//   either via a Postgres rate-limit table or Vercel edge middleware.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  name: z.string().min(1).max(160),
  farm_name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(60).optional().default(""),
  province_state: z.string().max(80),
  rm_county: z.string().max(160).optional().default(""),
  crops: z.array(z.string().max(80)).max(32),
  crops_other: z.string().max(160).optional().default(""),
  acres: z.coerce.number().int().min(1).max(9_999_999),
  logistics_method: z.enum(["pickup_fob_calgary", "ship"]),
  delivery_street: z.string().max(240).optional().default(""),
  delivery_city: z.string().max(160).optional().default(""),
  delivery_postal: z.string().max(40).optional().default(""),
  new_total: z.coerce.number().int().min(0).optional(),
});

const PRICE_PER_ACRE_CENTS = 280;

function money(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;vertical-align:top;color:#6b5a3a;font-size:13px;text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;vertical-align:top;color:#2a261e;font-size:15px;">${value || "<span style='color:#a0907a'>—</span>"}</td>
  </tr>`;
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.TRIAL_NOTIFY_TO;

  if (!apiKey || !to) {
    console.error("[trial-notify] missing RESEND_API_KEY or TRIAL_NOTIFY_TO");
    return NextResponse.json(
      { ok: false, error: "Email is not configured on this server." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const p = parsed.data;
  const subtotal = money(p.acres * PRICE_PER_ACRE_CENTS);
  const cropsList = [
    ...p.crops.filter((c) => c !== "Other"),
    p.crops.includes("Other") && p.crops_other ? `Other: ${p.crops_other}` : null,
  ]
    .filter((x): x is string => !!x)
    .join(", ");

  const logisticsLabel =
    p.logistics_method === "pickup_fob_calgary" ? "Pickup — FOB Calgary" : "Ship to farm";

  const shippingBlock =
    p.logistics_method === "ship"
      ? [p.delivery_street, p.delivery_city, p.delivery_postal]
          .filter((x) => x && x.trim().length > 0)
          .map((x) => escapeHtml(x))
          .join("<br />")
      : "";

  const subject = `New trial signup — ${p.name} (${p.acres} ac, ${p.province_state})`;

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4ecd7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2a261e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4ecd7;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fbf5e4;border-radius:8px;box-shadow:0 4px 16px rgba(40,30,10,0.12);overflow:hidden;">
          <tr>
            <td style="padding:22px 28px 10px 28px;border-bottom:2px dashed #d4bf8a;">
              <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8a7449;">Bushel Board · 2026 Buperac Trial</div>
              <h1 style="margin:6px 0 0;font-size:22px;color:#2a261e;">New Trial Signup</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 6px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${renderRow("Name", escapeHtml(p.name))}
                ${renderRow("Farm", escapeHtml(p.farm_name))}
                ${renderRow("Email", `<a href="mailto:${escapeHtml(p.email)}" style="color:#8a5a18;text-decoration:none;">${escapeHtml(p.email)}</a>`)}
                ${renderRow("Phone", p.phone ? `<a href="tel:${escapeHtml(p.phone)}" style="color:#8a5a18;text-decoration:none;">${escapeHtml(p.phone)}</a>` : "")}
                ${renderRow("Location", [p.province_state, p.rm_county].filter(Boolean).map(escapeHtml).join(" · "))}
                ${renderRow("Crops", escapeHtml(cropsList))}
                ${renderRow("Acres", `<strong>${p.acres.toLocaleString()}</strong>`)}
                ${renderRow("Cost @ $2.80/ac", `<strong>${subtotal}</strong>`)}
                ${renderRow("Logistics", escapeHtml(logisticsLabel))}
                ${p.logistics_method === "ship" ? renderRow("Ship to", shippingBlock) : ""}
                ${typeof p.new_total === "number" ? renderRow("Total enrolled", `${p.new_total.toLocaleString()} ac`) : ""}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 22px 28px;border-top:1px dashed #d4bf8a;color:#8a7449;font-size:12px;">
              Submitted ${new Date().toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" })} (America/Edmonton).<br />
              Reply directly to this email to reach the farmer — the signup's email address is set as the reply-to.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const plain = [
    `New trial signup — ${p.name}`,
    ``,
    `Farm:       ${p.farm_name}`,
    `Email:      ${p.email}`,
    `Phone:      ${p.phone || "—"}`,
    `Location:   ${[p.province_state, p.rm_county].filter(Boolean).join(" · ")}`,
    `Crops:      ${cropsList}`,
    `Acres:      ${p.acres}`,
    `Cost:       ${subtotal} @ $2.80/ac`,
    `Logistics:  ${logisticsLabel}`,
    p.logistics_method === "ship"
      ? `Ship to:   ${[p.delivery_street, p.delivery_city, p.delivery_postal].filter(Boolean).join(", ")}`
      : null,
    typeof p.new_total === "number" ? `Enrolled:   ${p.new_total} ac (running total)` : null,
  ]
    .filter((x): x is string => !!x)
    .join("\n");

  try {
    const resend = new Resend(apiKey);
    // Using Resend's shared sender (onboarding@resend.dev) works out-of-the-box
    // without domain verification, but can only send to the email address tied
    // to the Resend account. Swap to your verified domain once set up.
    const from = process.env.TRIAL_NOTIFY_FROM || "Bushel Board <onboarding@resend.dev>";

    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: p.email,
      subject,
      html,
      text: plain,
    });

    if (error) {
      console.error("[trial-notify] resend error:", error);
      return NextResponse.json({ ok: false, error: error.message ?? "Send failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (err) {
    console.error("[trial-notify] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "Unexpected send failure" }, { status: 500 });
  }
}
