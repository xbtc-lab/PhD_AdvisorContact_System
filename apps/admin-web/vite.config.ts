import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    conditions: ["development", "import", "browser", "default"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@app/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.ADMIN_WEB_PORT || 5174),
    proxy: {
      "/api/ops": {
        target: `http://127.0.0.1:${process.env.OPS_API_PORT || 8789}`,
        changeOrigin: true,
      },
    },
  },
});
