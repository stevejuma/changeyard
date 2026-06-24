import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => {
	const base = vi.fn();
	return Object.assign(base, {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	});
});

vi.mock("sonner", () => ({
	toast: toastMock,
}));

vi.mock("@/utils/clipboard", () => ({
	copyTextToClipboard: vi.fn(async () => true),
}));

import { notifyError, showAppToast } from "@/components/app-toaster";

describe("showAppToast", () => {
	beforeEach(() => {
		toastMock.mockClear();
		toastMock.error.mockClear();
		toastMock.info.mockClear();
		toastMock.success.mockClear();
		toastMock.warning.mockClear();
	});

	it("uses a plain copy action label for persistent toasts", () => {
		showAppToast({ intent: "danger", message: "Could not load change." }, "load-error");

		expect(toastMock.error).toHaveBeenCalledWith(
			"Could not load change.",
			expect.objectContaining({
				action: expect.objectContaining({
					label: "Copy details",
				}),
			}),
		);
	});

	it("does not show empty error notifications", () => {
		notifyError(" ");

		expect(toastMock.error).not.toHaveBeenCalled();
	});
});
