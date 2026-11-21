//import "server-only";

import { Client } from "undici";
import {
	type MonitorTargetValidation,
	validateMonitorTarget,
} from "../validation/monitor-target";

//const TOTAL_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;

const TIMEOUT_ERROR_CODES = new Set([
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
]);

export type HttpCheckResult = {
	success: boolean;
	statusCode: number | null;
	responseTimeMs: number;
	finalUrl: string;
	error?: string;
};

function describeError(error: unknown, signal: AbortSignal): string {
	if (signal.aborted) {
		return "Request timed out";
	}

	if (error instanceof Error) {
		const code = "code" in error ? error.code : undefined;

		if (typeof code === "string" && TIMEOUT_ERROR_CODES.has(code)) {
			return "Request timed out";
		}

		return error.message;
	}

	return "Request failed";
}

function validateWithinDeadline(
	value: string,
	signal: AbortSignal,
): Promise<MonitorTargetValidation> {
	if (signal.aborted) {
		return Promise.resolve({ valid: false, error: "Request timed out" });
	}

	return new Promise((resolve) => {
		const onAbort = () => resolve({ valid: false, error: "Request timed out" });

		signal.addEventListener("abort", onAbort, { once: true });

		void validateMonitorTarget(value)
			.then(resolve, () =>
				resolve({ valid: false, error: "Unable to resolve hostname" }),
			)
			.finally(() => signal.removeEventListener("abort", onAbort));
	});
}

export async function checkHttpTarget(
	value: string,
	timeoutMs = 10_000,
): Promise<HttpCheckResult> {
	const startedAt = Date.now();
	const signal = AbortSignal.timeout(timeoutMs);
	let currentUrl = value;

	const failure = (
		error: string,
		statusCode: number | null = null,
	): HttpCheckResult => ({
		success: false,
		statusCode,
		responseTimeMs: Date.now() - startedAt,
		finalUrl: currentUrl,
		error,
	});

	for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
		const target = await validateWithinDeadline(currentUrl, signal);

		if (!target.valid) {
			return failure(target.error);
		}

		const url = new URL(currentUrl);

		const client = new Client(url.origin, {
			connectTimeout: timeoutMs,
			headersTimeout: timeoutMs,
			bodyTimeout: timeoutMs,
			connect: {
				lookup(hostname, options, callback) {
					const requestedHostname = hostname
						.replace(/^\[|\]$/g, "")
						.toLowerCase();

					if (requestedHostname !== target.hostname) {
						callback(new Error("Unexpected connection hostname"), "", 0);
						return;
					}

					const addresses = target.addresses.filter(
						(address) => !options.family || options.family === address.family,
					);

					if (options.all) {
						if (addresses.length === 0) {
							callback(new Error("No validated address available"), []);
							return;
						}

						callback(null, addresses);
						return;
					}

					const address = addresses[0];

					if (!address) {
						callback(new Error("No validated address available"), "", 0);
						return;
					}

					callback(null, address.address, address.family);
				},
			},
		});

		try {
			const response = await client.request({
				path: `${url.pathname}${url.search}`,
				method: "GET",
				headers: {
					"user-agent": "Sentinel-Monitor/1.0",
				},
				signal,
			});

			response.body.on("error", () => {});

			const location = response.headers.location;

			if (
				response.statusCode >= 300 &&
				response.statusCode < 400 &&
				typeof location === "string"
			) {
				response.body.destroy();

				if (redirects === MAX_REDIRECTS) {
					return failure("Maximum redirects exceeded", response.statusCode);
				}

				const nextUrl = new URL(location, url);

				if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
					return failure("Redirect protocol is not allowed");
				}

				currentUrl = nextUrl.toString();
				continue;
			}

			// A large body is not a failure; stop reading once the cap is reached
			let responseBytes = 0;

			for await (const chunk of response.body) {
				responseBytes += chunk.byteLength;

				if (responseBytes >= MAX_RESPONSE_BYTES) {
					break;
				}
			}

			return {
				success: response.statusCode >= 200 && response.statusCode < 400,
				statusCode: response.statusCode,
				responseTimeMs: Date.now() - startedAt,
				finalUrl: currentUrl,
			};
		} catch (error) {
			return failure(describeError(error, signal));
		} finally {
			await client.destroy().catch(() => {});
		}
	}

	return failure("Maximum redirects exceeded");
}
