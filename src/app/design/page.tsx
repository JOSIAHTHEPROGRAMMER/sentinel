import { notFound } from "next/navigation";
import { DesignClient } from "./design-client";

// Temporary component preview. Removed before the redesign is finished.
export default function DesignPage() {
	if (process.env.NODE_ENV === "production") {
		notFound();
	}

	return <DesignClient />;
}
