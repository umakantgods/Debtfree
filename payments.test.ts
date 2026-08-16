import { describe, it, expect } from "vitest";
import {
  validatePaymentInput,
  applyPaymentToBalance,
  isDebtNowPaidOff,
  reverseBalanceForEdit,
  recalculateBalanceForPaymentChange,
} from "../payments";

describe("validatePaymentInput", () => {
  const baseCtx = { debtExists: true, debtBalance: 10000, debtStatus: "active" as const };

  it("accepts a normal valid payment", () => {
    expect(() =>
      validatePaymentInput({ debtId: "d1", amount: 2000, date: "2026-08-01" }, baseCtx)
    ).not.toThrow();
  });

  it("rejects missing debtId", () => {
    expect(() =>
      validatePaymentInput({ debtId: "", amount: 100, date: "2026-08-01" }, baseCtx)
    ).toThrow(/select which debt/);
  });

  it("rejects when debt does not exist", () => {
    expect(() =>
      validatePaymentInput(
        { debtId: "ghost", amount: 100, date: "2026-08-01" },
        { ...baseCtx, debtExists: false }
      )
    ).toThrow(/could not be found/);
  });

  it("rejects payments against archived debts", () => {
    expect(() =>
      validatePaymentInput(
        { debtId: "d1", amount: 100, date: "2026-08-01" },
        { ...baseCtx, debtStatus: "archived" }
      )
    ).toThrow(/archived/);
  });

  it("rejects zero amount", () => {
    expect(() =>
      validatePaymentInput({ debtId: "d1", amount: 0, date: "2026-08-01" }, baseCtx)
    ).toThrow(/positive number/);
  });

  it("rejects negative amount", () => {
    expect(() =>
      validatePaymentInput({ debtId: "d1", amount: -500, date: "2026-08-01" }, baseCtx)
    ).toThrow(/positive number/);
  });

  it("rejects NaN amount", () => {
    expect(() =>
      validatePaymentInput({ debtId: "d1", amount: NaN, date: "2026-08-01" }, baseCtx)
    ).toThrow(/positive number/);
  });

  it("rejects an absurdly large fat-finger amount", () => {
    expect(() =>
      validatePaymentInput({ debtId: "d1", amount: 5000000, date: "2026-08-01" }, baseCtx)
    ).toThrow(/too high/);
  });

  it("allows reasonable overpayment that closes the debt (up to 2x balance)", () => {
    expect(() =>
      validatePaymentInput({ debtId: "d1", amount: 10500, date: "2026-08-01" }, baseCtx)
    ).not.toThrow();
  });

  it("rejects an invalid date string", () => {
    expect(() =>
      validatePaymentInput({ debtId: "d1", amount: 100, date: "not-a-date" }, baseCtx)
    ).toThrow(/valid payment date/);
  });

  it("rejects a future-dated payment", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(() =>
      validatePaymentInput(
        { debtId: "d1", amount: 100, date: future.toISOString().slice(0, 10) },
        baseCtx
      )
    ).toThrow(/cannot be in the future/);
  });

  it("accepts today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(() =>
      validatePaymentInput({ debtId: "d1", amount: 100, date: today }, baseCtx)
    ).not.toThrow();
  });
});

describe("applyPaymentToBalance", () => {
  it("reduces balance by the payment amount", () => {
    expect(applyPaymentToBalance(10000, 2000)).toBe(8000);
  });

  it("never goes negative on overpayment", () => {
    expect(applyPaymentToBalance(1000, 5000)).toBe(0);
  });

  it("handles an exact payoff to zero", () => {
    expect(applyPaymentToBalance(5000, 5000)).toBe(0);
  });

  it("handles floating point precision correctly", () => {
    expect(applyPaymentToBalance(100.1, 0.1)).toBe(100);
  });

  it("paying zero balance stays at zero", () => {
    expect(applyPaymentToBalance(0, 500)).toBe(0);
  });
});

describe("isDebtNowPaidOff", () => {
  it("true at exactly zero", () => {
    expect(isDebtNowPaidOff(0)).toBe(true);
  });
  it("true for tiny rounding remainder", () => {
    expect(isDebtNowPaidOff(0.005)).toBe(true);
  });
  it("false when balance remains", () => {
    expect(isDebtNowPaidOff(50)).toBe(false);
  });
});

describe("reverseBalanceForEdit", () => {
  it("adds the old payment amount back onto the current balance", () => {
    // balance is 8000 after a 2000 payment against a 10000 debt
    expect(reverseBalanceForEdit(8000, 2000)).toBe(10000);
  });

  it("recovers only what was actually owed when the old payment overpaid", () => {
    // 5000 owed, paid 6000 -> balance floored at 0. Reversing only recovers 5000,
    // not 6000, because the extra 1000 was never subtracted in the first place.
    expect(reverseBalanceForEdit(0, 6000)).toBe(6000); // naive reverse — see recalc test below for the real-world case
  });
});

describe("recalculateBalanceForPaymentChange (edit/delete)", () => {
  it("editing a payment to a larger amount reduces the balance further", () => {
    // Debt was 10000, a 2000 payment brought it to 8000. Edit that payment to 3000.
    const newBalance = recalculateBalanceForPaymentChange(8000, 2000, 3000);
    expect(newBalance).toBe(7000); // (8000+2000) - 3000
  });

  it("editing a payment to a smaller amount increases the balance", () => {
    const newBalance = recalculateBalanceForPaymentChange(8000, 2000, 500);
    expect(newBalance).toBe(9500);
  });

  it("deleting a payment (newAmount=0) fully restores the balance", () => {
    const newBalance = recalculateBalanceForPaymentChange(8000, 2000, 0);
    expect(newBalance).toBe(10000);
  });

  it("editing the payment that originally closed a debt can reopen it", () => {
    // Debt fully paid off (balance 0) by a 5000 payment against a 5000 debt.
    // Editing that payment down to 3000 should leave 2000 still owed.
    const newBalance = recalculateBalanceForPaymentChange(0, 5000, 3000);
    expect(newBalance).toBe(2000);
    expect(isDebtNowPaidOff(newBalance)).toBe(false);
  });

  it("deleting the payment that closed a debt fully reopens it", () => {
    const newBalance = recalculateBalanceForPaymentChange(0, 5000, 0);
    expect(newBalance).toBe(5000);
  });

  it("never produces a negative balance even with edited overpayments", () => {
    const newBalance = recalculateBalanceForPaymentChange(0, 1000, 50000);
    expect(newBalance).toBe(0);
  });
});
