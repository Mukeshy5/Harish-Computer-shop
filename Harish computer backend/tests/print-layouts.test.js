const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { invoicePdf } = require("../services/invoice-pdf");
const { serviceBillPdf } = require("../services/service-center-pdf");
const shop = require("../config/print-shop.json");

// Read the text actually written into the generated PDF page streams.
function pageText(pdf) {
  const source = pdf.toString("latin1"), pages = [];
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content;
    try { content = zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"); } catch { continue; }
    if (!content.includes("BT")) continue;
    const lines = [];
    for (const text of content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      const bytes = [...text[1].matchAll(/<([0-9a-f]+)>/gi)].map(part => Buffer.from(part[1], "hex"));
      lines.push(new TextDecoder("windows-1252").decode(Buffer.concat(bytes)));
    }
    pages.push(lines.join("\n"));
  }
  return pages;
}
const invoice = {
  number: "TEST-PRINT-001", date: "2026-10-24T10:00:00Z", partyName: "Print Test Customer",
  partyPhone: "9876543210", partyEmail: "print@example.test", partyAddress: "Customer Address",
  method: "cash", subtotal: 100, discount: 0, tax: 18, charges: 0, total: 118, paid: 100, due: 18,
  shopSnapshot: { name: "Old shop header", phone: "0000000000", receiptFooter: "Thank you" },
  lines: [{ name: "Saved Laptop", model: "Saved Model", quantity: 1, rate: 100, taxRate: 18, total: 118, warrantyEnabled: true, warrantyMonths: 12, warrantyDays: 0, warrantyExpiryDate: "2027-10-24" }],
};
const service = {
  number: "TEST-SVC-001", createdAt: "2026-10-24T10:00:00Z", customerName: "Service Test Customer",
  customerEmail: "service@example.test", customerPhone: "9876543210", customerAddress: "Customer Address",
  product: "Saved Printer", model: "Saved Service Model", serviceType: "Receive Customer",
  problem: "Stored printing problem", solution: "Stored repair solution", totalAmount: 1000, paidAmount: 250, pendingAmount: 750,
};
function headerIsComplete(text) {
  for (const value of [shop.name, ...shop.phones, shop.businessTitle, ...shop.services, shop.address, shop.email])
    assert.ok(text.includes(value), `Missing printed shop detail: ${value}`);
  assert.ok(text.startsWith(shop.name));
}
describe("Generated PDF print layouts", () => {
  it("prints the common header before saved sale/customer/coverage/payment details", async () => {
    const pdf = await invoicePdf(invoice), pages = pageText(pdf);
    assert.equal(pages.length, 1); headerIsComplete(pages[0]);
    for (const value of [invoice.number, invoice.partyName, invoice.partyPhone, invoice.partyEmail, invoice.partyAddress, "Saved Laptop", "Saved Model", "Coverage", "Expires", "Total amount", "Paid amount", "Pending amount", "118.00", "100.00", "18.00"])
      assert.ok(pages[0].includes(value), value);
    assert.ok(!pages[0].includes("Old shop header"));
  });
  it("prints the same header before saved service and payment details", async () => {
    const pages = pageText(await serviceBillPdf(service));
    assert.equal(pages.length, 1); headerIsComplete(pages[0]);
    for (const value of [service.number, service.customerName, service.customerEmail, service.customerPhone, service.customerAddress, service.product, service.model, service.serviceType, service.problem, service.solution, "1,000.00", "250.00", "750.00"])
      assert.ok(pages[0].includes(value), value);
  });
  it("preserves the existing shop-received service privacy rule", async () => {
    const text = pageText(await serviceBillPdf({ ...service, serviceType: "Receive Shop", solution: "INTERNAL ONLY" })).join("\n");
    assert.ok(text.includes("Receive Shop")); assert.ok(!text.includes("INTERNAL ONLY"));
  });
  for (const count of [12, 30, 100]) it(`fits all ${count} sale lines and final totals on one A4 page`, async () => {
    const lines = Array.from({ length: count }, (_, i) => ({ ...invoice.lines[0], name: `Saved item ${i + 1}` }));
    const pdf = await invoicePdf({ ...invoice, lines, notes: "Keep these notes ".repeat(70) });
    const pages = pageText(pdf);
    assert.equal(pages.length, 1);
    headerIsComplete(pages[0]);
    for (let i = 1; i <= count; i++) assert.ok(pages[0].includes(`Saved item ${i}`));
    for (const value of ["Keep these notes", "Pending amount", "Authorized signature", "Thank you"])
      assert.ok(pages[0].includes(value), value);
    assert.match(pdf.toString("latin1"), /\/MediaBox \[0 0 595\.28 841\.89\]/);
  });
  it("fits long service descriptions and all totals inside the top half of one A4 page", async () => {
    const pdf = await serviceBillPdf({ ...service, customerAddress: "Long customer address ".repeat(40), problem: "Stored diagnostic detail ".repeat(90), solution: "Stored repair detail ".repeat(100) });
    const pages = pageText(pdf);
    assert.equal(pages.length, 1); headerIsComplete(pages[0]);
    for (const value of ["Long customer address", "Stored diagnostic detail", "Stored repair detail", "Pending amount", "Authorized signature"]) assert.ok(pages[0].includes(value), value);
    const streams = [...pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match => {
      try { return [zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1")]; } catch { return []; }
    });
    const frame = streams.flatMap(stream => [...stream.matchAll(/28 22 539\.28 ([\d.]+) re/g)]).at(-1);
    assert.ok(frame, "The service bill has a full-width outer frame");
    assert.ok(Number(frame[1]) <= 128 * 72 / 25.4, "The bill stays within a half-page print area");
  });
});
