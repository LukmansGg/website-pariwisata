import { getCachedPublishedCampaigns } from "@/src/server/campaigns/public";
import { resolveCampaignAppearance } from "@/src/features/campaigns/appearance";

function safeHttpUrl(value: unknown) {
	if (typeof value !== "string" || !value.trim()) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
	} catch {
		return null;
	}
}

function safeCtaUrl(value: unknown) {
	if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) return value;
	return safeHttpUrl(value);
}

export async function GET() {
	try {
		const now = Date.now();
		const campaigns = await getCachedPublishedCampaigns();
		const activeCampaigns = campaigns
			.filter((campaign) => {
				const startsAt = campaign.starts_at ? Date.parse(campaign.starts_at) : null;
				const endsAt = campaign.ends_at ? Date.parse(campaign.ends_at) : null;
				return (startsAt === null || startsAt <= now) && (endsAt === null || endsAt > now);
			})
			.map((campaign) => ({
				id: campaign.id,
				title: campaign.title,
				description: campaign.description,
				imageUrl: safeHttpUrl(campaign.image_url),
				experienceType: campaign.experience_type,
				appearance: resolveCampaignAppearance(campaign.form_appearance, "promo"),
				displayChance: campaign.exposure_mode === "always" ? 100 : campaign.display_chance,
				ctaLabel: campaign.cta_label,
				ctaUrl: safeCtaUrl(campaign.cta_url) ?? "/scan",
			}));

		return Response.json({ campaigns: activeCampaigns }, {
			headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" },
		});
	} catch {
		return Response.json({ campaigns: [] }, {
			status: 503,
			headers: { "Cache-Control": "no-store" },
		});
	}
}
