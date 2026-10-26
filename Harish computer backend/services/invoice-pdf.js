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

function drawInvoice(document, invoice, scale = 1) {
  const shop = invoice.shopSnapshot || {};
  const right = a4[0] - margin;
  const width = right - margin;
  const inset = 6;
  const divider = 334;
  // Keep rules visible at their physical print weight when a long invoice is
  // scaled to A4. Paths are drawn once so adjacent cells share their borders.
  const rule = (x1, y1, x2, y2, major = false) => {
    document
      .save()
      .lineWidth((major ? 0.75 : 0.5) / scale)
      .strokeColor(major ? "#111111" : "#444444")
      .moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke()
      .restore();
  };
  drawShopHeader(document, shop);
  let y = document.y;
  const metaTop = y - 14;
  document
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("SALES INVOICE", margin + inset, y, { width: 230 });
  document
    .font("Helvetica")
    .fontSize(9)
    .text(`Invoice: ${invoice.number}`, 310, y, {
      width: right - 310 - inset,
      align: "right",
    })
    .text(
      `Date: ${new Date(invoice.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      { align: "right" },
    );
  const metaBottom = document.y + 8;
  rule(300, metaTop, 300, metaBottom);
  rule(margin, metaBottom, right, metaBottom);
  y = metaBottom + 8;
  document
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("CUSTOMER", margin + inset, y, {
      width: width - inset * 2,
    });
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
      margin + inset,
      document.y + 4,
      { width: width - inset * 2 },
    );
  const tableTop = document.y + 8;
  rule(margin, tableTop, right, tableTop, true);

  const edges = [margin, 257, 293, 375, 445, 485, right];
  const columns = [
    "PRODUCT / MODEL / COVERAGE", "QTY", "RATE", "DISCOUNT", "GST", "AMOUNT",
  ].map((label, index) => ({
    label,
    x: edges[index] + 4,
    width: edges[index + 1] - edges[index] - 8,
  }));
  document.font("Helvetica-Bold").fontSize(8);
  const headerHeight = Math.max(
    22,
    ...columns.map(
      (column) => document.heightOfString(column.label, { width: column.width }) + 12,
    ),
  );
  columns.forEach((column, index) =>
    document.text(column.label, column.x, tableTop + 6, {
      width: column.width,
      align: index ? "right" : "left",
    }),
  );
  y = tableTop + headerHeight;
  rule(margin, y, right, y, true);
  for (const [index, line] of (invoice.lines || []).entries()) {
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
      document.text(values[index], column.x, y + 5, {
        width: column.width,
        align: index ? "right" : "left",
      }),
    );
    y += rowHeight;
    // The last row's bottom rule is the major summary boundary below.
    if (index < invoice.lines.length - 1) rule(margin, y, right, y);
  }

  if (invoice.lines?.length) rule(margin, y, right, y, true);
  edges.slice(1, -1).forEach((x) => rule(x, tableTop, x, y));
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
  totals.forEach(([label, value], index) => {
    const major = label === "Total amount" || label === "Net total";
    if (index) rule(divider, y, right, y, major);
    document
      .font(major ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9);
    const labelHeight = document.heightOfString(label, { width: 110 });
    const valueHeight = document.heightOfString(money(value), {
      width: right - 460 - inset,
    });
    document
      .text(label, 342, y + 5, { width: 110 })
      .text(money(value), 460, y + 5, {
        width: right - 460 - inset,
        align: "right",
      });
    y += Math.max(18, labelHeight + 10, valueHeight + 10);
  });
  document.font("Helvetica").fontSize(9);
  let notesBottom = summaryTop;
  if (invoice.notes) {
    document.text(invoice.notes, margin + inset, summaryTop + 6, {
      width: divider - margin - inset * 2,
    });
    notesBottom = document.y + 6;
  }
  y = Math.max(y, notesBottom);
  rule(divider, summaryTop, divider, y);
  rule(margin, y, right, y, true);
  document.text(
    `PAYMENT METHOD: ${String(invoice.method || "").toUpperCase()}`,
    margin + inset,
    y + 8,
    { width: width / 2 - inset * 2 },
  );
  let paymentBottom = document.y + 8;
  if (invoice.status) {
    document.text(
      `INVOICE STATUS: ${invoice.status}`,
      margin + width / 2 + inset,
      y + 8,
      { width: width / 2 - inset * 2 },
    );
    paymentBottom = Math.max(paymentBottom, document.y + 8);
    rule(margin + width / 2, y, margin + width / 2, paymentBottom);
  }
  y = paymentBottom;
  rule(margin, y, right, y);
  document.text(
    `Payment status: ${invoice.due <= 0 ? "Paid" : invoice.paid > 0 ? "Partial" : "Unpaid"}`,
    margin + inset,
    y + 8,
    { width: width - inset * 2 },
  );
  y = document.y + 8;
  rule(margin, y, right, y);
  document.text(
    shop.receiptFooter || "Thank you for shopping with us.",
    margin + inset,
    y + 8,
    { width: width - inset * 2 },
  );
  const signatureTop = document.y + 8;
  rule(margin, signatureTop, right, signatureTop);
  y = signatureTop + 28;
  rule(390, y, right - inset, y);
  document
    .fontSize(8)
    .text("Authorized signature", 390, y + 5, {
      width: right - 390 - inset,
      align: "center",
    });
  const bottom = document.y + 8;
  document
    .save()
    .lineWidth(0.75 / scale)
    .strokeColor("#111111")
    .rect(margin, margin - inset, width, bottom - margin + inset)
    .stroke()
    .restore();
  return bottom;
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
    drawInvoice(document, invoice, scale);
    document.page.height = a4[1];
    document.restore().end();
  });
}

module.exports = { invoicePdf };
