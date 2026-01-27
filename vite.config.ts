import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { wikiApiPlugin } from "./vite-plugin-wiki-api";

export default defineConfig({
  plugins: [react(), wikiApiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 37801,
    host: true,
  },
  preview: {
    port: 37801,
    host: true,
  },
});
