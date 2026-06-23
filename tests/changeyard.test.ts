import assert from "node:assert/strict";
import { existsSync, lstatSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCompletions } from "../src/commands/completions.js";
import { runCheckRecord } from "../src/commands/check.js";
import { getWorkflowAuditReport } from "../src/commands/audit.js";
import { runComplete } from "../src/commands/complete.js";
import { doctorReport, runDoctor } from "../src/commands/doctor.js";
import {
  getPlanPrompt,
  getPlanStatus,
  runPlanExport,
  runPlanImport,
  runPlanPrompt,
  runPlanStatus,
  runPlanStrictDisable,
  runPlanStrictEnable,
} from "../src/commands/plan.js";
import { runCreate } from "../src/commands/create.js";
import { getHubInstances, getHubStatus, killHubInstance, runHubList, runHubStatus } from "../src/commands/hub.js";
import { changeyardAppStatePath } from "../src/app-state.js";
import { runHydrate } from "../src/commands/hydrate.js";
import { runInit } from "../src/commands/init.js";
import { runLand } from "../src/commands/land.js";
import { runHooks } from "../src/commands/hooks.js";
import { runUpdate } from "../src/commands/update.js";
import { getNextAction, runNext } from "../src/commands/next.js";
import { formatCommandPreview } from "../src/scaffold/command-generation/generator.js";
import { cursorAdapter } from "../src/scaffold/command-generation/adapters/cursor.js";
import { getCommandContents } from "../src/scaffold/templates/commands.js";
import { CANONICAL_SKILL_RELATIVE_PATH, generateChangeyardSkillContent } from "../src/scaffold/skill-generation.js";
import { listChanges, runList } from "../src/commands/list.js";
import { runMarkInProgress, runNote } from "../src/commands/note.js";
import { runRepair } from "../src/commands/repair.js";
import { runRecover } from "../src/commands/recover.js";
import { runRefresh } from "../src/commands/refresh.js";
import { getReview, listReviews, runReviewComplete, runReviewStart, updateReview } from "../src/commands/review.js";
import { attachSession } from "../src/commands/session.js";
import { runStart } from "../src/commands/start.js";
import { getStatus, runStatus } from "../src/commands/status.js";
import { runSync } from "../src/commands/sync.js";
import { runValidate } from "../src/commands/validate.js";
import { runVerify } from "../src/commands/verify.js";
import { deleteWorkspace, getWorkspaceStatus } from "../src/commands/workspace.js";
import { createChangeyardBoardService } from "../src/board/boardService.js";
import {
  cliBinNames,
  ensureExecutable,
  runInstallCli,
  runUninstallCli,
} from "../src/commands/install-cli.js";
import { repoRootFromModule } from "../src/dev/paths.js";
import { checkProfile, isQuickChange, planningModel, workflowMode } from "../src/change/changeMetadata.js";
import { loadConfig } from "../src/config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../src/documents/frontmatter.js";
import { replaceSection } from "../src/documents/sections.js";
import { validateChangeFile } from "../src/documents/validateDocument.js";
import { replaceMarkedSection } from "../src/planning/sections.js";
import { renderProviderIssueBody } from "../src/providers/renderIssueBody.js";
import { createProvider } from "../src/providers/index.js";
import { ForgejoProvider } from "../src/providers/ForgejoProvider.js";
import { GitHubProvider } from "../src/providers/GitHubProvider.js";
import { GitLabProvider } from "../src/providers/GitLabProvider.js";
import { LocalFolderProvider } from "../src/providers/LocalFolderProvider.js";
import { curlJson, setHttpTransportForTests, type HttpRequest } from "../src/providers/http.js";
import { GitWorktreeEngine } from "../src/workspace/GitWorktreeEngine.js";
import { JjWorkspaceEngine } from "../src/workspace/JjWorkspaceEngine.js";
import { jjInspectionArgs } from "../src/workspace/commandRunner.js";
import { colorEnabled, createColors, parseColorChoice } from "../src/cli/color.js";
import { readCliHelpEntry, readCliTopic, renderCliHelp, renderCliTopic } from "../src/cli/docs.js";
import { renderHumanOutput } from "../src/cli/render.js";
import type { WorkspaceMetadata } from "../src/types.js";

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-test-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function initGitRepo(repo: string): void {
  const init = spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
}

function gitExclude(repo: string): string {
  return readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8");
}

function enableGeneratedFileTracking(repo: string): void {
  const configPath = path.join(repo, ".changeyard", "config.jsonc");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.scaffold.trackGeneratedFiles = true;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  runUpdate(repo);
}

function withTempChangeyardHome<T>(fn: () => T): T {
  const previous = process.env.CHANGEYARD_HOME;
  const appState = tempRepo();
  process.env.CHANGEYARD_HOME = appState;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.CHANGEYARD_HOME;
    } else {
      process.env.CHANGEYARD_HOME = previous;
    }
    cleanup(appState);
  }
}

async function withTempChangeyardHomeAsync<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.CHANGEYARD_HOME;
  const appState = tempRepo();
  process.env.CHANGEYARD_HOME = appState;
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.CHANGEYARD_HOME;
    } else {
      process.env.CHANGEYARD_HOME = previous;
    }
    cleanup(appState);
  }
}

function asRecordForTest(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cliBinPath(): string {
  return path.join(process.cwd(), "dist", "src", "cli.js");
}

function nodeBinary(): string {
  return process.argv[0] ?? "node";
}

function maxVisibleLineLength(output: string): number {
  return Math.max(0, ...output.split(/\r?\n/).map((line) => line.replace(/\u001b\[[0-9;]*m/g, "").length));
}

function updatePlannedSection(changePath: string, sectionId: "proposal" | "spec-deltas" | "design" | "tasks" | "verification" | "clarifications" | "requirements-checklist" | "analysis", content: string): void {
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  writeFileSync(changePath, writeFrontmatter(parsed.frontmatter, replaceMarkedSection(parsed.body, sectionId, content)));
}

function updateSection(changePath: string, sectionName: string, content: string): void {
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  writeFileSync(changePath, writeFrontmatter(parsed.frontmatter, replaceSection(parsed.body, sectionName, content)));
}

function updateAdapterMirrorContent(filePath: string, content: string): void {
  const marker = "<!-- changeyard-adapter-content:start -->";
  const raw = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Adapter content marker missing in ${filePath}`);
  }
  writeFileSync(filePath, `${raw.slice(0, markerIndex + marker.length)}\n${content.trim()}\n`);
}

test("init creates config, templates, and storage directories", () => {
  const repo = tempRepo();
  try {
    const output = runInit(repo);
    assert.match(output, /Initialized Changeyard/);
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8"));
    const schema = JSON.parse(readFileSync(path.join(repo, ".changeyard", "schema.json"), "utf8"));
    assert.equal(schema["$schema"], "https://json-schema.org/draft/2020-12/schema");
    assert.deepEqual(schema.properties.provider.properties.type.enum, ["noop", "local-folder", "forgejo", "github", "gitlab"]);
    assert.deepEqual(schema.properties.vcs.properties.engine.enum, ["plain-copy", "jj", "git-worktree"]);
    assert.equal(schema.properties.workspace.properties.hydrate.properties.warmupCommand.type, "string");
    assert.equal(schema.properties.scaffold.properties.trackGeneratedFiles.type, "boolean");
    assert.deepEqual(schema.properties.planning.properties.defaultProfile.enum, ["none", "openspec-lite"]);
    assert.deepEqual(schema.properties.planning.properties.defaultStrictness.enum, ["normal", "strict"]);
    assert.deepEqual(schema.properties.planning.properties.quickChangeEscalation.enum, ["off", "warn", "block"]);
    const config = JSON.parse(readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8"));
    assert.equal(config.planning.defaultProfile, "none");
    assert.equal(config.planning.defaultStrictness, "normal");
    assert.equal(config.planning.allowQuickChanges, true);
    assert.equal(config.planning.quickChangeCheckProfile, "minimal");
    assert.equal(config.planning.quickChangeRequiresWorkspace, true);
    assert.equal(config.planning.quickChangeEscalation, "warn");
    assert.equal(config.scaffold.trackGeneratedFiles, false);
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".changeyard", "templates", "agent-task.md"), "utf8"));
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".changeyard", "templates", "quick.md"), "utf8"));
    assert.doesNotThrow(() => readFileSync(path.join(repo, CANONICAL_SKILL_RELATIVE_PATH), "utf8"));
  } finally {
    cleanup(repo);
  }
});

test("init installs cursor agent artifacts when .cursor exists", () => {
  const repo = tempRepo();
  try {
    mkdirSync(path.join(repo, ".cursor"), { recursive: true });
    runInit(repo);
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".cursor", "skills", "changeyard", "SKILL.md"), "utf8"));
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".cursor", "commands", "cy-create.md"), "utf8"));
    assert.match(readFileSync(path.join(repo, ".cursor", "hooks.json"), "utf8"), /\.cursor\/hooks\/kanban-stop/);
    assert.match(readFileSync(path.join(repo, ".cursor", "hooks", "kanban-stop"), "utf8"), /cy' 'hooks' 'notify' '--event' 'to_review'/);
    assert.equal((statSync(path.join(repo, ".cursor", "hooks", "kanban-stop")).mode & 0o111) !== 0, true);
  } finally {
    cleanup(repo);
  }
});

test("init with explicit tools creates agent paths even when absent", () => {
  const repo = tempRepo();
  try {
    runInit(repo, { tools: "cursor" });
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".cursor", "skills", "changeyard", "SKILL.md"), "utf8"));
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".cursor", "commands", "cy-doctor.md"), "utf8"));
  } finally {
    cleanup(repo);
  }
});

test("init skips existing agent artifacts on second run", () => {
  const repo = tempRepo();
  try {
    runInit(repo, { tools: "cursor" });
    const skillPath = path.join(repo, ".cursor", "skills", "changeyard", "SKILL.md");
    writeFileSync(skillPath, "# custom\n");
    const output = runInit(repo, { tools: "cursor" });
    assert.match(output, /Skipped existing/);
    assert.match(readFileSync(skillPath, "utf8"), /# custom/);
  } finally {
    cleanup(repo);
  }
});

test("update refreshes bundled templates and agent artifacts", () => {
  const repo = tempRepo();
  try {
    runInit(repo, { tools: "cursor" });
    const skillPath = path.join(repo, ".cursor", "skills", "changeyard", "SKILL.md");
    const hookScriptPath = path.join(repo, ".cursor", "hooks", "kanban-stop");
    writeFileSync(skillPath, "# custom\n");
    writeFileSync(hookScriptPath, "# custom hook\n");
    const output = runUpdate(repo, { tools: "cursor" });
    assert.match(output, /Updated Changeyard scaffold/);
    assert.match(readFileSync(skillPath, "utf8"), /Changeyard Agent Protocol/);
    assert.match(readFileSync(path.join(repo, ".cursor", "hooks.json"), "utf8"), /\.cursor\/hooks\/kanban-stop/);
    assert.match(readFileSync(hookScriptPath, "utf8"), /cy' 'hooks' 'notify' '--event' 'to_review'/);
    assert.equal((statSync(hookScriptPath).mode & 0o111) !== 0, true);
    const config = readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8");
    assert.doesNotThrow(() => JSON.parse(config));
  } finally {
    cleanup(repo);
  }
});

test("update installs copilot hook config when selected", () => {
  const repo = tempRepo();
  try {
    runInit(repo, { tools: "copilot" });
    const hookConfigPath = path.join(repo, ".github", "hooks", "kanban.json");
    writeFileSync(hookConfigPath, "{}\n");
    const output = runUpdate(repo, { tools: "copilot" });
    assert.match(output, /Updated Changeyard scaffold/);
    const hooksConfig = JSON.parse(readFileSync(hookConfigPath, "utf8")) as {
      hooks: Record<string, Array<{ bash: string; powershell: string }>>;
    };
    assert.match(hooksConfig.hooks.agentStop?.[0]?.bash ?? "", /cy' 'hooks' 'notify' '--event' 'to_review'/);
    assert.match(hooksConfig.hooks.userPromptSubmitted?.[0]?.bash ?? "", /--event' 'to_in_progress'/);
    assert.match(hooksConfig.hooks.agentStop?.[0]?.powershell ?? "", /"cy" "hooks" "notify" "--event" "to_review"/);
  } finally {
    cleanup(repo);
  }
});

test("update reports global codex prompts with a stable global label", () => {
  const repo = tempRepo();
  const previousCodexHome = process.env.CODEX_HOME;
  try {
    process.env.CODEX_HOME = path.join(repo, "codex-home");
    const output = runUpdate(repo, { tools: "codex", dryRun: true });
    assert.match(output, /\$CODEX_HOME\/prompts\/cy-create\.md/);
    assert.doesNotMatch(output, /\.\.\/.*\.codex\/prompts\/cy-create\.md/);
    assert.doesNotMatch(output, new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    cleanup(repo);
  }
});

test("init ignores generated scaffold artifacts in local git excludes by default", () => {
  const repo = tempRepo();
  try {
    initGitRepo(repo);

    const output = runInit(repo, { tools: "cursor,copilot" });

    assert.match(output, /\.git\/info\/exclude \(Changeyard generated artifact ignore rules\)/);
    const exclude = gitExclude(repo);
    assert.match(exclude, /# BEGIN Changeyard generated artifacts/);
    assert.match(exclude, /^\.changeyard\/$/m);
    assert.match(exclude, /^\.agents\/skills\/changeyard\/$/m);
    assert.match(exclude, /^\.cursor\/skills\/changeyard\/$/m);
    assert.match(exclude, /^\.cursor\/commands\/cy-\*\.md$/m);
    assert.match(exclude, /^\.cursor\/hooks\.json$/m);
    assert.match(exclude, /^\.cursor\/hooks\/kanban-\*$/m);
    assert.match(exclude, /^\.github\/skills\/changeyard\/$/m);
    assert.match(exclude, /^\.github\/prompts\/cy-\*\.prompt\.md$/m);
    assert.match(exclude, /^\.github\/hooks\/kanban\.json$/m);
    assert.doesNotMatch(exclude, /^\.github\/$/m);
    assert.match(exclude, /# END Changeyard generated artifacts/);
  } finally {
    cleanup(repo);
  }
});

test("update keeps managed generated artifact excludes idempotent by default", () => {
  const repo = tempRepo();
  try {
    initGitRepo(repo);
    runInit(repo, { tools: "cursor,copilot" });
    runUpdate(repo, { tools: "cursor,copilot" });

    const exclude = gitExclude(repo);
    assert.equal((exclude.match(/# BEGIN Changeyard generated artifacts/g) ?? []).length, 1);
    assert.equal((exclude.match(/^\.changeyard\/$/gm) ?? []).length, 1);
    assert.equal((exclude.match(/^\.cursor\/hooks\/kanban-\*$/gm) ?? []).length, 1);
  } finally {
    cleanup(repo);
  }
});

test("update removes generated artifact excludes when tracking is enabled", () => {
  const repo = tempRepo();
  try {
    initGitRepo(repo);
    runInit(repo, { tools: "cursor,copilot" });
    const configPath = path.join(repo, ".changeyard", "config.jsonc");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.scaffold.trackGeneratedFiles = true;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const output = runUpdate(repo, { tools: "cursor,copilot" });

    assert.match(output, /\.git\/info\/exclude \(removed Changeyard generated artifact ignore rules\)/);
    const exclude = gitExclude(repo);
    assert.doesNotMatch(exclude, /# BEGIN Changeyard generated artifacts/);
    assert.doesNotMatch(exclude, /^\.changeyard\/$/m);
    assert.doesNotMatch(exclude, /^\.github\/hooks\/kanban\.json$/m);
    assert.doesNotMatch(exclude, /^\.cursor\/hooks\/kanban-\*$/m);
  } finally {
    cleanup(repo);
  }
});

test("update dry-run does not mutate generated artifact excludes", () => {
  const repo = tempRepo();
  try {
    initGitRepo(repo);
    runInit(repo, { tools: "cursor" });
    const before = gitExclude(repo);

    const output = runUpdate(repo, { tools: "cursor", dryRun: true });

    assert.doesNotMatch(output, /\.git\/info\/exclude \(Changeyard generated artifact ignore rules\)/);
    assert.equal(gitExclude(repo), before);
  } finally {
    cleanup(repo);
  }
});

test("tracking opt-in removes legacy generated hook exclude lines", () => {
  const repo = tempRepo();
  try {
    initGitRepo(repo);
    const excludePath = path.join(repo, ".git", "info", "exclude");
    writeFileSync(excludePath, ".github/hooks/kanban.json\n.cursor/hooks/kanban-*\n.cursor/hooks/kanban-stop\n");
    runInit(repo, { tools: "cursor,copilot" });
    const configPath = path.join(repo, ".changeyard", "config.jsonc");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.scaffold.trackGeneratedFiles = true;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    runUpdate(repo, { tools: "cursor,copilot" });

    const exclude = gitExclude(repo);
    assert.doesNotMatch(exclude, /^\.github\/hooks\/kanban\.json$/m);
    assert.doesNotMatch(exclude, /^\.cursor\/hooks\/kanban-\*$/m);
    assert.doesNotMatch(exclude, /^\.cursor\/hooks\/kanban-stop$/m);
  } finally {
    cleanup(repo);
  }
});

test("init detects git-worktree when .git exists", () => {
  const repo = tempRepo();
  try {
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    runInit(repo);
    const config = JSON.parse(readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8"));
    assert.equal(config.vcs.engine, "git-worktree");
    assert.equal(config.vcs.fallback, "git-worktree");
  } finally {
    cleanup(repo);
  }
});

test("init detects jj when .jj exists", () => {
  const repo = tempRepo();
  try {
    mkdirSync(path.join(repo, ".jj"), { recursive: true });
    runInit(repo);
    const config = JSON.parse(readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8"));
    assert.equal(config.vcs.engine, "jj");
    assert.equal(config.vcs.fallback, "jj");
  } finally {
    cleanup(repo);
  }
});

test("init prefers jj over git when both markers exist", () => {
  const repo = tempRepo();
  try {
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    mkdirSync(path.join(repo, ".jj"), { recursive: true });
    runInit(repo);
    const config = JSON.parse(readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8"));
    assert.equal(config.vcs.engine, "jj");
  } finally {
    cleanup(repo);
  }
});

test("update refreshes detected vcs engine in existing config", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    mkdirSync(path.join(repo, ".jj"), { recursive: true });
    runUpdate(repo);
    const config = JSON.parse(readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8"));
    assert.equal(config.vcs.engine, "jj");
    assert.equal(config.vcs.fallback, "jj");
  } finally {
    cleanup(repo);
  }
});

test("cursor command adapter formats slash command frontmatter", () => {
  const create = getCommandContents().find((entry) => entry.id === "create");
  assert.ok(create);
  const formatted = formatCommandPreview(create!, cursorAdapter);
  assert.match(formatted, /name: \/cy-create/);
  assert.match(formatted, /Create a new strict planned Changeyard change/);
  assert.match(formatted, /cy create --template agent-task --planning openspec-lite --strict --title "<title>"/);
  assert.match(formatted, /Use `cy quick` or `--no-planning` only for small, low-risk changes/);
});

test("generated skill guidance defaults non-trivial agent work to strict planning", () => {
  const skill = generateChangeyardSkillContent("test");
  assert.match(skill, /Create a strict planned change: `cy create --template agent-task --planning openspec-lite --strict --title "<title>"`/);
  assert.match(skill, /Non-trivial agent work must use strict OpenSpec-lite planning/);
  assert.match(skill, /Use `cy quick` or `--no-planning` only for small, low-risk changes with no behavior, public API, storage\/schema, provider\/workspace lifecycle, UI workflow, or security-sensitive impact/);
  assert.match(skill, /make multiple logical commits inside the verified workspace/);
  assert.match(skill, /Every workspace commit message must start with the change id/);
  assert.match(skill, /Landing policy/);
  assert.match(skill, /Do not run `cy land <id>` for planned\/OpenSpec-lite or legacy unplanned changes unless the user explicitly confirms landing/);
  assert.match(skill, /Quick low-risk changes may land after successful checks when the user's task clearly asks for completion/);
  assert.match(skill, /Agents must not use them unless the user explicitly names the flag or asks for that exact cleanup/);
});

test("generated start and verify guidance explains workspace commit messages", () => {
  const start = getCommandContents().find((entry) => entry.id === "start");
  const verify = getCommandContents().find((entry) => entry.id === "verify");
  const complete = getCommandContents().find((entry) => entry.id === "complete");
  const status = getCommandContents().find((entry) => entry.id === "status");
  assert.ok(start);
  assert.ok(verify);
  assert.ok(complete);
  assert.ok(status);
  assert.match(start.body, /make multiple logical commits inside the verified workspace/);
  assert.match(start.body, /CY-0001: Add parser validation/);
  assert.match(verify.body, /every commit in the landing stack must start with the change id/);
  assert.match(complete.body, /Run `cy next <id>` and report its landing confirmation guidance/);
  assert.match(complete.body, /Do not run `cy land <id>` for planned\/OpenSpec-lite or legacy unplanned changes unless the user explicitly confirms landing/);
  assert.match(status.body, /landing confirmation guidance/);
});

test("create allocates a valid markdown change", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const output = runCreate({ template: "agent-task", title: "Add workspace verification" }, repo);
    assert.match(output, /Created CY-0001/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-add-workspace-verification.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.id, "CY-0001");
    assert.equal(parsed.frontmatter.status, "ready");
    assert.equal(parsed.frontmatter.title, "Add workspace verification");
    assert.equal(runValidate("CY-0001", repo), "Valid change: .changeyard/changes/CY-0001-add-workspace-verification.md");
  } finally {
    cleanup(repo);
  }
});

test("create keeps the existing simple format when planning is not enabled", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Simple feature change" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-simple-feature-change.md");
    const change = readFileSync(changePath, "utf8");
    assert.doesNotMatch(change, /cy:proposal:start/);
    assert.doesNotMatch(change, /planning:/);
  } finally {
    cleanup(repo);
  }
});

test("create can generate a quick change with quick metadata defaults", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const output = runCreate({ template: "quick", title: "Fix README typo" }, repo);
    assert.match(output, /Created CY-0001/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-fix-readme-typo.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.type, "quick");
    assert.equal(parsed.frontmatter.priority, "low");
    assert.deepEqual(parsed.frontmatter.labels, ["quick", "low-risk"]);
    assert.deepEqual(parsed.frontmatter.planning, { model: "none" });
    assert.deepEqual(parsed.frontmatter.workflow, {
      mode: "quick",
      risk: "low",
      requiresWorkspace: true,
    });
    assert.deepEqual(parsed.frontmatter.checks, {
      profile: "minimal",
      lastRun: null,
      lastStatus: null,
    });
    const validationOutput = runValidate("CY-0001", repo);
    assert.match(validationOutput, /Valid change: \.changeyard\/changes\/CY-0001-fix-readme-typo\.md/);
    assert.match(validationOutput, /Warning: Quick scope risk review unresolved:/);
  } finally {
    cleanup(repo);
  }
});

test("change metadata helpers distinguish quick changes from legacy changes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "quick", title: "Quick metadata helper coverage", labels: ["docs", "quick"] }, repo);
    runCreate({ template: "feature", title: "Legacy unplanned change" }, repo);

    const quickPath = path.join(repo, ".changeyard", "changes", "CY-0001-quick-metadata-helper-coverage.md");
    const legacyPath = path.join(repo, ".changeyard", "changes", "CY-0002-legacy-unplanned-change.md");
    const quick = parseFrontmatter(readFileSync(quickPath, "utf8")).frontmatter;
    const legacy = parseFrontmatter(readFileSync(legacyPath, "utf8")).frontmatter;

    assert.equal(planningModel(quick), "none");
    assert.equal(workflowMode(quick), "quick");
    assert.equal(checkProfile(quick), "minimal");
    assert.equal(isQuickChange(quick), true);
    assert.deepEqual(quick.labels, ["docs", "quick", "low-risk"]);

    assert.equal(planningModel(legacy), "none");
    assert.equal(workflowMode(legacy), "");
    assert.equal(checkProfile(legacy), "standard");
    assert.equal(isQuickChange(legacy), false);
  } finally {
    cleanup(repo);
  }
});

test("validate fails malformed quick metadata when quick invariants are broken", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "quick", title: "Broken quick metadata" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-broken-quick-metadata.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    const nextFrontmatter = {
      ...parsed.frontmatter,
      planning: { model: "openspec-lite" },
      workflow: { mode: "planned", risk: "low", requiresWorkspace: true },
    };
    writeFileSync(changePath, writeFrontmatter(nextFrontmatter, `${parsed.body}\n\n<!-- cy:proposal:start -->\n# Proposal\n\nUnexpected.\n<!-- cy:proposal:end -->\n`));

    assert.throws(
      () => runValidate("CY-0001", repo),
      /Quick changes must set planning\.model to `none`\.\nQuick changes must set workflow\.mode to `quick`\.\nQuick changes cannot include OpenSpec-lite planning markers unless converted to planned mode\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("validate warns for unresolved quick scope risk review when escalation is warn", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "quick", title: "Warn on risky quick scope" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-warn-on-risky-quick-scope.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    const riskyBody = parsed.body.replace("- [ ] No behavior change", "- [x] No behavior change")
      .replace("- [ ] No public API change", "- [ ] No public API change");
    writeFileSync(changePath, writeFrontmatter(parsed.frontmatter, riskyBody));

    const output = runValidate("CY-0001", repo);
    assert.match(output, /Valid change: \.changeyard\/changes\/CY-0001-warn-on-risky-quick-scope\.md/);
    assert.match(output, /Warning: Quick scope risk review unresolved:/);
    assert.match(output, /No public API change is not checked/);
  } finally {
    cleanup(repo);
  }
});

test("validate blocks risky quick scope when escalation is block", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"planning":{"quickChangeEscalation":"block"}}\n`);
    runCreate({ template: "quick", title: "Block risky quick scope" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-block-risky-quick-scope.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    const riskyBody = parsed.body.replace("- [ ] No behavior change", "- [x] No behavior change");
    writeFileSync(changePath, writeFrontmatter(parsed.frontmatter, riskyBody));

    assert.throws(
      () => runValidate("CY-0001", repo),
      /Quick scope risk review unresolved:/,
    );
  } finally {
    cleanup(repo);
  }
});

test("existing configs without planning quick settings still load with defaults", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}\n`);
    const config = loadConfig(repo);
    assert.equal(config.provider.type, "local-folder");
    assert.equal(config.planning?.allowQuickChanges, true);
    assert.equal(config.planning?.quickChangeCheckProfile, "minimal");
    assert.equal(config.planning?.quickChangeRequiresWorkspace, true);
    assert.equal(config.planning?.quickChangeEscalation, "warn");
  } finally {
    cleanup(repo);
  }
});

