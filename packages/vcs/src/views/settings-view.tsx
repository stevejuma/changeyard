import * as RadixSelect from "@radix-ui/react-select";
import {
	AlertTriangle,
	Bell,
	Check,
	ChevronDown,
	ExternalLink,
	FolderTree,
	GitBranch,
	List,
	Palette,
	RadioTower,
	Settings,
	SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { KeyValue } from "@/components/vcs-panels";
import { SelectProjectButton, type VcsShellProjectState } from "@/components/vcs-shell";
import type {
	QueryState,
	RuntimeProjectConfigResponse,
	RuntimeProjectConfigUpdateRequest,
	VcsDetectResponse,
	VcsJjInventoryResponse,
} from "@/runtime/types";
import {
	toRuntimeQueryState,
	useGetJjInventoryQuery,
	useGetProjectConfigQuery,
	useUpdateProjectConfigMutation,
} from "@/runtime/vcs-api";
import {
	getBrowserNotificationPermission,
	hasPromptedForBrowserNotificationPermission,
	requestBrowserNotificationPermission,
	type BrowserNotificationPermission,
} from "@/utils/notification-permission";
import { previewThemeId, readStoredThemeId, saveThemeId, THEME_GROUPS, THEMES, type ThemeId } from "@/utils/vcs-theme";
import {
	readVcsFileViewMode,
	resetVcsLayoutPreferences,
	writeVcsFileViewMode,
	type VcsFileViewMode,
} from "@/utils/vcs-ui-preferences";

const CHANGEYARD_VCS_DOCS_URL = "https://github.com/stevejuma/changeyard/blob/main/docs/vcs-jj.md";
const VCS_NOTIFICATIONS_ENABLED_KEY = "changeyard.vcs.notifications.enabled";

type SettingsNavId = "general" | "notifications" | "appearance" | "vcs" | "provider" | "diagnostics";

const SETTINGS_NAV_ITEMS: ReadonlyArray<{
	id: SettingsNavId;
	label: string;
	icon: React.ReactNode;
}> = [
	{ id: "general", label: "General", icon: <SlidersHorizontal size={16} /> },
	{ id: "notifications", label: "Notifications", icon: <Bell size={16} /> },
	{ id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
	{ id: "vcs", label: "VCS", icon: <GitBranch size={16} /> },
	{ id: "provider", label: "Provider", icon: <RadioTower size={16} /> },
	{ id: "diagnostics", label: "Diagnostics", icon: <AlertTriangle size={16} /> },
];

function readBooleanStorage(key: string, fallback: boolean): boolean {
	if (typeof window === "undefined") {
		return fallback;
	}
	try {
		const value = window.localStorage.getItem(key);
		if (value === null) {
			return fallback;
		}
		return value === "true";
	} catch {
		return fallback;
	}
}

function writeBooleanStorage(key: string, value: boolean): void {
	try {
		window.localStorage.setItem(key, String(value));
	} catch {
		// Ignore storage write failures.
	}
}

function formatNotificationPermission(permission: BrowserNotificationPermission): string {
	if (permission === "default") {
		return "not requested yet";
	}
	return permission;
}

function SettingsNav({
	items,
	activeId,
	onSelect,
}: {
	items: ReadonlyArray<{ id: SettingsNavId; label: string; icon: React.ReactNode }>;
	activeId: SettingsNavId;
	onSelect: (id: SettingsNavId) => void;
}): React.ReactElement {
	return (
		<nav className="hidden md:flex w-[180px] shrink-0 flex-col gap-0.5 border-r border-border bg-surface-1 p-3 overflow-y-auto">
			{items.map((item) => (
				<button
					key={item.id}
					type="button"
					onClick={() => onSelect(item.id)}
					className={cn(
						"flex items-center gap-2.5 text-left px-3 py-2 rounded-md text-[13px] font-medium cursor-pointer",
						activeId === item.id
							? "bg-surface-3 text-text-primary"
							: "text-text-secondary hover:text-text-primary hover:bg-surface-2",
					)}
				>
					<span className="shrink-0 opacity-80">{item.icon}</span>
					<span>{item.label}</span>
				</button>
			))}
		</nav>
	);
}

function SettingsSection({
	id,
	title,
	icon,
	children,
}: {
	id: SettingsNavId;
	title: string;
	icon: React.ReactNode;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<>
			<div data-settings-section={id} />
			<div className="sticky top-0 -mx-5 px-5 pt-4 pb-2 bg-surface-1 z-10">
				<h2 className="flex items-center gap-2 text-base font-semibold text-text-primary m-0">
					<span className="text-text-secondary">{icon}</span>
					{title}
				</h2>
			</div>
			<div className="rounded-lg border border-border bg-surface-0 px-4 py-3 mb-4">{children}</div>
		</>
	);
}

function SettingsRow({
	label,
	value,
	action,
}: {
	label: string;
	value: React.ReactNode;
	action?: React.ReactNode;
}): React.ReactElement {
	return (
		<div className="flex min-h-9 items-center justify-between gap-3 border-t border-border py-2 first:border-t-0 first:pt-0 last:pb-0">
			<div className="min-w-0">
				<div className="text-[12px] font-medium text-text-secondary">{label}</div>
				<div className="min-w-0 truncate text-[13px] text-text-primary">{value}</div>
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}

function SwitchControl({
	checked,
	disabled,
	onChange,
	label,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
	label: string;
}): React.ReactElement {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative h-5 w-9 rounded-full bg-surface-4 cursor-pointer disabled:opacity-40 disabled:cursor-default",
				checked && "bg-accent",
			)}
		>
			<span
				className={cn(
					"block h-4 w-4 rounded-full bg-white shadow-sm transition-transform translate-x-0.5",
					checked && "translate-x-[18px]",
				)}
			/>
		</button>
	);
}

