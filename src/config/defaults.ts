import type { ChangeyardConfig } from "../types.js";

export const defaultConfig: ChangeyardConfig = {
  project: {
    idPrefix: "CY",
    defaultBase: "main",
  },
  storage: {
    root: ".changeyard",
    changesDir: "changes",
    workspacesDir: "workspaces",
    reviewsDir: "reviews",
  },
  provider: {
    type: "noop",
  },
  vcs: {
    engine: "plain-copy",
    fallback: "plain-copy",
    appliedStacks: [],
  },
  workspace: {
    pathPattern: "{id}/repo",
    namePattern: "cy-{id}",
    branchPattern: "cy/{id}-{slug}",
    hydrate: {
      installCommand: "",
      copy: [".env.example", ".npmrc.example"],
      link: [],
      neverCopy: [
        ".env",
        ".env.local",
        "*.sqlite",
        "*.db",
        "node_modules",
        "dist",
        "build",
        ".svelte-kit",
        "coverage",
        ".turbo",
      ],
    },
  },
  checks: {
    minimal: [],
    standard: [],
    full: [],
  },
  ui: {
    host: "127.0.0.1",
    port: "auto",
    open: true,
    requirePasscode: false,
    theme: "system",
  },
  planning: {
    defaultProfile: "none",
    defaultStrictness: "normal",
    allowQuickChanges: true,
    quickChangeCheckProfile: "minimal",
    quickChangeRequiresWorkspace: true,
    quickChangeEscalation: "warn",
    requireBeforeStart: true,
    requireBeforeComplete: true,
    syncSummaryToProvider: true,
    adapterCacheDir: "cache/planning",
    ui: {
      enabled: true,
      showBadges: true,
      allowInlineEditing: true,
    },
  },
};
