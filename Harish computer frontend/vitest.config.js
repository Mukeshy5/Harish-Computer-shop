import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/management/tests/setup.js"],
    include: ["src/management/tests/**/*.test.jsx"],
    testTimeout: 15000,
  },
});
