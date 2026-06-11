import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyNodeId } from "@/types";

export interface DependencyLinkDraft {
	sourceNodeId: DependencyNodeId;
	targetNodeId: DependencyNodeId | null;
	pointerClientX: number;
	pointerClientY: number;
}

const CARD_GAP_CAPTURE_PX = 16;

function getNearestNodeIdInColumn(columnElement: HTMLElement, clientY: number): DependencyNodeId | null {
	const cards = Array.from(columnElement.querySelectorAll<HTMLElement>("[data-dependency-node-id]"));
	if (cards.length === 0) {
		return null;
	}

	let nearestBelow: { nodeId: DependencyNodeId; distance: number } | null = null;
	let nearestAbove: { nodeId: DependencyNodeId; distance: number } | null = null;

	for (const card of cards) {
		const nodeId = card.dataset.dependencyNodeId as DependencyNodeId | undefined;
		if (!nodeId) {
			continue;
		}
		const rect = card.getBoundingClientRect();
		if (clientY >= rect.top && clientY <= rect.bottom) {
			return nodeId;
		}
		if (clientY < rect.top) {
			const distance = rect.top - clientY;
			if (!nearestBelow || distance < nearestBelow.distance) {
				nearestBelow = { nodeId, distance };
			}
			continue;
		}
		const distance = clientY - rect.bottom;
		if (!nearestAbove || distance < nearestAbove.distance) {
			nearestAbove = { nodeId, distance };
		}
	}

	if (nearestBelow && nearestBelow.distance <= CARD_GAP_CAPTURE_PX) {
		return nearestBelow.nodeId;
	}
	if (nearestAbove && nearestAbove.distance <= CARD_GAP_CAPTURE_PX) {
		return nearestAbove.nodeId;
	}

	return null;
}

function getNodeIdFromPoint(clientX: number, clientY: number): DependencyNodeId | null {
	if (typeof document === "undefined") {
		return null;
	}
	const elementsAtPoint = document.elementsFromPoint(clientX, clientY);
	let columnElement: HTMLElement | null = null;
	for (const element of elementsAtPoint) {
		const card = element.closest("[data-dependency-node-id]");
		if (card instanceof HTMLElement) {
			return (card.dataset.dependencyNodeId as DependencyNodeId | undefined) ?? null;
		}
		if (!columnElement) {
			const column = element.closest("[data-column-id]");
			if (column instanceof HTMLElement) {
				columnElement = column;
			}
		}
	}

	if (columnElement) {
		return getNearestNodeIdInColumn(columnElement, clientY);
	}
	return null;
}

