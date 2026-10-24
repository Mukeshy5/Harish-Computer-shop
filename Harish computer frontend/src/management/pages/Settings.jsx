import { useEffect, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { useSession } from "../Management";
import { useCommand, useData } from "../api";
import { Button, Field, Heading, State } from "../ui";
export function SettingsPage() {
  const { data, loading, error, reload } = useData("/settings");
  const [form, setForm] = useState(null);
  const { execute, busy } = useCommand();
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (!form) return <State loading={loading} error={error} retry={reload} />;
  const fields = [
    ["name", "Shop name"],
    ["phone", "Phone"],
    ["email", "Email"],
    ["address", "Address"],
    ["gstin", "GSTIN"],
    ["logo", "Logo URL"],
    ["salePrefix", "Sales invoice prefix"],
    ["purchasePrefix", "Purchase invoice prefix"],
    ["defaultTax", "Default GST (%)"],
    ["minStock", "Default stock alert quantity"],
    ["receiptFooter", "Receipt footer"],
  ];
  return (
    <>
      <Heading
        title="Shop settings"
        description="Make invoices and stock policies work for your shop."
      />
      <form
        className="m-card m-form-page"
        onSubmit={async (e) => {
          e.preventDefault();
          await execute("patch", "/settings", form);
        }}
      >
        <h3>Shop details & invoice preferences</h3>
        <div className="m-form-grid">
          {fields.map(([k, l]) => (
            <Field
              key={k}
              label={l}
              type={
                ["defaultTax", "minStock"].includes(k)
                  ? "number"
                  : k === "email"
                    ? "email"
                    : k === "logo"
                      ? "url"
                      : k === "address" || k === "receiptFooter"
                        ? "textarea"
                        : "text"
              }
              min="0"
              max={k === "defaultTax" ? 100 : undefined}
              step={k === "defaultTax" ? ".01" : 1}
              required={[
                "name",
                "salePrefix",
                "purchasePrefix",
                "defaultTax",
                "minStock",
              ].includes(k)}
              value={form[k] ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            />
          ))}
        </div>
        <Field
          label="Allow approved credit sales"
          type="checkbox"
          checked={!!form.allowCreditSales}
          onChange={(e) =>
            setForm((f) => ({ ...f, allowCreditSales: e.target.checked }))
          }
        />
        <p className="m-note">
          Credit sales also require a linked customer. Default tax and alert
          quantities apply to newly created products; existing product values
          remain configurable individually.
        </p>
        <p className="m-note">
          Next invoice sequences: sales {form.nextSale || 1} · purchases{" "}
          {form.nextPurchase || 1}. Numbers are assigned when an invoice
          commits.
        </p>
        <div className="m-form-actions">
          <Button type="submit" busy={busy}>
            <Save size={16} /> Save settings
          </Button>
        </div>
      </form>
    </>
  );
}
export function Profile() {
  const { user, setUser } = useSession(),
    { execute, busy } = useCommand();
  return (
    <>
      <Heading
        title="Your profile"
        description="Your account details and security."
      />
      <section className="m-card m-form-page">
        <div className="m-profile-summary">
          <span className="m-avatar">{user.name[0]}</span>
          <div>
            <h3>{user.name}</h3>
            <p>
              {user.email} · {user.role}
            </p>
          </div>
          <ShieldCheck size={25} />
        </div>
        <h3>Change password</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("password") !== f.get("confirm")) {
              e.currentTarget.elements.confirm.setCustomValidity(
                "Passwords must match",
              );
              e.currentTarget.elements.confirm.reportValidity();
              return;
            }
            const r = await execute(
              "post",
              "/auth/change-password",
              {
                currentPassword: f.get("currentPassword"),
                password: f.get("password"),
              },
              "Password changed. Please sign in again.",
            );
            if (r) setUser(null);
          }}
        >
          <div className="m-form-grid">
            <Field
              label="Current password"
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
            <Field
              label="New password"
              type="password"
              name="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
            <Field
              label="Confirm new password"
              type="password"
              name="confirm"
              minLength={12}
              autoComplete="new-password"
              onChange={(e) => e.target.setCustomValidity("")}
              required
            />
          </div>
          <p className="m-note">
            Use at least 12 characters with uppercase, lowercase, and a number.
            Changing your password signs out your active sessions.
          </p>
          <div className="m-form-actions">
            <Button type="submit" busy={busy}>
              Update password
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
