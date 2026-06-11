import * as RadixCheckbox from "@radix-ui/react-checkbox";
import * as RadixSwitch from "@radix-ui/react-switch";
import { Check, Command, CornerDownLeft, PencilLine } from "lucide-react";
import type { ReactElement } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import type { BranchSelectOption } from "@/components/branch-select-dropdown";
import { CreateDialogBranchSection, CreateDialogShell } from "@/components/create-dialog-shell";
import { TaskPromptComposer } from "@/components/task-prompt-composer";
import { Button } from "@/components/ui/button";
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
	workspaceId,
	onOpenChange,
	onCreate,
}: {
	open: boolean;
	isPending?: boolean;
	error?: string | null;
	branchOptions: BranchSelectOption[];
	defaultBaseRevision: string;
	workspaceId?: string | null;
	onOpenChange: (open: boolean) => void;
	onCreate: (
		input: CreateChangeInput,
		options?: { keepDialogOpen?: boolean },
	) => Promise<boolean | void> | boolean | void;
}): ReactElement {
	const [template, setTemplate] = useState<CreateChangeInput["template"]>("feature");
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState("medium");
	const [labels, setLabels] = useState("agent-ready");
	const [baseRevision, setBaseRevision] = useState(defaultBaseRevision);
	const [planning, setPlanning] = useState<"none" | "openspec-lite">("none");
	const [strict, setStrict] = useState(false);
	const [createMore, setCreateMore] = useState(false);
	const strictId = useId();
	const createMoreId = useId();

	useEffect(() => {
		if (!open) {
			setTemplate("feature");
			setTitle("");
			setPriority("medium");
			setLabels("agent-ready");
			setBaseRevision(defaultBaseRevision);
			setPlanning("none");
			setStrict(false);
			setCreateMore(false);
		}
	}, [defaultBaseRevision, open]);

	const resetForCreateMore = useCallback(() => {
		setTitle("");
		setTemplate("feature");
		setPriority("medium");
		setLabels("agent-ready");
		setBaseRevision(defaultBaseRevision);
		setPlanning("none");
		setStrict(false);
	}, [defaultBaseRevision]);

	const handleCreate = useCallback(async () => {
		const trimmedTitle = title.trim();
		if (isPending || trimmedTitle.length === 0) {
			return;
		}
		const created = await onCreate(
			{
				template,
				title: trimmedTitle,
				priority,
				baseRevision: baseRevision.trim() || undefined,
				labels: labels
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean),
				planning,
				strict,
			},
			{ keepDialogOpen: createMore },
		);
		if (createMore && created !== false) {
			resetForCreateMore();
		}
	}, [baseRevision, createMore, isPending, labels, onCreate, planning, priority, resetForCreateMore, strict, template, title]);

	useHotkeys(
		"mod+enter",
		() => {
			handleCreate();
		},
		{
			enabled: open,
			enableOnFormTags: true,
			enableOnContentEditable: true,
			preventDefault: true,
		},
		[handleCreate, open],
	);

	return (
		<CreateDialogShell
			open={open}
			onOpenChange={onOpenChange}
			title="New change"
			icon={<PencilLine size={16} />}
			footer={
				<>
					<label
						htmlFor={createMoreId}
						className="mr-auto flex cursor-pointer select-none items-center gap-2 text-[12px] text-text-primary"
					>
						<RadixSwitch.Root
							id={createMoreId}
							checked={createMore}
							onCheckedChange={setCreateMore}
							className="relative h-5 w-9 cursor-pointer rounded-full bg-surface-4 data-[state=checked]:bg-accent"
						>
							<RadixSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
						</RadixSwitch.Root>
						<span>Create more</span>
					</label>
					<Button variant="default" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
						Cancel
					</Button>
					<Button variant="primary" size="sm" onClick={handleCreate} disabled={isPending || title.trim().length === 0}>
						<span className="inline-flex items-center">
							Create
							<span className="ml-1.5 inline-flex items-center gap-0.5" aria-hidden>
								<Command size={12} />
								<CornerDownLeft size={12} />
							</span>
						</span>
					</Button>
				</>
			}
		>
			<div>
				<TaskPromptComposer
					value={title}
					onValueChange={setTitle}
					images={[]}
					onImagesChange={() => {}}
					onSubmit={handleCreate}
					placeholder="Describe the change..."
					autoFocus
					workspaceId={workspaceId ?? null}
					showAttachImageButton={false}
				/>
			</div>

			<div className="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
				<CreateDialogBranchSection
					label="Change base revision"
					options={branchOptions}
					selectedValue={baseRevision}
					onSelect={setBaseRevision}
					emptyText="No refs detected"
				/>

				<details
					className="rounded-md border border-border bg-surface-1 px-3 py-2 text-[12px] text-text-primary"
				>
					<summary className="cursor-pointer select-none font-medium text-text-secondary">Change options</summary>
					<div className="mt-3 flex flex-col gap-2.5">
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

						<label
							htmlFor={strictId}
							className="flex cursor-pointer select-none items-center gap-2 text-[12px] text-text-primary"
						>
							<RadixCheckbox.Root
								id={strictId}
								checked={strict}
								onCheckedChange={(checked) => setStrict(checked === true)}
								disabled={planning !== "openspec-lite"}
								className="flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-sm border border-border-bright bg-surface-3 data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-default disabled:opacity-40"
							>
								<RadixCheckbox.Indicator>
									<Check size={10} className="text-white" />
								</RadixCheckbox.Indicator>
							</RadixCheckbox.Root>
							Enable strict planning
						</label>
					</div>
				</details>
				{error ? <p className="text-sm text-[color:var(--color-status-red)]">{error}</p> : null}
			</div>
		</CreateDialogShell>
	);
}
