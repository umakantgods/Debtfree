/**
 * DebtFree — Progress & Chart Data Calculations
 *
 * Pure functions that turn raw debts/payments into the numbers and series
 * the Progress page and dashboard render. No chart library code here —
 * these just shape the data (spec §29 discipline extended to reporting).
 */

import { round2 } from "./calculations";

export interface ProgressDebtInput {
  id: string;
  name: string;
  balance: number;
  originalAmount: number;
}

export interface ProgressSummary {
  originalTotal: number;
  currentTotal: number;
  totalPaid: number;
  percentComplete: number; // 0-100
  debtsCleared: number;
  totalDebts: number;
}

/**
 * Core progress summary. Handles the edge cases that matter for a
 * financially-stressed user seeing this number for the first time:
 * - no debts at all -> 0% complete, not NaN/Infinity
 * - originalAmount missing/zero for a debt -> falls back to current balance
 *   (so a debt added mid-journey with no "original" doesn't break the total)
 */
export function computeProgressSummary(debts: ProgressDebtInput[]): ProgressSummary {
  const originalTotal = round2(
    debts.reduce((s, d) => s + (d.originalAmount > 0 ? d.originalAmount : d.balance), 0)
  );
  const currentTotal = round2(debts.reduce((s, d) => s + Math.max(0, d.balance), 0));
  const totalPaid = round2(Math.max(0, originalTotal - currentTotal));
  const percentComplete = originalTotal > 0 ? round2((totalPaid / originalTotal) * 100) : 0;
  const debtsCleared = debts.filter((d) => d.balance <= 0.01).length;

  return {
    originalTotal,
    currentTotal,
    totalPaid,
    percentComplete: Math.min(100, percentComplete),
    debtsCleared,
    totalDebts: debts.length,
  };
}

export interface PaymentLike {
  amount: number;
  date: string; // ISO date
}

export interface DebtReductionPoint {
  label: string; // e.g. "Start" or "16 Aug 2026"
  balance: number;
}

/**
 * Reconstructs total-debt-over-time by walking payments chronologically from
 * the original total, subtracting each payment as it happened.
 * Empty payment history returns a flat 2-point line (start == now) so the
 * chart still renders something meaningful instead of breaking.
 */
export function buildDebtReductionSeries(
  originalTotal: number,
  payments: PaymentLike[]
): DebtReductionPoint[] {
  const sorted = [...payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) {
    return [
      { label: "Start", balance: round2(originalTotal) },
      { label: "Now", balance: round2(originalTotal) },
    ];
  }

  const points: DebtReductionPoint[] = [{ label: "Start", balance: round2(originalTotal) }];
  let running = originalTotal;
  for (const p of sorted) {
    running = round2(Math.max(0, running - p.amount));
    const d = new Date(p.date);
    points.push({
      label: Number.isNaN(d.getTime()) ? p.date : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      balance: running,
    });
  }
  return points;
}

export interface MonthlyPaymentPoint {
  month: string; // "Aug 2026"
  total: number;
}

/** Groups payments by calendar month for a bar chart. Sorted chronologically. */
export function buildMonthlyPaymentTotals(payments: PaymentLike[]): MonthlyPaymentPoint[] {
  const buckets = new Map<string, number>();
  for (const p of payments) {
    const d = new Date(p.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, round2((buckets.get(key) ?? 0) + p.amount));
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, total]) => {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      return { month: label, total };
    });
}

export interface DebtBreakdownSlice {
  name: string;
  value: number;
}

/** Donut-chart-ready breakdown of remaining balance by debt. Excludes cleared debts. */
export function buildDebtBreakdown(debts: { name: string; balance: number }[]): DebtBreakdownSlice[] {
  return debts.filter((d) => d.balance > 0.01).map((d) => ({ name: d.name, value: round2(d.balance) }));
}

export interface StreakInput {
  paymentDates: string[]; // ISO dates, any order
}

/**
 * Counts consecutive calendar months (ending this month or last month) in
 * which at least one payment was recorded. Used for the "repayment streak"
 * milestone display.
 */
export function computeMonthlyStreak(paymentDates: string[], now: Date = new Date()): number {
  const monthKeys = new Set(
    paymentDates
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map((d) => `${d.getFullYear()}-${d.getMonth()}`)
  );

  let streak = 0;
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  // Allow the current month to be "not yet paid" without breaking the streak,
  // by starting the check from this month but not requiring it.
  if (!monthKeys.has(`${cursor.getFullYear()}-${cursor.getMonth()}`)) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }
  while (monthKeys.has(`${cursor.getFullYear()}-${cursor.getMonth()}`)) {
    streak += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  }
  return streak;
}
