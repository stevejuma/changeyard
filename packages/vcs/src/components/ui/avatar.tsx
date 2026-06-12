import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/components/ui/cn";
import { Tooltip } from "@/components/ui/tooltip";

interface AvatarProps {
	src: string | null;
	name: string | null;
	email?: string | null;
	initials: string;
	className?: string;
}

export function Avatar({ src, name, email, initials, className }: AvatarProps): React.ReactElement {
	const tooltipContent =
		name || email ? (
			<div className="grid gap-0.5">
				{name ? <div className="font-medium text-text-primary">{name}</div> : null}
				{email ? <div className="font-mono text-[11px] text-text-secondary">{email}</div> : null}
			</div>
		) : null;
	const avatar = (
		<AvatarPrimitive.Root
			className={cn("inline-flex shrink-0 overflow-hidden rounded-full bg-surface-3", className)}
		>
			{src ? (
				<AvatarPrimitive.Image
					data-vcs-avatar-image
					src={src}
					alt={name ?? ""}
					referrerPolicy="no-referrer"
					className="h-full w-full object-cover"
				/>
			) : null}
			<AvatarPrimitive.Fallback
				data-vcs-avatar-fallback
				delayMs={150}
				className="grid h-full w-full place-items-center text-[10px] font-semibold text-text-secondary"
			>
				{initials}
			</AvatarPrimitive.Fallback>
		</AvatarPrimitive.Root>
	);
	return (
		<Tooltip content={tooltipContent} side="top">
			{avatar}
		</Tooltip>
	);
}
