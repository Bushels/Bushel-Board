import { describe, expect, it } from "vitest";

import {
  buildSnapshotSourceRecords,
  type ApprovedForecastSourceRow,
} from "../forecast-experiments/source-records";

const options = {
  as_of_date: "2026-08-07",
  source_cutoff_at: "2026-08-07T14:30:00-06:00",
  snapshot_mode: "strict_artifact_mode" as const,
};

const validCgcRow = (): ApprovedForecastSourceRow => ({
  source_key: "cgc_weekly",
  record_type: "fact",
  observed_period: "2026-2027 week 1 ending 2026-08-02",
  published_at: "2026-08-06T13:00:00-06:00",
  available_at: "2026-08-06T13:05:00-06:00",
  imported_at: "2026-08-06T13:10:00-06:00",
  payload: {
    worksheet: "Primary",
    metric: "Deliveries",
    grain: "Canola",
    region: "Saskatchewan",
    grade: "",
    unit: "Ktonnes",
    value: 123.4,
    week_ending_date: "2026-08-02",
  },
});

const validPriceRow = (): ApprovedForecastSourceRow => ({
  source_key: "grain_prices",
  record_type: "fact",
  observed_period: "2026-08-06 RSK26 settlement",
  published_at: "2026-08-06T14:05:00-06:00",
  available_at: "2026-08-06T14:10:00-06:00",
  imported_at: "2026-08-06T14:15:00-06:00",
  payload: {
    grain: "Canola",
    contract_code: "RSK26",
    contract_mapping_trusted: true,
    price_date: "2026-08-06",
    settlement_at: "2026-08-06T14:00:00-06:00",
    market_closed_at: "2026-08-06T14:00:00-06:00",
    settlement_cad: 729.3,
  },
});

describe("forecast experiment source records", () => {
  it("converts approved source rows into snapshot source records", () => {
    const records = buildSnapshotSourceRecords([validCgcRow()], options);

    expect(records).toEqual([
      {
        source_key: "cgc_weekly",
        record_type: "fact",
        observed_period: "2026-2027 week 1 ending 2026-08-02",
        published_at: "2026-08-06T13:00:00-06:00",
        available_at: "2026-08-06T13:05:00-06:00",
        payload: validCgcRow().payload,
      },
    ]);
  });

  it("rejects missing available_at instead of using week-ending or observed-period dates", () => {
    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validCgcRow(),
            available_at: undefined,
          },
        ],
        options,
      ),
    ).toThrow(/available_at.*required/i);
  });

  it("rejects future available_at and future published_at clocks", () => {
    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validCgcRow(),
            available_at: "2026-08-07T14:31:00-06:00",
          },
        ],
        options,
      ),
    ).toThrow(/available_at.*after source_cutoff_at/i);

    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validCgcRow(),
            published_at: "2026-08-07T14:31:00-06:00",
          },
        ],
        options,
      ),
    ).toThrow(/published_at.*after source_cutoff_at/i);
  });

  it("accepts a source cutoff whose UTC calendar date matches the as-of date", () => {
    const records = buildSnapshotSourceRecords(
      [
        {
          ...validCgcRow(),
          observed_period: "2026-2027 week 1 ending 2026-08-02",
          published_at: "2026-08-07T10:00:00Z",
          available_at: "2026-08-07T10:05:00Z",
          imported_at: "2026-08-07T10:06:00Z",
        },
      ],
      {
        ...options,
        source_cutoff_at: "2026-08-08T02:30:00+08:00",
      },
    );

    expect(records).toHaveLength(1);
  });

  it("rejects mutable source rows updated or imported after the cutoff", () => {
    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validCgcRow(),
            updated_at: "2026-08-07T14:31:00-06:00",
          },
        ],
        options,
      ),
    ).toThrow(/updated_at.*after source_cutoff_at/i);

    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validCgcRow(),
            imported_at: "2026-08-07T14:31:00-06:00",
          },
        ],
        options,
      ),
    ).toThrow(/imported_at.*after source_cutoff_at/i);
  });

  it("rejects mutable source rows that omit an ingestion or update clock", () => {
    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validCgcRow(),
            updated_at: undefined,
            imported_at: undefined,
            created_at: undefined,
          },
        ],
        options,
      ),
    ).toThrow(/revision_risk.*ingestion or update clock/i);
  });

  it("rejects observed periods and week-ending dates after the as-of date", () => {
    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validCgcRow(),
            observed_period: "2026-2027 week 2 ending 2026-08-08",
            payload: {
              ...validCgcRow().payload,
              week_ending_date: "2026-08-08",
            },
          },
        ],
        options,
      ),
    ).toThrow(/observed_period.*after as_of_date/i);
  });

  it("rejects timezone-less source clocks", () => {
    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validCgcRow(),
            available_at: "2026-08-06T13:05:00",
          },
        ],
        options,
      ),
    ).toThrow(/available_at.*timezone offset/i);
  });

  it("rejects grain price records whose settlement clock is after the cutoff", () => {
    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            ...validPriceRow(),
            payload: {
              ...validPriceRow().payload,
              settlement_at: "2026-08-07T14:31:00-06:00",
            },
          },
        ],
        options,
      ),
    ).toThrow(/settlement_at.*after source_cutoff_at/i);
  });

  it("turns same-day price rows without proven market close into warnings", () => {
    const records = buildSnapshotSourceRecords(
      [
        {
          ...validPriceRow(),
          observed_period: "2026-08-07 RSK26 settlement",
          published_at: "2026-08-07T10:00:00-06:00",
          available_at: "2026-08-07T10:05:00-06:00",
          payload: {
            ...validPriceRow().payload,
            price_date: "2026-08-07",
            settlement_at: "2026-08-07T10:00:00-06:00",
            market_closed_at: undefined,
          },
        },
      ],
      options,
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.record_type).toBe("warning");
    expect(records[0]?.payload.code).toBe("market_close_unproven");
  });

  it("turns untrusted contract mapping into a warning instead of a clean price fact", () => {
    const records = buildSnapshotSourceRecords(
      [
        {
          ...validPriceRow(),
          payload: {
            ...validPriceRow().payload,
            contract_mapping_trusted: false,
          },
        },
      ],
      options,
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.record_type).toBe("warning");
    expect(records[0]?.payload.code).toBe("untrusted_contract_mapping");
  });

  it("blocks current-state canola market reads unless cutoff support is explicit", () => {
    expect(() =>
      buildSnapshotSourceRecords(
        [
          {
            source_key: "canola_market_read",
            record_type: "interpretation",
            observed_period: "current market read",
            published_at: "2026-08-07T09:00:00-06:00",
            available_at: "2026-08-07T09:01:00-06:00",
            payload: {
              headline: "Current read without cutoff enforcement",
            },
          },
        ],
        options,
      ),
    ).toThrow(/canola_market_read.*source_cutoff_at/i);
  });

  it("allows current-state canola market reads as revision warnings in replay mode", () => {
    const records = buildSnapshotSourceRecords(
      [
        {
          source_key: "canola_market_read",
          record_type: "interpretation",
          observed_period: "current market read",
          published_at: "2026-08-07T09:00:00-06:00",
          available_at: "2026-08-07T09:01:00-06:00",
          payload: {
            headline: "Current read without cutoff enforcement",
          },
        },
      ],
      {
        ...options,
        snapshot_mode: "current_table_replay_mode",
      },
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.record_type).toBe("warning");
    expect(records[0]?.payload.code).toBe("current_state_without_cutoff");
  });
});
