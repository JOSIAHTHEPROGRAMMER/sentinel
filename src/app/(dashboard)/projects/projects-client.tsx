"use client";

import { FolderPlus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Column, DataTable, RowLink } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  monitorCount: number;
  enabledCount: number;
  disabledCount: number;
  openIncidents: number;
  health: {
    totalChecks: number;
    successfulChecks: number;
    uptimePercentage: number | null;
    averageResponseTime: number | null;
  };
};

type ProjectsClientProps = {
  projects: Project[];
};

const columns: Column<Project>[] = [
  {
    key: "status",
    header: "Status",
    cell: (project) =>
      project.openIncidents > 0 ? (
        <Badge tone="danger">
          {project.openIncidents} open{" "}
          {project.openIncidents === 1 ? "incident" : "incidents"}
        </Badge>
      ) : project.monitorCount === 0 ? (
        <Badge tone="neutral">No monitors</Badge>
      ) : (
        <Badge tone="success">No open incidents</Badge>
      ),
  },
  {
    key: "name",
    header: "Project",
    cell: (project) => (
      <RowLink href={`/projects/${project.id}`}>{project.name}</RowLink>
    ),
  },
  {
    key: "monitors",
    header: "Monitors",
    align: "right",
    cell: (project) =>
      project.monitorCount === 0
        ? "0"
        : `${project.monitorCount} (${project.disabledCount} paused)`,
  },
  {
    key: "uptime",
    header: "Uptime (24h)",
    align: "right",
    cell: (project) =>
      project.health.uptimePercentage === null
        ? "N/A"
        : `${project.health.uptimePercentage.toFixed(2)}%`,
  },
  {
    key: "response",
    header: "Avg response",
    align: "right",
    cell: (project) =>
      project.health.averageResponseTime === null
        ? "N/A"
        : `${project.health.averageResponseTime} ms`,
  },
  {
    key: "checks",
    header: "Checks (24h)",
    align: "right",
    cell: (project) => project.health.totalChecks.toLocaleString("en-US"),
  },
];

export default function ProjectsClient({ projects }: ProjectsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // The sort is stable, so creation order is kept within each group
  const sorted = [...projects].sort(
    (a, b) => Number(b.openIncidents > 0) - Number(a.openIncidents > 0),
  );

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  function closeModal() {
    setModalOpen(false);
    setName("");
    setError("");
  }

  async function createProject() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Project name is required.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const data: { error?: string } = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create project.");
      }

      closeModal();
      refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create project.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Projects"
        actions={
          <>
            <Button variant="secondary" onClick={refresh} loading={isPending}>
              Refresh
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              <Plus aria-hidden="true" className="size-4" />
              New project
            </Button>
          </>
        }
      />

      <Panel
        title="All projects"
        description={`${projects.length} ${projects.length === 1 ? "project" : "projects"}, problems first`}
        flush
        className={cn("transition-opacity", isPending && "opacity-60")}
      >
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="No projects yet"
            description="Create a project to group related monitors."
            action={
              <Button variant="primary" onClick={() => setModalOpen(true)}>
                New project
              </Button>
            }
          />
        ) : (
          <DataTable
            interactive
            caption="Projects and their current health"
            columns={columns}
            rows={sorted}
            rowKey={(project) => project.id}
          />
        )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="New project"
        description="Projects group related monitors, so you can review them together."
        dismissible={!creating}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={closeModal}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-project-form"
              variant="primary"
              loading={creating}
              disabled={!name.trim()}
            >
              Create project
            </Button>
          </>
        }
      >
        <form
          id="create-project-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createProject();
          }}
          className="space-y-3"
        >
          <Field label="Project name" required>
            {(control) => (
              <Input
                {...control}
                value={name}
                maxLength={100}
                placeholder="Website"
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
        </form>
      </Modal>
    </>
  );
}
