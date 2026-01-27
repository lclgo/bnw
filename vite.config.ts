import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 37801,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:37802",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 37801,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:37802",
        changeOrigin: true,
      },
    },
  },
});
