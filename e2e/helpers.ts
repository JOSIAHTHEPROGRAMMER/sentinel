import { expect, type Page } from "@playwright/test";
import { newE2eEmail } from "./db";

export const PASSWORD = "e2e-password-123";

export async function signUp(page: Page, name = "E2E User") {
	const email = newE2eEmail();

	await page.goto("/sign-up");
	await page.getByLabel("Name").fill(name);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(PASSWORD);
	await page.getByRole("button", { name: "Create account" }).click();

	await expect(page).toHaveURL(/\/dashboard/);

	return { email, name };
}

export async function signOut(page: Page) {
	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/sign-in/);
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
	await page.goto("/sign-in");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();

	await expect(page).toHaveURL(/\/dashboard/);
}
