import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const port = Number(process.env.VCS_E2E_PORT || "4184");
const host = process.env.VCS_E2E_HOST || "127.0.0.1";
const baseURL = `http://${host}:${port}`;

export default defineConfig({
	testDir: "./tests",
	timeout: 60_000,
	expect: {
		timeout: 15_000,
	},
	use: {
		baseURL,
		headless: true,
		trace: "retain-on-failure",
	},
	webServer: {
		command: `VCS_WEB_UI_HOST=${host} VCS_WEB_UI_PORT=${port} npm run ui:vcs:dev`,
		cwd: repoRoot,
		url: `${baseURL}/vcs/`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
