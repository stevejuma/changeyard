import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/vcs/",
  plugins: [react()],
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
