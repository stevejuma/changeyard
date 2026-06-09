import { describe, expect, it } from "vitest";

import {
	toSelectedAgentId,
	trackTaskCreated,
	trackTaskDependencyCreated,
	trackTaskResumedFromTrash,
	trackTasksAutoStartedFromDependency,
} from "@/task-events";

describe("task event helpers", () => {
	it("keeps task workflow helpers as no-ops", () => {
		expect(() =>
			trackTaskCreated({
				selected_agent_id: "unknown",
				start_in_plan_mode: true,
				auto_review_mode: "pr",
				prompt_character_count: 42,
			}),
		).not.toThrow();
		expect(() => {
			trackTaskCreated({
				selected_agent_id: "unknown",
				start_in_plan_mode: false,
				prompt_character_count: 12,
			});
		}).not.toThrow();
		expect(() => {
		trackTaskDependencyCreated();
		trackTasksAutoStartedFromDependency(3);
		trackTaskResumedFromTrash();
		}).not.toThrow();
	});

	it("normalizes nullable agent ids", () => {
		expect(toSelectedAgentId("codex")).toBe("codex");
		expect(toSelectedAgentId(null)).toBe("unknown");
		expect(toSelectedAgentId(undefined)).toBe("unknown");
	});
});
