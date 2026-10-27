import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Management } from "../Management";
import * as apiModule from "../api";

const sales = [
  {
    _id: "paid-sale",
    number: "HCS-000001",
    partyName: "Paid Buyer",
    paid: 118,
    due: 0,
  },
  {
    _id: "partial-sale",
    number: "HCS-000002",
    partyName: "Partial Buyer",
    paid: 50,
    due: 68,
  },
  {
    _id: "unpaid-sale",
    number: "HCS-000003",
    partyName: "Unpaid Buyer",
    paid: 0,
    due: 118,
  },
].map((sale) => ({
  ...sale,
  date: "2026-10-25T00:00:00Z",
  partyPhone: "9876543210",
  partyEmail: "buyer@example.test",
  total: 118,
  subtotal: 100,
  tax: 18,
  discount: 0,
  charges: 0,
  returned: 0,
  payments: [],
  returns: [],
  method: "cash",
  status: "completed",
  lines: [
    {
      name: "Laptop",
      model: "Model ABC",
      quantity: 1,
      rate: 100,
      taxRate: 18,
      total: 118,
      warrantyExpiryDate: "2027-10-25",
    },
    {
      name: "Keyboard",
      model: "Model XYZ",
      quantity: 1,
      rate: 0,
      taxRate: 0,
      total: 0,
    },
  ],
}));
function open() {
  return render(
    <MemoryRouter initialEntries={["/app/sales"]}>
      <Routes>
        <Route path="/app/*" element={<Management />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  window.print = vi.fn();
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(apiModule, "exportCsv").mockImplementation(() => {});
  vi.spyOn(apiModule.api, "get").mockImplementation(async (path, options) => {
    if (path === "/auth/me")
      return { data: { user: { _id: "admin", name: "Owner", role: "admin" } } };
    if (path === "/reports/sales") return { data: { data: sales } };
    if (path.startsWith("/sales/"))
      return {
        data: sales.find((sale) => sale._id === path.split("/").at(-1)),
      };
    if (path === "/sales") {
      const { q = "", paymentStatus = "", page = 1 } = options.params;
      const records = sales.filter((sale) => {
        const status =
          sale.due <= 0 ? "paid" : sale.paid > 0 ? "partial" : "unpaid";
        return (
          (!paymentStatus || status === paymentStatus) &&
          `${sale.number} ${sale.partyName}`
            .toLowerCase()
            .includes(q.toLowerCase())
        );
      });
      return {
        data: {
          data: Number(page) === 2 ? [] : records,
          total: records.length,
          page,
          pages: 2,
        },
      };
    }
    return { data: { data: [], total: 0, pages: 1 } };
  });
});
afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
  "preserves invoice data, expandable items and working view/print links (cards: %s)",
  async (cards) => {
    window.matchMedia.mockImplementation((query) => ({
      matches: cards && query === "(max-width: 1100px)",
      addEventListener() {},
      removeEventListener() {},
    }));
    const user = userEvent.setup();
    open();
    await screen.findByRole("link", { name: "HCS-000001" });
    const record = cards
      ? screen.getByRole("article", { name: "Invoice HCS-000001" })
      : screen.getByRole("link", { name: "HCS-000001" }).closest("tr");
    for (const value of [
      "Paid Buyer",
      "9876543210",
      "buyer@example.test",
      "Laptop / Model ABC",
      "25/10/2027",
      "₹118.00",
    ])
      expect(record.textContent).toContain(value);
    await user.click(within(record).getByText("View 1 more item"));
    expect(within(record).getByText("Keyboard / Model XYZ")).toBeTruthy();
    expect(
      within(record)
        .getByRole("link", { name: "View invoice HCS-000001" })
        .getAttribute("href"),
    ).toBe("/app/sales/paid-sale");
    expect(
      within(record)
        .getByRole("link", { name: "Print invoice HCS-000001" })
        .getAttribute("href"),
    ).toBe("/app/sales/paid-sale?print=1");
    expect(screen.getAllByText("Current page")).toHaveLength(3);
  },
);
it("resets pagination when the payment filter changes and clears date/search filters together", async () => {
  const user = userEvent.setup();
  open();
  await screen.findByRole("link", { name: "HCS-000001" });
  await user.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() =>
    expect(apiModule.api.get).toHaveBeenCalledWith(
      "/sales",
      expect.objectContaining({ params: expect.objectContaining({ page: 2 }) }),
    ),
  );
  await user.click(
    screen.getByRole("button", { name: "Partial", exact: true }),
  );
  await screen.findByRole("link", { name: "HCS-000002" });
  expect(screen.queryByRole("link", { name: "HCS-000001" })).toBeNull();
  expect(apiModule.api.get).toHaveBeenLastCalledWith(
    "/sales",
    expect.objectContaining({
      params: expect.objectContaining({ page: 1, paymentStatus: "partial" }),
    }),
  );
  await user.type(
    screen.getByRole("searchbox", { name: "Search invoices" }),
    "missing",
  );
  await screen.findByRole("heading", { name: "No matching invoices" });
  await user.click(screen.getByRole("button", { name: "Clear all filters" }));
  await screen.findByRole("link", { name: "HCS-000001" });
  expect(screen.getByRole("searchbox").value).toBe("");
  expect(
    screen
      .getByRole("button", { name: "All invoices" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
it("exports pending payments using the selected payment filter", async () => {
  const user = userEvent.setup();
  open();
  await screen.findByRole("link", { name: "HCS-000001" });
  await user.click(screen.getByRole("button", { name: "Unpaid", exact: true }));
  await screen.findByRole("link", { name: "HCS-000003" });
  await user.click(screen.getByText("Export reports"));
  await user.click(
    screen.getByRole("button", { name: "Download pending payments CSV" }),
  );
  await waitFor(() =>
    expect(apiModule.exportCsv).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          invoiceNumber: "HCS-000003",
          paymentStatus: "Unpaid",
          pendingAmount: "₹118.00",
        }),
      ],
      "pending-payments-report",
    ),
  );
  expect(document.querySelector(".sh-export").open).toBe(false);
});
it("opens the saved invoice and invokes its existing print flow", async () => {
  const user = userEvent.setup();
  open();
  await user.click(
    await screen.findByRole("link", { name: "Print invoice HCS-000001" }),
  );
  await screen.findByRole("article", { name: "Sales invoice preview" });
  await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
});
