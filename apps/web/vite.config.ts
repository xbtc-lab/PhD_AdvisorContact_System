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
      // 确保 vite dev 与 vite build 均能直接解析 monorepo 中的源码类型与常量
      "@app/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      // 优先将 /api/cloud/*（含 AI 副驾驶与管理员 Prompt 接口）代理到云端核心服务 8787
      "/api/cloud": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      // 其余本地业务与邮件队列请求代理到本地执行引擎 8788
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
});
