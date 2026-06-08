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
