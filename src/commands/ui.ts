import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChangeyardCard, ChangeyardCardDetail } from "../board/boardTypes.js";
import { createChangeyardBoardService } from "../board/boardService.js";
import { runComplete } from "./complete.js";
import { createChange } from "./create.js";
import { getPlanPrompt } from "./plan.js";
import { runReviewComplete, runReviewStart, type ReviewDecision } from "./review.js";
import { runVerify } from "./verify.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, storageRoot } from "../paths.js";
import { parseMarkedSections } from "../planning/sections.js";
import type { ValidationGate } from "../planning/validation.js";
import { findRepoRoot, loadConfig } from "../config/loadConfig.js";
import { isChangeyardInitialized, updateLocalConfig } from "../config/localConfig.js";
import { runInit } from "./init.js";
import { runUpdate } from "./update.js";
import { doctorReport } from "./doctor.js";
import { DEFAULT_PLANNING_SECTION_ORDER, STRICT_PLANNING_SECTION_ORDER, type PlanningSectionId } from "../planning/types.js";
import { findChangeFile } from "../state/id.js";
import { importKanbanServer, resolveUiServerModuleUrl as resolveRuntimeUrl } from "../dev/runtime.js";

export type UiOptions = {
  host?: string;
  port?: number | "auto";
  open?: boolean;
};

const PLANNING_SECTION_TITLES: Record<PlanningSectionId, string> = {
  proposal: "Proposal",
  "spec-deltas": "Specification Deltas",
  design: "Design",
  tasks: "Tasks",
  verification: "Verification",
  clarifications: "Clarifications",
  "requirements-checklist": "Requirements Checklist",
  analysis: "Consistency Analysis",
};

