import type { WheelEvent as ReactWheelEvent } from "react";

interface WheelLikeEvent {
	deltaX: number;
	deltaY: number;
	shiftKey: boolean;
	preventDefault: () => void;
}

export function relayHorizontalWheelScroll(event: WheelLikeEvent, container: HTMLElement | null): boolean {
	if (!container) {
		return false;
	}
	const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
	if (horizontalDelta === 0) {
		return false;
	}
	container.scrollLeft += horizontalDelta;
	event.preventDefault();
	return true;
}

export function relayReactHorizontalWheelScroll(
	event: ReactWheelEvent<HTMLElement>,
	container: HTMLElement | null,
): boolean {
	return relayHorizontalWheelScroll(event, container);
}
