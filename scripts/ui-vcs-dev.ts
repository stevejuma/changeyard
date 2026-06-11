import { spawn } from "node:child_process";
import process from "node:process";

import { findRepoRoot, loadConfig } from "../src/config/loadConfig.js";
import { createChangeyardUiApi } from "../src/commands/ui.js";

const DEV_WEB_PORT = Number(process.env.VCS_WEB_UI_PORT || "4174");
const DEV_HOST = process.env.VCS_WEB_UI_HOST || "127.0.0.1";

function killChild(child: ReturnType<typeof spawn>): Promise<void> {
	return new Promise((resolve) => {
		if (child.exitCode !== null || child.signalCode !== null) {
			resolve();
			return;
		}
		child.once("exit", () => resolve());
		child.kill("SIGTERM");
		setTimeout(() => {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGKILL");
			}
		}, 2_000).unref();
	});
}

async function main(): Promise<void> {
	process.env.NODE_ENV = "development";
	process.env.CHANGEYARD_VCS = "1";

	const cwd = process.cwd();
	const repoRoot = findRepoRoot(cwd);
	const config = loadConfig(repoRoot);

	const kanbanServer = await import(new URL("../packages/kanban/src/server/index.js", import.meta.url).href);
	const runtime = await kanbanServer.startChangeyardRuntime({
		repoRoot,
		host: config.ui?.host ?? DEV_HOST,
		port: "auto",
		openBrowser: false,
		mode: "web",
		serveWebAssets: false,
		changeyardApi: createChangeyardUiApi(),
	});

	const runtimeUrl = new URL(runtime.url);
	const devUrl = `http://${DEV_HOST}:${DEV_WEB_PORT}/vcs/`;

	const viteChild = spawn(
		"npm",
		["--workspace", "@changeyard/vcs", "run", "dev", "--", "--host", DEV_HOST, "--port", String(DEV_WEB_PORT)],
		{
			cwd: repoRoot,
			stdio: "inherit",
			env: {
				...process.env,
				NODE_ENV: "development",
				CHANGEYARD_VCS: "1",
				VCS_RUNTIME_PORT: runtimeUrl.port,
				VCS_WEB_UI_PORT: String(DEV_WEB_PORT),
				VCS_WEB_UI_HOST: DEV_HOST,
			},
		},
	);

	let shuttingDown = false;
	const shutdown = async (signal?: NodeJS.Signals): Promise<void> => {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		if (signal) {
			process.stderr.write(`\nShutting down ui:vcs:dev after ${signal}...\n`);
		}
		await Promise.allSettled([runtime.close(), killChild(viteChild)]);
		process.exit(0);
	};

	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});
	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});

	viteChild.once("exit", (code) => {
		if (!shuttingDown) {
			void runtime.close().finally(() => {
				process.exit(code ?? 1);
			});
		}
	});

	process.stdout.write(`\nChangeyard VCS source UI dev server\n`);
	process.stdout.write(`Runtime API: ${runtimeUrl.origin}\n`);
	process.stdout.write(`VCS UI (HMR): ${devUrl}\n\n`);
}

void main().catch((error) => {
	const message = error instanceof Error ? error.stack ?? error.message : String(error);
	process.stderr.write(`${message}\n`);
	process.exit(1);
});
