"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createEventKey, trackVisitorEvent, type VisitorEventName, type VisitorFeatureKey, type VisitorPageKey } from "@/src/features/visitor-insights/events";

type Scope = "website" | "destination";
type RouteInsight = { enabled: boolean; scope: Scope; destinationSlug: string; pageKey: VisitorPageKey; featureKey?: VisitorFeatureKey; eventName: VisitorEventName };

function classifyPath(pathname: string): RouteInsight {
	const parts = pathname.split("/").filter(Boolean).map((part) => {
		try { return decodeURIComponent(part); } catch { return part; }
	});
	if (["ruang-kelola", "login", "api", "auth"].includes(parts[0] ?? "")) {
		return { enabled: false, scope: "website", destinationSlug: "", pageKey: "other", eventName: "page_view" };
	}
	if (parts[0] === "wisata" && parts[1]) {
		return { enabled: true, scope: "destination", destinationSlug: parts[1], pageKey: "destination", featureKey: "destination_dashboard", eventName: "destination_view" };
	}
	if (parts[0] === "minigame" && parts[2]) {
		return { enabled: true, scope: "website", destinationSlug: parts[2], pageKey: "minigame", featureKey: "find_friends", eventName: "feature_use" };
	}
	if (parts[0] === "photobox" && parts[2]) {
		return { enabled: true, scope: "website", destinationSlug: parts[2], pageKey: "photobox", featureKey: "photobox", eventName: "feature_use" };
	}
	if (parts[0] === "scan") {
		return { enabled: true, scope: "website", destinationSlug: "", pageKey: "scan", featureKey: "qr_scan", eventName: "feature_use" };
	}
	if (parts[0] === "mapa" || parts[0] === "peta") {
		return { enabled: true, scope: "website", destinationSlug: "", pageKey: "map", featureKey: "map", eventName: "feature_use" };
	}
	return { enabled: true, scope: "website", destinationSlug: "", pageKey: pathname === "/" ? "home" : "other", eventName: "page_view" };
}

