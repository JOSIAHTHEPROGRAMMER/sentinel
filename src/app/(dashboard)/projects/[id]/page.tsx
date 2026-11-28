import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/auth/session";
import { getMonitorHealth } from "@/lib/data/monitor-health";
import { buildMonitorRows } from "@/lib/data/monitor-rows";
import { getProjectForUser } from "@/lib/data/projects";
import ProjectDetailsClient from "./project-details-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ProjectDetailsContent({ params }: PageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  const userId = session.user.id;
  const now = Date.now();

  const [result, health] = await Promise.all([
    getProjectForUser(userId, id),
    getMonitorHealth(userId, now),
  ]);

  if (!result) {
    notFound();
  }

  const openIncidentById = new Map(
    result.monitors.map((monitor) => [monitor.id, monitor.openIncident]),
  );

  // Status and uptime come from the same derivation the monitors list uses
  const rows = buildMonitorRows(
    result.monitors.map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      url: monitor.url,
      enabled: monitor.enabled,
      projectId: id,
      intervalSeconds: monitor.intervalSeconds,
      timeoutMs: monitor.timeoutMs,
      updatedAt: monitor.updatedAt,
    })),
    health,
    now,
  ).map((row) => ({
    ...row,
    openIncident: openIncidentById.get(row.id) ?? null,
  }));

  return (
    <ProjectDetailsClient
      project={result.project}
      rows={rows}
      counts={result.counts}
      health={result.health}
      now={now}
    />
  );
}

function ProjectDetailsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function ProjectDetailsPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ProjectDetailsSkeleton />}>
      <ProjectDetailsContent params={params} />
    </Suspense>
  );
}
