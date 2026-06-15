import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/spinner";
import type { OpenTargetId, OpenTargetOption } from "@/utils/open-targets";

function OpenTargetIcon({ option }: { option: OpenTargetOption }): React.ReactElement {
	return (
		<img
			src={option.iconSrc}
			alt=""
			aria-hidden
			className="kb-open-target-icon"
			style={{
				width: 14,
				height: 14,
				display: "block",
				objectFit: "contain",
			}}
		/>
	);
}

export function OpenWorkspaceButton({
	options,
	selectedOptionId,
	disabled,
	loading,
	onOpen,
	onSelectOption,
}: {
	options: readonly OpenTargetOption[];
	selectedOptionId: OpenTargetId;
	disabled: boolean;
	loading: boolean;
	onOpen: () => void;
	onSelectOption: (optionId: OpenTargetId) => void;
}): React.ReactElement {
	const selectedOption = options.find((option) => option.id === selectedOptionId) ?? options[0];
	if (!selectedOption) {
		return <></>;
	}

	return (
		<div className="flex">
			<Button
				fill
				size="sm"
				variant="default"
				icon={loading ? <Spinner size={12} /> : <OpenTargetIcon option={selectedOption} />}
				disabled={disabled}
				onClick={onOpen}
				aria-label={`Open in ${selectedOption.label}`}
				className="text-xs rounded-r-none kb-navbar-btn"
			>
				Open
			</Button>
			<RadixDropdownMenu.Root>
				<RadixDropdownMenu.Trigger asChild>
					<Button
						size="sm"
						variant="default"
						icon={<ChevronDown size={12} />}
						disabled={disabled}
						aria-label="Select open target"
						className="rounded-l-none border-l-0 kb-navbar-btn"
						style={{ width: 24, paddingLeft: 0, paddingRight: 0 }}
					/>
				</RadixDropdownMenu.Trigger>
				<RadixDropdownMenu.Portal>
					<RadixDropdownMenu.Content
						className="z-50 rounded-lg border border-border bg-surface-2 p-1 shadow-xl"
						style={{ animation: "kb-tooltip-show 100ms ease" }}
						sideOffset={5}
						align="end"
					>
						<div className="min-w-[180px]">
							{options.map((option) => {
								const isActive = option.id === selectedOptionId;
								return (
									<RadixDropdownMenu.Item
										key={option.id}
										className={cn(
											"flex w-full items-center gap-2 px-2.5 py-1.5 text-[13px] text-text-primary rounded-md hover:bg-surface-3 focus:bg-surface-3 focus:outline-none text-left cursor-pointer",
											isActive && "bg-surface-3",
										)}
										onSelect={() => {
											onSelectOption(option.id);
										}}
									>
										<OpenTargetIcon option={option} />
										<span className="flex-1">{option.label}</span>
										{isActive ? <Check size={14} className="text-text-secondary" /> : null}
									</RadixDropdownMenu.Item>
								);
							})}
						</div>
					</RadixDropdownMenu.Content>
				</RadixDropdownMenu.Portal>
			</RadixDropdownMenu.Root>
		</div>
	);
}
