import type { ReactElement, ReactNode } from "react";

import { BranchSelectDropdown, type BranchSelectOption } from "@/components/branch-select-dropdown";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";

export function CreateDialogShell({
	open,
	onOpenChange,
	title,
	icon,
	children,
	footer,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	icon?: ReactNode;
	children: ReactNode;
	footer: ReactNode;
}): ReactElement {
	return (
		<Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-2xl">
			<DialogHeader title={title} icon={icon} />
			<DialogBody>{children}</DialogBody>
			<DialogFooter>{footer}</DialogFooter>
		</Dialog>
	);
}

export function CreateDialogBranchSection({
	label,
	options,
	selectedValue,
	onSelect,
	emptyText,
}: {
	label: string;
	options: BranchSelectOption[];
	selectedValue: string;
	onSelect: (value: string) => void;
	emptyText: string;
}): ReactElement {
	return (
		<div>
			<span className="mb-1 block text-[11px] text-text-secondary">{label}</span>
			<BranchSelectDropdown
				options={options}
				selectedValue={selectedValue}
				onSelect={onSelect}
				fill
				size="sm"
				emptyText={emptyText}
			/>
		</div>
	);
}
