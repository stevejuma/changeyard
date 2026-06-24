import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	PullRequestConversationTimeline,
	PullRequestDetailsPanel,
	pullRequestCheckBadgeMeta,
	type PullRequestConversation,
	type PullRequestCheckRollup,
} from "./pull-request";

function rollup(overallState: PullRequestCheckRollup["overallState"], total = 1): PullRequestCheckRollup {
	return {
		provider: "github",
		supported: true,
		overallState,
		summary: {
			passed: overallState === "passed" ? total : 0,
			failed: overallState === "failed" ? total : 0,
			pending: overallState === "pending" ? total : 0,
			cancelled: overallState === "cancelled" ? total : 0,
			skipped: overallState === "skipped" ? total : 0,
			unknown: overallState === "unknown" ? total : 0,
			total,
		},
	};
}

describe("pull request shared UI", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;

	beforeEach(() => {
		previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
			.IS_REACT_ACT_ENVIRONMENT;
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		vi.restoreAllMocks();
		container.remove();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("maps check rollups to badge labels", () => {
		expect(pullRequestCheckBadgeMeta(rollup("passed")).label).toBe("Checks passed");
		expect(pullRequestCheckBadgeMeta(rollup("failed")).label).toBe("Checks failed");
		expect(pullRequestCheckBadgeMeta(rollup("pending")).label).toBe("Checks running");
		expect(pullRequestCheckBadgeMeta(rollup("cancelled")).label).toBe("Checks cancelled");
		expect(pullRequestCheckBadgeMeta(rollup("unknown")).label).toBe("Checks unknown");
		expect(pullRequestCheckBadgeMeta(rollup("passed", 0)).label).toBe("No checks");
		expect(pullRequestCheckBadgeMeta({ ...rollup("unknown", 0), supported: false }).label).toBe("Checks unsupported");
		expect(pullRequestCheckBadgeMeta(null).label).toBe("Checks unknown");
	});

	it("renders metadata and edit controls", async () => {
		const onChange = vi.fn();
		const onSave = vi.fn();
		const onCancel = vi.fn();

		await act(async () => {
			root.render(
				<PullRequestDetailsPanel
					summary={{ number: 5, url: "https://example.test/pull/5", title: "Export JSON" }}
					details={{
						number: 5,
						url: "https://example.test/pull/5",
						title: "Export JSON",
						body: "Initial body",
						provider: "github",
						headBranch: "feature/export-json",
						baseBranch: "main",
						author: "Ada",
						updatedAt: "2026-06-24T12:00:00Z",
					}}
					checks={rollup("passed")}
					isEditing
					isSaving={false}
					draftBody="Initial body"
					editorMode="source"
					onDraftBodyChange={onChange}
					onStartEdit={() => {}}
					onCancelEdit={onCancel}
					onSave={onSave}
				/>,
			);
		});

		expect(container.textContent).toContain("Export JSON");
		expect(container.textContent).toContain("PR #5");
		expect(container.textContent).toContain("github");
		expect(container.textContent).toContain("feature/export-json");
		expect(container.textContent).toContain("main");
		expect(container.textContent).toContain("Checks passed");
		expect(container.querySelector("textarea")?.value).toBe("Initial body");

		await act(async () => {
			container.querySelector("textarea")?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(container.textContent).toContain("Save description");

		await act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent?.includes("Cancel"))
				?.click();
		});
		expect(onCancel).toHaveBeenCalled();

		await act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent?.includes("Save description"))
				?.click();
		});
		expect(onSave).toHaveBeenCalled();
	});

	it("disables save while saving", async () => {
		await act(async () => {
			root.render(
				<PullRequestDetailsPanel
					summary={{ number: 6, title: "Saving" }}
					checks={rollup("pending")}
					isEditing
					isSaving
					draftBody="Body"
					onDraftBodyChange={() => {}}
					onStartEdit={() => {}}
					onCancelEdit={() => {}}
					onSave={() => {}}
				/>,
			);
		});

		const saveButton = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Save description"),
		);
		expect(saveButton?.disabled).toBe(true);
	});

	it("links inline conversation comment paths to files without showing missing snippet text", async () => {
		const onOpenInlineReference = vi.fn();
		const conversation: PullRequestConversation = {
			provider: "github",
			pullRequestNumber: 5,
			supported: true,
			events: [
				{
					id: "comment-1",
					kind: "review_comment",
					author: "Ada",
					body: "Can we keep this stable?",
					path: "src/a.ts",
					line: 12,
					side: "RIGHT",
				},
			],
		};

		await act(async () => {
			root.render(
				<PullRequestConversationTimeline
					conversation={conversation}
					onOpenInlineReference={onOpenInlineReference}
				/>,
			);
		});

		expect(container.textContent).toContain("src/a.ts:12");
		expect(container.textContent).not.toContain("Line snippet unavailable");
		expect(container.textContent).not.toContain("View in files");

		await act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent?.includes("src/a.ts:12"))
				?.click();
		});
		expect(onOpenInlineReference).toHaveBeenCalledWith(conversation.events[0]);
	});

	it("renders inline conversation snippets from resolved file text", async () => {
		const conversation: PullRequestConversation = {
			provider: "github",
			pullRequestNumber: 5,
			supported: true,
			events: [
				{
					id: "comment-1",
					kind: "review_comment",
					author: "Ada",
					body: "This context line should be visible.",
					path: "src/a.ts",
					line: 2,
					side: "RIGHT",
				},
			],
		};

		await act(async () => {
			root.render(
				<PullRequestConversationTimeline
					conversation={conversation}
					resolveInlineReferenceLines={() => [
						{
							lineNumber: 2,
							text: "const value = computeValue();",
							variant: "context",
						},
					]}
				/>,
			);
		});

		expect(container.textContent).toContain("const value = computeValue();");
	});
});
