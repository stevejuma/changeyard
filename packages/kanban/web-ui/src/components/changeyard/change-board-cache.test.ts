import { describe, expect, it } from "vitest";

import { BoundedLruCache } from "@/components/changeyard/change-board-cache";

describe("BoundedLruCache", () => {
	it("evicts the least recently used entry when over capacity", () => {
		const cache = new BoundedLruCache<string, number>(2);

		cache.set("one", 1);
		cache.set("two", 2);
		expect(cache.get("one")).toBe(1);
		cache.set("three", 3);

		expect(cache.has("one")).toBe(true);
		expect(cache.has("two")).toBe(false);
		expect(cache.has("three")).toBe(true);
		expect(cache.size).toBe(2);
	});
});