test("cli quick dry-run reports the intended quick change path without writing files", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"planning":{"defaultProfile":"openspec-lite"}}\n`);
    const result = spawnSync(nodeBinary(), [cliBinPath(), "quick", "--title", "Fix typo", "--dry-run"], {
      cwd: repo,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Dry-run: would create CY-0001: \.changeyard\/changes\/CY-0001-fix-typo\.md/);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(path.join(repo, ".changeyard", "changes")), []);
  } finally {
    cleanup(repo);
  }
});

test("cli create --quick uses the quick template and preserves the standard json envelope", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"planning":{"defaultProfile":"openspec-lite"}}\n`);
    const result = spawnSync(nodeBinary(), [cliBinPath(), "create", "--quick", "--title", "Docs wording", "--json"], {
      cwd: repo,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout ?? "");
    assert.equal(payload.ok, true);
    assert.equal(payload.command, "create");
    assert.match(payload.message, /Created CY-0001: \.changeyard\/changes\/CY-0001-docs-wording\.md/);
    assert.equal(payload.data.id, "CY-0001");
    assert.equal(payload.data.sessionAttach.taskId, "CY-0001");
    assert.equal(payload.data.sessionAttach.source, "cli");
    assert.match(payload.data.sessionAttach.genericCommand, /cy session attach --task-id CY-0001 --provider <provider>/);
    assert.match(payload.data.sessionAttach.providers.codex.command, /--provider codex --session-id "\$CODEX_THREAD_ID"/);
    assert.equal(typeof payload.data.sessionAttach.providers.codex.available, "boolean");

    const parsed = parseFrontmatter(readFileSync(path.join(repo, ".changeyard", "changes", "CY-0001-docs-wording.md"), "utf8"));
    assert.equal(parsed.frontmatter.type, "quick");
    assert.deepEqual(parsed.frontmatter.planning, { model: "none" });
    assert.deepEqual(parsed.frontmatter.workflow, { mode: "quick", risk: "low", requiresWorkspace: true });
  } finally {
    cleanup(repo);
  }
});

test("audit reports planned, quick, and lite no-planning workflow context", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Planned audit", planning: "openspec-lite", strict: true }, repo);
    runCreate({ template: "quick", title: "Quick audit" }, repo);
    runCreate({ template: "agent-task", title: "Lite audit", noPlanning: true }, repo);

    const planned = getWorkflowAuditReport("CY-0001", repo);
    assert.equal(planned.workflow.mode, "planned");
    assert.equal(planned.workflow.strictness, "strict");
    assert.equal(planned.checks.some((check) => check.status === "fail"), true);
    assert.match(planned.recovery.join("\n"), /cy plan prompt CY-0001 proposal/);
    assert.match(planned.nextCommand, /cy plan status CY-0001|cy validate CY-0001/);
    const cliAudit = spawnSync(nodeBinary(), [cliBinPath(), "audit", "CY-0001"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(cliAudit.status, 1, cliAudit.stderr);
    assert.match(cliAudit.stdout, /Workflow audit: CY-0001/);
    assert.match(cliAudit.stdout, /Recovery:/);

    const quick = getWorkflowAuditReport("CY-0002", repo);
    assert.equal(quick.workflow.mode, "quick");
    assert.equal(quick.workflow.planningModel, "none");
    assert.match(quick.warnings.join("\n"), /Quick scope risk review unresolved/);

    const lite = getWorkflowAuditReport("CY-0003", repo);
    assert.equal(lite.workflow.mode, "lite-no-planning");
    assert.equal(lite.workflow.planningModel, "none");
  } finally {
    cleanup(repo);
  }
});

