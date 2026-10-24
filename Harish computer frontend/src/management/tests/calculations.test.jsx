import { expect, it } from "vitest";
import { createRequire } from "node:module";
import { invoicePreview, roundMoney } from "../invoice-calculations";
const require = createRequire(import.meta.url);
const {
  applyInvoiceDiscount,
} = require("../../../../Harish computer backend/utils/invoice-discount.js");

it("matches server discount allocation and mixed GST calculations across invoice combinations", () => {
  let seed = 27;
  const random = (max) => {
    seed = (seed * 16807) % 2147483647;
    return seed % max;
  };
  for (let scenario = 0; scenario < 150; scenario++) {
    const lines = Array.from({ length: 1 + random(8) }, () => {
      const quantity = 1 + random(5),
        rate = roundMoney((1 + random(100000)) / 100),
        discount = roundMoney(
          random(Math.round(quantity * rate * 100) + 1) / 100,
        );
      return {
        quantity,
        rate,
        discount,
        taxRate: [0, 5, 12, 18, 28][random(5)],
      };
    });
    const raw = lines.map((l) => ({
      ...l,
      taxable: roundMoney(l.quantity * l.rate - l.discount),
    }));
    const maxDiscount = roundMoney(raw.reduce((s, l) => s + l.taxable, 0));
    const discount = roundMoney(
      random(Math.round(maxDiscount * 100) + 1) / 100,
    );
    const frontend = invoicePreview(lines, discount);
    const server = applyInvoiceDiscount(raw, discount, "sale");
    expect(
      frontend.lines.map((l) => ({
        taxable: l.taxable,
        tax: l.tax,
        total: l.total,
      })),
    ).toEqual(
      server.map((l) => ({ taxable: l.taxable, tax: l.tax, total: l.total })),
    );
    expect(frontend.total).toBe(
      roundMoney(server.reduce((s, l) => s + l.total, 0)),
    );
  }
});