function FileViewModeControl({
	value,
	onChange,
}: {
	value: VcsFileViewMode;
	onChange: (value: VcsFileViewMode) => void;
}): React.ReactElement {
	return (
		<div className="inline-flex rounded-md border border-divider bg-surface-0 p-0.5">
			<button
				type="button"
				aria-label="Show files as list"
				title="List"
				onClick={() => onChange("list")}
				className={cn(
					"grid h-7 w-7 place-items-center rounded border border-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary",
					value === "list" && "border-accent/30 bg-accent/15 text-accent",
				)}
			>
				<List size={14} />
			</button>
			<button
				type="button"
				aria-label="Show files as folders"
				title="Folder tree"
				onClick={() => onChange("tree")}
				className={cn(
					"grid h-7 w-7 place-items-center rounded border border-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary",
					value === "tree" && "border-accent/30 bg-accent/15 text-accent",
				)}
			>
				<FolderTree size={14} />
			</button>
		</div>
	);
}

function ThemeSelect({
	value,
	onChange,
}: {
	value: ThemeId;
	onChange: (themeId: ThemeId) => void;
}): React.ReactElement {
	const currentThemeDef = THEMES.find((theme) => theme.id === value);

	return (
		<RadixSelect.Root
			value={value}
			onValueChange={(nextValue) => {
				const nextThemeId = nextValue as ThemeId;
				onChange(nextThemeId);
				previewThemeId(nextThemeId);
			}}
			onOpenChange={(selectOpen) => {
				if (!selectOpen) {
					previewThemeId(value);
				}
			}}
		>
			<RadixSelect.Trigger
				className="flex h-9 w-full cursor-pointer items-center justify-between rounded-md border border-border-bright bg-surface-2 px-3 text-[13px] text-text-primary outline-none hover:bg-surface-3 hover:border-border-bright focus:border-border-focus focus:outline-none"
				aria-label="Theme"
			>
				<span className="flex items-center gap-2.5">
					<span className="flex shrink-0 h-5 w-10 rounded overflow-hidden border border-border">
						<span className="flex-1" style={{ background: currentThemeDef?.surface ?? "#1F2428" }} />
						<span className="flex-1" style={{ background: currentThemeDef?.accent ?? "#0084FF" }} />
						<span className="flex-1" style={{ background: currentThemeDef?.accent2 ?? "#7C5CFF" }} />
					</span>
					<RadixSelect.Value />
				</span>
				<RadixSelect.Icon>
					<ChevronDown size={14} className="text-text-tertiary" />
				</RadixSelect.Icon>
			</RadixSelect.Trigger>
			<RadixSelect.Portal>
				<RadixSelect.Content
					className="z-50 max-h-72 w-(--radix-select-trigger-width) overflow-auto rounded-lg border border-border bg-surface-1 p-1 shadow-xl"
					position="popper"
					sideOffset={4}
					align="start"
				>
					<RadixSelect.Viewport>
						{THEME_GROUPS.map((group) => {
							const groupThemes = THEMES.filter((theme) => theme.group === group.key);
							if (groupThemes.length === 0) return null;
							return (
								<RadixSelect.Group key={group.key}>
									<RadixSelect.Label className="px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
										{group.label}
									</RadixSelect.Label>
									{groupThemes.map((theme) => (
										<RadixSelect.Item
											key={theme.id}
											value={theme.id}
											className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-text-secondary outline-none data-highlighted:bg-surface-3 data-highlighted:text-text-primary data-[state=checked]:text-text-primary"
											onMouseEnter={() => previewThemeId(theme.id)}
											onFocus={() => previewThemeId(theme.id)}
										>
											<span className="flex shrink-0 h-5 w-10 rounded overflow-hidden border border-border">
												<span className="flex-1" style={{ background: theme.surface }} />
												<span className="flex-1" style={{ background: theme.accent }} />
												<span className="flex-1" style={{ background: theme.accent2 }} />
											</span>
											<RadixSelect.ItemText>{theme.label}</RadixSelect.ItemText>
											<RadixSelect.ItemIndicator className="ml-auto">
												<Check size={14} className="text-accent-2" />
											</RadixSelect.ItemIndicator>
										</RadixSelect.Item>
									))}
								</RadixSelect.Group>
							);
						})}
					</RadixSelect.Viewport>
				</RadixSelect.Content>
			</RadixSelect.Portal>
		</RadixSelect.Root>
	);
}

