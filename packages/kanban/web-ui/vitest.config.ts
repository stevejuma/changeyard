import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8")) as { version: string };

export default defineConfig({
	plugins: [react()],
	define: {
		__APP_VERSION__: JSON.stringify(rootPkg.version),
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
			"@runtime-agent-catalog": resolve(__dirname, "../src/runtime-stack/core/agent-catalog.ts"),
			"@runtime-cline-tool-call-display": resolve(__dirname, "../src/runtime-stack/cline-sdk/cline-tool-call-display.ts"),
			"@runtime-home-agent-session": resolve(__dirname, "../src/runtime-stack/core/home-agent-session.ts"),
			"@runtime-shortcuts": resolve(__dirname, "../src/runtime-stack/config/shortcut-utils.ts"),
			"@runtime-task-id": resolve(__dirname, "../src/runtime-stack/core/task-id.ts"),
			"@runtime-task-title": resolve(__dirname, "../src/runtime-stack/core/task-title.ts"),
			"@runtime-task-worktree-path": resolve(__dirname, "../src/runtime-stack/workspace/task-worktree-path.ts"),
			"@runtime-task-state": resolve(__dirname, "../src/runtime-stack/core/task-board-mutations.ts"),
			"@runtime-contract": resolve(__dirname, "../src/runtime-stack/core/api-contract.ts"),
			"@runtime-trpc": resolve(__dirname, "../src/runtime-stack/trpc/app-router.ts"),
		},
		conditions: ["import", "module", "browser", "default"],
	},
	test: {
		environment: "jsdom",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		passWithNoTests: true,
		setupFiles: ["./vitest.setup.ts"],
	},
});
