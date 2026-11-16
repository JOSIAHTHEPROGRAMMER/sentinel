"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export default function SignUpPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");

		if (name.trim().length < 1 || name.trim().length > 100) {
			setError("Name must be between 1 and 100 characters.");
			return;
		}

		if (password.length < 8) {
			setError("Password must contain at least 8 characters.");
			return;
		}

		setLoading(true);

		try {
			const result = await authClient.signUp.email({
				name: name.trim(),
				email: email.trim(),
				password,
			});

			if (result.error) {
				setError(result.error.message ?? "Unable to create your account.");
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
						Create your account
					</h1>
					<p className="mt-2 text-sm text-slate-400">
						Get started monitoring your API endpoints.
					</p>

					<form className="mt-8 space-y-5" onSubmit={handleSubmit}>
						<div>
							<label
								htmlFor="name"
								className="mb-2 block text-sm font-medium text-slate-300"
							>
								Name
							</label>
							<input
								id="name"
								name="name"
								autoComplete="name"
								maxLength={100}
								required
								value={name}
								onChange={(event) => setName(event.target.value)}
								className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-400"
								placeholder="Your name"
							/>
						</div>

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
								autoComplete="new-password"
								minLength={8}
								required
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm outline-none transition focus:border-cyan-400"
								placeholder="At least 8 characters"
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
							{loading ? "Creating account..." : "Create account"}
						</button>
					</form>

					<p className="mt-6 text-center text-sm text-slate-400">
						Already have an account?{" "}
						<Link
							href="/sign-in"
							className="font-medium text-cyan-300 hover:text-cyan-200"
						>
							Sign in
						</Link>
					</p>
				</div>
			</div>
		</main>
	);
}
