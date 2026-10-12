import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";

export async function getCachedPublishedDestinations() {
	"use cache";
	cacheLife("minutes");
	cacheTag("public-destinations");

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (!supabaseUrl || !publishableKey) {
		throw new Error("Supabase public environment is not configured");
	}

	const supabase = createClient(supabaseUrl, publishableKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data, error } = await supabase
		.from("destinations")
		.select("*")
		.eq("is_published", true)
		.order("created_at", { ascending: false })
		.limit(1000);

	if (error) throw new Error("Published destinations could not be loaded");
	return data ?? [];
}
