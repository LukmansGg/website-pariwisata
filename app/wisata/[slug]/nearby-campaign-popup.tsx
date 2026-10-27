"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { CampaignFormExperience } from "@/src/components/campaign-form-experience";

type Campaign = {
	id: string;
	title: string;
	description: string;
	imageUrl: string | null;
	ctaLabel: string | null;
	ctaUrl: string | null;
	experienceType: "popup" | "minigame" | "photobox";
	programSlug?: string | null;
	latitude: number;
	longitude: number;
	maxDistanceMeters: number;
};
type Props = { destinationSlug: string; active: boolean };

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
	const rad = Math.PI / 180;
	const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
	return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

function getPosition() {
	return new Promise<GeolocationPosition>((resolve, reject) => {
		if (!navigator.geolocation) { reject(new Error("NO_GEOLOCATION")); return; }
		navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 });
	});
}

function safeUrl(value: string | null) {
	if (!value) return null;
	if (value.startsWith("/") && !value.startsWith("//")) return value;
	try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; }
	catch { return null; }
}

export default function NearbyCampaignPopup({ destinationSlug, active }: Props) {
	const [campaigns, setCampaigns] = useState<Campaign[]>([]);
	const [campaign, setCampaign] = useState<Campaign | null>(null);
	const [permissionNeeded, setPermissionNeeded] = useState(false);
	const [locationStatus, setLocationStatus] = useState("");
	const timer = useRef<number | null>(null);
	const campaignsRef = useRef<Campaign[]>([]);
	const lastActivityRef = useRef(Date.now());

	const loadCampaigns = useCallback(async () => {
		try {
			const response = await fetch(`/api/minigame/state?destinationSlug=${encodeURIComponent(destinationSlug)}`, { cache: "no-store" });
			const result = await response.json() as { passiveCampaigns?: Campaign[] };
			const items = Array.isArray(result.passiveCampaigns) ? result.passiveCampaigns : [];
			campaignsRef.current = items;
			setCampaigns(items);
			setPermissionNeeded(items.length > 0);
		} catch { /* Campaigns stay quiet if the service is unavailable. */ }
	}, [destinationSlug]);

	const locateCampaign = useCallback(async () => {
		if (campaign || !campaignsRef.current.length) return;
		try {
			const position = await getPosition();
			setPermissionNeeded(false);
			setLocationStatus("");
			let seen = new Set<string>();
			try {
				const parsed: unknown = JSON.parse(sessionStorage.getItem(`mt_campaign_seen:${destinationSlug}`) || "[]");
				if (Array.isArray(parsed)) seen = new Set(parsed.filter((item): item is string => typeof item === "string"));
			} catch { /* Start a fresh session list. */ }
			const nearest = campaignsRef.current
				.filter((item) => !seen.has(item.id))
				.map((item) => ({ item, distance: distanceMeters(position.coords.latitude, position.coords.longitude, item.latitude, item.longitude) }))
				.filter(({ item, distance }) => distance <= item.maxDistanceMeters)
				.sort((a, b) => a.distance - b.distance)[0]?.item;
			if (nearest) {
				setCampaign(nearest);
				void trackVisitorEvent({ eventName: "campaign_impression", pageKey: "destination", destinationSlug, campaignId: nearest.id });
			}
		} catch (error) {
			const geoError = error as GeolocationPositionError;
			if (geoError?.code === 1 || (error instanceof Error && error.message === "NO_GEOLOCATION")) {
				setPermissionNeeded(true);
				setLocationStatus("Izinkan lokasi untuk melihat campaign yang benar-benar dekat dengan titik wisata.");
			}
		}
	}, [campaign, destinationSlug]);

	useEffect(() => {
		if (!active) return;
		void loadCampaigns();
		const schedule = () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => {
				if (Date.now() - lastActivityRef.current >= 45_000) void locateCampaign();
			}, 45_000);
		};
		const activity = () => { lastActivityRef.current = Date.now(); schedule(); };
		const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
		events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
		schedule();
		return () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
			events.forEach((event) => window.removeEventListener(event, activity));
		};
	}, [active, loadCampaigns, locateCampaign]);

	function dismiss() {
		if (campaign) {
			let seen: string[] = [];
			try {
				const parsed: unknown = JSON.parse(sessionStorage.getItem(`mt_campaign_seen:${destinationSlug}`) || "[]");
				if (Array.isArray(parsed)) seen = parsed.filter((item): item is string => typeof item === "string");
			} catch { /* Start a fresh session list. */ }
			if (!seen.includes(campaign.id)) sessionStorage.setItem(`mt_campaign_seen:${destinationSlug}`, JSON.stringify([...seen, campaign.id]));
		}
		setCampaign(null);
	}

	if (!active) return null;
	const campaignUrl = campaign ? safeUrl(campaign.ctaUrl) ?? (campaign.experienceType === "photobox" && campaign.programSlug ? `/photobox/${encodeURIComponent(campaign.programSlug)}/${encodeURIComponent(destinationSlug)}` : `/wisata/${encodeURIComponent(destinationSlug)}`) : null;
	return <>
		{permissionNeeded && !campaigns.length && null}
		{permissionNeeded && campaigns.length > 0 && !campaign && <button type="button" onClick={() => { setLocationStatus("Memeriksa promo sekitar…"); void locateCampaign(); }} className="fixed bottom-4 right-4 z-[65] max-w-[calc(100vw-2rem)] rounded-full border border-white/80 bg-[#16587B] px-4 py-3 text-left text-xs font-bold text-white shadow-xl transition hover:-translate-y-0.5">📍 Tampilkan promo sekitar</button>}
		{locationStatus && !campaign && <p role="status" className="fixed bottom-[4.5rem] right-4 z-[65] max-w-[calc(100vw-2rem)] rounded-xl bg-white px-4 py-3 text-xs font-semibold text-[#16587B] shadow-xl">{locationStatus}</p>}
		{campaign && <div className="fixed inset-0 z-[95] grid place-items-center bg-[#102F43]/65 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}><section role="dialog" aria-modal="true" aria-labelledby="nearby-campaign-title" className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.7rem] border border-white/80 bg-[#F5EEDD] p-5 text-[#16587B] shadow-2xl sm:p-7"><button type="button" onClick={dismiss} aria-label="Tutup campaign" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-xl font-bold">×</button><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#16587B]/55">CAMPAIGN DI DEKATMU</p>{campaign.imageUrl && <img src={campaign.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded-2xl object-cover"/>}<h2 id="nearby-campaign-title" className="mt-3 pr-8 text-2xl font-black">{campaign.title}</h2>{campaign.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#16587B]/75">{campaign.description}</p>}<p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[10px] font-semibold text-[#16587B]/65">Promo ini berada dalam radius {campaign.maxDistanceMeters} m dari QR wisata terdekat. Tidak perlu scan untuk melihatnya.</p><div className="mt-5 space-y-2"><button type="button" onClick={dismiss} className="min-h-11 w-full rounded-xl border border-[#84B3CE]/45 bg-white px-3 text-xs font-bold">Nanti saja</button><CampaignFormExperience campaignId={campaign.id} pageKey="destination" destinationSlug={destinationSlug} fallbackHref={campaignUrl || ""} fallbackLabel={campaign.ctaLabel || (campaign.experienceType === "photobox" ? "Buka Photobox" : "Lihat campaign")} onNavigate={dismiss} /></div></section></div>}
	</>;
}
