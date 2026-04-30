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
    target: "es2022",
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split the dependency graph so first paint can ship the React
        // bundle while Three.js + R3F stream in parallel. Each chunk is
        // hashed and aggressively cached by nginx (Cache-Control: immutable).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("three")) return "three";
          if (id.includes("@react-three")) return "r3f";
          if (id.includes("react-i18next") || id.includes("i18next")) return "i18n";
          if (id.includes("react-dom")) return "react-dom";
          if (id.includes("react")) return "react";
          if (id.includes("zustand")) return "zustand";
          return "vendor";
        }
      }
    }
  }
});
