const { assert, round } = require("./errors");

// Allocate whole paise by largest remainder. Line allocations sum exactly to
// the bill discount, including mixed GST rates and partial return scenarios.
function applyInvoiceDiscount(lines, discount, kind) {
  const weights = lines.map((line) => Math.round(line.taxable * 100));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const requested = Math.round(discount * 100);
  assert(
    Number.isSafeInteger(total),
    "Invoice value exceeds supported precision",
  );
  assert(
    requested <= total,
    "Bill discount cannot exceed the remaining product value",
  );
  if (!requested) return lines;
  const shares = weights.map((weight, index) => {
    const numerator = BigInt(weight) * BigInt(requested);
    return {
      index,
      amount: Number(numerator / BigInt(total)),
      remainder: numerator % BigInt(total),
    };
  });
  const unallocated =
    requested - shares.reduce((sum, share) => sum + share.amount, 0);
  [...shares]
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    )
    .slice(0, unallocated)
    .forEach((share) => share.amount++);
  return lines.map((line, index) => {
    const allocated = shares[index].amount / 100;
    const taxable = round(line.taxable - allocated);
    const tax = round((taxable * line.taxRate) / 100);
    return {
      ...line,
      discount: round(line.discount + allocated),
      taxable,
      tax,
      total: round(taxable + tax),
      ...(kind === "purchase"
        ? { unitCost: round(taxable / line.quantity) }
        : {}),
    };
  });
}
module.exports = { applyInvoiceDiscount };
