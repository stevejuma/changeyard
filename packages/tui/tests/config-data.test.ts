import assert from "node:assert/strict";
import {
  buildMentionOptions,
  buildSlashOptions,
  extractMentionQuery,
  formatMention,
  getAutocompleteMode,
  insertMention,
} from "../src/react/autocomplete";
import type { SlashCommand } from "../src/react/types";

const commands: SlashCommand[] = [
  { name: "config", description: "Open the control panel", run: () => {} },
  { name: "agent", description: "Start configured agent", run: () => {} },
];

assert.equal(getAutocompleteMode("/con"), "/", "slash mode");
assert.equal(getAutocompleteMode("inspect @src"), "@", "mention mode");
assert.equal(extractMentionQuery("inspect @src"), "src", "mention query");
assert.equal(formatMention("src/cli.ts"), "@./src/cli.ts", "simple mention");
assert.equal(formatMention("src/with space.ts"), '@"./src/with space.ts"', "quoted mention");
assert.equal(insertMention("inspect @src", "@./src/cli.ts"), "inspect @./src/cli.ts ", "insert mention");
assert.equal(buildSlashOptions(commands, "/con")[0]?.display, "/config", "slash filtering");
assert.equal(
  buildMentionOptions([{ path: "src/cli.ts", name: "cli.ts", changed: true }])[0]?.value,
  "@./src/cli.ts",
  "mention options",
);

process.stdout.write("ok - react autocomplete helpers\n");
