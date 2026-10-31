"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { CampaignFormExperience } from "@/src/components/campaign-form-experience";
import { CampaignPopupShell } from "@/src/components/campaign-popup-shell";
import type { CampaignAppearance } from "@/src/features/campaigns/appearance";

type Campaign = {
	id: string;
	title: string;
	description: string;
	imageUrl: string | null;
	experienceType: "popup" | "minigame" | "photobox";
	placementMode: "nearby" | "destination_feedback" | "website_feedback" | "system";
	exposureMode: "chance" | "always";
	displayChance: number;
	ctaLabel: string | null;
	ctaUrl: string | null;
	appearance: CampaignAppearance;
};
type Props = { destinationSlug: string; active: boolean; dark?: boolean; systemPage?: "destination" | "minigame" | "photobox" };

const DISPLAY_DELAY_MS = 4_500;
const MAX_VISIBLE_NOTICES = 3;

function seenStorageKey(destinationSlug: string, systemPage: string) {
	return `mt_campaign_seen:${destinationSlug}:${systemPage}`;
}

function getSeenCampaigns(key: string) {
	try {
		const parsed: unknown = JSON.parse(sessionStorage.getItem(key) || "[]");
		return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
	} catch {
		return new Set<string>();
	}
}

function rememberCampaigns(key: string, ids: string[]) {
	try {
		const current = getSeenCampaigns(key);
		ids.forEach((id) => current.add(id));
		sessionStorage.setItem(key, JSON.stringify([...current]));
	} catch { /* The in-memory queue still prevents repeat notices on this page. */ }
}

function campaignKind(campaign: Campaign) {
	if (campaign.appearance.preset === "rating" || campaign.placementMode === "destination_feedback" || campaign.placementMode === "website_feedback") {
		return { icon: "★", label: "Ulasan singkat", button: "Beri nilai" };
	}
	if (campaign.placementMode === "system") return { icon: "✦", label: "Info TiLoc!", button: campaign.ctaLabel || "Lihat info" };
	if (campaign.experienceType === "photobox") return { icon: "📸", label: "Frame spesial", button: campaign.ctaLabel || "Lihat" };
	return { icon: "🎉", label: "Ada cerita baru", button: campaign.ctaLabel || "Lihat" };
}

