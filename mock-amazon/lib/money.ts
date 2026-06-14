// All money is stored as integer cents to avoid floating-point drift.

/** "$1,299.00" style full string. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/**
 * Split a cents amount into whole-dollar and 2-digit cents parts so the UI can
 * render Amazon's signature superscript cents (e.g. $19⁹⁹).
 */
export function formatPriceParts(cents: number): { whole: string; frac: string } {
  const whole = Math.floor(cents / 100).toLocaleString("en-US");
  const frac = String(cents % 100).padStart(2, "0");
  return { whole, frac };
}
