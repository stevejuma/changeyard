export const configSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  title: "Changeyard configuration",
  type: "object",
  additionalProperties: false,
  required: ["project", "storage", "provider", "vcs", "workspace", "checks"],
  properties: {
    "$schema": { type: "string" },
    project: {
      type: "object",
      additionalProperties: false,
      required: ["idPrefix", "defaultBase"],
      properties: {
        idPrefix: { type: "string", minLength: 1, pattern: "^[A-Z][A-Z0-9]*$" },
        defaultBase: { type: "string", minLength: 1 },
      },
    },
    storage: {
      type: "object",
      additionalProperties: false,
      required: ["root", "changesDir", "workspacesDir", "reviewsDir"],
      properties: {
        root: { type: "string", minLength: 1 },
        changesDir: { type: "string", minLength: 1 },
        workspacesDir: { type: "string", minLength: 1 },
        reviewsDir: { type: "string", minLength: 1 },
      },
    },
    provider: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: { type: "string", enum: ["noop", "local-folder", "forgejo", "github", "gitlab"] },
        baseUrl: { type: "string", minLength: 1 },
        owner: { type: "string", minLength: 1 },
        repo: { type: "string", minLength: 1 },
        auth: {
          type: "object",
          additionalProperties: false,
          properties: {
            tokenEnv: { type: "string", minLength: 1 },
          },
        },
      },
      allOf: [
        {
          if: { properties: { type: { enum: ["forgejo", "github", "gitlab"] } }, required: ["type"] },
          then: { required: ["owner", "repo"] },
        },
        {
          if: { properties: { type: { const: "forgejo" } }, required: ["type"] },
          then: { required: ["baseUrl"] },
        },
      ],
    },
    vcs: {
      type: "object",
      additionalProperties: false,
      required: ["engine", "fallback"],
      properties: {
        engine: { type: "string", enum: ["plain-copy", "jj", "git-worktree"] },
        fallback: { type: "string", enum: ["plain-copy", "jj", "git-worktree"] },
      },
    },
    workspace: {
      type: "object",
      additionalProperties: false,
      required: ["pathPattern", "namePattern", "branchPattern", "hydrate"],
      properties: {
        pathPattern: { type: "string", minLength: 1 },
        namePattern: { type: "string", minLength: 1 },
        branchPattern: { type: "string", minLength: 1 },
        hydrate: {
          type: "object",
          additionalProperties: false,
          required: ["installCommand", "copy", "link", "neverCopy"],
          properties: {
            installCommand: { type: "string" },
            copy: { type: "array", items: { type: "string" } },
            link: { type: "array", items: { type: "string" } },
            neverCopy: { type: "array", items: { type: "string" } },
            warmupCommand: { type: "string" },
          },
        },
      },
    },
    checks: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" },
      },
    },
    ui: {
      type: "object",
      additionalProperties: false,
      properties: {
        host: { type: "string", minLength: 1 },
        port: {
          anyOf: [
            { type: "integer", minimum: 0 },
            { const: "auto" },
          ],
        },
        open: { type: "boolean" },
        requirePasscode: { type: "boolean" },
        theme: { type: "string", enum: ["light", "dark", "system"] },
      },
    },
    planning: {
      type: "object",
      additionalProperties: false,
      properties: {
        defaultProfile: { type: "string", enum: ["none", "openspec-lite"] },
        defaultStrictness: { type: "string", enum: ["normal", "strict"] },
        requireBeforeStart: { type: "boolean" },
        requireBeforeComplete: { type: "boolean" },
        syncSummaryToProvider: { type: "boolean" },
        adapterCacheDir: { type: "string", minLength: 1 },
        ui: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            showBadges: { type: "boolean" },
            allowInlineEditing: { type: "boolean" },
          },
        },
      },
    },
    pullRequests: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        draft: { type: "boolean" },
        titlePattern: { type: "string" },
        bodyFromChange: { type: "boolean" },
        labels: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;