test("cli quick --help shows quick-mode examples", () => {
  const result = spawnSync(nodeBinary(), [cliBinPath(), "quick", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cy quick --title "Fix typo in README"/);
  assert.match(result.stdout, /cy quick --dry-run --title "Tighten release note copy"/);
});

test("cli docs loader reads command docs, topics, and possible values", () => {
  const root = readCliHelpEntry([]);
  assert.ok(root);
  const missingCommandDocs = root.commands
    .map((command) => command.name)
    .filter((command) => !readCliHelpEntry([command]));
  assert.deepEqual(missingCommandDocs, []);

  const init = readCliHelpEntry(["init"]);
  assert.ok(init);
  assert.equal(init.command, "cy init");
  assert.match(renderCliHelp(init, createColors(false)), /Create `.changeyard`, templates, skills/);

  const hooks = readCliHelpEntry(["hooks"]);
  assert.ok(hooks);
  assert.equal(hooks.command, "cy hooks");
  assert.equal(hooks.options.find((option) => option.flags === "--event <event>")?.possibleValues.join(","), "to_review,to_in_progress,activity");
  assert.match(renderCliHelp(hooks, createColors(false)), /possible values: to_review, to_in_progress, activity/);

  const sessionAttach = readCliHelpEntry(["session", "attach"]);
  assert.ok(sessionAttach);
  assert.equal(sessionAttach.command, "cy session attach");
  assert.match(renderCliHelp(sessionAttach, createColors(false)), /--provider <name>/);

  const topic = readCliTopic("color");
  assert.ok(topic);
  assert.match(topic.body, /`--color <always\|never\|auto>`/);
});

test("cli help and topic rendering wrap to terminal width", () => {
  const previousColumns = process.env.COLUMNS;
  process.env.COLUMNS = "56";
  try {
    const help = renderCliHelp({
      name: "test",
      command: "cy test",
      summary: "This summary is intentionally long enough to wrap using the same terminal width semantics as regular command output.",
      usage: ["cy test"],
      aliases: [],
      commands: [
        { name: "extra-long-command", description: "This command description is intentionally long enough to wrap onto a continuation line with aligned indentation." },
      ],
      options: [
        { flags: "--long-option <value>", description: "This option description is intentionally long enough to wrap onto a continuation line.", possibleValues: [] },
      ],
      examples: [],
      body: "",
    }, createColors(false));
    assert.ok(maxVisibleLineLength(help) <= 56, help);
    assert.match(help, /\n\s+aligned indentation/);

    const topic = renderCliTopic({
      name: "topic",
      body: [
        "# Topic",
        "",
        "This topic paragraph is intentionally long enough to wrap in the same way as doctor and other shell-oriented command output.",
      ].join("\n"),
    }, createColors(false));
    assert.ok(maxVisibleLineLength(topic) <= 56, topic);
    assert.ok(topic.split(/\r?\n/).length > 2, topic);
    assert.match(topic, /shell-oriented\ncommand output\./);
  } finally {
    if (previousColumns === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = previousColumns;
  }
});

test("cli color detection honors flags and environment", () => {
  assert.equal(parseColorChoice(undefined), "auto");
  assert.equal(parseColorChoice("always"), "always");
  assert.throws(() => parseColorChoice("sometimes"), /Invalid color value/);
  assert.equal(colorEnabled({ choice: "always", env: {}, stream: { isTTY: false } as NodeJS.WriteStream }), true);
  assert.equal(colorEnabled({ choice: "never", env: { FORCE_COLOR: "1" }, stream: { isTTY: true } as NodeJS.WriteStream }), false);
  assert.equal(colorEnabled({ choice: "auto", env: { NO_COLOR: "1" }, stream: { isTTY: true } as NodeJS.WriteStream }), false);
  assert.equal(colorEnabled({ choice: "auto", env: { FORCE_COLOR: "1" }, stream: { isTTY: false } as NodeJS.WriteStream }), true);
  assert.equal(colorEnabled({ choice: "auto", env: { TERM: "dumb" }, stream: { isTTY: true } as NodeJS.WriteStream }), false);
});

test("doctor renderer groups and wraps console output", () => {
  const longWarning = Array.from({ length: 30 }, (_, index) => `word${index}`).join(" ");
  const output = renderHumanOutput({
    command: "doctor",
    positional: [],
    colors: createColors(false),
  }, {
    ok: ["provider: noop", "workspace engine: plain-copy"],
    warnings: [longWarning],
    fixes: [],
    notes: [],
  });

  assert.match(output, /^Doctor ok:\n  - provider: noop\n  - workspace engine: plain-copy/m);
  assert.match(output, /^Warnings:\n  - word0/m);
  assert.ok(output.split("\n").some((line) => /^\s+word\d+/.test(line)), "long warning should wrap to an indented continuation line");
});

test("generic command renderer wraps plain shell output", () => {
  const previousColumns = process.env.COLUMNS;
  process.env.COLUMNS = "52";
  try {
    const output = renderHumanOutput({
      command: "create",
      positional: [],
      colors: createColors(false),
    }, `Created CY-0001: ${Array.from({ length: 20 }, (_, index) => `word${index}`).join(" ")}`);

    assert.ok(maxVisibleLineLength(output) <= 52, output);
    assert.ok(output.split("\n").length > 1, "long command output should wrap");
  } finally {
    if (previousColumns === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = previousColumns;
  }
});

test("cli help describes commands and hub lifecycle", () => {
  const help = spawnSync(nodeBinary(), [cliBinPath(), "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Commands:/);
  assert.match(help.stdout, /create\s+Create a local markdown change/);
  assert.match(help.stdout, /hub\s+Manage the shared UI\/runtime hub/);
  assert.match(help.stdout, /--kanban\s+Open the Kanban browser client/);

  const result = spawnSync(nodeBinary(), [cliBinPath(), "hub", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cy hub start --no-open/);
  assert.match(result.stdout, /cy hub status/);
  assert.match(result.stdout, /cy hub restart/);
  assert.match(result.stdout, /cy hub stop/);
});

test("cli version prints the package version", () => {
  const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };
  const command = spawnSync(nodeBinary(), [cliBinPath(), "version"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const flag = spawnSync(nodeBinary(), [cliBinPath(), "--version"], {
    cwd: os.tmpdir(),
    encoding: "utf8",
  });

  assert.equal(command.status, 0, command.stderr);
  assert.equal(flag.status, 0, flag.stderr);
  assert.equal(command.stdout.trim(), packageJson.version);
  assert.equal(flag.stdout.trim(), packageJson.version);
});

test("cli unknown command suggests matching commands with descriptions", () => {
  const closeMatch = spawnSync(nodeBinary(), [cliBinPath(), "statsu"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.notEqual(closeMatch.status, 0);
  assert.match(closeMatch.stderr, /Unknown command: statsu/);
  assert.match(closeMatch.stderr, /tip: similar commands exist: 'cy status'/);
  assert.match(closeMatch.stderr, /Matching commands:\n  cy status\s+Print one change summary/);
  assert.match(closeMatch.stderr, /Run cy help status for details/);
  assert.doesNotMatch(closeMatch.stderr, /cy create\s+Create a local markdown change/);
  assert.doesNotMatch(closeMatch.stderr, /Changeyard is a markdown-first local change workflow manager/);

  const prefixMatch = spawnSync(nodeBinary(), [cliBinPath(), "stat"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.notEqual(prefixMatch.status, 0);
  assert.match(prefixMatch.stderr, /tip: similar commands exist: 'cy status'/);
  assert.match(prefixMatch.stderr, /cy status\s+Print one change summary/);

  const noCloseMatch = spawnSync(nodeBinary(), [cliBinPath(), "frobnicate"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.notEqual(noCloseMatch.status, 0);
  assert.match(noCloseMatch.stderr, /Unknown command: frobnicate/);
  assert.match(noCloseMatch.stderr, /no similar commands were found/);
  assert.match(noCloseMatch.stderr, /cy --help/);
  assert.doesNotMatch(noCloseMatch.stderr, /Available commands:/);
});

test("cli unknown command suggestions are included in json errors", () => {
  const result = spawnSync(nodeBinary(), [cliBinPath(), "--json", "statsu"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stderr) as { ok: boolean; error: { message: string } };
  assert.equal(payload.ok, false);
  assert.match(payload.error.message, /Unknown command: statsu/);
  assert.match(payload.error.message, /tip: similar commands exist: 'cy status'/);
  assert.match(payload.error.message, /Matching commands:\n  cy status\s+Print one change summary/);
  assert.doesNotMatch(payload.error.message, /\u001b\[[0-9;]*m/);
});

test("cli guidance suggests help topics and stays json-safe", () => {
  const result = spawnSync(nodeBinary(), [cliBinPath(), "--json", "help", "-k", "hook"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stderr) as { ok: boolean; error: { message: string } };
  assert.equal(payload.ok, false);
  assert.match(payload.error.message, /Invalid help topic: hook/);
  assert.match(payload.error.message, /tip: similar values exist: 'hooks'/);
  assert.match(payload.error.message, /Available values:/);
  assert.match(payload.error.message, /color, config, hooks, planning, tools, workflow/);
  assert.doesNotMatch(payload.error.message, /\u001b\[[0-9;]*m/);
});

test("cli nested command errors suggest matching subcommands", () => {
  const result = spawnSync(nodeBinary(), [cliBinPath(), "workspace", "stats", "001"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown cy workspace command: stats/);
  assert.match(result.stderr, /tip: similar commands exist: 'cy workspace status'/);
  assert.match(result.stderr, /Available commands:/);
  assert.match(result.stderr, /cy workspace status\s+Show one workspace status/);
  assert.match(result.stderr, /Run cy workspace --help for details/);
});

test("cli finite option errors suggest valid values", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Guided finite values" }, repo);

    const gate = spawnSync(nodeBinary(), [cliBinPath(), "validate", "001", "--gate", "starts"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.notEqual(gate.status, 0);
    assert.match(gate.stderr, /Invalid --gate: starts/);
    assert.match(gate.stderr, /tip: similar values exist: 'start'/);
    assert.match(gate.stderr, /Available values:/);
    assert.match(gate.stderr, /document, sync, start, complete/);

    const format = spawnSync(nodeBinary(), [cliBinPath(), "plan", "export", "001", "--format", "openspecs"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.notEqual(format.status, 0);
    assert.match(format.stderr, /Invalid --format: openspecs/);
    assert.match(format.stderr, /tip: similar values exist: 'openspec'/);

    const event = spawnSync(nodeBinary(), [cliBinPath(), "hooks", "ingest", "--event", "review", "--task-id", "001"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.notEqual(event.status, 0);
    assert.match(event.stderr, /Invalid --event: review/);
    assert.match(event.stderr, /to_review, to_in_progress, activity/);
  } finally {
    cleanup(repo);
  }
});

test("cli invalid review decision is rejected before mutation", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Guided review decision" }, repo);
    runReviewStart("CY-0001", repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-guided-review-decision.md");
    const reviewPath = path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md");
    const beforeChange = readFileSync(changePath, "utf8");
    const beforeReview = readFileSync(reviewPath, "utf8");

    const result = spawnSync(nodeBinary(), [cliBinPath(), "review", "complete", "001", "--decision", "approvee"], {
      cwd: repo,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid --decision: approvee/);
    assert.match(result.stderr, /tip: similar values exist: 'approve'/);
    assert.equal(readFileSync(changePath, "utf8"), beforeChange);
    assert.equal(readFileSync(reviewPath, "utf8"), beforeReview);
  } finally {
    cleanup(repo);
  }
});

test("cli task id errors include usage and list guidance", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Guided task ids" }, repo);

    const missing = spawnSync(nodeBinary(), [cliBinPath(), "status"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing task id/);
    assert.match(missing.stderr, /Usage: cy status <id>/);
    assert.match(missing.stderr, /cy list/);

    const unknown = spawnSync(nodeBinary(), [cliBinPath(), "status", "999"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /Change not found: 999/);
    assert.match(unknown.stderr, /cy list/);
    assert.match(unknown.stderr, /full or partial task id/);
  } finally {
    cleanup(repo);
  }
});

test("cli unknown command suggestions honor forced color", () => {
  const result = spawnSync(nodeBinary(), [cliBinPath(), "--color", "always", "stat"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\u001b\[[0-9;]*m/);
  assert.match(result.stderr, /tip:/);
  assert.match(result.stderr, /cy status/);
});

test("cli help supports nested docs, topics, and forced color", () => {
  const initHelpCommand = spawnSync(nodeBinary(), [cliBinPath(), "help", "init"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(initHelpCommand.status, 0, initHelpCommand.stderr);
  assert.match(initHelpCommand.stdout, /cy init \[--dry-run\]/);
  assert.doesNotMatch(initHelpCommand.stdout, /Commands:/);

  const initHelpFlag = spawnSync(nodeBinary(), [cliBinPath(), "init", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(initHelpFlag.status, 0, initHelpFlag.stderr);
  assert.match(initHelpFlag.stdout, /cy init \[--dry-run\]/);
  assert.doesNotMatch(initHelpFlag.stdout, /Commands:/);

  const nested = spawnSync(nodeBinary(), [cliBinPath(), "hooks", "ingest", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(nested.status, 0, nested.stderr);
  assert.match(nested.stdout, /cy hooks ingest --event <event>/);
  assert.match(nested.stdout, /possible values: to_review, to_in_progress, activity/);

  const sessionAttach = spawnSync(nodeBinary(), [cliBinPath(), "session", "attach", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(sessionAttach.status, 0, sessionAttach.stderr);
  assert.match(sessionAttach.stdout, /cy session attach --task-id <id> --provider <name>/);
  assert.match(sessionAttach.stdout, /--workspace-path <path>/);

  const topic = spawnSync(nodeBinary(), [cliBinPath(), "help", "-k", "hooks"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(topic.status, 0, topic.stderr);
  assert.match(topic.stdout, /Runtime hooks connect terminal agents/);

  const colored = spawnSync(nodeBinary(), [cliBinPath(), "--color", "always", "help", "hooks"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(colored.status, 0, colored.stderr);
  assert.match(colored.stdout, /\u001b\[[0-9;]*m/);

  const plain = spawnSync(nodeBinary(), [cliBinPath(), "--color", "never", "help", "hooks"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(plain.status, 0, plain.stderr);
  assert.doesNotMatch(plain.stdout, /\u001b\[[0-9;]*m/);
});

test("session attach posts external session metadata to the runtime", async () => {
  const previousFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: unknown = null;
  let capturedContentType = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    capturedContentType = new Headers(init?.headers).get("content-type") ?? "";
    return new Response(JSON.stringify({
      result: {
        data: {
          json: {
            ok: true,
            summary: { taskId: "task-1" },
            workspaceId: "workspace-1",
            workspacePath: "/tmp/repo",
          },
        },
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const response = await attachSession(["attach"], {
      "task-id": "task-1",
      provider: "codex",
      "session-id": "abc",
      "workspace-path": "/tmp/repo",
      source: "cli",
    });

    assert.equal(response.ok, true);
    assert.equal(capturedUrl, "http://127.0.0.1:3484/api/trpc/session.attach");
    assert.equal(capturedContentType, "application/json");
    assert.deepEqual(capturedBody, {
      taskId: "task-1",
      provider: "codex",
      sessionId: "abc",
      workspacePath: "/tmp/repo",
      source: "cli",
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("hooks ingest posts runtime metadata directly to the runtime", async () => {
  const previousFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: unknown = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({
      result: {
        data: {
          ok: true,
          summary: { taskId: "task-1" },
        },
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    await runHooks(["ingest"], {
      event: "activity",
      "task-id": "task-1",
      "workspace-path": "/tmp/repo",
      "activity-text": "running command",
      source: "test",
    });

    assert.equal(capturedUrl, "http://127.0.0.1:3484/api/trpc/hooks.ingest");
    assert.deepEqual(capturedBody, {
      taskId: "task-1",
      workspacePath: "/tmp/repo",
      event: "activity",
      metadata: {
        activityText: "running command",
        source: "test",
      },
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("session attach validates required flags before posting", async () => {
  await assert.rejects(
    () => attachSession(["attach"], { provider: "codex", "workspace-path": "/tmp/repo" }),
    /Missing required option: --task-id <id>/,
  );
  await assert.rejects(
    () => attachSession(["attach"], { "task-id": "task-1", "workspace-path": "/tmp/repo" }),
    /Missing required option: --provider <name>/,
  );
});

test("cli dashboard command is removed", () => {
  const result = spawnSync(nodeBinary(), [cliBinPath(), "dashboard"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cy dashboard was removed/);
  assert.doesNotMatch(result.stderr, /Available commands:/);
});

test("create can generate an openspec-lite planned change", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const output = runCreate({ template: "feature", title: "Planned feature change", planning: "openspec-lite" }, repo);
    assert.match(output, /with openspec-lite planning/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-planned-feature-change.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.deepEqual(parsed.frontmatter.planning, {
      model: "openspec-lite",
      storage: "inline",
      schema: "changeyard-openspec-lite@1",
      strictness: "normal",
      phase: "draft",
      gates: {
        proposal: "pending",
        specDeltas: "pending",
        design: "pending",
        tasks: "pending",
        verification: "pending",
        strictClarifications: "skipped",
        strictChecklist: "skipped",
        strictAnalysis: "skipped",
      },
    });
    assert.match(parsed.body, /<!-- cy:proposal:start -->/);
    assert.match(parsed.body, /<!-- cy:spec-deltas:start -->/);
    assert.match(parsed.body, /<!-- cy:design:start -->/);
    assert.match(parsed.body, /<!-- cy:tasks:start -->/);
    assert.match(parsed.body, /<!-- cy:verification:start -->/);
    assert.equal(runValidate("CY-0001", repo), "Valid change: .changeyard/changes/CY-0001-planned-feature-change.md");
  } finally {
    cleanup(repo);
  }
});

test("create can generate a strict planned change", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Strict planned change", planning: "openspec-lite", strict: true }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-strict-planned-change.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal((parsed.frontmatter.planning as { strictness?: string }).strictness, "strict");
    assert.match(parsed.body, /<!-- cy:clarifications:start -->/);
    assert.match(parsed.body, /<!-- cy:requirements-checklist:start -->/);
    assert.match(parsed.body, /<!-- cy:analysis:start -->/);
    assert.equal(runValidate("CY-0001", repo), "Valid change: .changeyard/changes/CY-0001-strict-planned-change.md");
  } finally {
    cleanup(repo);
  }
});

test("create dry-run reports planned section creation", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const output = runCreate({
      template: "feature",
      title: "Dry-run planned change",
      planning: "openspec-lite",
      strict: true,
    }, repo, { dryRun: true });
    assert.match(output, /Dry-run: would create CY-0001/);
    assert.match(output, /with openspec-lite strict planning/);
  } finally {
    cleanup(repo);
  }
});

test("plan strict enable adds missing strict sections without duplicating markers", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Enable strict planning", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-enable-strict-planning.md");
    const before = readFileSync(changePath, "utf8");
    assert.doesNotMatch(before, /<!-- cy:clarifications:start -->/);

    assert.equal(runPlanStrictEnable("CY-0001", repo), "Enabled strict planning for CY-0001");
    const enabled = readFileSync(changePath, "utf8");
    assert.equal((enabled.match(/<!-- cy:clarifications:start -->/g) ?? []).length, 1);
    assert.equal((enabled.match(/<!-- cy:requirements-checklist:start -->/g) ?? []).length, 1);
    assert.equal((enabled.match(/<!-- cy:analysis:start -->/g) ?? []).length, 1);
    assert.match(runStatus("CY-0001", repo), /planning: openspec-lite strict/);
    assert.match(runPlanStatus("CY-0001", repo), /planning: openspec-lite strict/);

    assert.equal(runPlanStrictEnable("CY-0001", repo), "Strict planning already enabled for CY-0001");
    const enabledAgain = readFileSync(changePath, "utf8");
    assert.equal((enabledAgain.match(/<!-- cy:clarifications:start -->/g) ?? []).length, 1);
    assert.equal((enabledAgain.match(/<!-- cy:requirements-checklist:start -->/g) ?? []).length, 1);
    assert.equal((enabledAgain.match(/<!-- cy:analysis:start -->/g) ?? []).length, 1);
  } finally {
    cleanup(repo);
  }
});

test("plan strict disable relaxes strict lifecycle gates without deleting strict sections", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Disable strict planning", planning: "openspec-lite", strict: true }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-disable-strict-planning.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nFilled proposal.\n");
    updatePlannedSection(changePath, "spec-deltas", "# Specification Deltas\n\nNo behavior change\n");
    updatePlannedSection(changePath, "design", "# Design\n\n## Technical Approach\n\nFilled design.\n");
    updatePlannedSection(changePath, "tasks", "# Tasks\n\n- [ ] Ready to start the work\n");

    assert.throws(
      () => runStart("CY-0001", repo),
      /Update <!-- cy:clarifications:start --> section: clarifications must be completed or explicitly state `No clarifications required` before start\/complete\./,
    );

    assert.equal(runPlanStrictDisable("CY-0001", repo), "Disabled strict planning for CY-0001");
    const disabled = readFileSync(changePath, "utf8");
    assert.match(disabled, /<!-- cy:clarifications:start -->/);
    assert.match(runStatus("CY-0001", repo), /planning: openspec-lite normal/);
    assert.match(runStart("CY-0001", repo), /Started CY-0001 in \.changeyard\/workspaces\/CY-0001\/repo/);
  } finally {
    cleanup(repo);
  }
});

test("validate reports missing sections and invalid status", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-broken.md");
    writeFileSync(changePath, `---\nid: CY-0001\ntitle: Broken\ntype: agent-task\nstatus: nope\npriority: medium\nlabels:\n  - agent-ready\n---\n\n# Summary\n\nOnly summary.\n`);
    const result = validateChangeFile(changePath, path.join(repo, ".changeyard"));
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("Unknown status value: nope"));
    assert.ok(result.errors.includes("Missing required section: Motivation"));
  } finally {
    cleanup(repo);
  }
});

test("validate reports malformed planning markers for planned changes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Broken planned markers", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-broken-planned-markers.md");
    writeFileSync(changePath, readFileSync(changePath, "utf8").replace("<!-- cy:design:end -->", ""));
    const result = validateChangeFile(changePath, path.join(repo, ".changeyard"));
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("Missing end marker for planning section: design"));
  } finally {
    cleanup(repo);
  }
});

test("sync with noop updates local change status and remote provider", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Sync noop change" }, repo);
    const output = runSync("CY-0001", repo);
    assert.match(output, /Synced CY-0001 with noop/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-sync-noop-change.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "synced");
    assert.deepEqual(parsed.frontmatter.remote, {
      provider: "noop",
      issueNumber: null,
      issueUrl: null,
      pullRequestNumber: null,
      pullRequestUrl: null,
    });
  } finally {
    cleanup(repo);
  }
});

test("planned sync fails until proposal is filled", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Planned sync gate", planning: "openspec-lite" }, repo);
    assert.throws(
      () => runSync("CY-0001", repo),
      /Update <!-- cy:proposal:start --> section: proposal must be filled before sync\/start\/complete\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("sync with local-folder writes a remote-like issue and provider cache", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}
`);
    runCreate({ template: "feature", title: "Add local provider" }, repo);
    const output = runSync("CY-0001", repo);
    assert.match(output, /Synced CY-0001 with local-folder -> file:\/\//);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-add-local-provider.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "synced");
    assert.deepEqual(parsed.frontmatter.remote, {
      provider: "local-folder",
      issueNumber: 1,
      issueUrl: pathToFileUrl(path.join(repo, ".changeyard", "cache", "local-folder", "issues", "0001-CY-0001.md")),
      pullRequestNumber: null,
      pullRequestUrl: null,
    });

    const issue = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "issues", "0001-CY-0001.md"), "utf8");
    assert.match(issue, /sourceChange: CY-0001/);
    assert.match(issue, /status: synced/);
    assert.match(issue, /# Summary/);
    const second = runSync("CY-0001", repo);
    assert.match(second, /Synced CY-0001 with local-folder/);
    const state = readFileSync(path.join(repo, ".changeyard", "cache", "provider-state.json"), "utf8");
    assert.match(state, /"CY-0001": 1/);
    assert.doesNotMatch(state, /"nextIssueNumber": 3/);
  } finally {
    cleanup(repo);
  }
});

test("start requires sync for non-noop providers and lets noop satisfy sync locally", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}\n`);
    runCreate({ template: "agent-task", title: "Start requires sync" }, repo);
    assert.throws(
      () => runStart("CY-0001", repo),
      /must be synced before start when provider local-folder is configured/,
    );
    runSync("CY-0001", repo);
    assert.match(runStart("CY-0001", repo), /Started CY-0001/);
  } finally {
    cleanup(repo);
  }

  const noopRepo = tempRepo();
  try {
    runInit(noopRepo);
    runCreate({ template: "agent-task", title: "Noop start sync" }, noopRepo);
    assert.match(runStart("CY-0001", noopRepo), /Sync: noop provider satisfied locally/);
    const changePath = path.join(noopRepo, ".changeyard", "changes", "CY-0001-noop-start-sync.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(asRecordForTest(parsed.frontmatter.remote).provider, "noop");
  } finally {
    cleanup(noopRepo);
  }
});

test("planned local-folder sync writes a projected planning summary while keeping local markdown canonical", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}\n`);
    runCreate({ template: "feature", title: "Projected planning sync", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-projected-planning-sync.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nProjected proposal.\n");
    const localBeforeSync = readFileSync(changePath, "utf8");

    runSync("CY-0001", repo);

    const issue = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "issues", "0001-CY-0001.md"), "utf8");
    assert.match(issue, /# Planning Summary/);
    assert.match(issue, /Canonical local file: `.changeyard\/changes\/CY-0001-projected-planning-sync.md`/);
    assert.match(issue, /The local markdown change remains the canonical source of truth\./);
    assert.equal(readFileSync(changePath, "utf8").includes("# Planning Summary"), false);
    assert.match(readFileSync(changePath, "utf8"), /Projected proposal\./);
    assert.equal(localBeforeSync.includes("# Planning Summary"), false);
  } finally {
    cleanup(repo);
  }
});

test("quick sync renders workflow metadata without planned projections", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}\n`);
    runCreate({ template: "quick", title: "Quick sync workflow metadata" }, repo);

    const output = runSync("CY-0001", repo);
    assert.match(output, /Workflow: quick \| Planning: none \| Risk: low/);

    const issue = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "issues", "0001-CY-0001.md"), "utf8");
    assert.match(issue, /# Workflow Summary/);
    assert.match(issue, /- Mode: quick/);
    assert.match(issue, /- Planning: none/);
    assert.match(issue, /- Risk: low/);
    assert.match(issue, /Canonical local file: `\.changeyard\/changes\/CY-0001-quick-sync-workflow-metadata\.md`/);
    assert.doesNotMatch(issue, /# Planning Summary/);
  } finally {
    cleanup(repo);
  }
});

test("start creates a plain-copy workspace and verify enforces the workspace directory", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Start workspace" }, repo);
    const output = runStart("CY-0001", repo);
    assert.match(output, /Started CY-0001 in \.changeyard\/workspaces\/CY-0001\/repo/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-start-workspace.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "in_progress");
    assert.deepEqual(parsed.frontmatter.workspace, {
      engine: "plain-copy",
      name: "cy-CY-0001",
      path: ".changeyard/workspaces/CY-0001/repo",
    });

    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const metadata = readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "metadata.json"), "utf8");
    assert.match(metadata, /"engine": "plain-copy"/);
    assert.match(readFileSync(path.join(workspacePath, ".changeyard-workspace.json"), "utf8"), /metadataPath/);
    assert.match(runVerify("CY-0001", workspacePath), /Verified CY-0001 in \.changeyard\/workspaces\/CY-0001\/repo\nNext: implement, update Completion Notes, then cy complete CY-0001 --no-pr/);
    const validateFromWorkspace = spawnSync(nodeBinary(), [cliBinPath(), "validate", "CY-0001"], { cwd: workspacePath, encoding: "utf8" });
    assert.equal(validateFromWorkspace.status, 0, validateFromWorkspace.stderr || validateFromWorkspace.stdout);
    assert.throws(() => runVerify("CY-0001", repo), /not inside a Changeyard workspace/);
  } finally {
    cleanup(repo);
  }
});

test("next maps lifecycle state to actionable commands", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Next action map" }, repo);
    assert.equal(getNextAction("CY-0001", repo).nextCommand, "cy sync CY-0001");
    assert.match(runNext("CY-0001", repo), /Next: cy sync CY-0001/);

    runSync("CY-0001", repo);
    assert.equal(getNextAction("CY-0001", repo).nextCommand, "cy start CY-0001");

    runStart("CY-0001", repo);
    const inProgress = getNextAction("CY-0001", repo);
    assert.equal(inProgress.nextKind, "complete");
    assert.match(inProgress.nextCommand, /cy complete CY-0001 --no-pr/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-next-action-map.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    writeFileSync(changePath, writeFrontmatter({ ...parsed.frontmatter, status: "ready_for_pr" }, parsed.body));
    assert.equal(getNextAction("CY-0001", repo).nextCommand, "cy land CY-0001");
  } finally {
    cleanup(repo);
  }
});

test("next reports landing confirmation policy by workflow mode", () => {
  const repo = tempRepo();
  try {
    runInit(repo);

    const markReadyForPr = (changePath: string): void => {
      const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
      writeFileSync(changePath, writeFrontmatter({ ...parsed.frontmatter, status: "ready_for_pr" }, parsed.body));
    };

    runCreate({ template: "agent-task", title: "Planned landing", planning: "openspec-lite", strict: true }, repo);
    const plannedPath = path.join(repo, ".changeyard", "changes", "CY-0001-planned-landing.md");
    markReadyForPr(plannedPath);
    const planned = getNextAction("CY-0001", repo);
    assert.equal(planned.nextCommand, "cy land CY-0001");
    assert.equal(planned.workflowMode, "planned");
    assert.equal(planned.landingConfirmation?.required, true);
    assert.match(planned.landingConfirmation?.reason ?? "", /Planned changes require explicit user confirmation/);
    const plannedOutput = runNext("CY-0001", repo);
    assert.match(plannedOutput, /workflowMode: planned/);
    assert.match(plannedOutput, /landingConfirmationRequired: true/);

    runCreate({ template: "quick", title: "Quick landing" }, repo);
    const quickPath = path.join(repo, ".changeyard", "changes", "CY-0002-quick-landing.md");
    markReadyForPr(quickPath);
    const quick = getNextAction("CY-0002", repo);
    assert.equal(quick.nextCommand, "cy land CY-0002");
    assert.equal(quick.workflowMode, "quick");
    assert.equal(quick.landingConfirmation?.required, false);
    assert.match(quick.landingConfirmation?.reason ?? "", /Quick low-risk changes may land after checks/);
    const quickOutput = runNext("CY-0002", repo);
    assert.match(quickOutput, /workflowMode: quick/);
    assert.match(quickOutput, /landingConfirmationRequired: false/);

    runCreate({ template: "feature", title: "Legacy landing" }, repo);
    const legacyPath = path.join(repo, ".changeyard", "changes", "CY-0003-legacy-landing.md");
    markReadyForPr(legacyPath);
    const legacy = getNextAction("CY-0003", repo);
    assert.equal(legacy.nextCommand, "cy land CY-0003");
    assert.equal(legacy.workflowMode, "lite-no-planning");
    assert.equal(legacy.landingConfirmation?.required, true);
    assert.match(legacy.landingConfirmation?.reason ?? "", /Legacy unplanned changes require explicit user confirmation/);
  } finally {
    cleanup(repo);
  }
});

test("validate complete gate accepts fully checked acceptance criteria", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Complete gate validation" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-complete-gate-validation.md");
    updateSection(changePath, "Acceptance Criteria", "- [x] Completion gate can validate checked tasks");
    assert.throws(
      () => runValidate("CY-0001", repo),
      /run cy validate <id> --gate complete or cy complete <id>/,
    );
    assert.match(runValidate("CY-0001", repo, { gate: "complete" }), /Valid change/);
  } finally {
    cleanup(repo);
  }
});

test("validation gate failures include recovery guidance", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Recover validation", planning: "openspec-lite", strict: true }, repo);

    assert.throws(
      () => runValidate("CY-0001", repo, { gate: "start" }),
      /Update <!-- cy:proposal:start --> section:[\s\S]*Recovery:[\s\S]*cy plan prompt CY-0001 proposal[\s\S]*cy validate CY-0001 --gate start/,
    );
  } finally {
    cleanup(repo);
  }
});

test("workspace status and delete protect dirty unlanded work", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Delete dirty workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "dirty.txt"), "dirty\n");

    const status = getWorkspaceStatus("CY-0001", repo);
    assert.equal(status.dirty, true);
    assert.equal(status.nextCommand, "cd .changeyard/workspaces/CY-0001/repo && cy verify CY-0001");
    assert.throws(() => deleteWorkspace("CY-0001", {}, repo), /dirty unlanded work/);
    assert.match(deleteWorkspace("CY-0001", { force: true }, repo), /Deleted workspace CY-0001/);
    assert.equal(existsSync(path.join(repo, ".changeyard", "workspaces", "CY-0001")), false);
  } finally {
    cleanup(repo);
  }
});

test("workspace status reports merged cleanup separately from land blockers", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Merged cleanup" }, repo);
    runStart("CY-0001", repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-merged-cleanup.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    writeFileSync(changePath, writeFrontmatter({ ...parsed.frontmatter, status: "merged" }, parsed.body));

    const status = getWorkspaceStatus("CY-0001", repo);
    assert.equal(status.cleanupNeeded, true);
    assert.deepEqual(status.landBlockers, []);
    assert.match(deleteWorkspace("CY-0001", {}, repo), /Deleted workspace CY-0001/);
  } finally {
    cleanup(repo);
  }
});

test("cy launcher preserves caller cwd for verify inside a workspace", () => {
  const repo = tempRepo();
  const launcher = path.resolve(process.cwd(), "scripts", "cy.mjs");
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Launcher verify cwd" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const result = spawnSync(nodeBinary(), [launcher, "verify", "CY-0001"], {
      cwd: workspacePath,
      encoding: "utf8",
      env: { ...process.env, CHANGEYARD_USE_DIST: "1" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Verified CY-0001/);
  } finally {
    cleanup(repo);
  }
});

test("quick start succeeds without planned sections", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "quick", title: "Quick start workspace" }, repo);
    assert.match(runStart("CY-0001", repo), /Started CY-0001 in \.changeyard\/workspaces\/CY-0001\/repo/);
    const parsed = parseFrontmatter(readFileSync(path.join(repo, ".changeyard", "changes", "CY-0001-quick-start-workspace.md"), "utf8"));
    assert.equal(parsed.frontmatter.status, "in_progress");
  } finally {
    cleanup(repo);
  }
});

test("quick start blocks when config disables quick changes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"planning":{"allowQuickChanges":false}}\n`);
    runCreate({ template: "quick", title: "Disabled quick start" }, repo);
    assert.throws(
      () => runStart("CY-0001", repo),
      /Quick changes are disabled by config: set planning\.allowQuickChanges to true or convert this change to planned mode\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("planned start fails when design and tasks are not ready", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Planned start gate", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-planned-start-gate.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nFilled proposal.\n");
    updatePlannedSection(changePath, "spec-deltas", "# Specification Deltas\n\nNo behavior change\n");
    updatePlannedSection(changePath, "tasks", "# Tasks\n\nNo checkbox tasks yet.\n");
    assert.throws(
      () => runStart("CY-0001", repo),
      /Update <!-- cy:design:start --> section: design must be filled before start\/complete\.\nUpdate <!-- cy:tasks:start --> section: tasks must include at least one checkbox item before start\/complete\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("strict planned start fails when checklist items remain unchecked", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Strict start gate", planning: "openspec-lite", strict: true }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-strict-start-gate.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nFilled proposal.\n");
    updatePlannedSection(changePath, "spec-deltas", "# Specification Deltas\n\nNo behavior change\n");
    updatePlannedSection(changePath, "design", "# Design\n\n## Technical Approach\n\nFilled design.\n");
    updatePlannedSection(changePath, "clarifications", "# Clarifications\n\nNo clarifications required.\n");
    updatePlannedSection(changePath, "analysis", "# Consistency Analysis\n\n## Findings\n\n| ID | Severity | Summary | Recommendation | Status |\n|----|----------|---------|----------------|--------|\n\n## Gate Result\n\nPass\n");
    assert.throws(
      () => runStart("CY-0001", repo),
      /Update <!-- cy:requirements-checklist:start --> section: requirements checklist cannot contain unchecked items unless marked `ACCEPTED EXCEPTION:` before start\/complete\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("hydrate copies allowlisted files and skips denied secrets", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    writeFileSync(path.join(repo, ".env"), "SECRET=1\n");
    runCreate({ template: "agent-task", title: "Hydrate workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    assert.equal(runHydrate("CY-0001", workspacePath), "Hydrated CY-0001: copied 1, skipped 1");
    assert.equal(readFileSync(path.join(workspacePath, ".env.example"), "utf8"), "SAFE=1\n");
    assert.throws(() => readFileSync(path.join(workspacePath, ".env"), "utf8"));
  } finally {
    cleanup(repo);
  }
});

test("complete runs checks and updates ready_for_pr", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"checks":{"standard":["node -v"]}}\n`);
    runCreate({ template: "agent-task", title: "Complete workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-complete-workspace.md");
    updateSection(changePath, "Completion Notes", "Implemented workspace changes. Checks ran: node -v. No remaining risks.");
    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /Completed CY-0001: 1 checks passed/);
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "ready_for_pr");
    assert.match(readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "logs", "checks.log"), "utf8"), /node -v/);
  } finally {
    cleanup(repo);
  }
});

test("check record preserves manual evidence and complete uses it when no checks are configured", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Manual check evidence" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-manual-check-evidence.md");
    updateSection(changePath, "Acceptance Criteria", "- [x] Manual evidence is recorded");
    updateSection(changePath, "Completion Notes", "Implemented workspace changes. Checks ran: pnpm test.");

    assert.match(runCheckRecord("CY-0001", {
      command: "pnpm test",
      status: "passed",
      exitCode: 0,
    }, repo, workspacePath), /Recorded passed check/);
    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /1 recorded checks passed/);
    const log = readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "logs", "checks.log"), "utf8");
    assert.match(log, /\$ pnpm test/);
    assert.match(log, /cy-check-record:/);

    const syncOutput = runSync("CY-0001", repo);
    assert.match(syncOutput, /Synced CY-0001 with noop/);
    assert.equal(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.status, "ready_for_pr");
  } finally {
    cleanup(repo);
  }
});

test("quick complete defaults to the minimal profile and records quick completion notes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"checks":{"minimal":["node -v"],"standard":["node -p process.version"]}}\n`);
    runCreate({ template: "quick", title: "Quick complete minimal profile" }, repo);
    runStart("CY-0001", repo);

    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-quick-complete-minimal-profile.md");
    updateSection(changePath, "Acceptance Criteria", "- [x] Updated the targeted wording\n- [ ] Deferred: screenshot refresh handled separately");
    updateSection(changePath, "Completion Notes", "Updated the targeted wording. Checks ran: node -v. Remaining risk is low.");

    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /Completed CY-0001: 1 checks passed; status ready_for_pr/);
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal((parsed.frontmatter.checks as { profile?: string }).profile, "minimal");

    const log = readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "logs", "checks.log"), "utf8");
    assert.match(log, /node -v/);
    assert.doesNotMatch(log, /node -p process\.version/);
  } finally {
    cleanup(repo);
  }
});

test("quick complete fails when acceptance criteria remain unchecked", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"checks":{"minimal":["node -v"]}}\n`);
    runCreate({ template: "quick", title: "Quick complete blocked AC" }, repo);
    runStart("CY-0001", repo);

    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-quick-complete-blocked-ac.md");
    updateSection(changePath, "Completion Notes", "Updated the targeted wording. Checks ran: node -v.");

    assert.throws(
      () => runComplete("CY-0001", { noPr: true }, workspacePath),
      /Acceptance Criteria must be completed or marked `Deferred: <reason>` before quick completion\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("quick complete fails when completion notes omit check context", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"checks":{"minimal":["node -v"]}}\n`);
    runCreate({ template: "quick", title: "Quick complete notes gate" }, repo);
    runStart("CY-0001", repo);

    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-quick-complete-notes-gate.md");
    updateSection(changePath, "Acceptance Criteria", "- [x] Updated the targeted wording");
    updateSection(changePath, "Completion Notes", "Updated the targeted wording and kept the risk low.");

    assert.throws(
      () => runComplete("CY-0001", { noPr: true }, workspacePath),
      /Completion Notes must mention checks run or explain why checks were not run before quick completion\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("planned complete fails when tasks remain incomplete", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"checks":{"standard":["node -v"]}}\n`);
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    runCreate({ template: "agent-task", title: "Planned complete gate", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-planned-complete-gate.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nFilled proposal.\n");
    updatePlannedSection(changePath, "spec-deltas", "# Specification Deltas\n\nNo behavior change\n");
    updatePlannedSection(changePath, "design", "# Design\n\n## Technical Approach\n\nFilled design.\n");
    updatePlannedSection(changePath, "verification", "# Verification\n\n## Result\n\nManual verification complete.\n");
    updateSection(changePath, "Completion Notes", "Completed the planned work. Checks ran: node -v.");
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    assert.throws(
      () => runComplete("CY-0001", { noPr: true }, workspacePath),
      /Update <!-- cy:tasks:start --> section: all tasks must be completed or marked `Deferred: <reason>` before complete\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("planned complete succeeds when tasks and verification are reconciled", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"checks":{"standard":["node -v"]}}\n`);
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    runCreate({ template: "agent-task", title: "Planned complete success", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-planned-complete-success.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nFilled proposal.\n");
    updatePlannedSection(changePath, "spec-deltas", "# Specification Deltas\n\nNo behavior change\n");
    updatePlannedSection(changePath, "design", "# Design\n\n## Technical Approach\n\nFilled design.\n");
    updatePlannedSection(changePath, "tasks", "# Tasks\n\n- [x] Planning complete\n- [x] Implementation complete\n- [ ] Deferred: follow-up polish handled separately\n");
    updatePlannedSection(changePath, "verification", "# Verification\n\n## Result\n\nManual verification complete.\n");
    updateSection(changePath, "Completion Notes", "Completed the planned work. Checks ran: node -v.");
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /Completed CY-0001: 1 checks passed; status ready_for_pr/);
  } finally {
    cleanup(repo);
  }
});

test("complete can create a local-folder pull request when PRs are enabled", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"},"checks":{"standard":["node -v"]}}
`);
    runCreate({ template: "agent-task", title: "Open local PR" }, repo);
    runSync("CY-0001", repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-open-local-pr.md");
    updateSection(changePath, "Completion Notes", "Implemented PR creation. Checks ran: node -v. No remaining risks.");
    assert.match(runComplete("CY-0001", {}, workspacePath), /status pr_open/);
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "pr_open");
    const prRoot = path.join(repo, ".changeyard", "cache", "local-folder", "pull-requests");
    const prFile = readdirSync(prRoot).find((entry) => entry.endsWith("-CY-0001.md"));
    assert.ok(prFile);
    const pr = readFileSync(path.join(prRoot, prFile), "utf8");
    assert.match(pr, /draft: true/);
    assert.match(pr, /base: main/);
  } finally {
    cleanup(repo);
  }
});

test("doctor reports configured provider and recover repairs workspace marker and change file", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Recover workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const workspaceChangePath = path.join(workspacePath, ".changeyard", "changes", "CY-0001-recover-workspace.md");
    rmSync(path.join(workspacePath, ".changeyard-workspace.json"), { force: true });
    rmSync(path.dirname(workspaceChangePath), { recursive: true, force: true });
    assert.match(runDoctor(repo), /provider: noop/);
    assert.deepEqual(doctorReport(repo).warnings, ["CY-0001: missing workspace marker; run cy recover CY-0001"]);
    assert.match(runRecover("CY-0001", repo), /Repaired CY-0001/);
    assert.deepEqual(doctorReport(repo).warnings, []);
    assert.match(readFileSync(path.join(workspacePath, ".changeyard-workspace.json"), "utf8"), /metadataPath/);
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "in_progress");
    assert.match(runRepair("CY-0001", { workspace: true }, repo), /already repairable/);
  } finally {
    cleanup(repo);
  }
});

test("recover can repair a broken workspace when launched from inside it", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Recover from workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const markerPath = path.join(workspacePath, ".changeyard-workspace.json");
    writeFileSync(markerPath, `${JSON.stringify({ changeId: "CY-9999", metadataPath: path.join(repo, ".changeyard", "workspaces", "CY-9999", "metadata.json") }, null, 2)}\n`);

    assert.match(runRecover("CY-0001", workspacePath, {}, workspacePath), /Repaired CY-0001/);
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { changeId: string; metadataPath: string };
    assert.equal(marker.changeId, "CY-0001");
    assert.equal(marker.metadataPath, path.join(repo, ".changeyard", "workspaces", "CY-0001", "metadata.json"));
  } finally {
    cleanup(repo);
  }
});

test("start and verify warn when workspace dependencies are missing", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, "package.json"), `${JSON.stringify({ packageManager: "pnpm@10.32.1" }, null, 2)}\n`);
    writeFileSync(path.join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    runCreate({ template: "agent-task", title: "Dependency warning" }, repo);
    const start = runStart("CY-0001", repo);
    assert.match(start, /Workspace dependencies missing/);
    assert.match(start, /pnpm install --offline/);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const verify = runVerify("CY-0001", workspacePath);
    assert.match(verify, /Workspace dependencies missing/);
    assert.match(verify, /pnpm install --offline/);
  } finally {
    cleanup(repo);
  }
});

test("start verify hydrate and doctor warn when electron binary is missing", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, "package.json"), `${JSON.stringify({ packageManager: "pnpm@10.32.1", devDependencies: { electron: "1.0.0" } }, null, 2)}\n`);
    runCreate({ template: "agent-task", title: "Electron warning" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    mkdirSync(path.join(workspacePath, "node_modules", "electron"), { recursive: true });

    assert.match(runVerify("CY-0001", workspacePath), /Electron binary missing/);
    assert.match(runHydrate("CY-0001", workspacePath), /Electron binary missing/);
    assert.match(runDoctor(repo), /Electron binary missing/);
  } finally {
    cleanup(repo);
  }
});

test("note and mark-in-progress write through active workspace change file", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Active notes" }, repo);
    runStart("CY-0001", repo);
    const rootChangePath = path.join(repo, ".changeyard", "changes", "CY-0001-active-notes.md");
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const workspaceChangePath = path.join(workspacePath, ".changeyard", "changes", "CY-0001-active-notes.md");
    assert.match(runNote("CY-0001", { message: "Checks ran: node -v." }, repo), /Updated Completion Notes/);
    assert.match(readFileSync(rootChangePath, "utf8"), /Checks ran: node -v\./);
    assert.match(readFileSync(workspaceChangePath, "utf8"), /Checks ran: node -v\./);

    const active = parseFrontmatter(readFileSync(workspaceChangePath, "utf8"));
    writeFileSync(workspaceChangePath, writeFrontmatter({ ...active.frontmatter, status: "blocked" }, active.body));
    assert.match(runMarkInProgress("CY-0001", {}, repo), /Marked CY-0001 in_progress/);
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "in_progress");
  } finally {
    cleanup(repo);
  }
});

test("doctor fix moves in-review jj changes with missing bookmarks to done", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Missing review bookmark" }, repo);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-missing-review-bookmark.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    writeFileSync(changePath, writeFrontmatter({ ...parsed.frontmatter, status: "in_review" }, parsed.body));

    const workspaceRoot = path.join(repo, ".changeyard", "workspaces", "CY-0001");
    const workspacePath = path.join(workspaceRoot, "repo");
    const metadataPath = path.join(workspaceRoot, "metadata.json");
    mkdirSync(workspacePath, { recursive: true });
    const metadata: WorkspaceMetadata = {
      changeId: "CY-0001",
      engine: "jj",
      name: "cy-CY-0001",
      path: workspacePath,
      repoRoot: repo,
      changePath,
      createdAt: new Date().toISOString(),
      branch: "cy/CY-0001",
    };
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    writeFileSync(path.join(workspacePath, ".changeyard-workspace.json"), `${JSON.stringify({ changeId: "CY-0001", metadataPath }, null, 2)}\n`);

    const dryRunReport = doctorReport(repo, { fix: true, dryRun: true });
    assert.match(dryRunReport.notes.join("\n"), /Would move CY-0001 to approved/);
    assert.equal(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.status, "in_review");

    const report = doctorReport(repo, { fix: true });
    assert.match(report.warnings.join("\n"), /CY-0001: jj bookmark missing: cy\/CY-0001/);
    assert.match(report.fixes.join("\n"), /Moved CY-0001 to approved/);
    assert.equal(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.status, "approved");
  } finally {
    cleanup(repo);
  }
});

test("doctor accepts configured stale completed cleanup age", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    assert.equal(loadConfig(repo).doctor?.staleCompletedDays, 3);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"doctor":{"staleCompletedDays":7}}\n`);
    assert.equal(loadConfig(repo).doctor?.staleCompletedDays, 7);
  } finally {
    cleanup(repo);
  }
});

test("doctor fix deletes stale merged clean workspaces only when explicitly requested", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Delete stale workspace" }, repo);
    runStart("CY-0001", repo);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-delete-stale-workspace.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    writeFileSync(changePath, writeFrontmatter({
      ...parsed.frontmatter,
      status: "merged",
      mergedAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
    }, parsed.body));

    const workspaceRoot = path.join(repo, ".changeyard", "workspaces", "CY-0001");
    const noFlagReport = doctorReport(repo, { fix: true, staleCompletedDays: 3 });
    assert.equal(existsSync(workspaceRoot), true);
    assert.match(noFlagReport.notes.join("\n"), /stale completed workspace remains/);

    const dryRunReport = doctorReport(repo, {
      fix: true,
      dryRun: true,
      deleteStaleCompletedWorkspaces: true,
      staleCompletedDays: 3,
    });
    assert.match(dryRunReport.notes.join("\n"), /Would delete stale completed workspace CY-0001/);
    assert.equal(existsSync(workspaceRoot), true);

    const report = doctorReport(repo, {
      fix: true,
      deleteStaleCompletedWorkspaces: true,
      staleCompletedDays: 3,
    });
    assert.match(report.fixes.join("\n"), /Deleted workspace CY-0001/);
    assert.equal(existsSync(workspaceRoot), false);
  } finally {
    cleanup(repo);
  }
});

test("doctor skips stale merged workspace cleanup when the workspace is dirty", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Skip dirty stale workspace" }, repo);
    runStart("CY-0001", repo);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-skip-dirty-stale-workspace.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    writeFileSync(changePath, writeFrontmatter({
      ...parsed.frontmatter,
      status: "merged",
      mergedAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
    }, parsed.body));

    const workspaceRoot = path.join(repo, ".changeyard", "workspaces", "CY-0001");
    writeFileSync(path.join(workspaceRoot, "repo", "dirty.txt"), "dirty\n");
    const report = doctorReport(repo, {
      fix: true,
      deleteStaleCompletedWorkspaces: true,
      staleCompletedDays: 3,
    });
    assert.match(report.warnings.join("\n"), /skipped stale completed workspace cleanup: workspace is dirty/);
    assert.match(report.warnings.join("\n"), /cy workspace status CY-0001/);
    assert.equal(existsSync(workspaceRoot), true);
  } finally {
    cleanup(repo);
  }
});

