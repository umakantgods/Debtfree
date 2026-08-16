import type { Debt } from "./calculations";

// Spec §27 — clearly marked sample data, never written to the real DB.
export const DEMO_DEBTS: Debt[] = [
  { id: "demo-cc", name: "Credit Card", balance: 50000, apr: 36, minPayment: 5000 },
  { id: "demo-pl", name: "Personal Loan", balance: 150000, apr: 16, minPayment: 6500 },
  { id: "demo-vl", name: "Vehicle Loan", balance: 320000, apr: 11, minPayment: 8200 },
  { id: "demo-bnpl", name: "BNPL — Simpl", balance: 15000, apr: 24, minPayment: 2500 },
];

export const DEMO_MONTHLY_BUDGET = 30000;
export const IS_DEMO_FLAG = "isDemoMode";

// Original amounts before any demo payments, used by the Progress page so the
// demo account has something meaningful to show in the reduction chart.
export const DEMO_ORIGINAL_AMOUNTS: Record<string, number> = {
  "demo-cc": 80000,
  "demo-pl": 200000,
  "demo-vl": 380000,
  "demo-bnpl": 22000,
};

export interface DemoPayment {
  debtId: string;
  amount: number;
  date: string;
  note?: string;
}

// A few months of clearly-labelled sample payment history for demo mode.
export const DEMO_PAYMENTS: DemoPayment[] = [
  { debtId: "demo-cc", amount: 10000, date: "2026-05-10" },
  { debtId: "demo-pl", amount: 20000, date: "2026-05-12" },
  { debtId: "demo-vl", amount: 20000, date: "2026-05-15" },
  { debtId: "demo-bnpl", amount: 4000, date: "2026-05-18" },
  { debtId: "demo-cc", amount: 10000, date: "2026-06-10" },
  { debtId: "demo-pl", amount: 15000, date: "2026-06-12" },
  { debtId: "demo-vl", amount: 20000, date: "2026-06-15" },
  { debtId: "demo-bnpl", amount: 2000, date: "2026-06-18" },
  { debtId: "demo-cc", amount: 10000, date: "2026-07-10" },
  { debtId: "demo-pl", amount: 15000, date: "2026-07-12" },
  { debtId: "demo-vl", amount: 20000, date: "2026-07-15" },
  { debtId: "demo-bnpl", amount: 1000, date: "2026-07-18" },
];
