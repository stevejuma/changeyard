import { FileText } from "lucide-react";
import { getIcon } from "material-file-icons";
import type { ReactElement } from "react";

import { cn } from "./cn";

export function FileTypeIcon({
	path,
	className,
	title,
}: {
	path: string;
	className?: string;
	title?: string;
}): ReactElement {
	const icon = getIcon(path);
	const accessibilityProps = {
		title,
		role: title ? "img" : undefined,
		"aria-label": title,
		"aria-hidden": title ? undefined : true,
	};

	if (!icon.svg) {
		return (
			<span className={cn("kb-file-type-icon", className)} {...accessibilityProps}>
				<FileText size={14} className="text-text-tertiary" aria-hidden="true" />
			</span>
		);
	}

	return (
		<span
			className={cn("kb-file-type-icon", className)}
			{...accessibilityProps}
			dangerouslySetInnerHTML={{ __html: icon.svg }}
		/>
	);
}
