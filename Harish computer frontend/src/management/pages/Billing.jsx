import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  Minus,
  Trash2,
  Package,
  ShoppingCart,
  ArrowLeft,
  Printer,
  RotateCcw,
  CreditCard,
  XCircle,
  Download,
  Mail,
  MessageCircle,
} from "lucide-react";
import { useSession } from "../Management";
import { ShopHeader } from "../print/ShopHeader";
import { useA4PrintFit } from "../print/useA4PrintFit";
import "../print/invoice-print.css";
import {
  api,
  date,
  errorMessage,
  exportCsv,
  money,
  today,
  useCommand,
  useData,
} from "../api";
import toast from "react-hot-toast";
import { coverageText, invoicePreview } from "../invoice-calculations";
import { SalesHistory } from "./SalesHistory";
import {
  Badge,
  Button,
  Field,
  Heading,
  Modal,
  Pagination,
  SearchBox,
  Select,
  State,
  Stock,
  Table,
} from "../ui";
const paymentOptions = ["cash", "upi", "card", "bank", "credit"].map((v) => ({
  value: v,
  label: {
    cash: "Cash",
    upi: "UPI",
    card: "Card",
    bank: "Bank transfer",
    credit: "Credit",
  }[v],
}));
const rounded = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function Billing({ kind }) {
  const purchase = kind === "purchase",
    { user } = useSession(),
    navigate = useNavigate();
  const location = useLocation();
  const exchangeId =
    !purchase && user.role === "admin" ? location.state?.exchangeId : null;
  const exchange = useData(exchangeId ? `/sales/${exchangeId}` : null);
  const [q, setQ] = useState(""),
    [partyQ, setPartyQ] = useState(""),
    [lines, setLines] = useState([]),
    [contactDialog, setContactDialog] = useState(false),
    [selectedContact, setSelectedContact] = useState(null),
    [formError, setFormError] = useState(""),
    [form, setForm] = useState({
      date: today(),
      party: "",
      partyName: "",
      partyPhone: "",
      partyEmail: "",
      partyAddress: "",
      partyGstin: "",
      method: "cash",
      paid: "",
      charges: 0,
      invoiceDiscount: 0,
      approveCredit: false,
      notes: "",
      supplierInvoice: "",
    }),
    [confirm, setConfirm] = useState(false);
  const searchRef = useRef(null);
  const products = useData("/products", { q, active: true, limit: 50 });
  const categories = useData("/categories", { limit: 100, active: true });
  const parties = useData(purchase ? "/suppliers" : null, {
    q: partyQ,
    limit: 100,
  });
  const { execute, busy } = useCommand();
  const shopSettings = useData("/settings");
  const canManageContacts =
    user.role === "admin" || user.permissions?.manageContacts;
  const partyOptions = [
    ...new Map(
      [
        ...(selectedContact ? [selectedContact] : []),
        ...(parties.data?.data || []),
      ].map((p) => [p._id, p]),
    ).values(),
  ];
  const chooseContact = (id, record) => {
    const party = record || partyOptions.find((p) => p._id === id);
    setSelectedContact(party || null);
    setForm((f) => ({
      ...f,
      party: id,
      partyName: party?.name || "",
      partyPhone: party?.phone || "",
      partyEmail: party?.email || "",
      partyAddress: party?.address || "",
      partyGstin: party?.gstin || "",
    }));
  };
  const field = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  useEffect(() => {
    const key = (e) => {
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    setLines([]);
    setForm({
      date: today(),
      party: "",
      partyName: "",
      partyPhone: "",
      partyEmail: "",
      partyAddress: "",
      partyGstin: "",
      method: "cash",
      paid: "",
      charges: 0,
      invoiceDiscount: 0,
      approveCredit: false,
      notes: "",
      supplierInvoice: "",
    });
    setQ("");
    setSelectedContact(null);
    setFormError("");
  }, [kind]);
  useEffect(() => {
    if (exchange.data)
      setForm((f) => ({
        ...f,
        party: exchange.data.party || "",
        partyName: exchange.data.partyName,
        partyPhone: exchange.data.partyPhone,
        partyEmail: exchange.data.partyEmail,
        partyAddress: exchange.data.partyAddress,
        partyGstin: exchange.data.partyGstin,
        notes: `Exchange for ${exchange.data.number}. Original return and refund recorded separately.`,
      }));
  }, [exchange.data]);
  const add = (p) => {
    if (!purchase && !p.stock) return;
    setLines((old) => {
      const i = old.findIndex((l) => l.product === p._id);
      if (i >= 0)
        return old.map((l, index) =>
          index === i
            ? {
                ...l,
                quantity: purchase
                  ? Number(l.quantity) + 1
                  : Math.min(p.stock, Number(l.quantity) + 1),
              }
            : l,
        );
      return [
        ...old,
        {
          product: p._id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode || "",
          companyName: p.companyName || "",
          description: p.description || "",
          unit: p.unit || "piece",
          sellingPrice: p.sellingPrice,
          stock: p.stock,
          quantity: 1,
          rate: purchase ? (p.purchasePrice ?? p.sellingPrice) : p.sellingPrice,
          discount: 0,
          taxRate: p.taxRate,
          categoryName:
            categories.data?.data.find(
              (category) => String(category._id) === String(p.category),
            )?.name || "",
          productType: p.productType || p.type || "",
          model: p.model || "",
          size: p.size || "",
          colour: p.colour || "",
          warrantyEnabled: false,
          guaranteeEnabled: false,
          warrantyMonths: 0,
          warrantyDays: 0,
          coverageDuration: "",
          coverageUnit: "months",
        },
      ];
    });
    setQ("");
    searchRef.current?.focus();
  };
  const change = (i, k, v) =>
    setLines((old) =>
      old.map((l, index) => (index === i ? { ...l, [k]: v } : l)),
    );
  const changeQuantity = (i, delta) =>
    setLines((old) =>
      old.map((line, index) =>
        index === i
          ? {
              ...line,
              quantity: Math.min(
                purchase ? 1e8 : line.stock,
                Math.max(1, (Number(line.quantity) || 1) + delta),
              ),
            }
          : line,
      ),
    );
  const preview = invoicePreview(lines, form.invoiceDiscount, form.charges);
  const { lines: computed, subtotal, lineDiscount, tax, total } = preview;
  const paid =
    form.paid === ""
      ? form.method === "credit"
        ? 0
        : total
      : Number(form.paid);
  const due = Math.max(0, rounded(total - paid));
  const payload = {
    ...(exchangeId ? { exchangeOf: exchangeId } : {}),
    ...form,
    party: form.party || undefined,
    paid,
    lines: lines.map((l) => ({
      product: l.product,
      productType: l.productType,
      model: l.model,
      guaranteeEnabled: l.guaranteeEnabled,
      warrantyEnabled: l.warrantyEnabled,
      warrantyMonths:
        l.coverageUnit === "years"
          ? Number(l.coverageDuration || 0) * 12
          : l.coverageUnit === "months"
            ? Number(l.coverageDuration || 0)
            : 0,
      warrantyDays:
        l.coverageUnit === "days" ? Number(l.coverageDuration || 0) : 0,
      quantity: Number(l.quantity),
      rate: Number(l.rate),
      discount: Number(l.discount),
      taxRate: Number(l.taxRate),
    })),
  };
  const submit = async (printAfterSave = false) => {
    const r = await execute(
      "post",
      purchase ? "/purchases" : "/sales",
      payload,
      purchase
        ? "Purchase recorded and stock received"
        : "Sale completed and stock updated",
    );
    if (r)
      navigate(
        `/app/${purchase ? "purchases" : "sales"}/${r._id}${
          printAfterSave && !purchase ? "?print=1" : ""
        }`,
      );
    else setConfirm(false);
  };
  return (
    <>
      <Heading
        title={purchase ? "Record a purchase" : "Point of sale"}
        description={
          purchase
            ? "Receive products, record costs, and manage supplier balances."
            : "A smooth checkout, from product search to printed receipt."
        }
      >
        <Link
          className="m-button secondary"
          to={`/app/${purchase ? "purchases" : "sales"}`}
        >
          View history
        </Link>
      </Heading>
      {exchange.data && (
        <div className="m-note" style={{ marginBottom: 18 }}>
          Exchange for {exchange.data.number}. The original return and refund
          remain linked to that invoice. This replacement is a new sale with its
          own payment.
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFormError("");
          if (
            lines.some(
              (l) =>
                (l.warrantyEnabled || l.guaranteeEnabled) &&
                Number(l.coverageDuration || 0) <= 0,
            )
          ) {
            setFormError(
              "Enter a valid duration for every product with warranty or guarantee selected.",
            );
            return;
          }
          if (lines.length) setConfirm(true);
        }}
        className="m-billing-grid"
      >
        <section className="m-card m-billing-main">
          <div className="m-billing-party">
            <div className="m-billing-party-heading">
              <div>
                <span className="m-eyebrow">01 · BILLING DETAILS</span>
                <h3>
                  {purchase
                    ? "Supplier billing details"
                    : "Customer billing details"}
                </h3>
                {!purchase && (
                  <p>Enter customer details directly on this bill.</p>
                )}
              </div>
              {purchase && canManageContacts && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setContactDialog(true)}
                >
                  <Plus size={15} /> Add {purchase ? "supplier" : "customer"}
                </Button>
              )}
            </div>
            {purchase && (
              <>
                <div className="m-party-chooser">
                  <Field
                    label={purchase ? "Search suppliers" : "Search customers"}
                    value={partyQ}
                    onChange={(e) => setPartyQ(e.target.value)}
                    placeholder="Name, phone or email"
                  />
                  <Select
                    label={purchase ? "Supplier" : "Customer"}
                    options={partyOptions}
                    disabled={parties.loading && !partyOptions.length}
                    value={form.party}
                    onChange={(e) => chooseContact(e.target.value)}
                    required={purchase}
                  />
                </div>
                <State error={parties.error} retry={parties.reload} />
              </>
            )}
            <State error={categories.error} retry={categories.reload} />
            <div className="m-form-grid m-billing-customer-fields">
              <Field
                label={purchase ? "Supplier name" : "Customer name"}
                value={form.partyName}
                onChange={field("partyName")}
                placeholder={
                  purchase ? "Enter supplier name" : "Enter customer name"
                }
                required={!purchase}
                maxLength={200}
              />
              <Field
                label="Phone number"
                type="tel"
                value={form.partyPhone}
                onChange={field("partyPhone")}
                placeholder="Enter phone number"
                maxLength={26}
                required={!purchase}
              />
              <Field
                label="Email"
                type="email"
                value={form.partyEmail}
                onChange={field("partyEmail")}
                placeholder="name@gmail.com"
                maxLength={254}
              />
              <Field
                label="Address"
                type="textarea"
                value={form.partyAddress}
                onChange={field("partyAddress")}
                placeholder="Enter billing address"
                maxLength={2000}
                rows={2}
              />
              <Field
                label={
                  purchase ? "Purchase date" : "Sale / coverage start date"
                }
                type="date"
                value={form.date}
                onChange={field("date")}
                required
                max={today()}
              />
              <Field
                label="GST number"
                value={form.partyGstin}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    partyGstin: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="GSTIN (optional)"
                maxLength={15}
              />
              {purchase && (
                <Field
                  label="Supplier invoice number"
                  value={form.supplierInvoice}
                  onChange={field("supplierInvoice")}
                />
              )}
            </div>
          </div>
          {formError && (
            <div className="m-error" role="alert">
              {formError}
            </div>
          )}
          <div className="m-card-heading">
            <div>
              <span className="m-eyebrow">02 · PRODUCTS</span>
              <h3>{purchase ? "Receive products" : "Build your invoice"}</h3>
              <p>Search by name, product code, or barcode · Alt + S</p>
            </div>
            <Badge tone="blue">{lines.length} items</Badge>
          </div>
          <div className="m-pos-search">
            <Select
              label="Select product"
              value=""
              onChange={(e) => {
                const product = products.data?.data.find(
                  (p) => p._id === e.target.value,
                );
                if (product) add(product);
              }}
              disabled={products.loading && !products.data}
              options={(products.data?.data || []).map((p) => ({
                value: p._id,
                label: `${p.name} · ${p.sku} · ${money(purchase ? (p.purchasePrice ?? p.sellingPrice) : p.sellingPrice)}${!purchase && !p.stock ? " · Out of stock" : ""}`,
                disabled: !purchase && !p.stock,
              }))}
            />
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search products or scan a barcode…"
              inputRef={searchRef}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const exact = products.data?.data.find(
                    (p) =>
                      p.barcode === q ||
                      p.sku.toLowerCase() === q.toLowerCase(),
                  );
                  if (exact) add(exact);
                }
              }}
            />
          </div>
          {q && (
            <div className="m-product-picker">
              <State
                loading={products.loading && !products.data}
                error={products.error}
                empty={products.data && !products.data.data.length}
              />
              {products.data?.data.map((p) => (
                <button
                  type="button"
                  key={p._id}
                  onClick={() => add(p)}
                  disabled={!purchase && !p.stock}
                >
                  <span className="m-product-icon">
                    <Package size={18} />
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.sku} · {p.stock} available
                    </small>
                  </div>
                  <span>
                    {money(
                      purchase
                        ? (p.purchasePrice ?? p.sellingPrice)
                        : p.sellingPrice,
                    )}
                    <Stock product={p} />
                  </span>
                  <Plus size={17} />
                </button>
              ))}
            </div>
          )}
          {!lines.length ? (
            <div className="m-pos-empty">
              <span>
                <ShoppingCart size={34} />
              </span>
              <h3>Ready for your first item</h3>
              <p>Select a product above or search by name, code or barcode.</p>
            </div>
          ) : (
            <div className="m-table-wrap">
              <table className="m-table m-cart">
                <thead>
                  <tr>
                    <th>PRODUCT</th>
                    <th>QTY</th>
                    <th>RATE ₹</th>
                    <th>DISCOUNT ₹</th>
                    <th>GST %</th>
                    <th>AMOUNT</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {computed.map((l, i) => (
                    <Fragment key={l.product}>
                      <tr className="m-cart-item-row">
                        <td data-label="Product">
                          <strong>{l.name}</strong>
                          <small>
                            {[
                              l.sku,
                              l.categoryName,
                              l.model,
                              l.size,
                              l.colour,
                              `${l.stock} in stock`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </td>
                        <td data-label="Quantity">
                          <div className="m-quantity-control">
                            <button
                              type="button"
                              aria-label={`Decrease quantity for ${l.name}`}
                              disabled={Number(l.quantity) <= 1}
                              onClick={() => changeQuantity(i, -1)}
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              aria-label={`Quantity for ${l.name}`}
                              required
                              type="number"
                              min="1"
                              max={purchase ? 1e8 : l.stock}
                              step="1"
                              value={l.quantity}
                              onChange={(e) =>
                                change(i, "quantity", e.target.value)
                              }
                            />
                            <button
                              type="button"
                              aria-label={`Increase quantity for ${l.name}`}
                              disabled={
                                Number(l.quantity) >= (purchase ? 1e8 : l.stock)
                              }
                              onClick={() => changeQuantity(i, 1)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                        <td data-label="Rate ₹">
                          <input
                            aria-label={`Rate for ${l.name}`}
                            disabled={!purchase && user.role !== "admin"}
                            required
                            type="number"
                            min="0"
                            step=".01"
                            max="1000000000"
                            value={l.rate}
                            onChange={(e) => change(i, "rate", e.target.value)}
                          />
                        </td>
                        <td data-label="Discount ₹">
                          <input
                            aria-label={`Discount for ${l.name}`}
                            required
                            type="number"
                            min="0"
                            max={l.quantity * l.rate}
                            step=".01"
                            value={l.discount}
                            onChange={(e) =>
                              change(i, "discount", e.target.value)
                            }
                          />
                        </td>
                        <td data-label="GST">
                          {purchase ? (
                            <input
                              aria-label={`GST for ${l.name}`}
                              required
                              type="number"
                              min="0"
                              max="100"
                              step=".01"
                              value={l.taxRate}
                              onChange={(e) =>
                                change(i, "taxRate", e.target.value)
                              }
                            />
                          ) : (
                            l.taxRate + "%"
                          )}
                        </td>
                        <td data-label="Amount">
                          <strong>{money(l.total)}</strong>
                        </td>
                        <td className="m-cart-remove">
                          <button
                            type="button"
                            className="m-icon-button"
                            aria-label={`Remove ${l.name}`}
                            onClick={() =>
                              setLines((old) => old.filter((_, j) => i !== j))
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                      <tr className="m-line-details-row">
                        <td colSpan={7}>
                          <dl
                            className="m-selected-product-details"
                            aria-label={`Product details for ${l.name}`}
                          >
                            {[
                              ["Product code", l.sku],
                              ["Barcode", l.barcode],
                              ["Category", l.categoryName],
                              ["Company", l.companyName],
                              ["Size", l.size],
                              ["Colour", l.colour],
                              ["Selling price", money(l.sellingPrice)],
                              ["GST", `${l.taxRate}%`],
                              ["Available stock", `${l.stock} ${l.unit}`],
                              ["Description", l.description],
                            ]
                              .filter(
                                ([, value]) => value !== "" && value != null,
                              )
                              .map(([label, value]) => (
                                <div key={label}>
                                  <dt>{label}</dt>
                                  <dd>{value}</dd>
                                </div>
                              ))}
                          </dl>
                          <div className="m-line-details">
                            <Field
                              label="Product type"
                              aria-label={`Type for ${l.name}`}
                              value={l.productType}
                              onChange={(e) =>
                                change(i, "productType", e.target.value)
                              }
                              maxLength={200}
                              placeholder="e.g. Laptop, SSD"
                            />
                            <Field
                              label="Model"
                              aria-label={`Model for ${l.name}`}
                              value={l.model}
                              onChange={(e) =>
                                change(i, "model", e.target.value)
                              }
                              maxLength={200}
                              placeholder="Enter model"
                            />
                            <Select
                              label="Coverage type"
                              aria-label={`Coverage type for ${l.name}`}
                              value={
                                l.warrantyEnabled
                                  ? "warranty"
                                  : l.guaranteeEnabled
                                    ? "guarantee"
                                    : "none"
                              }
                              onChange={(e) => {
                                change(
                                  i,
                                  "warrantyEnabled",
                                  e.target.value === "warranty",
                                );
                                change(
                                  i,
                                  "guaranteeEnabled",
                                  e.target.value === "guarantee",
                                );
                                if (e.target.value === "none")
                                  change(i, "coverageDuration", "");
                              }}
                              options={[
                                {
                                  value: "none",
                                  label: "No warranty / guarantee",
                                },
                                { value: "warranty", label: "Warranty" },
                                { value: "guarantee", label: "Guarantee" },
                              ]}
                            />
                            {(l.warrantyEnabled || l.guaranteeEnabled) && (
                              <>
                                <Field
                                  label="Coverage duration"
                                  aria-label={`Coverage duration for ${l.name}`}
                                  type="number"
                                  min="1"
                                  max={
                                    l.coverageUnit === "years"
                                      ? "100"
                                      : l.coverageUnit === "months"
                                        ? "1200"
                                        : "36500"
                                  }
                                  step="1"
                                  value={l.coverageDuration}
                                  onChange={(e) =>
                                    change(
                                      i,
                                      "coverageDuration",
                                      e.target.value,
                                    )
                                  }
                                />
                                <Select
                                  label="Duration unit"
                                  aria-label={`Coverage duration unit for ${l.name}`}
                                  value={l.coverageUnit}
                                  onChange={(e) =>
                                    change(i, "coverageUnit", e.target.value)
                                  }
                                  options={[
                                    { value: "days", label: "Days" },
                                    { value: "months", label: "Months" },
                                    { value: "years", label: "Years" },
                                  ]}
                                />
                                <small className="m-note">
                                  Enter only the manufacturer-listed coverage.
                                  It starts on the sale date.
                                </small>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="m-bill-notes">
            <Field
              label="Notes (optional)"
              type="textarea"
              value={form.notes}
              onChange={field("notes")}
              placeholder="Add a note for this invoice…"
            />
          </div>
        </section>
        <aside className="m-card m-checkout">
          <div className="m-card-heading">
            <div>
              <span className="m-eyebrow">03 · CHECKOUT</span>
              <h3>Bill summary & payment</h3>
            </div>
          </div>
          <div className="m-checkout-body">
            <div className="m-bill-totals">
              <div>
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              <div>
                <span>Item discounts</span>
                <span>− {money(lineDiscount)}</span>
              </div>
              <Field
                label="Bill discount (₹)"
                type="number"
                min="0"
                max={preview.maxDiscount}
                step=".01"
                value={form.invoiceDiscount}
                onChange={field("invoiceDiscount")}
              />
              <div>
                <span>GST / Tax</span>
                <span>{money(tax)}</span>
              </div>
              <Field
                label="Other charges (₹)"
                type="number"
                min="0"
                step=".01"
                value={form.charges}
                onChange={field("charges")}
              />
              <div className="m-grand-total">
                <span>Grand total</span>
                <strong>{money(total)}</strong>
              </div>
            </div>
            <Select
              label="Payment method"
              options={paymentOptions}
              value={form.method}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  method: e.target.value,
                  paid: e.target.value === "credit" ? 0 : "",
                }))
              }
              required
            />
            <Field
              label={
                form.method === "cash"
                  ? "Paid amount / cash received (₹)"
                  : "Paid amount (₹)"
              }
              type="number"
              min="0"
              step=".01"
              value={form.paid}
              onChange={field("paid")}
              placeholder={String(total)}
              disabled={form.method === "credit"}
              max={form.method === "cash" ? undefined : total}
            />
            <div className="m-balance-line">
              <span>Pending amount (auto)</span>
              <output aria-label="Pending amount">{money(due)}</output>
            </div>
            {paid > total && (
              <div className="m-balance-line">
                <span>Change to return</span>
                <strong>{money(paid - total)}</strong>
              </div>
            )}
            {!purchase && due > 0 && (
              <div className="m-credit-approval">
                {!form.party && (
                  <p>
                    The pending amount will be linked to the customer details
                    entered on this bill.
                  </p>
                )}
                {user.role === "admin" &&
                !shopSettings.data?.allowCreditSales ? (
                  <Field
                    label="Approve pending amount for this invoice"
                    type="checkbox"
                    required
                    checked={form.approveCredit}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        approveCredit: e.target.checked,
                      }))
                    }
                  />
                ) : !shopSettings.data?.allowCreditSales ||
                  (!user.permissions?.creditSales && user.role !== "admin") ? (
                  <p>Pending sales require administrator authorization.</p>
                ) : null}
              </div>
            )}
            <div className="m-form-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setLines([]);
                  setForm({
                    date: today(),
                    party: "",
                    partyName: "",
                    partyPhone: "",
                    partyEmail: "",
                    partyAddress: "",
                    partyGstin: "",
                    method: "cash",
                    paid: "",
                    charges: 0,
                    invoiceDiscount: 0,
                    approveCredit: false,
                    notes: "",
                    supplierInvoice: "",
                  });
                  setSelectedContact(null);
                  setQ("");
                  setPartyQ("");
                  setFormError("");
                }}
              >
                Reset form
              </Button>
              <Button
                type="submit"
                busy={busy}
                disabled={!lines.length || total < 0}
              >
                {purchase ? "Review purchase" : "Review & complete sale"}{" "}
                <ArrowLeft size={16} style={{ transform: "rotate(180deg)" }} />
              </Button>
            </div>
            <p className="m-checkout-note">
              Invoice number is assigned securely when saved.
            </p>
          </div>
        </aside>
      </form>
      {purchase && contactDialog && (
        <BillingContactForm
          kind={kind}
          initial={form}
          onClose={() => setContactDialog(false)}
          onSaved={(record) => {
            chooseContact(record._id, record);
            setContactDialog(false);
            parties.reload();
          }}
        />
      )}
      {confirm && (
        <Modal
          title={purchase ? "Confirm purchase" : "Confirm sale"}
          onClose={() => !busy && setConfirm(false)}
        >
          <p>
            {lines.length} product lines · {money(total)} grand total.
          </p>
          <div className="m-detail-grid">
            <div>
              <small>Payment</small>
              <strong>
                {form.method.toUpperCase()} · {money(Math.min(paid, total))}
              </strong>
            </div>
            <div>
              <small>Due</small>
              <strong>{money(due)}</strong>
            </div>
          </div>
          <p className="m-note">
            Saving this invoice will {purchase ? "increase" : "reduce"}{" "}
            available stock. Completed invoices are preserved in your
            transaction history.
          </p>
          <div className="m-form-actions">
            <Button
              variant="secondary"
              onClick={() => setConfirm(false)}
              disabled={busy}
            >
              Back to invoice
            </Button>
            <Button type="button" busy={busy} onClick={() => submit(false)}>
              Confirm & save
            </Button>
            {!purchase && (
              <Button
                type="button"
                variant="secondary"
                busy={busy}
                onClick={() => submit(true)}
              >
                Save &amp; print
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
function BillingContactForm({ kind, initial, onClose, onSaved }) {
  const purchase = kind === "purchase";
  const { execute, busy } = useCommand();
  return (
    <Modal
      title={purchase ? "Add supplier" : "Add customer"}
      onClose={() => !busy && onClose()}
    >
      <form
        className="m-modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const record = await execute(
            "post",
            purchase ? "/suppliers" : "/customers",
            Object.fromEntries(data.entries()),
            purchase ? "Supplier added" : "Customer added",
          );
          if (record) onSaved(record);
        }}
      >
        <Field
          label="Name"
          name="name"
          defaultValue={initial.partyName}
          required
          maxLength={200}
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={initial.partyPhone}
          maxLength={26}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={initial.partyEmail}
          maxLength={254}
        />
        <Field
          label="Billing address"
          name="address"
          type="textarea"
          defaultValue={initial.partyAddress}
          maxLength={2000}
        />
        <Field
          label="GSTIN"
          name="gstin"
          defaultValue={initial.partyGstin}
          maxLength={15}
        />
        <div className="m-form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save {purchase ? "supplier" : "customer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function InvoiceList({ kind }) {
  const purchase = kind === "purchase",
    navigate = useNavigate();
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [paymentStatus, setPaymentStatus] = useState(""),
    [exporting, setExporting] = useState(false);
  const { data, loading, error, reload } = useData(
    purchase ? "/purchases" : "/sales",
    { q, page, from, to, ...(purchase ? {} : { paymentStatus }) },
  );
  const downloadReport = async (pendingOnly) => {
    setExporting(true);
    try {
      const response = await api.get("/reports/sales", {
        params: { from, to },
      });
      const rows = response.data.data
        .filter((sale) => {
          const currentPaymentStatus =
            sale.due <= 0 ? "paid" : sale.paid > 0 ? "partial" : "unpaid";
          const searchValue = [
            sale.number,
            sale.partyName,
            sale.partyPhone,
            sale.partyEmail,
          ]
            .join(" ")
            .toLowerCase();
          return (
            (!pendingOnly || sale.due > 0) &&
            (!paymentStatus || paymentStatus === currentPaymentStatus) &&
            (!q || searchValue.includes(q.toLowerCase()))
          );
        })
        .map((sale) => ({
          invoiceNumber: sale.number,
          date: date(sale.date),
          customerName: sale.partyName,
          mobileNumber: sale.partyPhone,
          products: sale.lines
            .map((line) => [line.name, line.model].filter(Boolean).join(" / "))
            .join(", "),
          totalAmount: money(sale.total),
          paidAmount: money(sale.paid),
          pendingAmount: money(sale.due),
          paymentStatus:
            sale.due <= 0 ? "Paid" : sale.paid > 0 ? "Partial" : "Unpaid",
          warrantyExpiry: sale.lines
            .map((line) =>
              line.warrantyExpiryDate
                ? new Date(line.warrantyExpiryDate).toLocaleDateString("en-IN")
                : "",
            )
            .filter(Boolean)
            .join(", "),
        }));
      exportCsv(rows, pendingOnly ? "pending-payments-report" : "sales-report");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };
  if (!purchase) {
    return (
      <SalesHistory
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        filters={{ q, from, to, paymentStatus }}
        onFiltersChange={(next) => {
          setQ(next.q);
          setFrom(next.from);
          setTo(next.to);
          setPaymentStatus(next.paymentStatus);
          setPage(1);
        }}
        page={page}
        onPageChange={setPage}
        exporting={exporting}
        onExport={downloadReport}
      />
    );
  }
  return (
    <>
      <Heading
        title={purchase ? "Purchase invoices" : "Sales invoices"}
        description="Every invoice, payment, and return in one reliable record."
      >
        {!purchase && (
          <>
            <Button
              type="button"
              variant="secondary"
              busy={exporting}
              disabled={exporting}
              onClick={() => downloadReport(false)}
            >
              <Download size={16} /> Download sales report CSV
            </Button>
            <Button
              type="button"
              variant="secondary"
              busy={exporting}
              disabled={exporting}
              onClick={() => downloadReport(true)}
            >
              <Download size={16} /> Download pending payments CSV
            </Button>
          </>
        )}
        <Link
          className="m-button"
          to={purchase ? "/app/purchases/new" : "/app/pos"}
        >
          <Plus size={16} />
          {purchase ? "Record purchase" : "New sale"}
        </Link>
      </Heading>
      <section className="m-card">
        <div className="m-toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Search invoice or customer / supplier…"
          />
          <Field
            label="From"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Field
            label="To"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
          {!purchase && (
            <Select
              label="Payment status"
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setPage(1);
              }}
              options={[
                { value: "paid", label: "Paid" },
                { value: "partial", label: "Partial" },
                { value: "unpaid", label: "Unpaid" },
              ]}
            />
          )}
        </div>
        <State
          loading={loading && !data}
          error={error}
          retry={reload}
          empty={data && !data.data.length}
        />
        {data?.data.length > 0 && (
          <Table
            rows={data.data}
            onRow={(r) =>
              navigate(`/app/${purchase ? "purchases" : "sales"}/${r._id}`)
            }
            columns={[
              {
                key: "number",
                label: "INVOICE",
                render: (r) => (
                  <strong className="m-invoice-link">{r.number}</strong>
                ),
              },
              { key: "date", label: "DATE", render: (r) => date(r.date) },
              {
                key: "partyName",
                label: purchase ? "SUPPLIER" : "CUSTOMER",
                render: (r) => (
                  <>
                    <strong>{r.partyName}</strong>
                    <small>{r.partyPhone || r.partyEmail || ""}</small>
                  </>
                ),
              },
              ...(!purchase
                ? [
                    {
                      key: "warrantyExpiry",
                      label: "WARRANTY EXPIRY",
                      render: (r) => {
                        const dates = r.lines
                          .map((line) => line.warrantyExpiryDate)
                          .filter(Boolean)
                          .map((expiry) =>
                            new Date(expiry).toLocaleDateString("en-IN"),
                          );
                        return dates.join(", ") || "—";
                      },
                    },
                  ]
                : []),
              {
                key: "products",
                label: "PRODUCT / MODEL",
                render: (r) => (
                  <span className="m-invoice-products">
                    {r.lines
                      .map((l) => [l.name, l.model].filter(Boolean).join(" / "))
                      .join(", ")}
                  </span>
                ),
              },
              { key: "total", label: "TOTAL", render: (r) => money(r.total) },
              {
                key: "discount",
                label: "DISCOUNT",
                render: (r) => money(r.discount),
              },
              { key: "paid", label: "PAID", render: (r) => money(r.paid) },
              { key: "due", label: "PENDING", render: (r) => money(r.due) },
              {
                key: "paymentStatus",
                label: "PAYMENT",
                render: (r) => (
                  <Badge
                    tone={r.due <= 0 ? "green" : r.paid > 0 ? "amber" : "red"}
                  >
                    {r.due <= 0 ? "Paid" : r.paid > 0 ? "Partial" : "Unpaid"}
                  </Badge>
                ),
              },
            ]}
          />
        )}
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
    </>
  );
}
export function Invoice({ kind }) {
  const { id } = useParams(),
    location = useLocation(),
    purchase = kind === "purchase",
    base = `/${purchase ? "purchases" : "sales"}/${id}`,
    { can } = useSession();
  const { data: b, loading, error, reload } = useData(base);
  const [action, setAction] = useState(null),
    [thermal, setThermal] = useState(false),
    [emailBusy, setEmailBusy] = useState(false);
  const printRequested = useRef(false);
  const invoiceRef = useA4PrintFit(thermal);
  const emailAttemptKey = useRef(null);
  useEffect(() => {
    printRequested.current = false;
    emailAttemptKey.current = null;
  }, [id]);
  useEffect(() => {
    if (
      b &&
      String(b._id) === id &&
      new URLSearchParams(location.search).get("print") === "1" &&
      !printRequested.current
    ) {
      printRequested.current = true;
      const timer = window.setTimeout(() => window.print(), 250);
      return () => window.clearTimeout(timer);
    }
  }, [b, id, location.search]);
  const downloadInvoice = async () => {
    try {
      const response = await api.get(`${base}/invoice`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${b.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const sendInvoiceEmail = async () => {
    setEmailBusy(true);
    emailAttemptKey.current ||= crypto.randomUUID();
    try {
      await api.post(
        `${base}/send-email`,
        {},
        {
          headers: { "Idempotency-Key": emailAttemptKey.current },
        },
      );
      emailAttemptKey.current = null;
      toast.success("Invoice emailed successfully.");
      reload();
    } catch (e) {
      if ([502, 503].includes(e.response?.status))
        emailAttemptKey.current = null;
      toast.error(errorMessage(e));
      reload();
    } finally {
      setEmailBusy(false);
    }
  };
  if (!b) return <State loading={loading} error={error} retry={reload} />;
  const shop = b.shopSnapshot || {};
  const reversible = !["cancelled", "returned"].includes(b.status);
  const whatsappPhone = String(b.partyPhone || "").replace(/\D/g, "");
  const whatsappNumber =
    whatsappPhone.length === 10 ? `91${whatsappPhone}` : whatsappPhone;
  const whatsappMessage = encodeURIComponent(
    [
      `Harish Computer Shop invoice ${b.number}`,
      `Total: ${money(b.total)}`,
      `Paid: ${money(b.paid)}`,
      `Pending: ${money(b.due)}`,
      ...b.lines
        .filter((line) => line.warrantyEnabled || line.guaranteeEnabled)
        .map((line) => `${line.name}: ${coverageText(line)}`),
      "I will attach the downloaded invoice PDF in this chat.",
    ].join("\n"),
  );
  return (
    <>
      <div className="m-no-print">
        <Link
          className="m-text-link"
          to={`/app/${purchase ? "purchases" : "sales"}`}
        >
          <ArrowLeft size={15} /> Back to invoices
        </Link>
        <Heading
          title={b.number}
          description={`${purchase ? "Purchase" : "Sales"} invoice · ${date(b.date)}`}
        >
          <select
            aria-label="Receipt format"
            value={thermal ? "thermal" : "a4"}
            onChange={(e) => setThermal(e.target.value === "thermal")}
          >
            <option value="a4">A4 invoice</option>
            <option value="thermal">80mm receipt</option>
          </select>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </Button>
          {!purchase && (
            <>
              <Button variant="secondary" onClick={downloadInvoice}>
                <Download size={16} /> Download invoice PDF
              </Button>
              <a
                className="m-button secondary"
                href={
                  whatsappNumber
                    ? `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
                aria-disabled={!whatsappNumber}
                onClick={(event) => {
                  if (!whatsappNumber) event.preventDefault();
                }}
              >
                <MessageCircle size={16} /> Send via WhatsApp
              </a>
              <Button
                type="button"
                variant="secondary"
                busy={emailBusy}
                disabled={!b.partyEmail || emailBusy}
                onClick={sendInvoiceEmail}
              >
                <Mail size={16} /> Send via Email
              </Button>
            </>
          )}
          {b.due > 0 && reversible && (
            <Button onClick={() => setAction("payment")}>
              <CreditCard size={16} /> Record payment
            </Button>
          )}
          {can("admin") && reversible && (
            <>
              <Button variant="secondary" onClick={() => setAction("return")}>
                <RotateCcw size={15} /> Return items
              </Button>
              <Button variant="danger" onClick={() => setAction("cancel")}>
                <XCircle size={15} /> Cancel invoice
              </Button>
            </>
          )}
          {can("admin") && b.returned > 0 && !purchase && (
            <Link
              className="m-button"
              to="/app/pos"
              state={{ exchangeId: b._id }}
            >
              <ShoppingCart size={16} /> Create exchange sale
            </Link>
          )}
        </Heading>
      </div>
      <style media="print">
        {thermal
          ? "@page { size: 80mm 297mm; margin: 4mm; }"
          : "@page { size: A4 portrait; margin: 10mm; }"}
      </style>
      <article
        ref={invoiceRef}
        className={`m-card m-invoice m-invoice-bordered ${thermal ? "thermal" : ""}`}
      >
        <ShopHeader details={b.printShop} gstin={shop.gstin} logo={shop.logo} />
        <div className="m-invoice-details">
          <div className="m-invoice-top m-invoice-document-meta">
            <div>
              <span className="m-eyebrow">
                {purchase ? "PURCHASE INVOICE" : "TAX INVOICE"}
              </span>
              <h3>{b.number}</h3>
              <p>{date(b.date)}</p>
              <span className="m-invoice-header-status">
                <Badge tone={b.status === "completed" ? "green" : "amber"}>
                  {b.status}
                </Badge>
              </span>
            </div>
          </div>
          <div className="m-invoice-party">
            <div>
              <small>{purchase ? "SUPPLIER" : "BILL TO"}</small>
              <strong>{b.partyName}</strong>
              <p>
                {b.partyPhone}
                {b.partyEmail && (
                  <>
                    <br />
                    {b.partyEmail}
                  </>
                )}
                {b.partyAddress && (
                  <>
                    <br />
                    {b.partyAddress}
                  </>
                )}
                {b.partyGstin && (
                  <>
                    <br />
                    GSTIN: {b.partyGstin}
                  </>
                )}
              </p>
            </div>
            {purchase && b.supplierInvoice && (
              <div>
                <small>SUPPLIER INVOICE</small>
                <strong>{b.supplierInvoice}</strong>
              </div>
            )}
            <div className="m-invoice-header-payment">
              <small>PAYMENT METHOD</small>
              <strong>{b.method.toUpperCase()}</strong>
            </div>
          </div>
        </div>
        <Table
          rows={b.lines}
          columns={[
            {
              key: "name",
              label: "PRODUCT",
              render: (l) => (
                <>
                  <strong>{l.name}</strong>
                  <small>
                    {[l.sku, l.categoryName].filter(Boolean).join(" · ")}
                    {(l.productType || l.model || l.size || l.colour) &&
                      ` · ${[l.productType, l.model, l.size, l.colour]
                        .filter(Boolean)
                        .join(" / ")}`}
                  </small>
                  {(l.guaranteeEnabled || l.warrantyEnabled) && (
                    <small>{coverageText(l)}</small>
                  )}
                </>
              ),
            },
            { key: "quantity", label: "QTY" },
            { key: "rate", label: "RATE", render: (l) => money(l.rate) },
            {
              key: "discount",
              label: "DISCOUNT",
              render: (l) => money(l.discount),
            },
            { key: "taxRate", label: "GST", render: (l) => `${l.taxRate}%` },
            { key: "total", label: "AMOUNT", render: (l) => money(l.total) },
          ]}
        />
        <div className="m-invoice-summary">
          <div>
            <p>{b.notes}</p>
            <small>
              Returned items and payments are recorded separately below.
            </small>
          </div>
          <div className="m-bill-totals">
            <div>
              <span>Subtotal</span>
              <span>{money(b.subtotal)}</span>
            </div>
            <div>
              <span>Item discounts</span>
              <span>−{money(b.discount - (b.invoiceDiscount || 0))}</span>
            </div>
            {b.invoiceDiscount > 0 && (
              <div>
                <span>Bill discount</span>
                <span>−{money(b.invoiceDiscount)}</span>
              </div>
            )}
            <div>
              <span>GST / Tax</span>
              <span>{money(b.tax)}</span>
            </div>
            <div>
              <span>Other charges</span>
              <span>{money(b.charges)}</span>
            </div>
            <div className="m-grand-total">
              <span>Original total</span>
              <strong>{money(b.total)}</strong>
            </div>
            {b.returned > 0 && (
              <div>
                <span>Returned / reversed</span>
                <span>−{money(b.returned)}</span>
              </div>
            )}
            <div className="m-net-total">
              <span>Net total</span>
              <strong>{money(b.total - b.returned)}</strong>
            </div>
            <div>
              <span>Paid after refunds</span>
              <span>{money(b.paid)}</span>
            </div>
            <div>
              <span>Pending amount</span>
              <strong>{money(b.due)}</strong>
            </div>
            {b.change > 0 && (
              <div>
                <span>Initial cash change</span>
                <strong>{money(b.change)}</strong>
              </div>
            )}
          </div>
        </div>
        <div className="m-invoice-print-payment">
          <div>
            <small>PAYMENT METHOD</small>
            <strong>{b.method.toUpperCase()}</strong>
          </div>
          <div>
            <small>INVOICE STATUS</small>
            <strong>{b.status}</strong>
          </div>
        </div>
        <div className="m-invoice-footer">
          {shop.receiptFooter || "Thank you for shopping with us."}
        </div>
      </article>
      {!purchase && b.emailDeliveries?.length > 0 && (
        <section className="m-card m-history-section" aria-live="polite">
          <h3>Invoice email history</h3>
          <Table
            rows={b.emailDeliveries}
            columns={[
              { key: "recipient", label: "RECIPIENT" },
              {
                key: "createdAt",
                label: "ATTEMPTED",
                render: (delivery) => date(delivery.createdAt),
              },
              {
                key: "status",
                label: "STATUS",
                render: (delivery) => (
                  <Badge
                    tone={
                      delivery.status === "sent"
                        ? "green"
                        : delivery.status === "failed"
                          ? "red"
                          : "amber"
                    }
                  >
                    {delivery.status}
                  </Badge>
                ),
              },
              {
                key: "failureReason",
                label: "DETAILS",
                render: (delivery) =>
                  delivery.failureReason || delivery.messageId || "—",
              },
            ]}
          />
        </section>
      )}
      <section className="m-card m-history-section">
        <h3>Payments & refunds</h3>
        <Table
          rows={b.payments}
          columns={[
            {
              key: "createdAt",
              label: "DATE",
              render: (r) => date(r.createdAt),
            },
            { key: "kind", label: "TYPE" },
            { key: "method", label: "METHOD" },
            { key: "amount", label: "AMOUNT", render: (r) => money(r.amount) },
          ]}
        />
        {b.returns.length > 0 && (
          <>
            <h3>Return & reversal history</h3>
            <Table
              rows={b.returns}
              columns={[
                {
                  key: "createdAt",
                  label: "DATE",
                  render: (r) => date(r.createdAt),
                },
                { key: "reason", label: "REASON" },
                {
                  key: "total",
                  label: "RETURN VALUE",
                  render: (r) => money(r.total),
                },
                {
                  key: "refund",
                  label: "REFUND",
                  render: (r) => money(r.refund),
                },
              ]}
            />
          </>
        )}
      </section>
      {action && (
        <InvoiceAction
          action={action}
          bill={b}
          base={base}
          onClose={() => setAction(null)}
          onSaved={() => {
            setAction(null);
            reload();
          }}
        />
      )}
    </>
  );
}
function InvoiceAction({ action, bill, base, onClose, onSaved }) {
  const [form, setForm] = useState({
      reason: "",
      amount: bill.due,
      method: "cash",
      reference: "",
    }),
    [quantities, setQuantities] = useState({});
  const { execute, busy } = useCommand();
  const payment = action === "payment";
  const submit = async (e) => {
    e.preventDefault();
    const lines = Object.entries(quantities)
      .filter(([, q]) => Number(q) > 0)
      .map(([product, q]) => ({ product, quantity: Number(q) }));
    const body = payment
      ? {
          amount: Number(form.amount),
          method: form.method,
          reference: form.reference,
        }
      : { reason: form.reason, method: form.method, lines };
    const r = await execute(
      "post",
      `${base}/${payment ? "payments" : action === "return" ? "returns" : "cancel"}`,
      body,
      payment ? "Payment recorded" : "Reversal recorded and stock updated",
    );
    if (r) onSaved();
  };
  return (
    <Modal
      title={
        payment
          ? "Record payment"
          : action === "return"
            ? "Return invoice items"
            : "Cancel and reverse invoice"
      }
      onClose={() => !busy && onClose()}
    >
      <form className="m-modal-form" onSubmit={submit}>
        {payment ? (
          <Field
            label="Payment amount (₹)"
            type="number"
            min=".01"
            step=".01"
            max={bill.due}
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            required
          />
        ) : (
          <>
            <Field
              label="Reason"
              type="textarea"
              minLength={3}
              value={form.reason}
              onChange={(e) =>
                setForm((f) => ({ ...f, reason: e.target.value }))
              }
              required
            />
            {action === "return" ? (
              bill.lines
                .filter((l) => l.quantity > l.returnedQuantity)
                .map((l) => (
                  <Field
                    key={l.product}
                    label={`${l.name} · ${l.quantity - l.returnedQuantity} returnable`}
                    type="number"
                    min="0"
                    max={l.quantity - l.returnedQuantity}
                    step="1"
                    value={quantities[l.product] || 0}
                    onChange={(e) =>
                      setQuantities((v) => ({
                        ...v,
                        [l.product]: e.target.value,
                      }))
                    }
                  />
                ))
            ) : (
              <p className="m-note">
                This reverses all remaining items and records any required
                refund. The original invoice is retained.
              </p>
            )}
          </>
        )}
        <Select
          label={payment ? "Payment method" : "Refund method"}
          options={paymentOptions.filter((o) => o.value !== "credit")}
          value={form.method}
          onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
          required
        />
        {payment && (
          <Field
            label="Reference"
            value={form.reference}
            onChange={(e) =>
              setForm((f) => ({ ...f, reference: e.target.value }))
            }
          />
        )}
        <div className="m-form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Back
          </Button>
          <Button
            type="submit"
            busy={busy}
            variant={action === "cancel" ? "danger" : ""}
          >
            Confirm{" "}
            {payment
              ? "payment"
              : action === "return"
                ? "return"
                : "cancellation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
