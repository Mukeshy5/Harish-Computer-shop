import { useState } from "react";
import {
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api, date, money, useCommand, useData } from "../api";
import {
  Badge,
  Button,
  Field,
  Heading,
  Modal,
  Pagination,
  SearchBox,
  State,
} from "../ui";
import { useMediaQuery } from "../useMediaQuery";
import "./bill-clear.css";

const statuses = {
  pending: {
    label: "Pending Deletion",
    tone: "amber",
    icon: Clock3,
    caption: "Less than five full days old",
  },
  eligible: {
    label: "Eligible for Deletion",
    tone: "green",
    icon: CheckCircle2,
    caption: "Five full days completed",
  },
  deleted: {
    label: "Deleted",
    tone: "gray",
    icon: Archive,
    caption: "Removed from normal bill history",
  },
};
const kindNames = {
  sale: "Sales",
  purchase: "Purchase",
  service: "Service Center",
};

function Status({ bill }) {
  return (
    <Badge tone={statuses[bill.status].tone}>
      {statuses[bill.status].label}
    </Badge>
  );
}
function BillAction({ bill, enabled, busy, select }) {
  if (bill.status === "deleted")
    return (
      <a
        className="m-button secondary"
        href={api.getUri({
          url: `/bill-clear/${bill.kind}/${bill._id}/backup`,
        })}
      >
        <Download size={15} /> Backup
      </a>
    );
  return (
    <Button
      variant="danger"
      disabled={!enabled || bill.status !== "eligible" || busy}
      title={
        bill.status === "pending"
          ? "Available after five full days from creation"
          : !enabled
            ? "Deletion is paused until backup verification"
            : undefined
      }
      aria-label={`Delete bill ${bill.number}`}
      onClick={() => select(bill)}
    >
      <Trash2 size={15} /> Delete
    </Button>
  );
}

