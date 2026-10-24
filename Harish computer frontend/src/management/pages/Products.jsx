import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Download, Plus, Pencil, Package, ArrowLeft } from "lucide-react";
import { useSession } from "../Management";
import { date, exportCsv, money, useCommand, useData } from "../api";
import { AddProduct } from "./AddProduct";
import {
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
export function Products({ alerts = false }) {
  const { can } = useSession();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || ""),
    [page, setPage] = useState(1),
    [category, setCategory] = useState(""),
    [active, setActive] = useState(""),
    [sort, setSort] = useState("createdAt"),
    [selected, setSelected] = useState(null);
  const { data, loading, error, reload } = useData(
    alerts ? "/inventory/low-stock" : "/products",
    { q: search, page, category, active, sort },
    true,
  );
  const categories = useData("/categories", { limit: 100 });
  const { execute, busy } = useCommand();
  useEffect(() => {
    setSearch(params.get("q") || "");
    setPage(1);
  }, [params]);
  const filters = (fn) => (value) => {
    fn(value);
    setPage(1);
  };
  const columns = [
    {
      key: "name",
      label: "PRODUCT",
      render: (p) => (
        <div className="m-product-cell">
          <span className="m-product-icon">
            <Package size={19} />
          </span>
          <div>
            <strong>{p.name}</strong>
            <small>{p.sku}</small>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      label: "CATEGORY",
      render: (p) =>
        categories.data?.data.find((c) => c._id === p.category)?.name || "—",
    },
    {
      key: "sellingPrice",
      label: "SELLING PRICE",
      render: (p) => money(p.sellingPrice),
    },
    {
      key: "stock",
      label: "AVAILABLE",
      render: (p) => (
        <strong>
          {p.stock} <small>{p.unit}</small>
        </strong>
      ),
    },
    { key: "status", label: "STATUS", render: (p) => <Stock product={p} /> },
    ...(alerts
      ? [
          { key: "minStock", label: "MINIMUM" },
          { key: "suggestedReorder", label: "REORDER" },
          {
            key: "lastPurchaseDate",
            label: "LAST PURCHASE",
            render: (p) => date(p.lastPurchaseDate),
          },
        ]
      : []),
    {
      key: "actions",
      label: "",
      render: (p) => (
        <div className="m-row-actions">
          <button onClick={() => setSelected(p)}>View</button>
          {can("admin") && (
            <Link
              to={`/app/products/${p._id}/edit`}
              aria-label={`Edit ${p.name}`}
            >
              <Pencil size={15} />
            </Link>
          )}
        </div>
      ),
    },
  ];
  return (
    <>
      <Heading
        title={alerts ? "Stock alerts" : "Product catalog"}
        description={
          alerts
            ? "Know what needs replenishing before your next sale."
            : "Everything you sell, organized in one place."
        }
      >
        {can("admin") && (
          <>
            <Button
              variant="secondary"
              onClick={async () => {
                const r = await execute(
                  "get",
                  alerts ? "/reports/low-stock" : "/reports/inventory",
                  {},
                  "",
                );
                if (r) exportCsv(r.data, alerts ? "stock-alerts" : "inventory");
              }}
            >
              <Download size={16} /> Export
            </Button>
            <Link className="m-button" to="/app/products/new">
              <Plus size={17} /> Add product
            </Link>
          </>
        )}
      </Heading>
      <section className="m-card">
        <div className="m-toolbar">
          <SearchBox
            value={search}
            onChange={filters(setSearch)}
            placeholder="Search name, SKU or barcode…"
          />
          <select
            aria-label="Filter category"
            value={category}
            onChange={(e) => filters(setCategory)(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.data?.data.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Product status"
            value={active}
            onChange={(e) => filters(setActive)(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => filters(setSort)(e.target.value)}
          >
            <option value="createdAt">Newest first</option>
            <option value="stock">Stock quantity</option>
            <option value="sellingPrice">Selling price</option>
            <option value="name">Name</option>
          </select>
        </div>
        <State
          loading={loading && !data}
          error={error}
          retry={reload}
          empty={data && !data.data.length}
        />
        {data?.data.length > 0 && <Table columns={columns} rows={data.data} />}
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="m-detail-grid">
            {[
              ["SKU", selected.sku],
              ["Barcode", selected.barcode || "—"],
              ["Model", selected.model || "—"],
              ["Size", selected.size || "—"],
              ["Product type", selected.productType || "—"],
              ["Company", selected.companyName || "—"],
              ["Colour", selected.colour || "—"],
              ["Stock", `${selected.stock} ${selected.unit}`],
              ["Selling price", money(selected.sellingPrice)],
              ...(can("admin")
                ? [
                    ["Purchase price", money(selected.purchasePrice)],
                    ["Weighted average cost", money(selected.averageCost)],
                  ]
                : []),
              ["GST", `${selected.taxRate}%`],
              ["Stock alert at", selected.minStock],
              ["Description", selected.description || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          {can("admin") && (
            <Button
              variant="secondary"
              busy={busy}
              onClick={async () => {
                const r = await execute(
                  "patch",
                  `/products/${selected._id}/status`,
                  { active: !selected.active },
                );
                if (r) {
                  setSelected(null);
                  reload();
                }
              }}
            >
              {selected.active ? "Deactivate" : "Activate"} product
            </Button>
          )}
        </Modal>
      )}
    </>
  );
}
export function ProductForm() {
  const { id } = useParams();
  return id ? <ProductEditor /> : <AddProduct />;
}
function ProductEditor() {
  const { id } = useParams(),
    navigate = useNavigate();
  const { data, loading, error } = useData(`/products/${id}`);
  const [values, setValues] = useState({
    name: "",
    sku: "",
    barcode: "",
    description: "",
    purchasePrice: 0,
    sellingPrice: 0,
    minStock: 5,
    unit: "piece",
    taxRate: 18,
    active: true,
    category: "",
    brand: "",
    supplier: "",
    image: "",
  });
  const { execute, busy } = useCommand();
  const categories = useData("/categories", { limit: 100 }),
    brands = useData("/brands", { limit: 100 }),
    suppliers = useData("/suppliers", { limit: 100 });
  useEffect(() => {
    if (data) setValues(data);
  }, [data]);
  const set = (k) => (e) =>
    setValues((v) => ({
      ...v,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));
  if (loading || error) return <State loading={loading} error={error} />;
  const submit = async (e) => {
    e.preventDefault();
    const r = await execute("patch", `/products/${id}`, values);
    if (r) navigate("/app/products");
  };
  return (
    <>
      <Link className="m-text-link" to="/app/products">
        <ArrowLeft size={15} /> Product catalog
      </Link>
      <Heading
        title="Edit product"
        description="Set up accurate product details for faster, easier billing."
      />
      <form onSubmit={submit} className="m-card m-form-page">
        <h3>Product information</h3>
        <div className="m-form-grid">
          <Field
            label="Product name"
            value={values.name}
            onChange={set("name")}
            required
            maxLength={200}
          />
          <Field
            label="SKU / Product code"
            value={values.sku}
            onChange={set("sku")}
            required
            maxLength={100}
          />
          <Field
            label="Barcode"
            value={values.barcode || ""}
            onChange={set("barcode")}
          />
          <Field
            label="Product type"
            value={values.productType || ""}
            onChange={set("productType")}
            maxLength={200}
            placeholder="e.g. Laptop, Desktop, SSD"
          />
          <Field
            label="Model"
            value={values.model || ""}
            onChange={set("model")}
            maxLength={200}
            placeholder="Product model"
          />
          {[
            ["size", "Product size"],
            ["companyName", "Company name"],
            ["colour", "Product colour"],
          ].map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={values[key] || ""}
              onChange={set(key)}
              maxLength={200}
            />
          ))}
          <Select
            label="Category"
            value={values.category || ""}
            onChange={set("category")}
            options={categories.data?.data}
          />
          <Select
            label="Brand"
            value={values.brand || ""}
            onChange={set("brand")}
            options={brands.data?.data}
          />
          <Select
            label="Supplier"
            value={values.supplier || ""}
            onChange={set("supplier")}
            options={suppliers.data?.data}
          />
          <Field
            label="Description"
            type="textarea"
            value={values.description}
            onChange={set("description")}
          />
          <Field
            label="Image URL (optional)"
            type="url"
            value={values.image}
            onChange={set("image")}
          />
        </div>
        <h3>Pricing & inventory</h3>
        <div className="m-form-grid">
          {[
            ["purchasePrice", "Purchase price (₹)"],
            ["sellingPrice", "Selling price (₹)"],
            ["minStock", "Minimum stock alert"],
            ["taxRate", "GST rate (%)"],
          ].map(([key, label]) => (
            <Field
              key={key}
              label={label}
              type="number"
              min="0"
              max={key === "taxRate" ? 100 : 1e9}
              step={key === "minStock" ? 1 : ".01"}
              value={values[key]}
              onChange={set(key)}
              required
            />
          ))}
          <Field
            label="Unit of measurement"
            value={values.unit}
            onChange={set("unit")}
            required
          />
          <Field
            label="Active product"
            type="checkbox"
            checked={values.active}
            onChange={set("active")}
          />
        </div>
        <p className="m-note">
          Current stock: {values.stock}. Use a stock adjustment to change
          physical quantities.
        </p>
        <div className="m-form-actions">
          <Link className="m-button secondary" to="/app/products">
            Cancel
          </Link>
          <Button type="submit" busy={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </>
  );
}