test("doctor fix waives stale completed missing reviews through metadata", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"review":{"requireBeforePr":true}}\n`);
    runCreate({ template: "agent-task", title: "Waive stale review" }, repo);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-waive-stale-review.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    writeFileSync(changePath, writeFrontmatter({
      ...parsed.frontmatter,
      status: "approved",
      updatedAt: "2000-01-01T00:00:00.000Z",
    }, parsed.body));

    const baseReport = doctorReport(repo, { staleCompletedDays: 3 });
    assert.match(baseReport.warnings.join("\n"), /stale completed change is missing a review/);

    const dryRunReport = doctorReport(repo, {
      fix: true,
      dryRun: true,
      waiveStaleCompletedReviews: true,
      staleCompletedDays: 3,
    });
    assert.match(dryRunReport.notes.join("\n"), /Would waive review requirement for stale completed change CY-0001/);
    assert.equal(existsSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md")), false);

    const report = doctorReport(repo, {
      fix: true,
      waiveStaleCompletedReviews: true,
      staleCompletedDays: 3,
    });
    assert.match(report.fixes.join("\n"), /Waived review requirement for stale completed change CY-0001/);
    const updated = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(asRecordForTest(updated.frontmatter.review).required, false);
    assert.equal(asRecordForTest(updated.frontmatter.review).waivedBy, "cy doctor");
    assert.equal(existsSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md")), false);
    assert.doesNotMatch(doctorReport(repo, { staleCompletedDays: 3 }).warnings.join("\n"), /missing a review/);
  } finally {
    cleanup(repo);
  }
});

test("doctor suppresses completed quick checklist warnings but keeps structural errors", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "quick", title: "Completed quick warning" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-completed-quick-warning.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    const body = replaceSection(parsed.body, "Acceptance Criteria", "- [x] Completed quick warning is documented");
    writeFileSync(changePath, writeFrontmatter({
      ...parsed.frontmatter,
      status: "merged",
      updatedAt: "2000-01-01T00:00:00.000Z",
    }, body));

    assert.doesNotMatch(doctorReport(repo).warnings.join("\n"), /Quick scope risk review unresolved/);
    assert.doesNotMatch(doctorReport(repo).warnings.join("\n"), /Acceptance Criteria must include at least one unchecked task before/);

    const broken = parseFrontmatter(readFileSync(changePath, "utf8"));
    const frontmatterWithoutTitle = { ...broken.frontmatter };
    delete frontmatterWithoutTitle.title;
    writeFileSync(changePath, writeFrontmatter(frontmatterWithoutTitle, broken.body));
    assert.match(doctorReport(repo).warnings.join("\n"), /Missing required frontmatter: title/);
  } finally {
    cleanup(repo);
  }
});

test("doctor fix checks unresolved completed acceptance criteria only with explicit flag", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Fix completed acceptance criteria" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-fix-completed-acceptance-criteria.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    const body = replaceSection(
      parsed.body,
      "Acceptance Criteria",
      "- [ ] Implemented behavior is reflected in the completed change\n- [ ] Deferred: follow-up polish remains separate",
    );
    writeFileSync(changePath, writeFrontmatter({
      ...parsed.frontmatter,
      status: "approved",
      updatedAt: "2000-01-01T00:00:00.000Z",
    }, body));

    const baseReport = doctorReport(repo);
    assert.match(baseReport.warnings.join("\n"), /completed change has 1 unchecked Acceptance Criteria item/);
    assert.match(baseReport.warnings.join("\n"), /--check-completed-acceptance-criteria/);

    const dryRunReport = doctorReport(repo, {
      fix: true,
      dryRun: true,
      checkCompletedAcceptanceCriteria: true,
    });
    assert.match(dryRunReport.notes.join("\n"), /Would check 1 unresolved Acceptance Criteria item/);
    assert.match(readFileSync(changePath, "utf8"), /- \[ \] Implemented behavior/);

    const report = doctorReport(repo, {
      fix: true,
      checkCompletedAcceptanceCriteria: true,
    });
    assert.match(report.fixes.join("\n"), /Checked 1 unresolved Acceptance Criteria item/);

    const updated = readFileSync(changePath, "utf8");
    assert.match(updated, /- \[x\] Implemented behavior is reflected in the completed change/);
    assert.match(updated, /- \[ \] Deferred: follow-up polish remains separate/);
    assert.doesNotMatch(doctorReport(repo).warnings.join("\n"), /completed change has .*unchecked Acceptance Criteria/);
  } finally {
    cleanup(repo);
  }
});

test("doctor fix waives missing jj bookmarks for no-pr completed changes with explicit flag", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Waive missing JJ bookmark" }, repo);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-waive-missing-jj-bookmark.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    writeFileSync(changePath, writeFrontmatter({
      ...parsed.frontmatter,
      status: "ready_for_pr",
      updatedAt: "2000-01-01T00:00:00.000Z",
    }, parsed.body));

    const workspaceRoot = path.join(repo, ".changeyard", "workspaces", "CY-0001");
    const workspacePath = path.join(workspaceRoot, "repo");
    const metadataPath = path.join(workspaceRoot, "metadata.json");
    mkdirSync(workspacePath, { recursive: true });
    const metadata: WorkspaceMetadata = {
      changeId: "CY-0001",
      engine: "jj",
      name: "cy-CY-0001",
      path: workspacePath,
      repoRoot: repo,
      changePath,
      createdAt: new Date().toISOString(),
      branch: "cy/CY-0001",
    };
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    writeFileSync(path.join(workspacePath, ".changeyard-workspace.json"), `${JSON.stringify({ changeId: "CY-0001", metadataPath }, null, 2)}\n`);

    const baseReport = doctorReport(repo);
    assert.match(baseReport.warnings.join("\n"), /CY-0001: jj bookmark missing: cy\/CY-0001/);
    assert.match(baseReport.warnings.join("\n"), /--waive-missing-jj-bookmarks/);

    const dryRunReport = doctorReport(repo, {
      fix: true,
      dryRun: true,
      waiveMissingJjBookmarks: true,
    });
    assert.match(dryRunReport.notes.join("\n"), /Would waive missing JJ bookmark for CY-0001 and mark CY-0001 approved/);
    assert.equal(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.status, "ready_for_pr");

    const report = doctorReport(repo, {
      fix: true,
      waiveMissingJjBookmarks: true,
    });
    assert.match(report.fixes.join("\n"), /Waived missing JJ bookmark for CY-0001 and marked it approved/);

    const updated = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(updated.frontmatter.status, "approved");
    assert.equal(asRecordForTest(updated.frontmatter.branch).required, false);
    assert.equal(asRecordForTest(updated.frontmatter.branch).waivedBy, "cy doctor");
    assert.doesNotMatch(doctorReport(repo).warnings.join("\n"), /jj bookmark missing: cy\/CY-0001/);
  } finally {
    cleanup(repo);
  }
});

test("review start and complete update review and change status", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Review workflow" }, repo);
    assert.match(runReviewStart("CY-0001", repo), /Started review 1/);
    const reviewPath = path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace("Review the change here.", "Scope and checks look good."));
    assert.equal(runReviewComplete("CY-0001", "approve", repo), "Completed review for CY-0001: approved");
    const review = readFileSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md"), "utf8");
    assert.match(review, /status: approved/);
    const change = parseFrontmatter(readFileSync(path.join(repo, ".changeyard", "changes", "CY-0001-review-workflow.md"), "utf8"));
    assert.equal(change.frontmatter.status, "approved");
  } finally {
    cleanup(repo);
  }
});

test("review update parses structured fields and preserves unknown sections", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Structured review" }, repo);
    assert.match(runReviewStart("CY-0001", repo), /Started review 1/);
    const reviewPath = path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md");
    writeFileSync(
      reviewPath,
      `${readFileSync(reviewPath, "utf8").trim()}\n\n# Planning Context\n\nKeep this context intact.\n`,
    );

    const before = getReview("CY-0001", 1, repo);
    const updated = updateReview("CY-0001", {
      review: 1,
      summary: "Reviewed the structured draft.",
      requiredChanges: [
        { checked: false, text: "Tighten the API contract tests." },
        { checked: true, text: "src/example.ts:42: Keep markdown frontmatter stable.\n\nUse the shared helper." },
      ],
      inlineComments: [{ path: "src/example.ts", line: 42, body: "Prefer the shared helper here." }],
      expectedLastModifiedAt: before.lastModifiedAt,
    }, repo);

    assert.equal(listReviews("CY-0001", repo).length, 1);
    assert.equal(updated.summary, "Reviewed the structured draft.");
    assert.deepEqual(updated.requiredChanges, [
      { checked: false, text: "Tighten the API contract tests." },
      { checked: true, text: "src/example.ts:42: Keep markdown frontmatter stable.\n\nUse the shared helper." },
    ]);
    assert.deepEqual(updated.inlineComments, [
      { path: "src/example.ts", line: 42, body: "Prefer the shared helper here." },
    ]);
    const raw = readFileSync(reviewPath, "utf8");
    assert.match(raw, /# Planning Context/);
    assert.match(raw, /Keep this context intact/);
    assert.match(raw, /- \[x\] src\/example\.ts:42: Keep markdown frontmatter stable\.\n\s+$/m);
    assert.match(raw, /\n  Use the shared helper\./);
    assert.match(raw, /change: CY-0001/);
  } finally {
    cleanup(repo);
  }
});