export function createChangeyardUiApi() {
  function toProjectConfig(repoRoot: string, config = loadConfig(repoRoot)) {
    return {
      initialized: isChangeyardInitialized(repoRoot),
      providerType: config.provider.type,
      vcsEngine: config.vcs.engine,
      vcsFallback: config.vcs.fallback,
      projectDefaultBase: config.project.defaultBase,
      planningDefaultProfile: config.planning?.defaultProfile,
      planningDefaultStrictness: config.planning?.defaultStrictness,
      planningAllowQuickChanges: config.planning?.allowQuickChanges,
      planningQuickChangeCheckProfile: config.planning?.quickChangeCheckProfile,
    };
  }

  function findCanonicalChangePath(repoRoot: string, id: string): string {
    const config = loadConfig(repoRoot);
    const filePath = findChangeFile(changesRoot(repoRoot, config), id);
    if (!filePath) {
      throw new Error(`Change not found: ${id}`);
    }
    return filePath;
  }

  function validateChangeForUi(repoRoot: string, id: string): void {
    const config = loadConfig(repoRoot);
    const root = storageRoot(repoRoot, config);
    const filePath = findCanonicalChangePath(repoRoot, id);
    const gates: Array<{ gate: ValidationGate; label: string }> = [
      { gate: "document", label: "Document Validation" },
      { gate: "sync", label: "Sync Gate" },
      { gate: "start", label: "Start Gate" },
      { gate: "complete", label: "Complete Gate" },
    ];
    const failures = gates
      .map(({ gate, label }) => ({ label, result: validateChangeFile(filePath, root, { gate, config }) }))
      .filter(({ result }) => !result.valid);
    if (failures.length === 0) {
      return;
    }
    const message = failures
      .map(({ label, result }) => `${label}:\n${result.errors.map((error) => `- ${error}`).join("\n")}`)
      .join("\n\n");
    throw new Error(message);
  }

  function toChangeSummary(change: ChangeyardCard) {
    return {
      id: change.id,
      title: change.title,
      type: change.type,
      status: change.status,
      path: change.path,
      labels: change.labels,
      updatedAt: change.updatedAt,
      planning: change.planning ?? null,
      remote: change.provider
        ? {
            provider: change.provider.type,
            issueUrl: change.provider.issueUrl,
            pullRequestUrl: change.provider.pullRequestUrl,
          }
        : undefined,
      workspace: change.workspace
        ? {
            engine: change.workspace.engine,
            name: change.workspace.name,
            path: change.workspace.path,
            branch: change.workspace.branch,
          }
        : undefined,
    };
  }

  function toChangeDetail(change: ChangeyardCardDetail) {
    const markedSections = parseMarkedSections(change.body);
    const planningSectionOrder = change.planning?.strictness === "strict"
      ? [...DEFAULT_PLANNING_SECTION_ORDER, ...STRICT_PLANNING_SECTION_ORDER]
      : DEFAULT_PLANNING_SECTION_ORDER;
    return {
      ...toChangeSummary(change),
      body: change.body,
      sections: planningSectionOrder
        .filter((sectionId) => markedSections.has(sectionId))
        .map((sectionId) => ({
          id: sectionId,
          title: PLANNING_SECTION_TITLES[sectionId],
          content: markedSections.get(sectionId) ?? "",
        })),
    };
  }

  return {
    listChanges(repoRoot: string) {
      const service = createChangeyardBoardService(repoRoot);
      const board = service.getBoard();
      return board.columns.flatMap((column) => column.cards).map((card) => toChangeSummary(card));
    },
    createChange(repoRoot: string, input: {
      template: "feature" | "bug" | "refactor" | "agent-task" | "quick";
      title: string;
      priority?: string;
      labels?: string[];
      planning?: "none" | "openspec-lite";
      strict?: boolean;
    }) {
      const created = createChange({
        template: input.template,
        title: input.title,
        priority: input.priority,
        labels: input.labels,
        planning: input.planning === "none" ? undefined : input.planning,
        strict: input.strict,
        noPlanning: input.planning === "none",
      }, repoRoot);
      return toChangeDetail(createChangeyardBoardService(repoRoot).getCard(created.id));
    },
    getChange(repoRoot: string, input: { id: string }) {
      try {
        return toChangeDetail(createChangeyardBoardService(repoRoot).getCard(input.id));
      } catch {
        return null;
      }
    },
    validateChange(repoRoot: string, input: { id: string }) {
      validateChangeForUi(repoRoot, input.id);
      return toChangeDetail(createChangeyardBoardService(repoRoot).getCard(input.id));
    },
    syncChange(repoRoot: string, input: { id: string }) {
      return toChangeDetail(createChangeyardBoardService(repoRoot).syncCard(input.id));
    },
    startChange(repoRoot: string, input: { id: string }) {
      return toChangeDetail(createChangeyardBoardService(repoRoot).startCard(input.id));
    },
    verifyChange(repoRoot: string, input: { id: string }) {
      const current = toChangeDetail(createChangeyardBoardService(repoRoot).getCard(input.id));
      const workspacePath = current.workspace?.path;
      if (!workspacePath) {
        throw new Error(`Change ${input.id} has no workspace to verify.`);
      }
      const message = runVerify(input.id, path.resolve(repoRoot, workspacePath));
      return {
        message,
        change: toChangeDetail(createChangeyardBoardService(repoRoot).getCard(input.id)),
      };
    },
    completeChange(repoRoot: string, input: { id: string; noPr?: boolean; profile?: string }) {
      const current = toChangeDetail(createChangeyardBoardService(repoRoot).getCard(input.id));
      const workspacePath = current.workspace?.path;
      if (!workspacePath) {
        throw new Error(`Change ${input.id} has no workspace to complete.`);
      }
      const message = runComplete(input.id, {
        noPr: input.noPr ?? true,
        profile: input.profile,
      }, path.resolve(repoRoot, workspacePath));
      return {
        message,
        change: toChangeDetail(createChangeyardBoardService(repoRoot).getCard(input.id)),
      };
    },
    reviewStart(repoRoot: string, input: { id: string }) {
      const message = runReviewStart(input.id, repoRoot);
      return {
        message,
        change: toChangeDetail(createChangeyardBoardService(repoRoot).getCard(input.id)),
      };
    },
    reviewComplete(repoRoot: string, input: { id: string; decision: ReviewDecision }) {
      const message = runReviewComplete(input.id, input.decision, repoRoot);
      return {
        message,
        change: toChangeDetail(createChangeyardBoardService(repoRoot).getCard(input.id)),
      };
    },
    planningPrompt(repoRoot: string, input: { id: string; sectionId: PlanningSectionId }) {
      return getPlanPrompt(input.id, input.sectionId, repoRoot);
    },
    updatePlanningSection(repoRoot: string, input: {
      id: string;
      sectionId: PlanningSectionId;
      content: string;
      expectedUpdatedAt?: string | null;
    }) {
      return toChangeDetail(createChangeyardBoardService(repoRoot).updatePlanningSection(input.id, {
        sectionId: input.sectionId,
        content: input.content,
        expectedUpdatedAt: input.expectedUpdatedAt,
      }));
    },
    initProject(repoRoot: string) {
      return { message: runInit(repoRoot) };
    },
    updateProject(repoRoot: string) {
      return { message: runUpdate(repoRoot) };
    },
    getProjectConfig(repoRoot: string) {
      return toProjectConfig(repoRoot);
    },
    updateProjectConfig(repoRoot: string, input: {
      providerType?: "noop" | "local-folder" | "forgejo" | "github" | "gitlab";
      vcsEngine?: "plain-copy" | "jj" | "git-worktree";
      vcsFallback?: "plain-copy" | "jj" | "git-worktree";
      projectDefaultBase?: string;
      planningDefaultProfile?: "none" | "openspec-lite";
      planningDefaultStrictness?: "normal" | "strict";
      planningAllowQuickChanges?: boolean;
      planningQuickChangeCheckProfile?: string;
    }) {
      const current = loadConfig(repoRoot);
      const patch: Parameters<typeof updateLocalConfig>[1] = {};
      if (input.providerType) patch.provider = { type: input.providerType };
      if (input.vcsEngine || input.vcsFallback) {
        patch.vcs = {
          engine: input.vcsEngine ?? current.vcs.engine,
          fallback: input.vcsFallback ?? input.vcsEngine ?? current.vcs.fallback,
        };
      }
      if (input.projectDefaultBase !== undefined) {
        patch.project = { defaultBase: input.projectDefaultBase };
      }
      if (
        input.planningDefaultProfile !== undefined
        || input.planningDefaultStrictness !== undefined
        || input.planningAllowQuickChanges !== undefined
        || input.planningQuickChangeCheckProfile !== undefined
      ) {
        patch.planning = {
          defaultProfile: input.planningDefaultProfile ?? current.planning?.defaultProfile,
          defaultStrictness: input.planningDefaultStrictness ?? current.planning?.defaultStrictness,
          allowQuickChanges: input.planningAllowQuickChanges ?? current.planning?.allowQuickChanges,
          quickChangeCheckProfile: input.planningQuickChangeCheckProfile ?? current.planning?.quickChangeCheckProfile,
        };
      }
      const config = updateLocalConfig(repoRoot, patch);
      return toProjectConfig(repoRoot, config);
    },
    doctorProject(repoRoot: string) {
      const report = doctorReport(repoRoot);
      return {
        ok: report.ok,
        warnings: report.warnings,
        notes: report.notes,
      };
    },
  };
}

