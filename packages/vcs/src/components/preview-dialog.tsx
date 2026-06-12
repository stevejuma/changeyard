import { GitBranch, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { KeyValue } from "@/components/vcs-panels";
import type {
	MutationState,
	QueryState,
	VcsApplyOperationResponse,
	VcsOperationRequest,
	VcsPreviewOperationResponse,
} from "@/runtime/types";
import { commandPreview, summarizeOperationRequest } from "@/vcs-operations";

export function PreviewDialog({
	request,
	previewState,
	applyState,
	onApply,
	onClose,
}: {
	request: VcsOperationRequest | null;
	previewState: QueryState<VcsPreviewOperationResponse>;
	applyState: MutationState<VcsApplyOperationResponse>;
	onApply: () => void;
	onClose: () => void;
}): React.ReactElement {
	return (
		<Dialog open={request !== null} onOpenChange={(open) => {
			if (!open) {
				onClose();
			}
		}} contentClassName="max-w-2xl">
			<DialogHeader title="Operation Preview" icon={<GitBranch size={16} />} />
			<DialogBody>
				{request ? <p className="mb-3 text-[13px] text-text-secondary">{summarizeOperationRequest(request)}</p> : null}
				{previewState.status === "loading" ? (
					<div className="flex items-center gap-2 text-sm text-text-secondary">
						<Spinner size={16} />
						Loading preview.
					</div>
				) : previewState.status === "error" ? (
					<p className="text-sm text-status-red">{previewState.message}</p>
				) : (
					<div className="grid gap-3">
						<KeyValue label="Risk" value={<StatusChip label={previewState.data.risk} tone={previewState.data.risk === "high" ? "red" : previewState.data.risk === "medium" ? "orange" : "green"} />} />
						<KeyValue label="Summary" value={previewState.data.description} />
						<KeyValue
							label="Command Preview"
							value={
								<pre className="max-h-56 overflow-auto rounded-md border border-border bg-surface-0 p-2 font-mono text-xs text-text-secondary">
									{commandPreview(previewState.data.commands)}
								</pre>
							}
						/>
						{previewState.data.affectedBookmarks.length > 0 ? (
							<KeyValue label="Affected Bookmarks" value={previewState.data.affectedBookmarks.join(", ")} />
						) : null}
						{previewState.data.diagnostics.length > 0 ? (
							<KeyValue
								label="Diagnostics"
								value={previewState.data.diagnostics.map((diagnostic) => (
									<p className="text-[13px] text-text-secondary" key={`${diagnostic.code}-${diagnostic.message}`}>
										<strong>{diagnostic.level}</strong>: {diagnostic.message}
									</p>
								))}
							/>
						) : null}
						{applyState.status === "error" ? <p className="text-sm text-status-red">{applyState.message}</p> : null}
						{applyState.status === "ready" ? (
							<p className="text-sm text-text-secondary">
								{applyState.data.ok ? "Applied." : "Apply failed."} {applyState.data.description}
							</p>
						) : null}
					</div>
				)}
			</DialogBody>
			<DialogFooter>
				<Button variant="ghost" onClick={onClose}>
					Close
				</Button>
				<Button
					variant="primary"
					icon={applyState.status === "loading" ? <Spinner size={14} /> : <Play size={14} />}
					disabled={
						previewState.status !== "ready" ||
						!previewState.data.valid ||
						previewState.data.commands.length === 0 ||
						applyState.status === "loading"
					}
					onClick={onApply}
				>
					{applyState.status === "loading" ? "Applying" : "Apply operation"}
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
