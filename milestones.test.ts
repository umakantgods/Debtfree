import { describe, it, expect } from "vitest";
import { computeMilestones, splitMilestones } from "../milestones";
import type { ProgressSummary } from "../progress";

function summary(overrides: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    originalTotal: 100000,
    currentTotal: 100000,
    totalPaid: 0,
    percentComplete: 0,
    debtsCleared: 0,
    totalDebts: 2,
    ...overrides,
  };
}

describe("computeMilestones", () => {
  it("nothing achieved at the very start", () => {
    const ms = computeMilestones(summary());
    expect(ms.every((m) => !m.achieved)).toBe(true);
  });

  it("achieves the ₹10,000 milestone once totalPaid crosses it", () => {
    const ms = computeMilestones(summary({ totalPaid: 10000 }));
    expect(ms.find((m) => m.id === "paid_10k")?.achieved).toBe(true);
    expect(ms.find((m) => m.id === "paid_50k")?.achieved).toBe(false);
  });

  it("achieves first_debt_cleared as soon as one debt is cleared", () => {
    const ms = computeMilestones(summary({ debtsCleared: 1 }));
    expect(ms.find((m) => m.id === "first_debt_cleared")?.achieved).toBe(true);
  });

  it("achieves percent milestones at the correct thresholds", () => {
    const at40 = computeMilestones(summary({ percentComplete: 40 }));
    expect(at40.find((m) => m.id === "pct_25")?.achieved).toBe(true);
    expect(at40.find((m) => m.id === "pct_50")?.achieved).toBe(false);

    const at50 = computeMilestones(summary({ percentComplete: 50 }));
    expect(at50.find((m) => m.id === "pct_50")?.achieved).toBe(true);
  });

  it("only achieves debt_free when every debt is cleared and there's at least one debt", () => {
    const notYet = computeMilestones(summary({ debtsCleared: 1, totalDebts: 2, percentComplete: 90 }));
    expect(notYet.find((m) => m.id === "debt_free")?.achieved).toBe(false);

    const done = computeMilestones(summary({ debtsCleared: 2, totalDebts: 2, percentComplete: 100 }));
    expect(done.find((m) => m.id === "debt_free")?.achieved).toBe(true);
  });

  it("does not falsely mark debt_free for a user with zero debts", () => {
    const ms = computeMilestones(summary({ totalDebts: 0, debtsCleared: 0, percentComplete: 0 }));
    expect(ms.find((m) => m.id === "debt_free")?.achieved).toBe(false);
  });
});

describe("splitMilestones", () => {
  it("splits earned vs upcoming correctly", () => {
    const ms = computeMilestones(summary({ totalPaid: 10000, percentComplete: 10 }));
    const { earned, upcoming } = splitMilestones(ms);
    expect(earned.map((m) => m.id)).toContain("paid_10k");
    expect(upcoming.map((m) => m.id)).toContain("pct_25");
    expect(earned.length + upcoming.length).toBe(ms.length);
  });
});
