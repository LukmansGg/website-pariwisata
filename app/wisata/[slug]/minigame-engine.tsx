"use client";

import Image from "next/image";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RouteStep = {
	id: string;
	name: string;
	order: number;
	latitude: number;
	longitude: number;
	scanRadiusMeters: number;
	campaigns: Campaign[];
};
type Campaign = {
	id: string;
	title: string;
	description: string;
	imageUrl: string | null;
	ctaLabel: string | null;
	ctaUrl: string | null;
	experienceType?: "popup" | "minigame" | "photobox";
	latitude?: number;
	longitude?: number;
	maxDistanceMeters?: number;
};
type Progress = { visitedQrPointIds: string[]; xp: number; photosCreated: number; completed: boolean; completedAt: string | null };
type Snapshot = { games: string[]; photoboxAccessMode: "standalone" | "mission_reward"; steps: RouteStep[]; passiveCampaigns: Campaign[]; progress: Progress };
type Props = {
	destinationSlug: string;
	destinationName: string;
	destinationDescription?: string;
	destinationAddress?: string | null;
	destinationTags?: string[];
	games: string[];
	initialQrCode?: string;
	initialGame?: "photobox";
	onClose: () => void;
};

const EMPTY_PROGRESS: Progress = { visitedQrPointIds: [], xp: 0, photosCreated: 0, completed: false, completedAt: null };
const BADGES = [
	{ id: "first", icon: "🐾", title: "Teman Pertama", detail: "Menemukan maskot pertama" },
	{ id: "explorer", icon: "🗺️", title: "Penjelajah", detail: "Menyelesaikan 3 titik QR" },
	{ id: "route", icon: "🏁", title: "Rute Tuntas", detail: "Menyelesaikan rangkaian Find Our Friends" },
	{ id: "photo", icon: "📸", title: "Kenangan Pertama", detail: "Membuat foto perjalanan" },
	{ id: "level", icon: "⭐", title: "Bintang Perjalanan", detail: "Mengumpulkan 100 XP" },
];

function getQrCode(value: string) {
	const text = value.trim();
	try {
		const url = new URL(text, window.location.origin);
		const queryCode = url.searchParams.get("qr") ?? url.searchParams.get("code");
		if (queryCode && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(queryCode)) return queryCode.toLowerCase();
		const parts = url.pathname.split("/").filter(Boolean);
		const qrIndex = parts.lastIndexOf("qr");
		if (qrIndex >= 0 && parts[qrIndex + 1] && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(parts[qrIndex + 1])) return parts[qrIndex + 1].toLowerCase();
	} catch { /* Text QR can also be a bare code. */ }
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(text) ? text.toLowerCase() : null;
}

function getPosition() {
	return new Promise<GeolocationPosition>((resolve, reject) => {
		if (!navigator.geolocation) { reject(new Error("LOCATION_UNAVAILABLE")); return; }
		navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
	});
}

function formatCampaignUrl(value: string | null) {
	if (!value) return null;
	if (value.startsWith("/") && !value.startsWith("//")) return value;
	try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; }
	catch { return null; }
}

function makeCaption(name: string, address: string | null | undefined, description: string | undefined, tags: string[] | undefined) {
	const hashtags = (tags ?? []).slice(0, 8).map((tag) => "#" + tag.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "")).filter((tag) => tag.length > 1);
	return [`Jelajah ${name} ✨`, address?.trim() || "Wisata lokal Madiun", description?.trim().slice(0, 180), [...hashtags, "#MadiunTrip", "#JelajahMadiun"].join(" ")].filter(Boolean).join("\n\n");
}

function drawWrappedText(context: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
	const words = value.split(/\s+/);
	let line = "";
	let lines = 0;
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (context.measureText(next).width > maxWidth && line) {
			context.fillText(line, x, y + lines * lineHeight, maxWidth);
			line = word;
			lines += 1;
			if (lines >= maxLines) return;
		} else line = next;
	}
	if (line && lines < maxLines) context.fillText(line, x, y + lines * lineHeight, maxWidth);
}

