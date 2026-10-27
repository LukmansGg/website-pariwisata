import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

const eventNames = new Set(["page_view", "destination_view", "feature_use", "campaign_impression", "campaign_click"]);
const pageKeys = new Set(["home", "destination", "minigame", "photobox", "scan", "map", "other"]);
const featureKeys = new Set(["destination_dashboard", "find_friends", "photobox", "chat_ai", "qr_scan", "map", "other"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
	let body: Record<string, unknown>;
	try {
		const parsed = await request.json() as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "Event tidak valid." }, { status: 400 });
		body = parsed as Record<string, unknown>;
	} catch { return NextResponse.json({ error: "Event tidak terbaca." }, { status: 400 }); }

	const eventKey = typeof body.eventKey === "string" ? body.eventKey : "";
	const eventName = typeof body.eventName === "string" ? body.eventName : "";
	const pageKey = typeof body.pageKey === "string" ? body.pageKey : null;
	const featureKey = typeof body.featureKey === "string" ? body.featureKey : null;
	const destinationSlug = typeof body.destinationSlug === "string" ? body.destinationSlug.trim().slice(0, 120) : "";
	const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
	if (!uuidPattern.test(eventKey) || !eventNames.has(eventName) || (pageKey && !pageKeys.has(pageKey))
		|| (featureKey && !featureKeys.has(featureKey))
		|| (eventName === "feature_use" && !featureKey)
		|| (eventName === "destination_view" && !destinationSlug)
		|| (eventName.startsWith("campaign_") && !uuidPattern.test(campaignId))) {
		return NextResponse.json({ error: "Data analitik tidak sesuai." }, { status: 400 });
	}

	try {
		const supabase = await createClient();
		let { data: current } = await supabase.auth.getUser();
		if (!current.user) {
			const { error } = await supabase.auth.signInAnonymously();
			if (error) return NextResponse.json({ error: "Sesi pengunjung belum siap." }, { status: 401 });
			({ data: current } = await supabase.auth.getUser());
		}
		if (!current.user) return NextResponse.json({ error: "Sesi pengunjung belum siap." }, { status: 401 });

		let destinationId: string | null = null;
		if (destinationSlug) {
			const { data: destination, error } = await supabase.from("destinations").select("id").eq("slug", destinationSlug).eq("is_published", true).maybeSingle();
			if (error) throw error;
			if (!destination) return NextResponse.json({ error: "Destinasi tidak tersedia." }, { status: 404 });
			destinationId = destination.id;
		}

		let resolvedCampaignId: string | null = null;
		if (campaignId) {
			const { data: campaign, error } = await supabase.from("promotion_campaigns")
				.select("id, qr_point_id, starts_at, ends_at")
				.eq("id", campaignId).eq("status", "published")
				.maybeSingle();
			if (error) throw error;
			if (!campaign || (campaign.starts_at && new Date(campaign.starts_at).getTime() > Date.now())
				|| (campaign.ends_at && new Date(campaign.ends_at).getTime() <= Date.now())) {
				return NextResponse.json({ error: "Campaign tidak tersedia." }, { status: 404 });
			}
			resolvedCampaignId = campaign.id;
			if (!destinationId) {
				const { data: point } = await supabase.from("qr_points").select("destination_id").eq("id", campaign.qr_point_id).maybeSingle();
				destinationId = point?.destination_id ?? null;
			}
		}

		const { error } = await supabase.from("tourism_visitor_events").upsert({
			visitor_id: current.user.id,
			event_key: eventKey,
			event_name: eventName,
			page_key: pageKey,
			feature_key: featureKey,
			destination_id: destinationId,
			campaign_id: resolvedCampaignId,
		}, { onConflict: "visitor_id,event_key", ignoreDuplicates: true });
		if (error) throw error;
		return NextResponse.json({ status: "recorded" }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		console.error("Visitor analytics event could not be recorded", { code: (error as { code?: string })?.code });
		return NextResponse.json({ error: "Aktivitas belum dapat dicatat." }, { status: 503 });
	}
}
