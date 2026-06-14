import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { copyTextToClipboard } from "@/utils/clipboard";

interface CopyValueButtonProps {
	label?: string | null;
	displayValue: string;
	copyValue: string;
	highlightPrefix?: string | null;
	className?: string;
}

const COPIED_RESET_MS = 1_200;

export function CopyValueButton({
	label,
	displayValue,
	copyValue,
	highlightPrefix,
	className,
}: CopyValueButtonProps): React.ReactElement {
	const [copied, setCopied] = useState(false);
	const resetTimerRef = useRef<number | null>(null);
	const normalizedLabel = label?.trim() || null;
	const normalizedHighlightPrefix = highlightPrefix?.trim() || "";
	const shouldHighlight =
		normalizedHighlightPrefix.length > 0 && displayValue.startsWith(normalizedHighlightPrefix);
	const highlightedValue = shouldHighlight ? normalizedHighlightPrefix : "";
	const remainingValue = shouldHighlight ? displayValue.slice(normalizedHighlightPrefix.length) : displayValue;
	const labelForA11y = normalizedLabel ? `${normalizedLabel.toLowerCase()} ${copyValue}` : copyValue;

	useEffect(() => {
		return () => {
			if (resetTimerRef.current !== null) {
				window.clearTimeout(resetTimerRef.current);
			}
		};
	}, []);

	function scheduleReset(): void {
		if (resetTimerRef.current !== null) {
			window.clearTimeout(resetTimerRef.current);
		}
		resetTimerRef.current = window.setTimeout(() => {
			setCopied(false);
			resetTimerRef.current = null;
		}, COPIED_RESET_MS);
	}

	return (
		<button
			type="button"
			className={cn(
				"group inline-flex h-6 min-w-0 items-center gap-1 rounded-md border border-border bg-surface-0 px-1.5 text-[11px] text-text-secondary",
				"transition-colors duration-150 hover:border-border-bright hover:bg-surface-2 hover:text-text-primary active:bg-surface-3",
				"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
				copied && "border-status-green/40 bg-status-green/10 text-status-green",
				className,
			)}
			title={`Copy ${labelForA11y}`}
			aria-label={`Copy ${labelForA11y}`}
			onClick={(event) => {
				event.stopPropagation();
				void copyTextToClipboard(copyValue).then((success) => {
					if (!success) {
						return;
					}
					setCopied(true);
					scheduleReset();
				});
			}}
		>
			{normalizedLabel ? (
				<span className={cn("text-text-tertiary transition-colors", copied && "text-status-green")}>{normalizedLabel}</span>
			) : null}
			<span className="min-w-0 truncate font-mono">
				{highlightedValue ? (
					<span className={cn("font-bold text-accent transition-colors", copied && "text-status-green")}>
						{highlightedValue}
					</span>
				) : null}
				<span className={highlightedValue ? "text-text-tertiary" : undefined}>{remainingValue}</span>
			</span>
			<span className="relative grid h-3 w-3 shrink-0 place-items-center overflow-hidden">
				<Copy
					size={12}
					className={cn(
						"absolute transition-all duration-150 group-hover:scale-110",
						copied ? "scale-75 rotate-12 opacity-0" : "scale-100 rotate-0 opacity-100",
					)}
				/>
				<Check
					size={12}
					className={cn(
						"absolute text-status-green transition-all duration-150",
						copied ? "scale-100 rotate-0 opacity-100" : "scale-75 -rotate-12 opacity-0",
					)}
				/>
			</span>
		</button>
	);
}
