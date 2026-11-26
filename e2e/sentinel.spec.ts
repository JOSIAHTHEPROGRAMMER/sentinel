import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type SeededMonitor, seedForEmail } from "./db";
import { PASSWORD, signIn, signOut, signUp } from "./helpers";

// One sign-up per group; every test in the group starts signed in.
// Sign-up is rate limited, so only tests that need a fresh account create one
function shareAccount(seed?: (email: string) => Promise<void>) {
  const account = { email: "" };
  let state: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

  // Keep the group in order, in one worker
  test.describe.configure({ mode: "default" });
  test.use({ storageState: async ({}, use) => use(state) });

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    ({ email: account.email } = await signUp(await context.newPage()));
    await seed?.(account.email);
    state = await context.storageState();
    await context.close();
  });

  return account;
}

// A streamed notFound() keeps status 200, so check for Next's noindex tag
async function expectNotFound(page: Page) {
  await expect(
    page.locator('meta[name="robots"][content="noindex"]').first(),
  ).toBeAttached();
}

test.describe("access control", () => {
  test("redirects signed-out visitors to the sign-in page", async ({
    page,
  }) => {
    for (const path of [
      "/dashboard",
      "/monitors",
      "/monitors/new",
      "/projects",
      "/incidents",
      "/settings",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in/);
    }
  });

  test("blocks the API for signed-out requests", async ({ request }) => {
    for (const path of [
      "/api/monitors",
      "/api/projects",
      "/api/incidents",
      "/api/settings",
    ]) {
      const response = await request.get(path);

      expect(response.status(), path).toBe(401);
    }
  });

  test("rejects a wrong password with an error", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("nobody@sentinel-e2e.test");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("sign-up and the first run", () => {
  test("a new account lands on an empty dashboard", async ({ page }) => {
    await signUp(page, "Fresh User");

    await expect(
      page.getByRole("heading", { name: "Monitoring overview" }),
    ).toBeVisible();
    await expect(page.getByText("No monitors yet")).toBeVisible();
  });

  test("rejects a short password on sign-up", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Short Password");
    await page.getByLabel("Email").fill("short@sentinel-e2e.test");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/sign-up/);
  });

  test("signing out and back in keeps the account", async ({ page }) => {
    const { email } = await signUp(page, "Returning User");

    await signOut(page);
    await signIn(page, email);

    await expect(page.getByText("Returning User")).toBeVisible();
  });
});

test.describe("history, incidents and the dashboard", () => {
  let seeded: SeededMonitor[] = [];

  shareAccount(async (email) => {
    seeded = await seedForEmail(email, [
      {
        name: "Payments",
        checks: [
          { minutesAgo: 5, status: "down", latencyMs: 300, httpStatus: 503 },
          { minutesAgo: 20, status: "up", latencyMs: 120 },
          { minutesAgo: 40, status: "up", latencyMs: 140 },
        ],
        incidents: [
          { startedMinutesAgo: 5, reason: "HTTP 503" },
          {
            startedMinutesAgo: 180,
            resolvedMinutesAgo: 120,
            reason: "Request timed out",
          },
        ],
      },
      {
        name: "Search",
        checks: [{ minutesAgo: 10, status: "up", latencyMs: 90 }],
      },
    ]);
  });

  test("the dashboard reflects the seeded checks and incidents", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const main = page.getByRole("main");

    await expect(
      main.getByText("Open incidents", { exact: true }),
    ).toBeVisible();
    await expect(main.getByText("Payments", { exact: true })).toBeVisible();
    await expect(main.getByText("Search", { exact: true })).toBeVisible();

    // Four checks in the last 24 hours, three of them successful
    await expect(main.getByText("3 of 4 checks succeeded")).toBeVisible();
  });

  test("switching the dashboard range changes the URL and keeps the page working", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "7d" }).click();

    await expect(page).toHaveURL(/range=7d/);
    await expect(page.getByRole("button", { name: "7d" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("the monitor page shows the status, history and incidents", async ({
    page,
  }) => {
    const payments = seeded[0];

    await page.goto(`/monitors/${payments?.id}`);

    await expect(page.getByText("Last successful check")).toBeVisible();
    await expect(page.getByText("Last outage")).toBeVisible();

    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByText("HTTP 503").first()).toBeVisible();

    await page.getByRole("tab", { name: "Incidents" }).click();
    await expect(page.getByText("Request timed out")).toBeVisible();
  });

  test("the performance tab supports presets and a custom range", async ({
    page,
  }) => {
    const payments = seeded[0];

    await page.goto(`/monitors/${payments?.id}`);
    await page.getByRole("tab", { name: "Performance" }).click();

    await page.getByRole("button", { name: "7d" }).click();
    await expect(page.getByText("the last 7 days")).toBeVisible();

    await page.getByRole("button", { name: "Custom" }).click();
    await page.getByLabel("From", { exact: true }).fill("2026-11-20T08:00");
    await page.getByLabel("To", { exact: true }).fill("2026-11-20T08:30");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText("at least 1 hour")).toBeVisible();
  });

  test("the incidents page lists them and filters by status", async ({
    page,
  }) => {
    await page.goto("/incidents");

    await expect(page.getByText("HTTP 503")).toBeVisible();
    await expect(page.getByText("Request timed out")).toBeVisible();

    await page.getByRole("button", { name: "open", exact: true }).click();

    await expect(page).toHaveURL(/status=open/);
    await expect(page.getByText("HTTP 503")).toBeVisible();
    await expect(page.getByText("Request timed out")).not.toBeVisible();
  });

  test("opens an incident's detail page from the list", async ({ page }) => {
    await page.goto("/incidents");
    await page.getByRole("link", { name: "Payments" }).first().click();

    await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]{36}$/);
    await expect(page.getByText("What happened")).toBeVisible();
    await expect(page.getByText("Checks during the incident")).toBeVisible();
  });

  test("an unknown incident id gives a not-found page", async ({ page }) => {
    await page.goto("/incidents/00000000-0000-4000-8000-000000000000");
    await expectNotFound(page);
  });
});

