"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type CreateResponse = {
	monitor?: { id: string };
	error?: string;
};

type Project = {
	id: string;
	name: string;
};

type ProjectsResponse = {
	projects?: Project[];
	error?: string;
};

export default function NewMonitorPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [projectId, setProjectId] = useState("");
	const [projects, setProjects] = useState<Project[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(true);
	const [projectsError, setProjectsError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

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

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
		<div className="mx-auto max-w-3xl space-y-8">
			<div>
				<p className="mt-6 text-sm font-medium text-cyan-300">MONITOR SETUP</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
					Add a monitor
				</h1>
				<p className="mt-3 text-sm leading-6 text-slate-400">
					Enter the endpoint you want Sentinel to monitor.
				</p>
			</div>

			<form
				onSubmit={handleSubmit}
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
						name="name"
						type="text"
						required
						minLength={1}
						maxLength={100}
						autoComplete="off"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Production API"
						className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
					/>
					<p className="text-xs text-slate-500">
						Use a recognizable name, up to 100 characters.
					</p>
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
						name="url"
						type="url"
						required
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						placeholder="https://api.example.com/health"
						className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
					/>
					<p className="text-xs leading-5 text-slate-500">
						Use an HTTP or HTTPS endpoint you are authorized to monitor. The
						server validates the URL before saving it.
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
						name="projectId"
						value={projectId}
						onChange={(event) => setProjectId(event.target.value)}
						disabled={projectsLoading}
						className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 disabled:cursor-wait disabled:opacity-50"
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
							: "Optionally assign this monitor to a project."}
					</p>
					{projectsError && (
						<p role="alert" className="text-xs text-amber-300">
							{projectsError} You can still create a standalone monitor.
						</p>
					)}
				</div>

				{error && (
					<p
						role="alert"
						className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200"
					>
						{error}
					</p>
				)}

				<div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
					<Link
						href="/monitors"
						className="rounded-lg border border-white/10 px-4 py-2.5 text-center text-sm font-medium text-slate-300 hover:bg-white/5"
					>
						Cancel
					</Link>
					<button
						type="submit"
						disabled={saving}
						className="rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-50"
					>
						{saving ? "Creating..." : "Create monitor"}
					</button>
				</div>
			</form>
		</div>
	);
}
