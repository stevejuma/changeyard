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

async function waitForServerUrl(child) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for cy ui to start")), 20000);
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
      reject(new Error(`cy ui exited before reporting a URL (code ${code}): ${stderr || stdout}`));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

if (!ensureBinary("node") || !ensureBinary("npm")) {
  throw new Error("Node and npm must be available for install smoke testing");
}

const workdir = mkdtempSync(path.join(os.tmpdir(), "changeyard-smoke-install-"));
let packagedArtifact = "";
try {
  const packResult = run("npm", ["pack", "--silent", "--json"], projectRoot);
  const [packed] = JSON.parse(packResult);
  if (!packed || !packed.filename) {
    throw new Error("npm pack did not return an archive name");
  }
  packagedArtifact = packed.filename;

  const artifactPath = path.join(projectRoot, packagedArtifact);
  const archiveHash = createHash("sha256");
  archiveHash.update(readFileSync(artifactPath));

  const installDir = path.join(workdir, "install");
  mkdirSync(installDir, { recursive: true });
  writeFileSync(path.join(workdir, "artifact.sha256"), `${archiveHash.digest("hex")}  ${packagedArtifact}\n`);

  run("npm", ["init", "-y"], installDir);
  run("npm", ["install", artifactPath], installDir);

  const help = run("npx", ["changeyard", "--help"], installDir);
  if (!/Changeyard/.test(help)) {
    throw new Error("Installed package did not expose a usable changeyard CLI");
  }

  const uiProcess = spawn("npx", ["changeyard", "ui", "--no-open", "--port", "auto"], {
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
    uiProcess.kill("SIGTERM");
  }

  writeFileSync(path.join(workdir, "smoke-install.log"), `smoke-install-from-tarball passed for ${packagedArtifact}\n`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
