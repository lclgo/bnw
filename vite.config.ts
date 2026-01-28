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
    port: 30030,
    host: "127.0.0.1",  // Only listen on localhost for security
  },
  preview: {
    port: 30030,
    host: "127.0.0.1",  // Only listen on localhost for security
  },
});
