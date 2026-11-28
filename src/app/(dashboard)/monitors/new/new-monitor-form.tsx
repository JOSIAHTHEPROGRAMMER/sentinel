"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

type CreateResponse = {
  monitor?: { id: string };
  error?: string;
};

type Project = {
  id: string;
  name: string;
};

export function NewMonitorForm({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url,
          projectId: projectId || null,
        }),
      });

      const data: CreateResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to create this monitor.");
      }

      router.push("/monitors");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong while creating the monitor.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        back={
          <Link
            href="/monitors"
            className="inline-flex items-center gap-1 hover:text-fg"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Monitors
          </Link>
        }
        title="Add monitor"
        description="Interval and timeout start from your monitoring defaults in Settings. You can change them on the monitor afterwards."
      />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <Panel title="Endpoint">
          <div className="space-y-4">
            <Field
              label="Monitor name"
              required
              hint="Use a recognizable name, up to 100 characters."
            >
              {(control) => (
                <Input
                  {...control}
                  name="name"
                  required
                  minLength={1}
                  maxLength={100}
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Production API"
                />
              )}
            </Field>

            <Field
              label="Endpoint URL"
              required
              hint="Use a public HTTP or HTTPS endpoint you are authorized to monitor. Private and internal addresses are rejected."
            >
              {(control) => (
                <Input
                  {...control}
                  name="url"
                  type="url"
                  required
                  className="font-mono"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://api.example.com/health"
                />
              )}
            </Field>

            <Field
              label="Project"
              hint="Optionally assign this monitor to a project."
            >
              {(control) => (
                <Select
                  id={control.id}
                  aria-describedby={control["aria-describedby"]}
                  name="projectId"
                  value={projectId}
                  onChange={setProjectId}
                  options={[
                    { value: "", label: "Standalone" },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: project.name,
                    })),
                  ]}
                />
              )}
            </Field>
          </div>
        </Panel>

        {error && <Notice tone="danger">{error}</Notice>}

        <div className="flex justify-end gap-2">
          <Link
            href="/monitors"
            className={buttonStyles({ variant: "secondary" })}
          >
            Cancel
          </Link>
          <Button type="submit" variant="primary" loading={saving}>
            Create monitor
          </Button>
        </div>
      </form>
    </>
  );
}
