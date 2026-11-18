export default function DashboardLoading() {
	return (
		<div className="space-y-8 animate-pulse">
			<div className="space-y-2">
				<div className="h-7 w-48 rounded bg-slate-800" />
				<div className="h-4 w-72 max-w-full rounded bg-slate-800" />
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{["first", "second", "third"].map((item) => (
					<div
						key={item}
						className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"
					>
						<div className="h-5 w-32 rounded bg-slate-800" />
						<div className="mt-6 h-8 w-24 rounded bg-slate-800" />
						<div className="mt-3 h-4 w-40 rounded bg-slate-800" />
					</div>
				))}
			</div>

			<div className="space-y-3">
				<div className="h-5 w-40 rounded bg-slate-800" />
				<div className="h-20 rounded-xl border border-slate-800 bg-slate-900/50" />
				<div className="h-20 rounded-xl border border-slate-800 bg-slate-900/50" />
			</div>
		</div>
	);
}
