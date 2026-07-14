import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ResolvedConfig, transformWithEsbuild } from "vite";

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8")) as { version: string };
const XTERM_CHUNK_NAME = "xterm-vendor";
const webNodeModulesDir = resolve(__dirname, "node_modules");
const vcsSrcDir = resolve(__dirname, "../../vcs/src");
const vcsSrcPrefix = `${vcsSrcDir.replaceAll("\\", "/")}/`;

function isXtermModule(id: string): boolean {
	return id.includes("/node_modules/@xterm/") || id.includes("\\node_modules\\@xterm\\");
}

function isVcsSourceModule(id: string): boolean {
	const normalized = id.replaceAll("\\", "/");
	return (
		normalized === vcsSrcDir.replaceAll("\\", "/") ||
		normalized.startsWith(vcsSrcPrefix) ||
		normalized.includes("/packages/vcs/src/") ||
		normalized.startsWith("../../vcs/src/")
	);
}

function isNodeModule(id: string, packageName: string): boolean {
	return id.includes(`/node_modules/${packageName}/`) || id.includes(`\\node_modules\\${packageName}\\`);
}

function unifiedVcsRoutePlugin(): Plugin {
	const virtualId = "virtual:changeyard-vcs-route";
	const resolvedVirtualId = `\0${virtualId}`;

	return {
		name: "changeyard-unified-vcs-route",
		enforce: "pre",
		async resolveId(source, importer, options) {
			if (source === virtualId) {
				return resolvedVirtualId;
			}
			if (!source.startsWith("@/") || !importer || !isVcsSourceModule(importer)) {
				return null;
			}
			const resolved = await this.resolve(resolve(vcsSrcDir, source.slice(2)), importer, {
				...options,
				skipSelf: true,
			});
			return resolved ?? resolve(vcsSrcDir, source.slice(2));
		},
		load(id) {
			if (id !== resolvedVirtualId) {
				return null;
			}
			return `
import { createElement, useEffect } from "react";
import { Provider } from "react-redux";
import VcsApp from ${JSON.stringify(resolve(vcsSrcDir, "App.tsx"))};
import { AppErrorBoundary } from ${JSON.stringify(resolve(vcsSrcDir, "components/app-error-boundary.tsx"))};
import { TooltipProvider } from ${JSON.stringify(resolve(vcsSrcDir, "components/ui/tooltip.tsx"))};
import { vcsStore } from ${JSON.stringify(resolve(vcsSrcDir, "runtime/vcs-store.ts"))};
import { applyThemeToDocument, readStoredThemeId } from ${JSON.stringify(resolve(vcsSrcDir, "utils/vcs-theme.ts"))};
import { VcsRouterProvider } from ${JSON.stringify(resolve(vcsSrcDir, "utils/vcs-router.tsx"))};
import ${JSON.stringify(resolve(vcsSrcDir, "styles/globals.css"))};

export default function ChangeyardVcsRoute() {
	useEffect(() => {
		applyThemeToDocument(readStoredThemeId());
	}, []);

	return createElement(
		AppErrorBoundary,
		null,
		createElement(
			Provider,
			{ store: vcsStore },
			createElement(
				TooltipProvider,
				null,
				createElement(VcsRouterProvider, null, createElement(VcsApp)),
			),
		),
	);
}
`;
		},
		transform(code, id) {
			if (!isVcsSourceModule(id) || !code.includes("@/")) {
				return null;
			}
			return {
				code: code.replace(/(["'])@\/([^"']+)\1/g, (_match, quote: string, sourcePath: string) => {
					return `${quote}${resolve(vcsSrcDir, sourcePath)}${quote}`;
				}),
				map: null,
			};
		},
	};
}

function selectiveBuildMinifyPlugin(): Plugin {
	let resolvedConfig: ResolvedConfig | null = null;

	return {
		name: "kanban-selective-build-minify",
		apply: "build",
		configResolved(config) {
			resolvedConfig = config;
		},
		async renderChunk(code, chunk, outputOptions) {
			if (!resolvedConfig || !chunk.fileName.endsWith(".js")) {
				return null;
			}
			if (Object.keys(chunk.modules).some((id) => isXtermModule(id))) {
				return null;
			}
			const minified = await transformWithEsbuild(
				code,
				chunk.fileName,
				{
					format: outputOptions.format === "cjs" ? "cjs" : "esm",
					minify: true,
					sourcemap: Boolean(resolvedConfig.build.sourcemap),
					treeShaking: true,
				},
				undefined,
				resolvedConfig,
			);
			return {
				code: minified.code,
				map: minified.map ?? null,
			};
		},
	};
}

export default defineConfig({
	// OpenCode broke in production because esbuild minification corrupted xterm's
	// requestMode handling. We isolate all @xterm code into its own chunk and leave
	// that chunk unminified, while still minifying the rest of the app here.
	// Compared with leaving the entire frontend unminified, this saves about
	// 770 KB raw and 108.5 KB gzipped across emitted frontend assets.
	// Compared with fully minifying everything, this costs about 545 KB raw and
	// 58.5 KB gzipped, which is the current tradeoff for keeping OpenCode stable.
	plugins: [unifiedVcsRoutePlugin(), tailwindcss(), react(), selectiveBuildMinifyPlugin()],
	envPrefix: ["VITE_"],
	define: {
		__APP_VERSION__: JSON.stringify(rootPkg.version),
	},
	build: {
		// esbuild minification corrupts xterm's DECRQM requestMode helper in the
		// production bundle, which breaks full-screen TUIs like OpenCode at runtime.
		// Keep xterm unminified, but selectively minify the rest of the app below.
		minify: false,
		sourcemap: true,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (isXtermModule(id)) {
						return XTERM_CHUNK_NAME;
					}
					if (isNodeModule(id, "react") || isNodeModule(id, "react-dom") || isNodeModule(id, "scheduler")) {
						return "react-vendor";
					}
					if (
						isNodeModule(id, "@radix-ui") ||
						isNodeModule(id, "lucide-react") ||
						isNodeModule(id, "sonner") ||
						isNodeModule(id, "motion")
					) {
						return "ui-vendor";
					}
					if (isNodeModule(id, "@trpc") || isNodeModule(id, "@reduxjs") || isNodeModule(id, "react-redux")) {
						return "runtime-vendor";
					}
					return undefined;
				},
			},
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
			"react-dom": resolve(webNodeModulesDir, "react-dom"),
			"react": resolve(webNodeModulesDir, "react"),
			"@runtime-agent-catalog": resolve(__dirname, "../src/runtime-stack/core/agent-catalog.ts"),
			"@runtime-cline-tool-call-display": resolve(__dirname, "../src/runtime-stack/cline-sdk/cline-tool-call-display.ts"),
			"@runtime-home-agent-session": resolve(__dirname, "../src/runtime-stack/core/home-agent-session.ts"),
			"@runtime-shortcuts": resolve(__dirname, "../src/runtime-stack/config/shortcut-utils.ts"),
			"@runtime-task-id": resolve(__dirname, "../src/runtime-stack/core/task-id.ts"),
			"@runtime-task-title": resolve(__dirname, "../src/runtime-stack/core/task-title.ts"),
			"@runtime-task-worktree-path": resolve(__dirname, "../src/runtime-stack/workspace/task-worktree-path.ts"),
			"@runtime-task-state": resolve(__dirname, "../src/runtime-stack/core/task-board-mutations.ts"),
			"@runtime-contract": resolve(__dirname, "../src/runtime-stack/core/api-contract.ts"),
			"@runtime-trpc": resolve(__dirname, "../src/runtime-stack/trpc/app-router.ts"),
		},
	},
	server: {
		host: "127.0.0.1",
		port: Number(process.env.KANBAN_WEB_UI_PORT || "4173"),
		strictPort: true,
		proxy: {
			"/api": {
				target: `http://127.0.0.1:${process.env.KANBAN_RUNTIME_PORT || "3484"}`,
				changeOrigin: true,
				ws: true,
			},
		},
	},
});
