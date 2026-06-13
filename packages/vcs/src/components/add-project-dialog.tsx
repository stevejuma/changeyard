import { FolderOpen, GitBranch, Search } from "lucide-react";
import {
	type FormEvent,
	type ReactElement,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { showAppToast } from "@/components/app-toaster";
import { DirectoryAutocomplete } from "@/components/directory-autocomplete";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { RuntimeProjectAddRequest } from "@/runtime/types";
import { useAddProjectMutation, useLazyGetProjectDirectoryContentsQuery } from "@/runtime/vcs-api";
import { toServerAbsolute } from "@/utils/server-path";

type AddProjectTab = "path" | "clone";

export interface AddProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onProjectAdded: (projectId: string) => void;
	currentProjectId: string | null;
	initialGitInitPath?: string | null;
}

export function AddProjectDialog({
	open,
	onOpenChange,
	onProjectAdded,
	currentProjectId,
	initialGitInitPath,
}: AddProjectDialogProps): ReactElement {
	const [activeTab, setActiveTab] = useState<AddProjectTab>("path");
	const [pathInput, setPathInput] = useState("");
	const [isAddingByPath, setIsAddingByPath] = useState(false);
	const [pendingGitInitPath, setPendingGitInitPath] = useState<string | null>(null);
	const [isInitializingGit, setIsInitializingGit] = useState(false);
	const [gitUrlInput, setGitUrlInput] = useState("");
	const [cloneDestInput, setCloneDestInput] = useState("");
	const [cloneFolderName, setCloneFolderName] = useState("");
	const [isCloning, setIsCloning] = useState(false);
	const [serverRootPath, setServerRootPath] = useState<string | null>(null);
	const pathInputRef = useRef<HTMLInputElement>(null);
	const gitUrlInputRef = useRef<HTMLInputElement>(null);
	const [getDirectoryContents] = useLazyGetProjectDirectoryContentsQuery();
	const [addProjectMutation] = useAddProjectMutation();

	useEffect(() => {
		if (!open) {
			return;
		}
		setActiveTab("path");
		setPathInput("/");
		setGitUrlInput("");
		setCloneDestInput("/");
		setCloneFolderName("");
		setIsAddingByPath(false);
		setIsCloning(false);
		setPendingGitInitPath(initialGitInitPath ?? null);
		setIsInitializingGit(false);

		const fetchRoot = async () => {
			try {
				const response = await getDirectoryContents({ workspaceId: currentProjectId, input: {} }).unwrap();
				if (response.ok && response.rootPath) {
					setServerRootPath(response.rootPath);
				}
			} catch {
				// Best effort; the autocomplete will surface errors while browsing.
			}
		};
		void fetchRoot();
	}, [currentProjectId, getDirectoryContents, initialGitInitPath, open]);

	useEffect(() => {
		if (!open || activeTab !== "clone") {
			return;
		}
		const timer = window.setTimeout(() => {
			gitUrlInputRef.current?.focus();
		}, 50);
		return () => window.clearTimeout(timer);
	}, [activeTab, open]);

	const resolveToAbsolutePath = useCallback(
		(relativePath: string): string => {
			const cleaned = relativePath.replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
			if (!serverRootPath) {
				return cleaned;
			}
			return toServerAbsolute(serverRootPath, cleaned);
		},
		[serverRootPath],
	);

	const handleAddByPath = useCallback(
		async (path: string, initializeGit = false) => {
			const absolutePath = resolveToAbsolutePath(path);
			if (!absolutePath) {
				return;
			}
			if (initializeGit) {
				setIsInitializingGit(true);
			} else {
				setIsAddingByPath(true);
			}
			try {
				const added = await addProjectMutation({
					workspaceId: currentProjectId,
					input: { path: absolutePath, initializeGit } satisfies RuntimeProjectAddRequest,
				}).unwrap();
				if (!added.ok || !added.project) {
					if (added.requiresGitInitialization) {
						setPendingGitInitPath(absolutePath);
						return;
					}
					throw new Error(added.error ?? "Could not add project.");
				}
				setPendingGitInitPath(null);
				onProjectAdded(added.project.id);
				onOpenChange(false);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				showAppToast({ intent: "danger", icon: "warning-sign", message, timeout: 7000 });
			} finally {
				setIsAddingByPath(false);
				setIsInitializingGit(false);
			}
		},
		[addProjectMutation, currentProjectId, onOpenChange, onProjectAdded, resolveToAbsolutePath],
	);

	const handleInitializeGit = useCallback(
		async (absolutePath: string) => {
			setIsInitializingGit(true);
			try {
				const added = await addProjectMutation({
					workspaceId: currentProjectId,
					input: { path: absolutePath, initializeGit: true } satisfies RuntimeProjectAddRequest,
				}).unwrap();
				if (!added.ok || !added.project) {
					throw new Error(added.error ?? "Could not add project.");
				}
				setPendingGitInitPath(null);
				onProjectAdded(added.project.id);
				onOpenChange(false);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				showAppToast({ intent: "danger", icon: "warning-sign", message, timeout: 7000 });
			} finally {
				setIsInitializingGit(false);
			}
		},
		[addProjectMutation, currentProjectId, onOpenChange, onProjectAdded],
	);

	const handleClone = useCallback(async () => {
		const trimmedUrl = gitUrlInput.trim();
		if (!trimmedUrl) {
			return;
		}
		setIsCloning(true);
		try {
			const mutationInput: RuntimeProjectAddRequest = { gitUrl: trimmedUrl };
			const trimmedDest = cloneDestInput.trim();
			const trimmedFolder = cloneFolderName.trim();
			if (trimmedDest && trimmedDest !== "/") {
				const resolvedDest = resolveToAbsolutePath(trimmedDest);
				mutationInput.path = trimmedFolder ? toServerAbsolute(resolvedDest, trimmedFolder) : resolvedDest;
			} else if (trimmedFolder) {
				mutationInput.path = serverRootPath ? toServerAbsolute(serverRootPath, trimmedFolder) : trimmedFolder;
			}
			const added = await addProjectMutation({ workspaceId: currentProjectId, input: mutationInput }).unwrap();
			if (!added.ok || !added.project) {
				throw new Error(added.error ?? "Clone failed.");
			}
			showAppToast({ intent: "success", message: "Repository cloned and added successfully.", timeout: 4000 });
			onProjectAdded(added.project.id);
			onOpenChange(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			showAppToast({ intent: "danger", icon: "warning-sign", message, timeout: 7000 });
		} finally {
			setIsCloning(false);
		}
	}, [
		cloneDestInput,
		cloneFolderName,
		addProjectMutation,
		currentProjectId,
		gitUrlInput,
		onOpenChange,
		onProjectAdded,
		resolveToAbsolutePath,
		serverRootPath,
	]);

	const handleDialogEscapeKeyDown = useCallback((event: KeyboardEvent) => {
		const active = document.activeElement;
		if (active instanceof HTMLInputElement) {
			event.preventDefault();
			if (active.role !== "combobox") {
				active.blur();
			}
		}
	}, []);

	const isBusy = isAddingByPath || isCloning || isInitializingGit;

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen && isBusy) {
					return;
				}
				onOpenChange(isOpen);
			}}
			contentClassName="max-w-lg"
			contentAriaDescribedBy="add-project-dialog-description"
			onEscapeKeyDown={handleDialogEscapeKeyDown}
		>
			<DialogHeader title="Add Project" icon={<FolderOpen size={16} />} />
			<div className="flex flex-col gap-4 bg-surface-1 p-4">
				<div className="rounded-md bg-surface-2 p-1">
					<div className="grid grid-cols-2 gap-1">
						<button
							type="button"
							onClick={() => {
								setActiveTab("path");
								setPendingGitInitPath(null);
							}}
							disabled={isBusy}
							className={cn(
								"inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium",
								activeTab === "path"
									? "bg-surface-4 text-text-primary"
									: "text-text-secondary hover:text-text-primary",
								isBusy && "cursor-not-allowed opacity-50",
							)}
						>
							<Search size={12} />
							Server Path
						</button>
						<button
							type="button"
							onClick={() => {
								setActiveTab("clone");
								setPendingGitInitPath(null);
							}}
							disabled={isBusy}
							className={cn(
								"inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium",
								activeTab === "clone"
									? "bg-surface-4 text-text-primary"
									: "text-text-secondary hover:text-text-primary",
								isBusy && "cursor-not-allowed opacity-50",
							)}
						>
							<GitBranch size={12} />
							Git Clone
						</button>
					</div>
				</div>

				{activeTab === "path" ? (
					<PathTabContent
						pathInput={pathInput}
						setPathInput={(value) => {
							setPathInput(value);
							setPendingGitInitPath(null);
						}}
						pathInputRef={pathInputRef}
						isAddingByPath={isAddingByPath}
						isInitializingGit={isInitializingGit}
						pendingGitInitPath={pendingGitInitPath}
						onSubmitPath={() => void handleAddByPath(pathInput)}
						onSubmitGitInit={() => {
							if (pendingGitInitPath) {
								void handleInitializeGit(pendingGitInitPath);
							}
						}}
						currentProjectId={currentProjectId}
					/>
				) : (
					<CloneTabContent
						gitUrlInput={gitUrlInput}
						setGitUrlInput={setGitUrlInput}
						cloneDestInput={cloneDestInput}
						setCloneDestInput={setCloneDestInput}
						cloneFolderName={cloneFolderName}
						setCloneFolderName={setCloneFolderName}
						gitUrlInputRef={gitUrlInputRef}
						isCloning={isCloning}
						onSubmitClone={() => void handleClone()}
						currentProjectId={currentProjectId}
					/>
				)}
			</div>
			<DialogFooter>
				<Button variant="default" onClick={() => onOpenChange(false)} disabled={isBusy}>
					Cancel
				</Button>
				{activeTab === "path" ? (
					pendingGitInitPath === null ? (
						<Button
							variant="primary"
							onClick={() => void handleAddByPath(pathInput)}
							disabled={pathInput.trim() === "/" || isAddingByPath}
						>
							{isAddingByPath ? (
								<>
									<Spinner size={14} />
									Adding...
								</>
							) : (
								"Add Project"
							)}
						</Button>
					) : (
						<Button
							variant="primary"
							onClick={() => {
								if (pendingGitInitPath) {
									void handleInitializeGit(pendingGitInitPath);
								}
							}}
							disabled={isInitializingGit}
						>
							{isInitializingGit ? (
								<>
									<Spinner size={14} />
									Initializing...
								</>
							) : (
								"Initialize Git Repository"
							)}
						</Button>
					)
				) : (
					<Button variant="primary" onClick={() => void handleClone()} disabled={!gitUrlInput.trim() || isCloning}>
						{isCloning ? (
							<>
								<Spinner size={14} />
								Cloning...
							</>
						) : (
							"Clone & Add"
						)}
					</Button>
				)}
			</DialogFooter>
		</Dialog>
	);
}

