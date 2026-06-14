import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".ico": "image/x-icon",
	".map": "application/json; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
};

export interface RuntimeAsset {
	content: Buffer;
	contentType: string;
	cacheControl: string;
	etag: string;
}

export function getWebUiDir(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	// Bundled output (dist/cli.js): web-ui is at dist/web-ui
	const bundledPath = resolve(here, "web-ui");
	// tsc output (dist/server/assets.js): web-ui is at dist/../web-ui → dist/web-ui
	const packagedBuildPath = resolve(here, "../web-ui");
	const repoBuildPath = resolve(here, "../../web-ui/dist");
	const repoSourcePath = resolve(here, "../../web-ui");
	const hasAssets = (dir: string) => existsSync(join(dir, "index.html")) && existsSync(join(dir, "assets"));
	if (hasAssets(bundledPath)) {
		return bundledPath;
	}
	if (hasAssets(packagedBuildPath)) {
		return packagedBuildPath;
	}
	if (hasAssets(repoBuildPath)) {
		return repoBuildPath;
	}
	return repoSourcePath;
}

export function getVcsUiDir(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const bundledPath = resolve(here, "vcs-ui");
	const packagedBuildPath = resolve(here, "../vcs-ui");
	const repoBuildPath = resolve(here, "../../../../vcs/dist");
	const repoSourcePath = resolve(here, "../../../../vcs");
	const hasAssets = (dir: string) => existsSync(join(dir, "index.html")) && existsSync(join(dir, "assets"));
	if (hasAssets(bundledPath)) {
		return bundledPath;
	}
	if (hasAssets(packagedBuildPath)) {
		return packagedBuildPath;
	}
	if (hasAssets(repoBuildPath)) {
		return repoBuildPath;
	}
	return repoSourcePath;
}

function shouldFallbackToIndexHtml(pathname: string): boolean {
	return !extname(pathname);
}

export function normalizeRequestPath(urlPathname: string): string {
	const trimmed = urlPathname === "/" ? "/index.html" : urlPathname;
	return decodeURIComponent(trimmed.split("?")[0] ?? trimmed);
}

function resolveAssetPath(rootDir: string, urlPathname: string): string {
	const normalizedRequest = normalize(urlPathname).replace(/^(\.\.(\/|\\|$))+/, "");
	const absolutePath = resolve(rootDir, `.${normalizedRequest}`);
	const normalizedRoot = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
	if (!absolutePath.startsWith(normalizedRoot)) {
		return resolve(rootDir, "index.html");
	}
	return absolutePath;
}

export async function readAsset(rootDir: string, requestPathname: string): Promise<RuntimeAsset> {
	let resolvedPath = resolveAssetPath(rootDir, requestPathname);

	try {
		const rawContent = await readFile(resolvedPath);
		const extension = extname(resolvedPath).toLowerCase();
		const content = extension === ".html" ? await addAssetCacheBusters(rootDir, rawContent) : rawContent;
		return {
			content,
			contentType: MIME_TYPES[extension] ?? "application/octet-stream",
			cacheControl: cacheControlForAsset(rootDir, resolvedPath),
			etag: etagForContent(content),
		};
	} catch (error) {
		if (!shouldFallbackToIndexHtml(requestPathname)) {
			throw error;
		}
		resolvedPath = resolve(rootDir, "index.html");
		const rawContent = await readFile(resolvedPath);
		const content = await addAssetCacheBusters(rootDir, rawContent);
		return {
			content,
			contentType: MIME_TYPES[".html"],
			cacheControl: "no-store",
			etag: etagForContent(content),
		};
	}
}

function cacheControlForAsset(rootDir: string, resolvedPath: string): string {
	const relativePath = relative(rootDir, resolvedPath).replaceAll("\\", "/");
	if (relativePath.startsWith("assets/") && extname(resolvedPath)) {
		return "public, max-age=31536000, immutable";
	}
	return "no-store";
}

function etagForContent(content: Buffer): string {
	return `"${createHash("sha256").update(content).digest("base64url")}"`;
}

async function addAssetCacheBusters(rootDir: string, content: Buffer): Promise<Buffer> {
	const html = content.toString("utf8");
	const matches = Array.from(html.matchAll(/\b(?:src|href)="(\/assets\/[^"?]+)"/g));
	if (matches.length === 0) {
		return content;
	}
	const cacheBusterByPath = new Map<string, string>();
	for (const match of matches) {
		const assetPath = match[1];
		if (!assetPath || cacheBusterByPath.has(assetPath)) {
			continue;
		}
		try {
			const assetContent = await readFile(resolveAssetPath(rootDir, assetPath));
			cacheBusterByPath.set(assetPath, createHash("sha256").update(assetContent).digest("base64url").slice(0, 16));
		} catch {
			continue;
		}
	}
	if (cacheBusterByPath.size === 0) {
		return content;
	}
	let nextHtml = html;
	for (const [assetPath, cacheBuster] of cacheBusterByPath) {
		nextHtml = nextHtml.replaceAll(`"${assetPath}"`, `"${assetPath}?v=${cacheBuster}"`);
	}
	return Buffer.from(nextHtml, "utf8");
}

export async function readMountedAsset(
	rootDir: string,
	requestPathname: string,
	mountPath: string,
): Promise<RuntimeAsset> {
	const mountedPath = requestPathname === mountPath
		? "/"
		: requestPathname.startsWith(`${mountPath}/`)
			? requestPathname.slice(mountPath.length)
			: requestPathname;
	return await readAsset(rootDir, mountedPath);
}