export default function MinigameEngine({ destinationSlug, destinationName, destinationDescription, destinationAddress, destinationTags, games, initialQrCode, initialGame, onClose }: Props) {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState("");
	const [activeGame, setActiveGame] = useState<"find_friends" | "photobox" | null>(null);
	const [qrStatus, setQrStatus] = useState("");
	const [unlockedCampaign, setUnlockedCampaign] = useState<Campaign | null>(null);
	const [photoStatus, setPhotoStatus] = useState("");
	const [cameraOn, setCameraOn] = useState(false);
	const [photoUrl, setPhotoUrl] = useState("");
	const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
	const videoRef = useRef<HTMLVideoElement>(null);
	const qrControlsRef = useRef<IScannerControls | null>(null);
	const cameraStreamRef = useRef<MediaStream | null>(null);
	const handledQrRef = useRef(false);
	const initialQrHandledRef = useRef(false);
	const initialGameHandledRef = useRef(false);

	const progress = snapshot?.progress ?? EMPTY_PROGRESS;
	const routeSteps = snapshot?.steps ?? [];
	const visited = new Set(progress.visitedQrPointIds);
	const nextStep = routeSteps.find((step) => !visited.has(step.id));
	const level = Math.floor(progress.xp / 100) + 1;
	const levelProgress = progress.xp % 100;
	const hasFindFriends = (snapshot?.games ?? games).includes("find_friends");
	const hasPhotobox = (snapshot?.games ?? games).includes("photobox");
	const photoboxLocked = snapshot?.photoboxAccessMode === "mission_reward" && !progress.completed;
	const badges = useMemo(() => BADGES.map((badge) => ({ ...badge, earned: badge.id === "first" ? progress.visitedQrPointIds.length > 0 : badge.id === "explorer" ? progress.visitedQrPointIds.length >= 3 : badge.id === "route" ? progress.completed : badge.id === "photo" ? progress.photosCreated > 0 : progress.xp >= 100 })), [progress]);
	const caption = useMemo(() => makeCaption(destinationName, destinationAddress, destinationDescription, destinationTags), [destinationAddress, destinationDescription, destinationName, destinationTags]);

	const loadState = useCallback(async () => {
		setLoadError("");
		try {
			const response = await fetch(`/api/minigame/state?destinationSlug=${encodeURIComponent(destinationSlug)}`, { cache: "no-store" });
			const result = await response.json() as Snapshot & { error?: string };
			if (!response.ok || result.error) throw new Error(result.error || "Data petualangan belum tersedia.");
			setSnapshot(result);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : "Data petualangan belum tersedia.");
		} finally { setLoading(false); }
	}, [destinationSlug]);

	useEffect(() => { void loadState(); }, [loadState]);
	useEffect(() => {
		if (!snapshot || initialGameHandledRef.current || !initialGame) return;
		initialGameHandledRef.current = true;
		if (initialGame === "photobox" && (snapshot.photoboxAccessMode === "standalone" || snapshot.progress.completed)) setActiveGame("photobox");
		else setPhotoStatus("Photobox ini hadiah misi. Selesaikan rangkaian Find Our Friends terlebih dahulu.");
	}, [initialGame, snapshot]);
	useEffect(() => {
		const oldOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { stopCameras(); onClose(); } };
		window.addEventListener("keydown", onKey);
		return () => { document.body.style.overflow = oldOverflow; window.removeEventListener("keydown", onKey); };
	// stopCameras is declared below and the close callback is stable in the parent.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [onClose]);
	useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

	const stopCameras = useCallback(() => {
		qrControlsRef.current?.stop();
		qrControlsRef.current = null;
		cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
		cameraStreamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
		setCameraOn(false);
	}, []);
	useEffect(() => () => stopCameras(), [stopCameras]);

	const awardQr = useCallback(async (rawCode: string) => {
		const code = getQrCode(rawCode);
		if (!code) { setQrStatus("Format QR belum dikenali. Gunakan QR resmi di titik wisata."); return; }
		setUnlockedCampaign(null);
		setQrStatus("Memastikan posisi kamu dekat dengan titik QR…");
		try {
			const position = await getPosition();
			const response = await fetch("/api/minigame/scan", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ destinationSlug, code, latitude: position.coords.latitude, longitude: position.coords.longitude }),
			});
			const result = await response.json() as { error?: string; status?: string; name?: string; awardXp?: number; expectedName?: string; distanceMeters?: number; scanRadiusMeters?: number; maximumLegMeters?: number; campaigns?: Campaign[] };
			if (!response.ok || result.error) {
				const messages: Record<string, string> = {
					QR_NOT_IN_MISSION: "QR ini bukan bagian rangkaian Find Our Friends di wisata ini.",
					OUT_OF_ORDER: `Urutannya belum tepat. Cari dulu QR: ${result.expectedName || "titik sebelumnya"}.`,
					TOO_FAR: `Kamu masih sekitar ${result.distanceMeters ?? ""} m dari QR. Dekati titiknya (radius ${result.scanRadiusMeters ?? 150} m), lalu pindai lagi.`,
					ROUTE_GAP: `Titik berikutnya terlalu jauh dari langkah sebelumnya. Batas rute ${result.maximumLegMeters ?? 2000} m. Hubungi petugas wisata.`,
					LOCATION_REQUIRED: "Izinkan akses lokasi agar QR hanya bisa diselesaikan saat berada di titik wisata.",
					LOCATION_UNAVAILABLE: "Lokasi tidak tersedia di browser ini. Aktifkan GPS dan izinkan lokasi untuk memindai.",
					MISSION_EMPTY: "Rangkaian misi belum memiliki titik QR. Petugas perlu menambahkannya dulu.",
					MINIGAME_NOT_AVAILABLE: "Find Our Friends belum aktif di destinasi ini.",
				};
				const errorKey = result.error ?? "";
				setQrStatus(messages[errorKey] || "Scan belum bisa diproses. Periksa lokasi dan coba lagi.");
				return;
			}
			await loadState();
			setUnlockedCampaign(result.campaigns?.[0] ?? null);
			setQrStatus(result.status === "already_scanned" ? "Titik ini sudah tercatat. Lanjutkan ke QR berikutnya." : `Teman ditemukan di ${result.name}! +${result.awardXp} XP${result.awardXp && result.awardXp > 50 ? " · bonus misi tuntas" : ""}`);
		} catch (error) {
			const locationError = typeof error === "object" && error !== null && "code" in error && typeof error.code === "number";
			const permissionDenied = locationError && error.code === 1;
			setQrStatus(permissionDenied ? "Izin lokasi belum diberikan. Izinkan lokasi untuk memastikan kamu berada di titik QR." : error instanceof Error && error.message === "LOCATION_UNAVAILABLE" ? "Lokasi tidak tersedia. Aktifkan GPS dan coba lagi." : "Lokasi atau koneksi belum siap. Coba lagi saat GPS dan internet aktif.");
		}
	}, [destinationSlug, loadState]);

	useEffect(() => {
		if (!initialQrCode || initialQrHandledRef.current || loading || !hasFindFriends) return;
		initialQrHandledRef.current = true;
		void awardQr(initialQrCode);
	}, [awardQr, hasFindFriends, initialQrCode, loading]);

	async function startQrScanner() {
		if (!videoRef.current || cameraStreamRef.current) return;
		if (!navigator.mediaDevices?.getUserMedia) { setQrStatus("Kamera tidak tersedia. Coba buka halaman QR lewat kamera perangkat."); return; }
		setQrStatus("");
		handledQrRef.current = false;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } });
			cameraStreamRef.current = stream;
			videoRef.current.srcObject = stream;
			await videoRef.current.play();
			setCameraOn(true);
			const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 160, delayBetweenScanSuccess: 700, tryPlayVideoTimeout: 10000 });
			const controls = await reader.decodeFromStream(stream, videoRef.current, (result, _error, callbackControls) => {
				if (!result || handledQrRef.current) return;
				handledQrRef.current = true;
				callbackControls.stop();
				qrControlsRef.current = null;
				stopCameras();
				void awardQr(result.getText());
			});
			if (handledQrRef.current) controls.stop();
			else qrControlsRef.current = controls;
		} catch (error) {
			cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
			cameraStreamRef.current = null;
			setCameraOn(false);
			setQrStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Izin kamera belum diberikan. Izinkan kamera di pengaturan browser." : "Kamera gagal dibuka. Pastikan kamera tidak sedang dipakai aplikasi lain.");
		}
	}

	async function startPhotoCamera(facing: "user" | "environment" = cameraFacing) {
		if (!videoRef.current || cameraStreamRef.current) return;
		if (!navigator.mediaDevices?.getUserMedia) { setPhotoStatus("Kamera tidak tersedia di perangkat ini."); return; }
		setPhotoStatus("");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1440 }, height: { ideal: 1080 } } });
			cameraStreamRef.current = stream;
			videoRef.current.srcObject = stream;
			await videoRef.current.play();
			setCameraOn(true);
		} catch (error) {
			cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
			cameraStreamRef.current = null;
			setPhotoStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Izin kamera belum diberikan. Kamu bisa mengizinkannya lewat pengaturan browser." : "Kamera gagal dibuka. Coba tutup aplikasi kamera lain lalu ulangi.");
		}
	}

	async function capturePhoto() {
		const video = videoRef.current;
		if (!video || !video.videoWidth) { setPhotoStatus("Kamera belum siap. Tunggu sebentar lalu coba lagi."); return; }
		const canvas = document.createElement("canvas");
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const context = canvas.getContext("2d");
		if (!context) { setPhotoStatus("Foto belum bisa dibuat di browser ini."); return; }
		if (cameraFacing === "user") { context.translate(canvas.width, 0); context.scale(-1, 1); }
		context.drawImage(video, 0, 0, canvas.width, canvas.height);
		context.setTransform(1, 0, 0, 1, 0, 0);
		const frame = Math.max(14, Math.round(canvas.width * .018));
		context.strokeStyle = "#F5EEDD";
		context.lineWidth = frame;
		context.strokeRect(frame / 2, frame / 2, canvas.width - frame, canvas.height - frame);
		try {
			const mascot = new window.Image();
			mascot.src = "/maskot/frame_0.png";
			await new Promise<void>((resolve, reject) => { mascot.onload = () => resolve(); mascot.onerror = () => reject(new Error("Maskot tidak dapat dimuat")); });
			const mascotSize = Math.min(canvas.width * .23, 280);
			context.drawImage(mascot, canvas.width - mascotSize - frame, canvas.height - mascotSize - frame * 1.4, mascotSize, mascotSize);
		} catch { /* Keep the destination frame useful if the mascot asset is unavailable. */ }
		const panelHeight = Math.max(154, Math.round(canvas.height * .19));
		context.fillStyle = "rgba(16,47,67,.88)";
		context.fillRect(frame, canvas.height - panelHeight - frame, canvas.width - frame * 2, panelHeight);
		context.fillStyle = "#F5EEDD";
		context.textBaseline = "top";
		context.font = `800 ${Math.max(22, Math.round(canvas.width * .033))}px system-ui, sans-serif`;
		drawWrappedText(context, `MADIUNTRIP  ·  ${destinationName}`, frame * 2, canvas.height - panelHeight + frame * .4, canvas.width - frame * 4, Math.max(26, canvas.width * .04), 1);
		context.font = `600 ${Math.max(14, Math.round(canvas.width * .016))}px system-ui, sans-serif`;
		const info = [destinationAddress, destinationDescription?.trim()].filter(Boolean).join("  ·  ");
		drawWrappedText(context, info || "Kenangan indah dari perjalananmu di Madiun.", frame * 2, canvas.height - panelHeight + frame * 2.4, canvas.width - frame * 4, Math.max(20, canvas.width * .025), 2);
		const hashtagLine = [...(destinationTags ?? []).slice(0, 5).map((tag) => "#" + tag.replace(/[^a-z0-9]/gi, "")), "#MadiunTrip", "#JelajahMadiun"].join("  ");
		context.font = `700 ${Math.max(12, Math.round(canvas.width * .013))}px system-ui, sans-serif`;
		drawWrappedText(context, hashtagLine, frame * 2, canvas.height - panelHeight + frame * 5.2, canvas.width - frame * 4, Math.max(18, canvas.width * .022), 1);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
		if (!blob) { setPhotoStatus("Foto belum bisa dibuat. Coba lagi."); return; }
		if (photoUrl) URL.revokeObjectURL(photoUrl);
		setPhotoUrl(URL.createObjectURL(blob));
		stopCameras();
		setPhotoStatus("Foto siap! File tetap di perangkatmu. Simpan atau bagikan caption-nya.");
		try {
			const response = await fetch("/api/minigame/photobox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinationSlug }) });
			const result = await response.json() as { error?: string };
			if (!response.ok || result.error) {
				if (result.error === "PHOTOBOX_LOCKED") setPhotoStatus("Foto sudah jadi, tetapi hadiah Photobox baru dihitung setelah seluruh QR misi selesai.");
				else setPhotoStatus("Foto sudah jadi dan tersimpan di perangkat. Progres XP belum tersinkron; coba buka ulang saat tersambung internet.");
			} else await loadState();
		} catch { setPhotoStatus("Foto sudah jadi dan tersimpan di perangkat. Progres XP belum tersinkron; coba buka ulang saat tersambung internet."); }
	}

	async function sharePhoto() {
		if (!photoUrl) return;
		try {
			const blob = await (await fetch(photoUrl)).blob();
			const file = new File([blob], `madiuntrip-${destinationSlug}.png`, { type: "image/png" });
			if (navigator.share && navigator.canShare?.({ files: [file] })) {
				await navigator.share({ title: `Jelajah ${destinationName}`, text: caption, files: [file] });
				setPhotoStatus("Foto berhasil dibagikan.");
			} else {
				await navigator.clipboard.writeText(caption);
				setPhotoStatus("Caption dan hashtag disalin. Unduh foto, lalu unggah bersama caption ini.");
			}
		} catch { setPhotoStatus("Bagikan dibatalkan. Kamu tetap bisa mengunduh foto."); }
	}

	const heading = activeGame === "find_friends" ? "Find Our Friends" : activeGame === "photobox" ? "Photobox Jelajah" : "Papan Petualangan";

	return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#102F43]/75 p-2 backdrop-blur-md sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) { stopCameras(); onClose(); } }}>
		<section role="dialog" aria-modal="true" aria-labelledby="game-title" className="flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] border border-white/80 bg-[#F5EEDD] text-[#16587B] shadow-2xl sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-[2rem]">
			<header className="relative shrink-0 overflow-hidden bg-[#16587B] px-4 py-4 text-white sm:px-8 sm:py-6"><div aria-hidden="true" className="absolute -right-12 -top-16 h-56 w-56 rounded-full border border-white/20" /><div className="relative z-10 flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.19em] text-white/65 sm:text-[10px]">MADIUNTRIP · PLAY & EXPLORE</p><h2 id="game-title" className="mt-1 text-2xl font-black leading-tight sm:mt-2 sm:text-4xl">{heading} ✨</h2><p className="mt-1 truncate text-xs text-white/75 sm:mt-2 sm:text-sm">{destinationName} · Level {level}</p></div><button type="button" onClick={() => { stopCameras(); onClose(); }} aria-label="Tutup permainan" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-2xl hover:bg-white/20">×</button></div><div className="relative z-10 mt-4 grid gap-2 sm:mt-5 sm:grid-cols-[1fr_auto] sm:items-end"><div><div className="mb-1.5 flex justify-between gap-2 text-[10px] font-bold sm:text-xs"><span>⭐ {progress.xp} XP</span><span>{levelProgress}/100 menuju level {level + 1}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#F5EEDD] transition-all duration-700" style={{ width: `${levelProgress}%` }} /></div></div><div className="flex items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 sm:block sm:px-4 sm:py-2 sm:text-center"><span className="text-sm font-black sm:block sm:text-xl">{badges.filter((badge) => badge.earned).length}/{BADGES.length}</span><span className="text-[9px] font-black uppercase tracking-wider text-white/70 sm:text-[9px]"> badge</span></div></div></header>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-7">
				{loading && <div className="grid min-h-48 place-items-center text-sm font-semibold">Menyiapkan progres petualangan…</div>}
				{!loading && loadError && <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center"><p className="font-bold">Progres belum dapat dimuat</p><p className="mt-2 text-sm">{loadError}</p><button type="button" onClick={() => { setLoading(true); void loadState(); }} className="mt-4 min-h-11 rounded-xl bg-[#16587B] px-5 text-sm font-bold text-white">Coba lagi</button></div>}
				{!loading && !loadError && activeGame === null && <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(250px,.8fr)]">
					<div className="space-y-4">
						{hasFindFriends && <article className="rounded-[1.4rem] border border-[#84B3CE]/50 bg-white/85 p-4 shadow-sm sm:p-6"><div className="flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#84B3CE]/25 text-2xl sm:h-14 sm:w-14 sm:text-3xl">🧭</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">Find Our Friends</h3><span className="rounded-full bg-[#84B3CE]/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide">+30–50 XP</span></div><p className="mt-1.5 text-xs leading-5 text-[#16587B]/70 sm:mt-2 sm:text-sm sm:leading-6">Temukan teman maskot dalam rute berurutan. QR berikutnya baru terbuka setelah kamu mengunjungi titik sebelumnya.</p></div></div>
							<div className="mt-4 rounded-2xl bg-[#F5EEDD] p-3 sm:mt-5 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-extrabold">Rangkaian misi</p><p className="mt-0.5 text-[10px] text-[#16587B]/60">{progress.visitedQrPointIds.length}/{routeSteps.length} titik QR selesai</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black ${progress.completed ? "bg-emerald-100 text-emerald-800" : "bg-white text-[#16587B]"}`}>{progress.completed ? "Misi tuntas 🎉" : nextStep ? `Selanjutnya · ${nextStep.name}` : "Rute belum siap"}</span></div>
								{routeSteps.length ? <ol className="mt-3 space-y-2">{routeSteps.map((step) => { const done = visited.has(step.id); const current = step.id === nextStep?.id; return <li key={step.id} className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 ${done ? "border-emerald-200 bg-emerald-50" : current ? "border-[#16587B]/30 bg-white shadow-sm" : "border-[#84B3CE]/20 bg-white/55 opacity-70"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${done ? "bg-emerald-600 text-white" : "bg-[#16587B] text-white"}`}>{done ? "✓" : step.order}</span><span className="min-w-0 flex-1 truncate text-xs font-bold">{step.name}</span><span className="shrink-0 text-[10px] font-semibold text-[#16587B]/55">±{step.scanRadiusMeters} m</span></li>; })}</ol> : <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Rute belum memiliki titik QR. Petugas perlu menambahkan QR berkoordinat di dashboard petugas.</p>}
								{nextStep?.campaigns?.map((campaign) => <div key={campaign.id} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-amber-800">Misi campaign · scan di langkah ini</p><p className="mt-1 text-sm font-bold text-amber-950">{campaign.title}</p>{campaign.description && <p className="mt-1 text-xs leading-5 text-amber-900/75">{campaign.description}</p>}</div>)}
								<div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] leading-4 text-[#16587B]/60">Posisi diperiksa saat scan. Setiap titik dan setiap hadiah hanya dihitung satu kali.</p><button type="button" onClick={() => { setActiveGame("find_friends"); setQrStatus(""); }} disabled={!routeSteps.length || progress.completed} className="min-h-11 w-full rounded-xl bg-[#16587B] px-4 text-xs font-black text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-55 sm:w-auto">{progress.completed ? "Rute selesai ✓" : "Mulai misi →"}</button></div>{qrStatus && <p role="status" className="mt-3 rounded-xl border border-[#84B3CE]/35 bg-white p-3 text-xs font-bold">{qrStatus}</p>}</div>
						</article>}
						{hasPhotobox && <article className="rounded-[1.4rem] border border-[#84B3CE]/50 bg-white/85 p-4 shadow-sm sm:p-6"><div className="flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#84B3CE]/25 text-2xl sm:h-14 sm:w-14 sm:text-3xl">📸</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">Photobox Jelajah</h3><span className="rounded-full bg-[#84B3CE]/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide">+30 XP pertama</span></div><p className="mt-1.5 text-xs leading-5 text-[#16587B]/70 sm:mt-2 sm:text-sm sm:leading-6">Foto dengan maskot, bingkai destinasi, ringkasan lokasi, dan hashtag yang siap dibagikan.</p></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F5EEDD] p-3"><div><p className="text-xs font-extrabold">{progress.photosCreated} kenangan dibuat</p><p className="mt-0.5 text-[10px] text-[#16587B]/60">{photoboxLocked ? "Hadiah terbuka setelah misi tuntas." : "File foto disimpan di perangkatmu."}</p></div><button type="button" onClick={() => { setActiveGame("photobox"); setPhotoStatus(""); }} disabled={photoboxLocked} className="min-h-11 w-full rounded-xl bg-[#16587B] px-4 text-xs font-black text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{photoboxLocked ? "🔒 Selesaikan misi" : "Buka photobox →"}</button></div>{photoboxLocked && <p className="mt-2 text-[10px] text-[#16587B]/60">Photobox ini hadiah final Find Our Friends.</p>}</article>}
						{!hasFindFriends && !hasPhotobox && <article className="rounded-[1.4rem] border border-[#84B3CE]/40 bg-white/85 p-6 text-center"><p className="text-3xl">🌿</p><h3 className="mt-2 font-black">Belum ada minigame di sini</h3><p className="mt-1 text-sm text-[#16587B]/65">Petugas belum mengaktifkan Find Our Friends atau Photobox.</p></article>}
						{snapshot?.passiveCampaigns?.length ? <section className="rounded-[1.4rem] border border-amber-200 bg-amber-50/75 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Campaign di sekitar</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{snapshot.passiveCampaigns.map((campaign) => <div key={campaign.id} className="rounded-xl border border-amber-200/75 bg-white/80 p-3"><p className="text-xs font-extrabold">{campaign.title}</p><p className="mt-1 text-[10px] leading-4 text-[#16587B]/65">{campaign.description || "Promo dari mitra lokal di dekat titik QR."}</p><p className="mt-2 text-[9px] font-bold text-[#16587B]/55">Muncul saat kamu berada dalam radius {campaign.maxDistanceMeters} m.</p></div>)}</div></section> : null}
					</div>
					<aside className="rounded-[1.4rem] border border-[#84B3CE]/40 bg-white/70 p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#16587B]/55">KOLEKSI PERJALANAN</p><h3 className="mt-1 text-lg font-black">Badge</h3></div><span className="rounded-full bg-[#16587B] px-3 py-1.5 text-[10px] font-black text-white">{badges.filter((badge) => badge.earned).length}/{BADGES.length}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{badges.map((badge) => <div key={badge.id} className={`flex items-center gap-3 rounded-xl border p-3 ${badge.earned ? "border-[#84B3CE]/55 bg-[#84B3CE]/20" : "border-[#84B3CE]/20 bg-white/55 opacity-60"}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-lg">{badge.earned ? badge.icon : "🔒"}</span><div><p className="text-xs font-extrabold">{badge.title}</p><p className="mt-0.5 text-[10px] leading-4 text-[#16587B]/65">{badge.detail}</p></div>{badge.earned && <span className="ml-auto text-sm">✓</span>}</div>)}</div><p className="mt-3 rounded-xl border border-[#84B3CE]/30 bg-[#F5EEDD] p-3 text-[10px] leading-5 text-[#16587B]/65">XP tersimpan aman di progres anonim pengunjung. Tidak ada hadiah uang atau nilai tukar.</p></aside>
				</div>}

				{!loading && !loadError && activeGame !== null && <div className="mx-auto grid w-full max-w-3xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]"><div className="min-w-0"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#16587B]/55">{destinationName}</p><h3 className="text-xl font-black sm:text-2xl">{activeGame === "find_friends" ? "Scan langkah berikutnya 🐾" : "Ambil kenangan 📸"}</h3></div><button type="button" onClick={() => { stopCameras(); setActiveGame(null); }} className="min-h-10 shrink-0 rounded-xl border border-[#84B3CE]/45 bg-white px-3 text-sm font-bold">Kembali</button></div><div className="relative aspect-[4/3] max-h-[min(45dvh,390px)] overflow-hidden rounded-2xl border-4 border-white bg-[#16587B] shadow-inner sm:rounded-[1.5rem]"><video ref={videoRef} muted playsInline className={`h-full w-full object-cover ${activeGame === "photobox" && cameraFacing === "user" ? "scale-x-[-1]" : ""}`} /><div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[72%] w-[72%] rounded-[1.5rem] border-2 border-dashed border-white/75 shadow-[0_0_0_999px_rgba(16,47,67,.15)]" /></div>{activeGame === "photobox" && <div className="pointer-events-none absolute bottom-1 left-2 h-20 w-20 sm:h-28 sm:w-28"><Image src="/maskot/frame_0.png" alt="Maskot MadiunTrip" fill unoptimized sizes="112px" className="object-contain drop-shadow-lg" /></div>}{!cameraOn && <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#16587B] to-[#84B3CE] px-5 text-center text-white"><div><span className="text-4xl sm:text-5xl">{activeGame === "find_friends" ? "📍" : "✨"}</span><p className="mt-2 text-xs font-bold leading-5 sm:mt-3 sm:text-sm sm:leading-6">{activeGame === "find_friends" ? `Arahkan kamera ke QR ${nextStep?.name ?? "langkah berikutnya"}. Lokasi kamu juga akan diperiksa.` : "Atur pose dan ambil foto bersama maskot."}</p></div></div>}</div>
						{activeGame === "find_friends" ? <><p className="mt-3 text-xs leading-5 text-[#16587B]/70">Langkah aktif: <strong>{nextStep?.name}</strong>. Kamu perlu berada maksimal {nextStep?.scanRadiusMeters ?? 150} m dari titik QR.</p>{nextStep?.campaigns?.map((campaign) => <div key={campaign.id} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black">{campaign.title}</p><p className="mt-1 text-[10px] leading-4 text-amber-900/75">{campaign.description}</p></div>)}{qrStatus && <p role="status" className="mt-3 rounded-xl border border-[#84B3CE]/35 bg-white/80 p-3 text-xs font-bold">{qrStatus}</p>}{unlockedCampaign && <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase tracking-wide text-emerald-800">Campaign terbuka</p><p className="mt-1 text-sm font-black text-emerald-950">{unlockedCampaign.title}</p>{unlockedCampaign.description && <p className="mt-1 text-[10px] leading-4 text-emerald-900/75">{unlockedCampaign.description}</p>}{formatCampaignUrl(unlockedCampaign.ctaUrl) && <a href={formatCampaignUrl(unlockedCampaign.ctaUrl) ?? undefined} target={formatCampaignUrl(unlockedCampaign.ctaUrl)?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">{unlockedCampaign.ctaLabel || "Lihat campaign"} ↗</a>}</div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={startQrScanner} disabled={cameraOn || progress.completed} className="min-h-11 flex-1 rounded-xl bg-[#16587B] px-4 text-sm font-black text-white disabled:opacity-50">{cameraOn ? "Kamera aktif…" : progress.completed ? "Misi selesai ✓" : "Aktifkan kamera"}</button>{cameraOn && <button type="button" onClick={stopCameras} className="min-h-11 rounded-xl border border-[#84B3CE]/50 bg-white px-4 text-sm font-bold">Hentikan</button>}</div></> : <><p className="mt-3 text-xs leading-5 text-[#16587B]/70">Bingkai menyertakan nama wisata, lokasi, ringkasan, maskot, serta hashtag. Foto dibuat di perangkatmu dan tidak diunggah.</p>{photoStatus && <p role="status" className="mt-3 rounded-xl border border-[#84B3CE]/35 bg-white/80 p-3 text-xs font-bold">{photoStatus}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void startPhotoCamera()} disabled={cameraOn} className="min-h-11 flex-1 rounded-xl bg-[#16587B] px-4 text-sm font-black text-white disabled:opacity-50">{cameraOn ? "Kamera siap" : "Buka kamera"}</button>{cameraOn && <><button type="button" onClick={() => void capturePhoto()} className="min-h-11 flex-1 rounded-xl bg-[#84B3CE] px-4 text-sm font-black text-[#16587B]">📸 Ambil foto</button><button type="button" onClick={() => { const next = cameraFacing === "user" ? "environment" : "user"; setCameraFacing(next); stopCameras(); void startPhotoCamera(next); }} className="min-h-11 rounded-xl border border-[#84B3CE]/50 bg-white px-3 text-xs font-bold">Balik kamera</button><button type="button" onClick={stopCameras} className="min-h-11 rounded-xl border border-[#84B3CE]/50 bg-white px-3 text-xs font-bold">Tutup kamera</button></>}</div>{photoUrl && <div className="mt-3 grid grid-cols-2 gap-2"><a href={photoUrl} download={`madiuntrip-${destinationSlug}.png`} className="flex min-h-11 items-center justify-center rounded-xl bg-[#16587B] px-3 text-xs font-black text-white">Unduh foto ↓</a><button type="button" onClick={() => void sharePhoto()} className="min-h-11 rounded-xl border border-[#84B3CE]/50 bg-white px-3 text-xs font-black">Bagikan ✨</button></div>}<div className="mt-3 rounded-xl border border-[#84B3CE]/25 bg-white/75 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-[#16587B]/55">Caption siap pakai</p><p className="mt-1 whitespace-pre-line text-[10px] leading-4 text-[#16587B]/75">{caption}</p></div></>}
					</div><aside className="flex flex-col justify-center rounded-2xl border border-[#84B3CE]/40 bg-white/70 p-4"><div className="relative mx-auto h-32 w-32 sm:h-44 sm:w-44"><Image src="/maskot/frame_0.png" alt="Teman maskot MadiunTrip" fill unoptimized sizes="176px" className="object-contain" /></div><p className="mt-2 text-center text-xs font-bold">{activeGame === "find_friends" ? "QR satu per satu, sesuai rute." : "Kenangan kecil dari perjalanan besar."}</p><p className="mt-1 text-center text-[10px] leading-4 text-[#16587B]/60">Foto tidak dikirim ke server. Hanya jumlah kenangan dan XP yang disimpan.</p></aside></div>}
			</div>
	</section></div>;
}