export default function NearbyCampaignPopup({ destinationSlug, active, dark = false, systemPage = "destination" }: Props) {
	const [notices, setNotices] = useState<Campaign[]>([]);
	const [campaign, setCampaign] = useState<Campaign | null>(null);
	const displayTimer = useRef<number | null>(null);
	const loadController = useRef<AbortController | null>(null);
	const trackedRef = useRef(new Set<string>());
	const seenKey = seenStorageKey(destinationSlug, systemPage);

	const dismissNotice = useCallback((campaignId: string) => {
		setNotices((current) => current.filter((item) => item.id !== campaignId));
	}, []);

	const dismissCampaign = useCallback(() => {
		if (campaign) dismissNotice(campaign.id);
		setCampaign(null);
	}, [campaign, dismissNotice]);

	useEffect(() => {
		if (!active) return;
		const controller = new AbortController();
		loadController.current = controller;
		void fetch(`/api/campaign-placements?destinationSlug=${encodeURIComponent(destinationSlug)}&systemPage=${systemPage}`, {
			cache: "no-store",
			signal: controller.signal,
		})
			.then(async (response) => {
				const result = await response.json() as { campaigns?: Campaign[] };
				if (!response.ok) throw new Error("Campaign belum dapat dimuat.");
				const items = Array.isArray(result.campaigns) ? result.campaigns : [];
				const seen = getSeenCampaigns(seenKey);
				// `always` is guaranteed by the placement API. Each chance campaign gets
				// its own roll, so multiple eligible notices can form a small queue.
				const eligible = items.filter((item) => !seen.has(item.id) && (
					item.exposureMode === "always" || Math.random() * 100 < Math.max(0, Math.min(100, item.displayChance))
				));
				eligible.sort((a, b) => {
					const ratingOrder = Number(b.appearance.preset === "rating") - Number(a.appearance.preset === "rating");
					const alwaysOrder = Number(b.exposureMode === "always") - Number(a.exposureMode === "always");
					return ratingOrder || alwaysOrder;
				});
				if (!eligible.length) return;
				displayTimer.current = window.setTimeout(() => {
					if (controller.signal.aborted) return;
					setNotices(eligible);
				}, DISPLAY_DELAY_MS);
			})
			.catch((error: unknown) => {
				if (!controller.signal.aborted) console.warn("Campaign notices could not be loaded", error);
			});
		return () => {
			controller.abort();
			if (loadController.current === controller) loadController.current = null;
			if (displayTimer.current !== null) window.clearTimeout(displayTimer.current);
		};
	}, [active, destinationSlug, seenKey, systemPage]);

	useEffect(() => {
		if (!active) setNotices([]);
	}, [active]);

	useEffect(() => {
		if (!active || !notices.length) return;
		const visible = notices.slice(0, MAX_VISIBLE_NOTICES).filter((item) => !trackedRef.current.has(item.id));
		if (!visible.length) return;
		visible.forEach((item) => trackedRef.current.add(item.id));
		rememberCampaigns(seenKey, visible.map((item) => item.id));
		for (const item of visible) {
			void trackVisitorEvent({ eventName: "campaign_impression", pageKey: systemPage, destinationSlug, campaignId: item.id });
		}
	}, [active, destinationSlug, notices, seenKey, systemPage]);

	if (!active && !campaign) return null;
	return <>
		{active && notices.length > 0 && !campaign && <aside aria-label="Info dan ajakan" className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-[80] flex w-[min(19rem,calc(100vw-1.5rem))] flex-col-reverse gap-2 sm:bottom-6 sm:right-6 sm:w-[21rem]">
			{notices.slice(0, MAX_VISIBLE_NOTICES).map((item, index) => {
				const kind = campaignKind(item);
				return <article key={item.id} style={{ animationDelay: `${index * 80}ms` }} className={`campaign-side-notice group relative overflow-hidden rounded-[1.35rem] border p-3.5 shadow-[0_16px_48px_rgba(15,50,75,.2)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(15,50,75,.27)] ${dark ? "border-sky-200/15 bg-gradient-to-br from-[#102f4b]/95 to-[#071a2c]/95 text-sky-50" : "border-white/90 bg-gradient-to-br from-white/95 to-sky-50/95 text-[#16587B]"}`}>
					<div aria-hidden="true" className={`pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl ${dark ? "bg-sky-400/15" : "bg-sky-300/35"}`} />
					<div className="relative flex items-start gap-3">
						<span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[1rem] border text-lg shadow-sm ${item.appearance.preset === "rating" ? dark ? "border-amber-200/20 bg-amber-300/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-500" : dark ? "border-sky-200/15 bg-sky-300/10 text-sky-200" : "border-sky-100 bg-sky-50 text-sky-700"}`} aria-hidden="true">{kind.icon}</span>
						<div className="min-w-0 flex-1 pr-5">
							<p className={`text-[9px] font-black uppercase tracking-[.14em] ${dark ? "text-sky-200/65" : "text-sky-700/65"}`}>{kind.label}</p>
							<h3 className="mt-0.5 line-clamp-1 text-sm font-black leading-5">{item.title}</h3>
							{item.description && <p className={`mt-1 line-clamp-2 text-[10px] leading-4 ${dark ? "text-sky-100/65" : "text-[#16587B]/65"}`}>{item.description}</p>}
							<button type="button" onClick={() => setCampaign(item)} className={`mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[10px] font-black transition hover:gap-2.5 focus-visible:outline-none focus-visible:ring-2 ${item.appearance.preset === "rating" ? dark ? "bg-amber-300 text-slate-950 focus-visible:ring-amber-200" : "bg-amber-400 text-amber-950 focus-visible:ring-amber-300" : dark ? "bg-sky-400 text-slate-950 focus-visible:ring-sky-200" : "bg-sky-700 text-white focus-visible:ring-sky-300"}`}>
								{kind.button}<span aria-hidden="true">→</span>
							</button>
						</div>
						<button type="button" onClick={() => dismissNotice(item.id)} aria-label={`Tutup ${item.title}`} className={`absolute right-0 top-0 grid h-7 w-7 place-items-center rounded-full text-lg leading-none transition hover:rotate-90 ${dark ? "text-sky-100/55 hover:bg-white/10 hover:text-white" : "text-[#16587B]/45 hover:bg-sky-100 hover:text-[#16587B]"}`}>×</button>
					</div>
				</article>;
			})}
			{notices.length > MAX_VISIBLE_NOTICES && <p className={`self-end rounded-full px-3 py-1 text-[9px] font-black shadow-sm ${dark ? "bg-slate-900/85 text-sky-100/70" : "bg-white/90 text-[#16587B]/65"}`}>+{notices.length - MAX_VISIBLE_NOTICES} info lainnya · tutup untuk melihat</p>}
		</aside>}
		{campaign && <CampaignPopupShell title={campaign.title} description={campaign.description} imageUrl={campaign.imageUrl} appearance={campaign.appearance} titleId="nearby-campaign-title" eyebrow={campaign.placementMode === "destination_feedback" ? "Bagikan pengalaman wisata" : campaign.placementMode === "website_feedback" ? "Masukan untuk website TiLoc!" : campaign.placementMode === "system" ? "Info dari TiLoc!" : "Campaign untuk wisata ini"} onDismiss={dismissCampaign}>
			<div className="space-y-2"><button type="button" onClick={dismissCampaign} className={`min-h-11 w-full rounded-xl border px-3 text-xs font-bold transition ${dark ? "border-sky-200/15 bg-white/5 text-sky-100 hover:bg-white/10" : "border-[#84B3CE]/40 bg-white/80 text-[#16587B] hover:bg-white"}`}>Nanti saja</button><CampaignFormExperience campaignId={campaign.id} pageKey={systemPage} destinationSlug={destinationSlug} fallbackHref={campaign.ctaUrl || `/wisata/${encodeURIComponent(destinationSlug)}`} fallbackLabel={campaign.ctaLabel || (campaign.placementMode === "destination_feedback" || campaign.placementMode === "website_feedback" ? "Kirim ulasan" : "Lihat campaign")} onNavigate={dismissCampaign} onAppearanceLoaded={(appearance) => setCampaign((current) => current ? { ...current, appearance } : current)}/></div>
		</CampaignPopupShell>}
	</>;
}
