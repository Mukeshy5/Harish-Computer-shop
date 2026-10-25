import { useEffect, useRef } from "react";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
export function Button({ children, variant = "", busy, ...props }) {
  return (
    <button
      className={`m-button ${variant}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && <LoaderCircle size={16} className="m-spin" />}
      {children}
    </button>
  );
}
export function Field({ label, error, children, ...props }) {
  return (
    <label className={`m-field ${props.type === "checkbox" ? "m-check" : ""}`}>
      <span>
        {label}
        {props.required && " *"}
      </span>
      {children ||
        (props.type === "textarea" ? (
          <textarea {...props} />
        ) : (
          <input {...props} />
        ))}
      {error && <small className="m-error-text">{error}</small>}
    </label>
  );
}
export function Select({ label, options = [], error, ...props }) {
  return (
    <Field label={label} required={props.required} error={error}>
      <select {...props}>
        <option value="">Select {label?.toLowerCase()}</option>
        {options.map((o) => (
          <option
            value={o._id ?? o.value}
            key={o._id ?? o.value}
            disabled={o.disabled}
          >
            {o.name ?? o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const all = ref.current?.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
        );
        const first = all?.[0],
          last = all?.[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="m-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        className={`m-modal ${wide ? "wide" : ""}`}
      >
        <div className="m-modal-head">
          <h3>{title}</h3>
          <button
            type="button"
            aria-label="Close dialog"
            className="m-icon-button"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function State({ loading, error, empty, retry }) {
  if (loading)
    return (
      <div className="m-state">
        <LoaderCircle className="m-spin" size={26} />
        <p>Loading your records…</p>
      </div>
    );
  if (error)
    return (
      <div className="m-state">
        <AlertCircle size={30} />
        <p>{error}</p>
        {retry && <Button onClick={retry}>Try again</Button>}
      </div>
    );
  if (empty)
    return (
      <div className="m-state">
        <PackageOpen size={36} />
        <h3>No records yet</h3>
        <p>Your saved records will appear here.</p>
      </div>
    );
  return null;
}
export function Table({ columns, rows = [], onRow, label = "Records" }) {
  return (
    <div className="m-table-wrap" role="region" aria-label={`${label}: scroll horizontally to view all columns`} tabIndex={0}>
      <table className="m-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row._id || i}
              onClick={onRow ? () => onRow(row) : undefined}
              className={onRow ? "clickable" : ""}
            >
              {columns.map((c) => (
                <td key={c.key} data-label={c.label}>
                  {c.render ? c.render(row) : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({ data, page, setPage }) {
  return (
    <div className="m-pagination">
      <span>
        {data?.total || 0} records · Page {page} of {data?.pages || 1}
      </span>
      <div>
        <button
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          aria-label="Next page"
          disabled={page >= (data?.pages || 1)}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search records…",
  inputRef,
  onKeyDown,
}) {
  return (
    <div className="m-search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        ref={inputRef}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Badge({ children, tone = "" }) {
  return <span className={`m-badge ${tone}`}>{children}</span>;
}
export function Stock({ product: p }) {
  return (
    <Badge
      tone={
        !p.active
          ? "gray"
          : p.stock === 0
            ? "red"
            : p.stock <= p.minStock
              ? "amber"
              : "green"
      }
    >
      {!p.active
        ? "Inactive"
        : p.stock === 0
          ? "Out of stock"
          : p.stock <= p.minStock
            ? "Low stock"
            : "In stock"}
    </Badge>
  );
}
export function Heading({ title, description, children }) {
  return (
    <div className="m-page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="m-heading-actions">{children}</div>
    </div>
  );
}
