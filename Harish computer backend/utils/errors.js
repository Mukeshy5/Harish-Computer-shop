class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const assert = (condition, message, status = 400) => {
  if (!condition) throw new AppError(status, message);
};
const pick = (data, keys) =>
  Object.fromEntries(
    keys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]),
  );
const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function amount(value, label = "Amount", allowZero = true) {
  const n = Number(value);
  assert(
    Number.isFinite(n) &&
      n >= (allowZero ? 0 : 0.01) &&
      n <= 1e9 &&
      Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
    `${label} must be a valid amount with at most two decimals`,
  );
  return round(n);
}
function quantity(value, label = "Quantity", zero = false) {
  const n = Number(value);
  assert(
    Number.isSafeInteger(n) && n >= (zero ? 0 : 1) && n <= 1e8,
    `${label} must be a ${zero ? "non-negative" : "positive"} whole number`,
  );
  return n;
}
module.exports = { AppError, assert, pick, round, amount, quantity };
