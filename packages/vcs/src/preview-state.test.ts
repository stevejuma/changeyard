import assert from "node:assert/strict";
import test from "node:test";
import {
	createReorderPreviewRequest,
	initialPreviewUiState,
	previewUiReducer,
	validateReorderPreviewRequest,
} from "./preview-state";

test("preview UI reducer arms a source and opens a preview request", () => {
	let state = initialPreviewUiState;
	state = previewUiReducer(state, { type: "arm-source", sourceChangeId: "aaa111" });
	assert.equal(state.armedSourceId, "aaa111");

	state = previewUiReducer(state, {
		type: "preview",
		request: createReorderPreviewRequest("aaa111", "bbb222", "after"),
	});
	assert.equal(state.armedSourceId, null);
	assert.deepEqual(state.pendingRequest, {
		kind: "reorder_change",
		sourceChangeId: "aaa111",
		targetChangeId: "bbb222",
		placement: "after",
	});
});

test("preview UI reducer clears drag state after a drag-driven preview", () => {
	let state = previewUiReducer(initialPreviewUiState, { type: "start-drag", sourceChangeId: "drag123" });
	assert.equal(state.dragSourceId, "drag123");

	state = previewUiReducer(state, {
		type: "preview",
		request: createReorderPreviewRequest("drag123", "drop456", "before"),
	});
	assert.equal(state.dragSourceId, null);
	assert.equal(state.pendingRequest?.kind, "reorder_change");
	assert.equal(state.pendingRequest?.kind === "reorder_change" ? state.pendingRequest.placement : null, "before");

	state = previewUiReducer(state, { type: "close-preview" });
	assert.equal(state.pendingRequest, null);
});

test("validateReorderPreviewRequest rejects moves before root and onto descendants", () => {
	const changes = [
		{ changeId: "root", parentChangeIds: [] },
		{ changeId: "parent", parentChangeIds: ["root"] },
		{ changeId: "child", parentChangeIds: ["parent"] },
	];

	assert.deepEqual(validateReorderPreviewRequest(changes, "parent", "root", "before"), {
		valid: false,
		reason: "Cannot move a change before the root commit.",
	});
	assert.deepEqual(validateReorderPreviewRequest(changes, "parent", "child", "after"), {
		valid: false,
		reason: "Cannot move a change onto one of its descendants.",
	});
	assert.deepEqual(validateReorderPreviewRequest(changes, "child", "parent", "after"), {
		valid: true,
		reason: null,
	});
});
