import assert from "node:assert/strict";
import test from "node:test";

import {
	applyMergeAction,
	assembleOneWayMerge,
	assembleThreeWayMerge,
	serializeMergeCenter,
} from "./index";

test("assembles one-way modified blocks", () => {
	const model = assembleOneWayMerge("a\nold\nc\n", "a\nnew\nc\n");
	assert.equal(model.mode, "one-way");
	assert.equal(model.blocks.some((block) => block.kind === "modified"), true);
	assert.equal(serializeMergeCenter(model), "a\nnew\nc\n");
});

test("assembles three-way conflict blocks", () => {
	const model = assembleThreeWayMerge("a\nleft\nc\n", "a\nbase\nc\n", "a\nright\nc\n");
	assert.equal(model.conflictCount, 1);
	assert.equal(model.unresolvedConflictCount, 1);
	assert.equal(serializeMergeCenter(model), "a\nbase\nc\n");
});

test("accepts left and serializes resolved center content", () => {
	const model = assembleThreeWayMerge("a\nleft\nc\n", "a\nbase\nc\n", "a\nright\nc\n");
	const conflict = model.blocks.find((block) => block.kind === "conflict");
	assert.ok(conflict);
	const nextModel = applyMergeAction(model, { type: "accept-left", blockId: conflict.id });
	assert.equal(nextModel.unresolvedConflictCount, 0);
	assert.equal(serializeMergeCenter(nextModel), "a\nleft\nc\n");
});

test("accept all right resolves every conflict", () => {
	const model = assembleThreeWayMerge("left 1\nsame\nleft 2\n", "base 1\nsame\nbase 2\n", "right 1\nsame\nright 2\n");
	const nextModel = applyMergeAction(model, { type: "accept-all", side: "right" });
	assert.equal(nextModel.unresolvedConflictCount, 0);
	assert.equal(serializeMergeCenter(nextModel), "right 1\nsame\nright 2\n");
});

test("delete merged content resolves a conflict block", () => {
	const model = assembleThreeWayMerge("left\n", "base\n", "right\n");
	const conflict = model.blocks.find((block) => block.kind === "conflict");
	assert.ok(conflict);
	const nextModel = applyMergeAction(model, { type: "delete-merged-content", blockId: conflict.id });
	assert.equal(nextModel.unresolvedConflictCount, 0);
	assert.equal(serializeMergeCenter(nextModel), "");
});

test("marks a conflict as resolved without changing content", () => {
	const model = assembleThreeWayMerge("left\n", "base\n", "right\n");
	const conflict = model.blocks.find((block) => block.kind === "conflict");
	assert.ok(conflict);
	const nextModel = applyMergeAction(model, { type: "mark-resolved", blockId: conflict.id });
	assert.equal(nextModel.unresolvedConflictCount, 0);
	assert.equal(serializeMergeCenter(nextModel), "base\n");
});

test("supports whitespace and case comparison options", () => {
	const model = assembleThreeWayMerge("Value\n", "value\n", " value \n", { ignoreCase: true, ignoreWhitespace: true });
	assert.equal(model.conflictCount, 0);
	assert.equal(model.unresolvedConflictCount, 0);
});

test("adds modified-line overlays", () => {
	const model = assembleOneWayMerge("hello old world\n", "hello new world\n");
	const modified = model.blocks.find((block) => block.kind === "modified");
	assert.ok(modified);
	const leftLine = modified.sides.left?.[0];
	assert.ok(leftLine);
	assert.equal(leftLine.parts.some((part) => part.changed), true);
});
