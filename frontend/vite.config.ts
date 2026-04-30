import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local development the frontend dev server runs on :5173 and proxies
// API + audio requests to the FastAPI backend on :8104. In production the
// FastAPI app serves the built `frontend/dist` itself, so the proxy is
// irrelevant.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8104",
      "/audio": "http://127.0.0.1:8104",
      "/health": "http://127.0.0.1:8104"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022"
  }
});
