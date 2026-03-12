import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateClient,
  mockConsumeRateLimit,
  mockGetAuthenticatedUserContext,
  mockRevalidatePath,
  mockSubmitSentimentVote,
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockConsumeRateLimit: vi.fn(),
  mockGetAuthenticatedUserContext: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSubmitSentimentVote: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/auth/role-guard", () => ({
  getAuthenticatedUserContext: mockGetAuthenticatedUserContext,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: mockConsumeRateLimit,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/queries/sentiment", () => ({
  submitSentimentVote: mockSubmitSentimentVote,
}));

import { addCropPlan, logDelivery } from "@/app/(dashboard)/my-farm/actions";
import { voteSentiment } from "@/app/(dashboard)/grain/[slug]/actions";
import { voteSignalRelevance } from "@/app/(dashboard)/grain/[slug]/signal-actions";

function makeFormData(entries: Record<string, string>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }

  return formData;
}

function createCropPlanLookup(plan: { id: string } | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({ data: plan, error: null }),
  };

  return query;
}

function createCropPlanUpsertQuery(existingPlan: { deliveries?: { amount_kt?: number }[] } | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data: existingPlan, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };

  return query;
}

describe("server action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({ from: vi.fn() });
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 0,
    });
  });

  it("rejects observer crop plan writes", async () => {
    const from = vi.fn();
    mockCreateClient.mockResolvedValue({ from });
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: { id: "user-1" },
      role: "observer",
    });

    const result = await addCropPlan(
      makeFormData({
        grain: "Wheat",
        acres: "1200",
        starting: "3000",
        volume: "2500",
        contracted: "500",
      })
    );

    expect(result).toEqual({
      error: "Observer accounts cannot edit crop plans",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects observer delivery writes", async () => {
    const from = vi.fn();
    mockCreateClient.mockResolvedValue({ from });
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: { id: "user-1" },
      role: "observer",
    });

    const result = await logDelivery(
      makeFormData({
        grain: "Wheat",
        submission_id: "11111111-1111-4111-8111-111111111111",
        amount_kt: "0.5",
        date: "2026-01-15",
        marketing_type: "open",
      })
    );

    expect(result).toEqual({
      error: "Observer accounts cannot log deliveries",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects observer sentiment votes", async () => {
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: { id: "user-1" },
      role: "observer",
    });

    const result = await voteSentiment("Wheat", 4, 30);

    expect(result).toEqual({
      error: "Observer accounts cannot submit sentiment votes",
    });
    expect(mockSubmitSentimentVote).not.toHaveBeenCalled();
  });

  it("rejects observer signal relevance votes", async () => {
    const from = vi.fn();
    mockCreateClient.mockResolvedValue({ from });
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: { id: "user-1" },
      role: "observer",
    });

    const result = await voteSignalRelevance(
      "11111111-1111-4111-8111-111111111111",
      true,
      "Wheat",
      "2025-2026",
      30
    );

    expect(result).toEqual({
      error: "Observer accounts cannot vote on signal relevance",
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("addCropPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: { id: "user-1" },
      role: "farmer",
    });
  });

  it("converts bushel-based crop plans into canonical kt and stores the user's unit preference", async () => {
    const cropPlansQuery = createCropPlanUpsertQuery(null);
    const from = vi.fn((table: string) => {
      if (table === "crop_plans") return cropPlansQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    mockCreateClient.mockResolvedValue({ from });

    const result = await addCropPlan(
      makeFormData({
        grain: "Canola",
        acres: "1500",
        starting: "2000",
        volume: "1200",
        contracted: "300",
        inventory_unit: "bushels",
        bushel_weight_lbs: "50",
      })
    );

    expect(result).toEqual({ success: true });
    expect(cropPlansQuery.upsert).toHaveBeenCalledTimes(1);

    const [payload, options] = cropPlansQuery.upsert.mock.calls[0];
    expect(payload.user_id).toBe("user-1");
    expect(payload.crop_year).toBe("2025-2026");
    expect(payload.grain).toBe("Canola");
    expect(payload.acres_seeded).toBe(1500);
    expect(payload.inventory_unit_preference).toBe("bushels");
    expect(payload.bushel_weight_lbs).toBe(50);
    expect(Number(payload.starting_grain_kt)).toBeCloseTo(0.045359237, 9);
    expect(Number(payload.volume_left_to_sell_kt)).toBeCloseTo(0.0272155422, 9);
    expect(Number(payload.contracted_kt)).toBeCloseTo(0.00680388555, 9);
    expect(Number(payload.uncontracted_kt)).toBeCloseTo(0.02041165665, 9);
    expect(options).toEqual({
      onConflict: "user_id,crop_year,grain",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/my-farm");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/overview");
  });
});

describe("logDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: { id: "user-1" },
      role: "farmer",
    });
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 10,
      retryAfterSeconds: 0,
    });
  });

  it("writes to the append-only delivery ledger", async () => {
    const cropPlansQuery = createCropPlanLookup({
      id: "plan-1",
      volume_left_to_sell_kt: 3,
      contracted_kt: 2,
      uncontracted_kt: 1,
    });
    const deliveryInsert = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    const from = vi.fn((table: string) => {
      if (table === "crop_plans") return cropPlansQuery;
      if (table === "crop_plan_deliveries") return deliveryInsert;
      throw new Error(`Unexpected table: ${table}`);
    });

    mockCreateClient.mockResolvedValue({ from });

    const result = await logDelivery(
      makeFormData({
        grain: "Canola",
        submission_id: "22222222-2222-4222-8222-222222222222",
        amount_kt: "1.25",
        date: "2026-02-01",
        destination: "Viterra Rosetown",
        marketing_type: "contracted",
      })
    );

    expect(result).toEqual({ success: true });
    expect(deliveryInsert.insert).toHaveBeenCalledWith({
      crop_plan_id: "plan-1",
      user_id: "user-1",
      crop_year: "2025-2026",
      grain: "Canola",
      submission_id: "22222222-2222-4222-8222-222222222222",
      delivery_date: "2026-02-01",
      amount_kt: 1.25,
      destination: "Viterra Rosetown",
      marketing_type: "contracted",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/my-farm");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/overview");
  });

  it("treats duplicate submission ids as idempotent success", async () => {
    const cropPlansQuery = createCropPlanLookup({
      id: "plan-1",
      volume_left_to_sell_kt: 3,
      contracted_kt: 0,
      uncontracted_kt: 3,
    });
    const deliveryInsert = {
      insert: vi.fn().mockResolvedValue({
        error: {
          code: "23505",
          message: "duplicate key value violates unique constraint",
        },
      }),
    };

    const from = vi.fn((table: string) => {
      if (table === "crop_plans") return cropPlansQuery;
      if (table === "crop_plan_deliveries") return deliveryInsert;
      throw new Error(`Unexpected table: ${table}`);
    });

    mockCreateClient.mockResolvedValue({ from });

    const result = await logDelivery(
      makeFormData({
        grain: "Canola",
        submission_id: "33333333-3333-4333-8333-333333333333",
        amount_kt: "1.25",
        date: "2026-02-01",
        marketing_type: "open",
      })
    );

    expect(result).toEqual({ success: true, duplicate: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/my-farm");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/overview");
  });

  it("returns a retry message when delivery logging is rate limited", async () => {
    mockConsumeRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
      error: "You are logging deliveries too quickly. Try again in 45 seconds.",
    });

    const from = vi.fn();
    mockCreateClient.mockResolvedValue({ from });

    const result = await logDelivery(
      makeFormData({
        grain: "Canola",
        submission_id: "44444444-4444-4444-8444-444444444444",
        amount_kt: "1.25",
        date: "2026-02-01",
        marketing_type: "open",
      })
    );

    expect(result).toEqual({
      error: "You are logging deliveries too quickly. Try again in 45 seconds.",
      rateLimited: true,
      retryAfterSeconds: 45,
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("rate limited voting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: { id: "user-1" },
      role: "farmer",
    });
    mockCreateClient.mockResolvedValue({ from: vi.fn() });
  });

  it("returns a retry message when sentiment voting is rate limited", async () => {
    mockConsumeRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 30,
      error: "You are voting on sentiment too quickly. Try again in 30 seconds.",
    });

    const result = await voteSentiment("Wheat", 4, 30);

    expect(result).toEqual({
      error: "You are voting on sentiment too quickly. Try again in 30 seconds.",
      rateLimited: true,
      retryAfterSeconds: 30,
    });
    expect(mockSubmitSentimentVote).not.toHaveBeenCalled();
  });

  it("returns a retry message when signal voting is rate limited", async () => {
    mockConsumeRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 120,
      error: "You are rating signals too quickly. Try again in 2 minutes.",
    });

    const result = await voteSignalRelevance(
      "11111111-1111-4111-8111-111111111111",
      true,
      "Wheat",
      "2025-2026",
      30
    );

    expect(result).toEqual({
      error: "You are rating signals too quickly. Try again in 2 minutes.",
      rateLimited: true,
      retryAfterSeconds: 120,
    });
  });
});
