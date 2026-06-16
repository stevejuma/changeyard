import { useEffect, useRef, type MutableRefObject } from "react";

import { assignFModeShortcuts, isEditableOrTerminalTarget } from "@/utils/vcs-f-mode";

const ACTIONABLE_SELECTOR = [
	"button",
	"a[href]",
	"input:not([type='hidden'])",
	"select",
	"textarea",
	"[role='button']",
	"[role='link']",
	"[role='menuitem']",
	"[role='switch']",
	"[role='combobox']",
	"[role='tab']",
	"[role='option']",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

const SHORTCUT_ATTRIBUTE = "data-vcs-fmode-shortcut";

type OverlayRecord = {
	element: HTMLElement;
	overlay: HTMLElement;
	shortcut: string;
};

function isDisabledElement(element: HTMLElement): boolean {
	if (element.getAttribute("aria-disabled") === "true") {
		return true;
	}
	if ("disabled" in element && typeof element.disabled === "boolean") {
		return element.disabled;
	}
	return false;
}

function isElementVisible(element: HTMLElement): boolean {
	if (element.hidden || element.closest("[hidden], [aria-hidden='true'], [inert]")) {
		return false;
	}
	const style = window.getComputedStyle(element);
	if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
		return false;
	}
	const rect = element.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return false;
	}
	return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

function getTopmostDialog(): HTMLElement | null {
	const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'], [role='alertdialog']"))
		.filter((dialog) => isElementVisible(dialog));
	return dialogs.at(-1) ?? null;
}

function getActionableScope(): ParentNode {
	return getTopmostDialog() ?? document.body;
}

function collectActionableElements(scope: ParentNode): HTMLElement[] {
	const seen = new Set<HTMLElement>();
	const elements: HTMLElement[] = [];
	for (const element of Array.from(scope.querySelectorAll<HTMLElement>(ACTIONABLE_SELECTOR))) {
		if (seen.has(element) || isDisabledElement(element) || !isElementVisible(element)) {
			continue;
		}
		seen.add(element);
		elements.push(element);
	}
	return elements;
}

function createOverlay(element: HTMLElement, shortcut: string): HTMLElement {
	const rect = element.getBoundingClientRect();
	const overlay = document.createElement("div");
	overlay.className = "vcs-fmode-overlay";
	overlay.textContent = shortcut;
	overlay.dataset.vcsFmodeShortcut = shortcut;
	overlay.dataset.testid = "vcs-fmode-overlay";
	overlay.style.left = `${Math.max(4, Math.min(window.innerWidth - 28, rect.right - 18))}px`;
	overlay.style.top = `${Math.max(4, Math.min(window.innerHeight - 18, rect.bottom - 10))}px`;
	document.body.appendChild(overlay);
	return overlay;
}

function activateElement(element: HTMLElement): void {
	if (!element.isConnected || isDisabledElement(element)) {
		return;
	}
	if (
		element instanceof HTMLInputElement &&
		!["button", "checkbox", "radio", "reset", "submit"].includes(element.type.toLowerCase())
	) {
		element.focus();
		return;
	}
	if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
		element.focus();
		return;
	}
	element.click();
}

class FModeController {
	private active = false;
	private firstLetter: string | null = null;
	private records = new Map<string, OverlayRecord>();

	constructor(private readonly enabledRef: MutableRefObject<boolean>) {}

	handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.enabledRef.current) {
			return;
		}
		if (!this.active && isEditableOrTerminalTarget(event.target)) {
			return;
		}
		if (!this.active && (event.key === "f" || event.key === "F")) {
			this.activate();
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (!this.active) {
			return;
		}

		if (event.key === "Escape") {
			if (this.firstLetter) {
				this.firstLetter = null;
				this.showAllOverlays();
			} else {
				this.deactivate();
			}
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (event.key === "f" || event.key === "F") {
			this.deactivate();
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		const key = event.key.toUpperCase();
		if (key.length !== 1 || key < "A" || key > "Z") {
			this.deactivate();
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (!this.firstLetter) {
			this.firstLetter = key;
			if (!this.filterOverlays(key)) {
				this.deactivate();
			}
			return;
		}

		const record = this.records.get(this.firstLetter + key);
		if (record) {
			activateElement(record.element);
		}
		this.deactivate();
	};

	activate(): void {
		if (this.active) {
			return;
		}
		this.active = true;
		this.firstLetter = null;
		this.clearRecords();

		for (const { shortcut, target } of assignFModeShortcuts(collectActionableElements(getActionableScope()))) {
			target.setAttribute(SHORTCUT_ATTRIBUTE, shortcut);
			this.records.set(shortcut, {
				element: target,
				overlay: createOverlay(target, shortcut),
				shortcut,
			});
		}

		if (this.records.size === 0) {
			this.deactivate();
		}
	}

	deactivate = (): void => {
		if (!this.active && this.records.size === 0) {
			return;
		}
		this.active = false;
		this.firstLetter = null;
		this.clearRecords();
	};

	private clearRecords(): void {
		for (const record of this.records.values()) {
			record.overlay.remove();
			record.element.removeAttribute(SHORTCUT_ATTRIBUTE);
		}
		this.records.clear();
	}

	private filterOverlays(prefix: string): boolean {
		let hasMatch = false;
		for (const record of this.records.values()) {
			if (record.shortcut.startsWith(prefix)) {
				hasMatch = true;
				record.overlay.hidden = false;
			} else {
				record.overlay.hidden = true;
			}
		}
		return hasMatch;
	}

	private showAllOverlays(): void {
		for (const record of this.records.values()) {
			record.overlay.hidden = false;
		}
	}
}

export function FModeNavigation({ enabled }: { enabled: boolean }): React.ReactElement | null {
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;
	const controllerRef = useRef<FModeController | null>(null);
	if (!controllerRef.current) {
		controllerRef.current = new FModeController(enabledRef);
	}

	useEffect(() => {
		const controller = controllerRef.current;
		if (!controller) {
			return;
		}
		document.addEventListener("keydown", controller.handleKeyDown, true);
		window.addEventListener("resize", controller.deactivate);
		window.addEventListener("scroll", controller.deactivate, true);
		return () => {
			document.removeEventListener("keydown", controller.handleKeyDown, true);
			window.removeEventListener("resize", controller.deactivate);
			window.removeEventListener("scroll", controller.deactivate, true);
			controller.deactivate();
		};
	}, []);

	useEffect(() => {
		if (!enabled) {
			controllerRef.current?.deactivate();
		}
	}, [enabled]);

	return null;
}
