"use client";

import { Check, ChevronDown } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type SelectOption = {
	value: string;
	label: string;
	disabled?: boolean;
};

type SelectProps = {
	options: SelectOption[];
	value: string;
	onChange: (value: string) => void;
	id?: string;
	name?: string;
	placeholder?: string;
	disabled?: boolean;
	invalid?: boolean;
	className?: string;
	"aria-label"?: string;
	"aria-labelledby"?: string;
	"aria-describedby"?: string;
};

// Next enabled option in a direction, or the starting index if there is none
function nextEnabled(
	options: SelectOption[],
	from: number,
	step: 1 | -1,
): number {
	for (
		let index = from + step;
		index >= 0 && index < options.length;
		index += step
	) {
		if (!options[index]?.disabled) {
			return index;
		}
	}

	return from;
}

export function Select({
	options,
	value,
	onChange,
	id,
	name,
	placeholder = "Select an option",
	disabled = false,
	invalid = false,
	className,
	"aria-label": ariaLabel,
	"aria-labelledby": ariaLabelledBy,
	"aria-describedby": ariaDescribedBy,
}: SelectProps) {
	const listId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const typed = useRef("");
	const typedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);

	const selectedIndex = options.findIndex((option) => option.value === value);
	const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

	useEffect(() => {
		if (!open) {
			return;
		}

		function closeOnOutsidePress(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		}

		document.addEventListener("pointerdown", closeOnOutsidePress);

		return () =>
			document.removeEventListener("pointerdown", closeOnOutsidePress);
	}, [open]);

	useEffect(() => {
		if (open && active >= 0) {
			document
				.getElementById(`${listId}-${active}`)
				?.scrollIntoView({ block: "nearest" });
		}
	}, [open, active, listId]);

	useEffect(() => () => clearTimeout(typedTimer.current), []);

	function openList() {
		setActive(selectedIndex >= 0 ? selectedIndex : nextEnabled(options, -1, 1));
		setOpen(true);
	}

	function choose(index: number) {
		const option = options[index];

		if (!option || option.disabled) {
			return;
		}

		onChange(option.value);
		setOpen(false);
	}

	function typeahead(key: string) {
		typed.current += key.toLowerCase();
		clearTimeout(typedTimer.current);
		typedTimer.current = setTimeout(() => {
			typed.current = "";
		}, 600);

		const current = open ? active : selectedIndex;
		const start = Math.max(
			typed.current.length === 1 ? current + 1 : current,
			0,
		);

		for (let step = 0; step < options.length; step++) {
			const index = (start + step) % options.length;
			const option = options[index];

			if (
				option &&
				!option.disabled &&
				option.label.toLowerCase().startsWith(typed.current)
			) {
				if (open) {
					setActive(index);
				} else {
					onChange(option.value);
				}

				return;
			}
		}
	}

	function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (disabled) {
			return;
		}

		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();

				if (open) {
					setActive(nextEnabled(options, active, 1));
				} else {
					openList();
				}
				break;
			case "ArrowUp":
				event.preventDefault();

				if (open) {
					setActive(nextEnabled(options, active, -1));
				} else {
					openList();
				}
				break;
			case "Home":
				if (open) {
					event.preventDefault();
					setActive(nextEnabled(options, -1, 1));
				}
				break;
			case "End":
				if (open) {
					event.preventDefault();
					setActive(nextEnabled(options, options.length, -1));
				}
				break;
			case "Enter":
			case " ":
				event.preventDefault();

				if (open) {
					choose(active);
				} else {
					openList();
				}
				break;
			case "Escape":
				if (open) {
					// Stops a surrounding modal from also closing
					event.preventDefault();
					event.stopPropagation();
					setOpen(false);
				}
				break;
			case "Tab":
				setOpen(false);
				break;
			default:
				if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
					typeahead(event.key);
				}
		}
	}

	return (
		<div ref={rootRef} className={cn("relative", className)}>
			{name && <input type="hidden" name={name} value={value} />}

			<button
				type="button"
				id={id}
				role="combobox"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? listId : undefined}
				aria-activedescendant={
					open && active >= 0 ? `${listId}-${active}` : undefined
				}
				aria-invalid={invalid || undefined}
				aria-label={ariaLabel}
				aria-labelledby={ariaLabelledBy}
				aria-describedby={ariaDescribedBy}
				onClick={() => (open ? setOpen(false) : openList())}
				onKeyDown={handleKeyDown}
				className={cn(
					"flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-control border bg-surface px-3 text-left text-sm text-fg hover:border-border-strong focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50",
					invalid ? "border-danger" : "border-border",
				)}
			>
				<span className={cn("truncate", !selected && "text-fg-subtle")}>
					{selected ? selected.label : placeholder}
				</span>
				<ChevronDown
					aria-hidden="true"
					className={cn(
						"size-4 shrink-0 text-fg-subtle transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<div
					id={listId}
					role="listbox"
					aria-label={ariaLabel}
					aria-labelledby={ariaLabelledBy}
					className="absolute z-30 mt-1 max-h-60 w-full min-w-40 overflow-auto rounded-panel border border-border bg-raised p-1 shadow-(--shadow-menu)"
				>
					{options.map((option, index) => {
						return (
							<div
								key={option.value}
								id={`${listId}-${index}`}
								role="option"
								aria-selected={index === selectedIndex}
								aria-disabled={option.disabled || undefined}
								// Keeps focus on the trigger while the pointer chooses
								onMouseDown={(event) => event.preventDefault()}
								onMouseEnter={() => !option.disabled && setActive(index)}
								onClick={() => choose(index)}
								className={cn(
									"flex cursor-pointer items-center justify-between gap-2 rounded-control px-2 py-1.5 text-sm",
									option.disabled
										? "cursor-not-allowed text-fg-subtle"
										: "text-fg",
									index === active && !option.disabled && "bg-accent-subtle",
								)}
							>
								<span className="truncate">{option.label}</span>
								{index === selectedIndex && (
									<Check
										aria-hidden="true"
										className="size-4 shrink-0 text-accent-text"
									/>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
