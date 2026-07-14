import { describe, expect, it } from "vitest";

import { authorInitial, formatDiffDelta } from "./display";

describe("display helpers", () => {
	it("derives stable initials from display names", () => {
		expect(authorInitial("Ada Lovelace")).toBe("A");
		expect(authorInitial("octo-cat")).toBe("O");
		expect(authorInitial(null)).toBe("?");
	});

	it("formats non-positive diff counts as zero", () => {
		expect(formatDiffDelta(3, "+")).toBe("+3");
		expect(formatDiffDelta(0, "-")).toBe("-0");
		expect(formatDiffDelta(-2, "+")).toBe("+0");
	});
});
