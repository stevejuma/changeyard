const RESERVED_SHORTCUT = "FF";

const KEY_GROUPS = [
	["A", "S", "D"],
	["A", "S", "D", "G"],
	["Q", "W", "E", "R", "T"],
	["Z", "X", "C", "V", "B"],
	["J", "K", "L"],
	["H", "I", "M", "N", "O", "P", "U", "Y"],
] as const;

export type FModeShortcutAssignment<T> = {
	shortcut: string;
	target: T;
};

function isValidShortcut(shortcut: string, used: ReadonlySet<string>): boolean {
	return shortcut !== RESERVED_SHORTCUT && !used.has(shortcut);
}

export function generateFModeShortcut(used: ReadonlySet<string>): string | undefined {
	for (let groupIndex = 0; groupIndex < 3; groupIndex += 1) {
		const group = KEY_GROUPS[groupIndex];
		for (const first of group) {
			for (const second of group) {
				const shortcut = first + second;
				if (isValidShortcut(shortcut, used)) {
					return shortcut;
				}
			}
		}
	}

	const leftHandKeys = [...KEY_GROUPS[0], ...KEY_GROUPS[1], ...KEY_GROUPS[2], ...KEY_GROUPS[3]];
	const uniqueLeftKeys = [...new Set(leftHandKeys)];
	for (const first of uniqueLeftKeys) {
		for (const second of uniqueLeftKeys) {
			const shortcut = first + second;
			if (isValidShortcut(shortcut, used)) {
				return shortcut;
			}
		}
	}

	const allPreferredKeys = [...uniqueLeftKeys, ...KEY_GROUPS[4]];
	for (const first of allPreferredKeys) {
		for (const second of allPreferredKeys) {
			const shortcut = first + second;
			if (isValidShortcut(shortcut, used)) {
				return shortcut;
			}
		}
	}

	for (let first = 65; first <= 90; first += 1) {
		for (let second = 65; second <= 90; second += 1) {
			const shortcut = String.fromCharCode(first) + String.fromCharCode(second);
			if (isValidShortcut(shortcut, used)) {
				return shortcut;
			}
		}
	}

	return undefined;
}

export function assignFModeShortcuts<T>(targets: readonly T[]): FModeShortcutAssignment<T>[] {
	const used = new Set<string>();
	const assignments: FModeShortcutAssignment<T>[] = [];
	for (const target of targets) {
		const shortcut = generateFModeShortcut(used);
		if (!shortcut) {
			break;
		}
		used.add(shortcut);
		assignments.push({ shortcut, target });
	}
	return assignments;
}

export function isEditableOrTerminalTarget(target: EventTarget | null): boolean {
	if (typeof Element === "undefined") {
		return false;
	}
	if (!(target instanceof Element)) {
		return false;
	}
	if (target.closest(".xterm, [data-vcs-terminal], [data-vcs-fmode-ignore]")) {
		return true;
	}
	const editable = target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
	if (!editable) {
		return false;
	}
	if (editable instanceof HTMLInputElement) {
		const type = editable.type.toLowerCase();
		return !["button", "checkbox", "color", "file", "radio", "range", "reset", "submit"].includes(type);
	}
	return true;
}
