import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Management } from "../Management";
import { api } from "../api";
import shop from "../../../../Harish computer backend/config/print-shop.json";

const sale = { _id: "sale-print-id", number: "PRINT-SALE-1", date: "2026-10-24T10:00:00Z", partyName: "Saved Buyer", partyPhone: "9876543210", partyEmail: "buyer@example.test", partyAddress: "Saved billing address", shopSnapshot: { name: "Old header" }, method: "cash", status: "completed", subtotal: 100, discount: 0, tax: 18, charges: 0, total: 118, paid: 100, due: 18, returned: 0, payments: [], returns: [], lines: [{ product: "product-id", name: "Saved Laptop", model: "Saved Model", quantity: 1, rate: 100, taxRate: 18, total: 118, discount: 0, warrantyEnabled: true, warrantyMonths: 12, warrantyDays: 15, returnedQuantity: 0 }] };
const service = { _id: "service-print-id", number: "PRINT-SVC-1", createdAt: "2026-10-24T10:00:00Z", customerName: "Saved Service Buyer", customerEmail: "service@example.test", customerPhone: "9876543210", customerAddress: "Saved service address", product: "Saved Printer", model: "Printer Model", serviceType: "Receive Customer", problem: "Saved problem", solution: "Saved solution", status: "completed", totalAmount: 1000, paidAmount: 250, pendingAmount: 750 };
sale.printShop = shop;
service.printShop = shop;
function open(path) { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/app/*" element={<Management />} /></Routes></MemoryRouter>); }
function checkHeader(article) {
  const header = article.firstElementChild;
  expect(header.className).toBe("m-shop-print-header");
  for (const value of [shop.name, ...shop.phones, shop.businessTitle, ...shop.services, shop.address, shop.email]) expect(header.textContent).toContain(value);
}
beforeEach(() => {
  window.print = vi.fn();
  vi.spyOn(api, "get").mockImplementation(async path => {
    if (path === "/auth/me") return { data: { user: { _id: "admin-id", name: "Test Owner", role: "admin" } } };
    if (path === "/sales/" + sale._id) return { data: sale };
    if (path === "/service-center") return { data: { data: [service], total: 1, page: 1, pages: 1 } };
    if (path === "/service-center/" + service._id) return { data: service };
    if (path.endsWith("/bill")) return { data: new Blob(["%PDF test"], { type: "application/pdf" }) };
    return { data: { data: [], total: 0, pages: 1 } };
  });
  vi.spyOn(api, "post").mockResolvedValue({ data: { message: "Sent successfully" } });
});
afterEach(() => vi.restoreAllMocks());
describe("Sell and service print controls", () => {
  it("fits a tall A4 invoice before native printing and restores the preview afterwards", async () => {
    const user = userEvent.setup();
    open("/app/sales/" + sale._id);
    await screen.findByRole("heading", { name: sale.number, level: 1 });
    const article = document.querySelector(".m-invoice");
    Object.defineProperty(article, "scrollHeight", { configurable: true, value: 2400 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 1043, width: 718 });
    window.dispatchEvent(new Event("beforeprint"));
    const scale = Number(article.style.getPropertyValue("--invoice-print-scale"));
    expect(scale).toBeGreaterThan(0);
    expect(2400 * scale).toBeLessThanOrEqual(1043);
    window.dispatchEvent(new Event("afterprint"));
    expect(article.style.getPropertyValue("--invoice-print-scale")).toBe("");
    Object.defineProperty(article, "scrollHeight", { configurable: true, value: 700 });
    window.dispatchEvent(new Event("beforeprint"));
    expect(article.style.getPropertyValue("--invoice-print-scale")).toBe("1");
    window.dispatchEvent(new Event("afterprint"));
    await user.selectOptions(screen.getByLabelText("Receipt format"), "thermal");
    window.dispatchEvent(new Event("beforeprint"));
    expect(article.style.getPropertyValue("--invoice-print-scale")).toBe("");
  });
  it.each(["a4", "thermal"])("preserves saved sale details and prints the common header in %s format", async format => {
    const user = userEvent.setup(); open("/app/sales/" + sale._id);
    await screen.findByRole("heading", { name: sale.number, level: 1 });
    const article = document.querySelector(".m-invoice"); checkHeader(article);
    for (const value of [sale.partyName, sale.partyPhone, sale.partyEmail, sale.partyAddress, "Saved Laptop", "Saved Model", "Warranty", "₹118.00", "₹100.00", "₹18.00"]) expect(article.textContent).toContain(value);
    await user.selectOptions(screen.getByLabelText("Receipt format"), format);
    expect(article.classList.contains("thermal")).toBe(format === "thermal");
    await user.click(screen.getByRole("button", { name: "Print" }));
    expect(window.print).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Download invoice PDF/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send via Email/ }).disabled).toBe(false);
    expect(screen.getByRole("link", { name: /Send via WhatsApp/ }).getAttribute("href")).toContain("https://wa.me/919876543210");
  });
  it("previews and prints a saved service bill while preserving its save, download, email and WhatsApp controls", async () => {
    const user = userEvent.setup(); open("/app/service-center");
    await user.click(await screen.findByRole("button", { name: "View " + service.number }));
    const article = await screen.findByRole("article", { name: "Service receipt preview" }); checkHeader(article);
    for (const value of [service.customerName, service.customerEmail, service.customerPhone, service.customerAddress, service.product, service.model, service.problem, service.solution, service.serviceType, service.number]) expect(article.textContent).toContain(value);
    expect(article.closest(".m-no-print")).toBeNull();
    expect(document.querySelector(".sc-form").closest(".m-no-print")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Service receipt format"), "thermal");
    expect(article.classList.contains("thermal")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Print service receipt" })); expect(window.print).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Save service bill/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toContain("https://wa.me/919876543210");
    URL.createObjectURL = vi.fn(() => "blob:test-service"); URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/service-center/${service._id}/bill`, { responseType: "blob" }));
    await user.click(screen.getByRole("button", { name: "Send via Gmail" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/service-center/${service._id}/send-email`, {}, { headers: { "Idempotency-Key": expect.any(String) } }));
  });
});
