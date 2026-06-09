import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitCommitListPanel } from "@/components/git-history/git-commit-list-panel";
import type { RuntimeGitCommit } from "@/runtime/types";

vi.mock("react-virtuoso", () => ({
	Virtuoso: ({
		data,
		itemContent,
		components,
	}: {
		data: RuntimeGitCommit[];
		itemContent: (index: number, commit: RuntimeGitCommit) => ReactNode;
		components?: { Footer?: () => ReactNode };
	}) => (
		<div>
			{data.map((commit, index) => (
				<div key={commit.hash}>{itemContent(index, commit)}</div>
			))}
			{components?.Footer ? <div>{components.Footer()}</div> : null}
		</div>
	),
}));

describe("GitCommitListPanel", () => {
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
		container.remove();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("shows JJ change ids before commit hashes when available", async () => {
		await act(async () => {
			root.render(
				<GitCommitListPanel
					commits={[
						{
							hash: "ad775e3f17cc855fa0221e9e94e1fa683e7aa9ba",
							shortHash: "ad775e3f",
							changeId: "sqxqrtuorxzn",
							authorName: "Steve Juma",
							authorEmail: "steve@ju.ma",
							date: "2026-06-09T15:50:58Z",
							message: "Current change",
							parentHashes: ["667cd041ea7925a723eca090067aa966ce2a026b"],
						},
					]}
					totalCount={1}
					selectedCommitHash="ad775e3f17cc855fa0221e9e94e1fa683e7aa9ba"
					isLoading={false}
					isLoadingMore={false}
					canLoadMore={false}
					refs={[]}
					panelWidth={320}
					onSelectCommit={() => {}}
				/>,
			);
		});

		const text = container.textContent ?? "";
		expect(text.includes("sqxqrtuorxzn")).toBe(true);
		expect(text.includes("ad775e3f")).toBe(true);
		expect(text.indexOf("sqxqrtuorxzn")).toBeLessThan(text.indexOf("ad775e3f"));
	});
});
