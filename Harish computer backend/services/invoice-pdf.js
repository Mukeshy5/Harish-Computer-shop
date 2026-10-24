const PDFDocument = require("pdfkit");
const { drawShopHeader } = require("./print-header");

const money = (value) =>
  `INR ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function invoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 42 });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    const shop = invoice.shopSnapshot || {};
    document.on("pageAdded", () => drawShopHeader(document, shop));
    drawShopHeader(document, shop);
    document
      .fontSize(15)
      .font("Helvetica-Bold")
      .text("SALES INVOICE", { align: "right" });
    document
      .fontSize(10)
      .font("Helvetica")
      .text(`Invoice: ${invoice.number}`, { align: "right" })
      .text(`Date: ${new Date(invoice.date).toLocaleString("en-IN")}`, {
        align: "right",
      });
    document.moveDown();
    document
      .font("Helvetica-Bold")
      .text("CUSTOMER")
      .font("Helvetica")
      .text(invoice.partyName || "Customer")
      .text(invoice.partyPhone || "")
      .text(invoice.partyEmail || "")
      .text(invoice.partyAddress || "");
    if (invoice.partyGstin) document.text(`GSTIN: ${invoice.partyGstin}`);
    document.text(
      `Payment method: ${String(invoice.method || "").toUpperCase()}`,
    );
    document.moveDown();

    const columns = { product: 42, qty: 320, rate: 365, gst: 430, total: 490 };
    const drawHeader = () => {
      const y = document.y;
      document.font("Helvetica-Bold").fontSize(8);
      document.text("PRODUCT / MODEL / COVERAGE", columns.product, y, {
        width: 270,
      });
      document.text("QTY", columns.qty, y, { width: 38, align: "right" });
      document.text("RATE", columns.rate, y, { width: 55, align: "right" });
      document.text("GST", columns.gst, y, { width: 48, align: "right" });
      document.text("TOTAL", columns.total, y, { width: 63, align: "right" });
      document
        .moveTo(42, y + 16)
        .lineTo(553, y + 16)
        .stroke();
      document.y = y + 23;
    };
    drawHeader();

    for (const line of invoice.lines || []) {
      const coverage = [
        line.guaranteeEnabled ? "Guarantee" : "",
        line.warrantyEnabled || line.guaranteeEnabled
          ? `Coverage ${line.warrantyMonths || 0} months ${line.warrantyDays || 0} days`
          : "",
        line.warrantyExpiryDate
          ? `Expires ${new Date(line.warrantyExpiryDate).toLocaleDateString("en-IN")}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const description = [
        line.name,
        [
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
      const rowHeight = Math.max(
        28,
        document.heightOfString(description, { width: 265, fontSize: 8 }) + 8,
      );
      if (document.y + rowHeight > 735) {
        document.addPage();
        drawHeader();
      }
      const y = document.y;
      document.font("Helvetica").fontSize(8);
      document.text(description, columns.product, y, { width: 265 });
      document.text(String(line.quantity), columns.qty, y, {
        width: 38,
        align: "right",
      });
      document.text(money(line.rate), columns.rate, y, {
        width: 55,
        align: "right",
      });
      document.text(`${Number(line.taxRate || 0)}%`, columns.gst, y, {
        width: 48,
        align: "right",
      });
      document.text(money(line.total), columns.total, y, {
        width: 63,
        align: "right",
      });
      document.y = y + rowHeight;
    }

    if (document.y > 650) document.addPage();
    document.moveDown();
    const totals = [
      ["Subtotal", invoice.subtotal],
      ["Discount", -Number(invoice.discount || 0)],
      ["GST", invoice.tax],
      ["Other charges", invoice.charges],
      ["Total amount", invoice.total],
      ["Paid amount", invoice.paid],
      ["Pending amount", invoice.due],
    ];
    totals.forEach(([label, value]) => {
      const y = document.y;
      document
        .font(label === "Total amount" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .text(label, 360, y, { width: 100 })
        .text(money(value), 460, y, { width: 93, align: "right" });
      document.y = y + 14;
    });
    document.x = document.page.margins.left;
    document.moveDown(1.5);
    document
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Payment status: ${invoice.due <= 0 ? "Paid" : invoice.paid > 0 ? "Partial" : "Unpaid"}`,
      )
      .text(shop.receiptFooter || "Thank you for shopping with us.");
    document.moveDown(3);
    document
      .moveTo(380, document.y)
      .lineTo(540, document.y)
      .stroke()
      .fontSize(9)
      .text("Authorized signature", 380, document.y + 5, {
        width: 160,
        align: "center",
      });
    document.end();
  });
}

module.exports = { invoicePdf };
