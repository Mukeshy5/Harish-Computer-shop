import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import toast from "react-hot-toast";
afterEach(() => {
  cleanup();
  toast.remove();
});
window.matchMedia ||= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
