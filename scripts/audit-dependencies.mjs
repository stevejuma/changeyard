import { spawnSync } from "node:child_process";

const allowedAdvisories = new Map([
	[
		"1119676",
		{
			module: "@ai-sdk/provider-utils",
			paths: [".>@clinebot/core>@clinebot/llms>dify-ai-provider>@ai-sdk/provider-utils"],
			reason: "Cline's Dify provider currently has no compatible upstream fix.",
		},
	],
]);

const result = spawnSync("pnpm", ["audit", "--json"], { encoding: "utf8" });
let report;
try {
	report = JSON.parse(result.stdout || "{}");
} catch {
	console.error(result.stderr || result.stdout || "pnpm audit did not return JSON.");
	process.exitCode = 1;
	process.exit();
}

const advisories = report.advisories ?? {};
const unexpected = [];
const presentAllowed = new Set();

for (const [id, advisory] of Object.entries(advisories)) {
	const allowed = allowedAdvisories.get(id);
	const paths = advisory.findings?.flatMap((finding) => finding.paths ?? []) ?? [];
	if (allowed && advisory.module_name === allowed.module && paths.every((path) => allowed.paths.includes(path))) {
		presentAllowed.add(id);
		console.warn(`Allowed advisory ${id} for ${allowed.module}: ${allowed.reason}`);
		continue;
	}
	unexpected.push(`${id} (${advisory.module_name ?? "unknown package"}): ${advisory.title ?? "unknown advisory"}`);
}

for (const id of allowedAdvisories.keys()) {
	if (!presentAllowed.has(id)) {
		unexpected.push(`Allowlisted advisory ${id} is no longer present; remove the stale exception.`);
	}
}

if (unexpected.length > 0) {
	console.error(`Dependency audit failed:\n${unexpected.map((entry) => `- ${entry}`).join("\n")}`);
	process.exitCode = 1;
} else {
	console.log("Dependency audit has no unapproved advisories.");
}
