import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
  X,
} from "lucide-react";
import { date, money } from "../api";
import { Heading, State } from "../ui";
import { useMediaQuery } from "../useMediaQuery";
import "./sales-history.css";

const emptyFilters = { q: "", from: "", to: "", paymentStatus: "" };
const paymentFilters = [
  ["", "All invoices"],
  ["paid", "Paid"],
  ["partial", "Partial"],
  ["unpaid", "Unpaid"],
];
const paymentState = (sale) =>
  sale.due <= 0 ? "paid" : sale.paid > 0 ? "partial" : "unpaid";

function PaymentBadge({ sale }) {
  const state = paymentState(sale);
  return (
    <span className={`sh-status ${state}`}>
      <span aria-hidden="true" />
      {state === "paid" ? "Paid" : state === "partial" ? "Partial" : "Unpaid"}
    </span>
  );
}
function InvoiceIdentity({ sale }) {
  return (
    <div className="sh-identity">
      <Link to={`/app/sales/${sale._id}`}>{sale.number}</Link>
      <time dateTime={sale.date}>{date(sale.date)}</time>
      {sale.status && sale.status !== "completed" && (
        <span className="sh-record-status">
          {sale.status.replaceAll("-", " ")}
        </span>
      )}
    </div>
  );
}
function Customer({ sale }) {
  return (
    <div className="sh-customer">
      <strong>{sale.partyName || "Walk-in customer"}</strong>
      {sale.partyPhone && <span>{sale.partyPhone}</span>}
      {sale.partyEmail && <span>{sale.partyEmail}</span>}
    </div>
  );
}
function Item({ line }) {
  return (
    <div className="sh-item">
      <span>{[line.name, line.model].filter(Boolean).join(" / ")}</span>
      {line.warrantyExpiryDate && (
        <small>
          <ShieldCheck size={12} aria-hidden="true" />
          Warranty:{" "}
          {new Date(line.warrantyExpiryDate).toLocaleDateString("en-IN")}
        </small>
      )}
    </div>
  );
}
function Items({ sale }) {
  const lines = sale.lines || [];
  return (
    <div className="sh-items">
      {lines.length ? <Item line={lines[0]} /> : <span>—</span>}
      {lines.length > 1 && (
        <details className="sh-more-items">
          <summary>
            View {lines.length - 1} more {lines.length === 2 ? "item" : "items"}
          </summary>
          <ul>
            {lines.slice(1).map((line, index) => (
              <li key={line._id || index}>
                <Item line={line} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
function Actions({ sale }) {
  return (
    <div className="sh-actions">
      <Link
        className="sh-view"
        to={`/app/sales/${sale._id}`}
        aria-label={`View invoice ${sale.number}`}
        title="View invoice"
      >
        <ArrowUpRight size={17} />
        <span>View invoice</span>
      </Link>
      <Link
        to={`/app/sales/${sale._id}?print=1`}
        aria-label={`Print invoice ${sale.number}`}
        title="Print invoice"
      >
        <Printer size={16} />
        <span>Print</span>
      </Link>
    </div>
  );
}

export function SalesHistory({
  data,
  loading,
  error,
  onRetry,
  filters,
  onFiltersChange,
  page,
  onPageChange,
  exporting,
  onExport,
}) {
  const cards = useMediaQuery("(max-width: 1100px)");
  const rows = data?.data || [];
  const filtered = Object.values(filters).some(Boolean);
  const update = (key, value) => onFiltersChange({ ...filters, [key]: value });
  const totals = rows.reduce(
    (sum, sale) => ({
      total: sum.total + Number(sale.total || 0),
      paid: sum.paid + Number(sale.paid || 0),
      due: sum.due + Number(sale.due || 0),
    }),
    { total: 0, paid: 0, due: 0 },
  );
  const summary = [
    {
      label: "Matching invoices",
      value: data?.total || 0,
      note: `${rows.length} on this page`,
      Icon: ReceiptText,
      tone: "neutral",
    },
    {
      label: "Invoice value",
      value: money(totals.total),
      note: "Current page",
      Icon: Banknote,
      tone: "neutral",
    },
    {
      label: "Collected",
      value: money(totals.paid),
      note: "Current page",
      Icon: CheckCheck,
      tone: "collected",
    },
    {
      label: "Pending balance",
      value: money(totals.due),
      note: "Current page",
      Icon: Clock3,
      tone: "pending",
    },
  ];
  const exportReport = (event, pending) => {
    event.currentTarget.closest("details").open = false;
    onExport(pending);
  };
  return (
    <div className="sales-history">
      <Heading
        title="Sales invoices"
        description="Your sales, collections and pending payments. All in one place."
      >
        <details
          className="sh-export"
          onKeyDown={(event) => {
            if (event.key === "Escape") event.currentTarget.open = false;
          }}
        >
          <summary
            aria-disabled={exporting}
            onClick={(event) => exporting && event.preventDefault()}
          >
            <Download size={16} aria-hidden="true" />
            {exporting ? "Exporting…" : "Export reports"}
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="sh-export-menu">
            <button
              type="button"
              disabled={exporting}
              onClick={(event) => exportReport(event, false)}
            >
              <ArrowDownToLine size={16} />
              Download sales report CSV
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={(event) => exportReport(event, true)}
            >
              <Clock3 size={16} />
              Download pending payments CSV
            </button>
            <p>Reports use your current filters.</p>
          </div>
        </details>
        <Link className="m-button sh-new-sale" to="/app/pos">
          <Plus size={17} />
          New sale
        </Link>
      </Heading>

      <section className="sh-summary" aria-label="Invoice summary">
        {summary.map(({ label, value, note, Icon, tone }) => (
          <div className={`sh-stat ${tone}`} key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} aria-hidden="true" />
            </div>
            <strong
              className={
                String(value).length > 12 ? "sh-long-amount" : undefined
              }
            >
              {data ? value : "—"}
            </strong>
            <small>{note}</small>
          </div>
        ))}
      </section>

      <section
        className="sh-ledger"
        aria-labelledby="sh-invoices-heading"
        aria-busy={loading}
      >
        <div className="sh-ledger-heading">
          <div>
            <h2 id="sh-invoices-heading">Invoice history</h2>
            <span className="sh-count">{data?.total || 0}</span>
          </div>
          <button
            type="button"
            className="sh-refresh"
            onClick={onRetry}
            disabled={loading}
            aria-label="Refresh invoices"
          >
            <RefreshCw size={15} className={loading ? "m-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
        <div
          className="sh-payment-filters"
          role="group"
          aria-label="Filter by payment status"
        >
          {paymentFilters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filters.paymentStatus === value}
              onClick={() => update("paymentStatus", value)}
            >
              {value && (
                <span className={`sh-filter-dot ${value}`} aria-hidden="true" />
              )}
              {label}
            </button>
          ))}
        </div>
        <div className="sh-filters">
          <label className="sh-search-field" htmlFor="sh-search">
            <span>Search invoices</span>
            <div>
              <Search size={17} aria-hidden="true" />
              <input
                id="sh-search"
                type="search"
                placeholder="Invoice number, customer, phone…"
                value={filters.q}
                onChange={(event) => update("q", event.target.value)}
              />
              {filters.q && (
                <button
                  type="button"
                  onClick={() => update("q", "")}
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </label>
          <label htmlFor="sh-from">
            <span>From date</span>
            <input
              id="sh-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => update("from", event.target.value)}
            />
          </label>
          <label htmlFor="sh-to">
            <span>To date</span>
            <input
              id="sh-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => update("to", event.target.value)}
            />
          </label>
        </div>
        <div className="sh-results" aria-live="polite">
          <span>
            {loading
              ? "Updating invoices…"
              : `Showing ${rows.length} of ${data?.total || 0} invoices`}
            {filtered && !loading ? " · Filtered results" : ""}
          </span>
          {filtered && (
            <button type="button" onClick={() => onFiltersChange(emptyFilters)}>
              <X size={13} />
              Clear filters
            </button>
          )}
        </div>

        {error || (loading && !data) ? (
          <State error={error} loading={loading && !data} retry={onRetry} />
        ) : rows.length === 0 ? (
          <div className="sh-empty">
            <span className="sh-empty-icon">
              {filtered ? <SearchX size={28} /> : <ReceiptText size={28} />}
            </span>
            <h3>
              {filtered
                ? "No matching invoices"
                : "Your sales story starts here"}
            </h3>
            <p>
              {filtered
                ? "Try another invoice number, customer or date range."
                : "Create your first sale to start tracking invoices and payments."}
            </p>
            {filtered ? (
              <button
                className="sh-empty-reset"
                type="button"
                onClick={() => onFiltersChange(emptyFilters)}
              >
                Clear all filters
              </button>
            ) : (
              <Link className="m-button" to="/app/pos">
                <Plus size={16} />
                Create a sale
              </Link>
            )}
          </div>
        ) : cards ? (
          <div className="sh-cards" aria-label="Sales invoices">
            {rows.map((sale) => (
              <article
                className="sh-invoice-card"
                key={sale._id}
                aria-label={`Invoice ${sale.number}`}
              >
                <div className="sh-card-top">
                  <InvoiceIdentity sale={sale} />
                  <PaymentBadge sale={sale} />
                </div>
                <Customer sale={sale} />
                <div className="sh-card-items">
                  <Items sale={sale} />
                </div>
                <dl
                  className={`sh-card-amounts ${[sale.total, sale.paid, sale.due].some((value) => money(value).length > 12) ? "sh-large-amounts" : ""}`}
                >
                  <div>
                    <dt>Invoice total</dt>
                    <dd>{money(sale.total)}</dd>
                  </div>
                  <div>
                    <dt>Paid</dt>
                    <dd>{money(sale.paid)}</dd>
                  </div>
                  <div className={sale.due > 0 ? "sh-due" : ""}>
                    <dt>Pending</dt>
                    <dd>{money(sale.due)}</dd>
                  </div>
                </dl>
                <div className="sh-card-footer">
                  <small>Discount {money(sale.discount)}</small>
                  <Actions sale={sale} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="sh-table-wrap">
            <table className="sh-invoice-table" aria-label="Sales invoices">
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "19%" }} />
                <col style={{ width: "23%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  {[
                    "Invoice / date",
                    "Customer",
                    "Items / warranty",
                    "Invoice total",
                    "Payment",
                    "Actions",
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((sale) => (
                  <tr key={sale._id}>
                    <td>
                      <InvoiceIdentity sale={sale} />
                    </td>
                    <td>
                      <Customer sale={sale} />
                    </td>
                    <td>
                      <Items sale={sale} />
                    </td>
                    <td className="sh-table-amount">
                      <strong>{money(sale.total)}</strong>
                      <small>Discount {money(sale.discount)}</small>
                    </td>
                    <td>
                      <div className="sh-payment">
                        <PaymentBadge sale={sale} />
                        <span>
                          Paid <strong>{money(sale.paid)}</strong>
                        </span>
                        <span className={sale.due > 0 ? "sh-due" : ""}>
                          Pending <strong>{money(sale.due)}</strong>
                        </span>
                      </div>
                    </td>
                    <td>
                      <Actions sale={sale} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav className="sh-pagination" aria-label="Invoice pagination">
          <p>
            Page <strong>{page}</strong> of <strong>{data?.pages || 1}</strong>
          </p>
          <div>
            <button
              type="button"
              aria-label="Previous page"
              disabled={loading || page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft size={16} />
              <span>Previous</span>
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={loading || page >= (data?.pages || 1)}
              onClick={() => onPageChange(page + 1)}
            >
              <span>Next</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </nav>
      </section>
    </div>
  );
}
