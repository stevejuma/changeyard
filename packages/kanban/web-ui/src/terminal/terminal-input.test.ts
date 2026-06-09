import { afterEach, describe, expect, it, vi } from "vitest";

import { sendTuiInputWithSubmit } from "@/terminal/terminal-input";

describe("sendTuiInputWithSubmit", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("sends focus-prefixed text through the backend before submitting Enter", async () => {
		vi.useFakeTimers();
		const sendInput = vi.fn(async () => ({ ok: true }));
		const resultPromise = sendTuiInputWithSubmit(sendInput, "task-1", "Ship it");

		await vi.waitFor(() => {
			expect(sendInput).toHaveBeenCalledTimes(1);
		});
		expect(sendInput).toHaveBeenNthCalledWith(1, "task-1", "\x1b[IShip it", {
			appendNewline: false,
			preferTerminal: false,
		});

		await vi.advanceTimersByTimeAsync(300);
		await expect(resultPromise).resolves.toEqual({ ok: true });
		expect(sendInput).toHaveBeenNthCalledWith(2, "task-1", "\r", {
			appendNewline: false,
			preferTerminal: false,
		});
	});

	it("does not submit Enter when typing fails", async () => {
		vi.useFakeTimers();
		const sendInput = vi.fn(async () => ({ ok: false, message: "No session" }));

		await expect(sendTuiInputWithSubmit(sendInput, "task-1", "Ship it")).resolves.toEqual({
			ok: false,
			message: "No session",
		});
		expect(sendInput).toHaveBeenCalledTimes(1);
	});
});
