import { describe, it, expect } from "vitest";
import { computeBudget, validateBudgetInputs } from "../budget";

describe("validateBudgetInputs", () => {
  it("accepts all-zero inputs", () => {
    expect(() =>
      validateBudgetInputs({
        monthlyIncome: 0,
        essentialExpenses: 0,
        existingMinPayments: 0,
        emergencyBuffer: 0,
        extraDebtPayment: 0,
      })
    ).not.toThrow();
  });

  it("rejects a missing field", () => {
    expect(() =>
      validateBudgetInputs({
        monthlyIncome: 50000,
        essentialExpenses: 20000,
        existingMinPayments: 5000,
        emergencyBuffer: 2000,
        // extraDebtPayment missing
      })
    ).toThrow(/fill in every field/);
  });

  it("rejects a negative amount", () => {
    expect(() =>
      validateBudgetInputs({
        monthlyIncome: -1,
        essentialExpenses: 0,
        existingMinPayments: 0,
        emergencyBuffer: 0,
        extraDebtPayment: 0,
      })
    ).toThrow(/cannot be negative/);
  });
});

describe("computeBudget", () => {
  it("computes a simple, comfortably-affordable scenario", () => {
    const result = computeBudget({
      monthlyIncome: 80000,
      essentialExpenses: 30000,
      existingMinPayments: 15000,
      emergencyBuffer: 5000,
      extraDebtPayment: 5000,
    });
    expect(result.recommendedDebtPayment).toBe(45000); // 80000-30000-5000
    expect(result.availableForDebt).toBe(20000); // 15000+5000
    expect(result.remainingDisposable).toBe(25000);
    expect(result.isOverCommitted).toBe(false);
  });

  it("flags over-commitment when debt payments exceed sustainable income", () => {
    const result = computeBudget({
      monthlyIncome: 40000,
      essentialExpenses: 30000,
      existingMinPayments: 15000,
      emergencyBuffer: 5000,
      extraDebtPayment: 0,
    });
    // recommended = max(0, 40000-30000-5000) = 5000, available = 15000 -> over-committed
    expect(result.recommendedDebtPayment).toBe(5000);
    expect(result.availableForDebt).toBe(15000);
    expect(result.remainingDisposable).toBe(-10000);
    expect(result.isOverCommitted).toBe(true);
  });

  it("never returns a negative recommended payment even with very high expenses", () => {
    const result = computeBudget({
      monthlyIncome: 20000,
      essentialExpenses: 50000,
      existingMinPayments: 1000,
      emergencyBuffer: 0,
      extraDebtPayment: 0,
    });
    expect(result.recommendedDebtPayment).toBe(0);
    expect(result.isOverCommitted).toBe(true);
  });

  it("handles all-zero income/expenses without throwing or NaN", () => {
    const result = computeBudget({
      monthlyIncome: 0,
      essentialExpenses: 0,
      existingMinPayments: 0,
      emergencyBuffer: 0,
      extraDebtPayment: 0,
    });
    expect(result.recommendedDebtPayment).toBe(0);
    expect(result.availableForDebt).toBe(0);
    expect(Number.isFinite(result.remainingDisposable)).toBe(true);
  });
});
