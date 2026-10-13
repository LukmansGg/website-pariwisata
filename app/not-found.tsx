import type { Metadata } from "next";
import { NotFoundView } from "@/src/components/not-found-view";

export const metadata: Metadata = { title: "Halaman tidak ditemukan · MadiunTrip", robots: { index: false, follow: false } };

export default function NotFound() {
	return <NotFoundView />;
}
