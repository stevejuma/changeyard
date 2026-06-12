import {
	AlertCircle,
	Archive,
	CheckCircle2,
	Circle,
	CircleDot,
	Clock3,
	FileDiff,
	GitPullRequest,
	PauseCircle,
	PlayCircle,
	ShieldAlert,
	Sparkles,
	Trash2,
	type LucideIcon,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/components/ui/cn";

export type StatusChipTone =
	| "neutral"
	| "blue"
	| "green"
	| "orange"
	| "red"
	| "purple"
	| "gold"
	| "cyan";

const toneClassNames: Record<StatusChipTone, string> = {
	neutral: "border-border-bright/60 bg-surface-2 text-text-secondary",
	blue: "border-status-blue/35 bg-status-blue/10 text-status-blue",
	green: "border-status-green/35 bg-status-green/10 text-status-green",
	orange: "border-status-orange/35 bg-status-orange/10 text-status-orange",
	red: "border-status-red/35 bg-status-red/10 text-status-red",
	purple: "border-status-purple/35 bg-status-purple/10 text-status-purple",
	gold: "border-status-gold/35 bg-status-gold/10 text-status-gold",
	cyan: "border-status-cyan/35 bg-status-cyan/10 text-status-cyan",
};

const changeStatusMeta: Record<string, { label: string; tone: StatusChipTone; icon: LucideIcon }> = {
	draft: { label: "Draft", tone: "neutral", icon: Circle },
	ready: { label: "Ready", tone: "blue", icon: CircleDot },
	synced: { label: "Synced", tone: "cyan", icon: CheckCircle2 },
	in_progress: { label: "In Progress", tone: "purple", icon: PlayCircle },
	blocked: { label: "Blocked", tone: "red", icon: ShieldAlert },
	ready_for_pr: { label: "Ready for PR", tone: "blue", icon: GitPullRequest },
	pr_open: { label: "PR Open", tone: "blue", icon: GitPullRequest },
	in_review: { label: "In Review", tone: "gold", icon: Clock3 },
	changes_requested: { label: "Changes Requested", tone: "orange", icon: AlertCircle },
	approved: { label: "Approved", tone: "green", icon: CheckCircle2 },
	merged: { label: "Merged", tone: "green", icon: CheckCircle2 },
	abandoned: { label: "Abandoned", tone: "neutral", icon: Archive },
};

const taskColumnMeta: Record<string, { label: string; tone: StatusChipTone; icon: LucideIcon }> = {
	backlog: { label: "Backlog", tone: "neutral", icon: Circle },
	in_progress: { label: "In Progress", tone: "purple", icon: PlayCircle },
	review: { label: "Review", tone: "gold", icon: GitPullRequest },
	trash: { label: "Done", tone: "green", icon: CheckCircle2 },
};

const planningGateMeta: Record<string, { tone: StatusChipTone; icon: LucideIcon }> = {
	pass: { tone: "green", icon: CheckCircle2 },
	fail: { tone: "red", icon: AlertCircle },
	warning: { tone: "orange", icon: AlertCircle },
	pending: { tone: "gold", icon: Clock3 },
	skipped: { tone: "neutral", icon: PauseCircle },
};

const fileStatusMeta: Record<string, { label: string; tone: StatusChipTone; icon: LucideIcon }> = {
	modified: { label: "Modified", tone: "blue", icon: FileDiff },
	added: { label: "Added", tone: "green", icon: FileDiff },
	deleted: { label: "Deleted", tone: "red", icon: Trash2 },
	renamed: { label: "Renamed", tone: "purple", icon: FileDiff },
	copied: { label: "Copied", tone: "cyan", icon: FileDiff },
	untracked: { label: "Untracked", tone: "orange", icon: FileDiff },
	unknown: { label: "Unknown", tone: "neutral", icon: FileDiff },
};

function formatStatusLabel(value: string): string {
	return value
		.split(/[_\-\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function getChangeStatusChipMeta(status: string): { label: string; tone: StatusChipTone; icon: LucideIcon } {
	return changeStatusMeta[status] ?? { label: formatStatusLabel(status), tone: "neutral", icon: Circle };
}

export function getTaskColumnStatusChipMeta(columnId: string): { label: string; tone: StatusChipTone; icon: LucideIcon } {
	return taskColumnMeta[columnId] ?? { label: formatStatusLabel(columnId), tone: "neutral", icon: Circle };
}

export function StatusChip({
	label,
	tone = "neutral",
	icon,
	className,
	title,
}: {
	label: string;
	tone?: StatusChipTone;
	icon?: ReactNode;
	className?: string;
	title?: string;
}): ReactElement {
	return (
		<span
			title={title}
			className={cn(
				"inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
				toneClassNames[tone],
				className,
			)}
		>
			{icon ? <span className="shrink-0">{icon}</span> : null}
			<span className="truncate">{label}</span>
		</span>
	);
}

export function ChangeStatusChip({ status, className }: { status: string; className?: string }): ReactElement {
	const meta = getChangeStatusChipMeta(status);
	const Icon = meta.icon;
	return <StatusChip label={meta.label} tone={meta.tone} icon={<Icon size={12} />} className={className} />;
}

export function TaskColumnStatusChip({ columnId, className }: { columnId: string; className?: string }): ReactElement {
	const meta = getTaskColumnStatusChipMeta(columnId);
	const Icon = meta.icon;
	return <StatusChip label={meta.label} tone={meta.tone} icon={<Icon size={12} />} className={className} />;
}

export function PlanningGateStatusChip({ status, className }: { status: string; className?: string }): ReactElement {
	const meta = planningGateMeta[status] ?? { tone: "neutral" as const, icon: Sparkles };
	const Icon = meta.icon;
	return <StatusChip label={formatStatusLabel(status)} tone={meta.tone} icon={<Icon size={12} />} className={className} />;
}

export function FileStatusChip({ status, className }: { status: string; className?: string }): ReactElement {
	const meta = fileStatusMeta[status] ?? { label: formatStatusLabel(status), tone: "neutral" as const, icon: FileDiff };
	const Icon = meta.icon;
	return <StatusChip label={meta.label} tone={meta.tone} icon={<Icon size={12} />} className={className} />;
}
