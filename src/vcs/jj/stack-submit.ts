import { loadConfig } from "../../config/loadConfig.js";
import { curlJson } from "../../providers/http.js";
import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type {
	VcsDiagnostic,
	VcsJjBookmark,
	VcsJjStateResult,
	VcsPreviewCommand,
	VcsSubmitStackItem,
	VcsSubmitStackPreviewInput,
	VcsSubmitStackPreviewResult,
	VcsSubmitStackResult,
	VcsSubmitStackResultItem,
} from "../types.js";
import { loadJjState } from "./state.js";

const SAFE_REMOTE_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]+$/;
const GITHUB_API_ACCEPT_HEADERS = ["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"];
const STACK_COMMENT_DATA_PREFIX = "<!--- CHANGEYARD_VCS_STACK: ";
const STACK_COMMENT_DATA_POSTFIX = " --->";
const STACK_COMMENT_FOOTER = "*Created with Changeyard VCS*";
const STACK_COMMENT_CURRENT_TEXT = "← this PR";

interface GitHubRepoInfo {
	owner: string;
	repo: string;
}

interface GitHubPullRequestSummary {
	number: number;
	url: string | null;
	baseBranch: string;
}

interface GitHubIssueCommentSummary {
	id: number;
	body: string | null;
}

interface StackCommentData {
	version: number;
	stack: Array<{
		bookmarkName: string;
		prUrl: string;
		prNumber: number;
	}>;
}

interface SubmitContext {
	token: string;
	repoInfo: GitHubRepoInfo;
	preview: VcsSubmitStackPreviewResult;
}

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function assertSafeRemoteName(remoteName: string): void {
	if (!SAFE_REMOTE_PATTERN.test(remoteName)) {
		throw new Error(`Unsupported Git remote name: ${remoteName}`);
	}
}

function assertSafeRefName(value: string, label: string): void {
	if (!SAFE_REF_PATTERN.test(value) || value.startsWith("-") || value.includes("..")) {
		throw new Error(`Unsupported ${label}: ${value}`);
	}
}

function parseGitHubRepoInfo(remoteUrl: string): GitHubRepoInfo | null {
	const match = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i.exec(remoteUrl.trim());
	if (!match?.[1] || !match?.[2]) {
		return null;
	}
	return {
		owner: match[1],
		repo: match[2],
	};
}

function createUnavailableResult(message: string, diagnostics: VcsDiagnostic[] = []): VcsSubmitStackPreviewResult {
	return {
		available: false,
		targetBookmark: null,
		remoteName: null,
		repoOwner: null,
		repoName: null,
		items: [],
		commands: [],
		diagnostics: diagnostics.length > 0 ? diagnostics : [createDiagnostic("warning", "submit_unavailable", message)],
	};
}

function createUnavailableSubmitResult(preview: VcsSubmitStackPreviewResult): VcsSubmitStackResult {
	return {
		ok: false,
		targetBookmark: preview.targetBookmark,
		remoteName: preview.remoteName,
		repoOwner: preview.repoOwner,
		repoName: preview.repoName,
		items: [],
		commands: preview.commands,
		diagnostics: preview.diagnostics,
	};
}

