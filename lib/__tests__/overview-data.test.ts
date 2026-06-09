import { describe, expect, it } from "vitest"
import {
  buildGrainDeliveryBinRows,
  type GrainDeliveryBinRow,
  type HistoricalGrainStorageInput,
  type LatestCgcProducerDeliveryRow,
} from "@/lib/queries/overview-data"
import type { SupplyDisposition } from "@/lib/queries/supply-disposition"

function makeCgcRow(
  grain: string,
  cwDeliveriesKt: number,
  cyDeliveriesKt: number
): LatestCgcProducerDeliveryRow {
  return {
    grain,
    currentWeekDeliveriesKt: cwDeliveriesKt,
    cropYearDeliveriesKt: cyDeliveriesKt,
  }
}

function makeSupplyRow(
  grainSlug: string,
  productionKt: number,
  carryInKt: number
): SupplyDisposition {
  return {
    grain_slug: grainSlug,
    crop_year: "2025-2026",
    carry_in_kt: carryInKt,
    production_kt: productionKt,
    imports_kt: 0,
    total_supply_kt: productionKt + carryInKt,
    exports_kt: 0,
    food_industrial_kt: 0,
    feed_waste_kt: 0,
    seed_kt: null,
    total_domestic_kt: 0,
    carry_out_kt: 0,
    source: "AAFC",
    is_approximate: false,
  }
}

describe("buildGrainDeliveryBinRows", () => {
  it("uses production plus carry-in as the starting supply and keeps grain order canonical", () => {
    const rows = buildGrainDeliveryBinRows(
      [
        makeCgcRow("Canola", 6, 30),
        makeCgcRow("Wheat", 12, 40),
      ],
      [
        makeSupplyRow("canola", 175, 25),
        makeSupplyRow("wheat", 100, 20),
      ]
    )

    expect(rows[0].grain).toBe("Wheat")
    expect(rows[0].currentWeekDeliveriesKt).toBe(12)
    expect(rows[0].feedWasteKt).toBe(0)
    expect(rows[0].startingSupplyKt).toBe(120)
    expect(rows[0].deliveredFromStartingSupplyKt).toBe(40)
    expect(rows[0].remainingInBinKt).toBe(80)
    expect(rows[0].remainingPct).toBe(66.7)

    expect(rows[2].grain).toBe("Canola")
    expect(rows[2].currentWeekDeliveriesKt).toBe(6)
    expect(rows[2].startingSupplyKt).toBe(200)
    expect(rows[2].deliveredFromStartingSupplyKt).toBe(30)
    expect(rows[2].remainingInBinKt).toBe(170)
  })

  it("floors the remaining bin estimate at zero", () => {
    const rows: GrainDeliveryBinRow[] = buildGrainDeliveryBinRows(
      [makeCgcRow("Wheat", 20, 150)],
      [makeSupplyRow("wheat", 100, 10)]
    )

    expect(rows[0].remainingInBinKt).toBe(0)
    expect(rows[0].deliveredFromStartingSupplyKt).toBe(110)
    expect(rows[0].remainingPct).toBe(0)
  })

  it("adds same-week last-year storage benchmarks", () => {
    const historicalInputs: HistoricalGrainStorageInput[] = [
      {
        cropYear: "2024-2025",
        cgcRows: [makeCgcRow("Wheat", 10, 50)],
        supplyRows: [makeSupplyRow("wheat", 100, 0)],
      },
    ]

    const rows = buildGrainDeliveryBinRows(
      [makeCgcRow("Wheat", 20, 40)],
      [makeSupplyRow("wheat", 100, 0)],
      historicalInputs
    )

    expect(rows[0].remainingPct).toBe(60)
    expect(rows[0].lastYear?.cropYear).toBe("2024-2025")
    expect(rows[0].lastYear?.remainingPct).toBe(50)
  })
})
