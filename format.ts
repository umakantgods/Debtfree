/** Formats a number as INR with Indian digit grouping, e.g. 1500000 -> "₹15,00,000". */
export function formatINR(amount: number, opts: { decimals?: boolean } = {}): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: opts.decimals ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}
