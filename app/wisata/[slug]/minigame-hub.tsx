"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMinigameComponent } from "@/src/features/minigames/registry";
import { summarizeQrMissionProgress } from "@/src/features/minigames/progress";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { CampaignFormExperience } from "@/src/components/campaign-form-experience";

type Campaign = { id: string; title: string; description: string; imageUrl: string | null; ctaLabel: string | null; ctaUrl: string | null; displayChance: number; experienceType: "minigame" | "photobox" };
type Point = { id: string; name: string; code: string; isRequired: boolean; friendName: string | null; requires: string[]; campaigns: Campaign[] };
type PhotoboxTemplate = { id: string; name: string; frameUrl: string; ratio: string; layout: string; enabled: boolean; source?: "preset" | "custom" | "campaign"; displayChance?: number; alwaysShow?: boolean };
type Program = { assignmentId: string; programId: string; programName: string; programSlug: string; components: string[]; requiredComponents: string[]; photoboxAccessMode: "standalone" | "mission_reward"; photoboxTemplates: PhotoboxTemplate[]; findPoints: Point[]; progress: { scannedQrPointIds: string[]; completedComponents: string[]; photosCreated: number; xp: number; completed: boolean } };
type Snapshot = { destinationName: string; programs: Program[] };
type CampaignPopup = Campaign & { programSlug: string };

