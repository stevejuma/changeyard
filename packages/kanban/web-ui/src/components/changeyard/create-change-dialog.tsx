import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

type CreateChangeInput = {
	template: "feature" | "bug" | "refactor" | "agent-task";
	title: string;
	priority?: string;
	labels?: string[];
	planning?: "none" | "openspec-lite";
	strict?: boolean;
};

export function CreateChangeDialog({
	open,
	isPending = false,
	error = null,
	onOpenChange,
	onCreate,
}: {
	open: boolean;
	isPending?: boolean;
	error?: string | null;
	onOpenChange: (open: boolean) => void;
	onCreate: (input: CreateChangeInput) => Promise<void> | void;
}): ReactElement {
	const [template, setTemplate] = useState<CreateChangeInput["template"]>("feature");
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState("medium");
	const [labels, setLabels] = useState("agent-ready");
	const [planning, setPlanning] = useState<"none" | "openspec-lite">("none");
	const [strict, setStrict] = useState(false);

	useEffect(() => {
		if (!open) {
			setTemplate("feature");
			setTitle("");
			setPriority("medium");
			setLabels("agent-ready");
			setPlanning("none");
			setStrict(false);
		}
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogHeader title="Create Change" />
			<DialogBody>
				<div className="grid gap-3">
					<label className="grid gap-1.5">
						<span className="text-sm font-medium text-text-primary">Title</span>
						<input
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Add planning status panel"
							className="h-9 rounded-md border border-divider bg-surface-1 px-3 text-sm text-text-primary outline-none"
						/>
					</label>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="grid gap-1.5">
							<span className="text-sm font-medium text-text-primary">Template</span>
							<NativeSelect
								value={template}
								onChange={(event) => setTemplate(event.target.value as CreateChangeInput["template"])}
							>
								<option value="feature">Feature</option>
								<option value="bug">Bug</option>
								<option value="refactor">Refactor</option>
								<option value="agent-task">Agent Task</option>
							</NativeSelect>
						</label>
						<label className="grid gap-1.5">
							<span className="text-sm font-medium text-text-primary">Priority</span>
							<NativeSelect value={priority} onChange={(event) => setPriority(event.target.value)}>
								<option value="low">Low</option>
								<option value="medium">Medium</option>
								<option value="high">High</option>
							</NativeSelect>
						</label>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="grid gap-1.5">
							<span className="text-sm font-medium text-text-primary">Planning</span>
							<NativeSelect
								value={planning}
								onChange={(event) => setPlanning(event.target.value as "none" | "openspec-lite")}
							>
								<option value="none">None</option>
								<option value="openspec-lite">OpenSpec Lite</option>
							</NativeSelect>
						</label>
						<label className="grid gap-1.5">
							<span className="text-sm font-medium text-text-primary">Labels</span>
							<input
								value={labels}
								onChange={(event) => setLabels(event.target.value)}
								placeholder="agent-ready, ui"
								className="h-9 rounded-md border border-divider bg-surface-1 px-3 text-sm text-text-primary outline-none"
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
