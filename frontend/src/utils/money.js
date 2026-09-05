/**
 * Rupees, formatted the way Indian money is read.
 *
 * WHY THIS IS SHARED
 *   The same one-liner had been copied into the earnings page and the payouts
 *   page, and every other screen printed `₹{value}` raw - so ₹120000 appeared
 *   as "₹120000" on one screen and "₹1,20,000" on the next.
 *
 * WHY THE DECIMALS ARE CONDITIONAL
 *   The copies used toLocaleString with no options, which rounds to whole
 *   rupees. Commission on a small line is genuinely a few paise - 8% of ₹2 is
 *   ₹0.16 - and that was being shown as "₹0", which reads as "we took nothing"
 *   rather than "we took sixteen paise". Whole amounts stay clean (₹1,450, not
 *   ₹1,450.00); anything with paise keeps them.
 */
export const money = (value) => {
  const n = Number(value || 0);
  const hasPaise = Math.round(n * 100) % 100 !== 0;

  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

export default money;
