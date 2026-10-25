import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Navbar from "../../components/Navbar";

function open() {
  return render(
    <MemoryRouter>
      <div className="site-shell">
        <Navbar />
        <button>Page content</button>
        <Routes>
          <Route path="/" element={null} />
          <Route path="/products" element={<h1>Product catalog</h1>} />
        </Routes>
      </div>
    </MemoryRouter>,
  );
}

describe("Responsive public navigation", () => {
  it("opens a complete menu and closes it after selecting a page", async () => {
    const user = userEvent.setup();
    open();
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });
    for (const name of [
      "Home",
      "About Us",
      "Products",
      "Services",
      "Gallery",
      "Shop Login",
      "Contact Us",
    ])
      expect(within(navigation).getByRole("link", { name })).toBeTruthy();
    await user.click(
      within(navigation).getByRole("link", { name: "Products" }),
    );
    await screen.findByRole("heading", { name: "Product catalog" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
  it("closes with Escape and restores focus to the menu button", async () => {
    const user = userEvent.setup();
    open();
    const toggle = screen.getByRole("button", { name: "Open menu" });
    await user.click(toggle);
    within(screen.getByRole("navigation"))
      .getByRole("link", { name: "Home" })
      .focus();
    await user.keyboard("{Escape}");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
  it("closes when the user taps outside navigation", async () => {
    const user = userEvent.setup();
    open();
    const toggle = screen.getByRole("button", { name: "Open menu" });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Page content" }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
