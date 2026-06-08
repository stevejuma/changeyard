import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import test from "node:test";
import { runInit } from "../src/commands/init.js";
import { configSchema } from "../src/config/schema.js";
import { validateJsonSchema } from "../src/config/schemaValidator.js";

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-schema-test-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project: { idPrefix: "CY", defaultBase: "main" },
    storage: { root: ".changeyard", changesDir: "changes", workspacesDir: "workspaces", reviewsDir: "reviews" },
    provider: { type: "noop" },
    vcs: { engine: "plain-copy", fallback: "plain-copy" },
    workspace: {
      pathPattern: "{id}",
      namePattern: "cy-{id}",
      branchPattern: "cy/{id}",
      hydrate: { installCommand: "", copy: [], link: [], neverCopy: [] },
    },
    checks: { standard: [] },
    ...overrides,
  };
}

test("generated schema files pass runtime validation", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const generated = JSON.parse(readFileSync(path.join(repo, ".changeyard", "schema.json"), "utf8"));
    assert.deepEqual(generated, configSchema);
    const errors = validateJsonSchema(configSchema, generated);
    assert.equal(errors.length, 0);
  } finally {
    cleanup(repo);
  }
});

test("provider-specific schema branches are enforced", () => {
  const githubMissingOwner = baseConfig({ provider: { type: "github", repo: "example-repo" } });
  assert.ok(
    validateJsonSchema(configSchema, githubMissingOwner).some((entry) => entry.includes("$.provider.owner is required")),
    "GitHub should require owner",
  );

  const githubMissingRepo = baseConfig({ provider: { type: "github", owner: "example-org" } });
  assert.ok(
    validateJsonSchema(configSchema, githubMissingRepo).some((entry) => entry.includes("$.provider.repo is required")),
    "GitHub should require repo",
  );

  const gitlabMissingOwner = baseConfig({ provider: { type: "gitlab", repo: "example-repo" } });
  assert.ok(
    validateJsonSchema(configSchema, gitlabMissingOwner).some((entry) => entry.includes("$.provider.owner is required")),
    "GitLab should require owner",
  );

  const forgejoMissingBase = baseConfig({ provider: { type: "forgejo", owner: "example-org", repo: "example-repo" } });
  assert.ok(
    validateJsonSchema(configSchema, forgejoMissingBase).some((entry) => entry.includes("$.provider.baseUrl is required")),
    "Forgejo should require baseUrl",
  );

  const noopWithOwner = baseConfig({ provider: { type: "noop", owner: "not-allowed" } });
  assert.equal(validateJsonSchema(configSchema, noopWithOwner).length, 0);
});

test("schema validation emits path-aware suggestions", () => {
  const withTypo = baseConfig({ provider: { type: "github", owner: "example-org", repo: "example-repo", ownerr: true } });
  const typoErrors = validateJsonSchema(configSchema, withTypo);
  assert.ok(typoErrors.some((entry) => entry.includes(".provider.ownerr") && /Did you mean:/.test(entry)));

  const withUnknown = { ...baseConfig(), unexpected: true };
  const unknownErrors = validateJsonSchema(configSchema, withUnknown);
  assert.ok(unknownErrors.some((entry) => entry.includes("$.unexpected")));
});

test("type violations and array constraints are detected", () => {
  const badConfig = baseConfig({ workspace: { pathPattern: 42, namePattern: "", branchPattern: "cy/{id}", hydrate: { installCommand: "", copy: {}, link: [], neverCopy: [] } } });
  const errors = validateJsonSchema(configSchema, badConfig);
  assert.ok(errors.some((entry) => entry.includes("$.workspace.pathPattern must be string")));
  assert.ok(errors.some((entry) => entry.includes("$.workspace.namePattern must have length at least")));
  assert.ok(errors.some((entry) => entry.includes("$.workspace.hydrate.copy must be an array")));

  const badChecks = baseConfig({ checks: { standard: [1, 2] } });
  assert.ok(validateJsonSchema(configSchema, badChecks).some((entry) => entry.includes("$.checks.standard[0] must be string"));
  assert.ok(validateJsonSchema(configSchema, badChecks).some((entry) => entry.includes("$.checks.standard[1] must be string"));
});
