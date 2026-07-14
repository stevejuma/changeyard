import { FileDiff } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";

function SkeletonLine({ className }: { className?: string }): ReactElement {
	return <div className={cn("kb-skeleton h-3 rounded-sm", className)} />;
}

export function ChangeDetailDialogSkeleton({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}): ReactElement {
	return (
		<Dialog open={open} onOpenChange={onOpenChange} contentClassName="!max-w-[1180px] h-[88vh]">
			<DialogHeader title="Loading change" icon={<FileDiff size={16} />} />
			<DialogBody className="flex min-h-0 flex-col gap-4">
				<div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
					<aside className="flex min-h-0 flex-col rounded-md border border-divider bg-surface-0">
						<div className="flex gap-1 border-b border-divider bg-surface-1 p-2">
							<SkeletonLine className="h-7 flex-1" />
							<SkeletonLine className="h-7 flex-1" />
						</div>
						<div className="space-y-4 px-3 py-4" role="status" aria-label="Loading change details">
							{Array.from({ length: 9 }).map((_, index) => (
								<div key={`detail-skeleton-row-${index}`} className="grid grid-cols-[82px_minmax(0,1fr)] gap-3">
									<SkeletonLine className="w-14" />
									<SkeletonLine className={index % 3 === 0 ? "w-28" : "w-full"} />
								</div>
							))}
						</div>
					</aside>
					<div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-divider bg-surface-0">
						<div className="space-y-5 p-5" role="status" aria-label="Loading change markdown">
							<SkeletonLine className="h-7 w-1/3" />
							<SkeletonLine className="w-full" />
							<SkeletonLine className="w-11/12" />
							<SkeletonLine className="h-5 w-1/4" />
							<SkeletonLine className="w-full" />
							<SkeletonLine className="w-2/3" />
						</div>
					</div>
				</div>
			</DialogBody>
			<DialogFooter>
				<Button variant="default" onClick={() => onOpenChange(false)}>
					Close
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
