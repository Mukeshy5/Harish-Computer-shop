const shop = require("../config/print-shop.json");

function drawShopHeader(document, snapshot = {}) {
  const left = document.page.margins.left;
  const width = document.page.width - left - document.page.margins.right;
  const textLeft = left + 6;
  const textWidth = width - 12;
  document.x = left;
  document.y = document.page.margins.top;
  document
    .fillColor("black")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(shop.name, textLeft, document.y, { width: textWidth * 0.48 });
  const nameBottom = document.y;
  document
    .fontSize(8.5)
    .text(
      shop.phones.join(" · "),
      textLeft + textWidth * 0.48,
      document.page.margins.top + 4,
      {
        width: textWidth * 0.52,
        align: "right",
      },
    );
  let y = Math.max(nameBottom, document.y) + 3;
  document.fontSize(8).text(shop.businessTitle, textLeft, y, { width: 66 });
  const titleBottom = document.y;
  document
    .font("Helvetica")
    .fontSize(7.5)
    .text(shop.services.join(" · "), textLeft + 70, y, { width: textWidth - 70 });
  y = Math.max(titleBottom, document.y) + 3;
  document.fontSize(8).text(shop.address, textLeft, y, { width: textWidth * 0.62 });
  const addressBottom = document.y;
  document.text(shop.email, textLeft + textWidth * 0.62, y, {
    width: textWidth * 0.38,
    align: "right",
  });
  document.y = Math.max(addressBottom, document.y);
  if (snapshot.gstin)
    document
      .fontSize(7.5)
      .text(`GSTIN: ${snapshot.gstin}`, textLeft, document.y + 3, { width: textWidth });
  const separator = document.y + 6;
  document
    .moveTo(left, separator)
    .lineTo(left + width, separator)
    .lineWidth(0.75)
    .strokeColor("#111111")
    .stroke();
  document.x = left;
  document.y = separator + 14;
  document.font("Helvetica").fontSize(10);
}
module.exports = { drawShopHeader };
