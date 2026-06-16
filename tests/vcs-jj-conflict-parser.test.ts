import assert from "node:assert/strict";
import test from "node:test";

import { parseJjConflictFile } from "../src/vcs/jj/workspace.js";

test("parses JJ conflict markers into base, left, and right sides", () => {
	const content = `pub fn conflict_label() -> &'static str {
<<<<<<< conflict 1 of 1
%%%%%%% diff from: wqtpulpx 42b5ed14 "document scenario fixture"
\\\\\\\\\\\\\\        to: srrsprpx 2267a873 "left conflict variant"
-    "base"
+    "left"
++++++ xkysqxzs 325bd621 "right conflict variant"
    "right"
>>>>>>> conflict 1 of 1 ends
}
`;

	const parsed = parseJjConflictFile(content);

	assert.equal(parsed.ok, true);
	assert.equal(parsed.conflictCount, 1);
	assert.equal(parsed.base, `pub fn conflict_label() -> &'static str {
    "base"
}
`);
	assert.equal(parsed.left, `pub fn conflict_label() -> &'static str {
    "left"
}
`);
	assert.equal(parsed.right, `pub fn conflict_label() -> &'static str {
    "right"
}
`);
});