test("review detail omits required change placeholder and none sentinel", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Empty required review" }, repo);
    runReviewStart("CY-0001", repo);
    assert.deepEqual(getReview("CY-0001", 1, repo).requiredChanges, []);

    const reviewPath = path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md");
    writeFileSync(
      reviewPath,
      readFileSync(reviewPath, "utf8").replace(
        "- [ ] Add any required changes, or leave this checklist as a record.",
        "- [x] None.",
      ),
    );
    assert.deepEqual(getReview("CY-0001", 1, repo).requiredChanges, []);
  } finally {
    cleanup(repo);
  }
});

test("review update rejects stale last-modified guards", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Stale review" }, repo);
    runReviewStart("CY-0001", repo);
    assert.throws(
      () => updateReview("CY-0001", {
        review: 1,
        summary: "This write is stale.",
        requiredChanges: [],
        inlineComments: [],
        expectedLastModifiedAt: "2000-01-01T00:00:00.000Z",
      }, repo),
      /changed elsewhere/,
    );
  } finally {
    cleanup(repo);
  }
});

test("comment review completion leaves change status unchanged", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Comment review" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-comment-review.md");
    const changeBefore = parseFrontmatter(readFileSync(changePath, "utf8"));
    writeFileSync(changePath, writeFrontmatter({ ...changeBefore.frontmatter, status: "ready_for_pr" }, changeBefore.body));
    runReviewStart("CY-0001", repo);
    assert.equal(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.status, "in_review");

    const review = getReview("CY-0001", 1, repo);
    updateReview("CY-0001", {
      review: 1,
      summary: "",
      requiredChanges: [],
      inlineComments: [{ path: "src/example.ts", line: 7, body: "Question for follow-up." }],
      expectedLastModifiedAt: review.lastModifiedAt,
    }, repo);

    assert.equal(runReviewComplete("CY-0001", "comment", repo), "Completed review for CY-0001: commented");
    assert.equal(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.status, "in_review");
    const completedReview = parseFrontmatter(readFileSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md"), "utf8"));
    assert.equal(completedReview.frontmatter.status, "commented");
    assert.equal(typeof completedReview.frontmatter.completedAt, "string");
  } finally {
    cleanup(repo);
  }
});

test("quick review start writes quick workflow context", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "quick", title: "Quick review workflow" }, repo);
    assert.match(runReviewStart("CY-0001", repo), /Started review 1/);

    const review = readFileSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md"), "utf8");
    assert.match(review, /# Quick Change Context/);
    assert.match(review, /- Mode: quick/);
    assert.match(review, /- Planning: none/);
    assert.match(review, /- Risk: low/);
    assert.match(review, /- Checks profile: minimal/);
  } finally {
    cleanup(repo);
  }
});

test("planned local-folder review includes planning context in the review file and published review summary", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}\n`);
    runCreate({ template: "agent-task", title: "Projected planning review", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-projected-planning-review.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nProjected review proposal.\n");

    assert.match(runReviewStart("CY-0001", repo), /Started review 1/);
    const reviewPath = path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md");
    const reviewFile = readFileSync(reviewPath, "utf8");
    assert.match(reviewFile, /# Planning Context/);
    assert.match(reviewFile, /Canonical local file: `.changeyard\/changes\/CY-0001-projected-planning-review.md`/);

    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace("Review the change here.", "Planning context and implementation align."));
    assert.match(runReviewComplete("CY-0001", "approve", repo), /Completed review for CY-0001: approved/);
    const publishedReview = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "reviews", "0001-CY-0001.md"), "utf8");
    assert.match(publishedReview, /# Planning Summary/);
    assert.match(publishedReview, /Canonical local file: `.changeyard\/changes\/CY-0001-projected-planning-review.md`/);
  } finally {
    cleanup(repo);
  }
});

test("review complete rejects unfilled summary placeholder", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Empty review" }, repo);
    runReviewStart("CY-0001", repo);
    assert.throws(
      () => runReviewComplete("CY-0001", "approve", repo),
      /Review Summary must be filled in/,
    );
  } finally {
    cleanup(repo);
  }
});

function pathToFileUrl(filePath: string): string {
  return `file://${filePath}`;
}

