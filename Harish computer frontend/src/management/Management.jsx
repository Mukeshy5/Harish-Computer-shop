import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ReceiptText,
  Wrench,
  Warehouse,
  TriangleAlert,
  Settings,
  Tags,
  History,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
  Search,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Store,
} from "lucide-react";
import { api, errorMessage, useData } from "./api";
import { Button, Field, Heading, State } from "./ui";
import { Dashboard } from "./pages/Dashboard";
import { ProductForm, Products } from "./pages/Products";
import { Billing, Invoice, InvoiceList } from "./pages/Billing";
import { ServiceCenter } from "./pages/ServiceCenter";
import { ResourcePage } from "./pages/Resources";
import { Inventory, Adjustment, StockCount } from "./pages/Inventory";
import { SettingsPage, Profile } from "./pages/Settings";
import "./management.css";
import DeveloperCredit from "../components/DeveloperCredit";
import { useMediaQuery } from "./useMediaQuery";
const Session = createContext(null);
export const useSession = () => useContext(Session);
const nav = [
  ["WORKSPACE", [["Overview", "", LayoutDashboard]]],
  [
    "SELL",
    [
      ["Sell", "pos", ShoppingCart],
      ["Sales history", "sales", ReceiptText],
    ],
  ],
  [
    "SERVICE",
    [["Service Center", "service-center", Wrench]],
  ],
  [
    "INVENTORY",
    [
      ["Products", "products", Package],
      ["Stock & inventory", "inventory", Warehouse],
      ["Stock adjustments", "adjustments", SlidersHorizontal, "admin"],
      ["Stock alerts", "alerts", TriangleAlert],
      ["Categories & brands", "categories", Tags, "admin"],
    ],
  ],
  ["MANAGEMENT", [["Activity log", "audit-logs", History, "admin"]]],
];
export function Management() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener("hcs:session-expired", expire);
    api
      .get("/auth/me")
      .then((r) => setUser(r.data.user?.role === "admin" ? r.data.user : null))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => window.removeEventListener("hcs:session-expired", expire);
  }, []);
  const can = () => user?.role === "admin";
  const session = { user, setUser, can };
  return (
    <Session.Provider value={session}>
      <div className="management">
        <Toaster position="top-right" toastOptions={{ duration: 4500 }} />
        {loading ? (
          <State loading />
        ) : (
          <Routes>
            <Route
              path="login"
              element={user ? <Navigate to="/app" replace /> : <Login />}
            />
            <Route
              path="*"
              element={user ? <Shell /> : <Navigate to="/app/login" replace />}
            />
          </Routes>
        )}
      </div>
    </Session.Provider>
  );
}
function Login() {
  const { setUser } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [creatingAdmin, setCreatingAdmin] = useState(false);
  const setup = useData("/auth/setup-status", {}, true);
  const navigate = useNavigate();
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    if (creatingAdmin && form.get("password") !== form.get("confirmPassword")) {
      setError(
        "Passwords do not match. Please enter the same password in both fields.",
      );
      return;
    }
    setBusy(true);
    try {
      const r = await api.post(creatingAdmin ? "/auth/setup" : "/auth/login", {
        email: form.get("email"),
        password: form.get("password"),
        ...(creatingAdmin ? { name: form.get("name") } : {}),
      });
      if (r.data.user?.role !== "admin") {
        setError("Administrator access is required.");
        return;
      }
      setUser(r.data.user);
      navigate("/app");
    } catch (err) {
      setError(errorMessage(err));
      if (creatingAdmin && err.response?.status === 409) {
        setCreatingAdmin(false);
        setup.reload();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="m-login">
      <section className="m-login-story">
        <Brand />
        <div>
          <span className="m-eyebrow">YOUR SHOP. ALL IN SYNC.</span>
          <h1>
            Less paperwork.
            <br />
            More possibilities.
          </h1>
          <p>
            A clearer view of every sale, every product, and every opportunity
            to grow.
          </p>
          <div className="m-login-feature">
            <ShieldCheck />
            <span>
              Secure billing, connected inventory,
              <br />
              and a complete history of your business.
            </span>
          </div>
        </div>
        <small>Built for the way your shop works.</small>
      </section>
      <section className="m-login-form">
        <a className="m-back-store" href="/">
          <Store size={16} /> Visit shop website <ArrowUpRight size={15} />
        </a>
        <div className="m-login-box">
          <span className="m-login-icon">
            <LockKeyhole size={24} />
          </span>
          <h2>{creatingAdmin ? "Create your admin account" : "Admin login"}</h2>
          <p>
            {creatingAdmin
              ? "Set up your shop workspace with your own login details."
              : "Sign in to your administrator workspace."}
          </p>
          <form onSubmit={submit}>
            {creatingAdmin && (
              <Field
                label="Your name"
                name="name"
                autoComplete="name"
                placeholder="Enter your full name"
                required
                maxLength={200}
              />
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              placeholder="you@yourshop.com"
              autoComplete="username"
              required
            />
            <Field
              label="Password"
              name="password"
              type="password"
              placeholder="Enter your password"
              autoComplete={creatingAdmin ? "new-password" : "current-password"}
              minLength={creatingAdmin ? 12 : undefined}
              maxLength={creatingAdmin ? 72 : undefined}
              required
            />
            {creatingAdmin && (
              <>
                <p className="m-note">
                  Use at least 12 characters with uppercase, lowercase and a
                  number.
                </p>
                <Field
                  label="Confirm password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter your password again"
                  required
                  minLength={12}
                  maxLength={72}
                />
              </>
            )}
            {error && (
              <div className="m-error" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" busy={busy}>
              {creatingAdmin ? "Create admin account" : "Sign in to workspace"}{" "}
              <ArrowUpRight size={17} />
            </Button>
            {creatingAdmin && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setCreatingAdmin(false);
                  setError("");
                }}
              >
                Back to sign in
              </Button>
            )}
          </form>
          {!creatingAdmin && setup.data?.canCreateAdmin && (
            <div className="m-account-setup">
              <strong>First time using this workspace?</strong>
              <p>Create your shop’s first administrator account.</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreatingAdmin(true);
                  setError("");
                }}
              >
                Create admin account
              </Button>
            </div>
          )}
          {!creatingAdmin && setup.error && (
            <div className="m-account-setup">
              <p>Account setup could not be checked.</p>
              <Button type="button" variant="secondary" onClick={setup.reload}>
                Check account setup again
              </Button>
            </div>
          )}
          <div className="m-login-help">
            <ShieldCheck size={15} />
            <span>Account access is managed by your shop administrator.</span>
          </div>
        </div>
        <small className="m-login-foot">
          HARISH COMPUTER SHOP · BUSINESS WORKSPACE
        </small>
      </section>
    </div>
  );
}
function Brand() {
  return (
    <div className="m-brand">
      <div className="m-brand-name">
        <span className="m-brand-letter">H</span>arish{" "}
        <span className="m-brand-letter">C</span>omputer
      </div>
    </div>
  );
}
function Gate({ permission, children }) {
  const { can } = useSession();
  return can(permission) ? (
    children
  ) : (
    <div className="m-card">
      <Heading
        title="Access restricted"
        description="Your account does not have permission to view this page."
      />
    </div>
  );
}
function Shell() {
  const { user, setUser, can } = useSession();
  const navigation = nav
    .map(([label, items]) => [label, items.filter((n) => can(n[3]))])
    .filter(([, items]) => items.length);
  const [open, setOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 1024px)");
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const alerts = useData("/inventory/low-stock", { limit: 1 }, true);
  useEffect(() => setOpen(false), [location.pathname, mobile]);
  useEffect(() => {
    if (!mobile || !open) return;
    const previousOverflow = document.body.style.overflow;
    const opener = menuButton.current;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector("button")?.focus();
    const keyboard = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key === "Tab") {
        const controls = sidebar.current?.querySelectorAll("a[href], button:not([disabled])");
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyboard);
      opener?.focus();
    };
  }, [mobile, open]);
  const signOut = async () => {
    try {
      await api.post("/auth/logout");
      setUser(null);
    } catch {
      setUser(null);
    }
  };
  return (
    <div className="m-shell">
      {open && (
        <button type="button" className="m-sidebar-shade" aria-label="Close navigation backdrop" onClick={() => setOpen(false)} />
      )}
      <aside
        id="admin-navigation"
        ref={sidebar}
        className={`m-sidebar ${open ? "open" : ""}`}
        inert={mobile && !open}
        aria-hidden={mobile && !open ? true : undefined}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Shop navigation"
      >
        <div className="m-sidebar-brand">
          <Brand />
          <button
            className="m-mobile-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <div className="m-workspace">
          <span className="m-workspace-icon">
            <Store size={16} />
          </span>
          <div>
            Shop workspace
            <small>Administrator access</small>
          </div>
          <span className="m-live-dot" />
        </div>
        <nav>
          {navigation.map(([label, items]) => (
            <div className="m-nav-group" key={label}>
              <p>{label}</p>
              {items.map(([name, path, Icon]) => (
                <NavLink
                  end={path === ""}
                  key={path}
                  to={`/app${path ? "/" + path : ""}`}
                >
                  <Icon size={18} />
                  <span>{name}</span>
                  {path === "alerts" && alerts.data?.total > 0 && (
                    <b>{alerts.data.total}</b>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="m-sidebar-bottom">
          {can("admin") && (
            <NavLink to="/app/settings">
              <Settings size={18} /> Shop settings
            </NavLink>
          )}
          <NavLink to="/app/profile">
            <span className="m-avatar">{user.name?.[0]}</span>
            <div>
              {user.name}
              <small>Administrator</small>
            </div>
          </NavLink>
        </div>
      </aside>
      <div className="m-workarea" inert={mobile && open}>
        <header className="m-topbar">
          <button
            className="m-icon-button m-menu"
            ref={menuButton}
            aria-label="Open navigation"
            aria-controls="admin-navigation"
            aria-expanded={mobile && open}
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <form
            className="m-global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/app/products?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={18} />
            <input
              aria-label="Search products"
              placeholder="Search products, SKU or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <div className="m-topbar-right">
            <span className="m-session-label">
              <span className="m-live-dot" /> Shop workspace
            </span>
            <button
              className="m-icon-button"
              aria-label="View stock alerts"
              onClick={() => navigate("/app/alerts")}
            >
              <TriangleAlert size={19} />
            </button>
            <span className="m-avatar">{user.name?.[0]}</span>
            <button
              className="m-icon-button"
              aria-label="Sign out"
              onClick={signOut}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="m-main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="sell" element={<Billing kind="sale" />} />
            <Route path="pos" element={<Billing kind="sale" />} />
            <Route path="sales" element={<InvoiceList kind="sale" />} />
            <Route path="sales/:id" element={<Invoice kind="sale" />} />
            <Route path="service-center" element={<ServiceCenter />} />
            <Route
              path="products/new"
              element={
                <Gate permission="admin">
                  <ProductForm />
                </Gate>
              }
            />
            <Route
              path="products/:id/edit"
              element={
                <Gate permission="admin">
                  <ProductForm />
                </Gate>
              }
            />
            <Route path="inventory" element={<Inventory />} />
            <Route
              path="adjustments"
              element={
                <Gate permission="admin">
                  <Adjustment />
                </Gate>
              }
            />
            <Route
              path="stock-counts"
              element={
                <Gate permission="admin">
                  <StockCount />
                </Gate>
              }
            />
            <Route path="alerts" element={<Products alerts />} />
            {["categories", "brands", "audit-logs"].map((resource) => (
              <Route
                key={resource}
                path={resource}
                element={
                  <Gate permission="admin">
                    <ResourcePage key={resource} resource={resource} />
                  </Gate>
                }
              />
            ))}
            <Route
              path="settings"
              element={
                <Gate permission="admin">
                  <SettingsPage />
                </Gate>
              }
            />
            <Route path="profile" element={<Profile />} />
            <Route
              path="*"
              element={
                <Heading
                  title="Page not found"
                  description="Choose a page from the navigation to continue."
                />
              }
            />
          </Routes>
        </main>
        <footer className="m-work-footer">
          <span>HARISH COMPUTER SHOP</span>
          <DeveloperCredit className="m-developer-credit" />
        </footer>
      </div>
    </div>
  );
}