function PhotoboxPassCard({ program, destinationSlug, celebrating }: { program: Program; destinationSlug: string; celebrating: boolean }) {
	const router = useRouter();
	const [opening, setOpening] = useState(false);
	const openingTimer = useRef<number | null>(null);
	const frames = (program.photoboxTemplates ?? []).filter((template) => template.enabled && template.frameUrl);
	const backFrame = frames[1] ?? frames[0];
	const frontFrame = frames[0];
	const reward = program.photoboxAccessMode === "mission_reward";
	const studioHref = `/photobox/${encodeURIComponent(program.programSlug)}/${encodeURIComponent(destinationSlug)}`;
	useEffect(() => () => { if (openingTimer.current !== null) window.clearTimeout(openingTimer.current); }, []);
	return <div className={`game-photobox-card relative isolate min-h-[23rem] overflow-hidden sm:min-h-[25rem] ${reward ? "game-photobox-card--reward" : "game-photobox-card--standalone"}`}>
		<div aria-hidden="true" className="game-photobox-dots pointer-events-none absolute inset-0" />
		<div aria-hidden="true" className="game-photobox-orb game-photobox-orb--one pointer-events-none absolute -left-12 -top-16 h-48 w-48 rounded-full" />
		<div aria-hidden="true" className="game-photobox-orb game-photobox-orb--two pointer-events-none absolute -bottom-20 right-[25%] h-48 w-48 rounded-full" />
		<div aria-hidden="true" className="game-social-bubble game-social-bubble--heart absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full border-2 border-white text-lg shadow-lg sm:left-5 sm:top-5 sm:h-12 sm:w-12 sm:text-xl">♥</div>
		<div aria-hidden="true" className="game-social-bubble game-social-bubble--music absolute right-3 top-16 grid h-10 w-10 place-items-center rounded-full border-2 border-white text-lg shadow-lg sm:right-5 sm:top-20 sm:h-12 sm:w-12 sm:text-xl">♫</div>
		<div aria-hidden="true" className="game-social-bubble game-social-bubble--chat absolute bottom-3 left-[28%] grid h-11 w-11 place-items-center rounded-full border-2 border-white text-xl shadow-lg sm:bottom-4 sm:left-[30%] sm:h-14 sm:w-14 sm:text-2xl">💬</div>
		<div aria-hidden="true" className="game-social-bubble game-social-bubble--spark absolute bottom-5 right-4 grid h-9 w-9 place-items-center rounded-full border-2 border-white text-base shadow-lg sm:bottom-6 sm:right-6 sm:h-11 sm:w-11 sm:text-lg">✦</div>
		{celebrating && <div className="game-photo-confetti pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">{["12%", "26%", "42%", "58%", "74%", "88%"].map((left, index) => <span key={left} style={{ left, animationDelay: `${index * 75}ms` }}>{index % 2 ? "✦" : "✧"}</span>)}</div>}
		<div className="game-photobox-layout relative z-10">
			<div className="game-photobox-copy flex min-w-0 flex-col justify-center text-center sm:text-left">
				<div className={`game-photobox-ticket mx-auto mb-4 inline-flex w-fit items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.15em] shadow-[3px_3px_0_rgba(22,88,123,.08)] sm:mx-0 ${reward ? "game-photobox-ticket--reward" : ""}`}><span aria-hidden="true">{reward ? "🎁" : "📸"}</span>{reward ? "Hadiah misi terbuka" : "Studio Photobox"}</div>
				<p className="text-[9px] font-black uppercase tracking-[.17em] text-[#16587B]/55">{program.programName}</p>
				<h3 className="mt-2 text-[2rem] font-black leading-[1.04] tracking-tight text-[#16587B] sm:text-[2.7rem]">Abadikan <span className="game-photobox-title-accent">Momenmu!</span> <span aria-hidden="true">📸</span></h3>
				<p className="game-photobox-description mx-auto mt-4 max-w-md rounded-2xl border-2 border-white/80 bg-white/55 p-3 text-xs font-semibold leading-5 text-[#16587B]/70 sm:mx-0 sm:mt-5 sm:p-4 sm:text-sm">Pilih frame favorit, atur foto, lalu simpan atau bagikan hasil jepretanmu.</p>
		<Link href={studioHref} aria-busy={opening} onClick={(event) => { event.preventDefault(); if (opening || openingTimer.current !== null) return; if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { router.push(studioHref); return; } setOpening(true); openingTimer.current = window.setTimeout(() => { openingTimer.current = null; router.push(studioHref); }, 260); }} className="game-primary-action game-cta-idle mx-auto mt-4 inline-flex min-h-14 w-full max-w-sm items-center justify-center gap-3 rounded-2xl border-2 border-blue-950/50 bg-[linear-gradient(180deg,#438ff0,#1760c3)] px-4 py-3 text-sm font-black text-white shadow-[0_6px_0_#11488f,0_12px_20px_rgba(23,96,195,.2)] transition duration-200 hover:-translate-y-0.5 hover:saturate-125 active:translate-y-1 active:shadow-[0_2px_0_#11488f,0_5px_10px_rgba(23,96,195,.2)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/70 aria-busy:cursor-wait aria-busy:saturate-75 sm:mx-0"><span className="game-camera-icon text-xl" aria-hidden="true">{opening ? "✨" : "📷"}</span><span>{opening ? "Membuka studio…" : "Buka Studio Photobox"}</span><span className="game-cta-arrow" aria-hidden="true">→</span></Link>
				<div className="game-camera-ready mx-auto mt-3 inline-flex items-center gap-2 text-[9px] font-extrabold uppercase tracking-[.1em] text-[#16587B]/55 sm:mx-0"><span className="game-camera-ready-dot h-2 w-2 rounded-full" />{frames.length ? `${frames.length} frame siap dipilih` : "Frame sedang disiapkan"}<span aria-hidden="true">·</span>kamera tersedia di studio</div>
			</div>
			<div className="game-photobox-gallery relative mx-auto mt-5 flex h-[15rem] w-full max-w-[22rem] items-center justify-center sm:mt-6 sm:h-[18rem]">
				<div className="game-gallery-glow absolute h-[13rem] w-[13rem] rounded-full blur-xl sm:h-[16rem] sm:w-[16rem]" />
				<div className="game-polaroid game-polaroid--back absolute z-10 w-[9.2rem] -translate-x-7 -translate-y-1 -rotate-[11deg] sm:w-[11rem] sm:-translate-x-10">
					<div className="game-polaroid-shot relative flex items-center justify-center overflow-hidden"><span className="game-photo-placeholder" aria-hidden="true">🥰</span>{backFrame && <img src={backFrame.frameUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />}</div>
					<p className="game-polaroid-caption truncate">{backFrame?.name ?? "Pose bareng!"}</p>
				</div>
				<div className="game-polaroid game-polaroid--front absolute z-20 w-[9.5rem] translate-x-7 translate-y-2 rotate-[7deg] sm:w-[11.5rem] sm:translate-x-10">
					<span className="game-photo-tape absolute -top-3 left-1/2 z-10 h-5 w-14 -translate-x-1/2 -rotate-6" aria-hidden="true" />
					<div className="game-polaroid-shot game-polaroid-shot--front relative flex items-center justify-center overflow-hidden"><span className="game-photo-placeholder" aria-hidden="true">😎</span>{frontFrame && <img src={frontFrame.frameUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />}<span className="game-photo-star game-photo-star--one absolute left-2 top-2" aria-hidden="true">✦</span><span className="game-photo-star game-photo-star--two absolute bottom-3 right-2" aria-hidden="true">✧</span></div>
					<p className="game-polaroid-caption truncate">{frontFrame?.name ?? "Frame favorit"}</p>
				</div>
			</div>
		</div>
		{opening && <div className="game-camera-flash pointer-events-none absolute inset-0 z-30 rounded-[inherit]" aria-hidden="true" />}
	</div>;
}

export default function MinigameHub({ destinationSlug, initialQrCode, source = "qr_link" }: { destinationSlug: string; initialQrCode?: string; source?: "qr_link" | "camera" }) {
	const pathname = usePathname();
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [campaign, setCampaign] = useState<CampaignPopup | null>(null);
	const [celebratingAssignments, setCelebratingAssignments] = useState<string[]>([]);
	const [switchingAssignments, setSwitchingAssignments] = useState<string[]>([]);
	const requestKey = useRef("");
	const lastPathname = useRef(pathname);
	const snapshotRef = useRef<Snapshot | null>(null);
	const celebrationTimer = useRef<number | null>(null);
	const photoboxSwitchTimers = useRef(new Map<string, number>());
	const publishSnapshot = useCallback((next: Snapshot) => {
		const previous = snapshotRef.current;
		const completionKey = `tiloc:minigame-completion:${destinationSlug}`;
		const priorCompletion = new Map<string, boolean>();
		if (previous) {
			for (const program of previous.programs) priorCompletion.set(program.assignmentId, program.progress.completed);
		} else {
			try {
				const stored: unknown = JSON.parse(sessionStorage.getItem(completionKey) || "{}");
				if (stored && typeof stored === "object" && !Array.isArray(stored)) {
					for (const [assignmentId, completed] of Object.entries(stored)) if (typeof completed === "boolean") priorCompletion.set(assignmentId, completed);
				}
			} catch { /* A missing or unavailable session cache should not interrupt mission progress. */ }
		}
		const justCompleted = next.programs.filter((program) => program.progress.completed && priorCompletion.get(program.assignmentId) === false).map((program) => program.assignmentId);
		const newlyUnlockedPhotoboxes = next.programs.filter((program) => justCompleted.includes(program.assignmentId) && program.components.includes("find_friends") && program.components.includes("photobox") && program.photoboxAccessMode === "mission_reward").map((program) => program.assignmentId);
		snapshotRef.current = next;
		setSnapshot(next);
		try { sessionStorage.setItem(completionKey, JSON.stringify(Object.fromEntries(next.programs.map((program) => [program.assignmentId, program.progress.completed])))); } catch { /* The live card still works without tab storage. */ }
		if (justCompleted.length) {
			setCelebratingAssignments(justCompleted);
			if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
			celebrationTimer.current = window.setTimeout(() => setCelebratingAssignments([]), 4600);
		}
		if (newlyUnlockedPhotoboxes.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setSwitchingAssignments((current) => [...new Set([...current, ...newlyUnlockedPhotoboxes])]);
			for (const assignmentId of newlyUnlockedPhotoboxes) {
				const existingTimer = photoboxSwitchTimers.current.get(assignmentId);
				if (existingTimer !== undefined) window.clearTimeout(existingTimer);
				const timer = window.setTimeout(() => {
					setSwitchingAssignments((current) => current.filter((id) => id !== assignmentId));
					photoboxSwitchTimers.current.delete(assignmentId);
				}, 1500);
				photoboxSwitchTimers.current.set(assignmentId, timer);
			}
		}
	}, [destinationSlug]);
	const refreshSnapshot = useCallback(async () => {
		try {
			const response = await fetch(`/api/minigame/state?destinationSlug=${encodeURIComponent(destinationSlug)}`, { cache: "no-store" });
			const data = await response.json() as Snapshot & { error?: string };
			if (!response.ok) throw new Error(data.error || "Data minigame belum dapat dimuat.");
			setError("");
			publishSnapshot(data);
		} catch (caught) {
			if (!snapshotRef.current) setError(caught instanceof Error ? caught.message : "Minigame belum dapat dimuat.");
		}
	}, [destinationSlug, publishSnapshot]);
	useEffect(() => {
		void refreshSnapshot();
		const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refreshSnapshot(); };
		window.addEventListener("focus", refreshWhenVisible);
		document.addEventListener("visibilitychange", refreshWhenVisible);
		return () => {
			window.removeEventListener("focus", refreshWhenVisible);
			document.removeEventListener("visibilitychange", refreshWhenVisible);
			if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
			for (const timer of photoboxSwitchTimers.current.values()) window.clearTimeout(timer);
			photoboxSwitchTimers.current.clear();
		};
	}, [refreshSnapshot]);
	useEffect(() => {
		if (lastPathname.current === pathname) return;
		lastPathname.current = pathname;
		if (pathname.startsWith("/wisata/")) void refreshSnapshot();
	}, [pathname, refreshSnapshot]);

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
					publishSnapshot(state);
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
	}, [destinationSlug, initialQrCode, publishSnapshot, source]);

	if (error) return <section role="alert" className="rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-sm text-amber-900 dark:border-amber-300/15 dark:bg-amber-950/40 dark:text-amber-100"><strong>Petualangan belum tersambung.</strong><p className="mt-1">{error}</p></section>;
	if (snapshot && !snapshot.programs.length) return null;
	return <section className="minigame-hub-shell relative text-[#16587B]" aria-labelledby="minigame-hub-title">
		<div className="relative z-10 flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/85 text-2xl shadow-sm ring-1 ring-[#84B3CE]/25 motion-safe:animate-[float_3.4s_ease-in-out_infinite]">🎮</span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.16em] text-[#16587B]/55">SAATNYA MAIN</p><h2 id="minigame-hub-title" className="mt-0.5 break-words text-xl font-black leading-tight sm:text-2xl">Misi kecil, cerita seru!</h2></div></div><span className="rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-[10px] font-extrabold text-[#16587B]/70 shadow-sm">{snapshot ? `${snapshot.programs.length} petualangan` : "Menyiapkan…"}</span></div>
		{notice && <div role="status" className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[75] mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-start gap-3 rounded-2xl border border-white/80 bg-[#fff9eb] px-4 py-3 text-left text-xs font-black leading-5 text-[#16587B] shadow-[0_16px_50px_rgba(10,35,50,.3)] sm:bottom-6 sm:max-w-xl sm:px-5 sm:py-4 sm:text-sm"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-lg">✨</span><span className="min-w-0 flex-1">{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Tutup progres scan" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#16587B]/5 text-lg text-[#16587B]/60">×</button></div>}
		{!snapshot && <div className="relative z-10 mt-5 grid gap-3 md:grid-cols-2"><div className="h-48 animate-pulse rounded-[1.6rem] bg-white/75"/><div className="h-48 animate-pulse rounded-[1.6rem] bg-white/65"/></div>}
		{snapshot && <div className={`relative z-10 mt-5 grid gap-4 ${snapshot.programs.length > 1 ? "md:grid-cols-2" : "md:grid-cols-1"}`}>{snapshot.programs.map((program) => {
			const mission = summarizeQrMissionProgress(program.findPoints, program.progress.scannedQrPointIds);
			const hasMission = program.components.includes("find_friends");
			const hasPhotobox = program.components.includes("photobox");
			const photoboxLocked = program.photoboxAccessMode === "mission_reward" && !program.progress.completed;
			const celebrating = celebratingAssignments.includes(program.assignmentId);
			const switchingToPhotobox = switchingAssignments.includes(program.assignmentId);
			const showPhotoboxCard = hasPhotobox && ((!hasMission && !photoboxLocked) || (hasMission && program.photoboxAccessMode === "mission_reward" && program.progress.completed && !switchingToPhotobox));
			const missionStatus = mission.completed
				? "Semua teman maskot sudah ditemukan!"
				: mission.pendingRequiredCount > 0
					? "Titik ini sudah di-scan. Temukan prasyaratnya untuk membuka progres."
					: "Cari QR di sekitar, scan, lalu temukan semua teman.";
			const heroIcon = hasMission ? "🐾" : hasPhotobox ? "📸" : "✨";
			return <article key={program.assignmentId} className={`game-program-card game-quest-card-container group relative isolate flex min-w-0 flex-col overflow-hidden rounded-[1.8rem] border-[3px] border-white/90 bg-[linear-gradient(145deg,#fff_0%,#effaff_52%,#e5f6ff_100%)] p-4 text-[#16587B] shadow-[8px_9px_0_rgba(22,88,123,.08),0_20px_42px_-28px_rgba(22,88,123,.48)] transition duration-300 hover:-translate-y-1 hover:shadow-[9px_12px_0_rgba(22,88,123,.08),0_28px_48px_-27px_rgba(22,88,123,.5)] sm:rounded-[2rem] sm:p-5 ${program.progress.completed ? "game-card--complete" : ""} ${showPhotoboxCard ? "game-card--photobox" : ""} ${switchingToPhotobox ? "game-card--switching" : ""}`}>
				<div aria-hidden="true" className="game-card-dots pointer-events-none absolute inset-0 opacity-40" />
				<div aria-hidden="true" className="game-card-orb game-card-orb--one pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full" />
				<div aria-hidden="true" className="game-card-orb game-card-orb--two pointer-events-none absolute -bottom-20 left-[34%] h-44 w-44 rounded-full" />
				<div aria-hidden="true" className="game-quest-spark game-quest-spark--one pointer-events-none absolute right-5 top-5">✦</div>
				<div aria-hidden="true" className="game-quest-spark game-quest-spark--two pointer-events-none absolute bottom-5 left-5">✧</div>
				{celebrating && !showPhotoboxCard && <div className="game-completion-burst pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">{["7%", "18%", "30%", "43%", "56%", "68%", "80%", "92%"].map((left, index) => <span key={left} className="game-burst-particle" style={{ left, animationDelay: `${index * 65}ms` }}>{index % 3 === 0 ? "✦" : index % 3 === 1 ? "✧" : "★"}</span>)}</div>}
				{showPhotoboxCard ? <PhotoboxPassCard program={program} destinationSlug={destinationSlug} celebrating={celebrating} /> : <div className={`game-quest-layout relative z-10 flex-1 ${switchingToPhotobox ? "game-quest-layout--switching" : ""}`}>
					<div className="game-quest-copy flex min-w-0 flex-col justify-center">
						<div className={`game-quest-label mb-4 inline-flex w-fit items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.16em] shadow-[3px_3px_0_rgba(22,88,123,.08)] ${program.progress.completed ? "game-quest-label--complete" : ""}`}>
							<span className={program.progress.completed ? "game-complete-check" : "game-label-fire"} aria-hidden="true">{program.progress.completed ? "✓" : "✦"}</span>
							{program.progress.completed ? "Petualangan tuntas" : hasMission ? "Misi aktif" : "Jelajah bebas"}
						</div>
						<div className="flex min-w-0 items-center gap-3.5">
							<span className={`game-quest-mascot grid h-[4.4rem] w-[4.4rem] shrink-0 place-items-center rounded-[1.45rem] border-[3px] border-white text-[2.15rem] shadow-[0_8px_18px_rgba(22,88,123,.16)] ${program.progress.completed ? "game-quest-mascot--complete" : ""}`} aria-hidden="true">{program.progress.completed ? "🏆" : heroIcon}</span>
							<div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.15em] text-[#16587B]/55">{hasMission ? "PETUALANGAN" : "AKTIVITAS WISATA"}</p><h3 className="mt-1 break-words text-[1.35rem] font-black leading-[1.1] tracking-tight text-[#16587B] sm:text-2xl">{program.programName}</h3></div>
						</div>
						<p className="mt-4 max-w-md border-l-[3px] border-sky-400 pl-3 text-xs font-semibold leading-5 text-[#16587B]/70 sm:text-sm">{hasMission ? "Cari QR tersembunyi dan kumpulkan teman maskot satu per satu!" : hasPhotobox ? "Bikin kenangan seru dengan frame khas destinasi ini." : "Tanya pemandu dan jelajahi cerita seru di sekitar."}</p>
						<div className="mt-4 flex flex-wrap items-center gap-2">
							<span className="game-xp-chip inline-flex items-center gap-1.5 rounded-xl border-2 border-[#f3d780] bg-[linear-gradient(135deg,#fff3b8,#ffe28a)] px-3 py-2 text-[10px] font-black text-[#795516] shadow-[3px_4px_0_rgba(234,179,8,.13)]"><span className="game-xp-star text-base" aria-hidden="true">⭐</span>{program.progress.xp} XP terkumpul</span>
							{program.requiredComponents.length === 0 && <span className="game-free-chip rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-800">🌿 Bebas dimainkan</span>}
						</div>
						<div className="mt-3 flex flex-wrap gap-1.5">{program.components.map((key) => { const component = getMinigameComponent(key); return <span key={key} className="game-component-chip inline-flex items-center gap-1 rounded-full border border-[#84B3CE]/30 bg-white/75 px-2.5 py-1 text-[9px] font-extrabold text-[#16587B]/75">{component?.icon ?? "🧩"} {component?.label ?? key}</span>; })}</div>
					</div>

					<div className="game-progress-panel relative flex min-w-0 flex-col justify-center p-1 sm:p-1">
						{hasMission ? <>
							<div className="game-panel-spark absolute -right-2 -top-4 grid h-10 w-10 place-items-center rounded-2xl border-2 border-white bg-sky-100 text-xl shadow-md" aria-hidden="true">{program.progress.completed ? "✨" : "🌟"}</div>
							<div className="flex items-end justify-between gap-3 pr-6"><div><p className="mb-2 inline-flex rounded-lg bg-sky-100 px-2 py-1 text-[8px] font-black uppercase tracking-[.15em] text-sky-800">{program.progress.completed ? "Quest cleared" : "Progress misi"}</p><h4 className="text-xs font-black text-[#16587B] sm:text-sm">Temukan teman maskot</h4></div><span className={`game-progress-count text-2xl font-black leading-none tabular-nums text-blue-700 sm:text-3xl ${program.progress.completed ? "game-count-complete" : ""}`}>{mission.foundRequiredCount}<span className="text-sm font-bold text-[#16587B]/45 sm:text-base"> / {mission.requiredCount}</span></span></div>
							<div className="game-progress-track relative mt-4 h-7 overflow-hidden rounded-full border-2 border-white bg-[#16587B]/10 p-1 shadow-[inset_0_2px_4px_rgba(22,88,123,.14)]" role="progressbar" aria-label="Progres teman maskot ditemukan" aria-valuemin={0} aria-valuemax={mission.requiredCount} aria-valuenow={mission.foundRequiredCount} aria-valuetext={`${mission.foundRequiredCount} dari ${mission.requiredCount} titik misi ditemukan`}>
								<span className={`game-progress-fill relative block h-full overflow-hidden rounded-full ${mission.completed ? "game-progress-fill--complete" : ""}`} style={{ width: `${mission.completionPercent}%` }}><span className="game-progress-stripes absolute inset-0" /></span>
								<span className="game-progress-star absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${Math.min(95, Math.max(5, mission.completionPercent))}%` }} aria-hidden="true">✦</span>
							</div>
							<div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[9px] font-bold text-[#16587B]/60 sm:text-[10px]"><span>{mission.scannedRequiredCount} titik di-scan</span>{mission.bonusFoundCount > 0 && <span className="game-bonus-chip rounded-full bg-white/70 px-2 py-1 text-amber-800">✨ +{mission.bonusFoundCount} bonus</span>}</div>
							<p className={`game-mission-status mt-2 min-h-8 border-l-2 border-sky-300 py-1 pl-2 text-[10px] font-bold leading-4 text-[#16587B]/70 sm:text-[11px] ${mission.completed ? "game-mission-status--complete" : ""}`} aria-live="polite">{missionStatus}</p>
							{hasPhotobox && photoboxLocked && <p className="game-reward-hint mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-extrabold text-amber-900">🎁 Frame Photobox terbuka setelah misi</p>}
							<div className="mt-auto flex flex-wrap gap-2 pt-4">
								<Link href={`/minigame/${encodeURIComponent(program.programSlug)}/${encodeURIComponent(destinationSlug)}`} className="game-primary-action game-cta-idle inline-flex min-h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl border-2 border-blue-950/50 bg-[linear-gradient(180deg,#438ff0,#1760c3)] px-4 py-3 text-center text-xs font-black leading-tight text-white shadow-[0_6px_0_#11488f,0_12px_20px_rgba(23,96,195,.2)] transition duration-200 hover:-translate-y-0.5 hover:saturate-125 hover:shadow-[0_8px_0_#11488f,0_16px_26px_rgba(23,96,195,.25)] active:translate-y-1 active:shadow-[0_2px_0_#11488f,0_5px_10px_rgba(23,96,195,.2)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/70"><span className="text-lg" aria-hidden="true">{mission.completed ? "🧭" : "📍"}</span><span>{mission.completed ? "Lihat petualangan" : mission.scannedRequiredCount > 0 ? "Lanjutkan misi" : "Mulai scan QR"}</span><span className="game-cta-arrow" aria-hidden="true">→</span></Link>
								{hasPhotobox && !photoboxLocked && !switchingToPhotobox && <Link href={`/photobox/${encodeURIComponent(program.programSlug)}/${encodeURIComponent(destinationSlug)}`} aria-label="Buka Photobox yang sudah terbuka" className="game-secondary-action inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-[#84B3CE]/45 bg-white/85 px-4 py-3 text-xs font-black text-[#16587B] transition hover:-translate-y-0.5 hover:bg-[#EAF6FC] active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#84B3CE]/35"><span className="text-lg" aria-hidden="true">📸</span>Photobox</Link>}
							</div>
						</> : <>
							<div className="flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-2 border-white bg-sky-100 text-2xl shadow-md" aria-hidden="true">{hasPhotobox ? "📸" : "💬"}</span><div><p className="text-[8px] font-black uppercase tracking-[.15em] text-sky-800">{hasPhotobox ? "STUDIO KENANGAN" : "TEMAN JELAJAH"}</p><h4 className="mt-1 text-sm font-black text-[#16587B]">{hasPhotobox ? "Siap bikin foto seru?" : "Ada cerita untuk dijelajahi!"}</h4></div></div>
							<p className="mt-3 text-[10px] font-semibold leading-4 text-[#16587B]/65">{program.requiredComponents.length === 0 ? "Aktivitas ini bisa dinikmati tanpa misi wajib." : "Mulai aktivitasmu dari sini."}</p>
							<div className="mt-auto flex flex-wrap gap-2 pt-4">
								{hasPhotobox && !photoboxLocked && <Link href={`/photobox/${encodeURIComponent(program.programSlug)}/${encodeURIComponent(destinationSlug)}`} className="game-primary-action game-cta-idle inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-blue-950/50 bg-[linear-gradient(180deg,#438ff0,#1760c3)] px-4 py-3 text-xs font-black text-white shadow-[0_6px_0_#11488f,0_12px_20px_rgba(23,96,195,.2)] transition hover:-translate-y-0.5 active:translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/70"><span aria-hidden="true">📸</span>Buka Photobox<span className="game-cta-arrow" aria-hidden="true">→</span></Link>}
								{hasPhotobox && photoboxLocked && <span className="game-reward-hint inline-flex min-h-12 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-extrabold text-amber-900">🔒 Photobox menunggu misi</span>}
								{!hasPhotobox && program.components.includes("chat_ai") && <button type="button" onClick={() => { document.getElementById("guide-chat-title")?.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById("tourism-chat-input")?.focus({ preventScroll: true }); }} className="game-primary-action game-cta-idle inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-blue-950/50 bg-[linear-gradient(180deg,#438ff0,#1760c3)] px-4 py-3 text-xs font-black text-white shadow-[0_6px_0_#11488f,0_12px_20px_rgba(23,96,195,.2)] transition hover:-translate-y-0.5 active:translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/70"><span aria-hidden="true">💬</span>Tanya pemandu<span className="game-cta-arrow" aria-hidden="true">→</span></button>}
							</div>
						</>}
						{program.progress.completed && hasPhotobox && !switchingToPhotobox && <div className="game-unlocked-ribbon mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-800" role="status">🎉 Misi tuntas · Photobox terbuka untukmu!</div>}
					</div>
				</div>}
			</article>;
		})}</div>}
                {campaign && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="game-campaign-title" className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/80 bg-[#fff9eb] p-5 text-[#16587B] shadow-2xl sm:p-7"><button type="button" onClick={() => setCampaign(null)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-2xl" aria-label="Tutup kampanye">×</button><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-700">{campaign.experienceType === "photobox" ? "Kenangan & partner wisata" : "Selingan petualangan"}</p>{campaign.imageUrl && <img src={campaign.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded-2xl object-cover"/>}<h3 id="game-campaign-title" className="mt-3 pr-8 text-2xl font-black">{campaign.title}</h3>{campaign.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#16587B]/75">{campaign.description}</p>}<div className="mt-5 space-y-2"><button type="button" onClick={() => setCampaign(null)} className="min-h-11 w-full rounded-xl border border-[#84B3CE]/35 bg-white px-3 text-xs font-bold">Nanti saja</button><CampaignFormExperience campaignId={campaign.id} pageKey="minigame" destinationSlug={destinationSlug} fallbackHref={campaign.ctaUrl || `/${campaign.experienceType === "photobox" ? "photobox" : "minigame"}/${encodeURIComponent(campaign.programSlug)}/${encodeURIComponent(destinationSlug)}`} fallbackLabel={campaign.ctaLabel || (campaign.experienceType === "photobox" ? "Buka Photobox" : "Lanjutkan")} onNavigate={() => setCampaign(null)} /></div></section></div>}
	</section>;
}
