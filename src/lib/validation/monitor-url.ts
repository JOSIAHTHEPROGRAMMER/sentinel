import ipaddr from "ipaddr.js";

const MAX_URL_LENGTH = 2048;

export type MonitorUrlValidation =
	| { valid: true; url: string }
	| { valid: false; error: string };

function isPublicAddress(hostname: string): boolean {
	const normalizedHostname =
		hostname.startsWith("[") && hostname.endsWith("]")
			? hostname.slice(1, -1)
			: hostname;

	let address: ipaddr.IPv4 | ipaddr.IPv6;

	try {
		address = ipaddr.parse(normalizedHostname);
	} catch {
		return true;
	}

	return address.range() === "unicast";
}

export function validateMonitorUrl(value: unknown): MonitorUrlValidation {
	if (typeof value !== "string" || value.trim().length === 0) {
		return { valid: false, error: "A valid URL is required" };
	}

	const input = value.trim();

	if (input.length > MAX_URL_LENGTH) {
		return { valid: false, error: "URL is too long" };
	}

	let parsedUrl: URL;

	try {
		parsedUrl = new URL(input);
	} catch {
		return { valid: false, error: "Invalid URL" };
	}

	const hostname = parsedUrl.hostname.toLowerCase();

	if (
		!["http:", "https:"].includes(parsedUrl.protocol) ||
		parsedUrl.username !== "" ||
		parsedUrl.password !== "" ||
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local") ||
		hostname.endsWith(".internal") ||
		!isPublicAddress(hostname)
	) {
		return { valid: false, error: "URL is not allowed" };
	}

	return { valid: true, url: parsedUrl.toString() };
}
