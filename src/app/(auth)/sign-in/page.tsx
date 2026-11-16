"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export default function SignInPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		setLoading(true);

		try {
			const result = await authClient.signIn.email({
				email: email.trim(),
				password,
			});

			if (result.error) {
				setError(result.error.message ?? "Unable to sign in.");
				return;
			}

			router.replace("/dashboard");
			router.refresh();
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white">
			<div className="w-full max-w-md">
				<Link
					href="/"
					className="mb-8 inline-flex text-sm font-medium text-slate-400 transition hover:text-white"
				>
					Sentinel
				</Link>

				<div className="rounded-2xl border border-white/10 bg-slate-900/70 p-8 shadow-xl">
					<h1 className="text-2xl font-semibold tracking-tight">
						Welcome back
					</h1>
					<p className="mt-2 text-sm text-slate-400">
						Sign in to manage your API monitors.
					</p>

					<form className="mt-8 space-y-5" onSubmit={handleSubmit}>
						<div>
							<label
								htmlFor="email"
								className="mb-2 block text-sm font-medium text-slate-300"
							>
								Email
							</label>
							<input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								required
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-400"
								placeholder="you@example.com"
							/>
						</div>

						<div>
							<label
								htmlFor="password"
								className="mb-2 block text-sm font-medium text-slate-300"
							>
								Password
							</label>
							<input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								required
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-400"
								placeholder="Your password"
							/>
						</div>

						{error && (
							<p
								role="alert"
								className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300"
							>
								{error}
							</p>
						)}

						<button
							type="submit"
							disabled={loading}
							className="w-full rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{loading ? "Signing in..." : "Sign in"}
						</button>
					</form>

					<p className="mt-6 text-center text-sm text-slate-400">
						Don't have an account?{" "}
						<Link
							href="/sign-up"
							className="font-medium text-cyan-300 hover:text-cyan-200"
						>
							Create one
						</Link>
					</p>
				</div>
			</div>
		</main>
	);
}
