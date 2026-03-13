import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror the schemas from actions.ts so we can test validation without Supabase
const addCropPlanSchema = z.object({
  grain: z.string().min(1, "Grain is required"),
  acres: z.coerce.number().int().positive("Acres must be a positive integer"),
  starting: z.coerce.number().positive("Estimated starting grain amount must be greater than 0"),
  volume: z.coerce.number().nonnegative("Volume cannot be negative"),
  contracted: z.coerce.number().nonnegative("Contracted volume cannot be negative").default(0),
  inventory_unit: z.enum(["metric_tonnes", "bushels", "pounds"]).default("metric_tonnes"),
  bushel_weight_lbs: z.coerce.number().positive("Bushel weight must be greater than 0").optional(),
}).superRefine((data, ctx) => {
  if (data.inventory_unit === "bushels" && !data.bushel_weight_lbs) {
    ctx.addIssue({
      code: "custom",
      message: "Bushel weight is required when entering bushels",
      path: ["bushel_weight_lbs"],
    });
  }
});

const logDeliverySchema = z.object({
  grain: z.string().min(1, "Grain is required"),
  submission_id: z.string().uuid("Invalid submission id"),
  amount_kt: z.coerce.number().positive("Delivery amount must be positive"),
  date: z.string().date("Invalid date format"),
  destination: z.string().optional(),
  marketing_type: z.enum(["contracted", "open"], {
    message: "Choose whether this load was contracted or open market",
  }),
});

describe("addCropPlan validation", () => {
  it("accepts valid input", () => {
    const result = addCropPlanSchema.safeParse({
      grain: "Wheat",
      acres: "1500",
      starting: "3.2",
      volume: "2.5",
      contracted: "0.5",
      inventory_unit: "metric_tonnes",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.grain).toBe("Wheat");
      expect(result.data.acres).toBe(1500);
      expect(result.data.starting).toBe(3.2);
      expect(result.data.volume).toBe(2.5);
      expect(result.data.contracted).toBe(0.5);
    }
  });

  it("rejects empty grain", () => {
    const result = addCropPlanSchema.safeParse({ grain: "", acres: 100, starting: 2, volume: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects zero acres", () => {
    const result = addCropPlanSchema.safeParse({ grain: "Canola", acres: 0, starting: 2, volume: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects negative acres", () => {
    const result = addCropPlanSchema.safeParse({ grain: "Canola", acres: -100, starting: 2, volume: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects negative volume", () => {
    const result = addCropPlanSchema.safeParse({ grain: "Canola", acres: 500, starting: 2, volume: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects missing starting grain amount", () => {
    const result = addCropPlanSchema.safeParse({ grain: "Barley", acres: 200, starting: 0, volume: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts zero volume (farmer with nothing left to sell)", () => {
    const result = addCropPlanSchema.safeParse({ grain: "Barley", acres: 200, starting: 1.5, volume: 0 });
    expect(result.success).toBe(true);
  });

  it("coerces string numbers from FormData", () => {
    const result = addCropPlanSchema.safeParse({
      grain: "Oats",
      acres: "750",
      starting: "1.2",
      volume: "0.5",
      contracted: "0.25",
      inventory_unit: "metric_tonnes",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.acres).toBe("number");
      expect(typeof result.data.starting).toBe("number");
      expect(typeof result.data.volume).toBe("number");
      expect(typeof result.data.contracted).toBe("number");
    }
  });

  it("accepts bushel input when bushel weight is provided", () => {
    const result = addCropPlanSchema.safeParse({
      grain: "Canola",
      acres: "1500",
      starting: "64000",
      volume: "50000",
      contracted: "12000",
      inventory_unit: "bushels",
      bushel_weight_lbs: "50",
    });

    expect(result.success).toBe(true);
  });

  it("rejects bushel input without a bushel weight", () => {
    const result = addCropPlanSchema.safeParse({
      grain: "Canola",
      acres: "1500",
      starting: "64000",
      volume: "50000",
      contracted: "12000",
      inventory_unit: "bushels",
    });

    expect(result.success).toBe(false);
  });
});

describe("logDelivery validation", () => {
  it("accepts valid delivery", () => {
    const result = logDeliverySchema.safeParse({
      grain: "Wheat",
      submission_id: "11111111-1111-4111-8111-111111111111",
      amount_kt: "0.5",
      date: "2026-01-15",
      marketing_type: "contracted",
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero amount", () => {
    const result = logDeliverySchema.safeParse({
      grain: "Wheat",
      submission_id: "11111111-1111-4111-8111-111111111111",
      amount_kt: 0,
      date: "2026-01-15",
      marketing_type: "open",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = logDeliverySchema.safeParse({
      grain: "Wheat",
      submission_id: "11111111-1111-4111-8111-111111111111",
      amount_kt: -1,
      date: "2026-01-15",
      marketing_type: "open",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = logDeliverySchema.safeParse({
      grain: "Wheat",
      submission_id: "11111111-1111-4111-8111-111111111111",
      amount_kt: 1,
      date: "Jan 15 2026",
      marketing_type: "open",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing grain", () => {
    const result = logDeliverySchema.safeParse({
      grain: "",
      submission_id: "11111111-1111-4111-8111-111111111111",
      amount_kt: 1,
      date: "2026-01-15",
      marketing_type: "open",
    });
    expect(result.success).toBe(false);
  });

  it("allows optional destination", () => {
    const result = logDeliverySchema.safeParse({
      grain: "Canola",
      submission_id: "11111111-1111-4111-8111-111111111111",
      amount_kt: 2.0,
      date: "2026-02-01",
      destination: "Richardson Pioneer",
      marketing_type: "contracted",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.destination).toBe("Richardson Pioneer");
    }
  });

  it("rejects missing marketing type", () => {
    const result = logDeliverySchema.safeParse({
      grain: "Canola",
      submission_id: "11111111-1111-4111-8111-111111111111",
      amount_kt: 2.0,
      date: "2026-02-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid submission id", () => {
    const result = logDeliverySchema.safeParse({
      grain: "Canola",
      submission_id: "not-a-uuid",
      amount_kt: 2.0,
      date: "2026-02-01",
      marketing_type: "open",
    });
    expect(result.success).toBe(false);
  });
});
