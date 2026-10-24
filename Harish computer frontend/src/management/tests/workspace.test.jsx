import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Management } from "../Management";
import { api, exportCsv } from "../api";
const admin = {
  _id: "admin-test-id",
  name: "Test Owner",
  email: "owner@example.test",
  role: "admin",
  permissions: {},
};
const staff = { ...admin, role: "staff", permissions: {} };
const removedModules = [
  "purchases",
  "customers",
  "suppliers",
  "payments",
  "expenses",
  "reports",
  "staff",
];
const product = {
  _id: "product-test-id",
  name: "Test SSD",
  sku: "TEST-SSD",
  barcode: "123456",
  sellingPrice: 300,
  purchasePrice: 100,
  averageCost: 100,
  stock: 5,
  minStock: 2,
  taxRate: 18,
  unit: "piece",
  active: true,
  productType: "Storage",
  model: "SSD-256",
  size: "256GB",
  companyName: "Test company",
  colour: "Black",
  description: "",
  image: "",
};
const invoice = {
  _id: "invoice-test-id",
  number: "TEST-000001",
  date: new Date().toISOString(),
  partyName: "Walk-in customer",
  partyPhone: "9876543210",
  partyEmail: "buyer@example.test",
  method: "cash",
  status: "completed",
  subtotal: 600,
  discount: 20,
  tax: 104.4,
  charges: 0,
  total: 684.4,
  paid: 684.4,
  due: 0,
  returned: 0,
  payments: [],
  returns: [],
  shopSnapshot: { name: "Test Shop" },
  lines: [
    {
      product: product._id,
      name: product.name,
      sku: product.sku,
      quantity: 2,
      rate: 300,
      discount: 20,
      taxRate: 18,
      total: 684.4,
      returnedQuantity: 0,
    },
  ],
};
const dashboard = {
  totalProducts: 1,
  stockUnits: 5,
  todaySales: 0,
  collections: 0,
  grossProfit: 0,
  inventoryValue: 500,
  lowStock: 0,
  outOfStock: 0,
  recentSales: [],
  alerts: [],
  trend: [],
};
const list = (rows) => ({ data: rows, total: rows.length, pages: 1, page: 1 });
const savedContact = {
  _id: "contact-test-id",
  name: "Test Buyer",
  phone: "9876543210",
  email: "buyer@gmail.com",
  address: "Test billing address",
  gstin: "27ABCDE1234F1Z5",
};
let customerRecords,
  supplierRecords,
  invoiceRecord,
  dashboardRecord,
  catalogRecords;
