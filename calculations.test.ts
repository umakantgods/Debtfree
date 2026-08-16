import { describe, it, expect } from "vitest";
import {
  monthlyInterest,
  monthlyRate,
  amortizeSingleDebt,
  runStrategy,
  compareStrategies,
  simulatePaymentLevels,
  validateDebt,
  round2,
  Debt,
} from "../calculations";

const debt = (overrides: Partial<Debt> = {}): Debt => ({
  id: overrides.id ?? "d1",
  name: overrides.name ?? "Test Debt",
  balance: overrides.balance ?? 50000,
  apr: overrides.apr ?? 24,
  minPayment: overrides.minPayment ?? 2000,
});

describe("monthlyRate / monthlyInterest", () => {
  it("computes monthly rate from APR", () => {
    expect(monthlyRate(24)).toBeCloseTo(0.02, 5);
  });

  it("0% interest produces 0 monthly interest", () => {
    expect(monthlyInterest(100000, 0)).toBe(0);
  });

  it("negative balance never accrues interest", () => {
    expect(monthlyInterest(-500, 24)).toBe(0);
  });

  it("throws on negative APR", () => {
    expect(() => monthlyRate(-1)).toThrow();
  });
});

describe("validateDebt", () => {
  it("rejects negative balance", () => {
    expect(() => validateDebt({ balance: -10, apr: 10, minPayment: 10, name: "x" })).toThrow();
  });
  it("rejects APR > 100", () => {
    expect(() => validateDebt({ balance: 10, apr: 150, minPayment: 10, name: "x" })).toThrow();
  });
  it("rejects missing name", () => {
    expect(() => validateDebt({ balance: 10, apr: 10, minPayment: 10, name: "" })).toThrow();
  });
  it("accepts a valid debt including 0% APR", () => {
    expect(() => validateDebt({ balance: 10, apr: 0, minPayment: 5, name: "Friend loan" })).not.toThrow();
  });
});

describe("amortizeSingleDebt — edge cases", () => {
  it("0% interest: payment reduces balance by exactly the payment amount each month", () => {
    const d = debt({ balance: 12000, apr: 0, minPayment: 1000 });
    const sched = amortizeSingleDebt(d, 1000);
    expect(sched.payoffMonth).toBe(12);
    expect(sched.totalInterest).toBe(0);
    expect(sched.months[0].principalPaid).toBe(1000);
  });

  it("very small debt pays off in one month", () => {
    const d = debt({ balance: 50, apr: 36, minPayment: 500 });
    const sched = amortizeSingleDebt(d, 500);
    expect(sched.payoffMonth).toBe(1);
    expect(sched.months[0].endingBalance).toBe(0);
  });

  it("very high interest rate (e.g. 60% APR) still amortizes correctly with sufficient payment", () => {
    const d = debt({ balance: 20000, apr: 60, minPayment: 5000 });
    const sched = amortizeSingleDebt(d, 5000);
    expect(sched.payoffMonth).not.toBeNull();
    expect(sched.totalInterest).toBeGreaterThan(0);
  });

  it("payment larger than balance does not overpay — final payment equals what's owed", () => {
    const d = debt({ balance: 1000, apr: 12, minPayment: 5000 });
    const sched = amortizeSingleDebt(d, 5000);
    expect(sched.payoffMonth).toBe(1);
    const totalPaid = sched.months.reduce((s, m) => s + m.payment, 0);
    // total paid should be close to original balance + 1 month interest, not 5000
    expect(totalPaid).toBeLessThan(1100);
  });

  it("debt already paid off (balance 0) returns immediate payoff, no months simulated", () => {
    const d = debt({ balance: 0, apr: 20, minPayment: 500 });
    const sched = amortizeSingleDebt(d, 500);
    expect(sched.payoffMonth).toBe(0);
    expect(sched.months.length).toBe(0);
    expect(sched.totalInterest).toBe(0);
  });

  it("minimum payment greater than monthly interest reduces principal every month", () => {
    const d = debt({ balance: 100000, apr: 12, minPayment: 3000 });
    const sched = amortizeSingleDebt(d, 3000);
    expect(sched.months[0].principalPaid).toBeGreaterThan(0);
    expect(sched.payoffMonth).not.toBeNull();
  });

  it("payment that does NOT cover monthly interest never pays off the debt (flags as null)", () => {
    // 40% APR on 100000 = ~3333/month interest; paying 1000 will never clear it.
    const d = debt({ balance: 100000, apr: 40, minPayment: 1000 });
    const sched = amortizeSingleDebt(d, 1000);
    expect(sched.payoffMonth).toBeNull();
  });
});

