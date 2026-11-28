import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession } from "@/lib/auth/session";
import { getIncidentsOverview } from "@/lib/data/incidents";
import {
  type IncidentFilters,
  parseIncidentFilters,
} from "@/lib/data/incidents-shared";
import IncidentsClient from "./incidents-client";

type IncidentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function IncidentsContent({
  userId,
  filters,
}: {
  userId: string;
  filters: IncidentFilters;
}) {
  const overview = await getIncidentsOverview(userId, filters);

  return (
    <IncidentsClient
      incidents={overview.incidents}
      stats={overview.stats}
      filters={filters}
      monitorOptions={overview.monitorOptions}
      projectOptions={overview.projectOptions}
      initialNow={Date.now()}
    />
  );
}

function IncidentsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

export default async function IncidentsPage({
  searchParams,
}: IncidentsPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);

  if (!session) {
    redirect("/sign-in");
  }

  const filters = parseIncidentFilters(params);

  // Not keyed on the filters, so a filter change dims the page through the
  // client's transition instead of flashing the skeleton
  return (
    <Suspense fallback={<IncidentsSkeleton />}>
      <IncidentsContent userId={session.user.id} filters={filters} />
    </Suspense>
  );
}