let currentUser;
let canCreateAdmin;
function open(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/*" element={<Management />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  currentUser = admin;
  canCreateAdmin = false;
  customerRecords = [];
  supplierRecords = [];
  invoiceRecord = invoice;
  dashboardRecord = dashboard;
  catalogRecords = [product];
  vi.spyOn(api, "get").mockImplementation(async (path) => {
    if (path === "/auth/setup-status") return { data: { canCreateAdmin } };
    if (path === "/auth/me") {
      if (!currentUser) throw { response: { status: 401 } };
      return { data: { user: currentUser } };
    }
    if (path === "/reports/dashboard") return { data: dashboardRecord };
    if (path === "/products") return { data: list(catalogRecords) };
    if (path === "/customers") return { data: list(customerRecords) };
    if (path === "/suppliers") return { data: list(supplierRecords) };
    if (path === "/categories" || path === "/brands")
      return {
        data: list([
          { _id: "catalog-group-id", name: "Test group", active: true },
        ]),
      };
    if (path === "/inventory/summary")
      return {
        data: { uniqueProducts: 1, totalUnits: 5, valuation: 500 },
      };
    if (path === "/reports/inventory")
      return {
        data: list([
          {
            product: product.name,
            sku: product.sku,
            available: 5,
            valuation: 500,
            discrepancy: 0,
          },
        ]),
      };
    if (path === "/inventory/movements")
      return {
        data: list([
          {
            _id: "movement-id",
            type: "adjustment",
            product: product._id,
            previousQuantity: 4,
            quantity: 1,
            newQuantity: 5,
            reason: "Stock correction",
          },
        ]),
      };
    if (path === "/products/" + product._id) return { data: product };
    if (path === "/settings")
      return {
        data: {
          name: "Test Shop",
          minStock: 5,
          defaultTax: 18,
          salePrefix: "TEST",
          purchasePrefix: "PUR",
          allowCreditSales: true,
        },
      };
    if (
      path === "/sales/" + invoice._id ||
      path === "/purchases/" + invoice._id
    )
      return { data: invoiceRecord };
    return { data: list([]) };
  });
  vi.spyOn(api, "post").mockResolvedValue({ data: { user: admin } });
  vi.spyOn(api, "request").mockResolvedValue({ data: invoice });
});
describe("Admin sell workspace", () => {
  it.each([false, true])(
    "shows only retained admin navigation and dashboard actions (existing sales: %s)",
    async (hasSales) => {
      dashboardRecord = {
        ...dashboard,
        recentSales: hasSales ? [invoice] : [],
      };
      open("/app");
      await screen.findByRole("heading", { name: /Good .*, Test/ });
      for (const link of screen.getAllByRole("link"))
        expect(removedModules).not.toContain(
          link.getAttribute("href").split("/")[2],
        );
      for (const name of [
        "Purchases",
        "Customers",
        "Suppliers",
        "Payments",
        "Expenses",
        "Reports",
        "Staff members",
      ])
        expect(screen.queryByRole("link", { name })).toBeNull();
      for (const text of [
        "Recent sales",
        "Sales overview",
        "New sale",
        "Record purchase",
        "Today’s purchases",
        "Customer dues",
        "Supplier dues",
        "Today’s expenses",
      ])
        expect(screen.queryByText(text)).toBeNull();
      for (const name of [
        "Overview",
        "Sell",
        "Sales history",
        "Service Center",
        "Products",
        "Stock & inventory",
        "Stock adjustments",
        "Stock alerts",
        "Categories & brands",
        "Activity log",
        "Shop settings",
      ])
        expect(screen.getByRole("link", { name })).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: /Add a product/ })
          .getAttribute("href"),
      ).toBe("/app/products/new");
      expect(
        screen
          .getByRole("link", { name: /View inventory/ })
          .getAttribute("href"),
      ).toBe("/app/inventory");
      expect(
        screen.getByRole("link", { name: /Adjust stock/ }).getAttribute("href"),
      ).toBe("/app/adjustments");
    },
  );

  it.each([
    ...removedModules.flatMap((module) => [
      `/app/${module}`,
      `/app/${module}/record-id`,
    ]),
    "/app/purchases/new",
    "/app/reports/?type=sales",
  ])("returns page not found for an old admin URL: %s", async (path) => {
    open(path);
    await screen.findByRole("heading", { name: "Page not found" });
    await waitFor(() =>
      expect(api.get.mock.calls.map(([url]) => url).sort()).toEqual(
        ["/auth/me", "/inventory/low-stock"].sort(),
      ),
    );
    expect(api.request).not.toHaveBeenCalled();
  });

  it.each([
    ["pos", "Point of sale"],
    ["service-center", "Service Center"],
    ["products", "Product catalog"],
    ["products/new", "Add a product"],
    [`products/${product._id}/edit`, "Edit product"],
    ["sales", "Sales invoices"],
    ["inventory", "Stock & inventory"],
    ["adjustments", "Stock adjustment"],
    ["stock-counts", "Physical stock count"],
    ["alerts", "Stock alerts"],
    ["categories", "Categories"],
    ["brands", "Brands"],
    ["audit-logs", "Activity log"],
    ["settings", "Shop settings"],
    ["profile", "Your profile"],
  ])(
    "renders the retained admin page /app/%s without console errors",
    async (path, title) => {
      const errors = vi.spyOn(console, "error");
      open(`/app/${path}`);
      await screen.findByRole("heading", { name: title, level: 1 });
      expect(
        screen.queryByRole("heading", { name: "Page not found" }),
      ).toBeNull();
      expect(errors).not.toHaveBeenCalled();
    },
  );

  it("opens saved sales invoices from the sales history", async () => {
    open(`/app/sales/${invoice._id}`);
    await screen.findByRole("heading", { name: invoice.number, level: 1 });
    expect(screen.getByRole("button", { name: /Download invoice PDF/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toBeTruthy();
  });

  it("shows the solution only for Receive Customer service type", async () => {
    const user = userEvent.setup();
    open("/app/service-center");
    await screen.findByRole("heading", { name: "Service Center", level: 1 });
    expect(screen.getByRole("textbox", { name: /Enter problem/ })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /Enter solution/ })).toBeNull();
    const serviceType = screen.getByLabelText(/Service type/);
    await user.selectOptions(serviceType, "Receive Customer");
    expect(screen.getByRole("textbox", { name: /Enter problem/ }).required).toBe(true);
    expect(screen.getByRole("textbox", { name: /Enter solution/ }).required).toBe(true);
    await user.selectOptions(serviceType, "Receive Shop");
    expect(screen.queryByRole("textbox", { name: /Enter solution/ })).toBeNull();
  });

  it("submits shop-received service bills without a solution field", async () => {
    const user = userEvent.setup();
    open("/app/service-center");
    await screen.findByRole("heading", { name: "Service Center", level: 1 });
    await user.type(screen.getByRole("textbox", { name: /Customer name/ }), "Test Customer");
    await user.type(screen.getByRole("textbox", { name: /Customer email/ }), "customer@example.test");
    await user.type(screen.getByRole("textbox", { name: /Customer phone/ }), "9876543210");
    await user.type(screen.getByRole("textbox", { name: /^Product/ }), "Laptop");
    await user.type(screen.getByRole("textbox", { name: /Enter problem/ }), "Not turning on");
    await user.type(screen.getByRole("spinbutton", { name: /Total amount/ }), "1000");
    await user.type(screen.getByRole("spinbutton", { name: /Paid amount/ }), "250");
    expect(screen.getByLabelText(/Pending amount/).textContent).toContain("750");
    fireEvent.submit(document.querySelector(".sc-form"));
    await waitFor(() => expect(api.request).toHaveBeenCalled());
    const requestBody = api.request.mock.calls.at(-1)[0].data;
    expect(requestBody.serviceType).toBe("Receive Shop");
    expect(Object.hasOwn(requestBody, "solution")).toBe(false);
  });

  it("keeps inventory valuation, movements and stock count links functional", async () => {
    const user = userEvent.setup();
    open("/app/inventory");
    await screen.findByText(product.name);
    expect(screen.getAllByText("₹500.00").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Movement ledger" }));
    await screen.findByText("Stock correction");
    await user.click(screen.getByRole("link", { name: "Physical count" }));
    await screen.findByRole("heading", { name: "Physical stock count" });
  });

  it("preserves supplier selection and saves product edits", async () => {
    supplierRecords = [savedContact];
    const user = userEvent.setup();
    open(`/app/products/${product._id}/edit`);
    await screen.findByRole("option", { name: savedContact.name });
    await user.selectOptions(
      screen.getByLabelText("Supplier"),
      savedContact._id,
    );
    await user.clear(screen.getByLabelText(/Product name/));
    await user.type(screen.getByLabelText(/Product name/), "Updated SSD");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("heading", { name: "Product catalog" });
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: "patch",
      url: `/products/${product._id}`,
      data: { name: "Updated SSD", supplier: savedContact._id },
    });
  });

  it("saves stock adjustments", async () => {
    const user = userEvent.setup();
    open("/app/adjustments");
    await screen.findByRole("option", { name: product.name });
    await user.selectOptions(screen.getByLabelText(/Product \*/), product._id);
    await user.type(screen.getByLabelText(/Reason/), "Stock correction");
    await user.click(screen.getByRole("button", { name: "Save adjustment" }));
    await waitFor(() => expect(api.request).toHaveBeenCalled());
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: "post",
      url: "/inventory/adjustments",
      data: { product: product._id, quantity: 1, reason: "Stock correction" },
    });
  });

  it("starts, reviews and applies a physical stock count", async () => {
    const count = {
      _id: "count-id",
      status: "draft",
      lines: [
        {
          product: product._id,
          expected: 5,
          counted: 5,
          difference: 0,
          reason: "",
        },
      ],
    };
    api.request.mockResolvedValue({ data: count });
    const user = userEvent.setup();
    open("/app/stock-counts");
    await user.click(await screen.findByRole("checkbox", { name: /Test SSD/ }));
    await user.click(screen.getByRole("button", { name: /Start count/ }));
    await screen.findByLabelText("Counted");
    await user.click(
      screen.getByRole("button", { name: "Save & review differences" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Authorize count adjustments",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Authorize & apply" }),
    );
    await screen.findByRole("heading", { name: "Start a count" });
    expect(
      api.request.mock.calls.map(([request]) => [request.method, request.url]),
    ).toEqual([
      ["post", "/inventory/stock-counts"],
      ["patch", "/inventory/stock-counts/count-id"],
      ["post", "/inventory/stock-counts/count-id/apply"],
    ]);
  });

  it.each(["categories", "brands"])(
    "creates and edits retained %s records",
    async (resource) => {
      const user = userEvent.setup();
      open(`/app/${resource}`);
      await user.click(await screen.findByRole("button", { name: /^Add / }));
      await user.type(screen.getByLabelText(/Name/), "New group");
      await user.click(screen.getByRole("button", { name: "Save record" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await user.click(screen.getByRole("button", { name: "Edit Test group" }));
      await user.clear(screen.getByLabelText(/Name/));
      await user.type(screen.getByLabelText(/Name/), "Updated group");
      await user.click(screen.getByRole("button", { name: "Save record" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(api.request.mock.calls[0][0]).toMatchObject({
        method: "post",
        url: `/${resource}`,
        data: { name: "New group" },
      });
      expect(api.request.mock.calls[1][0]).toMatchObject({
        method: "patch",
        url: `/${resource}/catalog-group-id`,
        data: { name: "Updated group" },
      });
    },
  );

  it("saves shop settings and invoice preferences", async () => {
    const user = userEvent.setup();
    open("/app/settings");
    const name = await screen.findByLabelText(/Shop name/);
    await user.clear(name);
    await user.type(name, "Updated shop");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(api.request).toHaveBeenCalled());
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: "patch",
      url: "/settings",
      data: {
        name: "Updated shop",
        salePrefix: "TEST",
        purchasePrefix: "PUR",
        allowCreditSales: true,
      },
    });
  });

  it("keeps product search and responsive navigation working", async () => {
    const user = userEvent.setup();
    open("/app");
    await screen.findByRole("heading", { name: /Good .*, Test/ });
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(document.querySelector(".m-sidebar.open")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(document.querySelector(".m-sidebar.open")).toBeNull();
    await user.type(screen.getByLabelText("Search products"), "SSD{Enter}");
    await screen.findByRole("heading", { name: "Product catalog" });
    await screen.findByText(product.name);
    await waitFor(() =>
      expect(
        api.get.mock.calls.some(
          ([path, options]) =>
            path === "/products" && options?.params.q === "SSD",
        ),
      ).toBe(true),
    );
  });

  it("keeps sign out functional", async () => {
    const user = userEvent.setup();
    open("/app");
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByRole("heading", { name: "Admin login" });
    expect(api.post).toHaveBeenCalledWith("/auth/logout");
  });

  it("keeps profile password changes functional and returns to sign in", async () => {
    const user = userEvent.setup();
    open("/app/profile");
    await user.type(
      await screen.findByLabelText(/^Current password/),
      "CurrentPassword123",
    );
    await user.type(
      screen.getByLabelText(/^New password/),
      "UpdatedPassword123",
    );
    await user.type(
      screen.getByLabelText(/^Confirm new password/),
      "UpdatedPassword123",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByRole("heading", { name: "Admin login" });
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: "post",
      url: "/auth/change-password",
      data: {
        currentPassword: "CurrentPassword123",
        password: "UpdatedPassword123",
      },
    });
  });

  it.each(["/app", "/app/products", "/app/sales/record-id"])(
    "still requires authentication for %s",
    async (path) => {
      currentUser = null;
      open(path);
      await screen.findByRole("heading", { name: "Admin login" });
      expect(screen.queryByRole("navigation")).toBeNull();
      await waitFor(() =>
        expect(api.get.mock.calls.map(([url]) => url)).toEqual([
          "/auth/me",
          "/auth/setup-status",
        ]),
      );
    },
  );

  it("returns to sign in when the session expires", async () => {
    open("/app");
    await screen.findByRole("heading", { name: /Good .*, Test/ });
    act(() => window.dispatchEvent(new Event("hcs:session-expired")));
    await screen.findByRole("heading", { name: "Admin login" });
  });
});
afterEach(() => vi.restoreAllMocks());
describe("Shop workspace", () => {
  it("includes developer attribution and the callable number in the workspace footer", async () => {
    open("/app");
    await screen.findByRole("heading", { name: /Good .*, Test/ });
    const footer = document.querySelector(".m-work-footer");
    expect(footer.textContent).toContain("Developed by Mukesh Yadav");
    expect(
      within(footer)
        .getByRole("link", { name: "8052344204" })
        .getAttribute("href"),
    ).toBe("tel:+918052344204");
  });
  it("creates the first administrator from the login page and enters the workspace", async () => {
    currentUser = null;
    canCreateAdmin = true;
    const user = userEvent.setup();
    open("/app/login");
    await user.click(
      await screen.findByRole("button", { name: "Create admin account" }),
    );
    await screen.findByRole("heading", { name: "Create your admin account" });
    await user.type(screen.getByLabelText(/Your name/), "Test Owner");
    await user.type(
      screen.getByLabelText(/Email address/),
      "owner@example.test",
    );
    await user.type(
      screen.getByLabelText(/^Password/),
      "TestOnly-StrongPassword123",
    );
    await user.type(
      screen.getByLabelText(/Confirm password/),
      "TestOnly-StrongPassword123",
    );
    await user.click(
      screen.getByRole("button", { name: "Create admin account" }),
    );
    await screen.findByRole("heading", { name: /Good .*, Test/ });
    expect(api.post).toHaveBeenCalledWith("/auth/setup", {
      name: "Test Owner",
      email: "owner@example.test",
      password: "TestOnly-StrongPassword123",
    });
  });
  it("checks password confirmation before submitting account creation", async () => {
    currentUser = null;
    canCreateAdmin = true;
    const user = userEvent.setup();
    open("/app/login");
    await user.click(
      await screen.findByRole("button", { name: "Create admin account" }),
    );
    await user.type(screen.getByLabelText(/Your name/), "Test Owner");
    await user.type(
      screen.getByLabelText(/Email address/),
      "owner@example.test",
    );
    await user.type(
      screen.getByLabelText(/^Password/),
      "TestOnly-StrongPassword123",
    );
    await user.type(
      screen.getByLabelText(/Confirm password/),
      "DifferentStrongPassword123",
    );
    await user.click(
      screen.getByRole("button", { name: "Create admin account" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Passwords do not match",
    );
    expect(api.post).not.toHaveBeenCalled();
  });
  it("hides first-account creation after the shop is initialized", async () => {
    currentUser = null;
    open("/app/login");
    await screen.findByRole("heading", { name: "Admin login" });
    expect(
      screen.queryByRole("button", { name: "Create admin account" }),
    ).toBeNull();
  });
  it("signs in as administrator without a panel selector", async () => {
    currentUser = null;
    const user = userEvent.setup();
    open("/app/login");
    await user.type(await screen.findByLabelText(/Email address/), admin.email);
    await user.type(
      screen.getByLabelText(/^Password/),
      "TestOnly-StrongPassword123",
    );
    await user.click(
      screen.getByRole("button", { name: /Sign in to workspace/ }),
    );
    await screen.findByRole("heading", { name: /Good .*, Test/ });
    expect(api.post).toHaveBeenCalledWith("/auth/login", {
      email: admin.email,
      password: "TestOnly-StrongPassword123",
    });
  });
  it("shows sign-in failures without losing entered details", async () => {
    currentUser = null;
    api.post.mockRejectedValueOnce({
      response: { data: { error: { message: "Invalid email or password" } } },
    });
    const user = userEvent.setup();
    open("/app/login");
    await user.type(
      await screen.findByLabelText(/Email address/),
      "owner@example.test",
    );
    await user.type(screen.getByLabelText(/^Password/), "wrong");
    await user.click(
      screen.getByRole("button", { name: /Sign in to workspace/ }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Invalid email or password",
    );
    expect(screen.getByLabelText(/Email address/).value).toBe(
      "owner@example.test",
    );
  });
  it("displays live catalog records and detailed stock", async () => {
    const user = userEvent.setup();
    open("/app/products");
    await screen.findByText("Test SSD");
    await user.click(screen.getByRole("button", { name: "View" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("TEST-SSD")).toBeTruthy();
    expect(within(dialog).getByText("5 piece")).toBeTruthy();
  });
  it("adds the eleven product fields, clears the form, and refreshes catalog data", async () => {
    api.request.mockImplementationOnce(async ({ data }) => {
      const saved = { ...product, ...data, _id: "new-product-id" };
      catalogRecords = [product, saved];
      return { data: { ...saved, message: "Product added successfully." } };
    });
    const changed = vi.fn();
    window.addEventListener("hcs:data-changed", changed);
    const user = userEvent.setup();
    const view = open("/app/products/new");
    await user.type(
      await screen.findByLabelText(/Product Name/i),
      "New component",
    );
    for (const [label, value] of [
      ["Product Model", "SSD-256"],
      ["Product Size", "256GB"],
      ["Product Type", "Storage"],
      ["Company Name", "Test company"],
      ["Product Colour", "Black"],
      ["Product Price", "300"],
    ])
      await user.type(screen.getByLabelText(new RegExp(label)), value);
    await user.selectOptions(
      screen.getByLabelText(/Category/),
      "catalog-group-id",
    );
    await user.click(screen.getByRole("button", { name: "Add Product" }));
    await waitFor(() => expect(api.request).toHaveBeenCalled());
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: "post",
      url: "/products",
      data: {
        name: "New component",
        model: "SSD-256",
        size: "256GB",
        productType: "Storage",
        category: "catalog-group-id",
        companyName: "Test company",
        colour: "Black",
        sellingPrice: 300,
        stock: 0,
        minStock: 5,
        taxRate: 18,
      },
    });
    await screen.findByRole("status");
    expect(screen.getByLabelText(/Product Name/).value).toBe("");
    expect(changed).toHaveBeenCalled();
    window.removeEventListener("hcs:data-changed", changed);
    await user.click(screen.getByRole("link", { name: "Products" }));
    await screen.findByText("New component");
    view.unmount();
    open("/app/products");
    await screen.findByText("New component");
  });
  it("neutralizes formula cells when exporting CSV", async () => {
    let captured;
    URL.createObjectURL = vi.fn((blob) => {
      captured = blob;
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    exportCsv([{ name: "=SUM(1,2)", phone: "+910000000000" }]);
    const contents = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsText(captured);
    });
    expect(contents).toContain('"\'=SUM(1,2)"');
    expect(contents).toContain('"\'+910000000000"');
  });
});

describe("Admin-only authentication", () => {
  it.each(["/app/login", "/app/login?panel=staff"])(
    "shows only the admin sign-in form at %s",
    async (path) => {
      currentUser = null;
      open(path);
      await screen.findByRole("heading", { name: "Admin login" });
      expect(screen.queryByRole("button", { name: /Staff login/i })).toBeNull();
      expect(screen.queryByText(/Staff access|Staff member/)).toBeNull();
      expect(document.querySelector(".m-tabs")).toBeNull();
    },
  );
  it.each([
    "/app",
    "/app/settings",
    "/app/pos",
    "/app/purchases/new",
    "/app/customers",
  ])("rejects a legacy staff session at %s", async (path) => {
    currentUser = {
      ...staff,
      permissions: {
        purchaseEntry: true,
        manageContacts: true,
        creditSales: true,
        viewAllHistory: true,
      },
    };
    open(path);
    await screen.findByRole("heading", { name: "Admin login" });
    expect(document.querySelector(".m-shell")).toBeNull();
    expect(
      api.get.mock.calls.some(
        ([url]) => !["/auth/me", "/auth/setup-status"].includes(url),
      ),
    ).toBe(false);
  });
  it("rejects a non-admin response from sign in", async () => {
    currentUser = null;
    api.post.mockResolvedValueOnce({ data: { user: staff } });
    const user = userEvent.setup();
    open("/app/login");
    await user.type(
      await screen.findByLabelText(/Email address/),
      "staff@example.test",
    );
    await user.type(
      screen.getByLabelText(/^Password/),
      "TestOnly-StrongPassword123",
    );
    await user.click(
      screen.getByRole("button", { name: /Sign in to workspace/ }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Administrator access is required.",
    );
    expect(document.querySelector(".m-shell")).toBeNull();
  });
});
