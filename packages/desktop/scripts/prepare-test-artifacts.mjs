#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");
const buildBinDir = resolve(desktopRoot, "build", "bin");
const electronRoot = resolve(desktopRoot, "node_modules", "electron");
const electronInstallScript = resolve(electronRoot, "install.js");
const electronPathFile = resolve(electronRoot, "path.txt");

const POSIX_SHIM = `#!/bin/bash
# Kanban CLI shim - bundled with the desktop app.
#
# Prefers the bundled Electron binary (via ELECTRON_RUN_AS_NODE=1) so we
# don't depend on the user having a system node on PATH. GUI-launched apps
# on macOS/Linux inherit minimal PATHs that frequently omit nvm, Homebrew,
# and global package-bin dirs. Falls back to system node if the local
# Electron binary isn't found.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES_DIR="$(dirname "$SCRIPT_DIR")"
CLI_ENTRY="$RESOURCES_DIR/app.asar.unpacked/cli/cli.js"

if [ ! -f "$CLI_ENTRY" ]; then
  echo "error: Kanban CLI not found at $CLI_ENTRY" >&2
  exit 1
fi

APP_ROOT="$(dirname "$RESOURCES_DIR")"
if [ "$(uname)" = "Darwin" ]; then
  ELECTRON_BIN="$APP_ROOT/MacOS/Kanban"
else
  ELECTRON_BIN="$APP_ROOT/kanban"
fi

if [ -x "$ELECTRON_BIN" ]; then
  exec env ELECTRON_RUN_AS_NODE=1 "$ELECTRON_BIN" "$CLI_ENTRY" "$@"
fi

exec node "$CLI_ENTRY" "$@"
`;

const WINDOWS_SHIM = `@echo off
REM Kanban CLI shim - bundled with the desktop app.
setlocal

set "SCRIPT_DIR=%~dp0"
set "RESOURCES_DIR=%SCRIPT_DIR%.."
set "CLI_ENTRY=%RESOURCES_DIR%\\app.asar.unpacked\\cli\\cli.js"
set "APP_ROOT=%RESOURCES_DIR%\\.."
set "ELECTRON_BIN=%APP_ROOT%\\Kanban.exe"

if not exist "%CLI_ENTRY%" (
  echo error: Kanban CLI not found at %CLI_ENTRY% >&2
  endlocal
  exit /b 1
)

if exist "%ELECTRON_BIN%" (
  set "ELECTRON_RUN_AS_NODE=1"
  "%ELECTRON_BIN%" "%CLI_ENTRY%" %*
  set "EXIT_CODE=%ERRORLEVEL%"
  endlocal & exit /b %EXIT_CODE%
)

node "%CLI_ENTRY%" %*
set "NODE_EXIT=%ERRORLEVEL%"
endlocal & exit /b %NODE_EXIT%
`;

function ensureElectronBinary() {
	if (existsSync(electronPathFile)) {
		return;
	}
	if (!existsSync(electronInstallScript)) {
		throw new Error(`Electron install script not found at ${electronInstallScript}`);
	}
	const result = spawnSync(process.execPath, [electronInstallScript], {
		cwd: electronRoot,
		stdio: "inherit",
		env: process.env,
	});
	if (result.status !== 0) {
		throw new Error(`Electron install failed with exit code ${result.status ?? 1}`);
	}
}

mkdirSync(buildBinDir, { recursive: true });
writeFileSync(resolve(buildBinDir, "kanban"), POSIX_SHIM, { mode: 0o755 });
chmodSync(resolve(buildBinDir, "kanban"), 0o755);
writeFileSync(resolve(buildBinDir, "kanban.cmd"), WINDOWS_SHIM);
ensureElectronBinary();
