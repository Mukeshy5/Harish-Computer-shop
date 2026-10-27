import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Management } from "../Management";
import { api } from "../api";

const row = (id, ageDays, status, kind = "sale") => ({
  _id: id,
  key: `${kind}:${id}`,
  kind,
  number: `HCS-${id}`,
  customerName: `Customer ${id}`,
  billDate: "2026-10-20T10:30:00Z",
  createdAt: "2026-10-20T10:30:00Z",
  total: 1180,
  ageDays,
  status,
  eligibleAt: "2026-10-25T10:30:00Z",
  deletedAt: status === "deleted" ? "2026-10-26T10:30:00Z" : null,
});
let records, enabled;
const open = () =>
  render(
    <MemoryRouter initialEntries={["/app/bill-clear"]}>
      <Routes><Route path="/app/*" element={<Management />} /></Routes>
    </MemoryRouter>,
  );
beforeEach(() => {
  enabled = true;
  records = [
    row("000001", 4, "pending"),
    row("000002", 5, "eligible"),
    row("000003", 6, "eligible", "service"),
    row("000004", 7, "deleted"),
  ];
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(api, "get").mockImplementation(
    async (path, { params = {} } = {}) => {
      if (path === "/auth/me")
        return {
          data: { user: { _id: "admin", name: "Owner", role: "admin" } },
        };
      if (path === "/bill-clear") {
        const data = records.filter(
          (bill) =>
            (!params.status || bill.status === params.status) &&
            (!params.kind || bill.kind === params.kind) &&
            (!params.q ||
              `${bill.number} ${bill.customerName}`.includes(params.q)),
        );
        return {
          data: {
            data,
            total: data.length,
            page: params.page || 1,
            pages: 1,
            summary: { pending: 1, eligible: 2, deleted: 1 },
            automation: {
              enabled,
              reason: "Deletion is paused until a backup is verified.",
              deletedCount: 0,
              failedCount: 0,
            },
          },
        };
      }
      return { data: { data: [] } };
    },
  );
  vi.spyOn(api, "request").mockImplementation(async ({ url }) => {
    const id = url.split("/").at(-1);
    records = records.map((bill) =>
      bill._id === id
        ? { ...bill, status: "deleted", deletedAt: "2026-10-27T00:00:00Z" }
        : bill,
    );
    return { data: { deleted: true } };
  });
});
afterEach(() => vi.restoreAllMocks());

it("adds the admin navigation and all bill fields with deletion safety states", async () => {
  open();
  expect(
    await screen.findByRole(
      "heading",
      { name: "Bill Clear", exact: true },
      { timeout: 5000 },
    ),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Bill Clear", exact: true })
      .getAttribute("href"),
  ).toBe("/app/bill-clear");
  await screen.findByRole("button", { name: "Delete bill HCS-000002" });
  for (const name of [
    "Bill number",
    "Customer / supplier",
    "Bill date",
    "Total amount",
    "Bill age",
    "Status",
  ])
    expect(screen.getByRole("columnheader", { name })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Delete bill HCS-000001" }).disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Delete bill HCS-000002" }).disabled,
  ).toBe(false);
  expect(
    screen.getByRole("link", { name: "Backup" }).getAttribute("href"),
  ).toBe("/api/bill-clear/sale/000004/backup");
  expect(screen.getByText("4 days")).toBeTruthy();
});
it("requires confirmation and deletes only the specific selected bill ID", async () => {
  const user = userEvent.setup();
  open();
  await user.click(
    await screen.findByRole("button", { name: "Delete bill HCS-000002" }),
  );
  const modal = screen.getByRole("dialog", { name: "Delete bill HCS-000002?" });
  expect(within(modal).getByText("Customer 000002")).toBeTruthy();
  expect(
    within(modal).getByRole("button", { name: "Delete selected bill" })
      .disabled,
  ).toBe(true);
  await user.click(within(modal).getByRole("checkbox"));
  await user.click(
    within(modal).getByRole("button", { name: "Delete selected bill" }),
  );
  expect(api.request).toHaveBeenCalledTimes(1);
  expect(api.request.mock.calls[0][0]).toMatchObject({
    method: "delete",
    url: "/bill-clear/sale/000002",
    data: { confirmNumber: "HCS-000002" },
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    screen.getByRole("button", { name: "Delete bill HCS-000003" }).disabled,
  ).toBe(false);
});
it("cancels confirmation without making a deletion request", async () => {
  const user = userEvent.setup();
  open();
  await user.click(
    await screen.findByRole("button", { name: "Delete bill HCS-000003" }),
  );
  await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.request).not.toHaveBeenCalled();
});
it("sends status, type and search filters to the backend", async () => {
  const user = userEvent.setup();
  open();
  await screen.findByRole("button", { name: "Delete bill HCS-000002" });
  await user.selectOptions(
    screen.getByLabelText("Deletion status"),
    "eligible",
  );
  await user.selectOptions(screen.getByLabelText("Bill type"), "service");
  await user.type(
    screen.getByRole("textbox", { name: "Search bill number or customer…" }),
    "000003",
  );
  await waitFor(() =>
    expect(api.get).toHaveBeenLastCalledWith(
      "/bill-clear",
      expect.objectContaining({
        params: expect.objectContaining({
          status: "eligible",
          kind: "service",
          q: "000003",
          page: 1,
        }),
      }),
    ),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Delete bill HCS-000002" }),
    ).toBeNull(),
  );
});
it("shows mobile cards with the same safe delete behavior", async () => {
  window.matchMedia.mockImplementation((query) => ({
    matches: query === "(max-width: 1000px)",
    addEventListener() {},
    removeEventListener() {},
  }));
  open();
  const card = await screen.findByRole("article", { name: "Bill HCS-000001" });
  expect(within(card).getByText("Customer 000001")).toBeTruthy();
  expect(within(card).getByText("4 days")).toBeTruthy();
  expect(
    within(card).getByRole("button", { name: "Delete bill HCS-000001" })
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole("table")).toBeNull();
});
it("keeps manual deletion disabled until backup verification and activation", async () => {
  enabled = false;
  open();
  await screen.findByText("Automatic deletion paused");
  expect(
    screen.getByRole("button", { name: "Delete bill HCS-000002" }).disabled,
  ).toBe(true);
  expect(
    screen.getByText("Deletion is paused until a backup is verified."),
  ).toBeTruthy();
});
it("keeps failed deletion reviewable and permits a safe retry", async () => {
  api.request.mockRejectedValueOnce({
    response: {
      status: 409,
      data: {
        error: {
          message: "This bill has not completed five full days since creation",
        },
      },
    },
  });
  const user = userEvent.setup();
  open();
  await user.click(
    await screen.findByRole("button", { name: "Delete bill HCS-000002" }),
  );
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Delete selected bill" }),
  );
  expect(
    await screen.findByText(
      "This bill has not completed five full days since creation",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Delete selected bill" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("does not render Bill Clear for a legacy staff session", async () => {
  api.get.mockResolvedValue({ data: { user: { role: "staff" } } });
  open();
  expect(
    await screen.findByRole("heading", { name: "Admin login", exact: true }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Bill Clear", exact: true }),
  ).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Bill Clear", exact: true }),
  ).toBeNull();
});
