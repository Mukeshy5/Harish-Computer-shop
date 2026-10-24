import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil } from "lucide-react";
import { useSession } from "../Management";
import { date, useCommand, useData } from "../api";
import {
  Badge,
  Button,
  Field,
  Heading,
  Modal,
  Pagination,
  SearchBox,
  State,
  Table,
} from "../ui";
const configs = {
  categories: {
    title: "Categories",
    description: "Keep your products organized and easy to find.",
    fields: ["name"],
    columns: ["name", "active"],
  },
  brands: {
    title: "Brands",
    description: "Manage the brands in your product catalog.",
    fields: ["name"],
    columns: ["name", "active"],
  },
  "audit-logs": {
    title: "Activity log",
    description: "An immutable history of important actions.",
    columns: ["createdAt", "action", "entity", "entityId", "user"],
  },
};
const labels = {
  name: "Name",
  createdAt: "Recorded at",
  active: "Status",
  action: "Action",
  entity: "Record",
  entityId: "Record / Reference",
  user: "User",
};
export function ResourcePage({ resource }) {
  const c = configs[resource],
    { can } = useSession();
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState(null);
  const { data, loading, error, reload } = useData(`/${resource}`, { q, page });
  const writable = !!c.fields && can("admin");
  const columns = c.columns.map((key) => ({
    key,
    label: labels[key] || key,
    render: (r) =>
      key === "active" ? (
        <Badge tone={r.active ? "green" : "gray"}>
          {r.active ? "Active" : "Inactive"}
        </Badge>
      ) : key === "createdAt" ? (
        date(r[key])
      ) : (
        r[key]
      ),
  }));
  if (writable)
    columns.push({
      key: "actions",
      label: "",
      render: (r) => (
        <div className="m-row-actions">
          {writable && (
            <button
              aria-label={`Edit ${r.name || "record"}`}
              onClick={() => setEdit(r)}
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
      ),
    });
  return (
    <>
      <Heading title={c.title} description={c.description}>
        {resource === "categories" && (
          <Link className="m-button secondary" to="/app/brands">
            Manage brands
          </Link>
        )}
        {resource === "brands" && (
          <Link className="m-button secondary" to="/app/categories">
            Manage categories
          </Link>
        )}
        {writable && (
          <Button onClick={() => setEdit({})}>
            <Plus size={16} /> Add{" "}
            {resource === "categories"
              ? "category"
              : resource.replace(/s$/, "")}
          </Button>
        )}
      </Heading>
      <section className="m-card">
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
          loading={loading && !data}
          error={error}
          retry={reload}
          empty={data && !data.data.length}
        />
        {data?.data.length > 0 && <Table rows={data.data} columns={columns} />}
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
      {edit && (
        <ResourceForm
          resource={resource}
          initial={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            reload();
          }}
        />
      )}
    </>
  );
}
function ResourceForm({ resource, initial, onClose, onSaved }) {
  const c = configs[resource];
  const [values, setValues] = useState(initial);
  const { execute, busy } = useCommand();
  const set = (f) => (e) =>
    setValues((v) => ({
      ...v,
      [f]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));
  const submit = async (e) => {
    e.preventDefault();
    const r = await execute(
      initial._id ? "patch" : "post",
      `/${resource}${initial._id ? "/" + initial._id : ""}`,
      values,
    );
    if (r) onSaved();
  };
  return (
    <Modal
      title={`${initial._id ? "Edit" : "Add"} ${resource}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="m-modal-form">
        {c.fields.map((f) => (
          <Field
            key={f}
            label={labels[f] || f}
            value={values[f] ?? ""}
            onChange={set(f)}
            required
          />
        ))}
        {initial._id && ["categories", "brands"].includes(resource) && (
          <Field
            label="Account / record active"
            type="checkbox"
            checked={values.active !== false}
            onChange={set("active")}
          />
        )}
        <div className="m-form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save record
          </Button>
        </div>
      </form>
    </Modal>
  );
}
