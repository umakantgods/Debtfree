import { describe, it, expect } from "vitest";
import {
  computeProgressSummary,
  buildDebtReductionSeries,
  buildMonthlyPaymentTotals,
  buildDebtBreakdown,
  computeMonthlyStreak,
} from "../progress";

describe("computeProgressSummary", () => {
  it("computes basic percent complete", () => {
    const s = computeProgressSummary([
      { id: "a", name: "A", balance: 25000, originalAmount: 100000 },
    ]);
    expect(s.originalTotal).toBe(100000);
    expect(s.currentTotal).toBe(25000);
    expect(s.totalPaid).toBe(75000);
    expect(s.percentComplete).toBe(75);
  });

  it("handles an empty debt list without NaN/Infinity", () => {
    const s = computeProgressSummary([]);
    expect(s.originalTotal).toBe(0);
    expect(s.percentComplete).toBe(0);
    expect(Number.isFinite(s.percentComplete)).toBe(true);
    expect(s.debtsCleared).toBe(0);
  });

  it("falls back to current balance when originalAmount is missing/zero", () => {
    const s = computeProgressSummary([{ id: "a", name: "A", balance: 5000, originalAmount: 0 }]);
    expect(s.originalTotal).toBe(5000);
    expect(s.percentComplete).toBe(0);
  });

  it("counts cleared debts correctly", () => {
    const s = computeProgressSummary([
      { id: "a", name: "A", balance: 0, originalAmount: 50000 },
      { id: "b", name: "B", balance: 20000, originalAmount: 50000 },
    ]);
    expect(s.debtsCleared).toBe(1);
    expect(s.totalDebts).toBe(2);
  });

  it("100% complete when all debts cleared", () => {
    const s = computeProgressSummary([
      { id: "a", name: "A", balance: 0, originalAmount: 50000 },
      { id: "b", name: "B", balance: 0, originalAmount: 30000 },
    ]);
    expect(s.percentComplete).toBe(100);
    expect(s.debtsCleared).toBe(2);
  });

  it("never exceeds 100% even with data inconsistencies (balance somehow negative)", () => {
    const s = computeProgressSummary([{ id: "a", name: "A", balance: -100, originalAmount: 1000 }]);
    expect(s.percentComplete).toBeLessThanOrEqual(100);
  });
});

describe("buildDebtReductionSeries", () => {
  it("returns a flat 2-point line when there is no payment history", () => {
    const series = buildDebtReductionSeries(100000, []);
    expect(series).toHaveLength(2);
    expect(series[0].balance).toBe(100000);
    expect(series[1].balance).toBe(100000);
  });

  it("walks balance down chronologically regardless of input order", () => {
    const series = buildDebtReductionSeries(10000, [
      { amount: 2000, date: "2026-03-01" },
      { amount: 1000, date: "2026-01-01" },
      { amount: 1500, date: "2026-02-01" },
    ]);
    // Start, then Jan, Feb, Mar in order
    expect(series.map((p) => p.balance)).toEqual([10000, 9000, 7500, 5500]);
  });

  it("never goes negative even if payments exceed original total", () => {
    const series = buildDebtReductionSeries(1000, [{ amount: 5000, date: "2026-01-01" }]);
    expect(series[series.length - 1].balance).toBe(0);
  });
});

describe("buildMonthlyPaymentTotals", () => {
  it("groups payments by month and sums them", () => {
    const totals = buildMonthlyPaymentTotals([
      { amount: 1000, date: "2026-01-05" },
      { amount: 2000, date: "2026-01-20" },
      { amount: 500, date: "2026-02-01" },
    ]);
    expect(totals).toHaveLength(2);
    expect(totals[0].total).toBe(3000);
    expect(totals[1].total).toBe(500);
  });

  it("returns an empty array for no payments", () => {
    expect(buildMonthlyPaymentTotals([])).toEqual([]);
  });

  it("ignores payments with invalid dates instead of crashing", () => {
    const totals = buildMonthlyPaymentTotals([
      { amount: 1000, date: "not-a-date" },
      { amount: 500, date: "2026-02-01" },
    ]);
    expect(totals).toHaveLength(1);
    expect(totals[0].total).toBe(500);
  });

  it("sorts months chronologically", () => {
    const totals = buildMonthlyPaymentTotals([
      { amount: 100, date: "2026-05-01" },
      { amount: 200, date: "2026-01-01" },
    ]);
    expect(totals[0].total).toBe(200);
    expect(totals[1].total).toBe(100);
  });
});

describe("buildDebtBreakdown", () => {
  it("excludes cleared debts from the breakdown", () => {
    const slices = buildDebtBreakdown([
      { name: "Cleared", balance: 0 },
      { name: "Active", balance: 5000 },
    ]);
    expect(slices).toEqual([{ name: "Active", value: 5000 }]);
  });

  it("returns an empty array when everything is paid off", () => {
    expect(buildDebtBreakdown([{ name: "A", balance: 0 }])).toEqual([]);
  });
});

describe("computeMonthlyStreak", () => {
  it("counts consecutive months with at least one payment", () => {
    const now = new Date(2026, 7, 16); // Aug 2026
    const dates = ["2026-08-01", "2026-07-15", "2026-06-01"];
    expect(computeMonthlyStreak(dates, now)).toBe(3);
  });

  it("still counts the streak if this month has no payment yet but last month did", () => {
    const now = new Date(2026, 7, 16); // Aug 2026, no August payment yet
    const dates = ["2026-07-15", "2026-06-01"];
    expect(computeMonthlyStreak(dates, now)).toBe(2);
  });

  it("returns 0 when there's a gap right before this month", () => {
    const now = new Date(2026, 7, 16);
    const dates = ["2026-05-01"]; // gap in June/July
    expect(computeMonthlyStreak(dates, now)).toBe(0);
  });

  it("returns 0 for no payment history", () => {
    expect(computeMonthlyStreak([])).toBe(0);
  });
});