function PathTabContent({
	pathInput,
	setPathInput,
	pathInputRef,
	isAddingByPath,
	isInitializingGit,
	pendingGitInitPath,
	onSubmitPath,
	onSubmitGitInit,
	currentProjectId,
}: {
	pathInput: string;
	setPathInput: (value: string) => void;
	pathInputRef: RefObject<HTMLInputElement>;
	isAddingByPath: boolean;
	isInitializingGit: boolean;
	pendingGitInitPath: string | null;
	onSubmitPath: () => void;
	onSubmitGitInit: () => void;
	currentProjectId: string | null;
}): ReactElement {
	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		if (pendingGitInitPath) {
			onSubmitGitInit();
		} else {
			onSubmitPath();
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<div>
				<span className="mb-1.5 block text-[12px] text-text-secondary">Directory path</span>
				<DirectoryAutocomplete
					inputRef={pathInputRef}
					value={pathInput}
					onChange={setPathInput}
					placeholder="Search directories..."
					disabled={isAddingByPath || isInitializingGit}
					id="add-project-path-input"
					ariaLabel="Server path input"
					workspaceId={currentProjectId}
				/>
			</div>
			{pendingGitInitPath !== null ? (
				<div className="flex flex-col gap-2 rounded-md border border-status-orange/30 bg-status-orange/5 px-3 py-2.5">
					<p className="text-[13px] text-text-primary">
						This directory is not a git repository. ChangeYard requires git to manage project workspaces.
					</p>
					<p className="break-all font-mono text-[11px] text-text-secondary">{pendingGitInitPath}</p>
					<Button variant="primary" size="sm" type="submit" disabled={isInitializingGit} className="self-start">
						{isInitializingGit ? (
							<>
								<Spinner size={14} />
								Initializing...
							</>
						) : (
							"Initialize Git Repository"
						)}
					</Button>
				</div>
			) : null}
			<p id="add-project-dialog-description" className="sr-only">
				Add a project by entering a server path, browsing the remote filesystem, or cloning a git repository.
			</p>
		</form>
	);
}

