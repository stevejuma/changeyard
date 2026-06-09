#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const distCli = path.join(root, "dist/src/cli.js");
const srcCli = path.join(root, "src/cli.ts");

function wantsSourceMode() {
  if (process.env.CHANGEYARD_USE_DIST === "1") return false;
  if (process.env.CHANGEYARD_DEV === "1" || process.env.CHANGEYARD_DEV === "true") return true;
  if (process.env.CHANGEYARD_USE_DIST === "0") return true;
  if (existsSync(srcCli) && !existsSync(distCli)) return true;
  return false;
}

const useSource = wantsSourceMode();
const invocationCwd = process.cwd();

if (useSource) {
  if (!existsSync(srcCli)) {
    console.error("Changeyard source CLI not found at src/cli.ts");
    process.exit(1);
  }
  const result = spawnSync(process.execPath, ["--import", "tsx", srcCli, ...args], {
    stdio: "inherit",
    cwd: invocationCwd,
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

if (!existsSync(distCli)) {
  console.error("Changeyard CLI is not built. Run npm run build:cli or set CHANGEYARD_DEV=1 for source mode.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [distCli, ...args], {
  stdio: "inherit",
  cwd: invocationCwd,
  env: process.env,
});
process.exit(result.status ?? 1);
