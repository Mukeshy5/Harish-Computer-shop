const { assert, pick } = require("../utils/errors");
function contact(data, fields) {
  const input = pick(data, fields);
  if (input.phone) {
    assert(
      typeof input.phone === "string" &&
        /^[+\d][\d ()-]{5,25}$/.test(input.phone),
      "Enter a valid phone number",
    );
    input.phone = input.phone.trim();
  }
  if (input.email) {
    assert(
      typeof input.email === "string" &&
        input.email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email),
      "Enter a valid email address",
    );
    input.email = input.email.trim().toLowerCase();
  }
  if (input.gstin) {
    assert(typeof input.gstin === "string", "Enter a valid GSTIN");
    input.gstin = input.gstin.trim().toUpperCase();
    assert(
      /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(input.gstin),
      "GSTIN must contain a valid 15-character GST identifier",
    );
  }
  if (input.name !== undefined)
    assert(
      typeof input.name === "string" &&
        input.name.trim().length > 0 &&
        input.name.length <= 200,
      "Name must contain 1–200 characters",
    );
  return input;
}
function imageUrl(value) {
  if (!value) return;
  let url;
  try {
    url = new URL(value);
  } catch {
    assert(false, "Enter a valid image URL");
  }
  assert(
    ["https:", "http:"].includes(url.protocol),
    "Image URLs must use HTTP or HTTPS",
  );
}
module.exports = { contact, imageUrl };
