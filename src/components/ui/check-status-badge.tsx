import { Badge, type BadgeTone } from "@/components/ui/badge";

export type CheckStatus = "up" | "down" | "timeout" | "error";

const display: Record<CheckStatus, { tone: BadgeTone; label: string }> = {
  up: { tone: "success", label: "Up" },
  down: { tone: "danger", label: "Down" },
  timeout: { tone: "warning", label: "Timeout" },
  error: { tone: "neutral", label: "Error" },
};

export function CheckStatusBadge({ status }: { status: CheckStatus }) {
  const { tone, label } = display[status];

  return <Badge tone={tone}>{label}</Badge>;
}
