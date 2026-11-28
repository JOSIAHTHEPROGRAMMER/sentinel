import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChecksData } from "@/features/checks/types";
import { getSession } from "@/lib/auth/session";
import {
  DEFAULT_ANALYTICS_RANGE,
  windowForRange,
} from "@/lib/data/analytics-shared";
import { getIncidentsForMonitor } from "@/lib/data/incidents";
import { getMonitorChecksData } from "@/lib/data/monitor-checks";
import { getMonitorForUser } from "@/lib/data/monitors";
import { getProjectOptions } from "@/lib/data/project-options";
import MonitorDetailsClient from "./monitor-details-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function MonitorDetailsContent({ params }: PageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const { id } = await params;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (!isUuid) {
    notFound();
  }

  const userId = session.user.id;
  const now = Date.now();
  const timeWindow = windowForRange(DEFAULT_ANALYTICS_RANGE, now);

  const [monitor, checks, incidents, projects] = await Promise.all([
    getMonitorForUser(userId, id),
    getMonitorChecksData(userId, id, timeWindow, now),
    getIncidentsForMonitor(userId, id),
    getProjectOptions(userId),
  ]);

  if (!monitor || !checks || !incidents) {
    notFound();
  }

  const initialData: ChecksData = {
    range: DEFAULT_ANALYTICS_RANGE,
    windowStart: new Date(timeWindow.startMs).toISOString(),
    windowEnd: new Date(timeWindow.endMs).toISOString(),
    overview: checks.overview,
    summary: checks.summary,
    buckets: checks.buckets,
    checks: checks.checks.map((check) => ({
      ...check,
      checkedAt: check.checkedAt.toISOString(),
    })),
  };

  return (
    <MonitorDetailsClient
      initialMonitor={monitor}
      projects={projects}
      initialData={initialData}
      incidents={incidents}
      now={now}
    />
  );
}

function MonitorDetailsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

export default function MonitorDetailsPage({ params }: PageProps) {
  return (
    <Suspense fallback={<MonitorDetailsSkeleton />}>
      <MonitorDetailsContent params={params} />
    </Suspense>
  );
}
