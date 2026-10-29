"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getMinigameComponent } from "@/src/features/minigames/registry";
import { summarizeQrMissionProgress } from "@/src/features/minigames/progress";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { CampaignFormExperience } from "@/src/components/campaign-form-experience";

type Campaign = { id: string; title: string; description: string; imageUrl: string | null; ctaLabel: string | null; ctaUrl: string | null; displayChance: number; experienceType: "minigame" | "photobox" };
type Point = { id: string; name: string; code: string; isRequired: boolean; friendName: string | null; requires: string[]; campaigns: Campaign[] };
type Program = { assignmentId: string; programId: string; programName: string; programSlug: string; components: string[]; requiredComponents: string[]; photoboxAccessMode: "standalone" | "mission_reward"; findPoints: Point[]; progress: { scannedQrPointIds: string[]; completedComponents: string[]; photosCreated: number; xp: number; completed: boolean } };
type Snapshot = { destinationName: string; programs: Program[] };
type CampaignPopup = Campaign & { programSlug: string };

export default function MinigameHub({ destinationSlug, initialQrCode, source = "qr_link" }: { destinationSlug: string; initialQrCode?: string; source?: "qr_link" | "camera" }) {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [campaign, setCampaign] = useState<CampaignPopup | null>(null);
	const requestKey = useRef("");
	useEffect(() => {
		let cancelled = false;
		async function refresh() {
			try {
				const response = await fetch(`/api/minigame/state?destinationSlug=${encodeURIComponent(destinationSlug)}`, { cache: "no-store" });
				const data = await response.json() as Snapshot & { error?: string };
				if (!response.ok) throw new Error(data.error || "Data minigame belum dapat dimuat.");
				if (!cancelled) setSnapshot(data);
			} catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Minigame belum dapat dimuat."); }
		}
		void refresh();
		return () => { cancelled = true; };
	}, [destinationSlug]);

	useEffect(() => {
		if (!initialQrCode) return;
		const key = `${destinationSlug}:${initialQrCode}:${source}`;
		if (requestKey.current === key) return;
		requestKey.current = key;
		let cancelled = false;
		void fetch("/api/qr/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: initialQrCode, source }) })
			.then(async (response) => {
				const result = await response.json() as { error?: string; status?: string; pointName?: string; minigames?: { name?: string; error?: string; completed?: boolean; foundRequiredCount?: number; requiredCount?: number }[] };
				if (!response.ok) throw new Error(result.error || "Scan QR belum dapat dicatat.");
				if (cancelled) return;
				const name = result.pointName ? ` · ${result.pointName}` : "";
				const games = result.minigames ?? [];
				const gameErrors = games.filter((item) => item.error);
				const progressText = games.length && !gameErrors.length ? ` · ${games.map((item) => `${item.foundRequiredCount ?? 0}/${item.requiredCount ?? 0} titik misi`).join(" / ")}` : "";
				const visitText = result.status === "already_visited" ? "Kunjungan QR ini sudah tercatat" : "Kunjungan QR berhasil dicatat";
				const missionText = gameErrors.some((item) => item.error === "QR_NOT_IN_MISSION")
					? "QR ini belum dimasukkan ke grup Find Our Friends. Minta admin menambahkannya ke grup misi."
					: gameErrors.length
						? "Kunjungan tercatat, tetapi progres misi belum dapat diperbarui. Coba buka grup misi dan scan ulang."
						: games.length === 0
							? "Destinasi ini belum memiliki grup Find Our Friends yang aktif untuk QR tersebut."
							: "";
				setNotice(`${missionText || `${visitText}${name}${progressText}`}`);
				window.setTimeout(() => { if (!cancelled) setNotice(""); }, 6500);
				const stateResponse = await fetch(`/api/minigame/state?destinationSlug=${encodeURIComponent(destinationSlug)}`, { cache: "no-store" });
				const state = await stateResponse.json() as Snapshot;
				if (stateResponse.ok && !cancelled) {
					setSnapshot(state);
					const seenKey = `mt_campaign_seen:${destinationSlug}`;
					let seenIds: string[] = [];
					try {
						const parsed: unknown = JSON.parse(sessionStorage.getItem(seenKey) || "[]");
						if (Array.isArray(parsed)) seenIds = parsed.filter((item): item is string => typeof item === "string");
					} catch { /* Corrupt session storage should not interrupt a QR visit. */ }
					const seen = new Set(seenIds);
					const candidates = state.programs.flatMap((program) => program.findPoints.filter((point) => point.code === initialQrCode).flatMap((point) => point.campaigns.map((item) => ({ ...item, programSlug: program.programSlug, program }))))
						.filter((item) => !seen.has(item.id) && Math.random() * 100 < item.displayChance)
						.filter((item) => item.experienceType !== "photobox" || item.program.photoboxAccessMode === "standalone" || item.program.progress.completed);
					const selected = candidates[0];
					if (selected) {
						seen.add(selected.id);
						try { sessionStorage.setItem(seenKey, JSON.stringify([...seen])); } catch { /* Keep the campaign available when storage is restricted. */ }
								window.setTimeout(() => {
									if (!cancelled) {
										setCampaign(selected);
										void trackVisitorEvent({ eventName: "campaign_impression", pageKey: "minigame", featureKey: "find_friends", destinationSlug, campaignId: selected.id });
									}
								}, 1800);
					}
				}
			})
			.catch((caught) => { if (!cancelled) setNotice(caught instanceof Error ? caught.message : "Scan QR belum dapat dicatat."); });
		return () => {
			cancelled = true;
			// QR visit and mission scans are idempotent, so an effect replay can retry
			// without losing the progress refresh in React Strict Mode.
			if (requestKey.current === key) requestKey.current = "";
		};
	}, [destinationSlug, initialQrCode, source]);

	if (error) return <section role="alert" className="rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-sm text-amber-900"><strong>Petualangan belum tersambung.</strong><p className="mt-1">{error}</p></section>;
	if (snapshot && !snapshot.programs.length) return null;
	return <section className="minigame-hub-shell relative overflow-hidden rounded-[2rem] border border-sky-200/80 bg-[radial-gradient(circle_at_94%_7%,#d8f2ff_0,transparent_26%),linear-gradient(145deg,#eaf8ff,#f8fcff_60%,#f0faff)] p-5 text-[#16587B] shadow-[0_24px_58px_-34px_rgba(22,88,123,.42)] sm:rounded-[2.4rem] sm:p-7" aria-labelledby="minigame-hub-title">
		<div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 rounded-full border border-[#84B3CE]/25"/><div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-[#a9e5ef]/40 blur-3xl"/>
		<div className="relative z-10 flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/85 text-2xl shadow-sm ring-1 ring-[#84B3CE]/25 motion-safe:animate-[float_3.4s_ease-in-out_infinite]">🎮</span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.16em] text-[#16587B]/55">SAATNYA MAIN</p><h2 id="minigame-hub-title" className="mt-0.5 break-words text-xl font-black leading-tight sm:text-2xl">Misi kecil, cerita seru!</h2></div></div><span className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-[10px] font-extrabold text-[#16587B]/70 shadow-sm">{snapshot ? `${snapshot.programs.length} petualangan` : "Menyiapkan…"}</span></div>
		{notice && <div role="status" className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[75] mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-start gap-3 rounded-2xl border border-white/80 bg-[#fff9eb] px-4 py-3 text-left text-xs font-black leading-5 text-[#16587B] shadow-[0_16px_50px_rgba(10,35,50,.3)] sm:bottom-6 sm:max-w-xl sm:px-5 sm:py-4 sm:text-sm"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-lg">✨</span><span className="min-w-0 flex-1">{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Tutup progres scan" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#16587B]/5 text-lg text-[#16587B]/60">×</button></div>}
		{!snapshot && <div className="relative z-10 mt-5 grid gap-3 md:grid-cols-2"><div className="h-48 animate-pulse rounded-[1.6rem] bg-white/75"/><div className="h-48 animate-pulse rounded-[1.6rem] bg-white/65"/></div>}
		{snapshot && <div className={`relative z-10 mt-5 grid gap-3.5 ${snapshot.programs.length > 1 ? "md:grid-cols-2" : "md:grid-cols-1"}`}>{snapshot.programs.map((program) => {
			const mission = summarizeQrMissionProgress(program.findPoints, program.progress.scannedQrPointIds);
			const photoboxLocked = program.photoboxAccessMode === "mission_reward" && !program.progress.completed;
			return <article key={program.assignmentId} className="game-program-card group flex min-w-0 flex-col rounded-[1.7rem] border-2 border-white/90 bg-white/70 p-4 shadow-[0_12px_30px_-24px_rgba(22,88,123,.4)] transition duration-300 hover:-translate-y-1.5 hover:rotate-[.2deg] hover:shadow-[0_24px_42px_-24px_rgba(22,88,123,.48)] active:scale-[.985] sm:p-5"><div className="flex min-w-0 items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-100 text-xl shadow-inner transition group-hover:rotate-6 group-hover:scale-110">{program.components.includes("find_friends") ? "🐾" : program.components.includes("photobox") ? "📸" : "✨"}</span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.14em] text-[#16587B]/50">PETUALANGAN</p><h3 className="mt-1 break-words text-lg font-black leading-tight text-[#16587B] sm:text-xl">{program.programName}</h3></div></div><span className="shrink-0 rounded-full border border-[#f2dfaa] bg-[#fff4d7] px-3 py-1.5 text-[10px] font-black text-[#8c671d]">⭐ {program.progress.xp} XP</span></div>
				{program.components.includes("find_friends") && <div className="mt-4"><div className="flex items-center justify-between gap-3"><strong className="text-xs font-black text-[#16587B]">Temukan teman maskot</strong><span className="shrink-0 text-xs font-black tabular-nums text-[#16587B]">{mission.foundRequiredCount}<span className="font-semibold text-[#16587B]/45"> / {mission.requiredCount}</span></span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#16587B]/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,#65c2dc,#73c98d,#f4c35d)] transition-[width] duration-700 ease-out" style={{ width: `${mission.completionPercent}%` }}/></div><div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-[#16587B]/60"><span>{mission.scannedRequiredCount} titik ditemukan</span>{mission.bonusFoundCount > 0 && <span>✨ +{mission.bonusFoundCount} bonus</span>}</div><p className="mt-1.5 text-[10px] font-bold text-[#16587B]/55">Cari QR → scan → temukan teman!</p></div>}
				<div className="mt-3 flex flex-wrap items-center gap-1.5">{program.components.map((key) => { const component = getMinigameComponent(key); return <span key={key} className="rounded-full border border-[#84B3CE]/25 bg-[#EAF6FC]/70 px-2.5 py-1 text-[10px] font-bold text-[#16587B]/75">{component?.icon ?? "🧩"} {component?.label ?? key}</span>; })}{program.requiredComponents.length === 0 && <span className="text-[10px] font-bold text-emerald-800">🌿 Bebas dijelajahi</span>}{program.progress.completed && program.requiredComponents.length > 0 && <span className="text-[10px] font-black text-emerald-800">🎉 Misi tuntas!</span>}</div>
				<div className="mt-auto flex flex-wrap gap-2 pt-4">{program.components.includes("find_friends") && <Link href={`/minigame/${encodeURIComponent(program.programSlug)}/${encodeURIComponent(destinationSlug)}`} className="game-primary-action inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-800 px-4 py-2.5 text-xs font-black text-white shadow-[0_8px_18px_-8px_rgba(22,88,123,.7)] transition duration-200 hover:-translate-y-1 hover:saturate-125 hover:shadow-lg active:scale-[.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#84B3CE]/40">{mission.scannedRequiredCount > 0 ? "Lanjutkan misi" : "Mulai petualangan"}<span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span></Link>}{program.components.includes("photobox") && !photoboxLocked && <Link href={`/photobox/${encodeURIComponent(program.programSlug)}/${encodeURIComponent(destinationSlug)}`} aria-label={photoboxLocked ? "Photobox terbuka setelah misi selesai" : "Buka Photobox"} className="game-secondary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#84B3CE]/40 bg-white/85 px-4 py-2.5 text-xs font-black text-[#16587B] transition hover:-translate-y-0.5 hover:bg-[#EAF6FC] active:scale-[.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#84B3CE]/35"><span className="inline-block transition-transform group-hover:rotate-6" aria-hidden="true">📸</span>Photobox</Link>}{program.components.includes("photobox") && photoboxLocked && <span className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-[10px] font-bold text-amber-900">🔒 Buka setelah misi</span>}</div>
			</article>;
		})}</div>}
                {campaign && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="game-campaign-title" className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/80 bg-[#fff9eb] p-5 text-[#16587B] shadow-2xl sm:p-7"><button type="button" onClick={() => setCampaign(null)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-2xl" aria-label="Tutup kampanye">×</button><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-700">{campaign.experienceType === "photobox" ? "Kenangan & partner wisata" : "Selingan petualangan"}</p>{campaign.imageUrl && <img src={campaign.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded-2xl object-cover"/>}<h3 id="game-campaign-title" className="mt-3 pr-8 text-2xl font-black">{campaign.title}</h3>{campaign.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#16587B]/75">{campaign.description}</p>}<div className="mt-5 space-y-2"><button type="button" onClick={() => setCampaign(null)} className="min-h-11 w-full rounded-xl border border-[#84B3CE]/35 bg-white px-3 text-xs font-bold">Nanti saja</button><CampaignFormExperience campaignId={campaign.id} pageKey="minigame" destinationSlug={destinationSlug} fallbackHref={campaign.ctaUrl || `/${campaign.experienceType === "photobox" ? "photobox" : "minigame"}/${encodeURIComponent(campaign.programSlug)}/${encodeURIComponent(destinationSlug)}`} fallbackLabel={campaign.ctaLabel || (campaign.experienceType === "photobox" ? "Buka Photobox" : "Lanjutkan")} onNavigate={() => setCampaign(null)} /></div></section></div>}
	</section>;
}
