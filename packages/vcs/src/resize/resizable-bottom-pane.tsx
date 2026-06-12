import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

function getDefaultPaneHeight(minHeight: number): number {
	if (typeof window === "undefined") {
		return minHeight;
	}
	return Math.max(minHeight, Math.floor(window.innerHeight * 0.35));
}

function getMaxPaneHeight(minHeight: number): number {
	if (typeof window === "undefined") {
		return minHeight;
	}
	return Math.max(minHeight, Math.floor(window.innerHeight * 0.75));
}

function clampHeight(value: number, minHeight: number): number {
	return Math.max(minHeight, Math.min(value, getMaxPaneHeight(minHeight)));
}

export function ResizableBottomPane({
	children,
	minHeight = 220,
	initialHeight,
	onHeightChange,
}: {
	children: ReactNode;
	minHeight?: number;
	initialHeight?: number;
	onHeightChange?: (height: number) => void;
}): React.ReactElement {
	const [height, setHeight] = useState(() => clampHeight(initialHeight ?? getDefaultPaneHeight(minHeight), minHeight));

	useEffect(() => {
		function handleResize(): void {
			setHeight((current) => clampHeight(current, minHeight));
		}
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [minHeight]);

	useEffect(() => {
		onHeightChange?.(height);
	}, [height, onHeightChange]);

	function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
		event.preventDefault();
		const startY = event.clientY;
		const startHeight = height;
		const previousUserSelect = document.body.style.userSelect;
		const previousCursor = document.body.style.cursor;
		document.body.style.userSelect = "none";
		document.body.style.cursor = "ns-resize";

		function move(pointerEvent: PointerEvent): void {
			setHeight(clampHeight(startHeight - (pointerEvent.clientY - startY), minHeight));
		}

		function stop(): void {
			document.body.style.userSelect = previousUserSelect;
			document.body.style.cursor = previousCursor;
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", stop);
			window.removeEventListener("pointercancel", stop);
		}

		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", stop);
		window.addEventListener("pointercancel", stop);
	}

	return (
		<div
			className="relative flex min-w-0 shrink-0 overflow-visible border-t border-divider bg-surface-1"
			style={{ height, minHeight }}
		>
			<div
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize console pane"
				title="Resize console"
				className="absolute left-0 right-0 top-0 z-20 h-2 cursor-ns-resize touch-none"
				onPointerDown={startResize}
			/>
			<div className="flex min-w-0 flex-1 overflow-hidden">{children}</div>
		</div>
	);
}
