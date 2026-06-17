import { describe, expect, it } from "vitest";

import { buildPackageFileTree } from "./file-tree";

describe("buildPackageFileTree", () => {
	it("compacts empty directory chains", () => {
		expect(buildPackageFileTree(["a/b/c.txt"])).toEqual([
			{
				name: "a/b",
				path: "a/b",
				type: "directory",
				children: [{ name: "c.txt", path: "a/b/c.txt", type: "file", children: [] }],
			},
		]);
	});

	it("keeps concrete directory branches expanded", () => {
		expect(buildPackageFileTree(["a/b/c.txt", "a/x.ts"])[0]).toMatchObject({
			name: "a",
			path: "a",
			type: "directory",
		});
		expect(buildPackageFileTree(["a/b/c.txt", "a/x.ts"])[0]?.children.map((node) => node.name)).toEqual([
			"b",
			"x.ts",
		]);
	});

	it("keeps sibling ordering stable", () => {
		expect(buildPackageFileTree(["z/b.ts", "a/b/c.ts", "a/b/a.ts"]).map((node) => node.name)).toEqual([
			"a/b",
			"z",
		]);
		expect(buildPackageFileTree(["a/b/c.ts", "a/b/a.ts"])[0]?.children.map((node) => node.name)).toEqual([
			"a.ts",
			"c.ts",
		]);
	});
});
