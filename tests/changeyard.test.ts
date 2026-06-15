import assert from "node:assert/strict";
import { existsSync, lstatSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCompletions } from "../src/commands/completions.js";
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
import { getHubStatus, runHubStatus } from "../src/commands/hub.js";
import { runHydrate } from "../src/commands/hydrate.js";
import { runInit } from "../src/commands/init.js";
import { runLand } from "../src/commands/land.js";
import { runUpdate } from "../src/commands/update.js";
import { getNextAction, runNext } from "../src/commands/next.js";
import { formatCommandPreview } from "../src/scaffold/command-generation/generator.js";
import { cursorAdapter } from "../src/scaffold/command-generation/adapters/cursor.js";
import { getCommandContents } from "../src/scaffold/templates/commands.js";
import { CANONICAL_SKILL_RELATIVE_PATH } from "../src/scaffold/skill-generation.js";
import { listChanges, runList } from "../src/commands/list.js";
import { runRecover } from "../src/commands/recover.js";
import { runReviewComplete, runReviewStart } from "../src/commands/review.js";
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
import { curlJson, setHttpTransportForTests, type HttpRequest } from "../src/providers/http.js";
import { GitWorktreeEngine } from "../src/workspace/GitWorktreeEngine.js";
import { JjWorkspaceEngine } from "../src/workspace/JjWorkspaceEngine.js";

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-test-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function cliBinPath(): string {
  return path.join(process.cwd(), "dist", "src", "cli.js");
}

function nodeBinary(): string {
  return process.argv[0] ?? "node";
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
    writeFileSync(skillPath, "# custom\n");
    const output = runUpdate(repo, { tools: "cursor" });
    assert.match(output, /Updated Changeyard scaffold/);
    assert.match(readFileSync(skillPath, "utf8"), /Changeyard Agent Protocol/);
    const config = readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8");
    assert.doesNotThrow(() => JSON.parse(config));
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
  assert.match(formatted, /Create a new Changeyard change/);
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
    const result = spawnSync(nodeBinary(), [cliBinPath(), "create", "--quick", "--title", "Docs wording", "--json"], {
      cwd: repo,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout ?? "");
    assert.equal(payload.ok, true);
    assert.equal(payload.command, "create");
    assert.match(payload.message, /Created CY-0001: \.changeyard\/changes\/CY-0001-docs-wording\.md/);

    const parsed = parseFrontmatter(readFileSync(path.join(repo, ".changeyard", "changes", "CY-0001-docs-wording.md"), "utf8"));
    assert.equal(parsed.frontmatter.type, "quick");
    assert.deepEqual(parsed.frontmatter.planning, { model: "none" });
    assert.deepEqual(parsed.frontmatter.workflow, { mode: "quick", risk: "low", requiresWorkspace: true });
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

test("cli help describes commands and hub lifecycle", () => {
  const help = spawnSync(nodeBinary(), [cliBinPath(), "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Commands:/);
  assert.match(help.stdout, /cy create\s+create a local markdown change/);
  assert.match(help.stdout, /cy hub\s+manage the shared UI\/runtime hub/);
  assert.match(help.stdout, /cy --kanban\s+open the Kanban browser client/);

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

test("cli dashboard command is removed", () => {
  const result = spawnSync(nodeBinary(), [cliBinPath(), "dashboard"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cy dashboard was removed/);
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
    assert.equal(getNextAction("CY-0001", repo).nextCommand, "cy validate CY-0001");
    assert.match(runNext("CY-0001", repo), /Next: cy validate CY-0001/);

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
    const change = readFileSync(changePath, "utf8").replace("Summarize what changed, what checks ran, and what risks remain.", "Implemented workspace changes and ran checks.");
    writeFileSync(changePath, change);
    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /Completed CY-0001: 1 checks passed/);
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "ready_for_pr");
    assert.match(readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "logs", "checks.log"), "utf8"), /node -v/);
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
    writeFileSync(changePath, readFileSync(changePath, "utf8").replace("Summarize what changed, what checks ran, and what risks remain.", "Completed the planned work."));
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
    writeFileSync(changePath, readFileSync(changePath, "utf8").replace("Summarize what changed, what checks ran, and what risks remain.", "Completed the planned work."));
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
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-open-local-pr.md");
    writeFileSync(changePath, readFileSync(changePath, "utf8").replace("Summarize what changed, what checks ran, and what risks remain.", "Implemented PR creation and ran checks."));
    assert.match(runComplete("CY-0001", {}, workspacePath), /status pr_open/);
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "pr_open");
    const pr = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "pull-requests", "0001-CY-0001.md"), "utf8");
    assert.match(pr, /draft: true/);
    assert.match(pr, /base: main/);
  } finally {
    cleanup(repo);
  }
});