function findLaneBookmarks(state: VcsJjStateResult, targetBookmark: string, defaultBranchName: string | null): {
	items: Array<{ bookmark: VcsJjBookmark; changeId: string; title: string; baseBranch: string }>;
	diagnostics: VcsDiagnostic[];
} | null {
	const lane = state.lanes.find((candidate) =>
		candidate.segments.some((segment) => segment.bookmarks.includes(targetBookmark)),
	);
	if (!lane) {
		return null;
	}

	const diagnostics: VcsDiagnostic[] = [];
	const items: Array<{ bookmark: VcsJjBookmark; changeId: string; title: string; baseBranch: string }> = [];
	let previousBookmarkName: string | null = null;

	for (const segment of lane.segments) {
		const localBookmarks = segment.bookmarks
			.map((bookmarkName) => state.bookmarks.find((bookmark) => bookmark.name === bookmarkName) ?? null)
			.filter((bookmark): bookmark is VcsJjBookmark => Boolean(bookmark));
		const stackBookmarks =
			defaultBranchName === null
				? localBookmarks
				: localBookmarks.filter((bookmark) => bookmark.name !== defaultBranchName);

		if (stackBookmarks.length === 0) {
			continue;
		}

		if (stackBookmarks.length > 1) {
			diagnostics.push(
				createDiagnostic(
					"warning",
					"submit_segment_ambiguous",
					`Segment ${segment.changeId} has multiple local bookmarks (${stackBookmarks.map((bookmark) => bookmark.name).join(", ")}). Submit preview requires a single bookmark per segment.`,
				),
			);
			return { items: [], diagnostics };
		}

		const bookmark = stackBookmarks[0];
		items.push({
			bookmark,
			changeId: segment.changeId,
			title: segment.title,
			baseBranch: previousBookmarkName ?? state.git.defaultBranch ?? state.jj.defaultBase ?? "main",
		});
		previousBookmarkName = bookmark.name;

		if (bookmark.name === targetBookmark) {
			break;
		}
	}

	if (!items.some((item) => item.bookmark.name === targetBookmark)) {
		return null;
	}

	return { items, diagnostics };
}

function pushCommand(remoteName: string, bookmarkName: string): VcsPreviewCommand {
	return {
		command: "jj",
		args: ["git", "push", "--remote", remoteName, "--bookmark", bookmarkName, "--allow-new"],
	};
}

async function findExistingPr(
	repoInfo: GitHubRepoInfo,
	token: string,
	bookmarkName: string,
): Promise<GitHubPullRequestSummary | null> {
	const response = curlJson({
		method: "GET",
		url: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls?head=${encodeURIComponent(`${repoInfo.owner}:${bookmarkName}`)}&state=open&per_page=1`,
		token,
		tokenScheme: "Bearer",
		payload: {},
		extraHeaders: GITHUB_API_ACCEPT_HEADERS,
	});
	if (!Array.isArray(response) || response.length === 0) {
		return null;
	}
	const pr = response[0] as {
		number?: unknown;
		html_url?: unknown;
		base?: { ref?: unknown };
	};
	if (typeof pr.number !== "number" || typeof pr.base?.ref !== "string") {
		return null;
	}
	return {
		number: pr.number,
		url: typeof pr.html_url === "string" ? pr.html_url : null,
		baseBranch: pr.base.ref,
	};
}

function createPrTitle(title: string, bookmarkName: string): string {
	const normalized = title.trim();
	return normalized.length > 0 ? normalized : bookmarkName;
}

function createPrBody(items: VcsSubmitStackItem[], currentIndex: number): string {
	const previous = currentIndex > 0 ? items[currentIndex - 1]?.bookmarkName ?? null : null;
	const next = currentIndex < items.length - 1 ? items[currentIndex + 1]?.bookmarkName ?? null : null;
	const lines = ["Stacked PR published by Changeyard."];
	if (previous) {
		lines.push(``);
		lines.push(`Depends on: ${previous}`);
	}
	if (next) {
		lines.push(``);
		lines.push(`Followed by: ${next}`);
	}
	return lines.join("\n");
}

function buildStackCommentBody(data: StackCommentData, currentIndex: number): string {
	const encoded = Buffer.from(JSON.stringify(data), "utf8").toString("base64");
	const lines = [
		`${STACK_COMMENT_DATA_PREFIX}${encoded}${STACK_COMMENT_DATA_POSTFIX}`,
		`This PR is part of a stack of ${data.stack.length} bookmark${data.stack.length === 1 ? "" : "s"}:`,
		"",
		"1. `trunk()`",
	];
	for (const [index, item] of data.stack.entries()) {
		if (index === currentIndex) {
			lines.push(`1. **${item.bookmarkName} ${STACK_COMMENT_CURRENT_TEXT}**`);
			continue;
		}
		lines.push(`1. [${item.bookmarkName}](${item.prUrl})`);
	}
	lines.push("", "---", STACK_COMMENT_FOOTER);
	return lines.join("\n");
}

function parseStackCommentData(body: string): StackCommentData | null {
	const [firstLine] = body.trim().split("\n");
	if (!firstLine.startsWith(STACK_COMMENT_DATA_PREFIX) || !firstLine.endsWith(STACK_COMMENT_DATA_POSTFIX)) {
		return null;
	}
	const encoded = firstLine.slice(STACK_COMMENT_DATA_PREFIX.length, -STACK_COMMENT_DATA_POSTFIX.length);
	try {
		const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Partial<StackCommentData>;
		if (parsed.version !== 0 || !Array.isArray(parsed.stack)) {
			return null;
		}
		const stack = parsed.stack.filter(
			(item): item is StackCommentData["stack"][number] =>
				typeof item?.bookmarkName === "string" &&
				typeof item?.prUrl === "string" &&
				typeof item?.prNumber === "number",
		);
		if (stack.length !== parsed.stack.length) {
			return null;
		}
		return { version: 0, stack };
	} catch {
		return null;
	}
}

async function listIssueComments(
	repoInfo: GitHubRepoInfo,
	token: string,
	prNumber: number,
): Promise<GitHubIssueCommentSummary[]> {
	const response = curlJson({
		method: "GET",
		url: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${prNumber}/comments?per_page=100`,
		token,
		tokenScheme: "Bearer",
		payload: {},
		extraHeaders: GITHUB_API_ACCEPT_HEADERS,
	});
	if (!Array.isArray(response)) {
		return [];
	}
	return response
		.map((comment) => {
			const candidate = comment as { id?: unknown; body?: unknown };
			if (typeof candidate.id !== "number") {
				return null;
			}
			return {
				id: candidate.id,
				body: typeof candidate.body === "string" ? candidate.body : null,
			};
		})
		.filter((comment): comment is GitHubIssueCommentSummary => Boolean(comment));
}

