"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type MonitorDetails = {
  id: string;
  name: string;
  url: string;
  projectId: string | null;
  enabled: boolean;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectOption = {
  id: string;
  name: string;
};

type MonitorConfigFormProps = {
  monitor: MonitorDetails;
  projects: ProjectOption[];
  disabled?: boolean;
  onSaved: (monitor: Omit<MonitorDetails, "createdAt">) => void;
};

type MonitorResponse = {
  monitor?: Omit<MonitorDetails, "createdAt">;
  error?: string;
};

const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 10;

function isValidThreshold(value: number): boolean {
  return (
    Number.isInteger(value) && value >= MIN_THRESHOLD && value <= MAX_THRESHOLD
  );
}

function describeDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const hours = Math.round((minutes / 60) * 10) / 10;

  return `about ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function MonitorConfigForm({
  monitor,
  projects,
  disabled = false,
  onSaved,
}: MonitorConfigFormProps) {
  const switchId = useId();

  const [name, setName] = useState(monitor.name);
  const [url, setUrl] = useState(monitor.url);
  const [projectId, setProjectId] = useState(monitor.projectId ?? "");
  const [enabled, setEnabled] = useState(monitor.enabled);
  const [intervalSeconds, setIntervalSeconds] = useState(
    String(monitor.intervalSeconds),
  );
  const [timeoutMs, setTimeoutMs] = useState(String(monitor.timeoutMs));
  const [failureThreshold, setFailureThreshold] = useState(
    String(monitor.failureThreshold),
  );
  const [recoveryThreshold, setRecoveryThreshold] = useState(
    String(monitor.recoveryThreshold),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSave(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const interval = Number(intervalSeconds);
    const timeout = Number(timeoutMs);
    const failures = Number(failureThreshold);
    const recoveries = Number(recoveryThreshold);

    if (!Number.isInteger(interval) || interval < 60 || interval > 86400) {
      setError("Check interval must be between 60 and 86400 seconds.");
      setSaving(false);
      return;
    }

    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) {
      setError("Timeout must be between 1000 and 30000 milliseconds.");
      setSaving(false);
      return;
    }

    if (!isValidThreshold(failures)) {
      setError(
        `Failures before an incident must be a whole number from ${MIN_THRESHOLD} to ${MAX_THRESHOLD}.`,
      );
      setSaving(false);
      return;
    }

    if (!isValidThreshold(recoveries)) {
      setError(
        `Successes before recovery must be a whole number from ${MIN_THRESHOLD} to ${MAX_THRESHOLD}.`,
      );
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/monitors/${monitor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url,
          projectId: projectId || null,
          enabled,
          intervalSeconds: interval,
          timeoutMs: timeout,
          failureThreshold: failures,
          recoveryThreshold: recoveries,
        }),
      });

      const data: MonitorResponse = await response.json();

      if (!response.ok || !data.monitor) {
        throw new Error(data.error ?? "Unable to update this monitor.");
      }

      setProjectId(data.monitor.projectId ?? "");
      setNotice("Monitor settings saved.");
      onSaved(data.monitor);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong while saving changes.",
      );
    } finally {
      setSaving(false);
    }
  }

  const intervalValue = Number(intervalSeconds);
  const failureValue = Number(failureThreshold);
  const recoveryValue = Number(recoveryThreshold);

  const intervalIsValid =
    Number.isInteger(intervalValue) &&
    intervalValue >= 60 &&
    intervalValue <= 86400;

  const incidentHint =
    intervalIsValid && isValidThreshold(failureValue)
      ? failureValue === 1
        ? "An incident opens as soon as a check fails."
        : `An incident opens after ${failureValue} failed checks in a row, which is ${describeDuration(failureValue * intervalValue)} of failures at the current interval.`
      : `${MIN_THRESHOLD} to ${MAX_THRESHOLD} checks`;

  const recoveryHint =
    intervalIsValid && isValidThreshold(recoveryValue)
      ? recoveryValue === 1
        ? "An incident resolves as soon as a check succeeds."
        : `An incident resolves after ${recoveryValue} successful checks in a row, which is ${describeDuration(recoveryValue * intervalValue)} of success at the current interval.`
      : `${MIN_THRESHOLD} to ${MAX_THRESHOLD} checks`;

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-6">
      <Panel title="Endpoint">
        <div className="space-y-4">
          <Field label="Monitor name" required>
            {(control) => (
              <Input
                {...control}
                required
                minLength={1}
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="Endpoint URL"
            required
            hint="The server validates URL changes before saving them."
          >
            {(control) => (
              <Input
                {...control}
                type="url"
                required
                className="font-mono"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="Project"
            hint="Assign this monitor to a project or leave it standalone."
          >
            {(control) => (
              <Select
                id={control.id}
                aria-describedby={control["aria-describedby"]}
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

      <Panel title="Schedule">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Check interval (seconds)"
            required
            hint="60 to 86400 seconds"
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                required
                min={60}
                max={86400}
                step={1}
                value={intervalSeconds}
                onChange={(event) => setIntervalSeconds(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="Request timeout (milliseconds)"
            required
            hint="1000 to 30000 milliseconds"
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                required
                min={1000}
                max={30000}
                step={1}
                value={timeoutMs}
                onChange={(event) => setTimeoutMs(event.target.value)}
              />
            )}
          </Field>
        </div>
      </Panel>

      <Panel
        title="Incident sensitivity"
        description="Require several checks in a row before an incident opens or closes. Changes apply from the next check and never alter an incident that is already open."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Failures before an incident"
            required
            hint={incidentHint}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                required
                min={MIN_THRESHOLD}
                max={MAX_THRESHOLD}
                step={1}
                value={failureThreshold}
                onChange={(event) => setFailureThreshold(event.target.value)}
              />
            )}
          </Field>

          <Field label="Successes before recovery" required hint={recoveryHint}>
            {(control) => (
              <Input
                {...control}
                type="number"
                required
                min={MIN_THRESHOLD}
                max={MAX_THRESHOLD}
                step={1}
                value={recoveryThreshold}
                onChange={(event) => setRecoveryThreshold(event.target.value)}
              />
            )}
          </Field>
        </div>
      </Panel>

      <Panel title="State">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id={`${switchId}-label`} className="text-sm font-medium text-fg">
              Monitor enabled
            </p>
            <p id={`${switchId}-hint`} className="text-ui text-fg-subtle">
              When off, checks stop and the monitor shows as paused.
            </p>
          </div>
          <Switch
            checked={enabled}
            onChange={setEnabled}
            aria-labelledby={`${switchId}-label`}
            aria-describedby={`${switchId}-hint`}
          />
        </div>
      </Panel>

      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          disabled={disabled}
        >
          Save changes
        </Button>
      </div>
    </form>
  );
}
