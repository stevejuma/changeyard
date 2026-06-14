#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const projectRoot = process.cwd();

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").toString().trim()}`);
  }
  return (result.stdout || "").trim();
}

function ensureBinary(name) {
  const where = run(process.platform === "win32" ? "where" : "command", ["-v", name]);
  return where.length > 0;
}

function parsePackJson(output) {
  const trimmed = output.trim();
  const match = /(\[\s*\{[\s\S]*\}\s*\])\s*$/.exec(trimmed);
  if (!match) {
    throw new Error(`Could not locate pnpm pack JSON output in:\n${output}`);
  }
  return JSON.parse(match[1]);
}

async function waitForServerUrl(child) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for cy --kanban to start")), 20000);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = /Changeyard UI running at (http:\/\/[^\s]+)/.exec(stdout);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`cy --kanban exited before reporting a URL (code ${code}): ${stderr || stdout}`));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

if (!ensureBinary("node") || !ensureBinary("pnpm")) {
  throw new Error("Node and pnpm must be available for install smoke testing");
}

const workdir = mkdtempSync(path.join(os.tmpdir(), "changeyard-smoke-install-"));
let packagedArtifact = "";
try {
  const packResult = run("pnpm", ["pack", "--json"], projectRoot);
  const [packed] = parsePackJson(packResult);
  if (!packed || !packed.filename) {
    throw new Error("pnpm pack did not return an archive name");
  }
  packagedArtifact = packed.filename;

  const artifactPath = path.join(projectRoot, packagedArtifact);
  const archiveHash = createHash("sha256");
  archiveHash.update(readFileSync(artifactPath));

  const installDir = path.join(workdir, "install");
  mkdirSync(installDir, { recursive: true });
  writeFileSync(path.join(workdir, "artifact.sha256"), `${archiveHash.digest("hex")}  ${packagedArtifact}\n`);

  writeFileSync(path.join(installDir, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  run("pnpm", ["add", artifactPath], installDir);

  const help = run("pnpm", ["exec", "changeyard", "--help"], installDir);
  if (!/Changeyard/.test(help)) {
    throw new Error("Installed package did not expose a usable changeyard CLI");
  }

  const installedCli = path.join(installDir, "node_modules", "changeyard", "dist", "src", "cli.js");
  const uiProcess = spawn(process.execPath, [installedCli, "--kanban", "--no-open", "--port", "auto"], {
    cwd: installDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  try {
    const uiUrl = await waitForServerUrl(uiProcess);
    const healthResponse = await fetch(`${uiUrl}/api/health`);
    if (!healthResponse.ok) {
      throw new Error(`Installed package UI health check failed with HTTP ${healthResponse.status}`);
    }
    const boardResponse = await fetch(`${uiUrl}/api/board`);
    if (!boardResponse.ok) {
      throw new Error(`Installed package UI board query failed with HTTP ${boardResponse.status}`);
    }
  } finally {
    await stopChild(uiProcess);
  }

  writeFileSync(path.join(workdir, "smoke-install.log"), `smoke-install-from-tarball passed for ${packagedArtifact}\n`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
