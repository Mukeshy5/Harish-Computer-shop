import React, { useState } from "react";
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal, Table } from "../ui";

function DialogExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>View records</button>
      {open && (
        <Modal title="Records preview" onClose={() => setOpen(false)}>
          <button onClick={() => setOpen(false)}>Done</button>
          <Table
            columns={[{ key: "name", label: "Name" }]}
            rows={[{ name: "Saved product" }]}
          />
        </Modal>
      )}
    </>
  );
}

it("keeps a scrollable table keyboard accessible inside a dialog and restores the page on close", async () => {
  const user = userEvent.setup();
  render(<DialogExample />);
  const trigger = screen.getByRole("button", { name: "View records" });
  await user.click(trigger);
  expect(document.body.style.overflow).toBe("hidden");
  screen.getByRole("button", { name: "Done" }).focus();
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("region", { name: /Records: scroll horizontally/ }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Close dialog" }),
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement).toBe(trigger);
});
