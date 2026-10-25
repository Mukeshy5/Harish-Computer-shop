const PDFDocument = require("pdfkit");
const { drawShopHeader } = require("./print-header");

const money = (value) =>
  `INR ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const margin = 28;
const a4 = [595.28, 841.89];
const layoutHeight = 100000;

function drawInvoice(document, invoice) {
  const shop = invoice.shopSnapshot || {};
  const right = a4[0] - margin;
  const width = right - margin;
  drawShopHeader(document, shop);
  let y = document.y;
  document
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("SALES INVOICE", margin, y, { width: 230 });
  document
    .font("Helvetica")
    .fontSize(9)
    .text(`Invoice: ${invoice.number}`, 310, y, {
      width: right - 310,
      align: "right",
    })
    .text(
      `Date: ${new Date(invoice.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      { align: "right" },
    );
  y = document.y + 12;
  document
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("CUSTOMER", margin, y, { width: 300 });
  document
    .font("Helvetica")
    .text(
      [
        invoice.partyName || "Customer",
        invoice.partyPhone,
        invoice.partyEmail,
        invoice.partyAddress,
        invoice.partyGstin ? `GSTIN: ${invoice.partyGstin}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      margin,
      document.y + 4,
      { width: 300 },
    );
  const customerBottom = document.y;
  document
    .fontSize(9)
    .text(`Payment: ${String(invoice.method || "").toUpperCase()}`, 350, y, {
      width: right - 350,
      align: "right",
    });
  document.y = Math.max(customerBottom, document.y) + 14;

  const columns = [
    { label: "PRODUCT / MODEL / COVERAGE", x: margin, width: 225 },
    { label: "QTY", x: 261, width: 28 },
    { label: "RATE", x: 297, width: 74 },
    { label: "DISCOUNT", x: 379, width: 62 },
    { label: "GST", x: 449, width: 32 },
    { label: "AMOUNT", x: 489, width: right - 489 },
  ];
  y = document.y;
  document
    .rect(margin, y - 5, width, 22)
    .fill("#edf2f7")
    .fillColor("black");
  document.font("Helvetica-Bold").fontSize(8);
  columns.forEach((column, index) =>
    document.text(column.label, column.x, y, {
      width: column.width,
      align: index ? "right" : "left",
    }),
  );
  y += 23;
  for (const line of invoice.lines || []) {
    const coverage = [
      line.guaranteeEnabled
        ? "Guarantee"
        : line.warrantyEnabled
          ? "Warranty"
          : "",
      line.warrantyEnabled || line.guaranteeEnabled
        ? `Coverage ${line.warrantyMonths || 0} months ${line.warrantyDays || 0} days`
        : "",
      line.warrantyExpiryDate
        ? `Expires ${new Date(line.warrantyExpiryDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const description = [
      line.name,
      [
        line.sku,
        line.categoryName,
        line.productType,
        line.model,
        line.size,
        line.colour,
      ]
        .filter(Boolean)
        .join(" / "),
      coverage,
    ]
      .filter(Boolean)
      .join("\n");
    const values = [
      description,
      String(line.quantity),
      money(line.rate),
      money(line.discount),
      `${Number(line.taxRate || 0)}%`,
      money(line.total),
    ];
    document.font("Helvetica").fontSize(8);
    const rowHeight = Math.max(
      22,
      ...columns.map(
        (column, index) =>
          document.heightOfString(values[index], { width: column.width }) + 10,
      ),
    );
    columns.forEach((column, index) =>
      document.text(values[index], column.x, y, {
        width: column.width,
        align: index ? "right" : "left",
      }),
    );
    y += rowHeight;
    document
      .moveTo(margin, y - 5)
      .lineTo(right, y - 5)
      .lineWidth(0.4)
      .strokeColor("#dbe2ea")
      .stroke();
  }

  y += 8;
  const summaryTop = y;
  const totals = [
    ["Subtotal", invoice.subtotal],
    ["Discount", -Number(invoice.discount || 0)],
    ["GST", invoice.tax],
    ["Other charges", invoice.charges],
    ["Total amount", invoice.total],
    ...(invoice.returned > 0
      ? [
          ["Returned / reversed", -invoice.returned],
          ["Net total", invoice.total - invoice.returned],
        ]
      : []),
    ["Paid amount", invoice.paid],
    ["Pending amount", invoice.due],
    ...(invoice.change > 0 ? [["Cash change", invoice.change]] : []),
  ];
  totals.forEach(([label, value]) => {
    document
      .font(label === "Total amount" ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9);
    const labelHeight = document.heightOfString(label, { width: 110 });
    const valueHeight = document.heightOfString(money(value), {
      width: right - 460,
    });
    document
      .text(label, 342, y, { width: 110 })
      .text(money(value), 460, y, { width: right - 460, align: "right" });
    y += Math.max(14, labelHeight + 3, valueHeight + 3);
  });
  document.font("Helvetica").fontSize(9);
  let notesBottom = summaryTop;
  if (invoice.notes) {
    document.text(invoice.notes, margin, summaryTop, { width: 290 });
    notesBottom = document.y;
  }
  y = Math.max(y, notesBottom) + 14;
  document.text(
    `Payment status: ${invoice.due <= 0 ? "Paid" : invoice.paid > 0 ? "Partial" : "Unpaid"}`,
    margin,
    y,
    { width },
  );
  document.text(
    shop.receiptFooter || "Thank you for shopping with us.",
    margin,
    document.y + 5,
    { width },
  );
  y = document.y + 28;
  document.moveTo(390, y).lineTo(right, y).strokeColor("#444444").stroke();
  document
    .fontSize(8)
    .text("Authorized signature", 390, y + 5, {
      width: right - 390,
      align: "center",
    });
  return document.y + 2;
}

function invoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    // Lay out once at the real A4 width, then scale the complete content to one
    // A4 page. Keep every line, note, total and signature rather than clipping.
    const measure = new PDFDocument({ size: [a4[0], layoutHeight], margin });
    measure.on("error", reject);
    measure.resume();
    const bottom = drawInvoice(measure, invoice);
    measure.end();
    const scale = Math.min(1, (a4[1] - margin * 2) / (bottom - margin));
    const document = new PDFDocument({ size: a4, margin });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document
      .save()
      .translate(margin, margin)
      .scale(scale)
      .translate(-margin, -margin);
    // PDFKit's line wrapping uses page.height. The physical MediaBox stays A4.
    document.page.height = layoutHeight;
    drawInvoice(document, invoice);
    document.page.height = a4[1];
    document.restore().end();
  });
}

module.exports = { invoicePdf };
