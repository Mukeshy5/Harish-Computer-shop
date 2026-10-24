import { useEffect, useRef, useState } from "react";
import { errorMessage, useCommand, useData } from "../api";
import { Button, Field, Heading, Select } from "../ui";

const textFields = [
  ["name", "Product Name"],
  ["model", "Product Model"],
  ["size", "Product Size"],
  ["productType", "Product Type"],
  ["companyName", "Company Name"],
  ["colour", "Product Colour"],
];
const numbers = [
  ["sellingPrice", "Product Price", 0.01, 1e9, ".01"],
  ["stock", "Stock", 0, 1e8, "1"],
  ["minStock", "Minimum Stock Alert", 0, 1e8, "1"],
  ["taxRate", "GST Rate", 0, 100, ".01"],
];
const defaults = (settings) => ({
  name: "",
  model: "",
  size: "",
  productType: "",
  category: "",
  companyName: "",
  colour: "",
  sellingPrice: "",
  stock: 0,
  minStock: settings?.minStock ?? 5,
  taxRate: settings?.defaultTax ?? 18,
});
function validate(values) {
  const errors = {};
  for (const [key, label] of textFields)
    if (!values[key].trim() || values[key].trim().length > 200)
      errors[key] = `${label} must contain 1–200 characters.`;
  if (!values.category) errors.category = "Choose a category.";
  for (const [key, label, min, max] of numbers) {
    const value = Number(values[key]),
      integer = ["stock", "minStock"].includes(key);
    if (
      String(values[key]).trim() === "" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer
        ? !Number.isSafeInteger(value)
        : Math.abs(value * 100 - Math.round(value * 100)) >= 0.0001)
    )
      errors[key] = integer
        ? `${label} must be a non-negative whole number up to 100000000.`
        : key === "taxRate"
          ? "GST Rate must be between 0 and 100 with at most two decimals."
          : "Product Price must be greater than zero, at most 1000000000, with at most two decimals.";
  }
  return errors;
}
export function AddProduct() {
  const categories = useData("/categories", { limit: 100, active: true });
  const settings = useData("/settings");
  const [values, setValues] = useState(() => defaults()),
    [errors, setErrors] = useState({}),
    [failure, setFailure] = useState(""),
    [success, setSuccess] = useState("");
  const edited = useRef(new Set());
  const { execute, busy } = useCommand({
    onError: (e) => {
      setErrors(e.response?.data?.error?.fields || {});
      setFailure(errorMessage(e));
    },
  });
  useEffect(() => {
    if (!settings.data) return;
    setValues((current) => ({
      ...current,
      ...(!edited.current.has("minStock")
        ? { minStock: settings.data.minStock ?? 5 }
        : {}),
      ...(!edited.current.has("taxRate")
        ? { taxRate: settings.data.defaultTax ?? 18 }
        : {}),
    }));
  }, [settings.data]);
  const set = (key) => (e) => {
    edited.current.add(key);
    setValues((current) => ({ ...current, [key]: e.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFailure("");
    setSuccess("");
  };
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setSuccess("");
    setFailure("");
    const invalid = validate(values);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      setFailure("Please correct the highlighted product fields.");
      return;
    }
    const body = { ...values };
    for (const [key] of textFields) body[key] = body[key].trim();
    for (const [key] of numbers) body[key] = Number(body[key]);
    const saved = await execute("post", "/products", body, "");
    if (saved) {
      setValues(defaults(settings.data));
      edited.current.clear();
      setErrors({});
      setSuccess(saved.message || "Product added successfully.");
    }
  };
  const input = (key) => ({
    name: key,
    id: `add-product-${key}`,
    value: values[key],
    onChange: set(key),
    error: errors[key],
    "aria-invalid": !!errors[key],
    required: true,
    disabled: busy,
  });
  const textInput = ([key, label]) => (
    <Field
      key={key}
      label={label}
      type="text"
      maxLength={200}
      {...input(key)}
    />
  );
  return (
    <>
      <Heading
        title="Add a product"
        description="Add product details, pricing and starting stock to your catalog."
      />
      <form
        noValidate
        onSubmit={submit}
        className="m-card m-form-page m-add-product"
      >
        <div className="m-form-grid">
          {textFields.slice(0, 4).map(textInput)}
          <Select
            label="Category"
            options={categories.data?.data}
            {...input("category")}
          />
          {textFields.slice(4).map(textInput)}
          {numbers.map(([key, label, min, max, step]) => (
            <Field
              key={key}
              label={label}
              type="number"
              min={min}
              max={max}
              step={step}
              {...input(key)}
            />
          ))}
        </div>
        {categories.error && (
          <p className="m-error" role="alert">
            {categories.error}
          </p>
        )}
        {!categories.loading &&
          categories.data &&
          !categories.data.data.length && (
            <p className="m-note">
              No active categories are available. Add a category in Categories
              &amp; brands first.
            </p>
          )}
        {settings.error && (
          <p className="m-error" role="alert">
            {settings.error}
          </p>
        )}
        {failure && (
          <p className="m-error" role="alert">
            {failure}
          </p>
        )}
        {success && (
          <p className="m-product-success" role="status">
            {success}
          </p>
        )}
        <div className="m-form-actions">
          <Button
            type="submit"
            busy={busy}
            disabled={
              busy ||
              categories.loading ||
              !!categories.error ||
              !categories.data?.data.length ||
              settings.loading ||
              !!settings.error
            }
          >
            Add Product
          </Button>
        </div>
      </form>
    </>
  );
}