function deriveRepoNameFromUrl(gitUrl: string): string {
	const trimmed = gitUrl.trim().replace(/\/+$/, "");
	if (!trimmed) {
		return "";
	}
	const sshMatch = trimmed.match(/^[^@]+@[^:]+:(.+)$/);
	const pathPart = sshMatch?.[1] ?? trimmed;
	const lastSegment = pathPart.split("/").pop() ?? "";
	return lastSegment.endsWith(".git") ? lastSegment.slice(0, -4) : lastSegment;
}

function CloneTabContent({
	gitUrlInput,
	setGitUrlInput,
	cloneDestInput,
	setCloneDestInput,
	cloneFolderName,
	setCloneFolderName,
	gitUrlInputRef,
	isCloning,
	onSubmitClone,
	currentProjectId,
}: {
	gitUrlInput: string;
	setGitUrlInput: (value: string) => void;
	cloneDestInput: string;
	setCloneDestInput: (value: string) => void;
	cloneFolderName: string;
	setCloneFolderName: (value: string) => void;
	gitUrlInputRef: RefObject<HTMLInputElement>;
	isCloning: boolean;
	onSubmitClone: () => void;
	currentProjectId: string | null;
}): ReactElement {
	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		onSubmitClone();
	};
	const derivedName = deriveRepoNameFromUrl(gitUrlInput);

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-3">
			<div>
				<label htmlFor="add-project-git-url-input" className="mb-1.5 block text-[12px] text-text-secondary">
					Git repository URL
				</label>
				<input
					ref={gitUrlInputRef}
					type="text"
					id="add-project-git-url-input"
					value={gitUrlInput}
					onChange={(event) => setGitUrlInput(event.target.value)}
					placeholder="e.g. https://github.com/user/repo.git"
					className="h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
					disabled={isCloning}
					aria-label="Git URL input"
				/>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div>
					<span className="mb-1.5 block text-[12px] text-text-secondary">Clone into</span>
					<DirectoryAutocomplete
						value={cloneDestInput}
						onChange={setCloneDestInput}
						placeholder="Search directories..."
						disabled={isCloning}
						id="add-project-clone-dest-input"
						ariaLabel="Clone destination path"
						workspaceId={currentProjectId}
					/>
				</div>
				<div>
					<label htmlFor="add-project-folder-name-input" className="mb-1.5 block text-[12px] text-text-secondary">
						Folder name
					</label>
					<input
						type="text"
						id="add-project-folder-name-input"
						value={cloneFolderName}
						onChange={(event) => setCloneFolderName(event.target.value.replace(/[\\/]/g, ""))}
						placeholder={derivedName || "repo-name"}
						className="h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
						disabled={isCloning}
						aria-label="Clone folder name"
					/>
				</div>
			</div>
			{isCloning ? (
				<div className="flex items-center gap-2 text-[13px] text-text-secondary">
					<Spinner size={14} />
					Cloning repository... This may take a moment.
				</div>
			) : null}
		</form>
	);
}
