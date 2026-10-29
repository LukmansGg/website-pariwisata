"use client";

import { useEffect, useState } from "react";
import { CampaignFormExperience } from "@/src/components/campaign-form-experience";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { useTheme } from "@/src/components/theme-provider";

type Campaign = { id: string; title: string; description: string; imageUrl: string | null; placementMode: string; displayChance: number; ctaLabel: string | null; ctaUrl: string | null };

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
	function dismiss() {
		if (campaign) {
			try {
				const key = `mt_campaign_system_seen:${pageKey}`;
				const seen = JSON.parse(sessionStorage.getItem(key) || "[]") as unknown;
				const ids = Array.isArray(seen) ? seen.filter((item): item is string => typeof item === "string") : [];
				if (!ids.includes(campaign.id)) sessionStorage.setItem(key, JSON.stringify([...ids, campaign.id]));
			} catch { /* The prompt can still be closed if storage is unavailable. */ }
		}
		setOpen(false);
	}
	if (!open || !campaign) return null;
	return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
		<section role="dialog" aria-modal="true" aria-labelledby="system-campaign-title" className={`relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[1.8rem] border p-5 shadow-2xl sm:p-7 ${isDark ? "border-sky-200/20 bg-gradient-to-br from-[#0e3554] to-[#071b30] text-sky-50" : "border-white/80 bg-[#F5EEDD] text-[#16587B]"}`}>
			<button type="button" onClick={dismiss} aria-label="Tutup campaign" className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-xl font-bold ${isDark ? "bg-white/10 text-sky-50" : "bg-white text-[#16587B]"}`}>×</button>
			<p className={`text-[9px] font-black uppercase tracking-[.18em] ${isDark ? "text-sky-200/65" : "text-sky-700"}`}>{pageKey === "home" ? "Masukan untuk website TiLoc!" : "Info & pilihan dari TiLoc!"}</p>
			{campaign.imageUrl && <img src={campaign.imageUrl} alt="" className="mt-3 max-h-44 w-full rounded-2xl object-cover"/>}
			<h2 id="system-campaign-title" className="mt-3 pr-8 text-2xl font-black">{campaign.title}</h2>
			{campaign.description && <p className={`mt-2 whitespace-pre-line text-sm leading-6 ${isDark ? "text-sky-100/75" : "text-[#16587B]/75"}`}>{campaign.description}</p>}
			<div className="mt-5 space-y-2"><button type="button" onClick={dismiss} className={`min-h-11 w-full rounded-xl border px-3 text-xs font-bold ${isDark ? "border-sky-200/20 bg-white/10 text-sky-50" : "border-[#84B3CE]/40 bg-white text-[#16587B]"}`}>Nanti saja</button><CampaignFormExperience campaignId={campaign.id} pageKey={pageKey} destinationSlug="" fallbackHref={campaign.ctaUrl || "/"} fallbackLabel={campaign.ctaLabel || "Lihat informasi"} onNavigate={dismiss}/></div>
		</section>
	</div>;
}
