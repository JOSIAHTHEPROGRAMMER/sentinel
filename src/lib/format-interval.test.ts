import { describe, expect, it } from "vitest";
import { formatInterval } from "./format-interval";

describe("formatInterval", () => {
	it("formats whole hours with the right plural", () => {
		expect(formatInterval(3600)).toBe("1 hour");
		expect(formatInterval(7200)).toBe("2 hours");
	});

	it("formats whole minutes", () => {
		expect(formatInterval(60)).toBe("1 min");
		expect(formatInterval(300)).toBe("5 min");
	});

	it("falls back to seconds", () => {
		expect(formatInterval(45)).toBe("45 sec");
		expect(formatInterval(1.5)).toBe("1.5 sec");
		expect(formatInterval(90)).toBe("90 sec");
	});
});
