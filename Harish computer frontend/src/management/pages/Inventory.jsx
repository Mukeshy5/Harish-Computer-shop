import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardCheck,
  SlidersHorizontal,
  Download,
  Check,
} from "lucide-react";
import { useSession } from "../Management";
import { date, exportCsv, money, useCommand, useData } from "../api";
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
export function Inventory() {
  const { can } = useSession(),
    admin = can("admin");
  const [q, setQ] = useState(""),
    [tab, setTab] = useState("stock"),
    [page, setPage] = useState(1);
  const summary = useData("/inventory/summary", {}, true);
  const rows = useData(
    admin
      ? tab === "stock"
        ? "/reports/inventory"
        : "/inventory/movements"
      : "/products",
    { q, page, limit: 100 },
    true,
  );
  const data = (rows.data?.data || []).filter(
    (r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()),
  );
  const columns =
    tab === "movements"
      ? [
          { key: "createdAt", label: "DATE", render: (r) => date(r.createdAt) },
          { key: "product", label: "PRODUCT ID" },
          { key: "type", label: "TYPE" },
          { key: "previousQuantity", label: "BEFORE" },
          { key: "quantity", label: "CHANGE" },
          { key: "newQuantity", label: "AFTER" },
          { key: "reason", label: "REASON" },
          { key: "reference", label: "REFERENCE" },
        ]
      : admin
        ? [
            { key: "product", label: "PRODUCT" },
            { key: "sku", label: "SKU" },
            { key: "openingStock", label: "OPENING" },
            { key: "purchased", label: "PURCHASED" },
            { key: "sold", label: "SOLD" },
            { key: "saleReturns", label: "SALES RETURNS" },
            { key: "purchaseReturns", label: "PURCHASE RETURNS" },
            { key: "adjusted", label: "ADJUSTED" },
            { key: "available", label: "AVAILABLE" },
            {
              key: "discrepancy",
              label: "LEDGER DIFFERENCE",
              render: (r) => (
                <Badge tone={r.discrepancy ? "red" : "green"}>
                  {r.discrepancy}
                </Badge>
              ),
            },
            {
              key: "valuation",
              label: "VALUE",
              render: (r) => money(r.valuation),
            },
          ]
        : [
            { key: "name", label: "PRODUCT" },
            { key: "sku", label: "SKU" },
            { key: "stock", label: "AVAILABLE" },
            {
              key: "sellingPrice",
              label: "SELLING PRICE",
              render: (r) => money(r.sellingPrice),
            },
            {
              key: "status",
              label: "STATUS",
              render: (r) => <Stock product={r} />,
            },
          ];
  return (
    <>
      <Heading
        title="Stock & inventory"
        description="A clear view of every unit, from arrival to sale."
      >
        {admin && (
          <>
            <Button
              variant="secondary"
              onClick={() => exportCsv(data, "inventory")}
            >
              <Download size={16} /> Export
            </Button>
            <Link className="m-button secondary" to="/app/stock-counts">
              <ClipboardCheck size={16} /> Physical count
            </Link>
            <Link className="m-button" to="/app/adjustments">
              <SlidersHorizontal size={16} /> Adjust stock
            </Link>
          </>
        )}
      </Heading>
      <div className="m-secondary-metrics">
        <div>
          <span>Unique products</span>
          <strong>{summary.data?.uniqueProducts ?? "—"}</strong>
        </div>
        <div>
          <span>Physical stock units</span>
          <strong>{summary.data?.totalUnits ?? "—"}</strong>
        </div>
        {admin && (
          <div>
            <span>Weighted average inventory value</span>
            <strong>{money(summary.data?.valuation)}</strong>
          </div>
        )}
      </div>
      {summary.data?.categories?.length > 0 && (
        <section className="m-card" style={{ marginBottom: 22 }}>
          <div className="m-card-heading">
            <h3>Stock by category</h3>
          </div>
          <Table
            rows={summary.data.categories}
            columns={[
              { key: "category", label: "CATEGORY" },
              { key: "products", label: "PRODUCTS" },
              { key: "units", label: "UNITS" },
              ...(admin
                ? [
                    {
                      key: "valuation",
                      label: "VALUE",
                      render: (r) => money(r.valuation),
                    },
                  ]
                : []),
            ]}
          />
        </section>
      )}
      <section className="m-card">
        {admin && (
          <div className="m-tabs m-table-tabs">
            {[
              ["stock", "Stock reconciliation"],
              ["movements", "Movement ledger"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={tab === v ? "active" : ""}
                onClick={() => {
                  setTab(v);
                  setPage(1);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="m-toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
        </div>
        <State
          loading={rows.loading && !rows.data}
          error={rows.error}
          retry={rows.reload}
          empty={rows.data && !data.length}
        />
        {data.length > 0 && <Table rows={data} columns={columns} />}
        <Pagination
          data={
            tab === "stock" && admin
              ? { total: data.length, pages: 1 }
              : rows.data
          }
          page={page}
          setPage={setPage}
        />
      </section>
      <p className="m-note">
        Available stock = opening + purchases + sales returns − sales − purchase
        returns + authorized adjustments. All invoice reversals appear as return
        movements.
      </p>
    </>
  );
}
export function Adjustment() {
  const [q, setQ] = useState(""),
    [form, setForm] = useState({
      product: "",
      type: "increase",
      quantity: 1,
      reason: "",
      reference: "",
    });
  const products = useData("/products", { q, limit: 100 });
  const { execute, busy } = useCommand();
  const selected = products.data?.data.find((p) => p._id === form.product);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const result = await execute(
      "post",
      "/inventory/adjustments",
      form,
      "Stock adjusted and movement recorded",
    );
    if (result) {
      products.reload();
      setForm((f) => ({ ...f, reason: "", reference: "", quantity: 1 }));
    }
  };
  return (
    <>
      <Heading
        title="Stock adjustment"
        description="Record stock corrections with a clear reason and permanent audit trail."
      />
      <form className="m-card m-form-page" onSubmit={submit}>
        <div className="m-form-grid">
          <Field
            label="Find a product"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setForm((f) => ({ ...f, product: "" }));
            }}
            placeholder="Search name, SKU or barcode"
          />
          <Select
            label="Product"
            required
            options={products.data?.data}
            value={form.product}
            onChange={set("product")}
          />
          <Select
            label="Adjustment type"
            required
            value={form.type}
            onChange={set("type")}
            options={[
              { value: "increase", label: "Increase stock" },
              { value: "decrease", label: "Decrease stock" },
            ]}
          />
          <Field
            label="Quantity"
            type="number"
            min="1"
            step="1"
            max={form.type === "decrease" ? selected?.stock : 1e8}
            value={form.quantity}
            onChange={set("quantity")}
            required
          />
          <Field
            label="Reason"
            type="textarea"
            required
            minLength={3}
            value={form.reason}
            onChange={set("reason")}
          />
          <Field
            label="Reference (optional)"
            value={form.reference}
            onChange={set("reference")}
          />
        </div>
        {selected && (
          <div className="m-count-preview">
            <span>
              Current stock <strong>{selected.stock}</strong>
            </span>
            <span>
              After adjustment{" "}
              <strong>
                {selected.stock +
                  (form.type === "increase" ? 1 : -1) * Number(form.quantity)}
              </strong>
            </span>
          </div>
        )}
        <div className="m-form-actions">
          <Link className="m-button secondary" to="/app/inventory">
            Back to inventory
          </Link>
          <Button type="submit" busy={busy} disabled={!form.product}>
            Save adjustment
          </Button>
        </div>
      </form>
    </>
  );
}
export function StockCount() {
  const [q, setQ] = useState(""),
    [productPage, setProductPage] = useState(1);
  const products = useData("/products", { q, page: productPage, limit: 100 }),
    counts = useData("/inventory/stock-counts", { limit: 100 });
  const [chosen, setChosen] = useState([]),
    [count, setCount] = useState(null),
    [confirm, setConfirm] = useState(false);
  const { execute, busy } = useCommand();
  const start = async () => {
    const r = await execute(
      "post",
      "/inventory/stock-counts",
      { lines: chosen.map((product) => ({ product })) },
      "Stock count started",
    );
    if (r) {
      setCount(r);
      counts.reload();
    }
  };
  const save = async () => {
    const r = await execute(
      "patch",
      `/inventory/stock-counts/${count._id}`,
      { lines: count.lines },
      "Count saved for review",
    );
    if (r) {
      setCount(r);
      setConfirm(true);
      counts.reload();
    }
  };
  const apply = async () => {
    const r = await execute(
      "post",
      `/inventory/stock-counts/${count._id}/apply`,
      {},
      "Physical count applied",
    );
    if (r) {
      setCount(null);
      setConfirm(false);
      counts.reload();
      products.reload();
    }
  };
  const name = (id) =>
    products.data?.data.find((p) => p._id === id)?.name || id;
  return (
    <>
      <Heading
        title="Physical stock count"
        description="Count, compare, explain differences, then authorize adjustments."
      />
      <State
        error={products.error || counts.error}
        loading={products.loading && !products.data}
      />
      {!count ? (
        <>
          <section className="m-card m-form-page">
            <h3>Start a count</h3>
            <p className="m-note">
              Select the products you are ready to count. A snapshot of current
              stock will be saved.
            </p>
            <SearchBox
              value={q}
              onChange={(value) => {
                setQ(value);
                setProductPage(1);
              }}
              placeholder="Find products to count…"
            />
            <div className="m-count-products">
              {products.data?.data.map((p) => (
                <Field
                  key={p._id}
                  type="checkbox"
                  label={`${p.name} · ${p.sku}`}
                  checked={chosen.includes(p._id)}
                  onChange={(e) =>
                    setChosen((old) =>
                      e.target.checked
                        ? [...old, p._id]
                        : old.filter((id) => id !== p._id),
                    )
                  }
                />
              ))}
            </div>
            <Pagination
              data={products.data}
              page={productPage}
              setPage={setProductPage}
            />
            <Button busy={busy} onClick={start} disabled={!chosen.length}>
              <ClipboardCheck size={17} /> Start count · {chosen.length}{" "}
              products
            </Button>
          </section>
          <section className="m-card m-history-section">
            <h3>Count history</h3>
            <Table
              rows={counts.data?.data}
              columns={[
                {
                  key: "createdAt",
                  label: "STARTED",
                  render: (r) => date(r.createdAt),
                },
                {
                  key: "lines",
                  label: "PRODUCTS",
                  render: (r) => r.lines.length,
                },
                {
                  key: "status",
                  label: "STATUS",
                  render: (r) => (
                    <Badge tone={r.status === "applied" ? "green" : "amber"}>
                      {r.status}
                    </Badge>
                  ),
                },
                {
                  key: "actions",
                  label: "",
                  render: (r) => (
                    <Button variant="secondary" onClick={() => setCount(r)}>
                      {r.status === "draft" ? "Resume count" : "View count"}
                    </Button>
                  ),
                },
              ]}
            />
          </section>
        </>
      ) : (
        <section className="m-card m-form-page">
          <h3>
            {count.status === "applied"
              ? "Applied count"
              : "Enter physical quantities"}
          </h3>
          {count.lines.map((l, i) => (
            <div className="m-count-line" key={l.product}>
              <div>
                <strong>{l.name || name(l.product)}</strong>
                <small>
                  System quantity: {l.expected} · Difference:{" "}
                  {Number(l.counted) - l.expected}
                </small>
              </div>
              <Field
                label="Counted"
                type="number"
                min="0"
                step="1"
                value={l.counted}
                disabled={count.status === "applied"}
                onChange={(e) =>
                  setCount((c) => ({
                    ...c,
                    lines: c.lines.map((line, j) =>
                      j === i ? { ...line, counted: e.target.value } : line,
                    ),
                  }))
                }
              />
              <Field
                label="Discrepancy reason"
                value={l.reason}
                disabled={count.status === "applied"}
                onChange={(e) =>
                  setCount((c) => ({
                    ...c,
                    lines: c.lines.map((line, j) =>
                      j === i ? { ...line, reason: e.target.value } : line,
                    ),
                  }))
                }
              />
            </div>
          ))}
          <div className="m-form-actions">
            <Button variant="secondary" onClick={() => setCount(null)}>
              Back to counts
            </Button>
            {count.status === "draft" && (
              <Button busy={busy} onClick={save}>
                Save & review differences
              </Button>
            )}
          </div>
        </section>
      )}
      {confirm && (
        <Modal
          title="Authorize count adjustments"
          onClose={() => setConfirm(false)}
        >
          <p>
            Review the quantities and reasons before applying. The server checks
            that stock has not changed since this count began.
          </p>
          <Table
            rows={count.lines}
            columns={[
              {
                key: "product",
                label: "PRODUCT",
                render: (r) => name(r.product),
              },
              { key: "expected", label: "SYSTEM" },
              { key: "counted", label: "COUNTED" },
              { key: "difference", label: "CHANGE" },
              { key: "reason", label: "REASON" },
            ]}
          />
          <div className="m-form-actions">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Back
            </Button>
            <Button busy={busy} onClick={apply}>
              <Check size={16} /> Authorize & apply
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
