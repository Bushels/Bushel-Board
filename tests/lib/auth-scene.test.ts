import { describe, expect, it } from "vitest";
import {
  getAuthSceneContent,
  getPrairieAuthScene,
  getPrairieHour,
} from "@/lib/auth/auth-scene";

describe("getPrairieHour", () => {
  it("converts UTC dates into prairie local hour", () => {
    expect(getPrairieHour(new Date("2026-01-15T13:00:00Z"))).toBe(6);
    expect(getPrairieHour(new Date("2026-01-16T01:00:00Z"))).toBe(18);
  });
});

describe("getPrairieAuthScene", () => {
  it("uses the daylight variant from 6:00 through 17:59 prairie time", () => {
    expect(getPrairieAuthScene(new Date("2026-01-15T13:00:00Z"))).toBe("day");
    expect(getPrairieAuthScene(new Date("2026-01-16T00:59:00Z"))).toBe("day");
  });

  it("uses the evening variant before 6:00 and from 18:00 onward", () => {
    expect(getPrairieAuthScene(new Date("2026-01-15T12:59:00Z"))).toBe("evening");
    expect(getPrairieAuthScene(new Date("2026-01-16T01:00:00Z"))).toBe("evening");
  });
});

describe("getAuthSceneContent", () => {
  it("returns stable copy for both scenes", () => {
    expect(getAuthSceneContent("day").badge).toBe("Prairie daylight");
    expect(getAuthSceneContent("evening").badge).toBe("Prairie evening");
  });
});
