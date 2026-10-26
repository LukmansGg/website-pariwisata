"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NearbyCampaignPopup from "@/app/wisata/[slug]/nearby-campaign-popup";
import { getMinigameComponent } from "@/src/features/minigames/registry";
import { summarizeQrMissionProgress } from "@/src/features/minigames/progress";

type Point = { id: string; name: string; code: string; isRequired: boolean; friendName: string | null; friendImageUrl: string | null; requires: string[] };
type Program = { assignmentId: string; programSlug: string; programName: string; components: string[]; requiredComponents: string[]; photoboxAccessMode: "standalone" | "mission_reward"; findPoints: Point[]; progress: { scannedQrPointIds: string[]; completedComponents: string[]; photosCreated: number; xp: number; completed: boolean } };
type State = { destinationName: string; programs: Program[] };
type Destination = { slug: string; name: string; description: string | null; short_description: string | null; address: string | null; tags: string[] | null; mascot_mode: "tiloc" | "custom"; mascot_image_url: string | null };

export default function MinigamePlay({ programSlug, destination, initialQrCode, initialQrSource = "qr_link" }: { programSlug: string; destination: Destination; initialQrCode?: string; initialQrSource?: "qr_link" | "camera" }) {
	const [state, setState] = useState<State | null>(null);
	const [error, setError] = useState("");
	const [scanNotice, setScanNotice] = useState("");
	const scanRequestKey = useRef("");
	const refresh = useCallback(async () => {
		try {
			const response = await fetch(`/api/minigame/state?destinationSlug=${encodeURIComponent(destination.slug)}`, { cache: "no-store" });
			const result = await response.json() as State & { error?: string };
			if (!response.ok) throw new Error(result.error || "Progres belum dapat dimuat.");
			setState(result);
		} catch (caught) { setError(caught instanceof Error ? caught.message : "Progres belum dapat dimuat."); }
	}, [destination.slug]);
	useEffect(() => {
		const initialLoad = window.setTimeout(() => void refresh(), 0);
		const onFocus = () => void refresh();
		window.addEventListener("focus", onFocus);
		return () => { window.clearTimeout(initialLoad); window.removeEventListener("focus", onFocus); };
	}, [refresh]);
	useEffect(() => {
		const code = initialQrCode?.trim().toLowerCase() ?? "";
		if (!code) return;
		const requestKey = `${programSlug}:${destination.slug}:${code}`;
		if (scanRequestKey.current === requestKey) return;
		scanRequestKey.current = requestKey;
		let cancelled = false;
		void fetch("/api/minigame/scan", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ programSlug, destinationSlug: destination.slug, code, source: initialQrSource }),
		})
			.then(async (response) => {
				const result = await response.json() as { error?: string; status?: string; name?: string; foundRequiredCount?: number; requiredCount?: number; completed?: boolean; programCompleted?: boolean };
				if (!response.ok) throw new Error(result.error || "QR belum dapat dicatat ke misi ini.");
				if (cancelled) return;
				const point = result.name ? ` · ${result.name}` : "";
				const progress = `${result.foundRequiredCount ?? 0}/${result.requiredCount ?? 0} titik wajib`;
				const finish = result.programCompleted ? " · Program tuntas! ✨" : result.completed ? " · Misi Find Our Friends tuntas!" : "";
				const xpNotice = result.status === "already_scanned" ? "" : " · +30 XP";
				setScanNotice(`${result.status === "already_scanned" ? "QR ini sudah tercatat" : "QR berhasil dicatat"}${point} · ${progress}${xpNotice}${finish}`);
				await refresh();
			})
			.catch((caught) => { if (!cancelled) setScanNotice(caught instanceof Error ? caught.message : "QR belum dapat dicatat ke misi ini."); });
		return () => {
			cancelled = true;
			// Scans are idempotent in the database; reset the key so React Strict Mode
			// can safely replay the request after its development-only effect cleanup.
			if (scanRequestKey.current === requestKey) scanRequestKey.current = "";
		};
	}, [destination.slug, initialQrCode, initialQrSource, programSlug, refresh]);
	const program = state?.programs.find((item) => item.programSlug === programSlug);
	const missionProgress = useMemo(() => program ? summarizeQrMissionProgress(program.findPoints, program.progress.scannedQrPointIds) : null, [program]);
	const found = missionProgress?.foundIds ?? new Set<string>();
	const requiredCount = missionProgress?.requiredCount ?? 0;
	const foundRequired = missionProgress?.foundRequiredCount ?? 0;
	const scannedRequired = missionProgress?.scannedRequiredCount ?? 0;
	const pendingRequired = missionProgress?.pendingRequiredCount ?? 0;
	const bonusFound = missionProgress?.bonusFoundCount ?? 0;
	const findComplete = Boolean(program?.progress.completedComponents.includes("find_friends"));
	const photoboxLocked = program?.photoboxAccessMode === "mission_reward" && !program.progress.completed;
	const mascot = destination.mascot_mode === "custom" && destination.mascot_image_url ? destination.mascot_image_url : "/maskot/frame_0.png";

	if (error) return <main className="grid min-h-dvh place-items-center bg-[#f5eedd] p-5 text-[#16587b]"><section className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl"><h1 className="text-2xl font-black">Petualangan belum tersambung</h1><p className="mt-3 text-sm leading-6">{error}</p><Link href={`/wisata/${encodeURIComponent(destination.slug)}`} className="mt-5 inline-flex rounded-xl bg-[#16587b] px-4 py-3 text-sm font-bold text-white">Kembali ke destinasi</Link></section></main>;
	if (state && !program) return <main className="grid min-h-dvh place-items-center bg-[#f5eedd] p-5 text-[#16587b]"><section className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl"><h1 className="text-2xl font-black">Program minigame tidak aktif</h1><p className="mt-2 text-sm">Program ini belum diterapkan ke {destination.name}.</p>{scanNotice && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">{scanNotice}</p>}<Link href={`/wisata/${encodeURIComponent(destination.slug)}`} className="mt-5 inline-flex rounded-xl bg-[#16587b] px-4 py-3 text-sm font-bold text-white">Kembali ke destinasi</Link></section></main>;

	return <main className="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_12%_5%,#c8eeff_0,transparent_30%),radial-gradient(circle_at_95%_90%,#ffe9b5_0,transparent_32%),linear-gradient(135deg,#f5eedd,#eaf7fb_55%,#f8fbff)] px-4 py-5 text-[#16587b] sm:px-8 sm:py-8"><div aria-hidden="true" className="pointer-events-none absolute -right-20 top-40 h-80 w-80 rounded-full border border-sky-200/70"/><div className="relative mx-auto max-w-5xl">
		<header className="flex flex-wrap items-center justify-between gap-3"><Link href={`/wisata/${encodeURIComponent(destination.slug)}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white bg-white/75 px-4 py-2 text-xs font-bold shadow-sm">← {destination.name}</Link><span className="rounded-full bg-[#16587b]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[.14em]">MINIGAME · PLAY MODE</span></header>
		{!program && <div className="mt-8 h-40 animate-pulse rounded-[2rem] bg-white/65"/>}
		{program && <>
			<section className="relative mt-5 overflow-hidden rounded-[2.5rem] bg-[linear-gradient(120deg,#103f5b,#16587b_60%,#2b839d)] p-6 text-white shadow-[0_30px_90px_-40px_rgba(16,63,90,.75)] sm:p-9"><div aria-hidden="true" className="absolute -right-14 -top-16 h-64 w-64 rounded-full border border-white/15"/><div className="relative z-10 grid gap-5 sm:grid-cols-[1fr_145px] sm:items-center"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-100/70">MISI QR · {destination.name}</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">{program.programName}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Scan QR yang kamu temukan; urutannya bebas. Scan yang menunggu prasyarat tetap tersimpan dan terbuka otomatis setelah syaratnya terpenuhi.</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">⭐ {program.progress.xp} XP <span className="font-medium text-white/70">· 30 per QR baru</span></span><span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">🐾 {foundRequired}/{requiredCount} titik wajib ditemukan</span>{findComplete && <span className="rounded-full bg-emerald-300/20 px-3 py-1.5 text-xs font-black text-emerald-100">MISI TUNTAS ✓</span>}{program.progress.completed && <span className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-black text-emerald-950">PROGRAM TUNTAS ✨</span>}</div><div className="mt-4 h-2 max-w-xl overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Titik misi wajib ditemukan" aria-valuemin={0} aria-valuemax={requiredCount} aria-valuenow={foundRequired}><div className="h-full rounded-full bg-amber-300 transition-all duration-500" style={{ width: `${missionProgress?.completionPercent ?? 0}%` }} /></div><p className="mt-2 text-[11px] text-white/70">{scannedRequired}/{requiredCount} QR wajib terpindai{pendingRequired ? ` · ${pendingRequired} menunggu prasyarat` : ""}{bonusFound ? ` · ${bonusFound} bonus ditemukan` : ""}</p></div><div className="relative mx-auto h-32 w-32 sm:h-36 sm:w-36"><Image src={mascot} alt="Maskot petualangan" fill sizes="144px" unoptimized className="object-contain drop-shadow-xl" /></div></div></section>
			<div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
				<section className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-[0_20px_70px_-45px_rgba(22,88,123,.38)] backdrop-blur sm:p-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#16587b]/50">PETA TEMAN</p><h2 className="mt-1 text-2xl font-black">Titik di dalam grup</h2></div><Link href={`/scan?game=${encodeURIComponent(programSlug)}&destination=${encodeURIComponent(destination.slug)}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#16587b] px-4 py-3 text-xs font-black text-white shadow-md hover:-translate-y-0.5">Buka kamera QR ↗</Link></div>
					{scanNotice && <p role="status" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-[#16587b]">{scanNotice}</p>}
					<div className="mt-5 space-y-3">{program.findPoints.map((point) => { const scanned = program.progress.scannedQrPointIds.includes(point.id); const isFound = found.has(point.id); const missing = point.requires.filter((id) => !found.has(id)).map((id) => program.findPoints.find((candidate) => candidate.id === id)?.name ?? "teman lain"); return <article key={point.id} className={`relative overflow-hidden rounded-2xl border p-4 transition ${isFound ? "border-emerald-200 bg-emerald-50/75" : scanned ? "border-amber-200 bg-amber-50/75" : "border-[#84B3CE]/25 bg-sky-50/45"}`}><div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${isFound ? "bg-emerald-100" : scanned ? "bg-amber-100" : "bg-white"}`}>{isFound ? "🐾" : scanned ? "⏳" : "🔎"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{point.friendName || point.name}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${point.isRequired ? "bg-white/80 text-[#16587b]" : "bg-violet-100 text-violet-800"}`}>{point.isRequired ? "Wajib" : "Bonus"}</span></div><p className="mt-1 text-xs leading-5 text-[#16587b]/65">{isFound ? "Teman ditemukan! Titik ini sudah memenuhi prasyarat." : scanned ? `Scan tercatat. Masih menunggu: ${missing.join(", ") || "prasyarat sebelumnya"}.` : point.requires.length ? `Cari QR ${point.name}. Titik ini membutuhkan ${point.requires.map((id) => program.findPoints.find((candidate) => candidate.id === id)?.name ?? "QR lain").join(" dan ")} terlebih dahulu.` : `Cari QR ${point.name} di area wisata.`}</p><p className="mt-2 font-mono text-[10px] text-[#16587b]/45">{point.code}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${isFound ? "bg-emerald-100 text-emerald-800" : scanned ? "bg-amber-100 text-amber-800" : "bg-white text-[#16587b]/55"}`}>{isFound ? "DITEMUKAN" : scanned ? "TERTUNDA" : "BELUM SCAN"}</span></div></article>; })}</div>
					<div className="mt-5 rounded-2xl bg-[#16587b]/[.04] p-4 text-xs leading-5 text-[#16587b]/70"><strong>Scan QR dari kamera situs.</strong> Setelah QR dipindai, kamu kembali ke misi ini dan progres langsung diperbarui. QR hanya dihitung jika sudah dimasukkan admin ke grup misi destinasi ini.</div>
				</section>
				<aside className="space-y-4"><section className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-[0_20px_70px_-45px_rgba(22,88,123,.38)]"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#16587b]/50">STATUS PROGRAM</p><h2 className="mt-1 text-xl font-black">Fitur petualangan</h2><div className="mt-4 space-y-2">{program.components.map((key) => { const component = getMinigameComponent(key); return <div key={key} className="flex items-center justify-between rounded-xl bg-sky-50 px-3 py-3 text-xs font-bold"><span>{component?.icon ?? "🧩"} {component?.label ?? key}</span><span className="text-emerald-700">Aktif</span></div>; })}</div><div className="mt-4 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-950">{program.requiredComponents.length === 0 ? "Mode eksplorasi bebas. Program ini tidak memiliki target misi wajib." : program.progress.completed ? "Program selesai! Semua misi wajib telah kamu tuntaskan." : "Progres tersimpan di browser dan perangkat ini selama sesi pengunjung tersedia."}</div></section>
					{program.components.includes("photobox") && <section className="rounded-[2rem] border border-rose-100 bg-[linear-gradient(140deg,#fff7f4,#fff9e9)] p-5 shadow-[0_20px_70px_-45px_rgba(180,77,77,.3)]"><span className="text-3xl">📸</span><h2 className="mt-2 text-xl font-black">Photobox kenangan</h2><p className="mt-2 text-xs leading-5 text-[#16587b]/65">{photoboxLocked ? "Selesaikan semua misi wajib program untuk membuka photobox hadiah." : "Pilih template, ambil foto, tambahkan caption, lalu simpan ke Drive atau bagikan."}</p><Link aria-disabled={photoboxLocked} href={photoboxLocked ? "#photobox-locked" : `/photobox/${encodeURIComponent(programSlug)}/${encodeURIComponent(destination.slug)}`} className={`mt-4 flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-xs font-black ${photoboxLocked ? "pointer-events-none bg-slate-200 text-slate-500" : "bg-rose-600 text-white shadow-md hover:-translate-y-0.5"}`}>{photoboxLocked ? "Terkunci 🔒" : "Masuk studio Photobox ↗"}</Link></section>}
					<Link href={`/wisata/${encodeURIComponent(destination.slug)}`} className="block rounded-2xl border border-[#84B3CE]/30 bg-white/70 px-4 py-3 text-center text-xs font-bold text-[#16587b]/70 hover:bg-white">Kembali ke dashboard wisata</Link></aside>
			</div>
		</>}
	</div><NearbyCampaignPopup destinationSlug={destination.slug} active={Boolean(program)} /></main>;
}
