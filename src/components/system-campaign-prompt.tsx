"use client";

import { useCallback, useEffect, useState } from "react";
import { CampaignFormExperience } from "@/src/components/campaign-form-experience";
import { CampaignPopupShell } from "@/src/components/campaign-popup-shell";
import type { CampaignAppearance } from "@/src/features/campaigns/appearance";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { useTheme } from "@/src/components/theme-provider";

type Campaign = { id: string; title: string; description: string; imageUrl: string | null; placementMode: string; displayChance: number; ctaLabel: string | null; ctaUrl: string | null; appearance: CampaignAppearance };

export function SystemCampaignPrompt({ pageKey }: { pageKey: "home" | "scan" }) {
	const { isDark } = useTheme();
	const [campaign, setCampaign] = useState<Campaign | null>(null);
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const controller = new AbortController();
		void fetch(`/api/campaign-placements?systemPage=${pageKey}`, { cache: "no-store", signal: controller.signal })
			.then(async (response) => response.ok ? await response.json() as { campaigns?: Campaign[] } : { campaigns: [] })
			.then((result) => {
				if (controller.signal.aborted) return;
				let seenIds = new Set<string>();
				try {
					const seen = JSON.parse(sessionStorage.getItem(`mt_campaign_system_seen:${pageKey}`) || "[]") as unknown;
					if (Array.isArray(seen)) seenIds = new Set(seen.filter((item): item is string => typeof item === "string"));
				} catch { /* Storage is optional. */ }
				const eligible = (Array.isArray(result.campaigns) ? result.campaigns : [])
					.filter((item) => !seenIds.has(item.id))
					.filter((item) => pageKey !== "home" || item.placementMode === "website_feedback")
					.filter((item) => Math.random() * 100 < item.displayChance);
				const selected = eligible[Math.floor(Math.random() * eligible.length)];
				if (!selected) return;
				setCampaign(selected);
				window.setTimeout(() => {
					if (!controller.signal.aborted) {
						setOpen(true);
						void trackVisitorEvent({ eventName: "campaign_impression", pageKey, campaignId: selected.id });
					}
				}, 7000);
			})
			.catch(() => undefined);
		return () => controller.abort();
	}, [pageKey]);
	const dismiss = useCallback(() => {
		if (campaign) {
			try {
				const key = `mt_campaign_system_seen:${pageKey}`;
				const seen = JSON.parse(sessionStorage.getItem(key) || "[]") as unknown;
				const ids = Array.isArray(seen) ? seen.filter((item): item is string => typeof item === "string") : [];
				if (!ids.includes(campaign.id)) sessionStorage.setItem(key, JSON.stringify([...ids, campaign.id]));
			} catch { /* The prompt can still be closed if storage is unavailable. */ }
		}
		setOpen(false);
	}, [campaign, pageKey]);
	if (!open || !campaign) return null;
	return <CampaignPopupShell title={campaign.title} description={campaign.description} imageUrl={campaign.imageUrl} appearance={campaign.appearance} titleId="system-campaign-title" eyebrow={pageKey === "home" ? "Masukan untuk website TiLoc!" : "Info & pilihan dari TiLoc!"} onDismiss={dismiss}>
		<div className="space-y-2"><button type="button" onClick={dismiss} className={`min-h-11 w-full rounded-xl border px-3 text-xs font-bold transition ${isDark ? "border-sky-200/15 bg-white/5 text-sky-100 hover:bg-white/10" : "border-[#84B3CE]/40 bg-white/80 text-[#16587B] hover:bg-white"}`}>Nanti saja</button><CampaignFormExperience campaignId={campaign.id} pageKey={pageKey} destinationSlug="" fallbackHref={campaign.ctaUrl || "/"} fallbackLabel={campaign.ctaLabel || "Lihat informasi"} onNavigate={dismiss} onAppearanceLoaded={(appearance) => setCampaign((current) => current ? { ...current, appearance } : current)}/></div>
	</CampaignPopupShell>;
}
