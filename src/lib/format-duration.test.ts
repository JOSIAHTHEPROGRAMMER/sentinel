import { describe, expect, it } from "vitest";
import { formatDurationMs } from "./format-duration";

describe("formatDurationMs", () => {
	it("formats durations under a minute in seconds", () => {
		expect(formatDurationMs(0)).toBe("0s");
		expect(formatDurationMs(45_000)).toBe("45s");
	});

	it("formats durations under an hour in minutes", () => {
		expect(formatDurationMs(60_000)).toBe("1m");
		expect(formatDurationMs(5 * 60_000)).toBe("5m");
		expect(formatDurationMs(59 * 60_000 + 59_000)).toBe("59m");
	});

	it("formats durations under a day in hours and minutes", () => {
		expect(formatDurationMs(60 * 60_000)).toBe("1h 0m");
		expect(formatDurationMs(125 * 60_000)).toBe("2h 5m");
	});

	it("formats longer durations in days and hours", () => {
		expect(formatDurationMs(26 * 60 * 60_000)).toBe("1d 2h");
		expect(formatDurationMs(72 * 60 * 60_000)).toBe("3d 0h");
	});

	it("clamps negative durations to zero", () => {
		expect(formatDurationMs(-5000)).toBe("0s");
	});
});
