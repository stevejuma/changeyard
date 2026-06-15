import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as { version: string };

export default defineConfig({
  base: "/vcs/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    host: process.env.VCS_WEB_UI_HOST || "127.0.0.1",
    port: Number(process.env.VCS_WEB_UI_PORT || "4174"),
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.VCS_RUNTIME_PORT || "3484"}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