// These tests share one account, so each uses its own monitor and project names
test.describe("signed-in features", () => {
  const account = shareAccount();

  test.describe("monitors", () => {
    test("creates a monitor from the form and lists it", async ({ page }) => {
      await page.goto("/monitors/new");
      await page.getByLabel("Monitor name").fill("Checkout API");
      await page.getByLabel("Endpoint URL").fill("https://example.com/health");
      await page.getByRole("button", { name: "Create monitor" }).click();

      await expect(page).toHaveURL(/\/monitors$/);
      await expect(page.getByText("Checkout API")).toBeVisible();
    });

    test("refuses a URL that points at an internal address", async ({
      page,
    }) => {
      await page.goto("/monitors/new");
      await page.getByLabel("Monitor name").fill("Metadata probe");
      await page
        .getByLabel("Endpoint URL")
        .fill("http://169.254.169.254/latest/");
      await page.getByRole("button", { name: "Create monitor" }).click();

      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page).toHaveURL(/\/monitors\/new/);
    });

    test("edits a monitor's settings and keeps them after a reload", async ({
      page,
    }) => {
      const [monitor] = await seedForEmail(account.email, [
        { name: "Editable" },
      ]);

      await page.goto(`/monitors/${monitor?.id}`);
      await page.getByLabel("Check interval (seconds)").fill("120");
      await page.getByLabel("Failures before an incident").fill("3");
      await page.getByLabel("Successes before recovery").fill("2");
      await page.getByRole("button", { name: "Save changes" }).click();

      await expect(page.getByText("Monitor settings saved.")).toBeVisible();

      await page.reload();

      await expect(page.getByLabel("Check interval (seconds)")).toHaveValue(
        "120",
      );
      await expect(page.getByLabel("Failures before an incident")).toHaveValue(
        "3",
      );
      await expect(page.getByLabel("Successes before recovery")).toHaveValue(
        "2",
      );
    });

    test("rejects an out-of-range threshold in the form", async ({ page }) => {
      const [monitor] = await seedForEmail(account.email, [
        { name: "Thresholds" },
      ]);

      await page.goto(`/monitors/${monitor?.id}`);
      await page.getByLabel("Failures before an incident").fill("11");
      await page.getByRole("button", { name: "Save changes" }).click();

      await expect(page.getByRole("alert")).toBeVisible();
    });
  });

  test.describe("projects", () => {
    test("creates, renames and deletes a project without deleting its monitors", async ({
      page,
    }) => {
      const [monitor] = await seedForEmail(account.email, [
        { name: "Inside project" },
      ]);

      await page.goto("/projects");
      await page.getByLabel("Project name").fill("Platform");
      await page.getByRole("button", { name: "Create project" }).click();
      await expect(
        page.getByRole("heading", { name: "Platform" }),
      ).toBeVisible();

      // Assign the seeded monitor to it from the monitor's settings
      await page.goto(`/monitors/${monitor?.id}`);
      await page.getByLabel("Project").selectOption({ label: "Platform" });
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Monitor settings saved.")).toBeVisible();

      await page.goto("/projects");
      await page.getByRole("link", { name: /Platform/ }).click();
      await expect(page.getByText("Inside project")).toBeVisible();

      await page.getByLabel("Project name").fill("Platform renamed");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(
        page.getByRole("heading", { name: "Platform renamed" }),
      ).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Delete project" }).click();

      await expect(page).toHaveURL(/\/projects$/);
      await expect(page.getByText("Platform renamed")).not.toBeVisible();

      // The monitor survives as standalone
      await page.goto("/monitors");
      await expect(page.getByText("Inside project")).toBeVisible();
    });

    test("filters the monitors list by project", async ({ page }) => {
      await seedForEmail(account.email, [{ name: "Loose monitor" }]);

      await page.goto("/monitors");
      await page.getByLabel("Project").selectOption("standalone");

      await expect(page).toHaveURL(/project=standalone/);
      await expect(page.getByText("Loose monitor")).toBeVisible();
    });
  });

  test.describe("settings", () => {
    test("updates the profile name and shows it in the header", async ({
      page,
    }) => {
      await page.goto("/settings");
      await page.getByLabel("Name", { exact: true }).fill("Renamed User");
      await page.getByRole("button", { name: "Save name" }).click();

      await expect(page.getByText("Your name has been updated.")).toBeVisible();
      await expect(page.getByText("Renamed User").first()).toBeVisible();
    });

    test("saves monitoring defaults that new monitors then use", async ({
      page,
    }) => {
      await page.goto("/settings");
      await page.getByLabel("Check interval (seconds)").fill("900");
      await page.getByLabel("Request timeout (milliseconds)").fill("4000");
      await page.getByRole("button", { name: "Save defaults" }).click();
      await expect(
        page.getByText("Your monitoring defaults have been saved."),
      ).toBeVisible();

      await page.goto("/monitors/new");
      await page.getByLabel("Monitor name").fill("Uses defaults");
      await page.getByLabel("Endpoint URL").fill("https://example.com/");
      await page.getByRole("button", { name: "Create monitor" }).click();
      await expect(page).toHaveURL(/\/monitors$/);

      await page.getByText("Uses defaults").click();
      await expect(page.getByLabel("Check interval (seconds)")).toHaveValue(
        "900",
      );
      await expect(
        page.getByLabel("Request timeout (milliseconds)"),
      ).toHaveValue("4000");
    });

    test("keeps the delete button disabled until the email matches", async ({
      page,
    }) => {
      await page.goto("/settings");
      await page.getByLabel("Your password").fill(PASSWORD);
      await page
        .getByLabel("Type your email address to confirm")
        .fill("wrong@x.test");

      await expect(
        page.getByRole("button", { name: "Delete my account" }),
      ).toBeDisabled();
    });
  });
});

