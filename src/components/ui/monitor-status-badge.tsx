import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { MonitorStatus } from "@/lib/data/monitor-status";

const statusDisplay: Record<MonitorStatus, { tone: BadgeTone; label: string }> =
	{
		up: { tone: "success", label: "Operational" },
		down: { tone: "danger", label: "Down" },
		stale: { tone: "warning", label: "No recent checks" },
		"no-data": { tone: "neutral", label: "Waiting for first check" },
		disabled: { tone: "neutral", label: "Paused" },
	};

export function MonitorStatusBadge({ status }: { status: MonitorStatus }) {
	const { tone, label } = statusDisplay[status];

	return <Badge tone={tone}>{label}</Badge>;
}
