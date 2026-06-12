import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";

interface CopyValueButtonProps {
	label: string;
	displayValue: string;
	copyValue: string;
	className?: string;
}

const COPIED_RESET_MS = 1_200;

export function CopyValueButton({
	label,
	displayValue,
	copyValue,
	className,
}: CopyValueButtonProps): React.ReactElement {
	const [copied, setCopied] = useState(false);
	const resetTimerRef = useRef<number | null>(null);

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
				"group inline-flex h-7 min-w-0 items-center gap-1 rounded-md border border-border bg-surface-0 px-2 text-xs text-text-secondary",
				"transition-colors duration-150 hover:border-border-bright hover:bg-surface-2 hover:text-text-primary active:bg-surface-3",
				"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
				copied && "border-status-green/40 bg-status-green/10 text-status-green",
				className,
			)}
			title={`Copy ${label.toLowerCase()} ${copyValue}`}
			aria-label={`Copy ${label.toLowerCase()} ${copyValue}`}
			onClick={() => {
				void navigator.clipboard?.writeText(copyValue);
				setCopied(true);
				scheduleReset();
			}}
		>
			<span className={cn("text-text-tertiary transition-colors", copied && "text-status-green")}>{label}</span>
			<span className="min-w-0 truncate font-mono">{displayValue}</span>
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
