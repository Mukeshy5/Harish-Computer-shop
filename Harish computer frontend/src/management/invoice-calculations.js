export const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export function invoicePreview(lines, billDiscount = 0, charges = 0) {
  const calculated = lines.map((line) => {
    const raw =
      Number(line.quantity) * Number(line.rate) - Number(line.discount);
    const taxable =
      Number.isFinite(raw) && Number.isSafeInteger(Math.round(raw * 100))
        ? roundMoney(Math.max(0, raw))
        : 0;
    return { ...line, taxable };
  });
  const weights = calculated.map((line) => Math.round(line.taxable * 100));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const requested = Math.min(
    sum,
    Math.max(0, Math.round((Number(billDiscount) || 0) * 100)),
  );
  const shares = weights.map((weight, index) => {
    const numerator = BigInt(weight) * BigInt(requested);
    return {
      index,
      amount: sum ? Number(numerator / BigInt(sum)) : 0,
      remainder: sum ? numerator % BigInt(sum) : 0n,
    };
  });
  [...shares]
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    )
    .slice(0, requested - shares.reduce((total, s) => total + s.amount, 0))
    .forEach((s) => s.amount++);
  const result = calculated.map((line, index) => {
    const taxable = roundMoney(line.taxable - shares[index].amount / 100);
    const tax = roundMoney((taxable * Number(line.taxRate)) / 100);
    return { ...line, taxable, tax, total: roundMoney(taxable + tax) };
  });
  const subtotal = roundMoney(
    lines.reduce(
      (total, line) => total + Number(line.quantity) * Number(line.rate),
      0,
    ),
  );
  const lineDiscount = roundMoney(
    lines.reduce((total, line) => total + Number(line.discount), 0),
  );
  const tax = roundMoney(result.reduce((total, line) => total + line.tax, 0));
  return {
    lines: result,
    subtotal,
    lineDiscount,
    invoiceDiscount: requested / 100,
    discount: roundMoney(lineDiscount + requested / 100),
    tax,
    total: roundMoney(
      subtotal - lineDiscount - requested / 100 + tax + Number(charges || 0),
    ),
    maxDiscount: roundMoney(subtotal - lineDiscount),
  };
}

export function coverageText(line) {
  const duration = `${line.warrantyMonths || 0} months, ${line.warrantyDays || 0} days`;
  const start = line.warrantyStartDate
    ? new Date(line.warrantyStartDate).toLocaleDateString("en-IN")
    : "";
  const expiry = line.warrantyExpiryDate
    ? new Date(line.warrantyExpiryDate).toLocaleDateString("en-IN")
    : "";
  return (
    [
      line.guaranteeEnabled ? `Guarantee: ${duration}` : null,
      line.warrantyEnabled ? `Warranty: ${duration}` : null,
      start ? `Starts ${start}` : null,
      expiry ? `Expires ${expiry}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "No guarantee / warranty"
  );
}
