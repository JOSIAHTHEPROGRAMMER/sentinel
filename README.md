# Sentinel

Sentinel is a self-hosted API monitoring platform built with Next.js, TypeScript, and PostgreSQL. It allows users to register endpoints, monitor their availability, track response times, review check history, and manage incidents when services become unavailable.

The platform uses a separate background worker to execute scheduled HTTP checks, while the web application handles authentication, monitor management, and monitoring data.

## Features

- **Authentication:** Secure user authentication with Better Auth.
- **Monitor management:** Create, view, update, enable, disable, and delete monitors.
- **Automated monitoring:** Background worker executes recurring HTTP availability checks.
- **HTTP status tracking:** Classifies checks as up, down, timeout, or error.
- **Performance metrics:** Displays uptime percentages, average response times, and recent monitoring activity.
- **Check history:** Stores and displays recent monitoring results.
- **Incident management:** Automatically records outages and resolves incidents when services recover.
- **Incident history:** Review open and resolved incidents, including outage duration.
- **Server-side data loading:** Loads initial dashboard data on the server to reduce unnecessary client-side requests.
- **Responsive dashboard:** Provides monitor, performance, and incident management interfaces.

## Tech Stack

| Category               | Technology               |
| ---------------------- | ------------------------ |
| Framework              | Next.js 16               |
| Language               | TypeScript               |
| UI                     | React 19, Tailwind CSS 4 |
| Authentication         | Better Auth              |
| Database               | PostgreSQL with Neon     |
| ORM and migrations     | Drizzle ORM, Drizzle Kit |
| HTTP monitoring        | Undici                   |
| URL and IP validation  | Node.js DNS, ipaddr.js   |
| Testing                | Vitest                   |
| Formatting and linting | Biome                    |
| Background processing  | Dedicated Node.js worker |

## Architecture

Sentinel separates the web application from background monitoring execution.

### Web application

The Next.js application handles:

- User authentication and session management.
- Monitor creation and configuration.
- Protected API endpoints.
- Dashboard statistics and performance data.
- Check history and incident management.

### Monitoring worker

A separate Node.js process handles recurring monitoring tasks.

The worker:

1. Retrieves eligible monitors.
2. Determines which monitors are due for a check.
3. Validates and executes HTTP requests.
4. Records check results.
5. Updates incident state based on service availability.
6. Schedules subsequent checks.

### Database security

Sentinel uses PostgreSQL Row-Level Security (RLS) to enforce user-level data isolation.

The application and background worker use separate database credentials:

- `sentinel_app` handles authenticated application queries.
- `sentinel_worker` handles background monitoring operations.
- `MIGRATION_DATABASE_URL` provides the connection used for schema migrations.

Application queries establish the authenticated user's database context within a transaction before accessing protected records.

## Getting Started

### Prerequisites

- Node.js 24
- npm
- A Neon PostgreSQL database
- Separate database credentials for application and worker access

### 1. Clone the repository

```bash
git clone https://github.com/JOSIAHTHEPROGRAMMER/sentinel.git
cd sentinel
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file:

**PowerShell**

```powershell
Copy-Item .env.example .env.local
```

Configure the following variables in `.env.local`:

| Variable                      | Description                                                  |
| ----------------------------- | ------------------------------------------------------------ |
| `BETTER_AUTH_URL`             | Base URL of the application, such as `http://localhost:3000` |
| `BETTER_AUTH_SECRET`          | Secret used by Better Auth                                   |
| `DATABASE_URL`                | Pooled PostgreSQL connection string for application queries  |
| `MIGRATION_DATABASE_URL`      | Direct PostgreSQL connection string for database migrations  |
| `MONITOR_WORKER_DATABASE_URL` | PostgreSQL connection string for the monitoring worker       |

Use the appropriate database credentials and permissions for each connection. Keep SSL certificate and hostname verification enabled.

**Never commit `.env.local` or expose database credentials and authentication secrets.**

### 4. Apply database migrations

```bash
npx drizzle-kit migrate
```

Ensure the migration database connection is configured before applying migrations.

### 5. Start the web application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Start the monitoring worker

In a separate terminal, run:

```bash
npm run worker
```

The worker requires `MONITOR_WORKER_DATABASE_URL` to be configured.

Both the Next.js application and monitoring worker must be running for automated monitoring to operate during development.

## Available Scripts

| Command          | Description                                |
| ---------------- | ------------------------------------------ |
| `npm run dev`    | Start the Next.js development server       |
| `npm run build`  | Build the application for production       |
| `npm run start`  | Start the production server                |
| `npm run worker` | Start the monitoring worker                |
| `npm run format` | Format project files                       |
| `npm run verify` | Run Biome checks and the Vitest test suite |
| `npm test`       | Run the Vitest test suite                  |

## Security

Security is an important part of Sentinel's architecture.

### Database isolation

- PostgreSQL Row-Level Security restricts access to user-owned application data.
- Authenticated application queries establish user context within database transactions.
- The monitoring worker uses a separate database role with restricted permissions.
- Database credentials are kept server-side.

### SSRF protection

Monitor URLs are validated before being accepted as monitoring targets.

Validation includes:

- Restricting supported URL schemes.
- Rejecting URLs containing embedded credentials.
- Blocking local and private network destinations.
- Resolving hostnames and validating their IP addresses.
- Checking resolved addresses to help prevent server-side request forgery (SSRF).

### Authentication

Better Auth manages user authentication and sessions. Protected application endpoints verify the authenticated session before accessing user- owned resources.

## Project Structure

```text
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── incidents/
│   │   └── monitors/
│   ├── api/
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── layout/
│   └── ui/
├── features/
│   └── checks/
│       └── components/
├── lib/
│   ├── auth/
│   ├── data/
│   ├── db/
│   ├── monitoring/
│   └── validation/
└── worker/
    └── index.ts
```

## Development

Before submitting changes, run the project's verification workflow:

```bash
npm run format
npm run verify
npm run build
```

The verification command runs Biome checks and the Vitest test suite.

## Project Status

Sentinel currently includes:

- Authentication and protected application routes.
- PostgreSQL database schema, migrations, and RLS policies.
- Secure monitor management.
- Monitor target validation and SSRF protections.
- Automated HTTP monitoring through a dedicated worker.
- Check result persistence and monitoring history.
- Uptime and response-time metrics.
- Automatic incident creation and resolution.
- Incident history and filtering.
- Server-side initial data loading across dashboard pages.

Future development will focus on improving reliability, expanding automated testing, deployment, and documentation.

## License

This project is currently developed as a personal software engineering project.
