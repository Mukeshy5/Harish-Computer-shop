import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Package,
  Warehouse,
  SlidersHorizontal,
  TriangleAlert,
  CircleCheck,
  CalendarDays,
} from "lucide-react";
import { useSession } from "../Management";
import { money, useData } from "../api";
import { Badge, Heading, State } from "../ui";
export function Dashboard() {
  const { user } = useSession();
  const {
    data: d,
    loading,
    error,
    reload,
  } = useData("/reports/dashboard", {}, true);
  if (!d) return <State loading={loading} error={error} retry={reload} />;
  const cards = [
    [
      "Total products",
      d.totalProducts,
      Package,
      "blue",
      "Products in your catalog",
    ],
    [
      "Total stock units",
      Number(d.stockUnits).toLocaleString("en-IN"),
      Package,
      "violet",
      `${d.totalProducts} products in your catalog`,
    ],
    [
      "Products needing attention",
      d.lowStock + d.outOfStock,
      TriangleAlert,
      "orange",
      "Low stock and out of stock",
    ],
    [
      "Inventory value",
      money(d.inventoryValue),
      Warehouse,
      "green",
      "Current stock valuation",
    ],
  ];
  return (
    <>
      <div className="m-breadcrumb">
        WORKSPACE <span>/</span> OVERVIEW
      </div>
      <Heading
        title={`Good ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }) < 12 ? "morning" : "day"}, ${user.name.split(" ")[0]} 👋`}
        description="Here’s what’s happening at your shop today."
      >
        <span className="m-date-chip">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </Heading>
      {error && <div className="m-error">{error}</div>}
      <div className="m-metrics">
        {cards.map(([label, value, Icon, tone, note]) => (
          <article className="m-metric" key={label}>
            <div>
              <span>{label}</span>
              <div className={`m-metric-icon ${tone}`}>
                <Icon size={19} />
              </div>
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="m-dashboard-grid">
        <section className="m-card">
          <div className="m-card-heading">
            <div>
              <h3>Stock watch</h3>
              <p>A little attention goes a long way</p>
            </div>
            <TriangleAlert size={19} className="m-text-amber" />
          </div>
          <div className="m-stock-watch">
            <div>
              <strong>{d.lowStock}</strong>
              <span>
                <i className="amber" /> Low stock
              </span>
            </div>
            <div>
              <strong>{d.outOfStock}</strong>
              <span>
                <i className="red" /> Out of stock
              </span>
            </div>
          </div>
          <div className="m-alert-list">
            {d.alerts.length ? (
              d.alerts.slice(0, 4).map((p) => (
                <div key={p._id}>
                  <span className="m-product-icon">
                    <Package size={18} />
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                  </div>
                  <Badge tone={p.stock ? "amber" : "red"}>{p.stock} left</Badge>
                </div>
              ))
            ) : (
              <div className="m-all-good">
                <CircleCheck size={27} />
                <strong>You’re all caught up</strong>
                <span>No stock alerts to review.</span>
              </div>
            )}
          </div>
          <Link className="m-card-bottom" to="/app/alerts">
            View all stock alerts <ArrowRight size={16} />
          </Link>
        </section>
        <section className="m-card m-quick">
          <div className="m-card-heading">
            <div>
              <h3>Quick actions</h3>
              <p>Keep business moving</p>
            </div>
          </div>
          <Link to="/app/products/new">
            <span className="green">
              <Package size={20} />
            </span>
            <div>
              Add a product<small>Keep your catalog up to date</small>
            </div>
            <ArrowUpRight size={17} />
          </Link>
          <Link to="/app/inventory">
            <span className="blue">
              <Warehouse size={20} />
            </span>
            <div>
              View inventory<small>Review stock and movements</small>
            </div>
            <ArrowUpRight size={17} />
          </Link>
          <Link to="/app/adjustments">
            <span className="violet">
              <SlidersHorizontal size={20} />
            </span>
            <div>
              Adjust stock<small>Record a stock correction</small>
            </div>
            <ArrowUpRight size={17} />
          </Link>
        </section>
      </div>
    </>
  );
}
