import assert from "node:assert/strict";
import test from "node:test";

import {
	applyMergeAction,
	assembleOneWayMerge,
	assembleThreeWayMerge,
	serializeMergeCenter,
	type MergeBlockKind,
} from "./index";
import { diffSequences, type DiffOp } from "./core/diff";
import { splitLines } from "./core/lines";
import { DEFAULT_OPTIONS } from "./core/options";
import {
	createMergeRenderModel,
	deleteMergedRenderComponentFromCenter,
	mergeRenderComponentIntoCenter,
	type RenderComponent,
} from "./react/render-model";

function diffText(left: string, right: string): DiffOp[] {
	return diffSequences(splitLines(left), splitLines(right), DEFAULT_OPTIONS);
}

function blockKinds(left: string, base: string, right: string): MergeBlockKind[] {
	return assembleThreeWayMerge(left, base, right).blocks.map((block) => block.kind);
}

function renderComponent(model: ReturnType<typeof assembleThreeWayMerge>, side: "left" | "base" | "right", blockId: string): RenderComponent {
	const component = createMergeRenderModel(model).sides[side].find((candidate) => candidate.blockId === blockId);
	assert.ok(component);
	return component;
}

const quicksortLeft = `void swap(int *a, int *b) {
  int t = *a;
  *a = *b;
  *b = t;
}

int partition(int array[], int low, int high) {
  int pivot = array[high];
  int i = low - 1;

  for (int j = low; j < high; j++) {
    if (array[j] <= pivot) {
      i++;
      swap(&array[i], &array[j]);
    }
  }
  swap(&array[high], &array[i + 1]);

  return i + 1;
}

/**
 * Simple implementation of the Quick Sort
 */
void quick_sort(int array[], int low, int high) {
  if (low < high) {
    int pi = partition(array, low, high);

    quick_sort(array, low, pi - 1);
    quick_sort(array, pi + 1, high);
  }
}
`;

const quicksortBase = `void swap(int *a, int *b) {
  int t = *a;
  *a = *b;
  *b = t;
}

int partition(int array[], int low, int high) {
  int pivot = array[high];
  int i = low - 1;

  // Move all the elements higher than the pivot
  // to the left side of the partition
  for (int j = low; j < high; j++) {
    if (array[j] <= pivot) {
      i++;
      swap(&array[i], &array[j]);
    }
  }
  swap(&array[i + 1], &array[high]);

  return i + 1;
}

void quick_sort(int array[], int low, int high) {
  if (low < high) {
    int pi = partition(array, low, high);

    quick_sort(array, low, pi - 1);
    quick_sort(array, pi + 1, high);
  }
}
`;

const quicksortRight = `void swap(int *a, int *b) {
  int t = *a;
  *a = *b;
  *b = t;
}

int partition(int *array, int low, int high) {
  int pivot = array[high];
  int i = low - 1;

  for (int j = low; j < high; j++) {
    if (array[j] <= pivot) {
      i++;
      swap(&array[i], &array[j]);
    }
  }
  swap(
    &array[i + 1],
    &array[high]
  );

  return i + 1;
}

void quick_sort(int array[], int low, int high) {
  if (low < high) {
    int pi = partition(array, low, high);

    quick_sort(array, low, pi - 1);
    quick_sort(array, pi + 1, high);
  }
}
`;

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

