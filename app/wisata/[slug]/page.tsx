import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import DestinationDashboard from "./destination-dashboard";

type PageProps = {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ qr?: string | string[] }>;
};

export default function DestinationPage({ params, searchParams }: PageProps) {
	return (
		<Suspense
			fallback={
				<main className="flex min-h-screen items-center justify-center bg-[#F5EEDD]">
					<p>Memuat dashboard wisata...</p>
				</main>
			}>
			<DestinationContent params={params} searchParams={searchParams} />
		</Suspense>
	);
}

async function DestinationContent({ params }: PageProps) {
	await connection();

	const [{ slug }, query] = await Promise.all([params, searchParams]);
	const supabase = await createClient();

	const { data: destination, error } = await supabase
		.from("destinations")
		.select("id, slug, name, description, short_description, category, categories, address, latitude, longitude, image_url, tags, additional_minigames")
		.eq("slug", slug)
		.eq("is_published", true)
		.not("image_url", "is", null)
		.not("latitude", "is", null)
		.not("longitude", "is", null)
		.maybeSingle();

	if (error) {
		console.error("Gagal mengambil destinasi:", error);
		return (
			<main className="p-8 text-center">
				<h1 className="text-xl font-bold">Gagal memuat destinasi</h1>
				<p>Periksa koneksi Supabase dan konfigurasi RLS.</p>
			</main>
		);
	}

	if (!destination) {
		notFound();
	}

	const initialQrCode = Array.isArray(query.qr) ? query.qr[0] : query.qr;
	return <DestinationDashboard destination={destination} initialQrCode={initialQrCode} />;
}
