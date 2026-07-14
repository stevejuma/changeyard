#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function fromCodes(codes) {
  return String.fromCharCode(...codes);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const jjResult = spawnSync("jj", ["--color=never", "file", "list"], { encoding: "utf8" });
let tracked = jjResult;
if (tracked.status !== 0) {
  tracked = spawnSync("git", ["ls-files"], { encoding: "utf8" });
}
if (tracked.status !== 0) {
  process.stderr.write(`Could not list tracked files: tried 'jj file list' (${jjResult.stderr || jjResult.stdout || "no output"}) and 'git ls-files' (${tracked.stderr || tracked.stdout || "no output"})\n`);
  process.exit(tracked.status ?? 1);
}

const forbiddenValues = [
  fromCodes([110, 112, 109]),
  fromCodes([110, 112, 120]),
  fromCodes([110, 112, 109, 106, 115]),
  fromCodes([112, 97, 99, 107, 97, 103, 101, 45, 108, 111, 99, 107]),
];

const forbiddenPatterns = forbiddenValues.map((value) => ({
  value,
  pattern: new RegExp(`(?<![A-Za-z0-9_-])${escapeRegex(value)}(?![A-Za-z0-9_-])`, "giu"),
}));

const allowedReleaseRegistryLine = `registry-url: https://registry.${forbiddenValues[2]}.org`;

function isAllowedReference(filePath, content, index, value) {
  if (filePath !== ".github/workflows/release.yml" || value !== forbiddenValues[2]) {
    return false;
  }
  const lineStart = content.lastIndexOf("\n", index) + 1;
  const lineEnd = content.indexOf("\n", index);
  const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim();
  return line === allowedReleaseRegistryLine;
}

const failures = [];
for (const filePath of tracked.stdout.split("\n").filter(Boolean)) {
  if (filePath.includes(forbiddenValues[3])) {
    failures.push(`${filePath}: legacy lockfile is tracked`);
    continue;
  }
  if (filePath === "pnpm-lock.yaml") {
    continue;
  }
  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  for (const { value, pattern } of forbiddenPatterns) {
    for (const match of content.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (isAllowedReference(filePath, content, index, value)) {
        continue;
      }
      const line = content.slice(0, index).split("\n").length;
      failures.push(`${filePath}:${line}: legacy package-manager reference ${JSON.stringify(value)}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.length} legacy package-manager references found:\n`);
  process.stderr.write(`${failures.join("\n")}\n`);
  process.stderr.write("Use pnpm commands and package-registry wording instead.\n");
  process.exit(1);
}

process.stdout.write("ok - package-manager references use pnpm\n");
