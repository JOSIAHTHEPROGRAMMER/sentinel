import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <SettingsClient
      name={session.user.name}
      email={session.user.email}
      createdAt={session.user.createdAt.toISOString()}
    />
  );
}
