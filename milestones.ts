/**
 * DebtFree — Milestones
 *
 * Pure, stateless milestone computation from the current progress summary
 * (spec §19). Deliberately recomputed from live state rather than stored as
 * historical "achieved on X date" records for the MVP — see README for the
 * tradeoff. Kept premium/understated per spec, not a gamified badge wall.
 */

import type { ProgressSummary } from "./progress";

export interface Milestone {
  id: string;
  label: string;
  description: string;
  achieved: boolean;
}

interface MilestoneDef {
  id: string;
  label: string;
  description: string;
  check: (s: ProgressSummary) => boolean;
}

const MILESTONE_DEFS: MilestoneDef[] = [
  {
    id: "paid_10k",
    label: "First ₹10,000 paid",
    description: "You've paid down your first ₹10,000 of debt.",
    check: (s) => s.totalPaid >= 10000,
  },
  {
    id: "paid_50k",
    label: "₹50,000 paid",
    description: "You've paid down ₹50,000 total.",
    check: (s) => s.totalPaid >= 50000,
  },
  {
    id: "first_debt_cleared",
    label: "First debt cleared",
    description: "You've fully paid off at least one debt.",
    check: (s) => s.debtsCleared >= 1,
  },
  {
    id: "pct_25",
    label: "25% debt-free",
    description: "A quarter of your original debt is gone.",
    check: (s) => s.percentComplete >= 25,
  },
  {
    id: "pct_50",
    label: "50% debt-free",
    description: "Halfway to debt-free.",
    check: (s) => s.percentComplete >= 50,
  },
  {
    id: "pct_75",
    label: "75% debt-free",
    description: "Three-quarters of the way there.",
    check: (s) => s.percentComplete >= 75,
  },
  {
    id: "debt_free",
    label: "Debt-free",
    description: "Every tracked debt is fully paid off.",
    check: (s) => s.totalDebts > 0 && s.debtsCleared === s.totalDebts,
  },
];

/** Returns every milestone with its current achieved state, in a fixed motivating order. */
export function computeMilestones(summary: ProgressSummary): Milestone[] {
  return MILESTONE_DEFS.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    achieved: m.check(summary),
  }));
}

export function splitMilestones(milestones: Milestone[]): { earned: Milestone[]; upcoming: Milestone[] } {
  return {
    earned: milestones.filter((m) => m.achieved),
    upcoming: milestones.filter((m) => !m.achieved),
  };
}
