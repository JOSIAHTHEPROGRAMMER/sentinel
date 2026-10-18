# Sentinel

Sentinel is an API monitoring platform built with Next.js, TypeScript, PostgreSQL, and Drizzle ORM. It provides authenticated monitor management, secure database access, URL validation, and the foundation for automated availability checks and incident tracking.

## Tech Stack

- **Framework:** Next.js 16
- **Language:** TypeScript
- **UI:** React and Tailwind CSS
- **Authentication:** Better Auth
- **Database:** PostgreSQL with Neon
- **ORM and migrations:** Drizzle ORM and Drizzle Kit
- **HTTP monitoring:** Undici
- **Validation and testing:** Vitest and Biome

## Getting Started

### Prerequisites

- Node.js 24
- npm
- A Neon PostgreSQL database

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example environment file:

**PowerShell**

```powershell
Copy-Item .env.example .env.local
```

Update `.env.local` with your own configuration:

| Variable                 | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `BETTER_AUTH_URL`        | Base URL of the application, such as `http://localhost:3000` |
| `BETTER_AUTH_SECRET`     | Secret used by Better Auth                                   |
| `DATABASE_URL`           | Pooled PostgreSQL connection string for application queries  |
| `MIGRATION_DATABASE_URL` | Direct PostgreSQL connection string for database migrations  |

Use separate database credentials with only the permissions required for each role. Keep SSL certificate and hostname verification enabled.

**Never commit `.env.local` or expose database credentials and authentication secrets.**

### 3. Apply database migrations

```bash
npx drizzle-kit migrate
```

Ensure both database connection strings are configured before running migrations.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

| Command          | Description                          |
| ---------------- | ------------------------------------ |
| `npm run dev`    | Start the Next.js development server |
| `npm run build`  | Build the application for production |
| `npm run start`  | Start the production server          |
| `npm run format` | Format project files                 |
| `npm run check`  | Run Biome checks                     |
| `npm run lint`   | Run Biome linting                    |
| `npm test`       | Run the Vitest test suite            |

## Security

Sentinel uses PostgreSQL Row-Level Security (RLS) to restrict access to user-owned application data. Server-side database operations establish the authenticated user's context before accessing protected records.

Monitor target validation checks URL schemes, credentials, local hostnames, and resolved IP addresses to help mitigate server-side request forgery (SSRF).

Database credentials and authentication secrets must remain server-side and must not be exposed to the browser or committed to version control.

## Project Status

The project currently includes authentication and database foundations, protected monitor management endpoints, database ownership policies, and monitor-target validation. HTTP check execution and result/incident persistence are under development, followed by recurring scheduling and the monitoring dashboard.

## Development

Before submitting changes, run the project's formatting, static checks, production build, and tests.

```bash
npm run format
npm run check
npm run build
npm test
```
