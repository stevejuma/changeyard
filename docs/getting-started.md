# Getting Started

Changeyard is a local, markdown-first workflow manager. It stores planned work, reviews, and workspace metadata in the current repository and exposes that state through the CLI, Kanban, VCS, dashboard, desktop, and TUI surfaces.

## Prerequisites

- Node.js 22 or newer.
- pnpm 10.32.1 through Corepack.
- Git, and `jj` when working with the JJ workspace engine or VCS provider.

## Install And Build

From a source checkout:

```sh
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install
pnpm run build
```

For local CLI work from the checkout, use the package script:

```sh
pnpm run cy list
pnpm run cy hub start --no-open
```

For an installed package, use the binary directly:

```sh
cy list
cy hub start
```

## Open The Runtime Surfaces

The shared hub starts one local runtime process by default and records it in global app state.

```sh
cy --dashboard
cy --kanban
cy --vcs
cy hub list
```

The default hub port is `3484`. If a live default instance already exists, dashboard, Kanban, VCS, and TUI launches reuse it. Explicit alternate endpoints, such as `cy hub start --port 3490`, are tracked as separate instances.

## Read Next

- [Kanban Core Workflow](kanban/core-workflow.md)
- [VCS Core Workflow](vcs/core-workflow.md)
- [Hub](hub.md)
- [System Architecture](architecture.md)