describe("runStrategy — avalanche & snowball", () => {
  const debts: Debt[] = [
    debt({ id: "cc", name: "Credit Card", balance: 50000, apr: 36, minPayment: 2000 }),
    debt({ id: "pl", name: "Personal Loan", balance: 150000, apr: 16, minPayment: 5000 }),
    debt({ id: "vl", name: "Vehicle Loan", balance: 320000, apr: 11, minPayment: 8000 }),
  ];

  it("avalanche orders by highest APR first", () => {
    const result = runStrategy(debts, 30000, "avalanche");
    expect(result.order).toEqual(["cc", "pl", "vl"]); // 36% > 16% > 11%
  });

  it("snowball orders by smallest balance first", () => {
    const result = runStrategy(debts, 30000, "snowball");
    expect(result.order).toEqual(["cc", "pl", "vl"]); // 50k < 150k < 320k (coincidentally same here)
  });

  it("throws a clear error when budget is less than sum of minimum payments", () => {
    expect(() => runStrategy(debts, 10000, "avalanche")).toThrow(/less than the total minimum/);
  });

  it("multiple debts with identical interest rates still resolve deterministically", () => {
    const tied: Debt[] = [
      debt({ id: "a", balance: 10000, apr: 20, minPayment: 500 }),
      debt({ id: "b", balance: 20000, apr: 20, minPayment: 500 }),
    ];
    const avalanche = runStrategy(tied, 5000, "avalanche");
    // tie-break by larger balance first for avalanche
    expect(avalanche.order[0]).toBe("b");
  });

  it("empty debt list returns an immediately debt-free plan", () => {
    const result = runStrategy([], 10000, "avalanche");
    expect(result.debtFreeMonth).toBe(0);
    expect(result.totalInterestPaid).toBe(0);
  });

  it("extra payment larger than total balance pays everything off in month 1", () => {
    const small: Debt[] = [debt({ id: "a", balance: 1000, apr: 10, minPayment: 100 })];
    const result = runStrategy(small, 100000, "avalanche");
    expect(result.debtFreeMonth).toBe(1);
  });

  it("rolls extra payment forward once the target debt is cleared (roll-forward behaviour)", () => {
    // "small" has the higher APR so avalanche targets it first (unambiguous
    // priority order — avoids the balance-based tie-break for equal APRs).
    const roll: Debt[] = [
      debt({ id: "small", balance: 1000, apr: 35, minPayment: 100 }),
      debt({ id: "big", balance: 100000, apr: 30, minPayment: 1000 }),
    ];
    const result = runStrategy(roll, 3000, "avalanche");
    expect(result.order).toEqual(["small", "big"]);
    const smallSchedule = result.schedules.find((s) => s.debtId === "small")!;
    expect(smallSchedule.payoffMonth).toBe(1); // 1000 balance easily cleared with the extra pool
    const bigSchedule = result.schedules.find((s) => s.debtId === "big")!;
    // after month 1, the ~1900 freed from "small" should accelerate "big"
    expect(bigSchedule.months[1].payment).toBeGreaterThan(bigSchedule.months[0].payment);
  });
});

describe("compareStrategies", () => {
  it("never claims one strategy is unconditionally better — returns a reasoned recommendation", () => {
    const debts: Debt[] = [
      debt({ id: "cc", balance: 50000, apr: 36, minPayment: 2000 }),
      debt({ id: "pl", balance: 150000, apr: 16, minPayment: 5000 }),
    ];
    const cmp = compareStrategies(debts, 20000);
    expect(["avalanche", "snowball", "either"]).toContain(cmp.recommended);
    expect(cmp.reason.length).toBeGreaterThan(0);
  });

  it("avalanche total interest is never higher than snowball for the same budget", () => {
    const debts: Debt[] = [
      debt({ id: "cc", balance: 50000, apr: 36, minPayment: 2000 }),
      debt({ id: "pl", balance: 150000, apr: 16, minPayment: 5000 }),
      debt({ id: "vl", balance: 320000, apr: 11, minPayment: 8000 }),
    ];
    const cmp = compareStrategies(debts, 30000);
    expect(cmp.avalanche.totalInterestPaid).toBeLessThanOrEqual(cmp.snowball.totalInterestPaid + 0.01);
  });
});

describe("simulatePaymentLevels", () => {
  it("higher monthly payment never results in a later or equal debt-free date", () => {
    const debts: Debt[] = [debt({ id: "a", balance: 100000, apr: 24, minPayment: 3000 })];
    const scenarios = simulatePaymentLevels(debts, "avalanche", [3000, 5000, 10000]);
    const months = scenarios.map((s) => s.debtFreeMonth ?? Infinity);
    expect(months[0]).toBeGreaterThanOrEqual(months[1]);
    expect(months[1]).toBeGreaterThanOrEqual(months[2]);
  });

  it("payment below minimums is flagged, not silently miscalculated", () => {
    const debts: Debt[] = [debt({ id: "a", balance: 100000, apr: 24, minPayment: 3000 })];
    const scenarios = simulatePaymentLevels(debts, "avalanche", [1000]);
    expect(scenarios[0].debtFreeMonth).toBeNull();
    expect(Number.isNaN(scenarios[0].totalInterest)).toBe(true);
  });
});

describe("round2", () => {
  it("rounds floating point drift correctly", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
