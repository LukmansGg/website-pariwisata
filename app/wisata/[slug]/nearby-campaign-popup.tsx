"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { CampaignFormExperience } from "@/src/components/campaign-form-experience";
import { CampaignPopupShell } from "@/src/components/campaign-popup-shell";
import type { CampaignAppearance } from "@/src/features/campaigns/appearance";

type Campaign = {
	id: string; title: string; description: string; imageUrl: string | null; experienceType: "popup" | "minigame" | "photobox";
	placementMode: "nearby" | "destination_feedback" | "website_feedback" | "system"; exposureMode: "chance" | "always"; displayChance: number; ctaLabel: string | null; ctaUrl: string | null; appearance: CampaignAppearance;
};
type Props = { destinationSlug: string; active: boolean; dark?: boolean; systemPage?: "destination" | "minigame" | "photobox" };

export default function NearbyCampaignPopup({ destinationSlug, active, dark = false, systemPage = "destination" }: Props) {
	const [campaigns, setCampaigns] = useState<Campaign[]>([]);
	const [campaign, setCampaign] = useState<Campaign | null>(null);
	const timer = useRef<number | null>(null);
	const campaignRef = useRef<Campaign[]>([]);
	const lastActivityRef = useRef(Date.now());
	const shownRef = useRef(false);

	const loadCampaigns = useCallback(async () => {
		try {
			const response = await fetch(`/api/campaign-placements?destinationSlug=${encodeURIComponent(destinationSlug)}&systemPage=${systemPage}`, { cache: "no-store" });
			const result = await response.json() as { campaigns?: Campaign[] };
			const items = Array.isArray(result.campaigns) ? result.campaigns : [];
			campaignRef.current = items;
			setCampaigns(items);
		} catch { campaignRef.current = []; }
	}, [destinationSlug, systemPage]);

	const maybeShowCampaign = useCallback(() => {
		if (shownRef.current || !campaignRef.current.length) return;
		let seen = new Set<string>();
		try {
			const parsed: unknown = JSON.parse(sessionStorage.getItem(`mt_campaign_seen:${destinationSlug}`) || "[]");
			if (Array.isArray(parsed)) seen = new Set(parsed.filter((item): item is string => typeof item === "string"));
		} catch { /* Ignore broken browser storage and continue with this visit. */ }
		const candidates = campaignRef.current.filter((item) => !seen.has(item.id) && Math.random() * 100 < item.displayChance);
		const chosen = candidates[Math.floor(Math.random() * candidates.length)];
		if (!chosen) return;
		shownRef.current = true;
		setCampaign(chosen);
		void trackVisitorEvent({ eventName: "campaign_impression", pageKey: systemPage, destinationSlug, campaignId: chosen.id });
	}, [destinationSlug, systemPage]);

	useEffect(() => {
		if (!active) return;
		void loadCampaigns();
		const schedule = () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => {
				if (Date.now() - lastActivityRef.current >= 25_000) maybeShowCampaign();
			}, 25_000);
		};
		const activity = () => { lastActivityRef.current = Date.now(); schedule(); };
		const events = ["pointerdown", "keydown", "scroll", "touchstart"];
		events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
		schedule();
		return () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
			events.forEach((event) => window.removeEventListener(event, activity));
		};
	}, [active, loadCampaigns, maybeShowCampaign]);

	const dismiss = useCallback(() => {
		if (campaign) {
			try {
				const key = `mt_campaign_seen:${destinationSlug}`;
				const parsed: unknown = JSON.parse(sessionStorage.getItem(key) || "[]");
				const seen = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
				if (!seen.includes(campaign.id)) sessionStorage.setItem(key, JSON.stringify([...seen, campaign.id]));
			} catch { /* The current page still remembers the campaign through shownRef. */ }
		}
		setCampaign(null);
	}, [campaign, destinationSlug]);

	if (!active || !campaigns.length && !campaign) return null;
	return campaign ? <CampaignPopupShell title={campaign.title} description={campaign.description} imageUrl={campaign.imageUrl} appearance={campaign.appearance} titleId="nearby-campaign-title" eyebrow={campaign.placementMode === "destination_feedback" ? "Bagikan pengalaman wisata" : campaign.placementMode === "website_feedback" ? "Masukan untuk website TiLoc!" : campaign.placementMode === "system" ? "Info dari TiLoc!" : "Campaign untuk wisata ini"} onDismiss={dismiss}>
		<div className="space-y-2"><button type="button" onClick={dismiss} className={`min-h-11 w-full rounded-xl border px-3 text-xs font-bold transition ${dark ? "border-sky-200/15 bg-white/5 text-sky-100 hover:bg-white/10" : "border-[#84B3CE]/40 bg-white/80 text-[#16587B] hover:bg-white"}`}>Nanti saja</button><CampaignFormExperience campaignId={campaign.id} pageKey={systemPage} destinationSlug={destinationSlug} fallbackHref={campaign.ctaUrl || `/wisata/${encodeURIComponent(destinationSlug)}`} fallbackLabel={campaign.ctaLabel || (campaign.placementMode === "destination_feedback" || campaign.placementMode === "website_feedback" ? "Kirim ulasan" : "Lihat campaign")} onNavigate={dismiss} onAppearanceLoaded={(appearance) => setCampaign((current) => current ? { ...current, appearance } : current)}/></div>
	</CampaignPopupShell> : null;
}
