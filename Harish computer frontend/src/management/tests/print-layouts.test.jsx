import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ShopHeader } from "../print/ShopHeader";
import { ServiceReceipt } from "../print/ServiceReceipt";
import shop from "../../../../Harish computer backend/config/print-shop.json";

const record = { number: "SVC-TEST-001", createdAt: "2026-10-24T10:00:00Z", customerName: "Saved Customer", customerEmail: "saved@example.test", customerPhone: "9876543210", customerAddress: "Saved address", product: "Saved Laptop", model: "Saved Model", problem: "Stored problem", solution: "Stored solution", serviceType: "Receive Customer", status: "completed", totalAmount: 1000, paidAmount: 250, pendingAmount: 750 };
describe("Reusable shop print header", () => {
  it("contains every supplied shop detail in a compact full-width header with no controls", () => {
    render(<ShopHeader details={shop} />);
    const header = screen.getByRole("banner", { name: "Shop details" });
    expect(within(header).getByRole("heading", { name: "HARISH COMPUTER" })).toBeTruthy();
    for (const value of [...shop.phones, shop.businessTitle, ...shop.services, shop.address, shop.email]) expect(header.textContent).toContain(value);
    expect(header.querySelector("input, button, select")).toBeNull();
    expect(within(header).getByRole("link", { name: shop.email }).getAttribute("href")).toBe(`mailto:${shop.email}`);
  });
  it.each([false, true])("shows saved service details below the common header (thermal: %s)", thermal => {
    render(<ServiceReceipt record={{ ...record, printShop: shop }} thermal={thermal} />);
    const receipt = screen.getByRole("article", { name: "Service receipt preview" });
    expect(receipt.firstElementChild.className).toBe("m-shop-print-header");
    for (const value of [record.number, record.customerName, record.customerEmail, record.customerPhone, record.customerAddress, record.product, record.model, record.problem, record.solution, record.serviceType, "₹1,000.00", "₹250.00", "₹750.00"]) expect(receipt.textContent).toContain(value);
    expect(receipt.classList.contains("thermal")).toBe(thermal);
    expect(document.querySelector('style[media="print"]').textContent).toContain(thermal ? "80mm" : "A4");
  });
  it("keeps a shop-received solution hidden from receipt output", () => {
    render(<ServiceReceipt record={{ ...record, serviceType: "Receive Shop", solution: "INTERNAL ONLY" }} />);
    const receipt = screen.getByRole("article", { name: "Service receipt preview" });
    expect(receipt.textContent).toContain("Receive Shop"); expect(receipt.textContent).not.toContain("INTERNAL ONLY");
  });
});