async function createOrUpdateStackComment(
	repoInfo: GitHubRepoInfo,
	token: string,
	data: StackCommentData,
	currentIndex: number,
): Promise<"created" | "updated"> {
	const current = data.stack[currentIndex];
	if (!current) {
		throw new Error(`No PR stack item found at index ${currentIndex}.`);
	}
	const body = buildStackCommentBody(data, currentIndex);
	const comments = await listIssueComments(repoInfo, token, current.prNumber);
	const existingComment = comments.find((comment) => {
		if (!comment.body?.includes(STACK_COMMENT_FOOTER)) {
			return false;
		}
		return parseStackCommentData(comment.body) !== null;
	});
	if (existingComment) {
		curlJson({
			method: "PATCH",
			url: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues/comments/${existingComment.id}`,
			token,
			tokenScheme: "Bearer",
			payload: {
				body,
			},
			extraHeaders: GITHUB_API_ACCEPT_HEADERS,
		});
		return "updated";
	}
	curlJson({
		method: "POST",
		url: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${current.prNumber}/comments`,
		token,
		tokenScheme: "Bearer",
		payload: {
			body,
		},
		extraHeaders: GITHUB_API_ACCEPT_HEADERS,
	});
	return "created";
}

async function createPullRequest(
	repoInfo: GitHubRepoInfo,
	token: string,
	item: VcsSubmitStackItem,
	items: VcsSubmitStackItem[],
	currentIndex: number,
): Promise<GitHubPullRequestSummary | null> {
	assertSafeRefName(item.bookmarkName, "bookmark name");
	assertSafeRefName(item.baseBranch, "base branch");
	const response = curlJson({
		method: "POST",
		url: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`,
		token,
		tokenScheme: "Bearer",
		payload: {
			title: createPrTitle(item.title, item.bookmarkName),
			body: createPrBody(items, currentIndex),
			head: item.bookmarkName,
			base: item.baseBranch,
			draft: false,
		},
		extraHeaders: GITHUB_API_ACCEPT_HEADERS,
	}) as {
		number?: unknown;
		html_url?: unknown;
		base?: { ref?: unknown };
	};
	if (typeof response.number !== "number") {
		return null;
	}
	return {
		number: response.number,
		url: typeof response.html_url === "string" ? response.html_url : null,
		baseBranch: typeof response.base?.ref === "string" ? response.base.ref : item.baseBranch,
	};
}

async function updatePullRequestBase(
	repoInfo: GitHubRepoInfo,
	token: string,
	existingPr: GitHubPullRequestSummary,
	baseBranch: string,
): Promise<GitHubPullRequestSummary | null> {
	assertSafeRefName(baseBranch, "base branch");
	const response = curlJson({
		method: "PATCH",
		url: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${existingPr.number}`,
		token,
		tokenScheme: "Bearer",
		payload: {
			base: baseBranch,
		},
		extraHeaders: GITHUB_API_ACCEPT_HEADERS,
	}) as {
		number?: unknown;
		html_url?: unknown;
		base?: { ref?: unknown };
	};
	if (typeof response.number !== "number") {
		return null;
	}
	return {
		number: response.number,
		url: typeof response.html_url === "string" ? response.html_url : existingPr.url,
		baseBranch: typeof response.base?.ref === "string" ? response.base.ref : baseBranch,
	};
}

async function resolveSubmitContext(
	repoRoot: string,
	input: VcsSubmitStackPreviewInput,
	runner: VcsCommandRunner,
): Promise<SubmitContext | VcsSubmitStackPreviewResult> {
	const preview = await previewJjStackSubmit(repoRoot, input, runner);
	if (!preview.available || !preview.remoteName || !preview.repoOwner || !preview.repoName) {
		return preview;
	}
	const config = loadConfig(repoRoot);
	const tokenEnv = config.provider.auth?.tokenEnv ?? "GITHUB_TOKEN";
	const token = process.env[tokenEnv];
	if (!token) {
		return createUnavailableResult(
			`GitHub token env ${tokenEnv} is not configured.`,
			[
				...preview.diagnostics,
				createDiagnostic("warning", "submit_auth_missing", `GitHub token env ${tokenEnv} is not configured.`),
			],
		);
	}
	return {
		token,
		repoInfo: {
			owner: preview.repoOwner,
			repo: preview.repoName,
		},
		preview,
	};
}

export async function previewJjStackSubmit(
	repoRoot: string,
	input: VcsSubmitStackPreviewInput,
	runner: VcsCommandRunner,
): Promise<VcsSubmitStackPreviewResult> {
	const detect = await detectVcsState(repoRoot, runner);
	if (detect.repository.kind !== "jj") {
		return createUnavailableResult("JJ stacked PR preview requires a JJ repository.", detect.diagnostics);
	}
	if (detect.git.provider !== "github") {
		return createUnavailableResult("Stacked PR preview is only enabled for GitHub remotes right now.", detect.diagnostics);
	}

	const remoteName = input.remoteName ?? detect.git.remoteName;
	if (!remoteName) {
		return createUnavailableResult(
			"No Git remote is configured for stacked PR preview.",
			[...detect.diagnostics, createDiagnostic("warning", "submit_remote_missing", "No Git remote is configured for stacked PR preview.")],
		);
	}
	assertSafeRemoteName(remoteName);

	const config = loadConfig(repoRoot);
	if (config.provider.type !== "github") {
		return createUnavailableResult(
			"Changeyard provider.type must be github before stacked PR preview is enabled.",
			[
				...detect.diagnostics,
				createDiagnostic("warning", "submit_provider_mismatch", "Changeyard provider.type is not set to github."),
			],
		);
	}

	const tokenEnv = config.provider.auth?.tokenEnv ?? "GITHUB_TOKEN";
	const token = process.env[tokenEnv];
	if (!token) {
		return createUnavailableResult(
			`GitHub token env ${tokenEnv} is not configured.`,
			[
				...detect.diagnostics,
				createDiagnostic("warning", "submit_auth_missing", `GitHub token env ${tokenEnv} is not configured.`),
			],
		);
	}

	const repoInfo =
		config.provider.owner && config.provider.repo
			? { owner: config.provider.owner, repo: config.provider.repo }
			: detect.git.remoteUrl
				? parseGitHubRepoInfo(detect.git.remoteUrl)
				: null;
	if (!repoInfo) {
		return createUnavailableResult(
			"Could not determine the GitHub owner/repo for stacked PR preview.",
			[
				...detect.diagnostics,
				createDiagnostic("warning", "submit_repo_missing", "Could not determine the GitHub owner/repo for stacked PR preview."),
			],
		);
	}

	const state = await loadJjState(repoRoot, runner);
	const targetBookmark = input.targetBookmark ?? state.jj.currentBookmark ?? state.bookmarks[0]?.name ?? null;
	if (!targetBookmark) {
		return createUnavailableResult(
			"No JJ bookmark is available for stacked PR preview.",
			[
				...state.diagnostics,
				createDiagnostic("warning", "submit_bookmark_missing", "No JJ bookmark is available for stacked PR preview."),
			],
		);
	}

	const defaultBranchName = detect.git.defaultBranch ?? detect.jj.defaultBase ?? config.project.defaultBase ?? "main";
	const laneInfo = findLaneBookmarks(state, targetBookmark, defaultBranchName);
	if (!laneInfo) {
		return createUnavailableResult(
			`Bookmark ${targetBookmark} is not part of a detected JJ stack.`,
			[
				...state.diagnostics,
				createDiagnostic("warning", "submit_bookmark_unknown", `Bookmark ${targetBookmark} is not part of a detected JJ stack.`),
			],
		);
	}
	if (laneInfo.diagnostics.length > 0) {
		return createUnavailableResult("Stacked PR preview requires unambiguous bookmark segments.", [
			...state.diagnostics,
			...laneInfo.diagnostics,
		]);
	}

	const commands: VcsPreviewCommand[] = [];
	const items: VcsSubmitStackItem[] = [];
	for (const item of laneInfo.items) {
		const existingPr = await findExistingPr(repoInfo, token, item.bookmark.name);
		const needsPush = !item.bookmark.synced;
		if (needsPush) {
			commands.push(pushCommand(remoteName, item.bookmark.name));
		}

		let action: VcsSubmitStackItem["action"] = "none";
		if (!existingPr) {
			action = needsPush ? "push_and_create_pr" : "create_pr";
		} else if (existingPr.baseBranch !== item.baseBranch) {
			action = "update_pr_base";
		} else if (needsPush) {
			action = "push";
		}

		items.push({
			bookmarkName: item.bookmark.name,
			changeId: item.changeId,
			title: item.title,
			baseBranch: item.baseBranch,
			needsPush,
			action,
			existingPr,
		});
	}

	return {
		available: true,
		targetBookmark,
		remoteName,
		repoOwner: repoInfo.owner,
		repoName: repoInfo.repo,
		items,
		commands,
		diagnostics: state.diagnostics,
	};
}

export async function submitJjStack(
	repoRoot: string,
	input: VcsSubmitStackPreviewInput,
	runner: VcsCommandRunner,
): Promise<VcsSubmitStackResult> {
	const context = await resolveSubmitContext(repoRoot, input, runner);
	if ("available" in context) {
		return createUnavailableSubmitResult(context);
	}

	const { preview, repoInfo, token } = context;
	const diagnostics = [...preview.diagnostics];
	const items: VcsSubmitStackResultItem[] = [];
	const commands: VcsPreviewCommand[] = [];

	for (const [index, item] of preview.items.entries()) {
		let completed = true;
		let resultPr = item.existingPr;

		try {
			assertSafeRefName(item.bookmarkName, "bookmark name");
			assertSafeRefName(item.baseBranch, "base branch");
			if ((item.action === "push" || item.action === "push_and_create_pr") && preview.remoteName) {
				const command = pushCommand(preview.remoteName, item.bookmarkName);
				const result = await runner({
					command: command.command,
					args: command.args,
					cwd: repoRoot,
				});
				commands.push(command);
				if (!result.ok) {
					completed = false;
					diagnostics.push(
						createDiagnostic(
							"error",
							"submit_push_failed",
							result.stderr || `Failed to push bookmark ${item.bookmarkName} to ${preview.remoteName}.`,
						),
					);
				}
			}

			if (completed && (item.action === "create_pr" || item.action === "push_and_create_pr")) {
				resultPr = await createPullRequest(repoInfo, token, item, preview.items, index);
				if (!resultPr) {
					completed = false;
					diagnostics.push(
						createDiagnostic("error", "submit_pr_create_failed", `Failed to create PR for ${item.bookmarkName}.`),
					);
				}
			}

			if (completed && item.action === "update_pr_base") {
				if (!item.existingPr) {
					completed = false;
					diagnostics.push(
						createDiagnostic(
							"error",
							"submit_pr_missing",
							`Cannot update base for ${item.bookmarkName} because no existing PR was found.`,
						),
					);
				} else {
					resultPr = await updatePullRequestBase(repoInfo, token, item.existingPr, item.baseBranch);
					if (!resultPr) {
						completed = false;
						diagnostics.push(
							createDiagnostic(
								"error",
								"submit_pr_update_failed",
								`Failed to update PR #${item.existingPr.number} base to ${item.baseBranch}.`,
							),
						);
					}
				}
			}
		} catch (error) {
			completed = false;
			diagnostics.push(
				createDiagnostic(
					"error",
					"submit_failed",
					error instanceof Error ? error.message : `Failed to submit bookmark ${item.bookmarkName}.`,
				),
			);
		}

		items.push({
			...item,
			completed,
			resultPr,
		});

		if (!completed) {
			return {
				ok: false,
				targetBookmark: preview.targetBookmark,
				remoteName: preview.remoteName,
				repoOwner: preview.repoOwner,
				repoName: preview.repoName,
				items,
				commands,
				diagnostics,
			};
		}
	}

	const commentData: StackCommentData = {
		version: 0,
		stack: items
			.map((item) => {
				if (!item.resultPr?.url) {
					return null;
				}
				return {
					bookmarkName: item.bookmarkName,
					prUrl: item.resultPr.url,
					prNumber: item.resultPr.number,
				};
			})
			.filter((item): item is StackCommentData["stack"][number] => Boolean(item)),
	};
	if (commentData.stack.length > 0) {
		for (const [index, stackItem] of commentData.stack.entries()) {
			try {
				const mode = await createOrUpdateStackComment(repoInfo, token, commentData, index);
				diagnostics.push(
					createDiagnostic(
						"info",
						mode === "created" ? "submit_stack_comment_created" : "submit_stack_comment_updated",
						`${mode === "created" ? "Created" : "Updated"} stack comment for ${stackItem.bookmarkName} (PR #${stackItem.prNumber}).`,
					),
				);
			} catch (error) {
				diagnostics.push(
					createDiagnostic(
						"warning",
						"submit_stack_comment_failed",
						error instanceof Error
							? `Failed to update stack comment for ${stackItem.bookmarkName}: ${error.message}`
							: `Failed to update stack comment for ${stackItem.bookmarkName}.`,
					),
				);
			}
		}
	}

	return {
		ok: true,
		targetBookmark: preview.targetBookmark,
		remoteName: preview.remoteName,
		repoOwner: preview.repoOwner,
		repoName: preview.repoName,
		items,
		commands,
		diagnostics,
	};
}

export { parseGitHubRepoInfo };
