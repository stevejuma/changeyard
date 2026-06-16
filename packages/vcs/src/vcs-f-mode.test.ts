import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { assignFModeShortcuts, generateFModeShortcut } from "@/utils/vcs-f-mode";
import {
	readVcsBooleanPreference,
	VCS_F_MODE_ENABLED_STORAGE_KEY,
	writeVcsBooleanPreference,
} from "@/utils/vcs-ui-preferences";

const originalWindow = globalThis.window;

afterEach(() => {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: originalWindow,
	});
});

function installLocalStorage(initial: Record<string, string> = {}): Map<string, string> {
	const store = new Map(Object.entries(initial));
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			localStorage: {
				getItem(key: string) {
					return store.get(key) ?? null;
				},
				setItem(key: string, value: string) {
					store.set(key, value);
				},
			},
		},
	});
	return store;
}

test("assignFModeShortcuts prioritizes left-hand home-row shortcuts", () => {
	const assignments = assignFModeShortcuts(["one", "two", "three", "four", "five"]);
	assert.deepEqual(assignments.map((assignment) => assignment.shortcut), ["AA", "AS", "AD", "SA", "SS"]);
	assert.deepEqual(assignments.map((assignment) => assignment.target), ["one", "two", "three", "four", "five"]);
});

test("generateFModeShortcut reserves FF", () => {
	const used = new Set<string>();
	for (let first = 65; first <= 90; first += 1) {
		for (let second = 65; second <= 90; second += 1) {
			used.add(String.fromCharCode(first) + String.fromCharCode(second));
		}
	}
	used.delete("FF");
	used.delete("FG");

	assert.equal(generateFModeShortcut(used), "FG");
});

test("F Mode preference defaults off and persists with VCS boolean helpers", () => {
	const store = installLocalStorage();

	assert.equal(readVcsBooleanPreference(VCS_F_MODE_ENABLED_STORAGE_KEY, false), false);
	assert.equal(writeVcsBooleanPreference(VCS_F_MODE_ENABLED_STORAGE_KEY, true), true);
	assert.equal(store.get(VCS_F_MODE_ENABLED_STORAGE_KEY), "1");
	assert.equal(readVcsBooleanPreference(VCS_F_MODE_ENABLED_STORAGE_KEY, false), true);

	assert.equal(writeVcsBooleanPreference(VCS_F_MODE_ENABLED_STORAGE_KEY, false), false);
	assert.equal(store.get(VCS_F_MODE_ENABLED_STORAGE_KEY), "0");
	assert.equal(readVcsBooleanPreference(VCS_F_MODE_ENABLED_STORAGE_KEY, true), false);
});
