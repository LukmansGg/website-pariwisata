import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import DestinationDashboard from "./destination-dashboard";

type PageProps = {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ qr?: string | string[]; game?: string | string[]; source?: string | string[] }>;
};

export default function DestinationPage({ params, searchParams }: PageProps) {
	return (
		<Suspense
			fallback={
				<main className="flex min-h-screen items-center justify-center bg-[#EAF6FC] dark:bg-[#06172A]">
					<p>Memuat dashboard wisata...</p>
				</main>
			}>
			<DestinationContent params={params} searchParams={searchParams} />
		</Suspense>
	);
}

async function DestinationContent({ params, searchParams }: PageProps) {
	await connection();

	const [{ slug }, query] = await Promise.all([params, searchParams]);
	const supabase = await createClient();

	const destinationQuery = await supabase
		.from("destinations")
		.select("id, slug, name, description, short_description, category, categories, address, latitude, longitude, image_url, tags, mascot_mode, mascot_image_url")
		.eq("slug", slug)
		.eq("is_published", true)
		.not("image_url", "is", null)
		.not("latitude", "is", null)
		.not("longitude", "is", null)
		.maybeSingle();
	type DestinationRow = {
		id: string; slug: string; name: string; description: string; short_description: string | null;
		category: string | null; categories: string[] | null; address: string | null; latitude: number | null;
		longitude: number | null; image_url: string | null; tags: string[] | null;
		mascot_mode?: "tiloc" | "custom" | null; mascot_image_url?: string | null;
	};
	let destination = destinationQuery.data as DestinationRow | null;
	let error = destinationQuery.error;
	if (error?.code === "42703") {
		const legacyQuery = await supabase
			.from("destinations")
			.select("id, slug, name, description, short_description, category, categories, address, latitude, longitude, image_url, tags")
			.eq("slug", slug).eq("is_published", true).not("image_url", "is", null)
			.not("latitude", "is", null).not("longitude", "is", null).maybeSingle();
		destination = legacyQuery.data as DestinationRow | null;
		error = legacyQuery.error;
	}

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
	const sourceParam = Array.isArray(query.source) ? query.source[0] : query.source;
	const initialQrSource = sourceParam === "camera" ? "camera" : "qr_link";
	const { data: gameState } = await supabase.rpc("get_public_minigame_state", { p_destination_slug: slug });
	const programs = Array.isArray(gameState?.programs) ? gameState.programs as { components?: string[] }[] : [];
	const chatAiEnabled = programs.length ? programs.some((program) => program.components?.includes("chat_ai")) : true;
	return <DestinationDashboard destination={{ ...destination, mascot_mode: destination.mascot_mode === "custom" ? "custom" : "tiloc", mascot_image_url: destination.mascot_image_url ?? null }} initialQrCode={initialQrCode} initialQrSource={initialQrSource} chatAiEnabled={chatAiEnabled} />;
}
