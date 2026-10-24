const PDFDocument = require("pdfkit");
const { drawShopHeader } = require("./print-header");

const money = (value) =>
  `INR ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function serviceBillPdf(record) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    const shop = record.shopSnapshot || {};
    document.on("pageAdded", () => drawShopHeader(document, shop));
    drawShopHeader(document, shop);
    document.font("Helvetica-Bold").fontSize(16).text("SERVICE CENTER BILL");
    document
      .font("Helvetica")
      .fontSize(10)
      .text(`Bill number: ${record.number}`)
      .text(`Created: ${new Date(record.createdAt).toLocaleString("en-IN")}`)
      .text(`Service type: ${record.serviceType}`);
    document.moveDown();
    document.font("Helvetica-Bold").text("CUSTOMER");
    document
      .font("Helvetica")
      .text(record.customerName)
      .text(record.customerPhone)
      .text(record.customerEmail)
      .text(record.customerAddress || "");
    document.moveDown();
    document.font("Helvetica-Bold").text("PRODUCT / SERVICE");
    document
      .font("Helvetica")
      .text(`Product: ${record.product}`)
      .text(`Model: ${record.model || "—"}`)
      .text(`Problem: ${record.problem}`);
    if (record.serviceType === "Receive Customer" && record.solution)
      document.text(`Solution: ${record.solution}`);
    if (document.y > document.page.height - document.page.margins.bottom - 165)
      document.addPage();
    document.moveDown(1.5);
    const lines = [
      ["Total amount", record.totalAmount],
      ["Paid amount", record.paidAmount],
      ["Pending amount", record.pendingAmount],
    ];
    for (const [label, value] of lines) {
      const y = document.y;
      document.font(
        label === "Pending amount" ? "Helvetica-Bold" : "Helvetica",
      );
      document.text(label, 330, y, { width: 110 });
      document.text(money(value), 440, y, { width: 105, align: "right" });
      document.y = y + 20;
    }
    if (document.y > document.page.height - document.page.margins.bottom - 70)
      document.addPage();
    document.moveDown(3);
    document
      .moveTo(365, document.y)
      .lineTo(545, document.y)
      .stroke()
      .font("Helvetica")
      .fontSize(9)
      .text("Authorized signature", 365, document.y + 5, {
        width: 180,
        align: "center",
      });
    document.end();
  });
}

module.exports = { serviceBillPdf };
