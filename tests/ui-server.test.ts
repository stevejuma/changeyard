import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { createChange } from "../src/commands/create.js";
import { loadConfig } from "../src/config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../src/documents/frontmatter.js";
import { changesRoot } from "../src/paths.js";
import type { PlanningSectionId } from "../src/planning/types.js";
import { replaceMarkedSection } from "../src/planning/sections.js";
import { findChangeFile } from "../src/state/id.js";
import { runInit } from "../src/commands/init.js";
import { createChangeyardUiApi } from "../src/commands/ui.js";

const { startChangeyardKanban } = await import(pathToFileURL(path.join(process.cwd(), "packages/kanban/dist/server/index.js")).href);

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-ui-server-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").toString().trim()}`);
  }
  return (result.stdout || "").trim();
}

function replacePlanningSection(repoRoot: string, changeId: string, sectionId: PlanningSectionId, content: string): void {
  const config = loadConfig(repoRoot);
  const filePath = findChangeFile(changesRoot(repoRoot, config), changeId);
  if (!filePath) {
    throw new Error(`Could not find change file for ${changeId}`);
  }
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const nextBody = replaceMarkedSection(parsed.body, sectionId, content);
  writeFileSync(filePath, writeFrontmatter(parsed.frontmatter, nextBody));
}

