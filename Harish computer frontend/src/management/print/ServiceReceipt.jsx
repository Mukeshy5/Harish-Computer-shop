import { date, money } from "../api";
import { ShopHeader } from "./ShopHeader";

export function ServiceReceipt({ record, thermal = false }) {
  if (!record) return null;
  return (
    <>
      <style media="print">
        {thermal
          ? "@page { size: 80mm 297mm; margin: 4mm; }"
          : "@page { size: A4; margin: 14mm; }"}
      </style>
      <article
        className={`m-card m-invoice sc-print-document ${thermal ? "thermal" : ""}`}
        aria-label="Service receipt preview"
      >
        <ShopHeader
          details={record.printShop}
          gstin={record.shopSnapshot?.gstin}
          logo={record.shopSnapshot?.logo}
        />
        <div className="m-invoice-top m-invoice-document-meta">
          <div>
            <span className="m-eyebrow">SERVICE RECEIPT / JOB SHEET</span>
            <h3>{record.number}</h3>
            <p>{date(record.createdAt)}</p>
          </div>
        </div>
        <dl className="m-service-print-details">
          {[
            ["Customer Name", record.customerName],
            ["Customer Email", record.customerEmail],
            ["Customer Phone", record.customerPhone],
            ["Customer Address", record.customerAddress],
            ["Product", record.product],
            ["Model", record.model],
            ["Received at Shop / Receive selection", record.serviceType],
            ["Service Status", record.status],
            ["Problem", record.problem],
            ...(record.serviceType === "Receive Customer" && record.solution
              ? [["Solution", record.solution]]
              : []),
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="m-service-print-totals">
          {[
            ["Total Amount", record.totalAmount],
            ["Paid Amount", record.paidAmount],
            ["Pending Amount", record.pendingAmount],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{money(value)}</strong>
            </div>
          ))}
        </div>
        <p className="m-service-print-signature">Authorized signature</p>
      </article>
    </>
  );
}
