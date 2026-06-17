import assert from "node:assert/strict";
import test from "node:test";

import { buildPackageFileTree } from "./utils/file-tree";
import { readVcsFileViewMode, VCS_LAYOUT_STORAGE_KEYS, writeVcsFileViewMode } from "./utils/vcs-ui-preferences";

function installLocalStorage(): Map<string, string> {
	const storage = new Map<string, string>();
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			localStorage: {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => storage.set(key, value),
			},
		},
	});
	return storage;
}

test("buildPackageFileTree compacts empty directory chains", () => {
	assert.deepEqual(buildPackageFileTree(["a/b/c.txt"]), [
		{
			name: "a/b",
			path: "a/b",
			type: "directory",
			children: [{ name: "c.txt", path: "a/b/c.txt", type: "file", children: [] }],
		},
	]);
});

test("buildPackageFileTree keeps concrete directory branches expanded", () => {
	assert.deepEqual(buildPackageFileTree(["a/b/c.txt", "a/x.ts"])[0]?.name, "a");
	assert.deepEqual(buildPackageFileTree(["a/b/c.txt", "a/x.ts"])[0]?.children.map((node) => node.name), ["b", "x.ts"]);
});

test("buildPackageFileTree keeps sibling ordering stable", () => {
	assert.deepEqual(buildPackageFileTree(["z/b.ts", "a/b/c.ts", "a/b/a.ts"]).map((node) => node.name), ["a/b", "z"]);
	assert.deepEqual(buildPackageFileTree(["a/b/c.ts", "a/b/a.ts"])[0]?.children.map((node) => node.name), ["a.ts", "c.ts"]);
});

test("VCS file view preference supports package mode", () => {
	const storage = installLocalStorage();
	assert.equal(readVcsFileViewMode(), "tree");
	storage.set(VCS_LAYOUT_STORAGE_KEYS.fileViewMode, "package");
	assert.equal(readVcsFileViewMode(), "package");
	storage.set(VCS_LAYOUT_STORAGE_KEYS.fileViewMode, "unknown");
	assert.equal(readVcsFileViewMode(), "tree");
	assert.equal(writeVcsFileViewMode("package"), "package");
	assert.equal(storage.get(VCS_LAYOUT_STORAGE_KEYS.fileViewMode), "package");
});
