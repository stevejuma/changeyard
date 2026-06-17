import { loadConfig } from "../../config/loadConfig.js";
import type { ChangeProvider, RemotePullRequest, RemotePullRequestComment } from "../../providers/ChangeProvider.js";
import { createProvider } from "../../providers/index.js";
import { storageRoot } from "../../paths.js";
import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import {
	cachedPullRequestToRemotePullRequest,
	findCachedPullRequest,
	providerRepositoryIdentity,
	readVcsPullRequestCache,
	remotePullRequestToCacheEntry,
	upsertVcsPullRequestCacheEntry,
} from "../pr-cache.js";
import type {
	VcsDiagnostic,
	VcsJjBookmark,
	VcsJjStateResult,
	VcsPreviewCommand,
	VcsSubmitStackItem,
	VcsSubmitStackPreviewInput,
	VcsSubmitStackPreviewResult,
	VcsSubmitStackPullRequestSummary,
	VcsSubmitStackResult,
	VcsSubmitStackResultItem,
} from "../types.js";
import { loadJjState } from "./state.js";

const SAFE_REMOTE_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]+$/;
const STACK_COMMENT_DATA_PREFIX = "<!--- CHANGEYARD_VCS_STACK: ";
const STACK_COMMENT_DATA_POSTFIX = " --->";
const STACK_COMMENT_FOOTER = "*Created with Changeyard VCS*";
const STACK_COMMENT_CURRENT_TEXT = "← this PR";

interface StackCommentData {
	version: number;
	stack: Array<{
		bookmarkName: string;
		prUrl: string;
		prNumber: number;
	}>;
}

type StackPullRequestProvider = ChangeProvider & {
	findOpenPullRequestByHead: NonNullable<ChangeProvider["findOpenPullRequestByHead"]>;
	createBranchPullRequest: NonNullable<ChangeProvider["createBranchPullRequest"]>;
	updatePullRequestBase: NonNullable<ChangeProvider["updatePullRequestBase"]>;
	upsertPullRequestComment: NonNullable<ChangeProvider["upsertPullRequestComment"]>;
};

interface ProviderContext {
	provider: StackPullRequestProvider;
	storageRoot: string;
	repository: string;
	repoOwner: string | null;
	repoName: string | null;
}

