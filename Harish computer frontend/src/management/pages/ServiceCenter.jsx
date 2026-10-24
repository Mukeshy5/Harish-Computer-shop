import { useRef, useState } from "react";
import {
  Download,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Eye,
  Printer,
} from "lucide-react";
import toast from "react-hot-toast";
import { ServiceReceipt } from "../print/ServiceReceipt";
import { api, date, errorMessage, money, useCommand, useData } from "../api";
import {
  Badge,
  Button,
  Field,
  Heading,
  Pagination,
  SearchBox,
  Select,
  State,
  Table,
} from "../ui";

const emptyForm = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  customerAddress: "",
  product: "",
  model: "",
  serviceType: "Receive Shop",
  problem: "",
  solution: "",
  totalAmount: "",
  paidAmount: "0",
  status: "open",
};
const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const displayMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const phoneForWhatsApp = (value) => {
  const phone = String(value || "").replace(/\D/g, "");
  return phone.length === 10 ? `91${phone}` : phone;
};
const whatsappUrl = (record) => {
  const details = [
    `Harish Computer Shop — Service Bill ${record.number}`,
    `Customer: ${record.customerName}`,
    `Phone: ${record.customerPhone}`,
    `Product: ${record.product}`,
    `Model: ${record.model || "—"}`,
    `Service type: ${record.serviceType}`,
    `Problem: ${record.problem}`,
    ...(record.serviceType === "Receive Customer" && record.solution
      ? [`Solution: ${record.solution}`]
      : []),
    `Total amount: ${displayMoney(record.totalAmount)}`,
    `Paid amount: ${displayMoney(record.paidAmount)}`,
    `Pending amount: ${displayMoney(record.pendingAmount)}`,
    "Download the attached bill from the Service Center page.",
  ];
  const phone = phoneForWhatsApp(record.customerPhone);
  return phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(details.join("\n"))}`
    : "";
};

export function ServiceCenter() {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [thermal, setThermal] = useState(false);
  const [emailBusy, setEmailBusy] = useState("");
  const emailKeys = useRef(new Map());
  const list = useData("/service-center", { q: search, page, limit: 20 });
  const { execute, busy } = useCommand();
  const total = Number(form.totalAmount);
  const paid = Number(form.paidAmount);
  const validAmounts =
    Number.isFinite(total) &&
    total >= 0 &&
    Number.isFinite(paid) &&
    paid >= 0 &&
    paid <= total;
  const pending = validAmounts ? roundMoney(total - paid) : 0;
  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };
  const reset = () => {
    setForm(emptyForm);
    setEditingId("");
  };
  const edit = (record) => {
    setSelected(record);
    setEditingId(record._id);
    setForm({
      ...emptyForm,
      customerName: record.customerName || "",
      customerEmail: record.customerEmail || "",
      customerPhone: record.customerPhone || "",
      customerAddress: record.customerAddress || "",
      product: record.product || "",
      model: record.model || "",
      serviceType: record.serviceType,
      problem: record.problem || "",
      solution:
        record.serviceType === "Receive Customer" ? record.solution || "" : "",
      totalAmount: String(record.totalAmount),
      paidAmount: String(record.paidAmount),
      status: record.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async (event) => {
    event.preventDefault();
    if (!validAmounts) {
      toast.error("Paid amount must be between zero and total amount.");
      return;
    }
    const body = {
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim(),
      customerPhone: form.customerPhone.trim(),
      customerAddress: form.customerAddress.trim(),
      product: form.product.trim(),
      model: form.model.trim(),
      serviceType: form.serviceType,
      problem: form.problem.trim(),
      totalAmount: roundMoney(total),
      paidAmount: roundMoney(paid),
      status: form.status,
    };
    if (form.serviceType === "Receive Customer")
      body.solution = form.solution.trim();
    const result = await execute(
      editingId ? "patch" : "post",
      editingId ? `/service-center/${editingId}` : "/service-center",
      body,
      editingId
        ? "Service bill updated successfully."
        : "Service bill saved successfully.",
    );
    if (result) {
      setSelected(result);
      reset();
      list.reload();
    }
  };
  const downloadBill = async (record) => {
    try {
      const response = await api.get(`/service-center/${record._id}/bill`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${record.number.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const emailBill = async (record) => {
    setEmailBusy(record._id);
    const requestKey = emailKeys.current.get(record._id) || crypto.randomUUID();
    emailKeys.current.set(record._id, requestKey);
    try {
      await api.post(
        `/service-center/${record._id}/send-email`,
        {},
        { headers: { "Idempotency-Key": requestKey } },
      );
      emailKeys.current.delete(record._id);
      toast.success("Service bill emailed successfully.");
      if (selected?._id === record._id) {
        const updated = await api.get(`/service-center/${record._id}`);
        setSelected(updated.data);
      }
      list.reload();
    } catch (error) {
      if ([502, 503].includes(error.response?.status))
        emailKeys.current.delete(record._id);
      toast.error(errorMessage(error));
      list.reload();
    } finally {
      setEmailBusy("");
    }
  };

  return (
    <>
      <div className="m-no-print">
        <Heading
          title="Service Center"
          description="Register repairs, manage service bills, and share customer updates."
        />
        <form className="m-card m-form-page sc-form" onSubmit={save}>
          <div className="sc-form-heading">
            <div>
              <h2>
                {editingId ? "Update service bill" : "Create service bill"}
              </h2>
              <p>
                {editingId
                  ? `Editing ${selected?.number || "service record"}`
                  : "Add customer, product, service, and payment details."}
              </p>
            </div>
            {editingId && (
              <Button type="button" variant="secondary" onClick={reset}>
                <RotateCcw size={15} /> Cancel edit
              </Button>
            )}
          </div>
          <h3 className="sc-section-title">Customer details</h3>
          <div className="m-form-grid">
            <Field
              label="Customer name"
              value={form.customerName}
              onChange={set("customerName")}
              maxLength={200}
              required
            />
            <Field
              label="Customer email"
              type="email"
              value={form.customerEmail}
              onChange={set("customerEmail")}
              maxLength={254}
              required
            />
            <Field
              label="Customer phone"
              type="tel"
              value={form.customerPhone}
              onChange={set("customerPhone")}
              maxLength={26}
              pattern="\\+?[\\d ()-]{7,25}"
              required
            />
            <Field
              label="Customer address"
              type="textarea"
              value={form.customerAddress}
              onChange={set("customerAddress")}
              maxLength={1000}
            />
          </div>
          <h3 className="sc-section-title">Product and service</h3>
          <div className="m-form-grid">
            <Field
              label="Product"
              value={form.product}
              onChange={set("product")}
              maxLength={200}
              required
            />
            <Field
              label="Model"
              value={form.model}
              onChange={set("model")}
              maxLength={200}
            />
            <Select
              label="Service type"
              value={form.serviceType}
              onChange={(event) => {
                const serviceType = event.target.value;
                setForm((current) => ({
                  ...current,
                  serviceType,
                  solution:
                    serviceType === "Receive Customer" ? current.solution : "",
                }));
              }}
              options={[
                { value: "Receive Shop", label: "Receive Shop" },
                { value: "Receive Customer", label: "Receive Customer" },
              ]}
              required
            />
            <Select
              label="Service status"
              value={form.status}
              onChange={set("status")}
              options={[
                { value: "open", label: "Open" },
                { value: "completed", label: "Completed" },
              ]}
              required
            />
            <Field
              label="Enter problem"
              type="textarea"
              value={form.problem}
              onChange={set("problem")}
              maxLength={2000}
              required
            />
            {form.serviceType === "Receive Customer" && (
              <Field
                label="Enter solution"
                type="textarea"
                value={form.solution}
                onChange={set("solution")}
                maxLength={2000}
                required
              />
            )}
          </div>
          <h3 className="sc-section-title">Payment details</h3>
          <div className="m-form-grid">
            <Field
              label="Total amount (₹)"
              type="number"
              value={form.totalAmount}
              onChange={set("totalAmount")}
              min="0"
              max="1000000000"
              step=".01"
              required
            />
            <Field
              label="Paid amount (₹)"
              type="number"
              value={form.paidAmount}
              onChange={set("paidAmount")}
              min="0"
              max={validAmounts ? total : "1000000000"}
              step=".01"
              required
            />
            <label className="m-field">
              <span>Pending amount (auto)</span>
              <output className="sc-pending" aria-live="polite">
                {displayMoney(pending)}
              </output>
            </label>
          </div>
          {!validAmounts && (
            <p className="m-error" role="alert">
              Amounts must be valid and non-negative; paid amount cannot exceed
              total.
            </p>
          )}
          <div className="m-form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={reset}
              disabled={busy}
            >
              Reset form
            </Button>
            <Button type="submit" busy={busy} disabled={busy || !validAmounts}>
              <Plus size={16} />{" "}
              {editingId ? "Update service bill" : "Save service bill"}
            </Button>
          </div>
        </form>

        {selected && (
          <section className="m-card sc-confirmation" role="status">
            <div>
              <Badge tone={selected.status === "completed" ? "green" : "amber"}>
                {selected.status}
              </Badge>
              <strong>Service bill {selected.number}</strong>
              <span>
                {selected.customerName} · {displayMoney(selected.pendingAmount)}{" "}
                pending
              </span>
              <span>
                {selected.product}
                {selected.model ? ` / ${selected.model}` : ""} ·{" "}
                {selected.serviceType}
              </span>
              <span>Problem: {selected.problem}</span>
              {selected.serviceType === "Receive Customer" &&
                selected.solution && <span>Solution: {selected.solution}</span>}
            </div>
            <div className="sc-confirmation-actions">
              <select
                aria-label="Service receipt format"
                value={thermal ? "thermal" : "a4"}
                onChange={(event) =>
                  setThermal(event.target.value === "thermal")
                }
              >
                <option value="a4">A4 receipt</option>
                <option value="thermal">80mm receipt</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.print()}
              >
                <Printer size={15} /> Print service receipt
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => downloadBill(selected)}
              >
                <Download size={15} /> Download PDF
              </Button>
              <Button
                type="button"
                variant="secondary"
                busy={emailBusy === selected._id}
                disabled={emailBusy === selected._id}
                onClick={() => emailBill(selected)}
              >
                <Mail size={15} /> Send via Gmail
              </Button>
              {whatsappUrl(selected) && (
                <a
                  className="m-button secondary"
                  href={whatsappUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={15} /> WhatsApp
                </a>
              )}
            </div>
          </section>
        )}

        <section className="m-card sc-records">
          <div className="sc-records-heading">
            <div>
              <h2>Service records</h2>
              <p>Search and update saved customer service bills.</p>
            </div>
            <SearchBox
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search service, customer, phone, or product"
            />
          </div>
          <State
            loading={list.loading && !list.data}
            error={list.error}
            retry={list.reload}
            empty={list.data && !list.data.data.length}
          />
          {list.data?.data.length > 0 && (
            <Table
              rows={list.data.data}
              columns={[
                {
                  key: "number",
                  label: "BILL NUMBER",
                  render: (record) => <strong>{record.number}</strong>,
                },
                {
                  key: "createdAt",
                  label: "DATE",
                  render: (record) => date(record.createdAt),
                },
                {
                  key: "customerName",
                  label: "CUSTOMER",
                  render: (record) => (
                    <>
                      <strong>{record.customerName}</strong>
                      <small>{record.customerPhone}</small>
                    </>
                  ),
                },
                {
                  key: "product",
                  label: "PRODUCT / MODEL",
                  render: (record) =>
                    `${record.product}${record.model ? ` / ${record.model}` : ""}`,
                },
                { key: "serviceType", label: "SERVICE TYPE" },
                {
                  key: "totalAmount",
                  label: "TOTAL",
                  render: (record) => money(record.totalAmount),
                },
                {
                  key: "paidAmount",
                  label: "PAID",
                  render: (record) => money(record.paidAmount),
                },
                {
                  key: "pendingAmount",
                  label: "PENDING",
                  render: (record) => money(record.pendingAmount),
                },
                {
                  key: "status",
                  label: "STATUS",
                  render: (record) => (
                    <Badge
                      tone={record.status === "completed" ? "green" : "amber"}
                    >
                      {record.status}
                    </Badge>
                  ),
                },
                {
                  key: "actions",
                  label: "ACTIONS",
                  render: (record) => (
                    <div className="sc-row-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setSelected(record)}
                        aria-label={`View ${record.number}`}
                      >
                        <Eye size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => edit(record)}
                        aria-label={`Edit ${record.number}`}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => downloadBill(record)}
                        aria-label={`Download ${record.number} PDF`}
                      >
                        <Download size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        busy={emailBusy === record._id}
                        disabled={emailBusy === record._id}
                        onClick={() => emailBill(record)}
                        aria-label={`Email ${record.number}`}
                      >
                        <Mail size={14} />
                      </Button>
                      {whatsappUrl(record) && (
                        <a
                          className="m-icon-button sc-whatsapp"
                          href={whatsappUrl(record)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp ${record.number}`}
                        >
                          <MessageCircle size={14} />
                        </a>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
          <Pagination data={list.data} page={page} setPage={setPage} />
        </section>
      </div>
      {selected && <ServiceReceipt record={selected} thermal={thermal} />}
    </>
  );
}
