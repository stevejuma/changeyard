import { ArrowLeft, FileDiff } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

function SkeletonLine({ className }: { className?: string }): ReactElement {
	return <div className={cn("kb-skeleton h-3 rounded-sm", className)} />;
}

export function ChangeReviewModalSkeleton({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}): ReactElement | null {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex min-h-0 min-w-0 flex-col bg-surface-0 text-text-primary">
			<header className="flex h-12 shrink-0 items-center gap-3 border-b border-divider bg-surface-1 px-3">
				<Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => onOpenChange(false)}>
					Back
				</Button>
				<FileDiff size={16} className="shrink-0 text-text-secondary" />
				<div className="min-w-0 flex-1">
					<SkeletonLine className="mb-2 h-4 w-64" />
					<SkeletonLine className="h-2.5 w-32" />
				</div>
			</header>
			<div className="flex min-h-0 flex-1">
				<aside className="w-[300px] shrink-0 border-r border-divider p-3">
					{Array.from({ length: 5 }).map((_, index) => (
						<div key={`review-change-skeleton-${index}`} className="mb-3 rounded-md border border-divider bg-surface-1 p-3">
							<SkeletonLine className="mb-3 w-20" />
							<SkeletonLine className="mb-2 w-full" />
							<SkeletonLine className="w-2/3" />
						</div>
					))}
				</aside>
				<main className="min-w-0 flex-1 p-5" role="status" aria-label="Loading review">
					<SkeletonLine className="mb-5 h-7 w-56" />
					<SkeletonLine className="mb-3 w-full" />
					<SkeletonLine className="mb-8 w-10/12" />
					<SkeletonLine className="mb-5 h-6 w-48" />
					{Array.from({ length: 4 }).map((_, index) => (
						<SkeletonLine key={`review-body-skeleton-${index}`} className="mb-3 w-full" />
					))}
				</main>
			</div>
		</div>
	);
}
