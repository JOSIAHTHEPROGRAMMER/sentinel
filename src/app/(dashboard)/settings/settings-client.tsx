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

type SettingsClientProps = {
	name: string;
	email: string;
	createdAt: string;
};

const inputClassName =
	"w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400";

export default function SettingsClient({
	name: initialName,
	email,
	createdAt,
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

	return (
		<div className="mx-auto max-w-3xl space-y-8">
			<div>
				<p className="mt-6 text-sm font-medium text-cyan-300">ACCOUNT</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
					Settings
				</h1>
				<p className="mt-3 text-sm leading-6 text-slate-400">
					Manage your profile and keep your account secure.
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
		</div>
	);
}
