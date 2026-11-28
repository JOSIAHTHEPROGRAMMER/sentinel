export function Figure({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div>
			<p className="text-ui text-fg-muted">{label}</p>
			<p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
				{value}
			</p>
			<p className="mt-1 text-ui text-fg-subtle">{detail}</p>
		</div>
	);
}
