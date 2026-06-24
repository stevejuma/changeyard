import assert from "node:assert/strict";
import test from "node:test";

import { runtimeVcsPullRequestSelectorSchema } from "../core/api-contract.js";

test("runtime VCS PR selector accepts exactly one target", () => {
	assert.equal(runtimeVcsPullRequestSelectorSchema.safeParse({ changeId: "CY-0001" }).success, true);
	assert.equal(runtimeVcsPullRequestSelectorSchema.safeParse({ number: 12 }).success, true);
	assert.equal(runtimeVcsPullRequestSelectorSchema.safeParse({ headBranch: "feature/a" }).success, true);

	assert.equal(runtimeVcsPullRequestSelectorSchema.safeParse({}).success, false);
	assert.equal(runtimeVcsPullRequestSelectorSchema.safeParse({ changeId: "CY-0001", number: 12 }).success, false);
	assert.equal(runtimeVcsPullRequestSelectorSchema.safeParse({ number: 12, headBranch: "feature/a" }).success, false);
});