test("local-folder provider publishes completed markdown reviews", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}
`);
    runCreate({ template: "agent-task", title: "Publish review" }, repo);
    runReviewStart("CY-0001", repo);
    const reviewPath = path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8")
      .replace("Review the change here.", "Approved with one inline note.")
      .replace("Add inline comments as bullets: - path/to/file.ts:42: Comment text.", "- src/example.ts:42: Tighten this assertion."));
    assert.equal(runReviewComplete("CY-0001", "approve", repo), "Completed review for CY-0001: approved");
    const review = readFileSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md"), "utf8");
    assert.match(review, /reviewUrl: file:\/\//);
    const published = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "reviews", "0001-CY-0001.md"), "utf8");
    assert.match(published, /decision: approved/);
    assert.match(published, /inlineCommentCount: 1/);
    assert.match(published, /src\/example.ts:42: Tighten this assertion/);
    assert.match(published, /sourceReview: .changeyard\/reviews\/CY-0001\/review-001.md/);
  } finally {
    cleanup(repo);
  }
});

test("github and gitlab providers are registered with PR capabilities", () => {
  const baseConfig: any = {
    project: { idPrefix: "CY", defaultBase: "main" },
    storage: { root: ".changeyard", changesDir: "changes", workspacesDir: "workspaces", reviewsDir: "reviews" },
    provider: { type: "github", owner: "example", repo: "repo" },
    vcs: { engine: "plain-copy", fallback: "plain-copy" },
    workspace: { pathPattern: "{id}/repo", namePattern: "cy-{id}", branchPattern: "cy/{id}", hydrate: { installCommand: "", copy: [], link: [], neverCopy: [] } },
    checks: { standard: [] },
  };
  assert.equal(createProvider("github", baseConfig).capabilities().pullRequests, true);
  assert.equal(createProvider("github", baseConfig).capabilities().reviews, true);
  assert.equal(createProvider("gitlab", { ...baseConfig, provider: { type: "gitlab", owner: "example", repo: "repo" } }).capabilities().pullRequests, true);
});

test("shell completions include core commands", () => {
  const completions = runCompletions();
  assert.match(completions, /complete -F _cy_complete cy changeyard/);
  assert.match(completions, /doctor recover/);
  assert.match(completions, /hub config/);
  assert.match(completions, /--dashboard/);
  assert.doesNotMatch(completions, /(^|\s)dashboard(?=\s|")/);
});

test("hub status reports stopped when no server is recorded", () => {
  withTempChangeyardHome(() => {
    const repo = tempRepo();
    try {
      runInit(repo);
      const status = getHubStatus(repo);
      assert.equal(status.running, false);
      assert.equal(status.stale, false);
      assert.equal(status.pid, null);
      assert.equal(status.url, null);
      assert.match(runHubStatus(repo), /hub: stopped/);
    } finally {
      cleanup(repo);
    }
  });
});

test("hub status reads the global active instance across projects", () => {
  withTempChangeyardHome(() => {
    const repoA = tempRepo();
    const repoB = tempRepo();
    try {
      runInit(repoA);
      runInit(repoB);
      mkdirSync(path.dirname(changeyardAppStatePath("hub", "instances.json")), { recursive: true });
      writeFileSync(changeyardAppStatePath("hub", "instances.json"), `${JSON.stringify({
        version: 1,
        activeInstanceId: "hub-current",
        instances: [
          {
            id: "hub-current",
            pid: process.pid,
            url: "http://127.0.0.1:3484/",
            repoRoot: repoA,
            startedAt: "2026-06-19T09:00:00.000Z",
            updatedAt: "2026-06-19T09:00:00.000Z",
            logPath: changeyardAppStatePath("hub", "logs", "default.log"),
            host: "127.0.0.1",
            port: 3484,
            startedBy: "dashboard",
            startedFromCwd: repoA,
            argv: ["cy", "--dashboard"],
            managed: true,
            active: true,
            endpointKey: "127.0.0.1:3484",
          },
        ],
      }, null, 2)}\n`);

      const status = getHubStatus(repoB);
      assert.equal(status.running, true);
      assert.equal(status.pid, process.pid);
      assert.equal(status.repoRoot, repoA);
      assert.equal(status.active, true);
      assert.match(runHubList(repoB), /Started by|startedBy: dashboard/);
    } finally {
      cleanup(repoA);
      cleanup(repoB);
    }
  });
});

test("hub kill stale removes stale global records", async () => {
  await withTempChangeyardHomeAsync(async () => {
    const repo = tempRepo();
    try {
      runInit(repo);
      mkdirSync(path.dirname(changeyardAppStatePath("hub", "instances.json")), { recursive: true });
      writeFileSync(changeyardAppStatePath("hub", "instances.json"), `${JSON.stringify({
        version: 1,
        activeInstanceId: "hub-stale",
        instances: [
          {
            id: "hub-stale",
            pid: 99999999,
            url: "http://127.0.0.1:3484/",
            repoRoot: repo,
            startedAt: "2026-06-19T09:00:00.000Z",
            updatedAt: "2026-06-19T09:00:00.000Z",
            logPath: changeyardAppStatePath("hub", "logs", "default.log"),
            host: "127.0.0.1",
            port: 3484,
            startedBy: "hub start",
            startedFromCwd: repo,
            argv: ["cy", "hub", "start"],
            managed: true,
            active: true,
            endpointKey: "127.0.0.1:3484",
          },
        ],
      }, null, 2)}\n`);

      const before = getHubInstances(repo);
      assert.equal(before.instances.length, 1);
      assert.equal(before.instances[0]?.stale, true);
      const result = await killHubInstance(repo, "stale");
      assert.equal(result.ok, true);
      assert.equal(getHubInstances(repo).instances.length, 0);
    } finally {
      cleanup(repo);
    }
  });
});

test("jj workspace engine creates and verifies expected jj workspace", () => {
  const repo = tempRepo();
  try {
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    mkdirSync(workspacePath, { recursive: true });
    const calls: string[] = [];
    const inspectionCalls: string[] = [];
    const mutate = (command: string, args: string[], cwd: string): string => {
      calls.push(`${cwd}: ${command} ${args.join(" ")}`);
      if (args.join(" ") === "log --ignore-working-copy --at-op=@ -r @ --no-graph -T commit_id") return "commit123";
      if (args.join(" ") === "log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short()") return "change123";
      return "";
    };
    const inspect = (command: string, args: string[], cwd: string): string => {
      inspectionCalls.push(`${cwd}: ${command} ${args.join(" ")}`);
      if (args.join(" ") === "workspace root") return workspacePath;
      if (args.join(" ") === "workspace list") return "cy-CY-0001 abc123";
      if (args.join(" ") === "status") return "The working copy is clean";
      if (args.join(" ") === "resolve --list") return "";
      return "";
    };
    const engine = new JjWorkspaceEngine(mutate, inspect);
    const metadata = { changeId: "CY-0001", engine: "jj", name: "cy-CY-0001", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now", targetRef: "main", seedDescription: "CY-0001: Test task" };
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.ok(calls.some((call) => call.includes("jj workspace add --name cy-CY-0001 -r main -m CY-0001: Test task")));
    assert.equal(created.workspaceChangeId, "change123");
    assert.equal(created.workspaceCommitId, "commit123");
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata }), { valid: true, errors: [] });
    assert.deepEqual(inspectionCalls.map((call) => call.replace(`${workspacePath}: `, "")), [
      "jj workspace root",
      "jj workspace list",
      "jj status",
      "jj resolve --list",
    ]);
    assert.equal(inspectionCalls.some((call) => call.includes("workspace update-stale")), false);
    engine.publish({ cwd: workspacePath, metadata, branch: "cy/CY-0001" });
    assert.ok(calls.some((call) => call.includes("jj bookmark set cy/CY-0001 -r @")));
    assert.ok(calls.some((call) => call.includes("jj git push --bookmark cy/CY-0001")));
  } finally {
    cleanup(repo);
  }
});

test("jj inspection args disable snapshots without duplicating existing no-snapshot flags", () => {
  assert.deepEqual(jjInspectionArgs(["status"]), ["--ignore-working-copy", "status"]);
  assert.deepEqual(jjInspectionArgs(["log", "--ignore-working-copy", "-r", "@"]), ["log", "--ignore-working-copy", "-r", "@"]);
  assert.deepEqual(jjInspectionArgs(["log", "--at-op=@", "-r", "@"]), ["log", "--at-op=@", "-r", "@"]);
});

test("git worktree engine creates branch worktree and verifies clean root", () => {
  const repo = tempRepo();
  try {
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    mkdirSync(workspacePath, { recursive: true });
    const calls: string[] = [];
    const engine = new GitWorktreeEngine((command, args, cwd) => {
      calls.push(`${cwd}: ${command} ${args.join(" ")}`);
      if (args.join(" ") === "rev-parse --show-toplevel") return workspacePath;
      if (args.join(" ") === "status --porcelain") return "";
      return "";
    });
    const metadata = { changeId: "CY-0001", engine: "git-worktree", name: "cy-CY-0001", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now", branch: "cy/CY-0001-test" };
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.equal(created.branch, "cy/CY-0001-test");
    assert.ok(calls.some((call) => call.includes("git worktree add -b cy/CY-0001-test")));
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata: created }), { valid: true, errors: [] });
    engine.publish({ cwd: workspacePath, metadata: created, branch: "cy/CY-0001-test" });
    assert.ok(calls.some((call) => call.includes("git push -u origin cy/CY-0001-test")));
  } finally {
    cleanup(repo);
  }
});

test("list and status summarize local changes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Add local provider" }, repo);
    assert.match(runList(repo), /CY-0001\tready\tfeature\tAdd local provider/);
    assert.match(runStatus("CY-0001", repo), /status: ready/);
  } finally {
    cleanup(repo);
  }
});

test("commands resolve partial task ids to canonical ids", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Partial id task" }, repo);

    assert.equal(getStatus("001", repo).id, "CY-0001");
    assert.match(runStatus("001", repo), /id: CY-0001/);

    assert.match(runStart("001", repo), /Started CY-0001 in \.changeyard\/workspaces\/CY-0001\/repo/);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    assert.match(runVerify("001", workspacePath), /Verified CY-0001/);
    assert.equal(getWorkspaceStatus("001", repo).id, "CY-0001");

    const marker = JSON.parse(readFileSync(path.join(workspacePath, ".changeyard-workspace.json"), "utf8"));
    assert.equal(marker.changeId, "CY-0001");
  } finally {
    cleanup(repo);
  }
});

test("ambiguous partial task ids fail with matching tasks", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "First ambiguous task" }, repo);
    runCreate({ template: "feature", title: "Second ambiguous task" }, repo);

    assert.throws(
      () => getStatus("CY-000", repo),
      /Ambiguous task id "CY-000" matched multiple tasks:[\s\S]*CY-0001[\s\S]*CY-0002[\s\S]*Use the full task id\./,
    );
  } finally {
    cleanup(repo);
  }
});

test("status, list, and plan status expose planning summaries for planned changes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Planned status change", planning: "openspec-lite", strict: true }, repo);

    const status = getStatus("CY-0001", repo);
    assert.equal(status.planning?.model, "openspec-lite");
    assert.equal(status.planning?.strictness, "strict");
    assert.equal(status.planning?.phase, "draft");
    assert.equal(status.planning?.gateSummary.pending, 8);
    assert.deepEqual(status.planning?.missingSections, []);

    assert.match(runStatus("CY-0001", repo), /planning: openspec-lite strict/);
    assert.match(runStatus("CY-0001", repo), /planningPhase: draft/);
    assert.match(runStatus("CY-0001", repo), /planningGates:/);

    const listed = listChanges(repo);
    assert.equal(listed[0].planning?.phase, "draft");
    assert.match(runList(repo, { planning: true }), /CY-0001\tready\tfeature\tdraft\tPlanned status change/);

    const planStatus = getPlanStatus("CY-0001", repo);
    assert.equal(planStatus.planning?.nextAction, "Complete pending planning gate: proposal");
    assert.match(runPlanStatus("CY-0001", repo), /planningGateSummary: pass=0, pending=8, fail=0, skipped=0, warning=0/);
    assert.match(runPlanStatus("CY-0001", repo), /presentPlanningSections: proposal, spec-deltas, design, tasks, verification, clarifications, requirements-checklist, analysis/);
  } finally {
    cleanup(repo);
  }
});

test("plan prompt returns the canonical file path, target markers, and current section content", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Prompted change", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-prompted-change.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nPrompt-ready content.\n");

    const promptResult = getPlanPrompt("CY-0001", "proposal", repo);
    assert.equal(promptResult.section, "proposal");
    assert.equal(promptResult.path, ".changeyard/changes/CY-0001-prompted-change.md");
    assert.match(promptResult.prompt, /Canonical file: \.changeyard\/changes\/CY-0001-prompted-change\.md/);
    assert.match(promptResult.prompt, /Target markers: <!-- cy:proposal:start --> \.\.\. <!-- cy:proposal:end -->/);
    assert.match(promptResult.prompt, /Prompt-ready content\./);
    assert.match(promptResult.prompt, /Do not create openspec\/, specs\/, checklists\/, or other external planning folders/);
    assert.equal(runPlanPrompt("CY-0001", "proposal", repo), promptResult.prompt);
  } finally {
    cleanup(repo);
  }
});

test("planning status derives completed gates from section content", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Derived planning gates", planning: "openspec-lite" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-derived-planning-gates.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nShip the derived gate summary.\n");
    updatePlannedSection(changePath, "spec-deltas", "# Specification Deltas\n\nNo behavior change.\n");
    updatePlannedSection(changePath, "design", "# Design\n\n## Technical Approach\n\nUse canonical markdown content.\n");
    updatePlannedSection(changePath, "tasks", "# Tasks\n\n- [x] Implement derived summaries\n");
    updatePlannedSection(changePath, "verification", "# Verification\n\n## Result\n\nPassed: node -v\n");

    const status = getStatus("CY-0001", repo);
    assert.equal(status.planning?.gateSummary.pass, 5);
    assert.equal(status.planning?.gateSummary.pending, 0);
    assert.equal(status.planning?.nextAction, null);
    assert.doesNotMatch(runPlanStatus("CY-0001", repo), /planningNextAction:/);
  } finally {
    cleanup(repo);
  }
});

test("plan export and import round-trip planning sections through non-canonical adapter mirrors", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Adapter round trip", planning: "openspec-lite", strict: true }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-adapter-round-trip.md");
    updatePlannedSection(changePath, "proposal", "# Proposal\n\n## Intent\n\nOriginal proposal.\n");
    updatePlannedSection(changePath, "spec-deltas", "# Specification Deltas\n\nNo behavior change\n");
    updatePlannedSection(changePath, "design", "# Design\n\n## Technical Approach\n\nOriginal design.\n");
    updatePlannedSection(changePath, "tasks", "# Tasks\n\n- [x] Original task\n");
    updatePlannedSection(changePath, "verification", "# Verification\n\n## Result\n\nOriginal verification.\n");
    updatePlannedSection(changePath, "clarifications", "# Clarifications\n\nNo clarifications required.\n");
    updatePlannedSection(changePath, "requirements-checklist", "# Requirements Checklist\n\n- [x] Original checklist\n");
    updatePlannedSection(changePath, "analysis", "# Consistency Analysis\n\n## Findings\n\n| ID | Severity | Summary | Recommendation | Status |\n|----|----------|---------|----------------|--------|\n\n## Gate Result\n\nPass\n");

    assert.match(
      runPlanExport("CY-0001", "openspec", repo),
      /Exported CY-0001 openspec planning mirror to \.changeyard\/cache\/planning\/CY-0001\/openspec/,
    );
    const openspecDir = path.join(repo, ".changeyard", "cache", "planning", "CY-0001", "openspec");
    assert.match(readFileSync(path.join(openspecDir, "README.md"), "utf8"), /non-canonical mirrors/i);
    assert.match(readFileSync(path.join(openspecDir, "proposal.md"), "utf8"), /Non-canonical/);
    updateAdapterMirrorContent(path.join(openspecDir, "proposal.md"), "# Proposal\n\n## Intent\n\nImported from OpenSpec.\n");
    updateAdapterMirrorContent(path.join(openspecDir, "requirements-checklist.md"), "# Requirements Checklist\n\n- [x] Imported OpenSpec checklist\n");
    assert.match(
      runPlanImport("CY-0001", "openspec", repo),
      /Imported CY-0001 openspec planning mirror from \.changeyard\/cache\/planning\/CY-0001\/openspec/,
    );
    const afterOpenSpecImport = readFileSync(changePath, "utf8");
    assert.match(afterOpenSpecImport, /Imported from OpenSpec\./);
    assert.match(afterOpenSpecImport, /Imported OpenSpec checklist/);
    assert.doesNotMatch(afterOpenSpecImport, /Non-canonical/);

    assert.match(
      runPlanExport("CY-0001", "speckit", repo),
      /Exported CY-0001 speckit planning mirror to \.changeyard\/cache\/planning\/CY-0001\/speckit/,
    );
    const speckitDir = path.join(repo, ".changeyard", "cache", "planning", "CY-0001", "speckit");
    assert.match(readFileSync(path.join(speckitDir, "README.md"), "utf8"), /Canonical source/);
    assert.match(readFileSync(path.join(speckitDir, "plan.md"), "utf8"), /Non-canonical/);
    updateAdapterMirrorContent(path.join(speckitDir, "plan.md"), "# Design\n\n## Technical Approach\n\nImported from Spec Kit.\n");
    updateAdapterMirrorContent(path.join(speckitDir, "analysis.md"), "# Consistency Analysis\n\n## Findings\n\n| ID | Severity | Summary | Recommendation | Status |\n|----|----------|---------|----------------|--------|\n\n## Gate Result\n\nPass\n");
    assert.match(
      runPlanImport("CY-0001", "speckit", repo),
      /Imported CY-0001 speckit planning mirror from \.changeyard\/cache\/planning\/CY-0001\/speckit/,
    );
    const afterSpecKitImport = readFileSync(changePath, "utf8");
    assert.match(afterSpecKitImport, /Imported from Spec Kit\./);
    assert.match(afterSpecKitImport, /Imported OpenSpec checklist/);
    assert.doesNotMatch(afterSpecKitImport, /Non-canonical/);
    assert.match(runPlanStatus("CY-0001", repo), /planning: openspec-lite strict/);
  } finally {
    cleanup(repo);
  }
});

type ProviderRequest = HttpRequest & { payload: Record<string, unknown> };

function providerConfig(type: string, tokenEnv: string): any {
  return {
    project: { idPrefix: "CY", defaultBase: "main" },
    storage: { root: ".changeyard", changesDir: "changes", workspacesDir: "workspaces", reviewsDir: "reviews" },
    provider: { type, baseUrl: `https://${type}.example.test`, owner: "example-org", repo: "example-repo", auth: { tokenEnv } },
    vcs: { engine: "plain-copy", fallback: "plain-copy" },
    workspace: { pathPattern: "{id}/repo", namePattern: "cy-{id}", branchPattern: "cy/{id}", hydrate: { installCommand: "", copy: [], link: [], neverCopy: [] } },
    checks: { standard: [] },
  };
}

function providerSyncInput(remote: Record<string, unknown> = {}): any {
  return {
    repoRoot: "/repo",
    storageRoot: "/repo/.changeyard",
    changePath: "/repo/.changeyard/changes/CY-0001-provider.md",
    frontmatter: {
      id: "CY-0001",
      title: "Provider sync",
      status: "synced",
      type: "agent-task",
      labels: ["agent-ready", "provider"],
      remote,
    },
    body: "# Summary\n\nProvider body.\n",
  };
}

function plannedProviderSyncInput(): any {
  const frontmatter = {
    id: "CY-0001",
    title: "Provider sync",
    status: "synced",
    type: "agent-task",
    labels: ["agent-ready", "provider"],
    planning: {
      model: "openspec-lite",
      storage: "inline",
      schema: "changeyard-openspec-lite@1",
      strictness: "normal",
      phase: "draft",
      gates: {
        proposal: "pass",
        specDeltas: "pending",
        design: "pending",
        tasks: "pending",
        verification: "pending",
      },
    },
  };
  const body = [
    "# Summary",
    "",
    "Provider body.",
    "",
    "<!-- cy:proposal:start -->",
    "# Proposal",
    "",
    "## Intent",
    "",
    "Projected provider body.",
    "<!-- cy:proposal:end -->",
    "",
    "<!-- cy:spec-deltas:start -->",
    "# Specification Deltas",
    "",
    "No behavior change",
    "<!-- cy:spec-deltas:end -->",
    "",
    "<!-- cy:design:start -->",
    "# Design",
    "",
    "Pending design.",
    "<!-- cy:design:end -->",
    "",
    "<!-- cy:tasks:start -->",
    "# Tasks",
    "",
    "- [ ] Pending task",
    "<!-- cy:tasks:end -->",
    "",
    "<!-- cy:verification:start -->",
    "# Verification",
    "",
    "## Result",
    "",
    "_Not run yet._",
    "<!-- cy:verification:end -->",
  ].join("\n");

  return {
    repoRoot: "/repo",
    storageRoot: "/repo/.changeyard",
    changePath: "/repo/.changeyard/changes/CY-0001-provider.md",
    frontmatter,
    body: renderProviderIssueBody({
      canonicalPath: ".changeyard/changes/CY-0001-provider.md",
      frontmatter,
      body,
    }),
  };
}

