import { describe, expect, it } from "vitest";
import { dayDistance, mergeExpiry, normaliseName, shouldAutoOrder, splitPaise } from "./domain";
import type { Member } from "../types";

const member = (id: string, name: string): Member => ({
  id,
  household_id: "household",
  name,
  created_at: "2026-01-01T00:00:00Z",
});

describe("domain rules", () => {
  it("normalises names for household dedupe", () => {
    expect(normaliseName("  Full   Cream Milk ")).toBe("full cream milk");
  });

  it("treats only past dates as expired", () => {
    const now = new Date("2026-09-29T12:00:00+05:30");
    expect(dayDistance("2026-09-29", now)).toBe(0);
    expect(shouldAutoOrder({ is_recurring: true, quantity: 2, expiry_date: "2026-09-28" }, now)).toBe(true);
    expect(shouldAutoOrder({ is_recurring: true, quantity: 2, expiry_date: "2026-09-29" }, now)).toBe(false);
  });

  it("splits every paise deterministically", () => {
    const splits = splitPaise(10_000, [member("b", "Vathsan"), member("a", "Asha"), member("c", "Kabir")]);
    expect(splits.map((split) => split.amountPaise)).toEqual([3334, 3333, 3333]);
    expect(splits.reduce((sum, split) => sum + split.amountPaise, 0)).toBe(10_000);
  });

  it("keeps the earlier expiry for mixed stock", () => {
    expect(mergeExpiry("2026-10-02", "2026-10-08")).toBe("2026-10-02");
  });
});