interface SubmitContext extends ProviderContext {
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

function asStackPullRequestProvider(provider: ChangeProvider): StackPullRequestProvider | null {
	const capabilities = provider.capabilities();
	if (
		!capabilities.pullRequests ||
		!capabilities.comments ||
		typeof provider.findOpenPullRequestByHead !== "function" ||
		typeof provider.createBranchPullRequest !== "function" ||
		typeof provider.updatePullRequestBase !== "function" ||
		typeof provider.upsertPullRequestComment !== "function"
	) {
		return null;
	}
	return provider as StackPullRequestProvider;
}

function resolveProviderContext(repoRoot: string, diagnostics: VcsDiagnostic[]): ProviderContext | VcsSubmitStackPreviewResult {
	const config = loadConfig(repoRoot);
	let provider: ChangeProvider;
	try {
		provider = createProvider(config.provider.type, config);
	} catch (error) {
		const message = error instanceof Error ? error.message : `Unsupported provider: ${config.provider.type}`;
		return createUnavailableResult(message, [
			...diagnostics,
			createDiagnostic("warning", "submit_provider_unsupported", message),
		]);
	}

	const stackProvider = asStackPullRequestProvider(provider);
	if (!stackProvider) {
		return createUnavailableResult(
			`Changeyard provider ${provider.name} does not support stacked pull request operations.`,
			[
				...diagnostics,
				createDiagnostic(
					"warning",
					"submit_provider_missing_pr_methods",
					`Changeyard provider ${provider.name} does not support stacked pull request operations.`,
				),
			],
		);
	}

	const root = storageRoot(repoRoot, config);
	return {
		provider: stackProvider,
		storageRoot: root,
		repository: providerRepositoryIdentity(config, repoRoot),
		repoOwner: config.provider.owner ?? null,
		repoName: config.provider.repo ?? null,
	};
}

function remotePullRequestToSubmitSummary(
	pullRequest: RemotePullRequest | null,
	fallbackBase: string,
): VcsSubmitStackPullRequestSummary | null {
	if (typeof pullRequest?.pullRequestNumber !== "number") {
		return null;
	}
	return {
		number: pullRequest.pullRequestNumber,
		url: pullRequest.pullRequestUrl,
		baseBranch: pullRequest.baseBranch ?? fallbackBase,
	};
}

function persistRemotePullRequest(
	context: ProviderContext,
	head: string,
	fallbackBase: string,
	pullRequest: RemotePullRequest | null,
): void {
	if (!pullRequest) {
		return;
	}
	const entry = remotePullRequestToCacheEntry({
		provider: context.provider.name,
		repository: context.repository,
		head,
		fallbackBase,
		pullRequest,
	});
	if (entry) {
		upsertVcsPullRequestCacheEntry(context.storageRoot, entry);
	}
}

function persistSubmitPullRequest(
	context: ProviderContext,
	head: string,
	pullRequest: VcsSubmitStackPullRequestSummary | null,
): void {
	if (!pullRequest) {
		return;
	}
	upsertVcsPullRequestCacheEntry(context.storageRoot, {
		provider: context.provider.name,
		repository: context.repository,
		head,
		base: pullRequest.baseBranch,
		number: pullRequest.number,
		url: pullRequest.url,
		state: "open",
	});
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

function findStackBookmarks(state: VcsJjStateResult, targetBookmark: string, defaultBranchName: string | null): {
	items: Array<{ bookmark: VcsJjBookmark; changeId: string; title: string; baseBranch: string }>;
	diagnostics: VcsDiagnostic[];
} | null {
	const stack = state.stacks.find((candidate) =>
		candidate.heads.some((head) => head.bookmarkName === targetBookmark),
	);
	if (!stack) {
		return null;
	}

	const diagnostics: VcsDiagnostic[] = [];
	const items: Array<{ bookmark: VcsJjBookmark; changeId: string; title: string; baseBranch: string }> = [];
	let previousBookmarkName: string | null = null;

	for (const head of [...stack.heads].reverse()) {
		if (defaultBranchName !== null && head.bookmarkName === defaultBranchName) {
			continue;
		}
		const bookmark = state.bookmarks.find((candidate) => candidate.name === head.bookmarkName) ?? null;
		if (!bookmark) {
			diagnostics.push(
				createDiagnostic(
					"warning",
					"submit_head_missing",
					`Stack head ${head.bookmarkName} is missing from local JJ bookmarks.`,
				),
			);
			return { items: [], diagnostics };
		}
		items.push({
			bookmark,
			changeId: head.changeId,
			title: head.title,
			baseBranch: previousBookmarkName ?? state.git.defaultBranch ?? state.jj.defaultBase ?? "main",
		});
		previousBookmarkName = bookmark.name;
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

function findCachedPullRequestSummary(
	context: ProviderContext,
	head: string,
	fallbackBase: string,
): VcsSubmitStackPullRequestSummary | null {
	const cached = findCachedPullRequest(readVcsPullRequestCache(context.storageRoot), {
		provider: context.provider.name,
		repository: context.repository,
		head,
	});
	return remotePullRequestToSubmitSummary(cachedPullRequestToRemotePullRequest(cached), fallbackBase);
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

async function resolveSubmitContext(
	repoRoot: string,
	input: VcsSubmitStackPreviewInput,
	runner: VcsCommandRunner,
): Promise<SubmitContext | VcsSubmitStackPreviewResult> {
	const preview = await previewJjStackSubmit(repoRoot, input, runner);
	if (!preview.available || !preview.remoteName) {
		return preview;
	}
	const context = resolveProviderContext(repoRoot, preview.diagnostics);
	if ("available" in context) {
		return context;
	}
	return { ...context, preview };
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

	const remoteName = input.remoteName ?? detect.git.remoteName;
	if (!remoteName) {
		return createUnavailableResult(
			"No Git remote is configured for stacked PR preview.",
			[...detect.diagnostics, createDiagnostic("warning", "submit_remote_missing", "No Git remote is configured for stacked PR preview.")],
		);
	}
	assertSafeRemoteName(remoteName);

	const config = loadConfig(repoRoot);
	const providerContext = resolveProviderContext(repoRoot, detect.diagnostics);
	if ("available" in providerContext) {
		return providerContext;
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
	const stackInfo = findStackBookmarks(state, targetBookmark, defaultBranchName);
	if (!stackInfo) {
		return createUnavailableResult(
			`Bookmark ${targetBookmark} is not part of a detected JJ stack.`,
			[
				...state.diagnostics,
				createDiagnostic("warning", "submit_bookmark_unknown", `Bookmark ${targetBookmark} is not part of a detected JJ stack.`),
			],
		);
	}
	if (stackInfo.diagnostics.length > 0) {
		return createUnavailableResult("Stacked PR preview requires complete stack bookmark heads.", [
			...state.diagnostics,
			...stackInfo.diagnostics,
		]);
	}

	const commands: VcsPreviewCommand[] = [];
	const items: VcsSubmitStackItem[] = [];
	for (const item of stackInfo.items) {
		let existingPr = findCachedPullRequestSummary(providerContext, item.bookmark.name, item.baseBranch);
		if (!existingPr) {
			let remotePullRequest: RemotePullRequest | null = null;
			try {
				remotePullRequest = providerContext.provider.findOpenPullRequestByHead({
					repoRoot,
					storageRoot: providerContext.storageRoot,
					head: item.bookmark.name,
				});
			} catch (error) {
				const message = error instanceof Error
					? `Failed to look up existing PR for ${item.bookmark.name}: ${error.message}`
					: `Failed to look up existing PR for ${item.bookmark.name}.`;
				return createUnavailableResult(message, [
					...state.diagnostics,
					createDiagnostic("warning", "submit_pr_lookup_failed", message),
				]);
			}
			persistRemotePullRequest(providerContext, item.bookmark.name, item.baseBranch, remotePullRequest);
			existingPr = remotePullRequestToSubmitSummary(remotePullRequest, item.baseBranch);
		}
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
		repoOwner: providerContext.repoOwner,
		repoName: providerContext.repoName,
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

	const { preview } = context;
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
				const remotePullRequest = context.provider.createBranchPullRequest({
					repoRoot,
					storageRoot: context.storageRoot,
					title: createPrTitle(item.title, item.bookmarkName),
					body: createPrBody(preview.items, index),
					head: item.bookmarkName,
					base: item.baseBranch,
					draft: false,
				});
				persistRemotePullRequest(context, item.bookmarkName, item.baseBranch, remotePullRequest);
				resultPr = remotePullRequestToSubmitSummary(remotePullRequest, item.baseBranch);
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
					const remotePullRequest = context.provider.updatePullRequestBase({
						repoRoot,
						storageRoot: context.storageRoot,
						pullRequestNumber: item.existingPr.number,
						base: item.baseBranch,
					});
					persistRemotePullRequest(context, item.bookmarkName, item.baseBranch, remotePullRequest);
					resultPr = remotePullRequestToSubmitSummary(remotePullRequest, item.baseBranch);
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

		if (completed) {
			persistSubmitPullRequest(context, item.bookmarkName, resultPr);
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
				const comment: RemotePullRequestComment = context.provider.upsertPullRequestComment({
					repoRoot,
					storageRoot: context.storageRoot,
					pullRequestNumber: stackItem.prNumber,
					marker: STACK_COMMENT_DATA_PREFIX,
					body: buildStackCommentBody(commentData, index),
				});
				diagnostics.push(
					createDiagnostic(
						"info",
						comment.action === "created" ? "submit_stack_comment_created" : "submit_stack_comment_updated",
						`${comment.action === "created" ? "Created" : "Updated"} stack comment for ${stackItem.bookmarkName} (PR #${stackItem.prNumber}).`,
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
