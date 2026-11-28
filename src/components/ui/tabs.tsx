"use client";

import { type KeyboardEvent, useRef } from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
	id: string;
	label: string;
	count?: number;
};

type TabsProps = {
	tabs: TabItem[];
	value: string;
	onChange: (id: string) => void;
	// Ties each tab to its panel, which must use tabPanelProps with the same prefix
	idPrefix: string;
	label: string;
};

export function tabPanelProps(idPrefix: string, tabId: string) {
	return {
		id: `${idPrefix}-panel-${tabId}`,
		role: "tabpanel" as const,
		"aria-labelledby": `${idPrefix}-tab-${tabId}`,
		tabIndex: 0,
	};
}

export function Tabs({ tabs, value, onChange, idPrefix, label }: TabsProps) {
	const listRef = useRef<HTMLDivElement>(null);

	function move(index: number) {
		const tab = tabs[(index + tabs.length) % tabs.length];

		if (!tab) {
			return;
		}

		onChange(tab.id);
		listRef.current
			?.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`)
			?.focus();
	}

	function handleKeyDown(event: KeyboardEvent, index: number) {
		if (event.key === "ArrowRight") {
			event.preventDefault();
			move(index + 1);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			move(index - 1);
		} else if (event.key === "Home") {
			event.preventDefault();
			move(0);
		} else if (event.key === "End") {
			event.preventDefault();
			move(tabs.length - 1);
		}
	}

	return (
		<div
			ref={listRef}
			role="tablist"
			aria-label={label}
			className="table-scroll flex gap-1 overflow-x-auto border-b border-border"
		>
			{tabs.map((tab, index) => {
				const selected = tab.id === value;

				return (
					<button
						key={tab.id}
						type="button"
						role="tab"
						id={`${idPrefix}-tab-${tab.id}`}
						data-tab={tab.id}
						aria-selected={selected}
						aria-controls={`${idPrefix}-panel-${tab.id}`}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(tab.id)}
						onKeyDown={(event) => handleKeyDown(event, index)}
						className={cn(
							"-mb-px flex h-10 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
							selected
								? "border-accent text-fg"
								: "border-transparent text-fg-muted hover:text-fg",
						)}
					>
						{tab.label}
						{tab.count !== undefined && (
							<span className="rounded-control bg-raised px-1.5 text-xs tabular-nums text-fg-muted">
								{tab.count}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
