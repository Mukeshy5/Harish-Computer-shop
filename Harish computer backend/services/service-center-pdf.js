const PDFDocument = require("pdfkit");
const { drawShopHeader } = require("./print-header");

const money = (value) =>
  `INR ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const a4 = [595.28, 841.89];
const margin = 28;
const halfBillHeight = (128 * 72) / 25.4;
const frameTop = margin - 6;

function drawServiceBill(document, record, textScale = 1) {
  const right = a4[0] - margin;
  const width = right - margin;
  const rule = (x1, y1, x2, y2, major = false) => {
    document
      .save()
      .lineWidth(major ? 0.75 : 0.5)
      .strokeColor(major ? "#111111" : "#444444")
      .moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke()
      .restore();
  };
  drawShopHeader(document, record.shopSnapshot || {});
  let y = document.y - 14;
  const row = (fields, total = false) => {
    const cellWidth = width / fields.length;
    const pad = 5 * textScale;
    const gap = 3 * textScale;
    const labelSize = 7 * textScale;
    const valueSize = (total ? 10 : 9) * textScale;
    const cells = fields.map(([label, value]) => {
      const text = String(value || "—");
      document.font("Helvetica-Bold").fontSize(labelSize);
      const labelHeight = document.heightOfString(label, {
        width: cellWidth - 12,
      });
      document.font(total ? "Helvetica-Bold" : "Helvetica").fontSize(valueSize);
      const valueHeight = document.heightOfString(text, {
        width: cellWidth - 12,
      });
      return {
        label,
        text,
        labelHeight,
        height: labelHeight + gap + valueHeight + pad * 2,
      };
    });
    const height = Math.max(
      26 * textScale,
      ...cells.map((cell) => cell.height),
    );
    cells.forEach((cell, index) => {
      const x = margin + index * cellWidth;
      document
        .font("Helvetica-Bold")
        .fontSize(labelSize)
        .text(cell.label, x + 6, y + pad, {
          width: cellWidth - 12,
          align: "left",
        });
      document
        .font(total ? "Helvetica-Bold" : "Helvetica")
        .fontSize(valueSize)
        .text(cell.text, x + 6, y + pad + cell.labelHeight + gap, {
          width: cellWidth - 12,
          align: "left",
        });
      if (index) rule(x, y, x, y + height);
    });
    y += height;
    rule(margin, y, right, y, total);
  };
  row([
    ["SERVICE CENTER BILL", record.number],
    [
      "Created",
      new Date(record.createdAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      }),
    ],
  ]);
  row([
    ["Customer Name", record.customerName],
    ["Customer Phone", record.customerPhone],
  ]);
  row([
    ["Customer Email", record.customerEmail],
    ["Customer Address", record.customerAddress],
  ]);
  row([
    ["Product", record.product],
    ["Model", record.model],
  ]);
  row([
    ["Received at Shop / Receive selection", record.serviceType],
    ["Service Status", record.status],
  ]);
  row([["Problem", record.problem]]);
  if (record.serviceType === "Receive Customer" && record.solution)
    row([["Solution", record.solution]]);
  row(
    [
      ["Total amount", money(record.totalAmount)],
      ["Paid amount", money(record.paidAmount)],
      ["Pending amount", money(record.pendingAmount)],
    ],
    true,
  );
  const signatureLine = y + 18 * textScale;
  rule(right - 160, signatureLine, right - 6, signatureLine);
  document
    .font("Helvetica")
    .fontSize(8 * textScale)
    .text("Authorized signature", right - 160, signatureLine + 4 * textScale, {
      width: 154,
      align: "center",
    });
  const bottom = Math.max(document.y + 6 * textScale, y + 33 * textScale);
  document
    .save()
    .lineWidth(0.75)
    .strokeColor("#111111")
    .rect(margin, frameTop, width, bottom - frameTop)
    .stroke()
    .restore();
  return bottom;
}

function serviceBillPdf(record) {
  return new Promise((resolve, reject) => {
    // Keep the A4 sheet and full printable width. Fit all saved content inside
    // its upper half by adjusting type and spacing, without truncating fields.
    const measure = new PDFDocument({ size: [a4[0], 100000], margin });
    measure.on("error", reject);
    measure.resume();
    const limit = frameTop + halfBillHeight;
    let scale = 1;
    if (drawServiceBill(measure, record) > limit) {
      let low = 0.001,
        high = 1;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = (low + high) / 2;
        if (drawServiceBill(measure, record, candidate) <= limit)
          low = candidate;
        else high = candidate;
      }
      scale = low;
    }
    measure.end();
    const document = new PDFDocument({ size: a4, margin });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    drawServiceBill(document, record, scale);
    document.end();
  });
}

module.exports = { serviceBillPdf };
