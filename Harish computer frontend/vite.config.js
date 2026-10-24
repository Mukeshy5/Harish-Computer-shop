import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [tailwindcss(), react()],
    server: {
      proxy: {
        "/api":
          process.env.API_TARGET || env.API_TARGET || "http://localhost:4000",
        "/health":
          process.env.API_TARGET || env.API_TARGET || "http://localhost:4000",
      },
    },
  };
});
