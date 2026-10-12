import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/src/components/theme-provider";

export const metadata: Metadata = {
	title: "MadiunTrip — Jelajah Pariwisata Madiun",
	description: "Temukan destinasi, cerita, dan pengalaman wisata di Madiun.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="id"
			className="h-full antialiased"
			data-scroll-behavior="smooth">
			<body className="min-h-full flex flex-col"><ThemeProvider>{children}</ThemeProvider></body>
		</html>
	);
}
