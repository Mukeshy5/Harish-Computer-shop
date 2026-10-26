import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../../App";
import { api, useData } from "../api";

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

describe("Responsive data loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, "get").mockResolvedValue({ data: { data: [] } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads immediately, then sends only the final search after typing pauses", async () => {
    const { rerender } = renderHook(({ q }) => useData("/products", { q }), {
      initialProps: { q: "" },
    });
    await act(async () => {});
    expect(api.get).toHaveBeenCalledTimes(1);
    rerender({ q: "s" });
    await act(() => vi.advanceTimersByTimeAsync(150));
    rerender({ q: "ssd" });
    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get.mock.lastCall[1].params.q).toBe("ssd");
  });

  it("changes pagination immediately without delaying it as a search", async () => {
    const { rerender } = renderHook(({ page }) => useData("/products", { q: "ssd", page }), {
      initialProps: { page: 1 },
    });
    await act(async () => {});
    rerender({ page: 2 });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get.mock.lastCall[1].params.page).toBe(2);
  });

  it("ignores an obsolete response even if the transport finishes after cancellation", async () => {
    const old = deferred();
    api.get.mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ data: { data: ["latest"] } });
    const { result, rerender } = renderHook(({ q }) => useData("/products", { q }), {
      initialProps: { q: "old" },
    });
    const oldSignal = api.get.mock.calls[0][1].signal;
    rerender({ q: "latest" });
    expect(oldSignal.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(result.current.data.data).toEqual(["latest"]);
    await act(async () => old.resolve({ data: { data: ["obsolete"] } }));
    expect(result.current.data.data).toEqual(["latest"]);
  });

  it("does not overlap slow requests on polling ticks", async () => {
    const pending = deferred();
    api.get.mockReturnValueOnce(pending.promise);
    renderHook(() => useData("/reports/dashboard", {}, true));
    await act(() => vi.advanceTimersByTimeAsync(45000));
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: {} }));
    await act(() => vi.advanceTimersByTimeAsync(15000));
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("queues a refresh after a save while an earlier request is pending", async () => {
    const pending = deferred();
    api.get.mockReturnValueOnce(pending.promise);
    renderHook(() => useData("/products", {}, true));
    act(() => {
      window.dispatchEvent(new Event("hcs:data-changed"));
      window.dispatchEvent(new Event("hcs:data-changed"));
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: {} }));
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("pauses polling in hidden tabs and refreshes when the tab becomes visible", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderHook(() => useData("/inventory/low-stock", {}, true));
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(api.get).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe("Public page startup", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the full homepage headline immediately without an artificial loading screen", () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Smart tech\.\s*Trusted service\./ })).toBeTruthy();
    expect(screen.queryByText("Preparing your digital experience")).toBeNull();
    const hero = screen.getByRole("img", { name: "Harish Computer Shop showroom" });
    expect(hero.getAttribute("fetchpriority")).toBe("high");
  });

  it("loads a direct public page while keeping navigation available", async () => {
    render(<MemoryRouter initialEntries={["/about"]}><App /></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: /Technology with a.*human touch/i })).toBeTruthy();
  });
});
