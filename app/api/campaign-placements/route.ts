import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

const systemPages = new Set(["home", "scan", "destination", "minigame", "photobox"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function publicImage(value: unknown) {
	if (typeof value !== "string") return null;
	try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; }
	catch { return null; }
}

function publicCta(value: unknown) {
	if (typeof value !== "string") return null;
	if (/^\/(?!\/)[^\s\\]*$/.test(value)) return value;
	return publicImage(value);
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const destinationSlug = url.searchParams.get("destinationSlug")?.trim() ?? "";
	const systemPage = url.searchParams.get("systemPage") ?? (destinationSlug ? "destination" : "");
	if (destinationSlug && !slugPattern.test(destinationSlug)) return NextResponse.json({ campaigns: [] }, { status: 400 });
	if (!systemPages.has(systemPage)) return NextResponse.json({ campaigns: [] }, { status: 400 });
	try {
		const supabase = await createClient();
		let data: { id: string; title: string; description: string; image_url: string | null; experience_type: "popup" | "minigame" | "photobox"; placement_mode: string; exposure_mode: "chance" | "always"; display_chance: number; cta_label: string | null; cta_url: string | null; starts_at: string | null; ends_at: string | null; system_pages: string[] }[] = [];
		const selectFields = "id,title,description,image_url,experience_type,placement_mode,exposure_mode,display_chance,cta_label,cta_url,starts_at,ends_at,system_pages";
		if (destinationSlug) {
			const { data: destination, error: destinationError } = await supabase.from("destinations").select("id").eq("slug", destinationSlug).eq("is_published", true).maybeSingle();
			if (destinationError) throw destinationError;
			if (!destination) return NextResponse.json({ campaigns: [] }, { headers: { "Cache-Control": "no-store" } });
			const { data: targets, error: targetError } = await supabase.from("promotion_campaign_destinations").select("campaign_id").eq("destination_id", destination.id);
			if (targetError) throw targetError;
			const campaignIds = [...new Set((targets ?? []).map((row) => row.campaign_id))];
			const targeted = campaignIds.length
				? await supabase.from("promotion_campaigns").select(selectFields).eq("status", "published").in("id", campaignIds).in("placement_mode", ["nearby", "destination_feedback"])
				: { data: [], error: null };
			if (targeted.error) throw targeted.error;
			data = targeted.data ?? [];
		}
		const { data: globalCampaigns, error: globalError } = await supabase.from("promotion_campaigns").select(selectFields)
			.eq("status", "published").in("placement_mode", ["system", "website_feedback"]).contains("system_pages", [systemPage]);
		if (globalError) throw globalError;
		data = [...data, ...(globalCampaigns ?? [])];
		const now = Date.now();
		const campaigns = [...new Map(data.filter((campaign) => (!campaign.starts_at || Date.parse(campaign.starts_at) <= now) && (!campaign.ends_at || Date.parse(campaign.ends_at) > now)).map((campaign) => [campaign.id, campaign])).values()]
			.map((campaign) => ({
				id: campaign.id, title: campaign.title, description: campaign.description, imageUrl: publicImage(campaign.image_url),
				experienceType: campaign.experience_type, placementMode: campaign.placement_mode, exposureMode: campaign.exposure_mode,
				displayChance: campaign.exposure_mode === "always" ? 100 : campaign.display_chance,
				ctaLabel: campaign.cta_label, ctaUrl: publicCta(campaign.cta_url),
			}));
		return NextResponse.json({ campaigns }, { headers: { "Cache-Control": "no-store, max-age=0" } });
	} catch (error) {
		console.error("Campaign placements could not be loaded", { code: (error as { code?: string })?.code });
		return NextResponse.json({ campaigns: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
	}
}
