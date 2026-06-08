#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

  writeFileSync(path.join(workdir, "smoke-install.log"), `smoke-install-from-tarball passed for ${packagedArtifact}\n`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
