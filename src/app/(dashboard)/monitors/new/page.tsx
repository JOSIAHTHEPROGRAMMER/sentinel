import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getProjectOptions } from "@/lib/data/project-options";
import { NewMonitorForm } from "./new-monitor-form";

export default async function NewMonitorPage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const projects = await getProjectOptions(session.user.id);

  return <NewMonitorForm projects={projects} />;
}