export function BillClear() {
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const list = useData(
    "/bill-clear",
    { status, kind, q, page, limit: 20 },
    true,
  );
  const { execute, busy } = useCommand();
  const cards = useMediaQuery("(max-width: 1000px)");
  const automation = list.data?.automation;
  const rows = list.data?.data || [];
  const change = (set, value) => {
    set(value);
    setPage(1);
  };
  const select = (bill) => {
    setSelected(bill);
    setConfirmed(false);
  };
  const close = () => {
    if (!busy) setSelected(null);
  };
  const remove = async () => {
    if (!confirmed || !selected) return;
    const result = await execute(
      "delete",
      `/bill-clear/${selected.kind}/${selected._id}`,
      { confirmNumber: selected.number },
      "Bill deleted. Its backup and accounting records are retained.",
    );
    if (result) {
      setSelected(null);
      setConfirmed(false);
    }
  };
  return (
    <div className="bc-page">
      <Heading
        title="Bill Clear"
        description="Manage older bills with a five-day safety window and recoverable deletion."
      >
        <Button
          variant="secondary"
          onClick={list.reload}
          disabled={list.loading}
        >
          <RefreshCw size={16} /> Refresh
        </Button>
      </Heading>
      <section className="bc-summary" aria-label="Bill deletion summary">
        {Object.entries(statuses).map(([key, item]) => (
          <button
            type="button"
            className={`bc-stat ${key} ${status === key ? "selected" : ""}`}
            key={key}
            aria-pressed={status === key}
            onClick={() => change(setStatus, status === key ? "" : key)}
          >
            <span className="bc-stat-icon">
              <item.icon size={21} />
            </span>
            <span>
              <span className="bc-stat-label">{item.label}</span>
              <strong>{list.data?.summary?.[key] ?? "—"}</strong>
              <small>{item.caption}</small>
            </span>
          </button>
        ))}
      </section>
      {automation && (
        <section
          className={`m-card bc-policy ${automation.enabled ? "active" : "paused"}`}
          aria-label="Automatic deletion status"
        >
          <ShieldCheck size={22} />
          <div>
            <h2>
              Automatic deletion {automation.enabled ? "active" : "paused"}
            </h2>
            <p>
              {automation.enabled
                ? "Bills become eligible exactly 120 hours after creation. The server checks every minute and catches up after a restart."
                : automation.reason}
            </p>
            <p>
              Deletion removes a bill from normal history. Its recovery
              snapshot, stock ledger, payments and financial totals are
              retained.
            </p>
            {automation.lastCompletedAt && (
              <small>
                Last scan: {date(automation.lastCompletedAt)} ·{" "}
                {automation.deletedCount} deleted · {automation.failedCount}{" "}
                failed
              </small>
            )}
            {automation.backupVerifiedAt && (
              <small>
                Database backup verified: {date(automation.backupVerifiedAt)}
              </small>
            )}
            {automation.lastError && (
              <p role="alert" className="m-error-text">
                {automation.lastError}
              </p>
            )}
          </div>
        </section>
      )}
      <section className="m-card bc-records" aria-label="Bill records">
        <div className="bc-records-head">
          <div>
            <h2>All bills</h2>
            <p>
              Sales, purchases and Service Center bills. Age uses the original
              creation time.
            </p>
          </div>
          {list.loading && list.data && <small role="status">Updating…</small>}
        </div>
        <div className="bc-filters">
          <SearchBox
            value={q}
            onChange={(value) => change(setQ, value)}
            placeholder="Search bill number or customer…"
          />
          <Field label="Deletion status">
            <select
              aria-label="Deletion status"
              value={status}
              onChange={(event) => change(setStatus, event.target.value)}
            >
              <option value="">All statuses</option>
              {Object.entries(statuses).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bill type">
            <select
              aria-label="Bill type"
              value={kind}
              onChange={(event) => change(setKind, event.target.value)}
            >
              <option value="">All bill types</option>
              {Object.entries(kindNames).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {list.error && <State error={list.error} retry={list.reload} />}
        {!list.data ? (
          list.error ? null : <State loading={list.loading} />
        ) : rows.length === 0 ? (
          <div className="bc-empty">
            <Archive size={32} />
            <h3>No matching bills</h3>
            <p>Try another status, bill type or search.</p>
          </div>
        ) : cards ? (
          <div className="bc-cards">
            {rows.map((bill) => (
              <article
                className="bc-bill-card"
                key={bill.key}
                aria-label={`Bill ${bill.number}`}
              >
                <div className="bc-bill-card-head">
                  <div>
                    <strong>{bill.number}</strong>
                    <small>{kindNames[bill.kind]}</small>
                  </div>
                  <Status bill={bill} />
                </div>
                <h3>{bill.customerName}</h3>
                <dl>
                  <div>
                    <dt>Bill date</dt>
                    <dd>{date(bill.billDate)}</dd>
                  </div>
                  <div>
                    <dt>Total amount</dt>
                    <dd>{money(bill.total)}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{date(bill.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Bill age</dt>
                    <dd>
                      {bill.ageDays == null
                        ? "Unknown"
                        : `${bill.ageDays} days`}
                    </dd>
                  </div>
                </dl>
                <div className="bc-card-bottom">
                  <small>
                    {bill.status === "deleted"
                      ? `Deleted ${date(bill.deletedAt)}`
                      : bill.eligibleAt
                        ? `Eligible ${date(bill.eligibleAt)}`
                        : "Creation timestamp unavailable"}
                  </small>
                  <BillAction
                    bill={bill}
                    enabled={automation?.enabled}
                    busy={busy}
                    select={select}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="m-table-wrap">
            <table className="m-table bc-table">
              <thead>
                <tr>
                  <th>Bill number</th>
                  <th>Customer / supplier</th>
                  <th>Bill date</th>
                  <th>Total amount</th>
                  <th>Bill age</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((bill) => (
                  <tr key={bill.key}>
                    <td>
                      <strong>{bill.number}</strong>
                      <small>{kindNames[bill.kind]}</small>
                    </td>
                    <td>{bill.customerName}</td>
                    <td>
                      {date(bill.billDate)}
                      <small>Created: {date(bill.createdAt)}</small>
                    </td>
                    <td className="bc-amount">{money(bill.total)}</td>
                    <td>
                      {bill.ageDays == null
                        ? "Unknown"
                        : `${bill.ageDays} days`}
                      <small>
                        {bill.status === "deleted"
                          ? `Deleted: ${date(bill.deletedAt)}`
                          : bill.eligibleAt
                            ? `Eligible: ${date(bill.eligibleAt)}`
                            : "Creation timestamp unavailable"}
                      </small>
                    </td>
                    <td>
                      <Status bill={bill} />
                    </td>
                    <td>
                      <BillAction
                        bill={bill}
                        enabled={automation?.enabled}
                        busy={busy}
                        select={select}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && (
          <Pagination data={list.data} page={page} setPage={setPage} />
        )}
      </section>
      {selected && (
        <Modal title={`Delete bill ${selected.number}?`} onClose={close}>
          <div className="bc-confirm">
            <p>
              This removes only the selected bill from normal bill history. A
              recovery snapshot and all accounting records are retained.
            </p>
            <dl>
              <div>
                <dt>Bill</dt>
                <dd>
                  {selected.number} · {kindNames[selected.kind]}
                </dd>
              </div>
              <div>
                <dt>Customer / supplier</dt>
                <dd>{selected.customerName}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money(selected.total)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{date(selected.createdAt)}</dd>
              </div>
            </dl>
            <Field
              type="checkbox"
              label="I confirm deletion of this selected bill."
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <div className="m-form-actions">
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
                busy={busy}
                disabled={!confirmed || busy}
                onClick={remove}
              >
                Delete selected bill
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
