import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
	parseAnalyticsRange,
	parseCustomWindow,
	type TimeWindow,
	windowForRange,
} from "@/lib/data/analytics-shared";
import { getMonitorChecksData } from "@/lib/data/monitor-checks";

type RouteContext = {
	params: Promise<{ id: string }>;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteContext) {
	const session = await getSession();

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	if (!UUID_PATTERN.test(id)) {
		return NextResponse.json({ error: "Invalid monitor ID" }, { status: 400 });
	}

	const search = new URL(request.url).searchParams;
	const now = Date.now();
	const from = search.get("from") ?? undefined;
	const to = search.get("to") ?? undefined;

	let timeWindow: TimeWindow;
	let range: string;

	if (from !== undefined || to !== undefined) {
		const custom = parseCustomWindow(from, to, now);

		if (!custom.valid) {
			return NextResponse.json({ error: custom.error }, { status: 400 });
		}

		timeWindow = custom.window;
		range = "custom";
	} else {
		const preset = parseAnalyticsRange(search.get("range") ?? undefined);

		timeWindow = windowForRange(preset, now);
		range = preset;
	}

	const result = await getMonitorChecksData(
		session.user.id,
		id,
		timeWindow,
		now,
	);

	if (!result) {
		return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
	}

	return NextResponse.json({
		range,
		windowStart: new Date(timeWindow.startMs).toISOString(),
		windowEnd: new Date(timeWindow.endMs).toISOString(),
		...result,
	});
}
