import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
  timeout: 20000,
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401)
      window.dispatchEvent(new Event("hcs:session-expired"));
    return Promise.reject(error);
  },
);
export const errorMessage = (e) =>
  e.response?.data?.error?.message ||
  (e.code === "ECONNABORTED"
    ? "The request timed out. Retry to check whether it was saved."
    : "Cannot connect to the server. Check your connection and try again.");
export function useData(path, params = {}, live = false) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [version, setVersion] = useState(0);
  const query = JSON.stringify(params);
  const previousRequest = useRef(null);
  useEffect(() => {
    const previous = previousRequest.current;
    const parsed = JSON.parse(query);
    const searchChanged = previous?.path === path && previous.q !== parsed.q;
    previousRequest.current = { path, q: parsed.q };
    if (!path) {
      setState({ data: null, loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    let inFlight = false;
    let refreshPending = false;
    let debounceTimer;
    const load = async () => {
      if (controller.signal.aborted) return;
      if (inFlight) {
        refreshPending = true;
        return;
      }
      inFlight = true;
      try {
        const { data } = await api.get(path, {
          params: parsed,
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: "" });
      } catch (e) {
        if (!controller.signal.aborted && e.code !== "ERR_CANCELED")
          setState((s) => ({ ...s, loading: false, error: errorMessage(e) }));
      } finally {
        inFlight = false;
        if (refreshPending && !controller.signal.aborted) {
          refreshPending = false;
          void load();
        }
      }
    };
    const initialLoad = () => {
      clearTimeout(debounceTimer);
      setState((s) => ({ ...s, loading: true, error: "" }));
      void load();
    };
    if (searchChanged) debounceTimer = setTimeout(initialLoad, 250);
    else initialLoad();
    const refresh = () => {
      clearTimeout(debounceTimer);
      void load();
    };
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !inFlight) refresh();
    };
    const interval = live ? setInterval(refreshVisible, 15000) : null;
    if (live) {
      window.addEventListener("hcs:data-changed", refresh);
      document.addEventListener("visibilitychange", refreshVisible);
    }
    return () => {
      controller.abort();
      clearTimeout(debounceTimer);
      clearInterval(interval);
      if (live) {
        window.removeEventListener("hcs:data-changed", refresh);
        document.removeEventListener("visibilitychange", refreshVisible);
      }
    };
  }, [path, query, version, live]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
export function useCommand({ onError } = {}) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const lock = useRef(false);
  const execute = async (
    method,
    url,
    body = {},
    message = "Saved successfully",
  ) => {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    const fingerprint = JSON.stringify({ method, url, body });
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const { data } = await api.request({
        method,
        url,
        data: body,
        headers: { "Idempotency-Key": pending.current.key },
      });
      pending.current = null;
      if (method.toLowerCase() !== "get")
        window.dispatchEvent(new Event("hcs:data-changed"));
      if (message) toast.success(message);
      return data;
    } catch (e) {
      onError?.(e);
      toast.error(errorMessage(e));
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { execute, busy };
}
const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
export const money = (n) => currencyFormatter.format(Number(n || 0));
export const date = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
export const today = () =>
  new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export function exportCsv(rows, name = "report") {
  if (!rows.length) return toast.error("There are no records to export");
  const keys = Object.keys(rows[0]).filter(
    (k) =>
      ![
        "_id",
        "__v",
        "password",
        "requestKey",
        "requestHash",
        "shopSnapshot",
      ].includes(k) && typeof rows[0][k] !== "object",
  );
  const cell = (v) => {
    const str = String(v ?? "");
    return (
      '"' +
      (typeof v === "string" && /^[=+@\-\t\r]/.test(str)
        ? "'" + str
        : str
      ).replaceAll('"', '""') +
      '"'
    );
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [
          keys.join(","),
          ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
        ].join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8;" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