type TargetBranchOption = {
	value: string;
	label: string;
};

function addTargetBranchOption(options: Map<string, TargetBranchOption>, value: string | null | undefined): void {
	const trimmed = value?.trim();
	if (!trimmed) {
		return;
	}
	options.set(trimmed, { value: trimmed, label: trimmed });
}

function createTargetBranchOptions({
	detect,
	inventory,
	configuredTarget,
}: {
	detect: VcsDetectResponse | null;
	inventory: VcsJjInventoryResponse | null;
	configuredTarget: string | null;
}): TargetBranchOption[] {
	const options = new Map<string, TargetBranchOption>();
	for (const item of inventory?.items ?? []) {
		for (const remote of item.remotes) {
			addTargetBranchOption(options, `${remote}/${item.name}`);
		}
	}

	const defaultBase = detect?.jj.defaultBase ?? detect?.git.defaultBranch ?? null;
	if (detect?.git.remoteName && defaultBase) {
		addTargetBranchOption(options, `${detect.git.remoteName}/${defaultBase}`);
	}
	addTargetBranchOption(options, configuredTarget);

	return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function getDefaultTargetBranch(detect: VcsDetectResponse | null): string | null {
	const base = detect?.jj.defaultBase ?? detect?.git.defaultBranch ?? null;
	if (!base) {
		return null;
	}
	return detect?.git.remoteName ? `${detect.git.remoteName}/${base}` : base;
}

function TargetBranchSelect({
	value,
	options,
	disabled,
	onChange,
}: {
	value: string;
	options: readonly TargetBranchOption[];
	disabled?: boolean;
	onChange: (value: string) => void;
}): React.ReactElement {
	return (
		<RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled || options.length === 0}>
			<RadixSelect.Trigger
				className="flex h-9 min-w-[220px] cursor-pointer items-center justify-between rounded-md border border-border-bright bg-surface-2 px-3 text-[13px] text-text-primary outline-none hover:bg-surface-3 hover:border-border-bright focus:border-border-focus focus:outline-none disabled:cursor-default disabled:opacity-50"
				aria-label="Workspace target branch"
			>
				<RadixSelect.Value placeholder="No remote branches" />
				<RadixSelect.Icon>
					<ChevronDown size={14} className="text-text-tertiary" />
				</RadixSelect.Icon>
			</RadixSelect.Trigger>
			<RadixSelect.Portal>
				<RadixSelect.Content
					className="z-50 max-h-72 w-(--radix-select-trigger-width) overflow-auto rounded-lg border border-border bg-surface-1 p-1 shadow-xl"
					position="popper"
					sideOffset={4}
					align="start"
				>
					<RadixSelect.Viewport>
						{options.map((option) => (
							<RadixSelect.Item
								key={option.value}
								value={option.value}
								className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-text-secondary outline-none data-highlighted:bg-surface-3 data-highlighted:text-text-primary data-[state=checked]:text-text-primary"
							>
								<RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
								<RadixSelect.ItemIndicator className="ml-auto">
									<Check size={14} className="text-accent-2" />
								</RadixSelect.ItemIndicator>
							</RadixSelect.Item>
						))}
					</RadixSelect.Viewport>
				</RadixSelect.Content>
			</RadixSelect.Portal>
		</RadixSelect.Root>
	);
}

