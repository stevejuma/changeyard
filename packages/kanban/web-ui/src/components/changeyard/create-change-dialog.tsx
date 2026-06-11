import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { BranchSelectDropdown, type BranchSelectOption } from "@/components/branch-select-dropdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

type CreateChangeInput = {
	template: "feature" | "bug" | "refactor" | "agent-task" | "quick";
	title: string;
	priority?: string;
	labels?: string[];
	baseRevision?: string;
	planning?: "none" | "openspec-lite";
	strict?: boolean;
};

export function CreateChangeDialog({
	open,
	isPending = false,
	error = null,
	branchOptions,
	defaultBaseRevision,
	onOpenChange,
	onCreate,
}: {
	open: boolean;
	isPending?: boolean;
	error?: string | null;
	branchOptions: BranchSelectOption[];
	defaultBaseRevision: string;
	onOpenChange: (open: boolean) => void;
	onCreate: (input: CreateChangeInput) => Promise<void> | void;
}): ReactElement {
	const [template, setTemplate] = useState<CreateChangeInput["template"]>("feature");
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState("medium");
	const [labels, setLabels] = useState("agent-ready");
	const [baseRevision, setBaseRevision] = useState(defaultBaseRevision);
	const [planning, setPlanning] = useState<"none" | "openspec-lite">("none");
	const [strict, setStrict] = useState(false);

	useEffect(() => {
		if (!open) {
			setTemplate("feature");
			setTitle("");
			setPriority("medium");
			setLabels("agent-ready");
			setBaseRevision(defaultBaseRevision);
			setPlanning("none");
			setStrict(false);
		}
	}, [defaultBaseRevision, open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogHeader title="Create Change" />
			<DialogBody>
				<div className="grid gap-4">
					<label className="grid gap-1.5">
						<span className="text-[11px] text-text-secondary">Title</span>
						<input
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Add planning status panel"
							className="h-9 rounded-md border border-border-bright bg-surface-2 px-3 text-sm text-text-primary outline-none focus:border-border-focus"
						/>
					</label>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="grid gap-1.5">
							<span className="text-[11px] text-text-secondary">Template</span>
							<NativeSelect
								value={template}
								onChange={(event) => setTemplate(event.target.value as CreateChangeInput["template"])}
							>
								<option value="feature">Feature</option>
								<option value="bug">Bug</option>
								<option value="refactor">Refactor</option>
								<option value="agent-task">Agent Task</option>
								<option value="quick">Quick Change</option>
							</NativeSelect>
						</label>
						<label className="grid gap-1.5">
							<span className="text-[11px] text-text-secondary">Priority</span>
							<NativeSelect value={priority} onChange={(event) => setPriority(event.target.value)}>
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
							</NativeSelect>
						</label>
					</div>
					<div>
						<span className="mb-1 block text-[11px] text-text-secondary">Base revision</span>
						<BranchSelectDropdown
							options={branchOptions}
							selectedValue={baseRevision}
							onSelect={setBaseRevision}
							fill
							size="sm"
							emptyText="No refs detected"
						/>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="grid gap-1.5">
							<span className="text-[11px] text-text-secondary">Planning</span>
							<NativeSelect
								value={planning}
								onChange={(event) => setPlanning(event.target.value as "none" | "openspec-lite")}
							>
								<option value="none">None</option>
								<option value="openspec-lite">OpenSpec Lite</option>
							</NativeSelect>
						</label>
						<label className="grid gap-1.5">
							<span className="text-[11px] text-text-secondary">Labels</span>
							<input
								value={labels}
								onChange={(event) => setLabels(event.target.value)}
								placeholder="agent-ready, ui"
								className="h-9 rounded-md border border-border-bright bg-surface-2 px-3 text-sm text-text-primary outline-none focus:border-border-focus"
							/>
						</label>
					</div>
					<label className="flex items-center gap-2 text-sm text-text-primary">
						<input
							type="checkbox"
							checked={strict}
							disabled={planning !== "openspec-lite"}
							onChange={(event) => setStrict(event.target.checked)}
						/>
						Enable strict planning
					</label>
					{error ? <p className="text-sm text-[color:var(--color-status-red)]">{error}</p> : null}
				</div>
			</DialogBody>
			<DialogFooter>
				<Button variant="default" onClick={() => onOpenChange(false)} disabled={isPending}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => {
						void onCreate({
							template,
							title: title.trim(),
							priority,
							baseRevision: baseRevision.trim() || undefined,
							labels: labels
								.split(",")
								.map((value) => value.trim())
								.filter(Boolean),
							planning,
							strict,
						});
					}}
					disabled={isPending || title.trim().length === 0}
				>
					Create Change
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
