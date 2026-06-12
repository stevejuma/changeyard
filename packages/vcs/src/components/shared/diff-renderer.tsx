import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-c";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-css";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-yaml";
import { useMemo } from "react";

export type UnifiedDiffRow = {
	key: string;
	lineNumber: number | null;
	variant: "context" | "added" | "removed";
	text: string;
};

const PRISM_LANGUAGE_BY_EXTENSION: Record<string, string> = {
	bash: "bash",
	c: "c",
	cc: "cpp",
	cjs: "javascript",
	cpp: "cpp",
	cs: "csharp",
	css: "css",
	cxx: "cpp",
	go: "go",
	h: "c",
	hh: "cpp",
	hpp: "cpp",
	htm: "markup",
	html: "markup",
	java: "java",
	js: "javascript",
	json: "json",
	jsx: "jsx",
	md: "markdown",
	mdx: "markdown",
	mjs: "javascript",
	php: "php",
	py: "python",
	rb: "ruby",
	rs: "rust",
	scss: "css",
	sh: "bash",
	sql: "sql",
	svg: "markup",
	swift: "swift",
	ts: "typescript",
	tsx: "tsx",
	xml: "markup",
	yaml: "yaml",
	yml: "yaml",
	zsh: "bash",
};

function getPathBasename(path: string): string {
	const separatorIndex = path.lastIndexOf("/");
	return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

function resolvePrismLanguage(path: string): string | null {
	const basename = getPathBasename(path).toLowerCase();
	if (basename === "dockerfile") {
		return "bash";
	}
	const dotIndex = basename.lastIndexOf(".");
	if (dotIndex < 0 || dotIndex === basename.length - 1) {
		return null;
	}
	const extension = basename.slice(dotIndex + 1);
	const language = PRISM_LANGUAGE_BY_EXTENSION[extension];
	if (!language || !Prism.languages[language]) {
		return null;
	}
	return language;
}

function resolvePrismGrammar(language: string | null): Prism.Grammar | null {
	if (!language) {
		return null;
	}
	return Prism.languages[language] ?? null;
}

function getHighlightedLineHtml(
	line: string,
	grammar: Prism.Grammar | null,
	language: string | null,
): string | null {
	if (!grammar || !language) {
		return null;
	}
	return Prism.highlight(line.length > 0 ? line : " ", grammar, language);
}

export function parsePatchToRows(patch: string): UnifiedDiffRow[] {
	if (!patch) {
		return [];
	}
	const rawLines = patch.split("\n");
	if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
		rawLines.pop();
	}
	const rows: UnifiedDiffRow[] = [];
	let oldLine = 0;
	let newLine = 0;
	let inHunk = false;

	for (const raw of rawLines) {
		if (raw.startsWith("@@")) {
			inHunk = true;
			const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
			if (match) {
				oldLine = Number.parseInt(match[1] ?? "0", 10);
				newLine = Number.parseInt(match[2] ?? "0", 10);
			}
			continue;
		}
		if (!inHunk) {
			continue;
		}
		if (raw.startsWith("+")) {
			rows.push({ key: `n-${newLine}-${rows.length}`, lineNumber: newLine, variant: "added", text: raw.slice(1) });
			newLine += 1;
		} else if (raw.startsWith("-")) {
			rows.push({ key: `o-${oldLine}-${rows.length}`, lineNumber: oldLine, variant: "removed", text: raw.slice(1) });
			oldLine += 1;
		} else if (raw.startsWith(" ")) {
			rows.push({
				key: `c-${oldLine}-${newLine}-${rows.length}`,
				lineNumber: newLine,
				variant: "context",
				text: raw.slice(1),
			});
			oldLine += 1;
			newLine += 1;
		}
	}
	return rows;
}

export function ReadOnlyUnifiedDiff({ rows, path }: { rows: UnifiedDiffRow[]; path: string }): React.ReactElement {
	const prismLanguage = useMemo(() => resolvePrismLanguage(path), [path]);
	const prismGrammar = useMemo(() => resolvePrismGrammar(prismLanguage), [prismLanguage]);

	return (
		<div className="kb-diff-readonly">
			{rows.map((row) => {
				const className =
					row.variant === "added"
						? "kb-diff-row kb-diff-row-added"
						: row.variant === "removed"
							? "kb-diff-row kb-diff-row-removed"
							: "kb-diff-row kb-diff-row-context";
				const highlightedLineHtml = getHighlightedLineHtml(row.text, prismGrammar, prismLanguage);
				return (
					<div key={row.key} className={className} style={{ cursor: "default" }}>
						<span className="kb-diff-line-number text-text-tertiary">
							<span className="kb-diff-line-number-text">{row.lineNumber ?? ""}</span>
						</span>
						{highlightedLineHtml ? (
							<span className="font-mono kb-diff-text" dangerouslySetInnerHTML={{ __html: highlightedLineHtml }} />
						) : (
							<span className="font-mono kb-diff-text">{row.text || " "}</span>
						)}
					</div>
				);
			})}
		</div>
	);
}