export function VisitorExperienceInsights() {
	const pathname = usePathname();
	const route = useMemo(() => classifyPath(pathname || "/"), [pathname]);
	const targetKey = route.scope + ":" + (route.destinationSlug || "website");
	const [eligibleKey, setEligibleKey] = useState("");
	const [readyKey, setReadyKey] = useState("");
	const [dismissedKey, setDismissedKey] = useState("");
	const [submittedKey, setSubmittedKey] = useState("");
	const [targetName, setTargetName] = useState("");
	const [open, setOpen] = useState(false);
	const [rating, setRating] = useState(0);
	const [suggestion, setSuggestion] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");

	useEffect(() => {
		if (!route.enabled) return;
		void trackVisitorEvent({
			eventName: route.eventName,
			eventKey: createEventKey(),
			pageKey: route.pageKey,
			featureKey: route.featureKey,
			destinationSlug: route.destinationSlug || undefined,
		});
	}, [pathname, route]);

	useEffect(() => {
		setOpen(false);
		setRating(0);
		setSuggestion("");
		setMessage("");
		setEligibleKey("");
		setReadyKey("");
		setTargetName("");
		if (!route.enabled) return;
		const controller = new AbortController();
		const dismissedInTab = (() => {
			try { return sessionStorage.getItem("tiloc-survey-dismissed:" + targetKey) === "1"; }
			catch { return false; }
		})();
		const delay = window.setTimeout(() => { if (!dismissedInTab) setReadyKey(targetKey); }, 45_000);
		const query = new URLSearchParams({ scope: route.scope });
		if (route.destinationSlug) query.set("destinationSlug", route.destinationSlug);
		void fetch("/api/visitor-feedback?" + query.toString(), { cache: "no-store", signal: controller.signal })
			.then(async (response) => {
				const result = await response.json() as { canRespond?: boolean; destinationName?: string };
				if (response.ok && result.canRespond) {
					setEligibleKey(targetKey);
					setTargetName(result.destinationName || "");
				}
			})
			.catch(() => undefined);
		return () => { window.clearTimeout(delay); controller.abort(); };
	}, [route, targetKey]);

	useEffect(() => {
		const handleCampaignSurvey = (event: Event) => {
			const detail = (event as CustomEvent<{ placementMode?: string; destinationSlug?: string }>).detail;
			const matchesWebsite = route.scope === "website" && detail?.placementMode === "website_feedback";
			const matchesDestination = route.scope === "destination" && detail?.placementMode === "destination_feedback" && detail.destinationSlug === route.destinationSlug;
			if (matchesWebsite || matchesDestination) setEligibleKey("");
		};
		window.addEventListener("tiloc:survey-submitted", handleCampaignSurvey);
		return () => window.removeEventListener("tiloc:survey-submitted", handleCampaignSurvey);
	}, [route]);

	if (!route.enabled || eligibleKey !== targetKey || readyKey !== targetKey || dismissedKey === targetKey) return null;
	const scopeLabel = route.scope === "destination" ? "wisata · " + (targetName || "destinasi ini") : "pengalaman website TiLoc!";

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (rating < 1 || busy) return;
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch("/api/visitor-feedback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ scope: route.scope, destinationSlug: route.destinationSlug || undefined, rating, suggestion }),
			});
			const result = await response.json() as { error?: string; status?: string };
			if (!response.ok && response.status !== 409) throw new Error(result.error || "Penilaian belum tersimpan.");
			setSubmittedKey(targetKey);
			setMessage("Terima kasih, masukannya sudah tercatat. ✨");
			window.setTimeout(() => {
				setEligibleKey((current) => current === targetKey ? "" : current);
				setSubmittedKey((current) => current === targetKey ? "" : current);
			}, 3500);
		} catch (error) { setMessage(error instanceof Error ? error.message : "Penilaian belum tersimpan."); }
		finally { setBusy(false); }
	}

	return <aside className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[80] w-[min(23rem,calc(100vw-2rem))] text-[#123B56]">
		{open ? <section aria-labelledby="visitor-survey-title" className="rounded-3xl border border-white/80 bg-white/95 p-4 shadow-[0_20px_70px_rgba(13,44,67,.28)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 dark:text-white sm:p-5">
			<div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.16em] text-sky-700 dark:text-sky-300">MASUKAN PENGUNJUNG</p><h2 id="visitor-survey-title" className="mt-1 text-sm font-black">Bagaimana {scopeLabel}?</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Tutup survei" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xl dark:bg-white/10">×</button></div>
			{message && submittedKey === targetKey ? <p role="status" className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200">{message}</p> : <form onSubmit={submit} className="mt-3">
				<p className="text-xs text-slate-600 dark:text-slate-300">Satu penilaian per bagian setiap bulan. Identitasmu tetap anonim.</p>
				<div role="group" aria-label="Pilih nilai dari satu sampai lima bintang" className="mt-3 flex justify-between gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={value + " dari 5 bintang"} aria-pressed={rating === value} className={"grid h-11 flex-1 place-items-center rounded-xl text-2xl transition " + (value <= rating ? "text-amber-400" : "text-slate-300 dark:text-slate-600")}>★</button>)}</div>
				<label htmlFor="visitor-survey-suggestion" className="mt-3 block text-xs font-bold">Saran <span className="font-medium text-slate-500">(opsional)</span></label><textarea id="visitor-survey-suggestion" value={suggestion} onChange={(event) => setSuggestion(event.currentTarget.value.slice(0, 1500))} rows={3} maxLength={1500} placeholder="Apa yang bisa kami tingkatkan?" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-sky-500 dark:border-white/10 dark:bg-slate-950" />
				{message && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-300">{message}</p>}
				<div className="mt-3 flex gap-2"><button type="button" onClick={() => { setDismissedKey(targetKey); try { sessionStorage.setItem("tiloc-survey-dismissed:" + targetKey, "1"); } catch { /* This only snoozes the prompt for this tab. */ } }} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold dark:border-white/15">Nanti</button><button type="submit" disabled={rating < 1 || busy} className="min-h-11 flex-[1.3] rounded-xl bg-[#16587B] px-3 text-xs font-black text-white disabled:opacity-45 dark:bg-sky-500 dark:text-slate-950">{busy ? "Mengirim…" : "Kirim penilaian"}</button></div>
			</form>}
		</section> : submittedKey === targetKey ? <p role="status" className="ml-auto w-fit rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800 shadow-xl dark:border-emerald-300/15 dark:bg-emerald-950 dark:text-emerald-200">{message}</p> : <button type="button" onClick={() => setOpen(true)} className="ml-auto flex min-h-12 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 text-left text-xs font-black shadow-xl backdrop-blur-xl transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-slate-900/90 dark:text-white"><span className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-lg text-amber-500">★</span><span>Beri nilai <span className="font-semibold text-slate-500 dark:text-slate-300">· {route.scope === "destination" ? "wisata" : "TiLoc!"}</span></span></button>}
	</aside>;
}
