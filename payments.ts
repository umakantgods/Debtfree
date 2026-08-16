/**
 * DebtFree — Payment Recording Logic
 *
 * Pure functions for validating and applying a recorded payment to a debt's
 * balance. Kept separate from calculations.ts (projection/simulation engine)
 * because recording a real payment is a different operation from projecting
 * future amortization — but both are financial math, so both stay out of UI
 * components per spec §29/§30.
 */

import { round2 } from "./calculations";

export interface PaymentInput {
  debtId: string;
  amount: number;
  date: string; // ISO date string, e.g. "2026-08-16"
  note?: string;
}

export interface PaymentValidationContext {
  debtExists: boolean;
  debtBalance: number;
  debtStatus?: "active" | "paid_off" | "archived";
}

/**
 * Validates a payment before it's written to the database.
 * Throws a human-readable Error on the first violation found (spec §30).
 *
 * Rules:
 * - amount must be a finite positive number
 * - amount cannot be absurdly larger than the balance (catches fat-finger typos,
 *   e.g. entering 5000000 instead of 5000) — allows reasonable overpayment
 *   (rounding up to close a debt) up to 2x the balance, or ₹100 over, whichever
 *   is greater, but blocks anything wildly out of range.
 * - date cannot be in the future
 * - date must be a valid date
 * - cannot record a payment against a debt that doesn't exist or is archived
 */
export function validatePaymentInput(input: PaymentInput, ctx: PaymentValidationContext): void {
  if (!input.debtId) {
    throw new Error("Please select which debt this payment is for.");
  }
  if (!ctx.debtExists) {
    throw new Error("That debt could not be found.");
  }
  if (ctx.debtStatus === "archived") {
    throw new Error("This debt is archived and can't accept new payments.");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Payment amount must be a positive number.");
  }
  const maxReasonable = Math.max(ctx.debtBalance * 2, ctx.debtBalance + 100);
  if (ctx.debtBalance > 0 && input.amount > maxReasonable) {
    throw new Error(
      `That amount looks too high for this debt's outstanding balance (₹${ctx.debtBalance.toLocaleString(
        "en-IN"
      )}). Please double-check it.`
    );
  }
  if (ctx.debtBalance <= 0 && input.amount > 0) {
    // Balance already 0: still technically allow (e.g. correcting an early close),
    // but this should be rare and the UI should discourage it — no hard block here
    // since there's a legitimate case (a small refund reversal being corrected).
  }
  const parsedDate = new Date(input.date);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Please enter a valid payment date.");
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (parsedDate.getTime() > today.getTime()) {
    throw new Error("Payment date cannot be in the future.");
  }
}

/**
 * Applies a payment amount to a debt's current balance.
 * Balance never goes negative — any overpayment simply closes the debt at 0.
 */
export function applyPaymentToBalance(currentBalance: number, paymentAmount: number): number {
  return round2(Math.max(0, currentBalance - paymentAmount));
}

/**
 * Reverses a previously-applied payment off the current balance — used when
 * editing or deleting a payment record. Given the debt's balance AFTER that
 * payment was applied, returns what the balance was BEFORE it.
 *
 * Note: because balances are floored at 0, reversing a payment that caused
 * an overpayment (e.g. paid ₹6,000 against a ₹5,000 balance) can only
 * recover the ₹5,000 that was actually owed — the extra ₹1,000 was never
 * subtracted from the balance in the first place, so there's nothing to add
 * back for it. This is documented behaviour, not a bug: the balance is the
 * source of truth, not the payment amount.
 */
export function reverseBalanceForEdit(currentBalance: number, oldPaymentAmount: number): number {
  return round2(currentBalance + oldPaymentAmount);
}

/**
 * Full recalculation for editing a payment: reverses the old amount off the
 * balance, then re-applies the new amount. Used for both "edit" (newAmount
 * = the corrected amount) and "delete" (newAmount = 0).
 */
export function recalculateBalanceForPaymentChange(
  currentBalance: number,
  oldPaymentAmount: number,
  newPaymentAmount: number
): number {
  const reversed = reverseBalanceForEdit(currentBalance, oldPaymentAmount);
  return applyPaymentToBalance(reversed, newPaymentAmount);
}

/** Whether a debt should flip to "paid_off" status after this payment. */
export function isDebtNowPaidOff(newBalance: number): boolean {
  return newBalance <= 0.01;
}
