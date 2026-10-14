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
	return <main className="grid min-h-dvh place-items-center bg-[#111c2b] p-4 text-white"><section className="grid w-full max-w-6xl animate-pulse gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,.8fr)]"><div className="min-h-[55dvh] rounded-[2rem] bg-white/10 sm:min-h-[72dvh]" /><div className="space-y-4 rounded-[2rem] border border-white/10 bg-white/5 p-5"><div className="h-4 w-32 rounded bg-white/15" /><div className="h-8 w-56 max-w-full rounded-xl bg-white/15" /><div className="h-32 rounded-2xl bg-white/10" /><div className="h-14 rounded-2xl bg-white/10" /><div className="h-12 rounded-xl bg-white/15" /></div></section></main>;
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
