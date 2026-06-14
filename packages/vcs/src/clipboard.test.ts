import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { copyTextToClipboard } from "@/utils/clipboard";

const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;

afterEach(() => {
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: originalNavigator,
	});
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: originalDocument,
	});
});

test("copyTextToClipboard writes text through the Clipboard API", async () => {
	const writes: string[] = [];
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			clipboard: {
				writeText: async (text: string) => {
					writes.push(text);
				},
			},
		},
	});

	assert.equal(await copyTextToClipboard("copy-me"), true);
	assert.deepEqual(writes, ["copy-me"]);
});

test("copyTextToClipboard falls back to a textarea copy command", async () => {
	const appended: unknown[] = [];
	let execCommandName: string | null = null;
	let selected = false;
	let selectionRange: [number, number] | null = null;
	let removed = false;
	const textArea = {
		value: "",
		style: {},
		setAttribute() {},
		select() {
			selected = true;
		},
		setSelectionRange(start: number, end: number) {
			selectionRange = [start, end];
		},
		remove() {
			removed = true;
		},
	};
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			clipboard: {
				writeText: async () => {
					throw new Error("clipboard unavailable");
				},
			},
		},
	});
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			body: {
				appendChild(node: unknown) {
					appended.push(node);
				},
			},
			createElement(name: string) {
				assert.equal(name, "textarea");
				return textArea;
			},
			execCommand(name: string) {
				execCommandName = name;
				return true;
			},
		},
	});

	assert.equal(await copyTextToClipboard("fallback-text"), true);
	assert.equal(textArea.value, "fallback-text");
	assert.deepEqual(appended, [textArea]);
	assert.equal(selected, true);
	assert.deepEqual(selectionRange, [0, "fallback-text".length]);
	assert.equal(execCommandName, "copy");
	assert.equal(removed, true);
});

test("copyTextToClipboard reports failure for empty text", async () => {
	assert.equal(await copyTextToClipboard(""), false);
});
