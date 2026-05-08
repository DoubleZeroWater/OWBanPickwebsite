import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5174",
      "/static": "http://127.0.0.1:5174",
    },
  },
});
