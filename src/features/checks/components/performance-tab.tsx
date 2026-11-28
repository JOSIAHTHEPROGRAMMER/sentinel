"use client";

import { type ReactNode, useState } from "react";
import { ResponseTimeChart } from "@/components/charts/response-time-chart";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Figure } from "@/components/ui/figure";
import { LocalDate } from "@/components/ui/local-date";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/cn";
import {
	ANALYTICS_RANGES,
	type AnalyticsRange,
	bucketSecondsForSpan,
	MAX_CUSTOM_WINDOW_MS,
	MIN_CUSTOM_WINDOW_MS,
} from "@/lib/data/analytics-shared";
import type { ChecksData } from "../types";

type PerformanceTabProps = {
	data: ChecksData;
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	onChangeQuery: (query: string) => void;
};

const RANGE_LABELS: Record<AnalyticsRange, string> = {
	"24h": "the last 24 hours",
	"7d": "the last 7 days",
	"30d": "the last 30 days",
};

const CUSTOM = "custom";

export function PerformanceTab({
	data,
	loading,
	error,
	onRetry,
	onChangeQuery,
}: PerformanceTabProps) {
	const [showCustom, setShowCustom] = useState(false);
	const [customFrom, setCustomFrom] = useState("");
	const [customTo, setCustomTo] = useState("");
	const [customError, setCustomError] = useState("");

	const activePreset = ANALYTICS_RANGES.find((range) => range === data.range);
	const customActive = data.range === CUSTOM;

	const spanMs =
		new Date(data.windowEnd).getTime() - new Date(data.windowStart).getTime();
	const showTime = bucketSecondsForSpan(spanMs) < 86_400;

	const periodLabel: ReactNode = activePreset ? (
		RANGE_LABELS[activePreset]
	) : (
		<>
			<LocalDate value={data.windowStart} /> to{" "}
			<LocalDate value={data.windowEnd} />
		</>
	);
	const periodShort = activePreset ?? "this period";

	function handleRange(value: string) {
		if (value === CUSTOM) {
			setShowCustom((current) => !current);
			return;
		}

		setShowCustom(false);
		setCustomError("");
		onChangeQuery(`range=${value}`);
	}

	function applyCustomRange() {
		setCustomError("");

		const start = new Date(customFrom).getTime();
		const end = new Date(customTo).getTime();

		if (!customFrom || !customTo || Number.isNaN(start) || Number.isNaN(end)) {
			setCustomError("Choose both a start and an end.");
			return;
		}

		if (start >= end) {
			setCustomError("The start must be before the end.");
			return;
		}

		if (end - start < MIN_CUSTOM_WINDOW_MS) {
			setCustomError("The period must be at least 1 hour.");
			return;
		}

		if (end - start > MAX_CUSTOM_WINDOW_MS) {
			setCustomError("The period can be at most 90 days.");
			return;
		}

		onChangeQuery(
			new URLSearchParams({
				from: new Date(start).toISOString(),
				to: new Date(end).toISOString(),
			}).toString(),
		);
	}

	const summary = data.summary;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-fg-muted">
					Based on recorded checks from {periodLabel}.
				</p>
				<SegmentedControl
					label="Time range"
					value={showCustom || customActive ? CUSTOM : (activePreset ?? null)}
					onChange={handleRange}
					options={[
						...ANALYTICS_RANGES.map((range) => ({
							value: range,
							label: range,
						})),
						{ value: CUSTOM, label: "Custom" },
					]}
				/>
			</div>

			{showCustom && (
				<Panel
					title="Custom range"
					description="Between 1 hour and 90 days, in your local time."
				>
					<div className="flex flex-wrap items-end gap-4">
						<Field label="From">
							{(control) => (
								<Input
									{...control}
									type="datetime-local"
									value={customFrom}
									onChange={(event) => setCustomFrom(event.target.value)}
								/>
							)}
						</Field>
						<Field label="To">
							{(control) => (
								<Input
									{...control}
									type="datetime-local"
									value={customTo}
									onChange={(event) => setCustomTo(event.target.value)}
								/>
							)}
						</Field>
						<Button variant="primary" onClick={applyCustomRange}>
							Apply
						</Button>
					</div>
					{customError && (
						<Notice tone="danger" className="mt-3">
							{customError}
						</Notice>
					)}
				</Panel>
			)}

			{error && (
				<Notice
					tone="danger"
					className="flex items-center justify-between gap-3"
				>
					<span>{error}</span>
					<Button size="sm" variant="secondary" onClick={onRetry}>
						Try again
					</Button>
				</Notice>
			)}

			<Panel
				aria-busy={loading}
				className={cn("transition-opacity", loading && "opacity-60")}
			>
				<div className="grid gap-6 sm:grid-cols-3">
					<Figure
						label={`Uptime (${periodShort})`}
						value={
							summary.uptimePercentage === null
								? "N/A"
								: `${summary.uptimePercentage.toFixed(2)}%`
						}
						detail={
							summary.totalChecks === 0
								? "No checks in this period"
								: `${summary.successfulChecks} of ${summary.totalChecks} checks succeeded`
						}
					/>
					<Figure
						label="Average response time"
						value={
							summary.averageResponseTimeMs === null
								? "N/A"
								: `${summary.averageResponseTimeMs} ms`
						}
						detail="Successful checks only"
					/>
					<Figure
						label={`Checks (${periodShort})`}
						value={summary.totalChecks.toLocaleString("en-US")}
						detail={`${summary.failedChecks} failed`}
					/>
				</div>

				<div className="mt-6 border-t border-border pt-4">
					{summary.totalChecks === 0 ? (
						<p className="text-sm text-fg-muted">
							A chart will appear once checks are recorded in this period.
						</p>
					) : (
						<ResponseTimeChart
							buckets={data.buckets}
							showTime={showTime}
							label="Average response time per interval"
						/>
					)}
				</div>

				<p className="mt-4 text-ui text-fg-subtle">
					Uptime is successful checks over all checks. Timeouts and errors count
					as down.
				</p>
			</Panel>
		</div>
	);
}