export function assertUiNodeVersion(): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw new Error("cy ui requires Node.js 22 or newer.");
}

export function resolveUiServerModuleUrl(): URL {
  return resolveRuntimeUrl(import.meta.url);
}

export function importKanbanServerModule() {
  return importKanbanServer(import.meta.url);
}

export async function runUi(options: UiOptions = {}, cwd = process.cwd()): Promise<string> {
  assertUiNodeVersion();
  const repoRoot = findRepoRoot(cwd);
  const config = loadConfig(repoRoot);
  const moduleUrl = resolveUiServerModuleUrl();
  if (!existsSync(fileURLToPath(moduleUrl))) {
    throw new Error("Changeyard UI runtime was not found. Run npm run build or set CHANGEYARD_DEV=1.");
  }

  const loaded = await importKanbanServer(import.meta.url);
  const server = await loaded.startChangeyardKanban({
    repoRoot,
    host: options.host ?? config.ui?.host ?? "127.0.0.1",
    port: options.port ?? config.ui?.port ?? "auto",
    open: options.open ?? config.ui?.open ?? true,
    changeyardApi: createChangeyardUiApi(),
  });
  const runtimeProcess = process as typeof process & {
    once: (event: string, listener: () => void) => void;
    stderr: { write: (text: string) => void };
    exit: (code?: number) => never;
  };

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void server.close()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        runtimeProcess.stderr.write(`Failed to shut down Changeyard UI cleanly after ${signal}: ${message}\n`);
        runtimeProcess.exitCode = 1;
      })
      .finally(() => {
        runtimeProcess.exit();
      });
  };

  runtimeProcess.once("SIGINT", () => shutdown("SIGINT"));
  runtimeProcess.once("SIGTERM", () => shutdown("SIGTERM"));

  return `Changeyard UI running at ${server.url}`;
}