test("remote providers send expected issue, PR, and review HTTP requests", () => {
  const previousForgeToken = process.env.CHANGEYARD_TEST_FORGE_TOKEN;
  const previousGitHubToken = process.env.CHANGEYARD_TEST_GITHUB_TOKEN;
  const previousGitLabToken = process.env.CHANGEYARD_TEST_GITLAB_TOKEN;
  process.env.CHANGEYARD_TEST_FORGE_TOKEN = "forge-token";
  process.env.CHANGEYARD_TEST_GITHUB_TOKEN = "github-token";
  process.env.CHANGEYARD_TEST_GITLAB_TOKEN = "gitlab-token";
  const requests: ProviderRequest[] = [];
  setHttpTransportForTests((request) => {
    requests.push(request as ProviderRequest);
    if (request.url.endsWith("/pulls/42")) {
      return { status: 200, body: JSON.stringify({ number: 42, html_url: "https://example.test/pull/42", head: { sha: "abc123" } }) };
    }
    if (request.url.includes("/pulls/42/files")) {
      return { status: 200, body: JSON.stringify([{ filename: "src/example.ts", patch: "@@ -40,3 +40,4 @@\n context\n+line 42\n context\n" }]) };
    }
    if (request.url.endsWith("/merge_requests/43")) {
      return { status: 200, body: JSON.stringify({ iid: 43, web_url: "https://example.test/merge/43", diff_refs: { base_sha: "base", head_sha: "head", start_sha: "start" } }) };
    }
    if (request.url.endsWith("/merge_requests/43/changes")) {
      return { status: 200, body: JSON.stringify({ changes: [{ new_path: "src/example.ts", old_path: "src/example.ts", diff: "@@ -40,3 +40,4 @@\n context\n+line 42\n context\n" }] }) };
    }
    if (request.url.includes("/comments") || request.url.includes("/notes")) return { status: 201, body: JSON.stringify({ id: 44, html_url: "https://example.test/review/44", web_url: "https://example.test/review/44" }) };
    if (request.url.includes("/pulls")) return { status: 201, body: JSON.stringify({ number: 42, html_url: "https://example.test/pull/42" }) };
    if (request.url.includes("/merge_requests")) return { status: 201, body: JSON.stringify({ iid: 43, web_url: "https://example.test/merge/43" }) };
    return { status: request.method === "POST" ? 201 : 200, body: JSON.stringify({ number: 41, iid: 41, html_url: "https://example.test/issues/41", web_url: "https://example.test/issues/41" }) };
  });

  try {
    const forgejo = new ForgejoProvider(providerConfig("forgejo", "CHANGEYARD_TEST_FORGE_TOKEN"));
    const github = new GitHubProvider(providerConfig("github", "CHANGEYARD_TEST_GITHUB_TOKEN"));
    const gitlab = new GitLabProvider(providerConfig("gitlab", "CHANGEYARD_TEST_GITLAB_TOKEN"));

    assert.deepEqual(forgejo.syncIssue(providerSyncInput()), { provider: "forgejo", issueNumber: 41, issueUrl: "https://example.test/issues/41" });
    assert.deepEqual(github.syncIssue(providerSyncInput({ issueNumber: 7 })), { provider: "github", issueNumber: 41, issueUrl: "https://example.test/issues/41" });
    assert.deepEqual(gitlab.syncIssue(providerSyncInput({ issueNumber: 8 })), { provider: "gitlab", issueNumber: 41, issueUrl: "https://example.test/issues/41" });

    assert.equal(forgejo.createPullRequest?.({ ...providerSyncInput(), title: "Provider sync", branch: "cy/CY-0001", base: "main", draft: true }).pullRequestNumber, 42);
    assert.equal(github.createPullRequest?.({ ...providerSyncInput(), title: "Provider sync", branch: "cy/CY-0001", base: "main", draft: true }).pullRequestNumber, 42);
    assert.equal(gitlab.createPullRequest?.({ ...providerSyncInput(), title: "Provider sync", branch: "cy/CY-0001", base: "main", draft: true }).pullRequestNumber, 43);

    assert.equal(github.publishReview?.({ ...providerSyncInput({ pullRequestNumber: 42 }), reviewPath: "/repo/.changeyard/reviews/CY-0001/review-001.md", reviewFrontmatter: { review: 1 }, reviewBody: "# Summary\n\nApproved.", decision: "approved", inlineComments: [{ path: "src/example.ts", line: 42, body: "Tighten this assertion." }] }).reviewNumber, 44);
    assert.equal(gitlab.publishReview?.({ ...providerSyncInput({ pullRequestNumber: 43 }), reviewPath: "/repo/.changeyard/reviews/CY-0001/review-001.md", reviewFrontmatter: { review: 1 }, reviewBody: "# Summary\n\nApproved.", decision: "approved" }).reviewNumber, 44);

    const forgeIssue = requests.find((request) => request.url === "https://forgejo.example.test/api/v1/repos/example-org/example-repo/issues");
    const githubIssue = requests.find((request) => request.url === "https://github.example.test/repos/example-org/example-repo/issues/7");
    const gitlabIssue = requests.find((request) => request.url === "https://gitlab.example.test/api/v4/projects/example-org%2Fexample-repo/issues/8");
    const gitlabMergeRequest = requests.find((request) => request.url === "https://gitlab.example.test/api/v4/projects/example-org%2Fexample-repo/merge_requests");
    const githubReview = requests.find((request) => request.url === "https://github.example.test/repos/example-org/example-repo/issues/42/comments");
    const gitlabReview = requests.find((request) => request.url === "https://gitlab.example.test/api/v4/projects/example-org%2Fexample-repo/merge_requests/43/notes");

    assert.ok(forgeIssue);
    assert.ok(githubIssue);
    assert.ok(gitlabIssue);
    assert.ok(gitlabMergeRequest);
    assert.ok(githubReview);
    assert.ok(gitlabReview);
    assert.equal(forgeIssue?.method, "POST");
    assert.deepEqual(forgeIssue?.payload.labels, ["agent-ready", "provider"]);
    assert.equal(githubIssue?.method, "PATCH");
    assert.equal(githubIssue?.tokenScheme, "Bearer");
    assert.equal(gitlabIssue?.method, "PUT");
    assert.equal(gitlabMergeRequest?.payload.target_branch, "main");
    assert.match(String(githubReview?.payload.body), /Inline comments:/);
  } finally {
    setHttpTransportForTests();
    if (previousForgeToken === undefined) delete process.env.CHANGEYARD_TEST_FORGE_TOKEN; else process.env.CHANGEYARD_TEST_FORGE_TOKEN = previousForgeToken;
    if (previousGitHubToken === undefined) delete process.env.CHANGEYARD_TEST_GITHUB_TOKEN; else process.env.CHANGEYARD_TEST_GITHUB_TOKEN = previousGitHubToken;
    if (previousGitLabToken === undefined) delete process.env.CHANGEYARD_TEST_GITLAB_TOKEN; else process.env.CHANGEYARD_TEST_GITLAB_TOKEN = previousGitLabToken;
  }
});

test("providers implement branch pull request operations", () => {
  const previousForgeToken = process.env.CHANGEYARD_TEST_FORGE_TOKEN;
  const previousGitHubToken = process.env.CHANGEYARD_TEST_GITHUB_TOKEN;
  const previousGitLabToken = process.env.CHANGEYARD_TEST_GITLAB_TOKEN;
  process.env.CHANGEYARD_TEST_FORGE_TOKEN = "forge-token";
  process.env.CHANGEYARD_TEST_GITHUB_TOKEN = "github-token";
  process.env.CHANGEYARD_TEST_GITLAB_TOKEN = "gitlab-token";
  const requests: ProviderRequest[] = [];
  setHttpTransportForTests((request) => {
    requests.push(request as ProviderRequest);
    if (request.method === "GET" && request.url.includes("github.example.test") && request.url.includes("/pulls?head=")) {
      return { status: 200, body: JSON.stringify([{ number: 50, html_url: "https://example.test/github/50", base: { ref: "main" }, state: "open" }]) };
    }
    if (request.method === "GET" && request.url.includes("forgejo.example.test") && request.url.includes("/pulls?state=open")) {
      return { status: 200, body: JSON.stringify([{ number: 60, html_url: "https://example.test/forgejo/60", base: { ref: "main" }, state: "open" }]) };
    }
    if (request.method === "GET" && request.url.includes("gitlab.example.test") && request.url.includes("/merge_requests?source_branch=")) {
      return { status: 200, body: JSON.stringify([{ iid: 70, web_url: "https://example.test/gitlab/70", source_branch: "feature/a", target_branch: "main", state: "opened" }]) };
    }
    if (request.method === "POST" && request.url === "https://github.example.test/repos/example-org/example-repo/pulls") {
      return { status: 201, body: JSON.stringify({ number: 51, html_url: "https://example.test/github/51", base: { ref: (request.payload as { base?: string }).base }, state: "open" }) };
    }
    if (request.method === "POST" && request.url === "https://forgejo.example.test/api/v1/repos/example-org/example-repo/pulls") {
      return { status: 201, body: JSON.stringify({ number: 61, html_url: "https://example.test/forgejo/61", base: { ref: (request.payload as { base?: string }).base }, state: "open" }) };
    }
    if (request.method === "POST" && request.url === "https://gitlab.example.test/api/v4/projects/example-org%2Fexample-repo/merge_requests") {
      return { status: 201, body: JSON.stringify({ iid: 71, web_url: "https://example.test/gitlab/71", source_branch: (request.payload as { source_branch?: string }).source_branch, target_branch: (request.payload as { target_branch?: string }).target_branch, state: "opened" }) };
    }
    if (request.method === "PATCH" && request.url.endsWith("/pulls/51")) {
      return { status: 200, body: JSON.stringify({ number: 51, html_url: "https://example.test/github/51", base: { ref: (request.payload as { base?: string }).base }, state: "open" }) };
    }
    if (request.method === "PATCH" && request.url.endsWith("/pulls/61")) {
      return { status: 200, body: JSON.stringify({ number: 61, html_url: "https://example.test/forgejo/61", base: { ref: (request.payload as { base?: string }).base }, state: "open" }) };
    }
    if (request.method === "PUT" && request.url.endsWith("/merge_requests/71")) {
      return { status: 200, body: JSON.stringify({ iid: 71, web_url: "https://example.test/gitlab/71", source_branch: "feature/a", target_branch: (request.payload as { target_branch?: string }).target_branch, state: "opened" }) };
    }
    if (request.method === "GET" && (request.url.includes("/comments") || request.url.includes("/notes"))) {
      return { status: 200, body: "[]" };
    }
    if (request.method === "POST" && (request.url.includes("/comments") || request.url.includes("/notes"))) {
      return { status: 201, body: JSON.stringify({ id: 81, html_url: "https://example.test/comment/81", web_url: "https://example.test/comment/81" }) };
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });

  try {
    const forgejo = new ForgejoProvider(providerConfig("forgejo", "CHANGEYARD_TEST_FORGE_TOKEN"));
    const github = new GitHubProvider(providerConfig("github", "CHANGEYARD_TEST_GITHUB_TOKEN"));
    const gitlab = new GitLabProvider(providerConfig("gitlab", "CHANGEYARD_TEST_GITLAB_TOKEN"));

    assert.equal(github.findOpenPullRequestByHead?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", head: "feature/a" })?.pullRequestNumber, 50);
    assert.equal(forgejo.findOpenPullRequestByHead?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", head: "feature/a" })?.pullRequestNumber, 60);
    assert.equal(gitlab.findOpenPullRequestByHead?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", head: "feature/a" })?.pullRequestNumber, 70);

    const githubPr = github.createBranchPullRequest?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", title: "Feature", body: "Body", head: "feature/a", base: "main", draft: true });
    const forgejoPr = forgejo.createBranchPullRequest?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", title: "Feature", body: "Body", head: "feature/a", base: "main", draft: true });
    const gitlabPr = gitlab.createBranchPullRequest?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", title: "Feature", body: "Body", head: "feature/a", base: "main", draft: true });
    assert.equal(githubPr?.pullRequestNumber, 51);
    assert.equal(forgejoPr?.pullRequestNumber, 61);
    assert.equal(gitlabPr?.pullRequestNumber, 71);

    assert.equal(github.updatePullRequestBase?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", pullRequestNumber: 51, base: "feature/base" }).baseBranch, "feature/base");
    assert.equal(forgejo.updatePullRequestBase?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", pullRequestNumber: 61, base: "feature/base" }).baseBranch, "feature/base");
    assert.equal(gitlab.updatePullRequestBase?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", pullRequestNumber: 71, base: "feature/base" }).baseBranch, "feature/base");

    assert.equal(github.upsertPullRequestComment?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", pullRequestNumber: 51, marker: "<!-- marker -->", body: "<!-- marker -->\nbody" }).action, "created");
    assert.equal(forgejo.upsertPullRequestComment?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", pullRequestNumber: 61, marker: "<!-- marker -->", body: "<!-- marker -->\nbody" }).action, "created");
    assert.equal(gitlab.upsertPullRequestComment?.({ repoRoot: "/repo", storageRoot: "/repo/.changeyard", pullRequestNumber: 71, marker: "<!-- marker -->", body: "<!-- marker -->\nbody" }).action, "created");

    const githubCreate = requests.find((request) => request.url === "https://github.example.test/repos/example-org/example-repo/pulls" && request.method === "POST");
    const forgejoUpdate = requests.find((request) => request.url === "https://forgejo.example.test/api/v1/repos/example-org/example-repo/pulls/61");
    const gitlabUpdate = requests.find((request) => request.url === "https://gitlab.example.test/api/v4/projects/example-org%2Fexample-repo/merge_requests/71");
    assert.equal(githubCreate?.payload.head, "feature/a");
    assert.equal(forgejoUpdate?.payload.base, "feature/base");
    assert.equal(gitlabUpdate?.payload.target_branch, "feature/base");
  } finally {
    setHttpTransportForTests();
    if (previousForgeToken === undefined) delete process.env.CHANGEYARD_TEST_FORGE_TOKEN; else process.env.CHANGEYARD_TEST_FORGE_TOKEN = previousForgeToken;
    if (previousGitHubToken === undefined) delete process.env.CHANGEYARD_TEST_GITHUB_TOKEN; else process.env.CHANGEYARD_TEST_GITHUB_TOKEN = previousGitHubToken;
    if (previousGitLabToken === undefined) delete process.env.CHANGEYARD_TEST_GITLAB_TOKEN; else process.env.CHANGEYARD_TEST_GITLAB_TOKEN = previousGitLabToken;
  }
});

test("local-folder provider simulates branch pull request operations", () => {
  const repo = tempRepo();
  try {
    const storage = path.join(repo, ".changeyard");
    mkdirSync(storage, { recursive: true });
    const provider = new LocalFolderProvider();
    const created = provider.createBranchPullRequest?.({
      repoRoot: repo,
      storageRoot: storage,
      title: "Feature",
      body: "Body",
      head: "feature/a",
      base: "main",
      draft: false,
    });
    assert.equal(created?.pullRequestNumber, 1);
    assert.equal(provider.findOpenPullRequestByHead?.({ repoRoot: repo, storageRoot: storage, head: "feature/a" })?.pullRequestNumber, 1);
    assert.equal(provider.updatePullRequestBase?.({ repoRoot: repo, storageRoot: storage, pullRequestNumber: 1, base: "feature/base" }).baseBranch, "feature/base");
    assert.equal(provider.upsertPullRequestComment?.({ repoRoot: repo, storageRoot: storage, pullRequestNumber: 1, marker: "<!-- marker -->", body: "<!-- marker -->\nfirst" }).action, "created");
    assert.equal(provider.upsertPullRequestComment?.({ repoRoot: repo, storageRoot: storage, pullRequestNumber: 1, marker: "<!-- marker -->", body: "<!-- marker -->\nsecond" }).action, "updated");
    const pullRequest = readFileSync(path.join(storage, "cache", "local-folder", "pull-requests", "0001-feature-a.md"), "utf8");
    const comments = readdirSync(path.join(storage, "cache", "local-folder", "pull-request-comments"));
    assert.match(pullRequest, /base: feature\/base/);
    assert.equal(comments.length, 1);
  } finally {
    cleanup(repo);
  }
});

test("remote provider issue sync payloads include the rendered planning projection for planned changes", () => {
  const previousForgeToken = process.env.CHANGEYARD_TEST_FORGE_TOKEN;
  const previousGitHubToken = process.env.CHANGEYARD_TEST_GITHUB_TOKEN;
  const previousGitLabToken = process.env.CHANGEYARD_TEST_GITLAB_TOKEN;
  process.env.CHANGEYARD_TEST_FORGE_TOKEN = "forge-token";
  process.env.CHANGEYARD_TEST_GITHUB_TOKEN = "github-token";
  process.env.CHANGEYARD_TEST_GITLAB_TOKEN = "gitlab-token";
  const requests: ProviderRequest[] = [];
  setHttpTransportForTests((request) => {
    requests.push(request as ProviderRequest);
    return { status: request.method === "POST" ? 201 : 200, body: JSON.stringify({ number: 41, iid: 41, html_url: "https://example.test/issues/41", web_url: "https://example.test/issues/41" }) };
  });

  try {
    const forgejo = new ForgejoProvider(providerConfig("forgejo", "CHANGEYARD_TEST_FORGE_TOKEN"));
    const github = new GitHubProvider(providerConfig("github", "CHANGEYARD_TEST_GITHUB_TOKEN"));
    const gitlab = new GitLabProvider(providerConfig("gitlab", "CHANGEYARD_TEST_GITLAB_TOKEN"));

    forgejo.syncIssue(plannedProviderSyncInput());
    github.syncIssue(plannedProviderSyncInput());
    gitlab.syncIssue(plannedProviderSyncInput());

    const renderedBodies = requests
      .filter((request) => /issues/.test(request.url))
      .map((request) => String(request.payload.body ?? request.payload.description ?? ""));

    assert.equal(renderedBodies.length, 3);
    for (const body of renderedBodies) {
      assert.match(body, /# Planning Summary/);
      assert.match(body, /Canonical local file: `.changeyard\/changes\/CY-0001-provider.md`/);
      assert.match(body, /The local markdown change remains the canonical source of truth\./);
    }
  } finally {
    setHttpTransportForTests(undefined);
    process.env.CHANGEYARD_TEST_FORGE_TOKEN = previousForgeToken;
    process.env.CHANGEYARD_TEST_GITHUB_TOKEN = previousGitHubToken;
    process.env.CHANGEYARD_TEST_GITLAB_TOKEN = previousGitLabToken;
  }
});

test("HTTP provider helper surfaces remote status and JSON errors", () => {
  try {
    setHttpTransportForTests(() => ({ status: 422, body: JSON.stringify({ message: "Validation failed" }) }));
    assert.throws(() => curlJson({ method: "POST", url: "https://api.example.test/issues", token: "token", payload: {} }), /HTTP 422.*Validation failed/);
    setHttpTransportForTests(() => ({ status: 200, body: "not-json" }));
    assert.throws(() => curlJson({ method: "POST", url: "https://api.example.test/issues", token: "token", payload: {} }), /invalid JSON/);
  } finally {
    setHttpTransportForTests();
  }
});


test("package metadata includes release smoke scripts", () => {
  const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  assert.equal(packageJson.scripts.prepack, "pnpm run build");
  assert.equal(packageJson.scripts.cli, "node scripts/cy.mjs");
  assert.equal(packageJson.scripts.test, "pnpm run build && node --test --test-force-exit dist/tests/*.test.js");
  assert.equal(packageJson.scripts["build:kanban"], "pnpm --filter @changeyard/kanban run build");
  assert.equal(packageJson.scripts["pack:check"], "pnpm run build && pnpm pack --dry-run");
  assert.equal(packageJson.bin.cy, "./scripts/cy.mjs");
  assert.equal(packageJson.engines.node, ">=22.0.0");
  assert.deepEqual(packageJson.files, [
    "dist/src",
    "packages/kanban/dist",
    "packages/kanban/package.json",
    "packages/kanban/README.md",
    "packages/merge/dist",
    "packages/merge/package.json",
    "packages/tui/dist",
    "packages/tui/package.json",
    "README.md",
    "docs",
    "scripts",
  ]);
});


test("runtime config validation rejects unknown fields", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"noop","unexpected":true}}\n`);
    assert.throws(() => loadConfig(repo), /provider\.unexpected is not allowed/);
  } finally {
    cleanup(repo);
  }
});

test("doctor reports workspace drift and recover all repairs missing markers", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Drift workspace" }, repo);
    runStart("CY-0001", repo);
    const markerPath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo", ".changeyard-workspace.json");
    rmSync(markerPath, { force: true });
    assert.match(runDoctor(repo), /missing workspace marker; run cy recover CY-0001/);
    assert.match(runRecover("all", repo), /Repaired CY-0001/);
    assert.match(runDoctor(repo), /workspace: CY-0001/);
  } finally {
    cleanup(repo);
  }
});

test("doctor reports and fixes tracked local workspace marker files", () => {
  if (!hasCommand("git")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard-workspace.json"), "{}\n");
    runCommand("git", ["add", "-f", ".changeyard-workspace.json"], repo);
    assert.match(runDoctor(repo), /workspace marker files are tracked but must be local-only/);
    assert.match(runDoctor(repo, { fix: true }), /Untracked local workspace marker files/);
    assert.equal(commandOutput("git", ["ls-files", "--", ".changeyard-workspace.json"], repo), "");
    assert.equal(existsSync(path.join(repo, ".changeyard-workspace.json")), true);
  } finally {
    cleanup(repo);
  }
});

function runCommand(command: string, args: string[], cwd: string): void {
  const nextArgs = normalizeCommandArgs(command, args);
  const result = spawnSync(command, nextArgs, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} ${args.join(" ")} failed`);
}

function commandOutput(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, normalizeCommandArgs(command, args), { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} ${args.join(" ")} failed`);
  return String(result.stdout ?? "").trim();
}

function hasCommand(command: string): boolean {
  return spawnSync(command, normalizeCommandArgs(command, ["--version"]), { encoding: "utf8" }).status === 0;
}

function normalizeCommandArgs(command: string, args: string[]): string[] {
  if (command === "git") {
    return [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "tag.gpgsign=false",
      ...(args[0] === "commit" ? ["commit", "--no-gpg-sign", ...args.slice(1)] : args),
    ];
  }
  if (command !== "jj") {
    return args;
  }
  return ["--color=never", ...stripJjColorArgs(args)];
}

function stripJjColorArgs(args: string[]): string[] {
  const next: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--color") {
      index++;
      continue;
    }
    if (arg.startsWith("--color=")) {
      continue;
    }
    next.push(arg);
  }
  return next;
}

test("git-worktree engine integrates with a real temporary git repository", () => {
  if (!hasCommand("git")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("git", ["config", "user.email", "changeyard@example.test"], repo);
    runCommand("git", ["config", "user.name", "Changeyard Test"], repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const engine = new GitWorktreeEngine();
    const metadata = { changeId: "CY-0001", engine: "git-worktree", name: "cy-CY-0001", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now", branch: "cy/CY-0001-real" };
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata: created }), { valid: true, errors: [] });
  } finally {
    cleanup(repo);
  }
});

test("jj workspace engine can verify a real jj workspace when jj is installed", () => {
  if (!hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const engine = new JjWorkspaceEngine();
    const metadata = { changeId: "CY-0001", engine: "jj", name: "cy-CY-0001-real", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now" };
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata: created }), { valid: true, errors: [] });
  } finally {
    cleanup(repo);
  }
});

test("jj start commits metadata seed when changeyard metadata is tracked and leaves unrelated root wip", () => {
  if (!hasCommand("git") || !hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.name", "Changeyard Test"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.email", "changeyard@example.test"], repo);
    runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("jj", ["commit", "-m", "initial"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runInit(repo);
    enableGeneratedFileTracking(repo);
    assert.doesNotMatch(gitExclude(repo), /^\.changeyard\/$/m);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"vcs":{"engine":"jj","fallback":"plain-copy"},"checks":{"standard":["node -v"]}}\n`);
    runCommand("jj", ["commit", "-m", "init changeyard"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runCreate({ template: "agent-task", title: "Seed jj metadata" }, repo);
    writeFileSync(path.join(repo, "root-wip.txt"), "root only\n");

    const startOutput = runStart("CY-0001", repo);
    assert.match(startOutput, /Metadata seed: committed CY-0001 to main/);
    assert.match(startOutput, /Workspace description: CY-0001: Seed jj metadata/);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const rootChangePath = path.join(repo, ".changeyard", "changes", "CY-0001-seed-jj-metadata.md");
    const workspaceChangePath = path.join(workspacePath, ".changeyard", "changes", "CY-0001-seed-jj-metadata.md");
    assert.equal(parseFrontmatter(readFileSync(rootChangePath, "utf8")).frontmatter.status, "ready");
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "in_progress");
    assert.equal(commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "description"], workspacePath), "CY-0001: Seed jj metadata");
    assert.equal(commandOutput("jj", ["file", "show", "-r", "main", "--", ".changeyard/changes/CY-0001-seed-jj-metadata.md"], repo).includes("status: ready"), true);
    const rootDiff = commandOutput("jj", ["diff", "--name-only"], repo).split("\n").filter(Boolean);
    assert.equal(rootDiff.includes("root-wip.txt"), true);
    assert.equal(rootDiff.includes(".changeyard/changes/CY-0001-seed-jj-metadata.md"), false);
  } finally {
    cleanup(repo);
  }
});

test("jj start writes active change file when changeyard metadata is locally ignored", () => {
  if (!hasCommand("git") || !hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.name", "Changeyard Test"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.email", "changeyard@example.test"], repo);
    runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("jj", ["commit", "-m", "initial"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runInit(repo);
    const excludePath = path.join(repo, ".git", "info", "exclude");
    writeFileSync(excludePath, `${readFileSync(excludePath, "utf8").replace(/\n*$/u, "\n")}.changeyard/\n`);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"vcs":{"engine":"jj","fallback":"plain-copy"},"checks":{"standard":["node -v"]}}\n`);
    const ignored = spawnSync("git", ["check-ignore", ".changeyard/changes/CY-0001-ignored-jj-metadata.md"], { cwd: repo, encoding: "utf8" });
    assert.equal(ignored.status, 0, ignored.stderr || ignored.stdout);

    runCreate({ template: "agent-task", title: "Ignored jj metadata" }, repo);
    const startOutput = runStart("CY-0001", repo);
    assert.doesNotMatch(startOutput, /Metadata seed:/);

    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const workspaceChangePath = path.join(workspacePath, ".changeyard", "changes", "CY-0001-ignored-jj-metadata.md");
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "in_progress");
    assert.match(runVerify("CY-0001", workspacePath), /Verified CY-0001/);

    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    updateSection(workspaceChangePath, "Acceptance Criteria", "- [x] Ignored JJ metadata supports completion");
    updateSection(workspaceChangePath, "Completion Notes", "Implemented ignored metadata handling. Checks ran: node -v.");
    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /Completed CY-0001: 1 checks passed/);
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "ready_for_pr");
    assert.equal(parseFrontmatter(readFileSync(path.join(repo, ".changeyard", "changes", "CY-0001-ignored-jj-metadata.md"), "utf8")).frontmatter.status, "ready");
  } finally {
    cleanup(repo);
  }
});

test("jj repair normalizes an empty child back to the recorded workspace change", () => {
  if (!hasCommand("git") || !hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.name", "Changeyard Test"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.email", "changeyard@example.test"], repo);
    runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("jj", ["commit", "-m", "initial"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"vcs":{"engine":"jj","fallback":"plain-copy"},"checks":{"standard":["node -v"]}}\n`);
    runCommand("jj", ["commit", "-m", "init changeyard"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runCreate({ template: "agent-task", title: "Repair empty child" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const metadata = JSON.parse(readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "metadata.json"), "utf8")) as { workspaceChangeId: string };
    runCommand("jj", ["new", "@"], workspacePath);
    assert.notEqual(commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], workspacePath), metadata.workspaceChangeId);

    const output = runRepair("CY-0001", { workspace: true }, repo);
    assert.match(output, /abandoned empty child/);
    assert.equal(commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], workspacePath), metadata.workspaceChangeId);
  } finally {
    cleanup(repo);
  }
});

