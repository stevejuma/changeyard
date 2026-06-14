import { afterEach, describe, expect, test, vi } from "vitest";

import { copyTextToClipboard } from "@/utils/clipboard";

const originalClipboard = navigator.clipboard;
const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");

afterEach(() => {
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: originalClipboard,
	});
	if (originalExecCommand) {
		Object.defineProperty(document, "execCommand", originalExecCommand);
	} else {
		Reflect.deleteProperty(document, "execCommand");
	}
	vi.restoreAllMocks();
});

describe("copyTextToClipboard", () => {
	test("writes text through the Clipboard API", async () => {
		const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});

		await expect(copyTextToClipboard("copy-me")).resolves.toBe(true);
		expect(writeText).toHaveBeenCalledWith("copy-me");
	});

	test("falls back to a textarea copy command", async () => {
		const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("blocked"));
		const execCommand = vi.fn().mockReturnValue(true);
		Object.defineProperty(document, "execCommand", {
			configurable: true,
			value: execCommand,
		});
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});

		await expect(copyTextToClipboard("fallback-text")).resolves.toBe(true);
		expect(writeText).toHaveBeenCalledWith("fallback-text");
		expect(execCommand).toHaveBeenCalledWith("copy");
		expect(document.querySelector("textarea")).toBeNull();
	});

	test("reports failure for empty text", async () => {
		await expect(copyTextToClipboard("")).resolves.toBe(false);
	});
});
