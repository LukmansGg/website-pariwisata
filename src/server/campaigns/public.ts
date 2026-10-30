import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";

export async function getCachedPublishedCampaigns() {
	"use cache";
	cacheLife("minutes");
	cacheTag("public-campaigns");

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (!supabaseUrl || !publishableKey) {
		throw new Error("Supabase public environment is not configured");
	}

	const supabase = createClient(supabaseUrl, publishableKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data, error } = await supabase
		.from("promotion_campaigns")
		.select("id,title,description,image_url,experience_type,placement_mode,exposure_mode,display_chance,system_pages,cta_label,cta_url,starts_at,ends_at,created_at")
		.eq("status", "published")
		.eq("placement_mode", "system")
		.contains("system_pages", ["home"])
		.order("created_at", { ascending: false })
		.limit(12);

	if (error) throw new Error("Published campaigns could not be loaded");
	const campaigns = data ?? [];
	if (!campaigns.length) return [];
	const { data: appearances } = await supabase
		.from("promotion_campaigns")
		.select("id,form_appearance")
		.in("id", campaigns.map((campaign) => campaign.id));
	const appearanceById = new Map((appearances ?? []).map((row) => [row.id, row.form_appearance]));
	return campaigns.map((campaign) => ({ ...campaign, form_appearance: appearanceById.get(campaign.id) ?? null }));
}
