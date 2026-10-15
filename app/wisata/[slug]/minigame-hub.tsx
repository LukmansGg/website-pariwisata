"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Campaign = { id: string; title: string; description: string; imageUrl: string | null; ctaLabel: string | null; ctaUrl: string | null; displayChance: number; experienceType: "minigame" | "photobox" };
type Point = { id: string; name: string; code: string; isRequired: boolean; friendName: string | null; requires: string[]; campaigns: Campaign[] };
type Program = { assignmentId: string; programId: string; programName: string; programSlug: string; components: string[]; requiredComponents: string[]; photoboxAccessMode: "standalone" | "mission_reward"; findPoints: Point[]; progress: { scannedQrPointIds: string[]; completedComponents: string[]; photosCreated: number; xp: number; completed: boolean } };
type Snapshot = { destinationName: string; programs: Program[] };
type CampaignPopup = Campaign & { programSlug: string };

function foundIds(program: Program) {
	const scanned = new Set(program.progress.scannedQrPointIds);
	const found = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const point of program.findPoints) {
			if (scanned.has(point.id) && !found.has(point.id) && point.requires.every((id) => found.has(id))) {
				found.add(point.id);
				changed = true;
			}
		}
	}
	return found;
}

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
		if (!initialQrCode || requestKey.current === initialQrCode) return;
		requestKey.current = initialQrCode;
		let cancelled = false;
		void fetch("/api/qr/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: initialQrCode, source }) })
			.then(async (response) => {
				const result = await response.json() as { error?: string; status?: string; pointName?: string; minigames?: { name?: string; completed?: boolean; foundRequiredCount?: number; requiredCount?: number }[] };
				if (!response.ok) throw new Error(result.error || "Scan QR belum dapat dicatat.");
				if (cancelled) return;
				const name = result.pointName ? ` · ${result.pointName}` : "";
				const games = result.minigames ?? [];
				const progressText = games.length ? ` · ${games.map((item) => `${item.foundRequiredCount ?? 0}/${item.requiredCount ?? 0} titik misi`).join(" / ")}` : "";
				setNotice(`${result.status === "already_visited" ? "Titik ini sudah tercatat" : "Titik berhasil dicatat"}${name}${progressText}`);
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
						window.setTimeout(() => { if (!cancelled) setCampaign(selected); }, 1800);
					}
				}
			})
			.catch((caught) => { if (!cancelled) setNotice(caught instanceof Error ? caught.message : "Scan QR belum dapat dicatat."); });
		return () => { cancelled = true; };
	}, [destinationSlug, initialQrCode, source]);

	if (error) return <section className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900"><strong>Minigame belum tersambung.</strong><p className="mt-1">{error}</p></section>;
	if (snapshot && !snapshot.programs.length) return null;
	return <section className="relative overflow-hidden rounded-[2rem] border border-white/75 bg-[linear-gradient(135deg,#103e5c,#16587b_55%,#287b97)] p-5 text-white shadow-[0_25px_70px_-30px_rgba(16,63,90,.65)] sm:rounded-[2.5rem] sm:p-8" aria-labelledby="minigame-hub-title">
		<div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/15"/><div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl"/>
		<div className="relative z-10 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-100/75">MINIGAME STUDIO</p><h2 id="minigame-hub-title" className="mt-1 text-2xl font-black sm:text-3xl">Petualangan di {snapshot?.destinationName ?? "destinasi ini"}</h2></div><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">{snapshot ? `${snapshot.programs.length} program aktif` : "Memuat program…"}</span></div>
		{notice && <div role="status" className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[75] mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-start gap-3 rounded-2xl border border-white/80 bg-[#fff9eb] px-4 py-3 text-left text-xs font-black leading-5 text-[#16587B] shadow-[0_16px_50px_rgba(10,35,50,.3)] sm:bottom-6 sm:max-w-xl sm:px-5 sm:py-4 sm:text-sm"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-lg">✨</span><span className="min-w-0 flex-1">{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Tutup progres scan" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#16587B]/5 text-lg text-[#16587B]/60">×</button></div>}
		{!snapshot && <div className="relative z-10 mt-5 h-24 animate-pulse rounded-2xl bg-white/10"/>}
		{snapshot && <div className="relative z-10 mt-5 grid gap-3 lg:grid-cols-2">{snapshot.programs.map((program) => {
			const found = foundIds(program);
			const requiredPoints = program.findPoints.filter((point) => point.isRequired);
			const foundRequired = requiredPoints.filter((point) => found.has(point.id)).length;
			const photoboxLocked = program.photoboxAccessMode === "mission_reward" && !program.progress.completed;
			return <article key={program.assignmentId} className="rounded-3xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-100/70">PROGRAM MINIGAME</p><h3 className="mt-1 text-xl font-black">{program.programName}</h3></div><span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold">{program.progress.xp} XP</span></div><div className="mt-3 flex flex-wrap gap-2">{program.components.map((key) => <span key={key} className="rounded-full bg-black/10 px-2.5 py-1 text-[10px] font-bold">{key === "find_friends" ? "🐾 Find Our Friends" : key === "photobox" ? "📸 Photobox" : "✨ Pemandu AI"}</span>)}</div>
				{program.components.includes("find_friends") && <div className="mt-4 rounded-2xl bg-black/10 p-3"><div className="flex items-center justify-between gap-3 text-xs"><strong>🐾 Teman ditemukan</strong><span className="font-black tabular-nums">{foundRequired}/{requiredPoints.length}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${requiredPoints.length ? foundRequired / requiredPoints.length * 100 : 0}%` }}/></div><p className="mt-2 text-[10px] leading-4 text-white/70">Scan QR grup di lokasi. Titik dengan prasyarat akan terbuka otomatis setelah teman yang dibutuhkan ditemukan.</p></div>}
				{program.components.includes("photobox") && <p className="mt-3 text-xs text-white/75">📸 {photoboxLocked ? "Photobox terbuka setelah semua misi wajib program selesai." : `${program.progress.photosCreated} kenangan dibuat · pilih template dan ambil foto.`}</p>}
				<div className="mt-4 flex flex-wrap gap-2">{program.components.includes("find_friends") && <Link href={`/minigame/${encodeURIComponent(program.programSlug)}/${encodeURIComponent(destinationSlug)}`} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#F5EEDD] px-4 py-2 text-xs font-black text-[#16587B] shadow-sm hover:-translate-y-0.5">Lanjutkan grup misi →</Link>}{program.components.includes("photobox") && !photoboxLocked && <Link href={`/photobox/${encodeURIComponent(program.programSlug)}/${encodeURIComponent(destinationSlug)}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/20">Buka Photobox ↗</Link>}</div>
			</article>;
		})}</div>}
		{campaign && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="game-campaign-title" className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/80 bg-[#fff9eb] p-5 text-[#16587B] shadow-2xl sm:p-7"><button type="button" onClick={() => setCampaign(null)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-2xl" aria-label="Tutup kampanye">×</button><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-700">{campaign.experienceType === "photobox" ? "Kenangan & partner wisata" : "Selingan petualangan"}</p>{campaign.imageUrl && <img src={campaign.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded-2xl object-cover"/>}<h3 id="game-campaign-title" className="mt-3 pr-8 text-2xl font-black">{campaign.title}</h3>{campaign.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#16587B]/75">{campaign.description}</p>}<div className="mt-5 flex gap-2"><button type="button" onClick={() => setCampaign(null)} className="min-h-11 flex-1 rounded-xl border border-[#84B3CE]/35 bg-white px-3 text-xs font-bold">Nanti saja</button>{campaign.ctaUrl ? <a href={campaign.ctaUrl} target="_blank" rel="noreferrer" onClick={() => setCampaign(null)} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#16587B] px-3 text-xs font-black text-white">{campaign.ctaLabel || "Lihat promo"}</a> : <Link href={`/${campaign.experienceType === "photobox" ? "photobox" : "minigame"}/${encodeURIComponent(campaign.programSlug)}/${encodeURIComponent(destinationSlug)}`} onClick={() => setCampaign(null)} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#16587B] px-3 text-xs font-black text-white">{campaign.ctaLabel || (campaign.experienceType === "photobox" ? "Buka Photobox" : "Lanjutkan")}</Link>}</div></section></div>}
	</section>;
}