// These change the password or delete the account, so each needs its own
test.describe("account changes", () => {
  test("changes the password and signs in with the new one", async ({
    page,
  }) => {
    const { email } = await signUp(page);

    await page.goto("/settings");
    await page.getByLabel("Current password").fill(PASSWORD);
    await page
      .getByLabel("New password", { exact: true })
      .fill("a-brand-new-pass-1");
    await page.getByLabel("Confirm new password").fill("a-brand-new-pass-1");
    await page.getByRole("button", { name: "Change password" }).click();

    await expect(
      page.getByText("Your password has been changed"),
    ).toBeVisible();

    await signOut(page);
    await signIn(page, email, "a-brand-new-pass-1");
  });

  test("schedules an account deletion and lets the user cancel it", async ({
    page,
  }) => {
    const { email } = await signUp(page);

    await page.goto("/settings");
    await page.getByLabel("Your password").fill(PASSWORD);
    await page.getByLabel("Type your email address to confirm").fill(email);
    await page.getByRole("button", { name: "Delete my account" }).click();

    // Every session is signed out, and the sign-in page explains why
    await expect(page).toHaveURL(/\/sign-in\?account=deletion-scheduled/);
    await expect(page.getByText("scheduled for deletion")).toBeVisible();

    await signIn(page, email);
    await expect(page.getByText("scheduled for deletion")).toBeVisible();

    await page.getByRole("button", { name: "Cancel deletion" }).click();
    await expect(page.getByText("scheduled for deletion")).not.toBeVisible();
  });
});

test.describe("two users stay separate", () => {
  test("one user cannot see or open another user's data", async ({
    browser,
  }) => {
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    const alice = await signUp(alicePage, "Alice");
    const [secret] = await seedForEmail(alice.email, [
      {
        name: "Alice secret monitor",
        checks: [{ minutesAgo: 5, status: "down" }],
        incidents: [{ startedMinutesAgo: 5, reason: "Alice outage" }],
      },
    ]);

    await signUp(bobPage, "Bob");

    await bobPage.goto("/monitors");
    await expect(bobPage.getByText("Alice secret monitor")).not.toBeVisible();

    await bobPage.goto("/incidents");
    await expect(bobPage.getByText("Alice outage")).not.toBeVisible();

    await bobPage.goto(`/monitors/${secret?.id}`);
    await expectNotFound(bobPage);
    await expect(bobPage.getByText("Alice secret monitor")).toHaveCount(0);

    await bobPage.goto(`/incidents/${secret?.incidentIds[0]}`);
    await expectNotFound(bobPage);
    await expect(bobPage.getByText("Alice outage")).toHaveCount(0);

    const api = await bobPage.request.get(`/api/monitors/${secret?.id}`);
    expect(api.status()).toBe(404);

    const checksApi = await bobPage.request.get(
      `/api/monitors/${secret?.id}/checks`,
    );
    expect(checksApi.status()).toBe(404);

    await aliceContext.close();
    await bobContext.close();
  });
});
