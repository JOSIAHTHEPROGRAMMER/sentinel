"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckHistory } from "@/features/checks/components/check-history";

type Monitor = {
	id: string;
	name: string;
	url: string;
	projectId: string | null;
	enabled: boolean;
	intervalSeconds: number;
	timeoutMs: number;
	createdAt: string;
	updatedAt: string;
};

type Project = {
	id: string;
	name: string;
};

type MonitorDetailsClientProps = {
	initialMonitor: Monitor;
};

type MonitorResponse = {
	monitor?: Omit<Monitor, "createdAt">;
	error?: string;
};

type ProjectsResponse = {
	projects?: Project[];
	error?: string;
};

export default function MonitorDetailsClient({
	initialMonitor,
}: MonitorDetailsClientProps) {
	const id = initialMonitor.id;
	const router = useRouter();

	const [monitor, setMonitor] = useState<Monitor>(initialMonitor);
	const [name, setName] = useState(initialMonitor.name);
	const [url, setUrl] = useState(initialMonitor.url);
	const [projectId, setProjectId] = useState(initialMonitor.projectId);
	const [projects, setProjects] = useState<Project[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(true);
	const [projectsError, setProjectsError] = useState("");
	const [enabled, setEnabled] = useState(initialMonitor.enabled);
	const [intervalSeconds, setIntervalSeconds] = useState(
		String(initialMonitor.intervalSeconds),
	);
	const [timeoutMs, setTimeoutMs] = useState(String(initialMonitor.timeoutMs));

	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	useEffect(() => {
		const controller = new AbortController();

		async function loadProjects() {
			try {
				const response = await fetch("/api/projects", {
					signal: controller.signal,
				});

				const data: ProjectsResponse = await response.json();

				if (!response.ok) {
					throw new Error(data.error ?? "Unable to load projects.");
				}

				setProjects(data.projects ?? []);
			} catch (cause) {
				if (cause instanceof Error && cause.name === "AbortError") {
					return;
				}

				setProjectsError(
					cause instanceof Error ? cause.message : "Unable to load projects.",
				);
			} finally {
				if (!controller.signal.aborted) {
					setProjectsLoading(false);
				}
			}
		}

		loadProjects();

		return () => controller.abort();
	}, []);

	async function handleSave(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setError("");
		setNotice("");

		const interval = Number(intervalSeconds);
		const timeout = Number(timeoutMs);

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

		try {
			const response = await fetch(`/api/monitors/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					url,
					projectId: projectId || null,
					enabled,
					intervalSeconds: interval,
					timeoutMs: timeout,
				}),
			});

			const data: MonitorResponse = await response.json();

			if (!response.ok || !data.monitor) {
				throw new Error(data.error ?? "Unable to update this monitor.");
			}

			setMonitor((current) => ({
				...current,
				...data.monitor,
			}));
			setProjectId(data.monitor.projectId);
			setNotice("Monitor settings saved.");
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

	async function handleDelete() {
		if (
			!window.confirm(
				`Delete "${monitor.name}"? This removes it from your active monitor list.`,
			)
		) {
			return;
		}

		setDeleting(true);
		setError("");

		try {
			const response = await fetch(`/api/monitors/${id}`, {
				method: "DELETE",
			});

			const data: { error?: string } = await response.json();

			if (!response.ok) {
				throw new Error(data.error ?? "Unable to delete this monitor.");
			}

			router.push("/monitors");
			router.refresh();
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Something went wrong while deleting this monitor.",
			);
			setDeleting(false);
		}
	}

	const configuration = (
		<div className="space-y-8">
			<form
				onSubmit={handleSave}
				className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/50 p-5 sm:p-8"
			>
				<div className="space-y-2">
					<label
						htmlFor="name"
						className="block text-sm font-medium text-slate-200"
					>
						Monitor name
					</label>
					<input
						id="name"
						required
						minLength={1}
						maxLength={100}
						value={name}
						onChange={(event) => setName(event.target.value)}
						className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
					/>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="url"
						className="block text-sm font-medium text-slate-200"
					>
						Endpoint URL
					</label>
					<input
						id="url"
						type="url"
						required
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
					/>
					<p className="text-xs leading-5 text-slate-500">
						The server validates URL changes before saving them.
					</p>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="projectId"
						className="block text-sm font-medium text-slate-200"
					>
						Project
					</label>
					<select
						id="projectId"
						value={projectId ?? ""}
						onChange={(event) => setProjectId(event.target.value || null)}
						disabled={projectsLoading}
						className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400 disabled:cursor-wait disabled:opacity-50"
					>
						<option value="">Standalone</option>
						{projects.map((project) => (
							<option key={project.id} value={project.id}>
								{project.name}
							</option>
						))}
					</select>
					<p className="text-xs leading-5 text-slate-500">
						{projectsLoading
							? "Loading your projects..."
							: "Assign this monitor to a project or leave it standalone."}
					</p>
					{projectsError && (
						<p role="alert" className="text-xs text-amber-300">
							{projectsError} Project assignment is unavailable.
						</p>
					)}
				</div>

				<div className="grid gap-5 sm:grid-cols-2">
					<div className="space-y-2">
						<label
							htmlFor="intervalSeconds"
							className="block text-sm font-medium text-slate-200"
						>
							Check interval (seconds)
						</label>
						<input
							id="intervalSeconds"
							type="number"
							required
							min={60}
							max={86400}
							step={1}
							value={intervalSeconds}
							onChange={(event) => setIntervalSeconds(event.target.value)}
							className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
						/>
						<p className="text-xs text-slate-500">60 to 86400 seconds</p>
					</div>

					<div className="space-y-2">
						<label
							htmlFor="timeoutMs"
							className="block text-sm font-medium text-slate-200"
						>
							Request timeout (milliseconds)
						</label>
						<input
							id="timeoutMs"
							type="number"
							required
							min={1000}
							max={30000}
							step={1}
							value={timeoutMs}
							onChange={(event) => setTimeoutMs(event.target.value)}
							className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
						/>
						<p className="text-xs text-slate-500">1000 to 30000 milliseconds</p>
					</div>
				</div>

				<label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
					<span>
						<span className="block text-sm font-medium text-slate-200">
							Monitor enabled
						</span>
						<span className="mt-1 block text-xs leading-5 text-slate-500">
							Controls whether this monitor is configured to run checks.
						</span>
					</span>
					<input
						type="checkbox"
						checked={enabled}
						onChange={(event) => setEnabled(event.target.checked)}
						className="size-5 accent-cyan-400"
					/>
				</label>

				{error && (
					<p
						role="alert"
						className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200"
					>
						{error}
					</p>
				)}

				{notice && (
					<p
						role="status"
						className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200"
					>
						{notice}
					</p>
				)}

				<div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
					<button
						type="submit"
						disabled={saving || deleting}
						className="cursor-pointer rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-50"
					>
						{saving ? "Saving..." : "Save changes"}
					</button>
				</div>
			</form>

			<section className="flex flex-col items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/3 p-5 text-center sm:p-6">
				<h2 className="font-semibold text-red-200">Delete monitor</h2>
				<p className="mt-2 text-sm leading-6 text-slate-400">
					This removes the monitor from your active list. The server handles
					deletion using the existing soft-delete behavior.
				</p>
				<button
					type="button"
					onClick={handleDelete}
					disabled={saving || deleting}
					className="mt-4 cursor-pointer rounded-lg border border-red-400/30 px-4 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-400/10 disabled:cursor-wait disabled:opacity-50"
				>
					{deleting ? "Deleting..." : "Delete monitor"}
				</button>
			</section>
		</div>
	);

	return (
		<div className="mx-auto max-w-3xl space-y-8">
			<div>
				<p className="mt-6 text-sm font-medium text-cyan-300">MONITOR</p>
				<h1 className="mt-2 wrap-break-word text-3xl font-semibold tracking-tight text-white">
					{monitor.name}
				</h1>
				<p className="mt-3 break-all text-sm text-slate-400">{monitor.url}</p>
			</div>

			<CheckHistory monitorId={id} configuration={configuration} />
		</div>
	);
}
