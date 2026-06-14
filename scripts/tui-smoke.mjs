import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout || "command failed"}`);
  }
  return result.stdout.trim();
}

const repo = mkdtempSync(path.join(os.tmpdir(), "changeyard-tui-smoke-"));

try {
  run("git", ["init", "-b", "main"], repo);
  run("git", ["config", "user.name", "Changeyard Smoke"], repo);
  run("git", ["config", "user.email", "changeyard-smoke@example.test"], repo);
  run("git", ["config", "commit.gpgsign", "false"], repo);

  const cli = path.join(process.cwd(), "dist", "src", "cli.js");
  run(process.execPath, [cli, "init"], repo);
  run(process.execPath, [cli, "quick", "--title", "Smoke quick change"], repo);
  run(process.execPath, [cli, "--tui", "--project", repo, "--smoke-test", "--smoke-create-all"], repo, {
    ...process.env,
    FORCE_COLOR: "0",
  });
} finally {
  rmSync(repo, { recursive: true, force: true });
}
