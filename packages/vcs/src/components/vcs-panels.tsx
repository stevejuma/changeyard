import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import type { QueryState, VcsDiagnostic } from "@/runtime/types";

export function PageBody({ children, className }: { children: ReactNode; className?: string }): React.ReactElement {
	return <div className={cn("mx-auto flex w-full max-w-[1480px] flex-col gap-3 p-3", className)}>{children}</div>;
}

export function Panel({
	title,
	children,
	className,
	actions,
}: {
	title?: ReactNode;
	children: ReactNode;
	className?: string;
	actions?: ReactNode;
}): React.ReactElement {
	return (
		<section className={cn("min-w-0 rounded-lg border border-border bg-surface-1", className)}>
			{title || actions ? (
				<header className="flex min-h-10 items-center justify-between gap-2 border-b border-border px-3 py-2">
					{title ? <h2 className="truncate text-sm font-semibold text-text-primary">{title}</h2> : <span />}
					{actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
				</header>
			) : null}
			<div className="p-3">{children}</div>
		</section>
	);
}

export function StatCard({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: ReactNode;
	tone?: StatusChipTone;
}): React.ReactElement {
	return (
		<div className="rounded-lg border border-border bg-surface-1 p-3">
			<div className="mb-2">
				<StatusChip label={label} tone={tone} />
			</div>
			<div className="min-w-0 truncate text-sm text-text-primary">{value}</div>
		</div>
	);
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }): React.ReactElement {
	return (
		<div className="grid gap-1 border-t border-border py-2 first:border-t-0 first:pt-0 last:pb-0">
			<div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{label}</div>
			<div className="min-w-0 break-words text-[13px] text-text-primary">{value}</div>
		</div>
	);
}

export function DiagnosticsPanel({ diagnostics }: { diagnostics: VcsDiagnostic[] }): React.ReactElement | null {
	if (diagnostics.length === 0) {
		return null;
	}
	return (
		<Panel title="Diagnostics">
			<div className="grid gap-2">
				{diagnostics.map((diagnostic) => (
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
		</Panel>
	);
}

export function QueryGate<T>({
	state,
	loading,
	loadingFallback,
	errorTitle,
	children,
}: {
	state: QueryState<T>;
	loading: string;
	loadingFallback?: React.ReactElement;
	errorTitle: string;
	children: (data: T) => React.ReactElement;
}): React.ReactElement {
	if (state.status === "loading") {
		if (loadingFallback) {
			return loadingFallback;
		}
		return (
			<Panel>
				<div className="flex items-center gap-2 text-sm text-text-secondary">
					<Spinner size={16} />
					{loading}
				</div>
			</Panel>
		);
	}
	if (state.status === "error") {
		return (
			<Panel title={errorTitle}>
				<div className="flex items-center gap-2 text-sm text-status-red">
					<AlertTriangle size={16} />
					{state.message}
				</div>
			</Panel>
		);
	}
	return children(state.data);
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }): React.ReactElement {
	return (
		<div className="rounded-lg border border-dashed border-border-bright bg-surface-0 p-4 text-center">
			<div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2 text-text-secondary">
				<CheckCircle2 size={16} />
			</div>
			<div className="text-sm font-medium text-text-primary">{title}</div>
			<div className="mt-1 text-[13px] text-text-secondary">{children}</div>
		</div>
	);
}
