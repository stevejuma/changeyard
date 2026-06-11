import assert from "node:assert/strict";
import test from "node:test";
import { canConfirmSubmit, getSubmitOutcomeMessage } from "./submit-state";

test("canConfirmSubmit requires an available preview with items and no in-flight submit", () => {
	assert.equal(canConfirmSubmit(null, { status: "idle" }), false);
	assert.equal(canConfirmSubmit({ available: false, items: [{}] }, { status: "idle" }), false);
	assert.equal(canConfirmSubmit({ available: true, items: [] }, { status: "idle" }), false);
	assert.equal(canConfirmSubmit({ available: true, items: [{}] }, { status: "loading" }), false);
	assert.equal(canConfirmSubmit({ available: true, items: [{}] }, { status: "ready", data: { ok: true, items: [] } }), true);
});

test("getSubmitOutcomeMessage reflects submit failure and completion counts", () => {
	assert.equal(getSubmitOutcomeMessage({ status: "idle" }), null);
	assert.equal(getSubmitOutcomeMessage({ status: "error", message: "GitHub token env missing." }), "GitHub token env missing.");
	assert.equal(
		getSubmitOutcomeMessage({
			status: "ready",
			data: {
				ok: false,
				items: [],
			},
		}),
		"Stack submit stopped.",
	);
	assert.equal(
		getSubmitOutcomeMessage({
			status: "ready",
			data: {
				ok: true,
				items: [
					{ bookmarkName: "feature/base", completed: true, resultPr: { number: 12, url: null, baseBranch: "main" } },
					{ bookmarkName: "feature/top", completed: false, resultPr: null },
				],
			},
		}),
		"Stack submit finished. 1/2 items completed.",
	);
});
