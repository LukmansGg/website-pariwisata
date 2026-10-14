import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import MinigamePlay from "./play";

type Props = { params: Promise<{ programSlug: string; destinationSlug: string }> };

export default async function MinigamePage({ params }: Props) {
	await connection();
	const { programSlug, destinationSlug } = await params;
	const supabase = await createClient();
	const { data: destination } = await supabase.from("destinations")
		.select("id,slug,name,description,short_description,address,tags,mascot_mode,mascot_image_url")
		.eq("slug", destinationSlug).eq("is_published", true).maybeSingle();
	if (!destination) notFound();
	return <MinigamePlay programSlug={programSlug} destination={destination} />;
}
