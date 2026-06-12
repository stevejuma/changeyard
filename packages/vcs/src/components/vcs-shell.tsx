import { GitBranch, History, Layers3, Settings, Workflow } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { StatusChip } from "@/components/ui/status-chip";

const navItems = [
	{ href: "/vcs", label: "Overview", icon: Workflow },
	{ href: "/vcs/jj", label: "JJ Board", icon: Layers3 },
	{ href: "/vcs/jj/branches", label: "Branches", icon: GitBranch },
	{ href: "/vcs/jj/history", label: "History", icon: History },
	{ href: "/vcs/settings", label: "Settings", icon: Settings },
] as const;

export function VcsShell({
	currentPath,
	title,
	subtitle,
	kicker,
	actions,
	children,
}: {
	currentPath: string;
	title: string;
	subtitle?: ReactNode;
	kicker?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}): React.ReactElement {
	return (
		<div className="flex h-screen min-h-0 bg-surface-0 text-text-primary">
			<aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-surface-1 md:flex">
				<div className="border-b border-border px-3 py-3">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-md border border-border-bright bg-surface-2 text-accent">
							<Workflow size={16} />
						</div>
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold">Changeyard</div>
							<div className="text-xs text-text-tertiary">VCS workspace</div>
						</div>
					</div>
				</div>
				<nav className="flex flex-col gap-1 p-2" aria-label="VCS routes">
					{navItems.map((item) => {
						const Icon = item.icon;
						const active = currentPath === item.href || (item.href !== "/vcs" && currentPath.startsWith(`${item.href}/`));
						return (
							<a
								key={item.href}
								href={item.href}
								aria-current={active ? "page" : undefined}
								className={cn(
									"flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-text-secondary hover:bg-surface-2 hover:text-text-primary",
									active && "bg-accent text-accent-fg hover:bg-accent hover:text-accent-fg",
								)}
							>
								<Icon size={14} />
								<span className="truncate">{item.label}</span>
							</a>
						);
					})}
				</nav>
				<div className="mt-auto border-t border-border p-3 text-xs text-text-tertiary">
					<StatusChip label="Experimental" tone="gold" />
					<p className="mt-2 leading-5">Enabled only when the runtime serves `CHANGEYARD_VCS=1`.</p>
				</div>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex min-h-[49px] shrink-0 items-center justify-between gap-3 border-b border-divider bg-surface-1 px-3">
					<div className="flex min-w-0 items-center gap-2">
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<h1 className="truncate text-sm font-semibold text-text-primary">{title}</h1>
								{kicker}
							</div>
							{subtitle ? <div className="truncate text-xs text-text-tertiary">{subtitle}</div> : null}
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">{actions}</div>
				</header>
				<nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface-1 px-2 py-2 md:hidden">
					{navItems.map((item) => {
						const Icon = item.icon;
						const active = currentPath === item.href || (item.href !== "/vcs" && currentPath.startsWith(`${item.href}/`));
						return (
							<a
								key={item.href}
								href={item.href}
								className={cn(
									"inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium",
									active
										? "border-transparent bg-accent text-accent-fg"
										: "border-transparent bg-transparent text-text-secondary hover:bg-surface-3 hover:text-text-primary",
								)}
							>
								<Icon size={14} />
								{item.label}
							</a>
						);
					})}
				</nav>
				<main className="min-h-0 flex-1 overflow-auto bg-surface-0">{children}</main>
			</div>
		</div>
	);
}
