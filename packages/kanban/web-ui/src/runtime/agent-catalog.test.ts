import { describe, expect, it } from "vitest";

import {
	RUNTIME_AGENT_CATALOG,
	RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS,
	getRuntimeAgentCatalogEntry,
	isRuntimeAgentLaunchSupported,
} from "@runtime-agent-catalog";

describe("runtime agent catalog", () => {
	it("exposes GitHub Copilot CLI as a launch-supported terminal agent", () => {
		const copilot = getRuntimeAgentCatalogEntry("copilot");

		expect(copilot).toEqual({
			id: "copilot",
			label: "GitHub Copilot CLI",
			binary: "copilot",
			baseArgs: ["--allow-all-tools", "--allow-all-paths"],
			autonomousArgs: ["--allow-all"],
			installUrl: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference",
		});
		expect(isRuntimeAgentLaunchSupported("copilot")).toBe(true);
		expect(RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS).toEqual(["cline", "claude", "codex", "copilot", "droid", "kiro"]);
		expect(RUNTIME_AGENT_CATALOG.map((agent) => agent.id)).toContain("copilot");
	});
});
