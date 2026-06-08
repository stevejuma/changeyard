#!/usr/bin/env node
const providers = {
  forgejo: ["FORGEJO_BASE_URL", "FORGEJO_OWNER", "FORGEJO_REPO", "FORGE_TOKEN"],
  github: ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN"],
  gitlab: ["GITLAB_OWNER", "GITLAB_REPO", "GITLAB_TOKEN"],
};

const provider = process.argv[2] ?? "github";
if (!providers[provider]) {
  console.error(`Unknown provider: ${provider}. Expected one of ${Object.keys(providers).join(", ")}`);
  process.exit(2);
}

if (process.env.CHANGEYARD_LIVE_SMOKE !== "1") {
  console.log("Skipping live forge smoke test. Set CHANGEYARD_LIVE_SMOKE=1 to enable.");
  console.log(`Required env for ${provider}: ${providers[provider].join(", ")}`);
  process.exit(0);
}

const missing = providers[provider].filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required ${provider} environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

console.log(`Live ${provider} smoke prerequisites are present.`);
console.log("Run the documented checklist in docs/live-forge-smoke.md against a disposable repository before publishing.");
