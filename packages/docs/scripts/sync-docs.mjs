import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(packageRoot, "..", "..");
const sourceRoot = resolve(repoRoot, "docs");
const outputRoot = resolve(packageRoot, "src", "content", "docs");

const pages = [
  {
    source: "index.md",
    output: "index.md",
    title: "Changeyard Documentation",
    description: "Start here for Changeyard Kanban, VCS, CLI, and hub documentation.",
  },
  {
    source: "getting-started.md",
    output: "getting-started/index.md",
    title: "Getting Started",
    description: "Install, open, and navigate the Changeyard docs and runtime surfaces.",
  },
  {
    source: "kanban/overview.md",
    output: "kanban/overview.md",
    title: "Kanban Overview",
    description: "How Changeyard uses Kanban as the local planning and runtime surface.",
  },
  {
    source: "kanban/core-workflow.md",
    output: "kanban/core-workflow.md",
    title: "Kanban Core Workflow",
    description: "The Changeyard task lifecycle from creation through review and completion.",
  },
  {
    source: "kanban/architecture.md",
    output: "kanban/architecture.md",
    title: "Kanban Architecture",
    description: "Runtime, state ownership, execution, and UI boundaries for the Kanban surface.",
  },
  {
    source: "kanban/remote-access.md",
    output: "kanban/remote-access.md",
    title: "Kanban Remote Access",
    description: "How to expose the local hub safely when remote access is required.",
  },
  {
    source: "kanban/upstream.md",
    output: "kanban/upstream.md",
    title: "Kanban Upstream Provenance",
    description: "Upstream Cline Kanban lineage and Changeyard-specific differences.",
  },
  {
    source: "vcs/index.md",
    output: "vcs/index.md",
    title: "VCS Overview",
    description: "Provider-neutral VCS app architecture and support matrix.",
  },
  {
    source: "vcs/core-workflow.md",
    output: "vcs/core-workflow.md",
    title: "VCS Core Workflow",
    description: "How to inspect, preview, and apply repository changes through the VCS app.",
  },
  {
    source: "vcs/provider-model.md",
    output: "vcs/provider-model.md",
    title: "VCS Provider Model",
    description: "How neutral VCS operations map to JJ and Git provider implementations.",
  },
  {
    source: "vcs/jj-supported-functionality.md",
    output: "vcs/jj-supported-functionality.md",
    title: "JJ Supported Functionality",
    description: "Current JJ capabilities, unsupported operations, and safety behavior.",
  },
  {
    source: "vcs/jj-ui-interactions.md",
    output: "vcs/jj-ui-interactions.md",
    title: "JJ UI Interactions",
    description: "User-facing flows and neutral operation mapping for the JJ provider.",
  },
  {
    source: "vcs/jj-backend-queries.md",
    output: "vcs/jj-backend-queries.md",
    title: "JJ Backend Reference",
    description: "JJ commands, revsets, templates, and mutation command shapes.",
  },
  {
    source: "vcs/troubleshooting.md",
    output: "vcs/troubleshooting.md",
    title: "VCS Troubleshooting",
    description: "Common VCS app diagnostics and recovery paths.",
  },
  {
    source: "hub.md",
    output: "cli-hub/hub.md",
    title: "Hub",
    description: "Global hub instance behavior, registry state, dashboard controls, and remote access.",
  },
  {
    source: "cli/root.md",
    output: "cli-hub/cli-reference.md",
    title: "CLI Reference",
    description: "Root Changeyard CLI command reference.",
  },
  {
    source: "cli/hub.md",
    output: "reference/cli-hub-command.md",
    title: "Hub Command",
    description: "Command reference for cy hub.",
  },
  {
    source: "architecture.md",
    output: "architecture/index.md",
    title: "System Architecture",
    description: "Changeyard architecture and ownership boundaries.",
  },
  {
    source: "desktop.md",
    output: "architecture/desktop.md",
    title: "Desktop",
    description: "Desktop app onboarding and runtime notes.",
  },
  {
    source: "adr-inline-planning.md",
    output: "architecture/inline-planning.md",
    title: "Inline Planning ADR",
    description: "Architecture decision record for inline planning.",
  },
  {
    source: "troubleshooting.md",
    output: "troubleshooting/index.md",
    title: "Troubleshooting",
    description: "Common Changeyard setup, workspace, docs, and hub issues.",
  },
  {
    source: "planning-profiles.md",
    output: "reference/planning-profiles.md",
    title: "Planning Profiles",
    description: "Planning profile reference.",
  },
  {
    source: "versioning-policy.md",
    output: "reference/versioning-policy.md",
    title: "Versioning Policy",
    description: "Versioning policy reference.",
  },
  {
    source: "release-notes.md",
    output: "reference/release-notes.md",
    title: "Release Notes",
    description: "Release notes for Changeyard.",
  },
];

await rm(outputRoot, { recursive: true, force: true });

for (const page of pages) {
  const sourcePath = resolve(sourceRoot, page.source);
  const outputPath = resolve(outputRoot, page.output);
  const markdown = await readFile(sourcePath, "utf8");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderPage(page, markdown));
}

console.log(`Synced ${pages.length} docs pages to ${outputRoot}`);

function renderPage(page, markdown) {
  const body = stripFirstHeading(stripFrontmatter(markdown)).trimStart();
  return `---\ntitle: ${quoteYaml(page.title)}\ndescription: ${quoteYaml(page.description)}\n---\n\n${body}`;
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return markdown;
  }
  const end = markdown.indexOf("\n---\n", 4);
  return end === -1 ? markdown : markdown.slice(end + 5);
}

function stripFirstHeading(markdown) {
  return markdown.replace(/^# [^\n]+\n+/, "");
}

function quoteYaml(value) {
  return JSON.stringify(value);
}