async function trpcQuery<T>(origin: string, procedurePath: string, input?: unknown, workspaceId?: string): Promise<T> {
  const searchParams = new URLSearchParams();
  if (input === undefined) {
    searchParams.set("batch", "1");
    searchParams.set("input", "{}");
  } else {
    searchParams.set("input", JSON.stringify(input));
  }
  const response = await fetch(`${origin}/api/trpc/${procedurePath}?${searchParams.toString()}`, {
    headers: workspaceId ? { "x-kanban-workspace-id": workspaceId } : undefined,
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as
    | { result?: { data?: T } }
    | Array<{ result?: { data?: T } }>;
  if (Array.isArray(payload)) {
    return payload[0]?.result?.data as T;
  }
  return payload.result?.data as T;
}

async function trpcMutation<T>(origin: string, procedurePath: string, input: unknown, workspaceId?: string): Promise<T> {
  const response = await fetch(`${origin}/api/trpc/${procedurePath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(workspaceId ? { "x-kanban-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { result?: { data?: T } };
  return payload.result?.data as T;
}

async function trpcMutationError(origin: string, procedurePath: string, input: unknown, workspaceId?: string): Promise<{
  status: number;
  message: string;
  conflictUpdatedAt?: string | null;
}> {
  const response = await fetch(`${origin}/api/trpc/${procedurePath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(workspaceId ? { "x-kanban-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as {
    error?: {
      message?: string;
      data?: {
        conflictUpdatedAt?: string | null;
      };
    };
  };
  return {
    status: response.status,
    message: payload.error?.message ?? "",
    conflictUpdatedAt: payload.error?.data?.conflictUpdatedAt ?? null,
  };
}

test("ui server serves health, manifest, and the current shell entrypoint", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    const origin = new URL(server.url).origin;

    try {
      const healthResponse = await fetch(`${origin}/api/health`);
      assert.equal(healthResponse.status, 200);
      assert.deepEqual(await healthResponse.json(), { ok: true });

      const manifestResponse = await fetch(`${origin}/manifest.json`);
      assert.equal(manifestResponse.status, 200);
      const manifest = await manifestResponse.json() as { name: string; short_name: string };
      assert.equal(manifest.name, "ChangeYard");
      assert.equal(manifest.short_name, "ChangeYard");

      const shellResponse = await fetch(server.url);
      assert.equal(shellResponse.status, 200);
      const shellHtml = await shellResponse.text();
      assert.match(shellHtml, /<!doctype html>/i);
      assert.match(shellHtml, /<div id="root"><\/div>/);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui server exposes the current project through the projects.list tRPC route", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    const origin = new URL(server.url).origin;

    try {
      const response = await fetch(`${origin}/api/trpc/projects.list?batch=1&input=%7B%7D`);
      assert.equal(response.status, 200);
      const payload = await response.json() as Array<{
        result?: {
          data?: {
            currentProjectId?: string | null;
            projects?: Array<{
              id: string;
              path: string;
              name: string;
              taskCounts: Record<string, number>;
            }>;
          };
        };
      }>;

      const data = payload[0]?.result?.data;
      assert.ok(data);
      assert.equal(typeof data?.currentProjectId, "string");

      const currentProject = data?.projects?.find((entry) => entry.id === data?.currentProjectId);
      assert.ok(currentProject);

      const project = data?.projects?.find((entry) => entry.name === path.basename(repo));
      assert.ok(project);
      assert.equal(project?.name, path.basename(repo));
      assert.deepEqual(project?.taskCounts, {
        backlog: 0,
        in_progress: 0,
        review: 0,
        trash: 0,
      });
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui server exposes markdown-backed planned and unplanned changes through the changeyard tRPC routes", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const planned = createChange({
      template: "feature",
      title: "Add planning summary panel",
      planning: "openspec-lite",
    }, repo);
    const unplanned = createChange({
      template: "bug",
      title: "Fix stale toast dismissal",
      noPlanning: true,
    }, repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const projects = await trpcQuery<{
        currentProjectId: string | null;
        projects: Array<{ id: string }>;
      }>(origin, "projects.list");
      assert.equal(typeof projects.currentProjectId, "string");
      const workspaceId = projects.currentProjectId as string;
      const changes = await trpcQuery<{
        changes: Array<{
          id: string;
          planning: {
            model: string;
            phase: string;
            gateSummary: { pending: number };
          } | null;
        }>;
      }>(origin, "changes.list", undefined, workspaceId);
      assert.equal(changes.changes.length, 2);

      const plannedChange = changes.changes.find((change) => change.id === planned.id);
      assert.ok(plannedChange);
      assert.equal(plannedChange?.planning?.model, "openspec-lite");
      assert.equal(plannedChange?.planning?.phase, "draft");
      assert.equal(plannedChange?.planning?.gateSummary.pending, 5);

      const unplannedChange = changes.changes.find((change) => change.id === unplanned.id);
      assert.ok(unplannedChange);
      assert.equal(unplannedChange?.planning, null);

      const plannedDetail = await trpcQuery<{
        id: string;
        sections: Array<{ id: string }>;
      } | null>(origin, "changes.get", { id: planned.id }, workspaceId);
      assert.ok(plannedDetail);
      assert.equal(plannedDetail?.id, planned.id);
      assert.ok(plannedDetail?.sections.some((section) => section.id === "proposal"));
      assert.ok(plannedDetail?.sections.some((section) => section.id === "verification"));

      const unplannedDetail = await trpcQuery<{
        planning: null;
        sections: unknown[];
      } | null>(origin, "changes.get", { id: unplanned.id }, workspaceId);
      assert.ok(unplannedDetail);
      assert.equal(unplannedDetail?.planning, null);
      assert.deepEqual(unplannedDetail?.sections, []);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui changeyard mutations create planned changes and surface planning gate failures before sync/start", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const projects = await trpcQuery<{
        currentProjectId: string | null;
      }>(origin, "projects.list");
      assert.equal(typeof projects.currentProjectId, "string");
      const workspaceId = projects.currentProjectId as string;

      const created = await trpcMutation<{
        id: string;
        planning: { model: string; strictness: string } | null;
        sections: Array<{ id: string }>;
      }>(origin, "changes.create", {
        template: "feature",
        title: "Launch planned UI flow",
        planning: "openspec-lite",
        strict: true,
      }, workspaceId);
      assert.equal(created.planning?.model, "openspec-lite");
      assert.equal(created.planning?.strictness, "strict");
      assert.ok(created.sections.some((section) => section.id === "clarifications"));
      assert.ok(created.sections.some((section) => section.id === "analysis"));

      const validationFailure = await trpcMutationError(origin, "changes.validate", { id: created.id }, workspaceId);
      assert.equal(validationFailure.status, 500);
      assert.match(validationFailure.message, /Sync Gate:/);
      assert.match(validationFailure.message, /Start Gate:/);
      assert.match(validationFailure.message, /Complete Gate:/);
      assert.match(validationFailure.message, /<!-- cy:proposal:start -->/);

      const syncFailure = await trpcMutationError(origin, "changes.sync", { id: created.id }, workspaceId);
      assert.equal(syncFailure.status, 500);
      assert.match(syncFailure.message, /<!-- cy:proposal:start -->/);

      const startFailure = await trpcMutationError(origin, "changes.start", { id: created.id }, workspaceId);
      assert.equal(startFailure.status, 500);
      assert.match(startFailure.message, /<!-- cy:proposal:start -->/);
      assert.match(startFailure.message, /<!-- cy:design:start -->/);
      assert.match(startFailure.message, /<!-- cy:clarifications:start -->/);
      assert.match(startFailure.message, /<!-- cy:requirements-checklist:start -->/);

      replacePlanningSection(repo, created.id, "proposal", "Concrete proposal for the UI flow.");
      replacePlanningSection(repo, created.id, "spec-deltas", "No behavior change");
      replacePlanningSection(repo, created.id, "design", "Use the existing injected changeyardApi mutation path.");
      replacePlanningSection(repo, created.id, "tasks", "- [x] Create planned issue\n- [ ] Start work");
      replacePlanningSection(repo, created.id, "clarifications", "No clarifications required.");
      replacePlanningSection(repo, created.id, "requirements-checklist", "- [x] Mutation path uses root CLI-core logic");

      const synced = await trpcMutation<{
        id: string;
        status: string;
        planning: { model: string } | null;
      }>(origin, "changes.sync", { id: created.id }, workspaceId);
      assert.equal(synced.id, created.id);
      assert.equal(synced.status, "synced");
      assert.equal(synced.planning?.model, "openspec-lite");

      const started = await trpcMutation<{
        id: string;
        status: string;
        workspace?: { path?: string };
      }>(origin, "changes.start", { id: created.id }, workspaceId);
      assert.equal(started.id, created.id);
      assert.equal(started.status, "in_progress");
      assert.equal(typeof started.workspace?.path, "string");
      assert.ok(started.workspace?.path?.includes(".changeyard/workspaces"));
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui changeyard planning section updates are marker-scoped and reject stale writes", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const created = createChange({
      template: "feature",
      title: "Inline planning editor",
      planning: "openspec-lite",
    }, repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const projects = await trpcQuery<{ currentProjectId: string | null }>(origin, "projects.list");
      const workspaceId = projects.currentProjectId as string;
      const initial = await trpcQuery<{
        id: string;
        updatedAt?: string;
        sections: Array<{ id: string; content: string }>;
      }>(origin, "changes.get", { id: created.id }, workspaceId);
      assert.equal(initial.id, created.id);
      const initialUpdatedAt = initial.updatedAt ?? null;
      const initialVerification = initial.sections.find((section) => section.id === "verification");
      const initialVerificationContent = initialVerification?.content ?? "";

      const saved = await trpcMutation<{
        updatedAt?: string;
        sections: Array<{ id: string; content: string }>;
      }>(origin, "changes.updatePlanningSection", {
        id: created.id,
        sectionId: "proposal",
        content: "## Summary\n\nShip the inline planning editor.",
        expectedUpdatedAt: initialUpdatedAt,
      }, workspaceId);
      const savedProposal = saved.sections.find((section) => section.id === "proposal");
      assert.match(savedProposal?.content ?? "", /inline planning editor/);
      const savedVerification = saved.sections.find((section) => section.id === "verification");
      assert.equal(savedVerification?.content ?? "", initialVerificationContent);
      assert.notEqual(saved.updatedAt ?? null, initialUpdatedAt);

      const stale = await trpcMutationError(origin, "changes.updatePlanningSection", {
        id: created.id,
        sectionId: "design",
        content: "Add a stale write that should fail.",
        expectedUpdatedAt: initialUpdatedAt,
      }, workspaceId);
      assert.equal(stale.status, 409);
      assert.match(stale.message, /updated elsewhere/i);
      assert.equal(stale.conflictUpdatedAt, saved.updatedAt ?? null);

      const latest = await trpcQuery<{
        sections: Array<{ id: string; content: string }>;
      }>(origin, "changes.get", { id: created.id }, workspaceId);
      const latestProposal = latest.sections.find((section) => section.id === "proposal");
      const latestDesign = latest.sections.find((section) => section.id === "design");
      const initialDesign = initial.sections.find((section) => section.id === "design");
      assert.match(latestProposal?.content ?? "", /inline planning editor/);
      assert.equal(latestDesign?.content ?? "", initialDesign?.content ?? "");
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});
