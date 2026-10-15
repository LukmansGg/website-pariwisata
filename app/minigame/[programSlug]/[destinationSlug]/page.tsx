import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import MinigamePlay from "./play";

type Props = {
	params: Promise<{ programSlug: string; destinationSlug: string }>;
	searchParams: Promise<{ qr?: string | string[]; source?: string | string[] }>;
};

export default function MinigamePage({ params, searchParams }: Props) {
	return <Suspense fallback={<MinigameLoading />}><MinigameContent params={params} searchParams={searchParams} /></Suspense>;
}

function MinigameLoading() {
	return <main className="grid min-h-dvh place-items-center bg-[#102F43] p-4 text-white"><section className="w-full max-w-3xl animate-pulse rounded-[2rem] border border-white/15 bg-white/10 p-5 sm:p-8"><div className="h-3 w-36 rounded bg-white/20" /><div className="mt-4 h-9 w-64 max-w-full rounded-xl bg-white/20" /><div className="mt-3 h-4 w-full max-w-xl rounded bg-white/10" /><div className="mt-8 h-40 rounded-3xl bg-white/10" /><div className="mt-4 h-24 rounded-3xl bg-white/10" /></section></main>;
}

async function MinigameContent({ params, searchParams }: Props) {
	await connection();
	const [{ programSlug, destinationSlug }, query] = await Promise.all([params, searchParams]);
	const qr = Array.isArray(query.qr) ? query.qr[0] : query.qr;
	const sourceParam = Array.isArray(query.source) ? query.source[0] : query.source;
	const supabase = await createClient();
	const { data: destination } = await supabase.from("destinations")
		.select("id,slug,name,description,short_description,address,tags,mascot_mode,mascot_image_url")
		.eq("slug", destinationSlug).eq("is_published", true).maybeSingle();
	if (!destination) notFound();
	return <MinigamePlay programSlug={programSlug} destination={destination} initialQrCode={qr} initialQrSource={sourceParam === "camera" ? "camera" : "qr_link"} />;
}
