import { GitPullRequest } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { KeyValue } from "@/components/vcs-panels";
import type { MutationState, VcsSubmitStackPreviewResponse, VcsSubmitStackResponse } from "@/runtime/types";
import { canConfirmSubmit, getSubmitOutcomeMessage } from "@/submit-state";
import { commandPreview } from "@/vcs-operations";

export function SubmitStackDialog({
	preview,
	submitState,
	onSubmit,
	onClose,
}: {
	preview: VcsSubmitStackPreviewResponse | null;
	submitState: MutationState<VcsSubmitStackResponse>;
	onSubmit: () => void;
	onClose: () => void;
}): React.ReactElement {
	const submitMessage = getSubmitOutcomeMessage(submitState);
	const submitEnabled = preview ? canConfirmSubmit(preview, submitState) : false;

	return (
		<Dialog open={preview !== null} onOpenChange={(open) => {
			if (!open && submitState.status !== "loading") {
				onClose();
			}
		}} contentClassName="max-w-2xl">
			<DialogHeader title="Submit Stacked PRs" icon={<GitPullRequest size={16} />} />
			<DialogBody>
				{preview ? (
					<div className="grid gap-3">
						<KeyValue
							label="Repository"
							value={`${preview.repoOwner ?? "unknown"}/${preview.repoName ?? "unknown"}${preview.remoteName ? ` via ${preview.remoteName}` : ""}`}
						/>
						<KeyValue label="Target Bookmark" value={preview.targetBookmark ?? "Unknown"} />
						<KeyValue
							label="Planned Actions"
							value={preview.items.map((item) => (
								<p className="text-[13px] text-text-secondary" key={`${item.bookmarkName}-${item.changeId}`}>
									<strong>{item.bookmarkName}</strong>: {item.action.replaceAll("_", " ")} on <code>{item.baseBranch}</code>
									{item.existingPr ? ` (PR #${item.existingPr.number})` : ""}
								</p>
							))}
						/>
						<KeyValue
							label="Command Preview"
							value={
								<pre className="max-h-48 overflow-auto rounded-md border border-border bg-surface-0 p-2 font-mono text-xs text-text-secondary">
									{commandPreview(preview.commands)}
								</pre>
							}
						/>
						{preview.diagnostics.length > 0 ? (
							<KeyValue
								label="Warnings"
								value={preview.diagnostics.map((diagnostic) => (
									<p className="text-[13px] text-text-secondary" key={`${diagnostic.code}-${diagnostic.message}`}>
										<strong>{diagnostic.level}</strong>: {diagnostic.message}
									</p>
								))}
							/>
						) : null}
						{submitState.status === "ready" ? (
							<KeyValue
								label="Submit Result"
								value={
									submitState.data.items.length > 0 ? (
										submitState.data.items.map((item) => (
											<p className="text-[13px] text-text-secondary" key={`${item.bookmarkName}-${item.changeId}`}>
												<strong>{item.bookmarkName}</strong>: {item.completed ? "completed" : "not completed"}
												{item.resultPr ? ` (PR #${item.resultPr.number})` : ""}
											</p>
										))
									) : (
										<p className="text-[13px] text-text-secondary">No stacked PR actions were completed.</p>
									)
								}
							/>
						) : null}
						{submitMessage ? <p className="text-sm text-text-secondary">{submitMessage}</p> : null}
					</div>
				) : null}
			</DialogBody>
			<DialogFooter>
				<Button variant="ghost" disabled={submitState.status === "loading"} onClick={onClose}>
					Close
				</Button>
				<Button
					variant="primary"
					icon={submitState.status === "loading" ? <Spinner size={14} /> : <GitPullRequest size={14} />}
					disabled={!submitEnabled}
					onClick={onSubmit}
				>
					{submitState.status === "loading" ? "Submitting" : "Confirm submit"}
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
