import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import PhotoboxStudio from "./studio";

type Props = { params: Promise<{ programSlug: string; destinationSlug: string }> };

export default function PhotoboxPage({ params }: Props) {
	return <Suspense fallback={<PhotoboxLoading />}><PhotoboxContent params={params} /></Suspense>;
}

function PhotoboxLoading() {
	return <main className="grid min-h-dvh place-items-center bg-[linear-gradient(180deg,#78B3CE_0%,#C9E6F0_52%,#F5F8FA_100%)] p-4 text-[#173B5E]"><section className="grid w-full max-w-6xl animate-pulse gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.8fr)]"><div className="min-h-[55dvh] rounded-[2rem] border border-white/60 bg-white/35 shadow-xl backdrop-blur-xl sm:min-h-[72dvh]" /><div className="space-y-4 rounded-[2rem] border border-white/60 bg-white/45 p-5 shadow-xl backdrop-blur-xl"><div className="h-4 w-32 rounded bg-white/55" /><div className="h-8 w-56 max-w-full rounded-xl bg-white/55" /><div className="h-32 rounded-2xl bg-white/40" /><div className="h-14 rounded-2xl bg-white/40" /><div className="h-12 rounded-xl bg-white/55" /></div></section></main>;
}

async function PhotoboxContent({ params }: Props) {
	await connection();
	const { programSlug, destinationSlug } = await params;
	const supabase = await createClient();
	const { data: destination } = await supabase.from("destinations")
		.select("slug,name,description,address,tags,mascot_mode,mascot_image_url")
		.eq("slug", destinationSlug).eq("is_published", true).maybeSingle();
	if (!destination) notFound();
	return <PhotoboxStudio programSlug={programSlug} destination={destination} />;
}
