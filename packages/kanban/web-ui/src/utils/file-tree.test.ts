import { describe, expect, it } from "vitest";

import { buildPackageFileTree } from "@/utils/file-tree";

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

	it("does not compact directories that contain files", () => {
		expect(buildPackageFileTree(["a/b/c.txt", "a/x.ts"])[0]).toMatchObject({
			name: "a",
			path: "a",
			type: "directory",
			children: [
				{ name: "b", path: "a/b", type: "directory" },
				{ name: "x.ts", path: "a/x.ts", type: "file" },
			],
		});
	});

	it("keeps sibling ordering stable", () => {
		expect(buildPackageFileTree(["z/b.ts", "a/b/c.ts", "a/b/a.ts"]).map((node) => node.name)).toEqual(["a/b", "z"]);
		expect(buildPackageFileTree(["a/b/c.ts", "a/b/a.ts"])[0]?.children.map((node) => node.name)).toEqual(["a.ts", "c.ts"]);
	});
});