export function useDependencyLinking({
	canLinkNodes,
	onCreateDependency,
}: {
	canLinkNodes?: (fromNodeId: DependencyNodeId, toNodeId: DependencyNodeId) => boolean;
	onCreateDependency?: (fromNodeId: DependencyNodeId, toNodeId: DependencyNodeId) => void;
}): {
	draft: DependencyLinkDraft | null;
	onDependencyPointerDown: (nodeId: DependencyNodeId, event: ReactMouseEvent<HTMLElement>) => void;
	onDependencyPointerEnter: (nodeId: DependencyNodeId) => void;
} {
	const [draft, setDraft] = useState<DependencyLinkDraft | null>(null);
	const draftRef = useRef<DependencyLinkDraft | null>(null);
	const modifierPressedRef = useRef(false);

	const getValidTargetTaskId = useCallback(
		(sourceNodeId: DependencyNodeId, targetNodeId: DependencyNodeId | null): DependencyNodeId | null => {
			if (!targetNodeId || targetNodeId === sourceNodeId) {
				return null;
			}
			if (canLinkNodes && !canLinkNodes(sourceNodeId, targetNodeId)) {
				return null;
			}
			return targetNodeId;
		},
		[canLinkNodes],
	);

	const completeDependencyLink = useCallback(
		(nodeId: DependencyNodeId | null): boolean => {
			const current = draftRef.current;
			const validNodeId = current ? getValidTargetTaskId(current.sourceNodeId, nodeId) : null;
			if (!current || !validNodeId) {
				return false;
			}
			onCreateDependency?.(current.sourceNodeId, validNodeId);
			draftRef.current = null;
			setDraft(null);
			return true;
		},
		[getValidTargetTaskId, onCreateDependency],
	);

	useEffect(() => {
		draftRef.current = draft;
	}, [draft]);

	useEffect(() => {
		const handleKeyStateChange = (event: KeyboardEvent) => {
			modifierPressedRef.current = event.metaKey || event.ctrlKey;
		};
		const handleWindowBlur = () => {
			modifierPressedRef.current = false;
			draftRef.current = null;
			setDraft(null);
		};
		window.addEventListener("keydown", handleKeyStateChange);
		window.addEventListener("keyup", handleKeyStateChange);
		window.addEventListener("blur", handleWindowBlur);
		return () => {
			window.removeEventListener("keydown", handleKeyStateChange);
			window.removeEventListener("keyup", handleKeyStateChange);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, []);

	const isLinking = draft !== null;

	useEffect(() => {
		if (!isLinking) {
			if (typeof document !== "undefined") {
				document.body.classList.remove("kb-dependency-link-mode");
			}
			return;
		}

		document.body.classList.add("kb-dependency-link-mode");

		const handleMouseMove = (event: MouseEvent) => {
			setDraft((current) => {
				if (!current) {
					return current;
				}
				const targetTaskId = getValidTargetTaskId(
					current.sourceNodeId,
					getNodeIdFromPoint(event.clientX, event.clientY),
				);
				return {
					...current,
					pointerClientX: event.clientX,
					pointerClientY: event.clientY,
					targetNodeId: targetTaskId,
				};
			});
		};

		const handleMouseUp = (event: MouseEvent) => {
			setDraft(() => {
				const current = draftRef.current;
				if (!current) {
					return null;
				}
				const resolvedTargetTaskId = getValidTargetTaskId(
					current.sourceNodeId,
					getNodeIdFromPoint(event.clientX, event.clientY) ?? current.targetNodeId,
				);
				if (modifierPressedRef.current && completeDependencyLink(resolvedTargetTaskId ?? null)) {
					return null;
				}
				if (!modifierPressedRef.current) {
					draftRef.current = null;
					return null;
				}
				const nextDraft = {
					...current,
					targetNodeId: resolvedTargetTaskId ?? null,
					pointerClientX: event.clientX,
					pointerClientY: event.clientY,
				};
				draftRef.current = nextDraft;
				return nextDraft;
			});
		};

		const handleModifierRelease = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey) {
				return;
			}
			modifierPressedRef.current = false;
			const current = draftRef.current;
			if (!current) {
				return;
			}
			const resolvedTargetTaskId = getValidTargetTaskId(
				current.sourceNodeId,
				current.targetNodeId ?? getNodeIdFromPoint(current.pointerClientX, current.pointerClientY),
			);
			if (completeDependencyLink(resolvedTargetTaskId)) {
				return;
			}
			draftRef.current = null;
			setDraft(null);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("keyup", handleModifierRelease);
		return () => {
			document.body.classList.remove("kb-dependency-link-mode");
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("keyup", handleModifierRelease);
		};
	}, [completeDependencyLink, getValidTargetTaskId, isLinking]);

	const handleDependencyPointerDown = useCallback((nodeId: DependencyNodeId, event: ReactMouseEvent<HTMLElement>) => {
		modifierPressedRef.current = event.metaKey || event.ctrlKey;
		setDraft((current) => {
			if (current?.sourceNodeId === nodeId) {
				draftRef.current = null;
				return null;
			}
			const nextDraft = {
				sourceNodeId: nodeId,
				targetNodeId: null,
				pointerClientX: event.clientX,
				pointerClientY: event.clientY,
			};
			draftRef.current = nextDraft;
			return nextDraft;
		});
	}, []);

	const handleDependencyPointerEnter = useCallback(
		(nodeId: DependencyNodeId) => {
			setDraft((current) => {
				if (!current) {
					return current;
				}
				const nextDraft = {
					...current,
					targetNodeId: getValidTargetTaskId(current.sourceNodeId, nodeId),
				};
				draftRef.current = nextDraft;
				return nextDraft;
			});
		},
		[getValidTargetTaskId],
	);

	return {
		draft,
		onDependencyPointerDown: handleDependencyPointerDown,
		onDependencyPointerEnter: handleDependencyPointerEnter,
	};
}
