/**
 * DebtFree — Monthly Budget Logic
 *
 * Pure functions for the Monthly Budget page (spec §16). Explicitly framed
 * as a planning aid, not professional financial advice — the disclaimer
 * lives in the UI, but this module never claims certainty either: it
 * returns a "recommended" number, not a mandate.
 */

import { round2 } from "./calculations";

export interface BudgetInputs {
  monthlyIncome: number;
  essentialExpenses: number;
  existingMinPayments: number; // sum of all debts' minimum payments
  emergencyBuffer: number;
  extraDebtPayment: number; // additional amount beyond minimums the user wants to commit
}

export interface BudgetResult {
  /** What's left of income after essentials and the emergency buffer. */
  recommendedDebtPayment: number;
  /** What the user has actually allocated: minimums + extra. This is the number
   *  that should be fed into the repayment planner as the monthly budget. */
  availableForDebt: number;
  /** recommendedDebtPayment - availableForDebt. Negative means over-committed
   *  relative to income (spending more on debt than looks sustainable). */
  remainingDisposable: number;
  /** True if availableForDebt exceeds what income can sustainably support. */
  isOverCommitted: boolean;
}

export function validateBudgetInputs(inputs: Partial<BudgetInputs>): void {
  const fields: (keyof BudgetInputs)[] = [
    "monthlyIncome",
    "essentialExpenses",
    "existingMinPayments",
    "emergencyBuffer",
    "extraDebtPayment",
  ];
  for (const f of fields) {
    const v = inputs[f];
    if (v === undefined || v === null || Number.isNaN(v)) {
      throw new Error("Please fill in every field with a number.");
    }
    if (v < 0) {
      throw new Error("Budget amounts cannot be negative.");
    }
  }
}

/**
 * Computes the budget summary. Never presents the result as guaranteed or as
 * regulated financial advice — that framing belongs in the calling UI.
 */
export function computeBudget(inputs: BudgetInputs): BudgetResult {
  validateBudgetInputs(inputs);

  const recommendedDebtPayment = round2(
    Math.max(0, inputs.monthlyIncome - inputs.essentialExpenses - inputs.emergencyBuffer)
  );
  const availableForDebt = round2(inputs.existingMinPayments + inputs.extraDebtPayment);
  const remainingDisposable = round2(recommendedDebtPayment - availableForDebt);

  return {
    recommendedDebtPayment,
    availableForDebt,
    remainingDisposable,
    isOverCommitted: remainingDisposable < 0,
  };
}
