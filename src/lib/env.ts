type Env = Record<string, string | undefined>;

const REQUIRED_ALWAYS = [
	"DATABASE_URL",
	"BETTER_AUTH_SECRET",
	"BETTER_AUTH_URL",
] as const;

const REQUIRED_IN_PRODUCTION = [
	"UPSTASH_REDIS_REST_URL",
	"UPSTASH_REDIS_REST_TOKEN",
] as const;

const MIN_PRODUCTION_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRET_PATTERN = /replace-with|changeme|your-secret/i;

export function validateWebEnv(env: Env): string[] {
	const problems: string[] = [];
	const production = env.NODE_ENV === "production";

	const required = production
		? [...REQUIRED_ALWAYS, ...REQUIRED_IN_PRODUCTION]
		: REQUIRED_ALWAYS;

	for (const name of required) {
		if (!env[name]?.trim()) {
			problems.push(`${name} is not set`);
		}
	}

	const secret = env.BETTER_AUTH_SECRET?.trim();

	if (production && secret) {
		if (secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
			problems.push(
				`BETTER_AUTH_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`,
			);
		}

		if (PLACEHOLDER_SECRET_PATTERN.test(secret)) {
			problems.push("BETTER_AUTH_SECRET looks like a placeholder value");
		}
	}

	return problems;
}

export function assertWebEnv(env: Env = process.env): void {
	const problems = validateWebEnv(env);

	if (problems.length > 0) {
		throw new Error(
			`Invalid environment configuration:\n- ${problems.join("\n- ")}`,
		);
	}
}
