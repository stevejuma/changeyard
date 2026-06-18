#!/usr/bin/env node
/**
 * Stages the runtime + web-ui bundle from root dist/ into packages/desktop/cli/
 * for electron-builder. Validates completeness to fail loudly if the root build
 * was skipped.
 */

import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");
const repoRoot = resolve(desktopRoot, "../..");
const distDir = resolve(repoRoot, "dist");
const kanbanDistDir = resolve(repoRoot, "packages/kanban/dist");
const webUiIndex = resolve(kanbanDistDir, "web-ui/index.html");
const cliEntryCandidates = [
	resolve(distDir, "src/cli.js"),
	resolve(distDir, "cli.js"),
];
const stageDir = resolve(desktopRoot, "cli");

const cliEntry = cliEntryCandidates.find((candidate) => existsSync(candidate));

function fail(message) {
	console.error(`\n[stage:cli] ERROR: ${message}\n`);
	console.error("[stage:cli] Run the root build first:");
	console.error(
		"[stage:cli]   pnpm run build:cli && pnpm run build:kanban\n",
	);
	process.exit(1);
}

if (!existsSync(distDir)) {
	fail(`${distDir} does not exist.`);
}
if (!cliEntry) {
	fail(
		`${distDir}/src/cli.js is missing. ` +
			`(Expected dist build output at ${distDir}/src/cli.js.)`,
	);
}
if (!existsSync(webUiIndex)) {
	fail(
		`${webUiIndex} is missing — ensure @changeyard/kanban build has completed.`,
	);
}
if (!existsSync(kanbanDistDir)) {
	fail(
		`${kanbanDistDir} is missing. Run 'pnpm run build:kanban' before staging desktop assets.`,
	);
}

rmSync(stageDir, { recursive: true, force: true });
cpSync(distDir, stageDir, { recursive: true });
cpSync(kanbanDistDir, stageDir, { recursive: true });

// The CLI bundle is ESM (esbuild emits `import` statements). Inside the
// packaged app, this file lives at `app.asar.unpacked/cli/cli.js`. Node's
// nearest-package.json walk-up from `app.asar.unpacked/cli/` doesn't see
// the desktop package.json inside the sibling `app.asar` archive, so
// without a local package.json Node defaults to CJS and chokes on the
// `import` statement at module top. Drop a minimal package.json next to
// the staged cli.js so Node treats it as ESM regardless of what lives
// further up the tree.
writeFileSync(
	resolve(stageDir, "package.json"),
	`${JSON.stringify({ type: "module" }, null, 2)}\n`,
);

console.log(`[stage:cli] Staged ${distDir} → ${stageDir}`);
