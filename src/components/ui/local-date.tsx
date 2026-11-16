"use client";

import { useEffect, useState } from "react";

type LocalDateProps = {
	value: string;
};

export function LocalDate({ value }: LocalDateProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return <>Unknown</>;
	}

	if (!mounted) {
		return (
			<>
				{new Intl.DateTimeFormat("en-US", {
					dateStyle: "medium",
					timeStyle: "short",
					timeZone: "UTC",
				}).format(date)}
			</>
		);
	}

	return (
		<>
			{new Intl.DateTimeFormat(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(date)}
		</>
	);
}
