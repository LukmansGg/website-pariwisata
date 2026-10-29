import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/src/components/theme-provider";
import { VisitorExperienceInsights } from "@/src/components/visitor-experience-insights";

export const metadata: Metadata = {
	title: "TiLoc! (Titik Lokasi) — Jelajah Pariwisata Madiun",
	description: "TiLoc! adalah Titik Lokasi untuk menemukan destinasi, cerita, dan pengalaman wisata di Madiun.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="id"
			className="light h-full antialiased"
			data-scroll-behavior="smooth">
			<head>
				<meta name="theme-color" content="#eaf6fc" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
			</head>
                        <body className="min-h-full flex flex-col"><ThemeProvider>{children}<Suspense fallback={null}><VisitorExperienceInsights /></Suspense></ThemeProvider></body>
		</html>
	);
}
