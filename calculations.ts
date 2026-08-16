/**
 * DebtFree — Calculation Engine
 *
 * All debt-payoff math lives here, NOT in UI components (per spec §29/§36).
 * Every function is pure and deterministic so it can be unit tested in isolation.
 *
 * Conventions:
 * - Money is in INR, represented as plain numbers (rupees, not paise) with 2 decimal precision.
 * - Interest rates are annual percentage rates (APR) as entered by the user, e.g. 36 for 36%.
 * - Monthly interest rate = APR / 12 / 100 (simple monthly compounding assumption).
 * - All "assumption" points are flagged via the `assumptions` field on results so the UI
 *   can display "Estimated using..." disclosures per spec §36.
 */

export interface Debt {
  id: string;
  name: string;
  balance: number; // current outstanding balance, INR
  apr: number; // annual interest rate, percent (e.g. 36 for 36%)
  minPayment: number; // minimum monthly payment, INR
}

export interface AmortizationMonth {
  month: number; // 1-indexed
  startingBalance: number;
  interestPaid: number;
  principalPaid: number;
  payment: number;
  endingBalance: number;
}

export interface DebtSchedule {
  debtId: string;
  months: AmortizationMonth[];
  payoffMonth: number | null; // null if not paid off within the simulation horizon
  totalInterest: number;
}

export interface PlanResult {
  strategy: "avalanche" | "snowball";
  schedules: DebtSchedule[];
  debtFreeMonth: number | null; // months from now
  totalInterestPaid: number;
  order: string[]; // debt ids in the order they get "attacked", as determined at month 1
}

export interface SimulationScenario {
  monthlyPayment: number;
  debtFreeMonth: number | null;
  totalInterest: number;
  interestSaved: number; // vs. minimum-payments-only baseline
}

const MAX_SIMULATION_MONTHS = 600; // 50 years hard cap, prevents infinite loops on bad data
const EPSILON = 0.01; // treat balances below 1 paisa*100 as zero

// ---------------------------------------------------------------------------
// Basic building blocks
// ---------------------------------------------------------------------------

/** Monthly interest rate from an annual percentage rate. Assumption: APR / 12 / 100. */
export function monthlyRate(apr: number): number {
  if (apr < 0) throw new Error("Interest rate cannot be negative");
  return apr / 12 / 100;
}

/**
 * Interest accrued on a balance for one month, given an APR.
 * 0% APR debts correctly return 0.
 */