test("jj workspace status overlays root status in list, board, and next action", () => {
  if (!hasCommand("git") || !hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.name", "Changeyard Test"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.email", "changeyard@example.test"], repo);
    runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("jj", ["commit", "-m", "initial"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"vcs":{"engine":"jj","fallback":"plain-copy"},"checks":{"standard":["node -v"]}}\n`);
    runCommand("jj", ["commit", "-m", "init changeyard"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runCreate({ template: "agent-task", title: "Overlay workspace status" }, repo);
    runStart("CY-0001", repo);

    const rootChangePath = path.join(repo, ".changeyard", "changes", "CY-0001-overlay-workspace-status.md");
    assert.equal(parseFrontmatter(readFileSync(rootChangePath, "utf8")).frontmatter.status, "ready");
    assert.equal(getStatus("CY-0001", repo).status, "in_progress");
    assert.match(runStatus("CY-0001", repo), /status: in_progress/);
    assert.equal(listChanges(repo).find((change) => change.id === "CY-0001")?.status, "in_progress");
    assert.match(runList(repo), /CY-0001\tin_progress/);
    assert.equal(getNextAction("CY-0001", repo).nextKind, "complete");
    const boardCards = createChangeyardBoardService(repo).getBoard().columns.flatMap((column) => column.cards);
    assert.equal(boardCards.find((card) => card.id === "CY-0001")?.status, "in_progress");
  } finally {
    cleanup(repo);
  }
});

test("jj verify complete and land reject invalid landing stack descriptions", () => {
  if (!hasCommand("git") || !hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.name", "Changeyard Test"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.email", "changeyard@example.test"], repo);
    runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("jj", ["commit", "-m", "initial"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"vcs":{"engine":"jj","fallback":"plain-copy"},"checks":{"standard":["node -v"]}}\n`);
    runCommand("jj", ["commit", "-m", "init changeyard"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runCreate({ template: "agent-task", title: "Validate jj descriptions" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const workspaceChangePath = path.join(workspacePath, ".changeyard", "changes", "CY-0001-validate-jj-descriptions.md");
    const metadata = JSON.parse(readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "metadata.json"), "utf8")) as { workspaceChangeId?: string };
    const workspaceChangeId = metadata.workspaceChangeId!;

    runCommand("jj", ["new", "@-"], workspacePath);
    writeFileSync(path.join(workspacePath, "empty-description.txt"), "empty description\n");
    const emptyDescriptionChange = commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], workspacePath);
    runCommand("jj", ["rebase", "-r", workspaceChangeId, "-o", "@"], workspacePath);
    runCommand("jj", ["edit", workspaceChangeId], workspacePath);

    runCommand("jj", ["new", emptyDescriptionChange, "-m", "Missing prefix"], workspacePath);
    writeFileSync(path.join(workspacePath, "missing-prefix.txt"), "missing prefix\n");
    runCommand("jj", ["rebase", "-r", workspaceChangeId, "-o", "@"], workspacePath);
    runCommand("jj", ["edit", workspaceChangeId], workspacePath);

    const captureFailure = (run: () => void): string => {
      try {
        run();
      } catch (error) {
        return String(error);
      }
      assert.fail("Expected command to reject invalid JJ descriptions");
    };
    const assertInvalidDescriptionFailure = (message: string): void => {
      assert.match(message, /JJ workspace commit descriptions must start with CY-0001:/);
      assert.match(message, /empty description/);
      assert.match(message, /description must start with "CY-0001:"/);
      assert.match(message, /jj describe/);
    };
    assertInvalidDescriptionFailure(captureFailure(() => runVerify("CY-0001", workspacePath)));

    updateSection(workspaceChangePath, "Acceptance Criteria", "- [x] JJ description blockers are reported");
    updateSection(workspaceChangePath, "Completion Notes", "Updated invalid description test files. Checks ran: node -v.");
    assertInvalidDescriptionFailure(captureFailure(() => runComplete("CY-0001", { noPr: true }, workspacePath)));

    const parsed = parseFrontmatter(readFileSync(workspaceChangePath, "utf8"));
    writeFileSync(workspaceChangePath, writeFrontmatter({ ...parsed.frontmatter, status: "ready_for_pr" }, parsed.body));
    const dryRun = runLand("CY-0001", { dryRun: true, keepWorkspace: true }, repo);
    assert.match(dryRun, /landingDescriptions: blocked/);
    assert.match(dryRun, /blocker: .*empty description/);
    assert.match(dryRun, /blocker: .*description must start with "CY-0001:"/);
    assertInvalidDescriptionFailure(captureFailure(() => runLand("CY-0001", { keepWorkspace: true }, repo)));
    assert.equal(existsSync(path.join(repo, ".changeyard", "workspaces", "CY-0001")), true);
  } finally {
    cleanup(repo);
  }
});

test("land rebases and lands a described jj workspace task commit without root wip", () => {
  if (!hasCommand("git") || !hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.name", "Changeyard Test"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.email", "changeyard@example.test"], repo);
    runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("jj", ["commit", "-m", "initial"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"vcs":{"engine":"jj","fallback":"plain-copy"},"checks":{"standard":["node -v"]}}\n`);
    runCommand("jj", ["commit", "-m", "init changeyard"], repo);
    runCommand("jj", ["bookmark", "set", "main", "-r", "@-"], repo);

    runCreate({ template: "agent-task", title: "Land jj workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const metadata = JSON.parse(readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "metadata.json"), "utf8")) as { targetRef?: string; baseCommitId?: string; workspaceChangeId?: string; seedDescription?: string };
    assert.equal(metadata.targetRef, "main");
    assert.ok(metadata.baseCommitId);
    assert.ok(metadata.workspaceChangeId);
    assert.equal(metadata.seedDescription, "CY-0001: Land jj workspace");
    const workspaceChangeId = metadata.workspaceChangeId!;
    const rootChangePath = path.join(repo, ".changeyard", "changes", "CY-0001-land-jj-workspace.md");
    const workspaceChangePath = path.join(workspacePath, ".changeyard", "changes", "CY-0001-land-jj-workspace.md");
    assert.equal(parseFrontmatter(readFileSync(rootChangePath, "utf8")).frontmatter.status, "ready");
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "in_progress");

    const advanceWorkspace = path.join(repo, ".changeyard", "workspaces", "advance-main", "repo");
    mkdirSync(path.dirname(advanceWorkspace), { recursive: true });
    runCommand("jj", ["workspace", "add", "--name", "advance-main", "-r", "main", "-m", "advance main", advanceWorkspace], repo);
    writeFileSync(path.join(advanceWorkspace, "advance.txt"), "advance\n");
    runCommand("jj", ["bookmark", "set", "main", "-r", "@"], advanceWorkspace);
    runCommand("jj", ["workspace", "forget", "advance-main"], repo);
    rmSync(path.dirname(advanceWorkspace), { recursive: true, force: true });

    runCommand("jj", ["new", "@-", "-m", "CY-0001: Ancestor A"], workspacePath);
    writeFileSync(path.join(workspacePath, "ancestor-a.txt"), "ancestor A\n");
    const ancestorA = commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], workspacePath);
    runCommand("jj", ["rebase", "-r", workspaceChangeId, "-o", "@"], workspacePath);
    runCommand("jj", ["edit", workspaceChangeId], workspacePath);
    runCommand("jj", ["new", ancestorA, "-m", "CY-0001: Ancestor B"], workspacePath);
    writeFileSync(path.join(workspacePath, "ancestor-b.txt"), "ancestor B\n");
    runCommand("jj", ["rebase", "-r", workspaceChangeId, "-o", "@"], workspacePath);
    runCommand("jj", ["edit", workspaceChangeId], workspacePath);

    writeFileSync(path.join(workspacePath, "landed.txt"), "landed\n");
    updateSection(workspaceChangePath, "Acceptance Criteria", "- [x] JJ workspace work is landed locally");
    updateSection(workspaceChangePath, "Completion Notes", "Implemented the workspace file. Checks ran: node -v.");
    writeFileSync(path.join(repo, "root-wip.txt"), "root only\n");

    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /Next: cy land CY-0001/);
    assert.equal(parseFrontmatter(readFileSync(rootChangePath, "utf8")).frontmatter.status, "ready");
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "ready_for_pr");
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /landingDescription: ok/);
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /landingDescriptions: ok/);
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /metadataSource: workspace/);
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /targetMoved: true/);
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /landingRevset:/);
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /landingFiles: .*landed\.txt/);
    assert.throws(() => runLand("CY-0001", {}, repo), /run cy refresh CY-0001 --target main before landing/);
    assert.match(runRefresh("CY-0001", { dryRun: true }, repo), /Dry-run: would refresh CY-0001 onto main/);
    assert.match(runRefresh("CY-0001", {}, repo), /Refreshed CY-0001 onto main/);
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /targetMoved: false/);
    assert.match(runLand("CY-0001", {}, repo), /Landed CY-0001 into main/);

    assert.equal(existsSync(path.join(repo, ".changeyard", "workspaces", "CY-0001")), false);
    assert.equal(parseFrontmatter(readFileSync(rootChangePath, "utf8")).frontmatter.status, "merged");
    assert.equal(commandOutput("jj", ["file", "show", "-r", "main", "--", "ancestor-a.txt"], repo), "ancestor A");
    assert.equal(commandOutput("jj", ["file", "show", "-r", "main", "--", "ancestor-b.txt"], repo), "ancestor B");
    assert.equal(commandOutput("jj", ["file", "show", "-r", "main", "--", "landed.txt"], repo), "landed");
    assert.equal(commandOutput("jj", ["file", "show", "-r", "main", "--", "advance.txt"], repo), "advance");
    const rootWipResult = spawnSync("jj", normalizeCommandArgs("jj", ["file", "show", "-r", "main", "--", "root-wip.txt"]), { cwd: repo, encoding: "utf8" });
    assert.notEqual(rootWipResult.status, 0);
    const mainMetadataResult = spawnSync("jj", normalizeCommandArgs("jj", ["file", "show", "-r", "main", "--", ".changeyard/changes/CY-0001-land-jj-workspace.md"]), { cwd: repo, encoding: "utf8" });
    assert.notEqual(mainMetadataResult.status, 0);
    runCommand("jj", ["rebase", "-r", "@", "-d", "main"], repo);
    assert.equal(commandOutput("jj", ["diff", "--name-only"], repo).split("\n").filter(Boolean).includes("root-wip.txt"), true);
  } finally {
    cleanup(repo);
  }
});

test("install symlinks package bin names into a local directory", () => {
  const installDir = tempRepo();
  const repoRoot = repoRootFromModule(new URL("../src/commands/install-cli.ts", import.meta.url));
  const launcher = path.resolve(repoRoot, "scripts", "cy.mjs");
  const names = cliBinNames(repoRoot);
  try {
    assert.ok(existsSync(launcher));
    assert.deepEqual(names, ["changeyard", "cy"]);

    const output = runInstallCli({ dir: installDir });
    assert.match(output, /Linked/);
    for (const name of names) {
      const linkPath = path.join(installDir, name);
      assert.ok(existsSync(linkPath));
      assert.ok(lstatSync(linkPath).isSymbolicLink());
      assert.equal(path.resolve(path.dirname(linkPath), readlinkSync(linkPath)), launcher);
    }

    const again = runInstallCli({ dir: installDir });
    assert.match(again, /Already linked/);

    const removed = runUninstallCli({ dir: installDir });
    assert.match(removed, /Removed/);
    for (const name of names) {
      assert.equal(existsSync(path.join(installDir, name)), false);
    }
  } finally {
    cleanup(installDir);
  }
});

test("install refuses to overwrite an unrelated binary", () => {
  const installDir = tempRepo();
  try {
    mkdirSync(installDir, { recursive: true });
    writeFileSync(path.join(installDir, "cy"), "#!/bin/sh\n");
    assert.throws(() => runInstallCli({ dir: installDir }), /Refusing to overwrite/);
  } finally {
    cleanup(installDir);
  }
});

test("install makes the launcher executable", () => {
  const installDir = tempRepo();
  const repoRoot = repoRootFromModule(new URL("../src/commands/install-cli.ts", import.meta.url));
  const launcher = path.resolve(repoRoot, "scripts", "cy.mjs");
  const originalMode = statSync(launcher).mode;
  try {
    chmodSync(launcher, 0o644);
    const output = runInstallCli({ dir: installDir });
    assert.match(output, /Made executable/);
    assert.notEqual(statSync(launcher).mode & 0o111, 0);
  } finally {
    chmodSync(launcher, originalMode);
    runUninstallCli({ dir: installDir });
    cleanup(installDir);
  }
});

test("ensureExecutable is a no-op when the launcher is already executable", () => {
  const repoRoot = repoRootFromModule(new URL("../src/commands/install-cli.ts", import.meta.url));
  const launcher = path.resolve(repoRoot, "scripts", "cy.mjs");
  const originalMode = statSync(launcher).mode;
  try {
    chmodSync(launcher, 0o755);
    assert.equal(ensureExecutable(launcher), false);
    assert.equal(statSync(launcher).mode & 0o777, 0o755);
  } finally {
    chmodSync(launcher, originalMode);
  }
});

test("cy install and uninstall work through the CLI", () => {
  const installDir = tempRepo();
  const repoRoot = repoRootFromModule(new URL("../src/commands/install-cli.ts", import.meta.url));
  const launcher = path.resolve(repoRoot, "scripts", "cy.mjs");
  try {
    const install = spawnSync(nodeBinary(), [cliBinPath(), "install", "--dir", installDir], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(install.stdout, /Linked/);
    assert.equal(path.resolve(path.dirname(path.join(installDir, "cy")), readlinkSync(path.join(installDir, "cy"))), launcher);

    const uninstall = spawnSync(nodeBinary(), [cliBinPath(), "uninstall", "--dir", installDir], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
    assert.match(uninstall.stdout, /Removed/);
    assert.equal(existsSync(path.join(installDir, "cy")), false);
  } finally {
    cleanup(installDir);
  }
});
