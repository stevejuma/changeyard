# Desktop App Onboarding (Electron)

This repository now includes a desktop Electron shell for the Changeyard runtime.

## First run

From the repo root:

1. Build shared CLI and runtime outputs:

   - `pnpm run build:cli`
   - `pnpm run build:kanban`

2. Start the desktop app (packaged runtime shell):

   - `pnpm --filter @changeyard/desktop run dev`
   - `pnpm run dev:desktop`

3. Start the desktop app (Vite + HMR from source):

   - `pnpm --filter @changeyard/desktop run dev:vite`
   - `pnpm run dev:desktop:vite`

   This mode runs the web UI on `http://127.0.0.1:4173` and points Electron to that
   origin while keeping runtime probes on `127.0.0.1:3484`.

4. Or run a full desktop package build:

   - `pnpm --filter @changeyard/desktop run build`
5. The desktop launcher stages runtime artifacts from `dist/` into `packages/desktop/cli/` via
   `packages/desktop/scripts/stage-cli.mjs` before Electron starts.

## Required assumptions

- The desktop runtime launcher stages the built CLI and Kanban runtime into
  `packages/desktop/cli/`; Electron executes that staged payload rather than a
  source-tree CLI path.
- The shell probes the local runtime endpoint from `runtime-endpoint.ts`:
  - host: `127.0.0.1` (or `KANBAN_RUNTIME_HOST`)
  - port: `3484` (or `KANBAN_RUNTIME_PORT`)
- Electron window protocol remains `kanban://` and OAuth/runtime paths still use
  the same in-app routes.
- Vite mode adds `CHANGEYARD_DESKTOP_WEB_UI_URL` for window origin targeting (defaults to
  `http://127.0.0.1:4173` unless overridden by env).

## Troubleshooting

### Port 3484 already in use

If startup fails with a port-in-use error, another process is already bound on
`127.0.0.1:3484`.

- Stop the existing process and relaunch desktop, or
- Run desktop with an existing runtime already started on that port so it can attach
  instead of starting a new child.

### Port 4173 already in use (Vite mode)

If Vite mode fails because `4173` is already bound:

- Stop the existing Vite process and retry, or
- Set a different port for both web server and launch:
  - `KANBAN_WEB_UI_PORT=4174 pnpm run dev:desktop:vite`

### Missing staged CLI payload

If the desktop shell starts but cannot launch because the CLI shim reports
missing assets, rerun:

- `pnpm run build:cli`
- `pnpm run build:kanban`
- `pnpm --filter @changeyard/desktop run stage:cli`

Then restart the desktop app.
