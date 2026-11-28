import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
	variable: "--font-plex-sans",
	subsets: ["latin"],
	weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
	variable: "--font-plex-mono",
	subsets: ["latin"],
	weight: ["400", "500"],
});

export const metadata: Metadata = {
	title: {
		default: "Sentinel | API Monitoring",
		template: "%s | Sentinel",
	},
	description:
		"Monitor API endpoints, track service reliability, and identify availability issues with Sentinel.",
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
		{ media: "(prefers-color-scheme: dark)", color: "#0d0f12" },
	],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="en"
			className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
		>
			<body className="flex min-h-full flex-col">{children}</body>
		</html>
	);
}