function EmptyProjectSettings({
	children,
	action,
}: {
	children: React.ReactNode;
	action?: React.ReactNode;
}): React.ReactElement {
	return (
		<div className="flex items-center justify-between gap-3 text-[13px] text-text-secondary">
			<div className="min-w-0">{children}</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}

function SettingsDialogContent({
	state,
	projectConfigState,
	inventoryState,
	workspaceId,
	projectState,
	draftFileViewMode,
	themeId,
	draftThemeId,
	draftTargetBranch,
	draftNotificationsEnabled,
	draftFModeEnabled,
	notificationPermission,
	onFileViewModeChange,
	onThemeChange,
	onTargetBranchChange,
	onNotificationsEnabledChange,
	onFModeEnabledChange,
	onRequestNotificationPermission,
	onResetLayout,
}: {
	state: QueryState<VcsDetectResponse>;
	projectConfigState: QueryState<RuntimeProjectConfigResponse>;
	inventoryState: QueryState<VcsJjInventoryResponse>;
	workspaceId: string | null;
	projectState: VcsShellProjectState;
	draftFileViewMode: VcsFileViewMode;
	themeId: ThemeId;
	draftThemeId: ThemeId;
	draftTargetBranch: string | null;
	draftNotificationsEnabled: boolean;
	draftFModeEnabled: boolean;
	notificationPermission: BrowserNotificationPermission;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onThemeChange: (themeId: ThemeId) => void;
	onTargetBranchChange: (targetBranch: string) => void;
	onNotificationsEnabledChange: (enabled: boolean) => void;
	onFModeEnabledChange: (enabled: boolean) => void;
	onRequestNotificationPermission: () => void;
	onResetLayout: () => void;
}): React.ReactElement {
	const bodyRef = useRef<HTMLDivElement>(null);
	const isScrollingProgrammatically = useRef(false);
	const [activeSection, setActiveSection] = useState<SettingsNavId>("general");
	const notificationStatus = formatNotificationPermission(notificationPermission);
	const selectedTheme = THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
	const targetBranchOptions = createTargetBranchOptions({
		detect: state.status === "ready" ? state.data : null,
		inventory: inventoryState.status === "ready" ? inventoryState.data : null,
		configuredTarget: draftTargetBranch,
	});
	const selectedTargetBranch = draftTargetBranch ?? getDefaultTargetBranch(state.status === "ready" ? state.data : null) ?? targetBranchOptions[0]?.value ?? "";

	const handleBodyScroll = useCallback(() => {
		if (isScrollingProgrammatically.current) return;
		const body = bodyRef.current;
		if (!body) return;
		const headings = body.querySelectorAll<HTMLElement>("[data-settings-section]");
		const bodyRect = body.getBoundingClientRect();
		let current: SettingsNavId = "general";

		for (const heading of headings) {
			const rect = heading.getBoundingClientRect();
			if (rect.top - bodyRect.top <= 40) {
				const id = heading.getAttribute("data-settings-section");
				if (id) current = id as SettingsNavId;
			}
		}

		setActiveSection(current);
	}, []);

	const handleNavSelect = useCallback((id: SettingsNavId) => {
		setActiveSection(id);
		isScrollingProgrammatically.current = true;
		const body = bodyRef.current;
		if (!body) {
			isScrollingProgrammatically.current = false;
			return;
		}
		const target = body.querySelector(`[data-settings-section="${id}"]`);
		if (target) {
			const bodyRect = body.getBoundingClientRect();
			const targetRect = target.getBoundingClientRect();
			body.scrollTo({
				top: targetRect.top - bodyRect.top + body.scrollTop,
				behavior: "smooth",
			});
		}
		window.setTimeout(() => {
			isScrollingProgrammatically.current = false;
		}, 600);
	}, []);

	const vcsSection = (() => {
		if (!workspaceId) {
			return (
				<EmptyProjectSettings action={<SelectProjectButton onClick={projectState.onAddProject} />}>
					Select a project to inspect VCS settings.
				</EmptyProjectSettings>
			);
		}
		if (state.status === "loading") {
			return <div className="text-[13px] text-text-secondary">Loading VCS settings...</div>;
		}
		if (state.status === "error") {
			return (
				<div className="rounded-md border border-status-red/40 bg-status-red/10 p-3 text-[13px] text-status-red">
					{state.message}
				</div>
			);
		}
			return (
				<>
					<KeyValue label="Workspace cwd" value={state.data.cwd || "Unavailable"} />
					<KeyValue label="Repository" value={state.data.repository.kind} />
					<KeyValue label="Repository root" value={state.data.repository.root ?? "Unavailable"} />
					<KeyValue label="JJ installed" value={state.data.jj.installed ? "yes" : "no"} />
					<KeyValue label="JJ root" value={state.data.jj.repoRoot ?? "Unavailable"} />
					<KeyValue label="Default base" value={<code>{state.data.jj.defaultBase ?? state.data.git.defaultBranch ?? "unknown"}</code>} />
					<SettingsRow
						label="Workspace target"
						value={
							projectConfigState.status === "error"
								? projectConfigState.message
								: selectedTargetBranch ? <code>{selectedTargetBranch}</code> : "No remote branch available"
						}
						action={
							<TargetBranchSelect
								value={selectedTargetBranch}
								options={targetBranchOptions}
								disabled={projectConfigState.status === "loading" || inventoryState.status === "loading" || selectedTargetBranch.length === 0}
								onChange={onTargetBranchChange}
							/>
						}
					/>
				</>
			);
		})();

	const providerSection = (() => {
		if (!workspaceId) {
			return <div className="text-[13px] text-text-secondary">Select a project to inspect provider settings.</div>;
		}
		if (state.status === "loading") {
			return <div className="text-[13px] text-text-secondary">Loading provider settings...</div>;
		}
		if (state.status === "error") {
			return (
				<div className="rounded-md border border-status-red/40 bg-status-red/10 p-3 text-[13px] text-status-red">
					{state.message}
				</div>
			);
		}
		return (
			<>
				<KeyValue label="Provider" value={state.data.publishing.provider} />
				<KeyValue label="Remote name" value={state.data.publishing.remoteName ?? state.data.git.remoteName ?? "none"} />
				<KeyValue label="Remote URL" value={state.data.git.remoteUrl ?? "none"} />
				<KeyValue
					label="Publishing"
					value={state.data.publishing.available ? state.data.publishing.reason ?? "available" : state.data.publishing.reason ?? "unavailable"}
				/>
				<KeyValue label="Authenticated" value={state.data.publishing.authenticated ? "yes" : "no"} />
			</>
		);
	})();

	const diagnosticsSection = (() => {
		if (!workspaceId) {
			return <div className="text-[13px] text-text-secondary">Select a project to inspect diagnostics.</div>;
		}
		if (state.status === "loading") {
			return <div className="text-[13px] text-text-secondary">Loading diagnostics...</div>;
		}
		if (state.status === "error") {
			return (
				<div className="rounded-md border border-status-red/40 bg-status-red/10 p-3 text-[13px] text-status-red">
					{state.message}
				</div>
			);
		}
		if (state.data.diagnostics.length === 0) {
			return <div className="text-[13px] text-text-secondary">No diagnostics.</div>;
		}
		return (
			<div className="grid gap-2">
				{state.data.diagnostics.map((diagnostic) => (
					<div
						key={`${diagnostic.code}-${diagnostic.message}`}
						className="rounded-md border border-status-orange/30 bg-status-orange/10 p-2 text-[13px] text-text-secondary"
					>
						<div className="mb-1 flex items-center gap-2 font-medium text-status-orange">
							<AlertTriangle size={14} />
							{diagnostic.level} · {diagnostic.code}
						</div>
						{diagnostic.message}
					</div>
				))}
			</div>
		);
	})();

	return (
		<div className="flex h-[min(480px,60vh)]">
			<SettingsNav items={SETTINGS_NAV_ITEMS} activeId={activeSection} onSelect={handleNavSelect} />
			<div
				ref={bodyRef}
				onScroll={handleBodyScroll}
				className="px-5 pb-5 overflow-y-auto overscroll-contain flex-1 min-h-0 bg-surface-1"
			>
				<SettingsSection id="general" title="General" icon={<SlidersHorizontal size={16} />}>
					<SettingsRow
						label="Project rail"
						value={projectState.isProjectNavCollapsed ? "Collapsed" : "Expanded"}
						action={
							<Button
								variant="default"
								size="sm"
								onClick={() => projectState.onProjectNavCollapsedChange(!projectState.isProjectNavCollapsed)}
							>
								{projectState.isProjectNavCollapsed ? "Expand" : "Collapse"}
							</Button>
						}
					/>
					<SettingsRow
						label="Changed files"
						value={draftFileViewMode === "tree" ? "Folder tree" : "List"}
						action={<FileViewModeControl value={draftFileViewMode} onChange={onFileViewModeChange} />}
					/>
					<SettingsRow
						label="F Mode Navigation"
						value={draftFModeEnabled ? "Enabled" : "Disabled"}
						action={
							<SwitchControl
								checked={draftFModeEnabled}
								onChange={onFModeEnabledChange}
								label="Enable F Mode Navigation"
							/>
						}
					/>
					<SettingsRow
						label="Layout"
						value="Column widths and console height"
						action={
							<Button variant="default" size="sm" onClick={onResetLayout}>
								Reset
							</Button>
						}
					/>
				</SettingsSection>

				<SettingsSection id="notifications" title="Notifications" icon={<Bell size={16} />}>
					<div className="flex items-center gap-2">
						<SwitchControl
							checked={draftNotificationsEnabled}
							onChange={onNotificationsEnabledChange}
							label="Enable VCS notifications"
						/>
						<span className="text-[13px] text-text-primary">Notify for VCS workspace updates</span>
					</div>
					<div className="flex items-center gap-2 mt-2">
						<p className="text-text-secondary text-[13px] m-0">Browser permission: {notificationStatus}</p>
						{notificationPermission !== "granted" && notificationPermission !== "unsupported" ? (
							<Button size="sm" variant="default" onClick={onRequestNotificationPermission}>
								Request permission
							</Button>
						) : null}
					</div>
					<p className="text-text-secondary text-[13px] mt-2 mb-0">
						Permission prompt: {hasPromptedForBrowserNotificationPermission() ? "already prompted" : "not prompted"}
					</p>
				</SettingsSection>

				<SettingsSection id="appearance" title="Appearance" icon={<Palette size={16} />}>
					<h6 className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary m-0 mb-2">
						Theme
					</h6>
					<div className="min-w-0 w-1/2 max-w-full">
						<ThemeSelect value={draftThemeId} onChange={onThemeChange} />
					</div>
					{draftThemeId !== themeId ? (
						<p className="text-text-secondary text-[13px] mt-2 mb-0">
							Current theme: {selectedTheme.label}. Save to apply the selected theme.
						</p>
					) : null}
				</SettingsSection>

				<SettingsSection id="vcs" title="VCS" icon={<GitBranch size={16} />}>
					{vcsSection}
				</SettingsSection>

				<SettingsSection id="provider" title="Provider" icon={<RadioTower size={16} />}>
					{providerSection}
				</SettingsSection>

				<SettingsSection id="diagnostics" title="Diagnostics" icon={<AlertTriangle size={16} />}>
					{diagnosticsSection}
				</SettingsSection>
			</div>
		</div>
	);
}

export function SettingsDialog({
	state,
	projectState,
	workspaceId,
	open,
	onOpenChange,
	fModeEnabled,
	onFModeEnabledChange,
}: {
	state: QueryState<VcsDetectResponse>;
	projectState: VcsShellProjectState;
	workspaceId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	fModeEnabled: boolean;
	onFModeEnabledChange: (enabled: boolean) => void;
}): React.ReactElement {
	const [fileViewMode, setFileViewMode] = useState<VcsFileViewMode>(() => readVcsFileViewMode());
	const [draftFileViewMode, setDraftFileViewMode] = useState<VcsFileViewMode>(() => readVcsFileViewMode());
	const [initialThemeId, setInitialThemeId] = useState<ThemeId>(() => readStoredThemeId());
	const [draftThemeId, setDraftThemeId] = useState<ThemeId>(() => readStoredThemeId());
	const [targetBranch, setTargetBranch] = useState<string | null>(null);
	const [draftTargetBranch, setDraftTargetBranch] = useState<string | null>(null);
	const [notificationsEnabled, setNotificationsEnabled] = useState(() => readBooleanStorage(VCS_NOTIFICATIONS_ENABLED_KEY, false));
	const [draftNotificationsEnabled, setDraftNotificationsEnabled] = useState(() => readBooleanStorage(VCS_NOTIFICATIONS_ENABLED_KEY, false));
	const [draftFModeEnabled, setDraftFModeEnabled] = useState(fModeEnabled);
	const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>(() => getBrowserNotificationPermission());
	const projectConfigResult = useGetProjectConfigQuery({ workspaceId: workspaceId ?? "" }, { skip: !workspaceId || !open });
	const inventoryResult = useGetJjInventoryQuery({ workspaceId: workspaceId ?? "" }, { skip: !workspaceId || !open });
	const [updateProjectConfig] = useUpdateProjectConfigMutation();
	const projectConfigQuery = {
		state: toRuntimeQueryState<RuntimeProjectConfigResponse>(projectConfigResult, "Failed to load project configuration."),
	};
	const inventoryQuery = {
		state: toRuntimeQueryState<VcsJjInventoryResponse>(inventoryResult, "Failed to load JJ branch inventory."),
	};
	const hasUnsavedChanges = useMemo(
		() =>
			draftFileViewMode !== fileViewMode ||
			draftThemeId !== initialThemeId ||
			draftTargetBranch !== targetBranch ||
			draftNotificationsEnabled !== notificationsEnabled ||
			draftFModeEnabled !== fModeEnabled,
		[
			draftFModeEnabled,
			draftFileViewMode,
			draftNotificationsEnabled,
			draftTargetBranch,
			draftThemeId,
			fModeEnabled,
			fileViewMode,
			initialThemeId,
			notificationsEnabled,
			targetBranch,
		],
	);

	useEffect(() => {
		if (projectConfigQuery.state.status !== "ready") {
			return;
		}
		const nextTargetBranch = projectConfigQuery.state.data.vcsTargetBranch ?? null;
		setTargetBranch(nextTargetBranch);
		setDraftTargetBranch(nextTargetBranch);
	}, [projectConfigQuery.state]);

	useEffect(() => {
		if (open) {
			setDraftFModeEnabled(fModeEnabled);
		}
	}, [fModeEnabled, open]);

	function closeSettings(): void {
		onOpenChange(false);
	}

	function cancelSettings(): void {
		setDraftFileViewMode(fileViewMode);
		setDraftThemeId(initialThemeId);
		previewThemeId(initialThemeId);
		setDraftTargetBranch(targetBranch);
		setDraftNotificationsEnabled(notificationsEnabled);
		setDraftFModeEnabled(fModeEnabled);
		closeSettings();
	}

	function resetLayout(): void {
		resetVcsLayoutPreferences();
		const nextFileViewMode = readVcsFileViewMode();
		setFileViewMode(nextFileViewMode);
		setDraftFileViewMode(nextFileViewMode);
	}

	async function saveSettings(): Promise<void> {
		setFileViewMode(writeVcsFileViewMode(draftFileViewMode));
		if (draftThemeId !== initialThemeId) {
			saveThemeId(draftThemeId);
			setInitialThemeId(draftThemeId);
		}
		if (draftTargetBranch !== targetBranch) {
			if (!workspaceId) {
				return;
			}
			const nextConfig = await updateProjectConfig({
				workspaceId,
				input: { vcsTargetBranch: draftTargetBranch } satisfies RuntimeProjectConfigUpdateRequest,
			}).unwrap();
			setTargetBranch(nextConfig.vcsTargetBranch ?? null);
			setDraftTargetBranch(nextConfig.vcsTargetBranch ?? null);
		}
		setNotificationsEnabled(draftNotificationsEnabled);
		writeBooleanStorage(VCS_NOTIFICATIONS_ENABLED_KEY, draftNotificationsEnabled);
		if (draftFModeEnabled !== fModeEnabled) {
			onFModeEnabledChange(draftFModeEnabled);
		}
		if (draftNotificationsEnabled && !notificationsEnabled && notificationPermission === "default") {
			const nextPermission = await requestBrowserNotificationPermission();
			setNotificationPermission(nextPermission);
		}
		closeSettings();
	}

	function requestNotifications(): void {
		void requestBrowserNotificationPermission().then(setNotificationPermission);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					cancelSettings();
					return;
				}
				onOpenChange(true);
			}}
			contentClassName="!max-w-[780px]"
		>
			<DialogHeader title="Settings" icon={<Settings size={16} />} />
			<SettingsDialogContent
				state={state}
				projectConfigState={projectConfigQuery.state}
				inventoryState={inventoryQuery.state}
				workspaceId={workspaceId}
				projectState={projectState}
				draftFileViewMode={draftFileViewMode}
				themeId={initialThemeId}
				draftThemeId={draftThemeId}
				draftTargetBranch={draftTargetBranch}
				draftNotificationsEnabled={draftNotificationsEnabled}
				draftFModeEnabled={draftFModeEnabled}
				notificationPermission={notificationPermission}
				onFileViewModeChange={setDraftFileViewMode}
				onThemeChange={setDraftThemeId}
				onTargetBranchChange={setDraftTargetBranch}
				onNotificationsEnabledChange={setDraftNotificationsEnabled}
				onFModeEnabledChange={setDraftFModeEnabled}
				onRequestNotificationPermission={requestNotifications}
				onResetLayout={resetLayout}
			/>
			<DialogFooter>
				<Button
					size="sm"
					variant="ghost"
					className="mr-auto mt-[3px]"
					icon={<ExternalLink size={14} />}
					onClick={() => window.open(CHANGEYARD_VCS_DOCS_URL, "_blank")}
				>
					Read the docs
				</Button>
				<Button onClick={cancelSettings}>Cancel</Button>
				<Button variant="primary" disabled={!hasUnsavedChanges} onClick={() => void saveSettings()}>
					Save
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
