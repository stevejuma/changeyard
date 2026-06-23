import { describe, expect, it } from "vitest";

import { getErrorMessage, toError } from "@/utils/error-message";

describe("getErrorMessage", () => {
	it("reads plain Error messages", () => {
		expect(getErrorMessage(new Error("Move failed"))).toBe("Move failed");
	});

	it("reads RTK query error object messages", () => {
		expect(getErrorMessage({ message: "Cannot complete change while planning gates are pending." })).toBe(
			"Cannot complete change while planning gates are pending.",
		);
	});

	it("reads nested transport error messages", () => {
		expect(getErrorMessage({ status: 400, data: { message: "Review requires a clean workspace." } })).toBe(
			"Review requires a clean workspace.",
		);
		expect(getErrorMessage({ error: { data: { message: "Runtime unavailable." } } })).toBe("Runtime unavailable.");
	});

	it("uses the fallback for object values without a displayable message", () => {
		expect(getErrorMessage({ status: 500 }, "Drag failed.")).toBe("Drag failed.");
		expect(getErrorMessage({ status: 500 })).not.toBe("[object Object]");
		expect(getErrorMessage(new Error("[object Object]"), "Drag failed.")).toBe("Drag failed.");
	});
});

describe("toError", () => {
	it("preserves Error instances", () => {
		const error = new Error("Already normalized");
		expect(toError(error)).toBe(error);
	});

	it("wraps structured error messages", () => {
		expect(toError({ message: "Move rejected." }).message).toBe("Move rejected.");
	});

	it("wraps Error instances with non-displayable messages", () => {
		expect(toError(new Error("[object Object]"), "Move rejected.").message).toBe("Move rejected.");
	});
});
