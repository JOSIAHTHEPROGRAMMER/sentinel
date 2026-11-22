"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocalDate } from "@/components/ui/local-date";
import { authClient } from "@/lib/auth/client";
import {
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	validateNewPassword,
} from "@/lib/validation/password";
import {
	MAX_INTERVAL_SECONDS,
	MAX_TIMEOUT_MS,
	MIN_INTERVAL_SECONDS,
	MIN_TIMEOUT_MS,
	type UserSettings,
	validateUserSettings,
} from "@/lib/validation/user-settings";

type SettingsClientProps = {
	name: string;
	email: string;
	createdAt: string;
	settings: UserSettings;
	pendingPurgeAfter: string | null;
};

const inputClassName =
	"w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400";

export default function SettingsClient({
	name: initialName,
	email,
	createdAt,
	settings,
	pendingPurgeAfter,
}: SettingsClientProps) {
	const router = useRouter();

	const [name, setName] = useState(initialName);
	const [savedName, setSavedName] = useState(initialName);
	const [savingProfile, setSavingProfile] = useState(false);
	const [profileError, setProfileError] = useState("");
	const [profileNotice, setProfileNotice] = useState("");

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [savingPassword, setSavingPassword] = useState(false);
	const [passwordError, setPasswordError] = useState("");
	const [passwordNotice, setPasswordNotice] = useState("");

	const [savedSettings, setSavedSettings] = useState(settings);
	const [intervalSeconds, setIntervalSeconds] = useState(
		String(settings.defaultIntervalSeconds),
	);
	const [timeoutMs, setTimeoutMs] = useState(String(settings.defaultTimeoutMs));
	const [savingDefaults, setSavingDefaults] = useState(false);
	const [defaultsError, setDefaultsError] = useState("");
	const [defaultsNotice, setDefaultsNotice] = useState("");

	const [deletePassword, setDeletePassword] = useState("");
	const [deleteEmail, setDeleteEmail] = useState("");
	const [requestingDeletion, setRequestingDeletion] = useState(false);
	const [deletionError, setDeletionError] = useState("");

	const deletionReady =
		deletePassword.length > 0 &&
		deleteEmail.trim().toLowerCase() === email.trim().toLowerCase();

	const defaultsUnchanged =
		Number(intervalSeconds) === savedSettings.defaultIntervalSeconds &&
		Number(timeoutMs) === savedSettings.defaultTimeoutMs;

	async function handleProfileSubmit(
		event: React.SubmitEvent<HTMLFormElement>,
	) {
		event.preventDefault();
		setProfileError("");
		setProfileNotice("");

		const trimmed = name.trim();

		if (trimmed.length < 1 || trimmed.length > 100) {
			setProfileError("Name must be between 1 and 100 characters.");
			return;
		}

		setSavingProfile(true);

		try {
			const result = await authClient.updateUser({ name: trimmed });

			if (result.error) {
				setProfileError(result.error.message ?? "Unable to update your name.");
				return;
			}

			setName(trimmed);
			setSavedName(trimmed);
			setProfileNotice("Your name has been updated.");
			router.refresh();
		} catch {
			setProfileError("Something went wrong. Please try again.");
		} finally {
			setSavingProfile(false);
		}
	}

	async function handlePasswordSubmit(
		event: React.SubmitEvent<HTMLFormElement>,
	) {
		event.preventDefault();
		setPasswordError("");
		setPasswordNotice("");

		const problem = validateNewPassword(
			currentPassword,
			newPassword,
			confirmation,
		);

		if (problem) {
			setPasswordError(problem);
			return;
		}

		setSavingPassword(true);

		try {
			const result = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			});

			if (result.error) {
				setPasswordError(
					result.error.message ?? "Unable to change your password.",
				);
				return;
			}

			setCurrentPassword("");
			setNewPassword("");
			setConfirmation("");
			setPasswordNotice(
				"Your password has been changed and your other devices were signed out.",
			);
		} catch {
			setPasswordError("Something went wrong. Please try again.");
		} finally {
			setSavingPassword(false);
		}
	}

	async function handleDefaultsSubmit(
		event: React.SubmitEvent<HTMLFormElement>,
	) {
		event.preventDefault();
		setDefaultsError("");
		setDefaultsNotice("");

		const candidate = {
			defaultIntervalSeconds: Number(intervalSeconds),
			defaultTimeoutMs: Number(timeoutMs),
		};

		const validation = validateUserSettings(candidate);

		if (!validation.valid) {
			setDefaultsError(validation.error);
			return;
		}

		setSavingDefaults(true);

		try {
			const response = await fetch("/api/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(validation.settings),
			});

			const data: { settings?: UserSettings; error?: string } =
				await response.json();

			if (!response.ok || !data.settings) {
				throw new Error(data.error ?? "Unable to save your defaults.");
			}

			setSavedSettings(data.settings);
			setIntervalSeconds(String(data.settings.defaultIntervalSeconds));
			setTimeoutMs(String(data.settings.defaultTimeoutMs));
			setDefaultsNotice("Your monitoring defaults have been saved.");
		} catch (cause) {
			setDefaultsError(
				cause instanceof Error
					? cause.message
					: "Something went wrong. Please try again.",
			);
		} finally {
			setSavingDefaults(false);
		}
	}

	async function handleDeletionSubmit(
		event: React.SubmitEvent<HTMLFormElement>,
	) {
		event.preventDefault();
		setDeletionError("");
		setRequestingDeletion(true);

		try {
			const response = await fetch("/api/account/deletion", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					password: deletePassword,
					email: deleteEmail,
				}),
			});

			const data: { error?: string } = await response.json();

			if (!response.ok) {
				throw new Error(data.error ?? "Unable to schedule the deletion.");
			}

			// The server already revoked every session; this clears the local cookie too
			try {
				await authClient.signOut();
			} catch {
				// Nothing to clean up if the session is already gone
			}

			window.location.assign("/sign-in?account=deletion-scheduled");
		} catch (cause) {
			setDeletionError(
				cause instanceof Error
					? cause.message
					: "Something went wrong. Please try again.",
			);
			setRequestingDeletion(false);
		}
	}

	return (
		<div className="mx-auto max-w-3xl space-y-8">
			<div>
				<p className="mt-6 text-sm font-medium text-cyan-300">ACCOUNT</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
					Settings
				</h1>
				<p className="mt-3 text-sm leading-6 text-slate-400">
					Manage your profile, monitoring defaults and account security.
				</p>
			</div>

			<form
				onSubmit={handleProfileSubmit}
				className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/50 p-5 sm:p-8"
			>
				<div>
					<h2 className="text-lg font-semibold text-white">Profile</h2>
					<p className="mt-1 text-sm text-slate-400">
						Member since <LocalDate value={createdAt} />
					</p>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="profile-name"
						className="block text-sm font-medium text-slate-200"
					>
						Name
					</label>
					<input
						id="profile-name"
						type="text"
						required
						maxLength={100}
						autoComplete="name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						className={inputClassName}
					/>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="profile-email"
						className="block text-sm font-medium text-slate-200"
					>
						Email
					</label>
					<input
						id="profile-email"
						type="email"
						value={email}
						readOnly
						className={`${inputClassName} cursor-not-allowed opacity-60`}
					/>
					<p className="text-xs text-slate-500">
						Your email address can't be changed here.
					</p>
				</div>

				{profileError && (
					<p
						role="alert"
						className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200"
					>
						{profileError}
					</p>
				)}

				{profileNotice && (
					<p
						role="status"
						className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200"
					>
						{profileNotice}
					</p>
				)}

				<div className="flex justify-end border-t border-white/10 pt-5">
					<button
						type="submit"
						disabled={
							savingProfile || !name.trim() || name.trim() === savedName
						}
						className="cursor-pointer rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{savingProfile ? "Saving..." : "Save name"}
					</button>
				</div>
			</form>

			<form
				onSubmit={handleDefaultsSubmit}
				className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/50 p-5 sm:p-8"
			>
				<div>
					<h2 className="text-lg font-semibold text-white">
						Monitoring defaults
					</h2>
					<p className="mt-1 text-sm text-slate-400">
						New monitors start with these values. Existing monitors keep their
						own settings.
					</p>
				</div>

				<div className="grid gap-5 sm:grid-cols-2">
					<div className="space-y-2">
						<label
							htmlFor="default-interval"
							className="block text-sm font-medium text-slate-200"
						>
							Check interval (seconds)
						</label>
						<input
							id="default-interval"
							type="number"
							required
							min={MIN_INTERVAL_SECONDS}
							max={MAX_INTERVAL_SECONDS}
							step={1}
							value={intervalSeconds}
							onChange={(event) => setIntervalSeconds(event.target.value)}
							className={inputClassName}
						/>
						<p className="text-xs text-slate-500">
							{MIN_INTERVAL_SECONDS} to {MAX_INTERVAL_SECONDS} seconds
						</p>
					</div>

					<div className="space-y-2">
						<label
							htmlFor="default-timeout"
							className="block text-sm font-medium text-slate-200"
						>
							Request timeout (milliseconds)
						</label>
						<input
							id="default-timeout"
							type="number"
							required
							min={MIN_TIMEOUT_MS}
							max={MAX_TIMEOUT_MS}
							step={1}
							value={timeoutMs}
							onChange={(event) => setTimeoutMs(event.target.value)}
							className={inputClassName}
						/>
						<p className="text-xs text-slate-500">
							{MIN_TIMEOUT_MS} to {MAX_TIMEOUT_MS} milliseconds
						</p>
					</div>
				</div>

				{defaultsError && (
					<p
						role="alert"
						className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200"
					>
						{defaultsError}
					</p>
				)}

				{defaultsNotice && (
					<p
						role="status"
						className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200"
					>
						{defaultsNotice}
					</p>
				)}

				<div className="flex justify-end border-t border-white/10 pt-5">
					<button
						type="submit"
						disabled={savingDefaults || defaultsUnchanged}
						className="cursor-pointer rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{savingDefaults ? "Saving..." : "Save defaults"}
					</button>
				</div>
			</form>

			<form
				onSubmit={handlePasswordSubmit}
				className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/50 p-5 sm:p-8"
			>
				<div>
					<h2 className="text-lg font-semibold text-white">Password</h2>
					<p className="mt-1 text-sm text-slate-400">
						Changing your password signs you out of all other devices.
					</p>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="current-password"
						className="block text-sm font-medium text-slate-200"
					>
						Current password
					</label>
					<input
						id="current-password"
						type="password"
						required
						autoComplete="current-password"
						value={currentPassword}
						onChange={(event) => setCurrentPassword(event.target.value)}
						className={inputClassName}
					/>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="new-password"
						className="block text-sm font-medium text-slate-200"
					>
						New password
					</label>
					<input
						id="new-password"
						type="password"
						required
						minLength={MIN_PASSWORD_LENGTH}
						maxLength={MAX_PASSWORD_LENGTH}
						autoComplete="new-password"
						value={newPassword}
						onChange={(event) => setNewPassword(event.target.value)}
						className={inputClassName}
					/>
					<p className="text-xs text-slate-500">
						At least {MIN_PASSWORD_LENGTH} characters.
					</p>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="confirm-password"
						className="block text-sm font-medium text-slate-200"
					>
						Confirm new password
					</label>
					<input
						id="confirm-password"
						type="password"
						required
						autoComplete="new-password"
						value={confirmation}
						onChange={(event) => setConfirmation(event.target.value)}
						className={inputClassName}
					/>
				</div>

				{passwordError && (
					<p
						role="alert"
						className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200"
					>
						{passwordError}
					</p>
				)}

				{passwordNotice && (
					<p
						role="status"
						className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200"
					>
						{passwordNotice}
					</p>
				)}

				<div className="flex justify-end border-t border-white/10 pt-5">
					<button
						type="submit"
						disabled={savingPassword}
						className="cursor-pointer rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{savingPassword ? "Changing..." : "Change password"}
					</button>
				</div>
			</form>

			<section className="space-y-6 rounded-2xl border border-red-400/20 bg-red-400/3 p-5 sm:p-8">
				<div>
					<h2 className="text-lg font-semibold text-red-200">Delete account</h2>
					<p className="mt-1 text-sm leading-6 text-slate-400">
						Deleting your account permanently removes your monitors, projects,
						check history, incidents and settings. You'll have a grace period to
						change your mind before anything is removed.
					</p>
				</div>

				{pendingPurgeAfter ? (
					<p
						role="status"
						className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200"
					>
						Your account is scheduled for deletion on{" "}
						<LocalDate value={pendingPurgeAfter} />. Use the Cancel deletion
						button at the top of the page to keep it.
					</p>
				) : (
					<form onSubmit={handleDeletionSubmit} className="space-y-5">
						<div className="space-y-2">
							<label
								htmlFor="delete-password"
								className="block text-sm font-medium text-slate-200"
							>
								Your password
							</label>
							<input
								id="delete-password"
								type="password"
								required
								autoComplete="current-password"
								value={deletePassword}
								onChange={(event) => setDeletePassword(event.target.value)}
								className={inputClassName}
							/>
						</div>

						<div className="space-y-2">
							<label
								htmlFor="delete-email"
								className="block text-sm font-medium text-slate-200"
							>
								Type your email address to confirm
							</label>
							<input
								id="delete-email"
								type="email"
								required
								autoComplete="off"
								placeholder={email}
								value={deleteEmail}
								onChange={(event) => setDeleteEmail(event.target.value)}
								className={inputClassName}
							/>
						</div>

						{deletionError && (
							<p
								role="alert"
								className="rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200"
							>
								{deletionError}
							</p>
						)}

						<div className="flex justify-end border-t border-red-400/20 pt-5">
							<button
								type="submit"
								disabled={requestingDeletion || !deletionReady}
								className="cursor-pointer rounded-lg border border-red-400/30 px-5 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{requestingDeletion ? "Scheduling..." : "Delete my account"}
							</button>
						</div>
					</form>
				)}
			</section>
		</div>
	);
}
