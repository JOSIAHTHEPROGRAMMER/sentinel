//import "server-only";

import { Client } from "undici";
import { validateMonitorTarget } from "../validation/monitor-target";

const CONNECT_TIMEOUT_MS = 3_000;
const HEADERS_TIMEOUT_MS = 5_000;
const BODY_TIMEOUT_MS = 5_000;
//const TOTAL_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;

export type HttpCheckResult = {
	success: boolean;
	statusCode: number | null;
	responseTimeMs: number;
	finalUrl: string;
	error?: string;
};

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
		const target = await validateMonitorTarget(currentUrl);

		if (!target.valid) {
			return failure(target.error);
		}

		const url = new URL(currentUrl);

		const client = new Client(url.origin, {
			connectTimeout: CONNECT_TIMEOUT_MS,
			headersTimeout: HEADERS_TIMEOUT_MS,
			bodyTimeout: BODY_TIMEOUT_MS,
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

			let responseBytes = 0;

			for await (const chunk of response.body) {
				responseBytes += chunk.byteLength;

				if (responseBytes > MAX_RESPONSE_BYTES) {
					response.body.destroy();
					return failure(
						"Response body exceeded the size limit",
						response.statusCode,
					);
				}
			}

			return {
				success: response.statusCode >= 200 && response.statusCode < 400,
				statusCode: response.statusCode,
				responseTimeMs: Date.now() - startedAt,
				finalUrl: currentUrl,
			};
		} catch (error) {
			return failure(
				signal.aborted
					? "Request timed out"
					: error instanceof Error
						? error.message
						: "Request failed",
			);
		} finally {
			await client.destroy().catch(() => {});
		}
	}

	return failure("Maximum redirects exceeded");
}
