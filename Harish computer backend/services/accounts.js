const store = require("../config/store");
const { assert, amount, round } = require("../utils/errors");
// Opening balances are settled separately, so historic balances can be paid
// without inventing a backdated stock invoice.
async function settleOpening(model, id, input, user, key) {
  const kind = model === "Customer" ? "customer-opening" : "supplier-opening";
  return store.transaction(async (tx) => {
    const value = amount(input.amount, "Payment", false);
    assert(
      ["cash", "upi", "card", "bank"].includes(input.method),
      "Select a valid payment method",
    );
    const prior = (await tx.list("Payment", { requestKey: key }))[0];
    if (prior) {
      assert(
        String(prior.party) === id &&
          prior.kind === kind &&
          prior.amount === value &&
          prior.method === input.method,
        "Request key reused",
        409,
      );
      return prior;
    }
    const party = await tx.get(model, id);
    const remaining = round(party.openingBalance - (party.openingPaid || 0));
    assert(value <= remaining, "Payment exceeds remaining opening balance");
    party.openingPaid = round((party.openingPaid || 0) + value);
    party.balance = round(party.balance - value);
    await tx.save(model, party);
    const payment = await tx.insert("Payment", {
      kind,
      party: id,
      amount: value,
      method: input.method,
      user: user._id,
      reference: input.reference || "Opening balance settlement",
      requestKey: key,
    });
    await store.audit(tx, user, "account.opening-payment", model, id, {
      amount: value,
    });
    return payment;
  });
}
module.exports = { settleOpening };