test("edits center content without reassembling it from the side panes", () => {
	const model = assembleThreeWayMerge("left\n", "base\n", "right\n");
	const nextModel = applyMergeAction(model, { type: "edit-center", content: "base\n\n" });

	assert.equal(nextModel.left, "left\n");
	assert.equal(nextModel.right, "right\n");
	assert.equal(nextModel.sourceBase, "base\n");
	assert.equal(serializeMergeCenter(nextModel), "base\n\n");
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

test("diffs empty input", () => {
	assert.deepEqual(diffText("", ""), []);
});

test("diffs left additions", () => {
	assert.deepEqual(diffText("1\n2\n3", "1\n2"), [
		{ kind: "same", left: "1", right: "1" },
		{ kind: "same", left: "2", right: "2" },
		{ kind: "left", value: "3" },
	]);
});

test("diffs right additions", () => {
	assert.deepEqual(diffText("1\n2", "1\n2\n3"), [
		{ kind: "same", left: "1", right: "1" },
		{ kind: "same", left: "2", right: "2" },
		{ kind: "right", value: "3" },
	]);
});

test("diffs line edits", () => {
	assert.deepEqual(diffText("1\na\n3", "1\nb\n3"), [
		{ kind: "same", left: "1", right: "1" },
		{ kind: "left", value: "a" },
		{ kind: "right", value: "b" },
		{ kind: "same", left: "3", right: "3" },
	]);
});

test("diffs unchanged content", () => {
	assert.deepEqual(diffText("1\n2\n3", "1\n2\n3"), [
		{ kind: "same", left: "1", right: "1" },
		{ kind: "same", left: "2", right: "2" },
		{ kind: "same", left: "3", right: "3" },
	]);
});

test("diffs starting left newline", () => {
	assert.deepEqual(diffText("\n1", "1"), [
		{ kind: "left", value: "" },
		{ kind: "same", left: "1", right: "1" },
	]);
});

test("diffs starting right newline", () => {
	assert.deepEqual(diffText("1", "\n1"), [
		{ kind: "right", value: "" },
		{ kind: "same", left: "1", right: "1" },
	]);
});

test("assembles one-way unchanged content", () => {
	const model = assembleOneWayMerge("1\n2\n3", "1\n2\n3");
	assert.equal(model.blocks.every((block) => block.kind === "unchanged"), true);
	assert.equal(serializeMergeCenter(model), "1\n2\n3");
});

test("assembles one-way right additions", () => {
	const model = assembleOneWayMerge("1\n2\n3", "1\n2\n3\n4");
	assert.equal(model.blocks.at(-1)?.kind, "added");
	assert.equal(serializeMergeCenter(model), "1\n2\n3\n4");
});

test("assembles one-way left removals", () => {
	const model = assembleOneWayMerge("1\n2\n3\n4", "1\n2\n3");
	assert.equal(model.blocks.at(-1)?.kind, "removed");
	assert.equal(serializeMergeCenter(model), "1\n2\n3");
});

test("assembles one-way added and removed content", () => {
	const model = assembleOneWayMerge("1\n2\n3\na", "b\n1\n2\n3");
	assert.deepEqual(model.blocks.map((block) => block.kind), ["added", "unchanged", "unchanged", "unchanged", "removed"]);
	assert.equal(serializeMergeCenter(model), "b\n1\n2\n3");
});

test("assembles three-way unchanged content", () => {
	assert.deepEqual(blockKinds("1\n2\n3", "1\n2\n3", "1\n2\n3"), ["unchanged"]);
});

test("assembles three-way left-only additions", () => {
	const model = assembleThreeWayMerge("1\n2\n3\n4", "1\n2\n3", "1\n2\n3");
	assert.deepEqual(model.blocks.map((block) => block.kind), ["unchanged", "modified"]);
	assert.equal(model.conflictCount, 0);
	assert.equal(serializeMergeCenter(model), "1\n2\n3\n4");
});

test("assembles three-way right-only additions", () => {
	const model = assembleThreeWayMerge("1\n2\n3", "1\n2\n3", "1\n2\n3\n4");
	assert.deepEqual(model.blocks.map((block) => block.kind), ["unchanged", "modified"]);
	assert.equal(model.conflictCount, 0);
	assert.equal(serializeMergeCenter(model), "1\n2\n3\n4");
});

test("assembles three-way shared removals", () => {
	const model = assembleThreeWayMerge("1\n2\n3", "1\n2\n3\n4", "1\n2\n3");
	assert.deepEqual(model.blocks.map((block) => block.kind), ["unchanged", "modified"]);
	assert.equal(model.conflictCount, 0);
	assert.equal(serializeMergeCenter(model), "1\n2\n3");
});

test("assembles three-way divergent edits as conflicts", () => {
	const model = assembleThreeWayMerge("1\na\n3", "1\nb\n3", "1\nc\n3");
	assert.deepEqual(model.blocks.map((block) => block.kind), ["unchanged", "conflict", "unchanged"]);
	assert.equal(model.conflictCount, 1);
	assert.equal(serializeMergeCenter(model), "1\nb\n3");
});

test("handles an insertion immediately after an unchanged line", () => {
	const model = assembleThreeWayMerge("a\nleft inserted\nb\n", "a\nb\n", "a\nright inserted\nb\n");
	assert.deepEqual(model.blocks.map((block) => block.kind), ["unchanged", "conflict", "unchanged"]);
	const conflict = model.blocks.find((block) => block.kind === "conflict");
	assert.ok(conflict);
	const nextModel = applyMergeAction(model, { type: "accept-left", blockId: conflict.id });
	assert.equal(serializeMergeCenter(nextModel), "a\nleft inserted\nb\n");
});

test("assembles the C quicksort fixture without stalling", () => {
	const model = assembleThreeWayMerge(quicksortLeft, quicksortBase, quicksortRight);
	assert.equal(model.blocks.length > 1, true);
	assert.equal(model.conflictCount > 0, true);
	assert.equal(model.blocks.every((block) => block.sides.base !== undefined), true);
});

test("creates side-major render components and connector lanes for the C fixture", () => {
	const model = assembleThreeWayMerge(quicksortLeft, quicksortBase, quicksortRight);
	const renderModel = createMergeRenderModel(model);

	assert.equal(renderModel.sides.left.length, model.blocks.length);
	assert.equal(renderModel.sides.base.length, model.blocks.length);
	assert.equal(renderModel.sides.right.length, model.blocks.length);
	assert.equal(renderModel.leftConnections.length > 0, true);
	assert.equal(renderModel.rightConnections.length > 0, true);
	assert.equal(renderModel.leftConnections.every((connection) => connection.fromSide === "left" && connection.toSide === "base"), true);
	assert.equal(renderModel.rightConnections.every((connection) => connection.fromSide === "base" && connection.toSide === "right"), true);
});

test("places merge and resolve actions on render components", () => {
	const model = assembleThreeWayMerge("a\nleft\nc\n", "a\nbase\nc\n", "a\nright\nc\n");
	const renderModel = createMergeRenderModel(model);
	const conflictBlock = model.blocks.find((block) => block.kind === "conflict");
	assert.ok(conflictBlock);

	const left = renderModel.sides.left.find((component) => component.blockId === conflictBlock.id);
	const base = renderModel.sides.base.find((component) => component.blockId === conflictBlock.id);
	const right = renderModel.sides.right.find((component) => component.blockId === conflictBlock.id);

	assert.equal(left?.action?.kind, "merge");
	assert.equal(base?.action?.kind, "resolve");
	assert.equal(right?.action?.kind, "merge");
});

test("places merge actions on one-way changed render components", () => {
	const modified = createMergeRenderModel(assembleOneWayMerge("a\nleft\nc\n", "a\nright\nc\n"), ["left", "right"]);
	const modifiedLeft = modified.sides.left.find((component) => component.blockKind === "modified");
	const modifiedRight = modified.sides.right.find((component) => component.blockKind === "modified");

	assert.equal(modifiedLeft?.action?.kind, "merge");
	assert.equal(modifiedRight?.action?.kind, "merge");

	const added = createMergeRenderModel(assembleOneWayMerge("a\nc\n", "a\nright\nc\n"), ["left", "right"]);
	const addedLeft = added.sides.left.find((component) => component.blockKind === "added");
	const addedRight = added.sides.right.find((component) => component.blockKind === "added");

	assert.equal(addedLeft?.action, undefined);
	assert.equal(addedRight?.action?.kind, "merge");

	const removed = createMergeRenderModel(assembleOneWayMerge("a\nleft\nc\n", "a\nc\n"), ["left", "right"]);
	const removedLeft = removed.sides.left.find((component) => component.blockKind === "removed");
	const removedRight = removed.sides.right.find((component) => component.blockKind === "removed");

	assert.equal(removedLeft?.action?.kind, "merge");
	assert.equal(removedRight?.action, undefined);
});

test("uses delete actions for source content already merged into center", () => {
	const model = assembleThreeWayMerge("a\nleft\nc\n", "a\nbase\nc\n", "a\nright\nc\n");
	const conflict = model.blocks.find((block) => block.kind === "conflict");
	assert.ok(conflict);
	const merged = applyMergeAction(model, { type: "accept-left", blockId: conflict.id });
	const renderModel = createMergeRenderModel(merged);
	const left = renderModel.sides.left.find((component) => component.blockId === conflict.id);

	assert.equal(left?.action?.kind, "delete");
});

test("marks the picked source and center as added and the unpicked modified side as removed", () => {
	const model = assembleThreeWayMerge("const char *branch;\n", "const char *branch;\n", "const char *target_branch;\n");
	const block = model.blocks.find((candidate) => candidate.kind === "modified");
	assert.ok(block);
	const renderModel = createMergeRenderModel(model);
	const left = renderModel.sides.left.find((component) => component.blockId === block.id);
	const base = renderModel.sides.base.find((component) => component.blockId === block.id);
	const right = renderModel.sides.right.find((component) => component.blockId === block.id);

	assert.equal(left?.visualKind, "removed");
	assert.equal(left?.action?.kind, "merge");
	assert.equal(base?.visualKind, "added");
	assert.equal(right?.visualKind, "added");
	assert.equal(right?.action?.kind, "delete");
});

test("deleting a picked modified source flips its action back to merge", () => {
	const model = assembleThreeWayMerge("const char *branch;\n", "const char *branch;\n", "const char *target_branch;\n");
	const block = model.blocks.find((candidate) => candidate.kind === "modified");
	assert.ok(block);
	const pickedRight = renderComponent(model, "right", block.id);

	const deleted = deleteMergedRenderComponentFromCenter(model, pickedRight);
	const rightAfterDelete = renderComponent(deleted, "right", block.id);

	assert.equal(serializeMergeCenter(deleted), "");
	assert.equal(rightAfterDelete.visualKind, "modified");
	assert.equal(rightAfterDelete.action?.kind, "merge");
});

test("merging a left-side conflict change inserts it above center content", () => {
	const model = assembleThreeWayMerge("left change\n", "center change\n", "right change\n");
	const block = model.blocks.find((candidate) => candidate.kind === "conflict");
	assert.ok(block);
	const left = renderComponent(model, "left", block.id);

	const merged = mergeRenderComponentIntoCenter(model, left);

	assert.equal(serializeMergeCenter(merged), "left change\ncenter change\n");
});

test("merging a right-side conflict change inserts it below center content", () => {
	const model = assembleThreeWayMerge("left change\n", "center change\n", "right change\n");
	const block = model.blocks.find((candidate) => candidate.kind === "conflict");
	assert.ok(block);
	const right = renderComponent(model, "right", block.id);

	const merged = mergeRenderComponentIntoCenter(model, right);

	assert.equal(serializeMergeCenter(merged), "center change\nright change\n");
});

test("removing an already merged right-side conflict restores center content", () => {
	const model = assembleThreeWayMerge("left change\n", "center change\n", "right change\n");
	const conflict = model.blocks.find((candidate) => candidate.kind === "conflict");
	assert.ok(conflict);
	const withRightMerged = mergeRenderComponentIntoCenter(model, renderComponent(model, "right", conflict.id));
	const right = renderComponent(withRightMerged, "right", conflict.id);

	const removed = deleteMergedRenderComponentFromCenter(withRightMerged, right);

	assert.equal(serializeMergeCenter(removed), "center change\n");
	assert.equal(renderComponent(removed, "right", conflict.id).action?.kind, "merge");
});
