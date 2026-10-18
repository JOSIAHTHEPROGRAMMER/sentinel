import "server-only";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export type MonitorTargetValidation =
	| {
			valid: true;
			hostname: string;
			addresses: Array<{
				address: string;
				family: 4 | 6;
			}>;
	  }
	| {
			valid: false;
			error: string;
	  };

function isPublicAddress(value: string): boolean {
	try {
		const address = ipaddr.process(value);

		if (address.range() !== "unicast") {
			return false;
		}

		const blockedRanges =
			address.kind() === "ipv4"
				? [
						"0.0.0.0/8",
						"100.64.0.0/10",
						"192.0.0.0/24",
						"192.0.2.0/24",
						"192.88.99.0/24",
						"198.18.0.0/15",
						"198.51.100.0/24",
						"203.0.113.0/24",
						"240.0.0.0/4",
					]
				: ["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"];

		return !blockedRanges.some((range) =>
			address.match(ipaddr.parseCIDR(range)),
		);
	} catch {
		return false;
	}
}

export async function validateMonitorTarget(
	value: string,
): Promise<MonitorTargetValidation> {
	let url: URL;

	try {
		url = new URL(value);
	} catch {
		return { valid: false, error: "Invalid URL" };
	}

	if (
		(url.protocol !== "http:" && url.protocol !== "https:") ||
		url.username !== "" ||
		url.password !== ""
	) {
		return { valid: false, error: "URL is not allowed" };
	}

	const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

	if (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local") ||
		hostname.endsWith(".internal")
	) {
		return { valid: false, error: "URL is not allowed" };
	}

	try {
		const results = await lookup(hostname, { all: true, verbatim: true });

		if (
			results.length === 0 ||
			results.some((result) => !isPublicAddress(result.address))
		) {
			return { valid: false, error: "URL resolves to a non-public address" };
		}

		return {
			valid: true,
			hostname,
			addresses: results.map((result) => ({
				address: result.address,
				family: result.family as 4 | 6,
			})),
		};
	} catch {
		return { valid: false, error: "Unable to resolve hostname" };
	}
}