test("doctor reports configured provider and recover rewrites workspace marker", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Recover workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    rmSync(path.join(workspacePath, ".changeyard-workspace.json"), { force: true });
    assert.match(runDoctor(repo), /provider: noop/);
    assert.deepEqual(doctorReport(repo).warnings, ["CY-0001: missing workspace marker; run cy recover CY-0001"]);
    assert.match(runRecover("CY-0001", repo), /Recovered CY-0001/);
    assert.deepEqual(doctorReport(repo).warnings, []);
    assert.match(readFileSync(path.join(workspacePath, ".changeyard-workspace.json"), "utf8"), /metadataPath/);
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

test("jj workspace engine creates and verifies expected jj workspace", () => {
  const repo = tempRepo();
  try {
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    mkdirSync(workspacePath, { recursive: true });
    const calls: string[] = [];
    const engine = new JjWorkspaceEngine((command, args, cwd) => {
      calls.push(`${cwd}: ${command} ${args.join(" ")}`);
      if (args.join(" ") === "workspace root") return workspacePath;
      if (args.join(" ") === "workspace list") return "cy-CY-0001 abc123";
      if (args.join(" ") === "status") return "The working copy is clean";
      if (args.join(" ") === "log --ignore-working-copy --at-op=@ -r @ --no-graph -T commit_id") return "commit123";
      if (args.join(" ") === "log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short()") return "change123";
      return "";
    });
    const metadata = { changeId: "CY-0001", engine: "jj", name: "cy-CY-0001", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now", targetRef: "main", seedDescription: "CY-0001: Test task" };
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.ok(calls.some((call) => call.includes("jj workspace add --name cy-CY-0001 -r main -m CY-0001: Test task")));
    assert.equal(created.workspaceChangeId, "change123");
    assert.equal(created.workspaceCommitId, "commit123");
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata }), { valid: true, errors: [] });
    engine.publish({ cwd: workspacePath, metadata, branch: "cy/CY-0001" });
    assert.ok(calls.some((call) => call.includes("jj bookmark set cy/CY-0001 -r @")));
    assert.ok(calls.some((call) => call.includes("jj git push --bookmark cy/CY-0001")));
  } finally {
    cleanup(repo);
  }
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
    assert.match(runRecover("all", repo), /Recovered CY-0001/);
    assert.match(runDoctor(repo), /workspace: CY-0001/);
  } finally {
    cleanup(repo);
  }
});

function runCommand(command: string, args: string[], cwd: string): void {
  const nextArgs = command === "git"
    ? [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "tag.gpgsign=false",
        ...(args[0] === "commit" ? ["commit", "--no-gpg-sign", ...args.slice(1)] : args),
      ]
    : args;
  const result = spawnSync(command, nextArgs, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} ${args.join(" ")} failed`);
}

function commandOutput(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} ${args.join(" ")} failed`);
  return String(result.stdout ?? "").trim();
}

function hasCommand(command: string): boolean {
  return spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;
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

test("jj start commits metadata seed and leaves unrelated root wip", () => {
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

    runCreate({ template: "agent-task", title: "Seed jj metadata" }, repo);
    writeFileSync(path.join(repo, "root-wip.txt"), "root only\n");

    assert.match(runStart("CY-0001", repo), /Metadata seed: committed CY-0001 to main/);
    const rootChangePath = path.join(repo, ".changeyard", "changes", "CY-0001-seed-jj-metadata.md");
    const workspaceChangePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo", ".changeyard", "changes", "CY-0001-seed-jj-metadata.md");
    assert.equal(parseFrontmatter(readFileSync(rootChangePath, "utf8")).frontmatter.status, "ready");
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "in_progress");
    assert.equal(commandOutput("jj", ["file", "show", "-r", "main", "--", ".changeyard/changes/CY-0001-seed-jj-metadata.md"], repo).includes("status: ready"), true);
    const rootDiff = commandOutput("jj", ["diff", "--name-only"], repo).split("\n").filter(Boolean);
    assert.equal(rootDiff.includes("root-wip.txt"), true);
    assert.equal(rootDiff.includes(".changeyard/changes/CY-0001-seed-jj-metadata.md"), false);
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

    writeFileSync(path.join(workspacePath, "landed.txt"), "landed\n");
    updateSection(workspaceChangePath, "Acceptance Criteria", "- [x] JJ workspace work is landed locally");
    updateSection(workspaceChangePath, "Completion Notes", "Implemented the workspace file. Checks ran: node -v.");
    writeFileSync(path.join(repo, "root-wip.txt"), "root only\n");

    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /Next: cy land CY-0001/);
    assert.equal(parseFrontmatter(readFileSync(rootChangePath, "utf8")).frontmatter.status, "ready");
    assert.equal(parseFrontmatter(readFileSync(workspaceChangePath, "utf8")).frontmatter.status, "ready_for_pr");
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /landingDescription: ok/);
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /metadataSource: workspace/);
    assert.match(runLand("CY-0001", { dryRun: true }, repo), /targetMoved: true/);
    assert.match(runLand("CY-0001", {}, repo), /Landed CY-0001 into main/);

    assert.equal(existsSync(path.join(repo, ".changeyard", "workspaces", "CY-0001")), false);
    assert.equal(commandOutput("jj", ["file", "show", "-r", "main", "--", "landed.txt"], repo), "landed");
    assert.equal(commandOutput("jj", ["file", "show", "-r", "main", "--", "advance.txt"], repo), "advance");
    const rootWipResult = spawnSync("jj", ["file", "show", "-r", "main", "--", "root-wip.txt"], { cwd: repo, encoding: "utf8" });
    assert.notEqual(rootWipResult.status, 0);
    const parsed = parseFrontmatter(commandOutput("jj", ["file", "show", "-r", "main", "--", ".changeyard/changes/CY-0001-land-jj-workspace.md"], repo));
    assert.equal(parsed.frontmatter.status, "merged");
    runCommand("jj", ["rebase", "-r", "@", "-d", "main"], repo);
    const metadataConflicts = spawnSync("jj", ["resolve", "--list", "--", ".changeyard/changes/CY-0001-land-jj-workspace.md"], { cwd: repo, encoding: "utf8" });
    assert.notEqual(metadataConflicts.status, 0);
    assert.match(String(metadataConflicts.stderr ?? ""), /No conflicts found/);
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
