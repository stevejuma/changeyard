import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createChangeyardBoardService } from "../src/index.js";
import { runCreate } from "../src/commands/create.js";
import { runInit } from "../src/commands/init.js";
import { runStart } from "../src/commands/start.js";

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-board-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

test("board service maps changes into board columns", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Board ready change" }, repo);
    const service = createChangeyardBoardService(repo);
    const board = service.getBoard();
    const readyColumn = board.columns.find((column) => column.id === "ready");
    assert.ok(readyColumn);
    if (!readyColumn) throw new Error("Ready column missing");
    assert.equal(readyColumn.cards.length, 1);
    assert.equal(readyColumn.cards[0].id, "CY-0001");
    assert.equal(readyColumn.cards[0].workspace?.engine, "plain-copy");
  } finally {
    cleanup(repo);
  }
});

test("board service includes started workspace metadata and verification", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    runCreate({ template: "agent-task", title: "Board started change" }, repo);
    runStart("CY-0001", repo);
    const service = createChangeyardBoardService(repo);
    const card = service.getCard("CY-0001");
    assert.equal(card.status, "in_progress");
    assert.equal(card.workspace?.engine, "plain-copy");
    assert.equal(card.workspace?.verification?.valid, true);
    assert.ok(card.sections["Summary"] !== undefined);
    const metadata = JSON.parse(readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "metadata.json"), "utf8"));
    assert.equal(card.workspace?.metadata?.path, metadata.path);
  } finally {
    cleanup(repo);
  }
});

test("board service surfaces planning summaries on planned changes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Board planned change", planning: "openspec-lite" }, repo);
    const service = createChangeyardBoardService(repo);
    const card = service.getCard("CY-0001");
    assert.equal(card.planning?.model, "openspec-lite");
    assert.equal(card.planning?.strictness, "normal");
    assert.equal(card.planning?.phase, "draft");
    assert.equal(card.planning?.gateSummary.pending, 5);
    assert.equal(card.planning?.nextAction, "Complete pending planning gate: proposal");
  } finally {
    cleanup(repo);
  }
});

test("quick changes appear in lifecycle columns like other canonical changes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "quick", title: "Small change" }, repo);
    const service = createChangeyardBoardService(repo);
    const readyColumn = service.getBoard().columns.find((column) => column.id === "ready");
    assert.ok(readyColumn);
    if (!readyColumn) throw new Error("Ready column missing");
    assert.equal(readyColumn.cards.length, 1);
    assert.equal(readyColumn.cards[0].type, "quick");
    assert.equal(readyColumn.cards[0].status, "ready");
  } finally {
    cleanup(repo);
  }
});

test("board service updates full change markdown with conflict protection", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Editable change" }, repo);
    const service = createChangeyardBoardService(repo);
    const original = service.getCard("CY-0001");
    const updated = service.updateChangeBody("CY-0001", {
      body: `${original.body.trimEnd()}\n\nExtra details.\n`,
      expectedUpdatedAt: original.updatedAt ?? null,
    });
    assert.match(updated.body, /Extra details\./);

    assert.throws(
      () =>
        service.updateChangeBody("CY-0001", {
          body: `${updated.body}\nStale edit\n`,
          expectedUpdatedAt: original.updatedAt ?? null,
        }),
      /updated elsewhere/i,
    );
  } finally {
    cleanup(repo);
  }
});

test("board service updates lifecycle status with transition validation", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    runCreate({ template: "agent-task", title: "Status update" }, repo);
    runStart("CY-0001", repo);
    const service = createChangeyardBoardService(repo);

    const blocked = service.updateChangeStatus("CY-0001", { status: "blocked" });
    assert.equal(blocked.status, "blocked");

    const resumed = service.updateChangeStatus("CY-0001", { status: "in_progress" });
    assert.equal(resumed.status, "in_progress");

    assert.throws(() => service.updateChangeStatus("CY-0001", { status: "ready" }), /cannot transition/i);
  } finally {
    cleanup(repo);
  }
});

test("board service links changes and derives reverse dependencies", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "First change" }, repo);
    runCreate({ template: "agent-task", title: "Second change" }, repo);
    const service = createChangeyardBoardService(repo);

    const linked = service.linkCard("CY-0002", "CY-0001");
    assert.deepEqual(linked.dependencies.blockedBy, ["CY-0001"]);

    const first = service.getCard("CY-0001");
    assert.deepEqual(first.dependencies.blocks, ["CY-0002"]);
    const raw = readFileSync(path.join(repo, linked.path), "utf8");
    assert.match(raw, /links:\s*\n\s*blockedBy:\s*\n\s*- CY-0001/s);
  } finally {
    cleanup(repo);
  }
});

test("board service accepts partial task ids for card actions", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "First partial card" }, repo);
    runCreate({ template: "agent-task", title: "Second partial card" }, repo);
    const service = createChangeyardBoardService(repo);

    assert.equal(service.getCard("001").id, "CY-0001");
    assert.equal(service.updateCard("002", { priority: "high" }).priority, "high");
    assert.deepEqual(service.linkCard("002", "001").dependencies.blockedBy, ["CY-0001"]);
    assert.deepEqual(service.getCard("001").dependencies.blocks, ["CY-0002"]);
  } finally {
    cleanup(repo);
  }
});

test("board service unlinks changes and removes empty links frontmatter", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "First change" }, repo);
    runCreate({ template: "agent-task", title: "Second change" }, repo);
    const service = createChangeyardBoardService(repo);
    service.linkCard("CY-0002", "CY-0001");

    const unlinked = service.unlinkCard("CY-0002", "CY-0001");
    assert.deepEqual(unlinked.dependencies.blockedBy, []);
    const first = service.getCard("CY-0001");
    assert.deepEqual(first.dependencies.blocks, []);

    const raw = readFileSync(path.join(repo, unlinked.path), "utf8");
    assert.doesNotMatch(raw, /links:/);
  } finally {
    cleanup(repo);
  }
});

test("board service rejects invalid dependency links", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "First change" }, repo);
    runCreate({ template: "agent-task", title: "Second change" }, repo);
    runCreate({ template: "agent-task", title: "Third change" }, repo);
    const service = createChangeyardBoardService(repo);

    assert.throws(() => service.linkCard("CY-0001", "CY-0001"), /cannot depend on itself/i);
    assert.throws(() => service.linkCard("CY-0001", "CY-9999"), /linked change not found/i);

    service.linkCard("CY-0002", "CY-0001");
    assert.throws(() => service.linkCard("CY-0002", "CY-0001"), /already blocked by/i);

    service.linkCard("CY-0003", "CY-0002");
    assert.throws(() => service.linkCard("CY-0001", "CY-0003"), /dependency cycle/i);
  } finally {
    cleanup(repo);
  }
});
