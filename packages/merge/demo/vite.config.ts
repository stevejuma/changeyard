import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	root: __dirname,
	plugins: [react()],
	resolve: {
		alias: {
			"@changeyard/merge/styles.css": resolve(__dirname, "../src/styles.css"),
			"@changeyard/merge/react": resolve(__dirname, "../src/react/index.tsx"),
			"@changeyard/merge": resolve(__dirname, "../src/index.ts"),
		},
	},
	server: {
		host: "127.0.0.1",
		port: Number(process.env.MERGE_DEMO_PORT || "4175"),
		strictPort: true,
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
