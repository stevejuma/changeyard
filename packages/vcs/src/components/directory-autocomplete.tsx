import { Folder, GitBranch } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactElement,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { cn } from "@/components/ui/cn";
import { fetchTrpcQuery } from "@/runtime/trpc-client";
import type { RuntimeDirectoryListEntry, RuntimeDirectoryListResponse } from "@/runtime/types";
import { toUiRelative } from "@/utils/server-path";

export interface DirectoryAutocompleteProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
	ariaLabel?: string;
	workspaceId: string | null;
	inputRef?: RefObject<HTMLInputElement>;
}

export function DirectoryAutocomplete({
	value,
	onChange,
	placeholder,
	disabled = false,
	id,
	ariaLabel,
	workspaceId,
	inputRef: externalInputRef,
}: DirectoryAutocompleteProps): ReactElement {
	const [suggestions, setSuggestions] = useState<RuntimeDirectoryListEntry[]>([]);
	const [isOpen, setIsOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const [debouncedValue, setDebouncedValue] = useState(value);
	const [serverRootPath, setServerRootPath] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const internalInputRef = useRef<HTMLInputElement>(null);
	const fetchIdRef = useRef(0);
	const userInteractedRef = useRef(false);
	const inputRefToUse = externalInputRef ?? internalInputRef;
	const listboxId = id ? `${id}-listbox` : undefined;

	const displayValue = value.replace(/^[\\/]+/, "");

	const handleInputChange = useCallback(
		(rawInput: string) => {
			userInteractedRef.current = true;
			const cleaned = rawInput.replace(/^\/+/, "");
			onChange(`/${cleaned}`);
		},
		[onChange],
	);

	useEffect(() => {
		const timer = window.setTimeout(() => setDebouncedValue(value), 250);
		return () => window.clearTimeout(timer);
	}, [value]);

	useEffect(() => {
		if (disabled) {
			setSuggestions([]);
			setIsOpen(false);
			return;
		}

		const relativePath = debouncedValue.trim().replace(/^[\\/]+/, "");
		const endsWithSep = relativePath === "" || /[\\/]$/.test(debouncedValue.trim());
		const lastSepIndex = Math.max(relativePath.lastIndexOf("/"), relativePath.lastIndexOf("\\"));
		const parentDir = endsWithSep ? relativePath : relativePath.slice(0, lastSepIndex + 1);
		const namePrefix = endsWithSep ? "" : relativePath.slice(lastSepIndex + 1).toLowerCase();
		const fetchId = ++fetchIdRef.current;

		const fetchSuggestions = async () => {
			try {
				const response = await fetchTrpcQuery<RuntimeDirectoryListResponse>(
					"projects.listDirectoryContents",
					parentDir ? { path: parentDir } : {},
					workspaceId,
				);
				if (fetchId !== fetchIdRef.current) {
					return;
				}
				if (!response.ok) {
					setSuggestions([]);
					setIsOpen(false);
					return;
				}
				if (response.rootPath) {
					setServerRootPath(response.rootPath);
				}
				const filtered = namePrefix
					? response.entries.filter((entry) => entry.name.toLowerCase().startsWith(namePrefix))
					: response.entries;
				if (filtered.length === 0) {
					setSuggestions([]);
					setIsOpen(false);
					return;
				}
				setSuggestions(filtered);
				if (userInteractedRef.current) {
					setIsOpen(true);
				}
				setHighlightedIndex(-1);
			} catch {
				if (fetchId !== fetchIdRef.current) {
					return;
				}
				setSuggestions([]);
				setIsOpen(false);
			}
		};

		void fetchSuggestions();
	}, [debouncedValue, disabled, workspaceId]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const selectSuggestion = useCallback(
		(entry: RuntimeDirectoryListEntry) => {
			const relativePath = serverRootPath ? toUiRelative(serverRootPath, entry.path) : entry.path;
			const pathWithSlash = relativePath.endsWith("/") ? relativePath : `${relativePath}/`;
			onChange(`/${pathWithSlash}`);
			setIsOpen(false);
			setHighlightedIndex(-1);
			inputRefToUse.current?.focus();
		},
		[inputRefToUse, onChange, serverRootPath],
	);

	const handleKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				if (isOpen) {
					setIsOpen(false);
					setHighlightedIndex(-1);
				} else {
					inputRefToUse.current?.blur();
				}
				return;
			}

			if (!isOpen || suggestions.length === 0) {
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlightedIndex((previous) => (previous < suggestions.length - 1 ? previous + 1 : 0));
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlightedIndex((previous) => (previous > 0 ? previous - 1 : suggestions.length - 1));
			} else if (event.key === "Enter" && highlightedIndex >= 0) {
				event.preventDefault();
				const selected = suggestions[highlightedIndex];
				if (selected) {
					selectSuggestion(selected);
				}
			}
		},
		[highlightedIndex, inputRefToUse, isOpen, selectSuggestion, suggestions],
	);

	return (
		<div ref={containerRef} className="relative">
			<div className="flex h-8 items-center rounded-md border border-border bg-surface-2 focus-within:border-accent">
				<span className="shrink-0 select-none pl-2.5 font-mono text-[13px] text-text-tertiary">/</span>
				<input
					ref={inputRefToUse}
					type="text"
					value={displayValue}
					onChange={(event) => handleInputChange(event.target.value)}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						if (userInteractedRef.current && suggestions.length > 0) {
							setIsOpen(true);
						}
					}}
					onMouseDown={() => {
						userInteractedRef.current = true;
					}}
					placeholder={placeholder}
					className="h-full min-w-0 flex-1 border-none bg-transparent px-0.5 pr-2.5 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
					disabled={disabled}
					id={id}
					aria-label={ariaLabel}
					autoComplete="off"
					role="combobox"
					aria-expanded={isOpen}
					aria-autocomplete="list"
					aria-controls={isOpen ? listboxId : undefined}
					aria-activedescendant={highlightedIndex >= 0 && id ? `${id}-option-${highlightedIndex}` : undefined}
				/>
			</div>
			{isOpen && suggestions.length > 0 ? (
				<div
					id={listboxId}
					role="listbox"
					className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-surface-1 shadow-lg"
				>
					{suggestions.map((entry, index) => (
						<div
							key={entry.path}
							id={id ? `${id}-option-${index}` : undefined}
							role="option"
							aria-selected={index === highlightedIndex}
							className={cn(
								"flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] text-text-primary",
								index === highlightedIndex ? "bg-surface-3" : "hover:bg-surface-2",
							)}
							onMouseDown={(event) => {
								event.preventDefault();
								selectSuggestion(entry);
							}}
							onMouseEnter={() => setHighlightedIndex(index)}
						>
							{entry.isGitRepository ? (
								<span className="flex shrink-0 items-center text-text-secondary" title="Repository">
									<Folder size={14} className="text-text-secondary" />
									<GitBranch size={9} className="-ml-1.5 mb-1.5 text-accent" />
								</span>
							) : (
								<Folder size={14} className="shrink-0 text-text-secondary" />
							)}
							<span className="truncate font-mono">{entry.name}</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
