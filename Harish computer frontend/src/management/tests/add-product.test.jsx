import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AddProduct } from "../pages/AddProduct";
import { api } from "../api";

const labels = [
  "Product Name",
  "Product Model",
  "Product Size",
  "Product Type",
  "Category",
  "Company Name",
  "Product Colour",
  "Product Price",
  "Stock",
  "Minimum Stock Alert",
  "GST Rate",
];
const values = [
  "SSD",
  "X1",
  "256GB",
  "Storage",
  "category-id",
  "Company",
  "Black",
  "100",
  "2",
  "2",
  "18",
];
const input = (label) => screen.getByLabelText(new RegExp("^" + label));
async function fill() {
  await screen.findByRole("option", { name: "Storage" });
  labels.forEach((label, index) =>
    fireEvent.change(input(label), { target: { value: values[index] } }),
  );
}
beforeEach(() => {
  vi.spyOn(api, "get").mockImplementation(async (path) => {
    if (path === "/categories")
      return { data: { data: [{ _id: "category-id", name: "Storage" }] } };
    if (path === "/settings") return { data: { minStock: 5, defaultTax: 18 } };
    throw new Error("Unexpected API request: " + path);
  });
  vi.spyOn(api, "request").mockResolvedValue({
    data: { _id: "new-id", message: "Product added successfully." },
  });
});
afterEach(() => vi.restoreAllMocks());

describe("Eleven-field Add Product form", () => {
  it("contains exactly the requested fields in order and one Add Product button", async () => {
    render(<AddProduct />);
    await screen.findByRole("option", { name: "Storage" });
    const controls = [
      ...document
        .querySelector("form")
        .querySelectorAll("input, select, textarea"),
    ];
    expect(controls).toEqual(labels.map(input));
    expect(controls).toHaveLength(11);
    expect(
      document.querySelector("form").querySelectorAll("button"),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add Product" })).toBeTruthy();
    expect(
      screen.queryByLabelText(
        /SKU|Barcode|Purchase price|Supplier|Active product|Unit of measurement/,
      ),
    ).toBeNull();
  });
  it("shows field errors for empty required values and sends no API request", async () => {
    render(<AddProduct />);
    await screen.findByRole("option", { name: "Storage" });
    fireEvent.submit(document.querySelector("form"));
    expect(input("Product Name").getAttribute("aria-invalid")).toBe("true");
    expect(input("Product Price").getAttribute("aria-invalid")).toBe("true");
    expect(input("Category").getAttribute("aria-invalid")).toBe("true");
    expect(api.request).not.toHaveBeenCalled();
  });
  it.each([
    ["Product Price", "0"],
    ["Product Price", "1.001"],
    ["Stock", "-1"],
    ["Stock", "1.5"],
    ["Minimum Stock Alert", "-1"],
    ["GST Rate", "101"],
    ["GST Rate", "-1"],
  ])("rejects invalid %s: %s", async (label, value) => {
    render(<AddProduct />);
    await fill();
    fireEvent.change(input(label), { target: { value } });
    fireEvent.submit(document.querySelector("form"));
    expect(input(label).getAttribute("aria-invalid")).toBe("true");
    expect(api.request).not.toHaveBeenCalled();
  });
  it("sends numeric values with existing field names and resets after the backend success", async () => {
    render(<AddProduct />);
    await fill();
    fireEvent.submit(document.querySelector("form"));
    await screen.findByText("Product added successfully.");
    expect(api.request.mock.calls[0][0]).toMatchObject({
      method: "post",
      url: "/products",
      data: {
        name: "SSD",
        model: "X1",
        size: "256GB",
        productType: "Storage",
        category: "category-id",
        companyName: "Company",
        colour: "Black",
        sellingPrice: 100,
        stock: 2,
        minStock: 2,
        taxRate: 18,
      },
    });
    expect(Object.keys(api.request.mock.calls[0][0].data)).toHaveLength(11);
    expect(input("Product Name").value).toBe("");
    expect(input("Stock").value).toBe("0");
  });
  it("disables inputs during saving and prevents concurrent submissions", async () => {
    let complete;
    api.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    render(<AddProduct />);
    await fill();
    fireEvent.submit(document.querySelector("form"));
    fireEvent.submit(document.querySelector("form"));
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Add Product" }).disabled).toBe(
      true,
    );
    expect(input("Product Name").disabled).toBe(true);
    await act(async () =>
      complete({ data: { message: "Product added successfully." } }),
    );
    expect(screen.getByRole("button", { name: "Add Product" }).disabled).toBe(
      false,
    );
  });
  it("keeps the same request key after an uncertain failure", async () => {
    api.request.mockRejectedValueOnce({ code: "ECONNABORTED" });
    render(<AddProduct />);
    await fill();
    fireEvent.submit(document.querySelector("form"));
    await screen.findByRole("alert");
    fireEvent.submit(document.querySelector("form"));
    await screen.findByText("Product added successfully.");
    expect(api.request.mock.calls[0][0].headers["Idempotency-Key"]).toBe(
      api.request.mock.calls[1][0].headers["Idempotency-Key"],
    );
  });
  it("shows backend field errors beside the field and preserves entered data", async () => {
    api.request.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: {
            message: "Please correct the product.",
            fields: { model: "Model is invalid." },
          },
        },
      },
    });
    render(<AddProduct />);
    await fill();
    fireEvent.submit(document.querySelector("form"));
    await screen.findByText("Model is invalid.");
    expect(input("Product Model").getAttribute("aria-invalid")).toBe("true");
    expect(input("Product Name").value).toBe("SSD");
  });
  it("disables submission when categories fail and shows the API error", async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((path) =>
      path === "/categories"
        ? Promise.reject({
            response: {
              data: { error: { message: "Categories unavailable" } },
            },
          })
        : base(path),
    );
    render(<AddProduct />);
    await screen.findByText("Categories unavailable");
    expect(screen.getByRole("button", { name: "Add Product" }).disabled).toBe(
      true,
    );
  });
});