export function monthlyInterest(balance: number, apr: number): number {
  if (balance <= 0) return 0;
  return round2(balance * monthlyRate(apr));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Validates a single debt record. Throws with a human-readable message on
 * the first violation found (per spec §30 — clear, human-readable errors).
 */
export function validateDebt(d: Partial<Debt>): void {
  if (d.balance === undefined || d.balance === null || d.balance < 0) {
    throw new Error("Outstanding balance must be zero or a positive number.");
  }
  if (d.apr === undefined || d.apr === null || d.apr < 0 || d.apr > 100) {
    throw new Error("Interest rate must be between 0% and 100%.");
  }
  if (d.minPayment === undefined || d.minPayment === null || d.minPayment < 0) {
    throw new Error("Minimum payment cannot be negative.");
  }
  if (!d.name || !d.name.trim()) {
    throw new Error("Debt name is required.");
  }
}

// ---------------------------------------------------------------------------
// Single-debt amortization (minimum payments only)
// ---------------------------------------------------------------------------

/**
 * Amortizes a single debt paying a fixed monthly payment until payoff or
 * MAX_SIMULATION_MONTHS is reached.
 *
 * Edge cases handled:
 * - payment <= monthly interest and balance > 0 and apr > 0: balance never
 *   reduces (or grows). We stop at MAX_SIMULATION_MONTHS and flag it — this
 *   is surfaced to the UI as "this payment will never clear this debt".
 * - balance already 0: returns an empty, already-paid-off schedule immediately.
 * - payment > balance + interest: final month pays exactly what's owed, no overpayment recorded.
 */
export function amortizeSingleDebt(debt: Debt, monthlyPayment: number): DebtSchedule {
  const months: AmortizationMonth[] = [];
  let balance = round2(debt.balance);

  if (balance <= EPSILON) {
    return { debtId: debt.id, months: [], payoffMonth: 0, totalInterest: 0 };
  }

  let totalInterest = 0;
  let m = 0;

  while (balance > EPSILON && m < MAX_SIMULATION_MONTHS) {
    m += 1;
    const interest = monthlyInterest(balance, debt.apr);
    const startingBalance = balance;

    // Never pay more than what's actually owed (balance + this month's interest).
    const owedThisMonth = round2(balance + interest);
    const payment = round2(Math.min(monthlyPayment, owedThisMonth));

    const principalPaid = round2(Math.max(0, payment - interest));
    balance = round2(Math.max(0, startingBalance + interest - payment));

    totalInterest = round2(totalInterest + interest);

    months.push({
      month: m,
      startingBalance,
      interestPaid: interest,
      principalPaid,
      payment,
      endingBalance: balance,
    });

    // Stuck loop guard: payment doesn't even cover interest, balance is flat or growing.
    if (principalPaid <= 0 && interest > 0 && payment < owedThisMonth) {
      // Balance will never reach zero at this payment level. Stop early and
      // report "not payable" via payoffMonth = null.
      return { debtId: debt.id, months, payoffMonth: null, totalInterest };
    }
  }

  const payoffMonth = balance <= EPSILON ? m : null;
  return { debtId: debt.id, months, payoffMonth, totalInterest };
}

// ---------------------------------------------------------------------------
// Multi-debt strategies: Avalanche & Snowball
// ---------------------------------------------------------------------------

type StrategyOrderFn = (debts: Debt[]) => Debt[];

/** Highest interest rate first. Ties broken by largest balance (attacks bigger debt first). */
const avalancheOrder: StrategyOrderFn = (debts) =>
  [...debts].sort((a, b) => b.apr - a.apr || b.balance - a.balance);

/** Smallest balance first. Ties broken by highest interest rate. */
const snowballOrder: StrategyOrderFn = (debts) =>
  [...debts].sort((a, b) => a.balance - b.balance || b.apr - a.apr);

/**
 * Runs a full multi-debt payoff simulation for one strategy.
 *
 * Algorithm per month:
 * 1. Pay minimum payment on every debt still open (interest accrues first, then principal).
 * 2. Whatever is left of the monthly budget after all minimums is the "extra" pool.
 * 3. Extra pool is applied, in priority order, to the current target debt. Once a debt
 *    hits zero, the extra pool rolls forward to the next debt in priority order
 *    (the "snowball roll" / "avalanche roll").
 *
 * Validation: if totalMonthlyBudget is less than the sum of all minimum payments,
 * throws — the plan is not payable as configured (spec §30).
 */
export function runStrategy(
  debtsInput: Debt[],
  totalMonthlyBudget: number,
  strategy: "avalanche" | "snowball"
): PlanResult {
  const debts = debtsInput.filter((d) => d.balance > EPSILON).map((d) => ({ ...d }));

  if (debts.length === 0) {
    return { strategy, schedules: [], debtFreeMonth: 0, totalInterestPaid: 0, order: [] };
  }

  const sumMinPayments = round2(debts.reduce((s, d) => s + d.minPayment, 0));
  if (totalMonthlyBudget < sumMinPayments - EPSILON) {
    throw new Error(
      `Your monthly payment (₹${totalMonthlyBudget}) is less than the total minimum payments required (₹${sumMinPayments}). Increase your monthly budget or reduce minimums.`
    );
  }

  const orderFn = strategy === "avalanche" ? avalancheOrder : snowballOrder;
  const priorityOrder = orderFn(debts).map((d) => d.id);

  const balances = new Map(debts.map((d) => [d.id, round2(d.balance)]));
  const scheduleMap = new Map<string, AmortizationMonth[]>(debts.map((d) => [d.id, []]));
  const totalInterestMap = new Map<string, number>(debts.map((d) => [d.id, 0]));
  const payoffMonthMap = new Map<string, number | null>(debts.map((d) => [d.id, null]));
  const minPaymentOf = new Map(debts.map((d) => [d.id, d.minPayment]));
  const aprOf = new Map(debts.map((d) => [d.id, d.apr]));

  let month = 0;
  let overallPayoffMonth: number | null = null;
  let stalled = false;

  while (month < MAX_SIMULATION_MONTHS) {
    const openIds = priorityOrder.filter((id) => (balances.get(id) ?? 0) > EPSILON);
    if (openIds.length === 0) {
      overallPayoffMonth = month;
      break;
    }
    month += 1;

    // Step 1: accrue interest & apply minimum payments to every open debt.
    let extraPool = round2(
      totalMonthlyBudget - openIds.reduce((s, id) => s + (minPaymentOf.get(id) ?? 0), 0)
    );
    // Any minimum payment "freed up" from already-closed debts is added back in
    // implicitly because totalMonthlyBudget stays constant and we only subtract
    // minimums for open debts — this IS the snowball/avalanche roll-forward.

    for (const id of openIds) {
      const startingBalance = balances.get(id) ?? 0;
      const apr = aprOf.get(id) ?? 0;
      const interest = monthlyInterest(startingBalance, apr);
      const minPay = minPaymentOf.get(id) ?? 0;
      const owed = round2(startingBalance + interest);
      const basePayment = round2(Math.min(minPay, owed));
      const principalFromBase = round2(Math.max(0, basePayment - interest));
      let newBalance = round2(Math.max(0, startingBalance + interest - basePayment));

      totalInterestMap.set(id, round2((totalInterestMap.get(id) ?? 0) + interest));
      scheduleMap.get(id)!.push({
        month,
        startingBalance,
        interestPaid: interest,
        principalPaid: principalFromBase,
        payment: basePayment,
        endingBalance: newBalance,
      });
      balances.set(id, newBalance);
    }

    // Step 2: apply the extra pool to the priority-ordered still-open debts.
    if (extraPool > EPSILON) {
      for (const id of openIds) {
        if (extraPool <= EPSILON) break;
        const bal = balances.get(id) ?? 0;
        if (bal <= EPSILON) continue;
        const applied = round2(Math.min(extraPool, bal));
        const newBal = round2(bal - applied);
        balances.set(id, newBal);
        extraPool = round2(extraPool - applied);

        // Reflect the extra payment in this month's row for the debt.
        const rows = scheduleMap.get(id)!;
        const last = rows[rows.length - 1];
        last.payment = round2(last.payment + applied);
        last.principalPaid = round2(last.principalPaid + applied);
        last.endingBalance = newBal;
      }
    }

    // Record payoff months as they happen.
    for (const id of openIds) {
      if ((balances.get(id) ?? 0) <= EPSILON && payoffMonthMap.get(id) === null) {
        payoffMonthMap.set(id, month);
      }
    }

    // Stall guard: nothing closed and extra pool couldn't be absorbed because
    // every open debt's balance is stuck (shouldn't normally happen once
    // budget >= sum of minimums, but guards against pathological inputs).
    const anyProgress = openIds.some((id) => {
      const rows = scheduleMap.get(id)!;
      const last = rows[rows.length - 1];
      return last.principalPaid > 0;
    });
    if (!anyProgress) {
      stalled = true;
      break;
    }
  }

  if (!stalled && priorityOrder.every((id) => (balances.get(id) ?? 0) <= EPSILON)) {
    overallPayoffMonth = overallPayoffMonth ?? month;
  }

  const schedules: DebtSchedule[] = priorityOrder.map((id) => ({
    debtId: id,
    months: scheduleMap.get(id)!,
    payoffMonth: payoffMonthMap.get(id) ?? null,
    totalInterest: totalInterestMap.get(id) ?? 0,
  }));

  const totalInterestPaid = round2(schedules.reduce((s, sch) => s + sch.totalInterest, 0));

  return {
    strategy,
    schedules,
    debtFreeMonth: stalled ? null : overallPayoffMonth,
    totalInterestPaid,
    order: priorityOrder,
  };
}

// ---------------------------------------------------------------------------
// Strategy comparison / recommendation
// ---------------------------------------------------------------------------

export interface StrategyComparison {
  avalanche: PlanResult;
  snowball: PlanResult;
  interestDifference: number; // snowball interest - avalanche interest (>=0 typically)
  monthsDifference: number; // snowball months - avalanche months
  recommended: "avalanche" | "snowball" | "either";
  reason: string;
}

/**
 * Compares both strategies and produces a plain-language recommendation.
 * Never claims one is universally superior (spec §12) — it explains the tradeoff.
 */
export function compareStrategies(debts: Debt[], totalMonthlyBudget: number): StrategyComparison {
  const avalanche = runStrategy(debts, totalMonthlyBudget, "avalanche");
  const snowball = runStrategy(debts, totalMonthlyBudget, "snowball");

  const interestDifference = round2(
    (snowball.totalInterestPaid ?? 0) - (avalanche.totalInterestPaid ?? 0)
  );
  const monthsDifference = (snowball.debtFreeMonth ?? Infinity) - (avalanche.debtFreeMonth ?? Infinity);

  let recommended: "avalanche" | "snowball" | "either" = "either";
  let reason =
    "Both strategies pay off your debt at close to the same time and cost. Pick whichever will keep you most motivated.";

  if (Math.abs(interestDifference) < 100 && Math.abs(monthsDifference) < 1) {
    recommended = "either";
  } else if (interestDifference > 0) {
    recommended = "avalanche";
    reason = `The Avalanche method could save you about ₹${Math.round(
      interestDifference
    ).toLocaleString("en-IN")} in interest by targeting your highest-interest debt first.`;
  } else if (interestDifference < 0) {
    recommended = "snowball";
    reason =
      "The Snowball method costs a little more in interest, but clears your smallest debts fastest — which can help you stay motivated.";
  }

  return { avalanche, snowball, interestDifference, monthsDifference, recommended, reason };
}

// ---------------------------------------------------------------------------
// Debt-free simulator (spec §13)
// ---------------------------------------------------------------------------

/**
 * Runs the same strategy at several monthly payment levels so the UI can
 * show "if you add ₹X more/month" comparisons. Baseline = minimums only.
 */
export function simulatePaymentLevels(
  debts: Debt[],
  strategy: "avalanche" | "snowball",
  paymentLevels: number[]
): SimulationScenario[] {
  const sumMinPayments = round2(debts.reduce((s, d) => s + d.minPayment, 0));

  // Baseline: minimums only, run each debt independently (no rollover benefit).
  const baselineInterest = round2(
    debts.reduce((sum, d) => {
      const sched = amortizeSingleDebt(d, d.minPayment);
      return sum + sched.totalInterest;
    }, 0)
  );

  return paymentLevels.map((level) => {
    if (level < sumMinPayments) {
      return { monthlyPayment: level, debtFreeMonth: null, totalInterest: NaN, interestSaved: NaN };
    }
    const plan = runStrategy(debts, level, strategy);
    const interestSaved = round2(baselineInterest - plan.totalInterestPaid);
    return {
      monthlyPayment: level,
      debtFreeMonth: plan.debtFreeMonth,
      totalInterest: plan.totalInterestPaid,
      interestSaved,
    };
  });
}

/** Converts a "months from now" count into a human month/year label, e.g. "March 2030". */
export function monthsFromNowToLabel(monthsFromNow: number | null, from: Date = new Date()): string {
  if (monthsFromNow === null) return "Not payable at this amount";
  const d = new Date(from.getFullYear(), from.getMonth() + monthsFromNow, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Recommended strategy at onboarding, before any debts are entered in detail (spec §7)
// ---------------------------------------------------------------------------

export function recommendStrategyFromSummary(totalDebt: number, numberOfDebts: number): {
  strategy: "avalanche" | "snowball";
  reason: string;
} {
  if (numberOfDebts <= 1) {
    return {
      strategy: "avalanche",
      reason: "With a single debt, both methods behave the same — Avalanche is the default.",
    };
  }
  // Simple heuristic used ONLY before individual debts are entered; once real
  // debts exist, compareStrategies() above should be used instead.
  if (totalDebt > 500000) {
    return {
      strategy: "avalanche",
      reason:
        "With a larger total debt, prioritising your highest-interest debt first typically saves more money.",
    };
  }
  return {
    strategy: "snowball",
    reason: "Clearing smaller debts first can build momentum and keep you motivated early on.",
  };
}
