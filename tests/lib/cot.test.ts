import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

import { getCotPositioning } from "@/lib/queries/cot";

function createCotQuery({
  data,
  error = null,
}: {
  data: Array<Record<string, unknown>> | null;
  error?: { message: string } | null;
}) {
  const query = {
    data,
    error,
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    lte: vi.fn(() => query),
  };

  return query;
}

function createCotRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    report_date: "2026-03-10",
    commodity: "WHEAT-HRSpring",
    exchange: "MIAX",
    mapping_type: "primary",
    open_interest: 70000,
    change_open_interest: 1200,
    managed_money_long: 23000,
    managed_money_short: 7000,
    change_managed_money_long: 3500,
    change_managed_money_short: -2200,
    prod_merc_long: 28000,
    prod_merc_short: 46500,
    change_prod_merc_long: -500,
    change_prod_merc_short: 1400,
    grain_week: 32,
    ...overrides,
  };
}

describe("getCotPositioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caps the query to the latest imported grain week when provided", async () => {
    const query = createCotQuery({
      data: [createCotRow({ grain_week: 31 })],
    });

    mockCreateClient.mockResolvedValue({
      from: vi.fn(() => query),
    });

    const result = await getCotPositioning("Wheat", "2025-2026", 8, 31);

    expect(query.lte).toHaveBeenCalledWith("grain_week", 31);
    expect(result.latest?.grain_week).toBe(31);
  });

  it("returns an empty positioning result when no COT rows exist for the grain", async () => {
    const query = createCotQuery({ data: [] });

    mockCreateClient.mockResolvedValue({
      from: vi.fn(() => query),
    });

    const result = await getCotPositioning("Peas", "2025-2026");

    expect(result.latest).toBeNull();
    expect(result.positions).toEqual([]);
  });

  it("throws when the Supabase query fails so safeQuery can surface the outage", async () => {
    const query = createCotQuery({
      data: null,
      error: { message: "db unavailable" },
    });

    mockCreateClient.mockResolvedValue({
      from: vi.fn(() => query),
    });

    await expect(getCotPositioning("Wheat", "2025-2026")).rejects.toThrow(
      "Failed to load COT positioning for Wheat: db unavailable"
    );
  });
});
