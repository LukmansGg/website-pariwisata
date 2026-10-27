"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { CampaignFormExperience } from "@/src/components/campaign-form-experience";

type Campaign = {
	id: string; title: string; description: string; imageUrl: string | null; experienceType: "popup" | "minigame" | "photobox";
	placementMode: "nearby" | "destination_feedback" | "website_feedback" | "system"; exposureMode: "chance" | "always"; displayChance: number; ctaLabel: string | null; ctaUrl: string | null;
};
type Props = { destinationSlug: string; active: boolean; systemPage?: "destination" | "minigame" | "photobox" };

export default function NearbyCampaignPopup({ destinationSlug, active, systemPage = "destination" }: Props) {
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

	function dismiss() {
		if (campaign) {
			try {
				const key = `mt_campaign_seen:${destinationSlug}`;
				const parsed: unknown = JSON.parse(sessionStorage.getItem(key) || "[]");
				const seen = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
				if (!seen.includes(campaign.id)) sessionStorage.setItem(key, JSON.stringify([...seen, campaign.id]));
			} catch { /* The current page still remembers the campaign through shownRef. */ }
		}
		setCampaign(null);
	}

	if (!active || !campaigns.length && !campaign) return null;
	return campaign ? <div className="fixed inset-0 z-[95] grid place-items-center bg-[#102F43]/65 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}><section role="dialog" aria-modal="true" aria-labelledby="nearby-campaign-title" className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.7rem] border border-white/80 bg-[#F5EEDD] p-5 text-[#16587B] shadow-2xl sm:p-7"><button type="button" onClick={dismiss} aria-label="Tutup campaign" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-xl font-bold">×</button><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#16587B]/55">{campaign.placementMode === "destination_feedback" ? "BAGIKAN PENGALAMAN WISATA" : campaign.placementMode === "website_feedback" ? "MASUKAN UNTUK WEBSITE TILOC" : campaign.placementMode === "system" ? "INFO DARI TILOC" : "CAMPAIGN UNTUK WISATA INI"}</p>{campaign.imageUrl && <img src={campaign.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded-2xl object-cover"/>}<h2 id="nearby-campaign-title" className="mt-3 pr-8 text-2xl font-black">{campaign.title}</h2>{campaign.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#16587B]/75">{campaign.description}</p>}<div className="mt-5 space-y-2"><button type="button" onClick={dismiss} className="min-h-11 w-full rounded-xl border border-[#84B3CE]/45 bg-white px-3 text-xs font-bold">Nanti saja</button><CampaignFormExperience campaignId={campaign.id} pageKey={systemPage} destinationSlug={destinationSlug} fallbackHref={campaign.ctaUrl || `/wisata/${encodeURIComponent(destinationSlug)}`} fallbackLabel={campaign.ctaLabel || (campaign.placementMode === "destination_feedback" || campaign.placementMode === "website_feedback" ? "Kirim ulasan" : "Lihat campaign")} onNavigate={dismiss}/></div></section></div> : null;
}
