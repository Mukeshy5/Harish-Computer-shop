const shop = require("../config/print-shop.json");

function drawShopHeader(document, snapshot = {}) {
  const left = document.page.margins.left;
  const width = document.page.width - left - document.page.margins.right;
  document.x = left;
  document.y = document.page.margins.top;
  document
    .fillColor("black")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(shop.name, left, document.y, { width, align: "center" });
  document
    .moveDown(0.2)
    .fontSize(10)
    .text(shop.phones.join(" · "), { width, align: "center" });
  document
    .moveDown(0.2)
    .fontSize(11)
    .text(shop.businessTitle, { width, align: "center" });
  document
    .moveDown(0.2)
    .font("Helvetica")
    .fontSize(9)
    .text(shop.services.join(" · "), { width, align: "center" });
  document.moveDown(0.2).text(shop.address, { width, align: "center" });
  document.text(shop.email, { width, align: "center" });
  if (snapshot.gstin)
    document.text(`GSTIN: ${snapshot.gstin}`, { width, align: "center" });
  const separator = document.y + 9;
  document
    .moveTo(left, separator)
    .lineTo(left + width, separator)
    .lineWidth(0.8)
    .stroke();
  document.x = left;
  document.y = separator + 14;
  document.font("Helvetica").fontSize(10);
}
module.exports = { drawShopHeader };
