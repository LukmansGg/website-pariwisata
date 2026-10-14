"use client";

import Image from "next/image";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";

type GameProgress = {
	xp: number;
	qrCodes: string[];
	photos: number;
	badges: string[];
};

type Props = {
	destinationSlug: string;
	destinationName: string;
	games: string[];
	initialQrCode?: string;
	onClose: () => void;
};

const INITIAL_PROGRESS: GameProgress = { xp: 0, qrCodes: [], photos: 0, badges: [] };
const BADGE_LABELS: Record<string, { icon: string; title: string; detail: string }> = {
	first_friend: { icon: "🧭", title: "Teman Pertama", detail: "Menemukan teman maskot pertamamu" },
	qr_explorer: { icon: "🗺️", title: "Penjelajah", detail: "Membuka 3 titik QR unik" },
	photo_memory: { icon: "📸", title: "Kenangan Pertama", detail: "Mengabadikan momen di photobox" },
	level_up: { icon: "⭐", title: "Bintang Perjalanan", detail: "Mengumpulkan 100 XP" },
};

function getQrCode(value: string) {
	const text = value.trim();
	try {
		const url = new URL(text, window.location.origin);
		const queryCode = url.searchParams.get("qr") ?? url.searchParams.get("code");
		if (queryCode && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(queryCode)) return queryCode;
		const parts = url.pathname.split("/").filter(Boolean);
		const qrIndex = parts.lastIndexOf("qr");
		if (qrIndex >= 0 && parts[qrIndex + 1] && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(parts[qrIndex + 1])) return parts[qrIndex + 1];
	} catch { /* Text QR may be a bare code. */ }
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(text) ? text : null;
}

function readProgress(key: string): GameProgress {
	try {
		const parsed = JSON.parse(localStorage.getItem(key) || "null") as Partial<GameProgress> | null;
		if (!parsed || !Number.isFinite(parsed.xp) || !Array.isArray(parsed.qrCodes) || !Array.isArray(parsed.badges)) return INITIAL_PROGRESS;
		return {
			xp: Math.max(0, Math.floor(parsed.xp ?? 0)),
			qrCodes: parsed.qrCodes.filter((item): item is string => typeof item === "string").slice(0, 100),
			photos: Math.max(0, Math.floor(Number(parsed.photos) || 0)),
			badges: parsed.badges.filter((item): item is string => typeof item === "string" && item in BADGE_LABELS),
		};
	} catch { return INITIAL_PROGRESS; }
}

export default function MinigameEngine({ destinationSlug, destinationName, games, initialQrCode, onClose }: Props) {
	const storageKey = `mt_minigames_v1:${destinationSlug}`;
	const [progress, setProgress] = useState<GameProgress>(INITIAL_PROGRESS);
	const [activeGame, setActiveGame] = useState<"find_friends" | "photobox" | null>(null);
	const [qrStatus, setQrStatus] = useState("");
	const [photoStatus, setPhotoStatus] = useState("");
	const [cameraOn, setCameraOn] = useState(false);
	const [photoUrl, setPhotoUrl] = useState("");
	const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
	const videoRef = useRef<HTMLVideoElement>(null);
	const qrControlsRef = useRef<IScannerControls | null>(null);
	const cameraStreamRef = useRef<MediaStream | null>(null);
	const handledQrRef = useRef(false);
	const initialQrHandledRef = useRef(false);

	useEffect(() => { setProgress(readProgress(storageKey)); }, [storageKey]);
	useEffect(() => {
		if (progress === INITIAL_PROGRESS) return;
		try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch { /* Keep the current play session usable when storage is unavailable. */ }
	}, [progress, storageKey]);
	useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

	const addBadge = (badges: string[], badge: string) => badges.includes(badge) ? badges : [...badges, badge];
	const awardQr = useCallback(async (rawCode: string) => {
		const code = getQrCode(rawCode);
		if (!code) { setQrStatus("Format QR belum dikenali. Arahkan kamera ke QR destinasi MadiunTrip."); return; }
		const currentProgress = readProgress(storageKey);
		if (currentProgress.qrCodes.includes(code)) { setQrStatus("Teman dari QR ini sudah masuk koleksimu. Cari titik QR yang berbeda untuk XP lagi."); return; }
		setQrStatus("Memeriksa titik QR…");
		try {
			const response = await fetch(`/api/qr/resolve?code=${encodeURIComponent(code)}`, { cache: "no-store" });
			const result = await response.json() as { destinationSlug?: string; error?: string };
			if (!response.ok || result.destinationSlug !== destinationSlug) {
				setQrStatus(result.destinationSlug ? "QR ini milik destinasi lain. Coba QR di area wisata ini." : "QR tidak aktif atau belum terdaftar.");
				return;
			}
			setProgress((current) => {
				if (current.qrCodes.includes(code)) return current;
				const qrCodes = [...current.qrCodes, code];
				let badges = addBadge(current.badges, "first_friend");
				if (qrCodes.length >= 3) badges = addBadge(badges, "qr_explorer");
				const xp = current.xp + (current.qrCodes.length === 0 ? 50 : 30);
				if (xp >= 100) badges = addBadge(badges, "level_up");
				return { ...current, xp, qrCodes, badges };
			});
			setQrStatus("Yeay, teman maskot ditemukan! +" + (currentProgress.qrCodes.length === 0 ? 50 : 30) + " XP");
		} catch { setQrStatus("Belum bisa memeriksa QR. Periksa koneksi, lalu coba lagi."); }
	}, [destinationSlug, storageKey]);

	useEffect(() => {
		if (!initialQrCode || initialQrHandledRef.current || !games.includes("find_friends")) return;
		initialQrHandledRef.current = true;
		void awardQr(initialQrCode);
	}, [awardQr, games, initialQrCode]);

	const stopCameras = useCallback(() => {
		qrControlsRef.current?.stop();
		qrControlsRef.current = null;
		cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
		cameraStreamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
		setCameraOn(false);
	}, []);
	useEffect(() => stopCameras, [stopCameras]);

	async function startQrScanner() {
		if (!videoRef.current || cameraOn) return;
		if (!navigator.mediaDevices?.getUserMedia) { setQrStatus("Kamera tidak tersedia. Gunakan tombol pemindai pada perangkat lain."); return; }
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
			if (handledQrRef.current) { controls.stop(); return; }
			qrControlsRef.current = controls;
		} catch (error) {
			cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
			cameraStreamRef.current = null;
			setCameraOn(false);
			setQrStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Izin kamera belum diberikan. Izinkan kamera di browser untuk memindai QR." : "Kamera gagal dibuka. Pastikan kamera tidak sedang dipakai aplikasi lain.");
		}
	}

	async function startPhotoCamera() {
		if (!videoRef.current || cameraOn) return;
		if (!navigator.mediaDevices?.getUserMedia) { setPhotoStatus("Kamera tidak tersedia di perangkat ini."); return; }
		setPhotoStatus("");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 }, height: { ideal: 900 } } });
			cameraStreamRef.current = stream;
			videoRef.current.srcObject = stream;
			await videoRef.current.play();
			setCameraOn(true);
		} catch (error) {
			cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
			cameraStreamRef.current = null;
			setPhotoStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Izin kamera belum diberikan. Kamu bisa mengizinkannya lewat pengaturan browser." : "Kamera gagal dibuka. Coba lagi setelah menutup aplikasi kamera lain.");
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
		try {
			const mascot = new window.Image();
			mascot.src = "/maskot/frame_0.png";
			await new Promise<void>((resolve, reject) => { mascot.onload = () => resolve(); mascot.onerror = () => reject(new Error("Maskot tidak dapat dimuat")); });
			const mascotSize = Math.min(canvas.width * .27, 260);
			context.drawImage(mascot, canvas.width - mascotSize - 22, canvas.height - mascotSize - 20, mascotSize, mascotSize);
		} catch { /* The destination label still makes a usable souvenir. */ }
		const bannerHeight = Math.max(68, Math.round(canvas.height * .12));
		context.fillStyle = "rgba(16,47,67,.78)";
		context.fillRect(0, canvas.height - bannerHeight, canvas.width, bannerHeight);
		context.fillStyle = "#F5EEDD";
		context.font = `700 ${Math.max(22, Math.round(canvas.width * .035))}px system-ui, sans-serif`;
		context.fillText("MadiunTrip · " + destinationName.slice(0, 48), 24, canvas.height - Math.round(bannerHeight * .36));
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
		if (!blob) { setPhotoStatus("Foto belum bisa diunduh. Coba lagi."); return; }
		if (photoUrl) URL.revokeObjectURL(photoUrl);
		setPhotoUrl(URL.createObjectURL(blob));
		setProgress((current) => {
			const firstPhoto = current.photos === 0;
			let badges = firstPhoto ? addBadge(current.badges, "photo_memory") : current.badges;
			const xp = current.xp + (firstPhoto ? 30 : 0);
			if (xp >= 100) badges = addBadge(badges, "level_up");
			return { ...current, xp, photos: current.photos + 1, badges };
		});
		setPhotoStatus("Foto jadi! Simpan kenanganmu dan bagikan kalau kamu suka.");
	}

	const totalBadges = Object.keys(BADGE_LABELS).length;
	const level = Math.floor(progress.xp / 100) + 1;
	const levelProgress = progress.xp % 100;

	return <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#102F43]/70 p-3 backdrop-blur-md sm:grid sm:place-items-center sm:p-6">
		<section role="dialog" aria-modal="true" aria-labelledby="game-title" className="mx-auto my-3 w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/80 bg-[#F5EEDD] text-[#16587B] shadow-2xl sm:my-0 sm:rounded-[2.5rem]">
			<div className="relative overflow-hidden bg-[#16587B] px-5 py-6 text-white sm:px-9 sm:py-8">
				<div aria-hidden="true" className="absolute -right-12 -top-16 h-56 w-56 rounded-full border border-white/20" />
				<div className="relative z-10 flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-white/65">MADIUNTRIP · PLAY & EXPLORE</p><h2 id="game-title" className="mt-2 text-3xl font-black sm:text-4xl">Papan Petualangan ✨</h2><p className="mt-2 text-sm text-white/75">{destinationName} · Level {level}</p></div><button type="button" onClick={() => { stopCameras(); onClose(); }} aria-label="Tutup permainan" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-2xl hover:bg-white/20">×</button></div>
				<div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><div><div className="mb-2 flex justify-between text-xs font-bold"><span>⭐ {progress.xp} XP</span><span>{levelProgress}/100 menuju level {level + 1}</span></div><div className="h-3 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#F5EEDD] transition-all duration-700" style={{ width: levelProgress + "%" }} /></div></div><div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-center"><span className="block text-xl font-black">{progress.badges.length}/{totalBadges}</span><span className="text-[9px] font-black uppercase tracking-wider text-white/70">badge</span></div></div>
			</div>
			<div className="grid gap-5 p-4 sm:p-8 lg:grid-cols-[1.05fr_.95fr]">
				<div className="space-y-4">
					{games.includes("find_friends") && <article className="rounded-[1.6rem] border border-[#84B3CE]/50 bg-white/80 p-5 shadow-sm sm:p-6"><div className="flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#84B3CE]/25 text-3xl">🧭</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">Find Our Friends</h3><span className="rounded-full bg-[#84B3CE]/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide">+30–50 XP</span></div><p className="mt-2 text-sm leading-6 text-[#16587B]/70">Pindai QR unik di destinasi ini untuk menemukan teman maskot. QR dari titik yang sama tidak memberi XP dua kali.</p></div></div>
						<div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-[#F5EEDD] p-3"><div className="flex items-center gap-2"><span className="text-2xl">🐾</span><div><p className="text-xs font-extrabold">Teman ditemukan</p><p className="text-[10px] text-[#16587B]/60">{progress.qrCodes.length} titik QR unik</p></div></div><button type="button" onClick={() => { setActiveGame("find_friends"); setQrStatus(""); }} className="min-h-11 rounded-xl bg-[#16587B] px-4 text-xs font-black text-white shadow-md transition hover:-translate-y-0.5">{progress.qrCodes.length ? "Cari lagi" : "Mulai cari"} →</button></div>
						{qrStatus && activeGame !== "find_friends" && <p role="status" className="mt-3 text-xs font-bold text-[#16587B]">{qrStatus}</p>}</article>}
					{games.includes("photobox") && <article className="rounded-[1.6rem] border border-[#84B3CE]/50 bg-white/80 p-5 shadow-sm sm:p-6"><div className="flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#84B3CE]/25 text-3xl">📸</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">Photobox Jelajah</h3><span className="rounded-full bg-[#84B3CE]/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide">+30 XP pertama</span></div><p className="mt-2 text-sm leading-6 text-[#16587B]/70">Ambil foto bersama maskot dan simpan kenangan dengan bingkai nama destinasi.</p></div></div><div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-[#F5EEDD] p-3"><div className="flex items-center gap-2"><span className="text-2xl">💫</span><div><p className="text-xs font-extrabold">Kenangan tersimpan</p><p className="text-[10px] text-[#16587B]/60">{progress.photos} foto dibuat · file tetap di perangkatmu</p></div></div><button type="button" onClick={() => { setActiveGame("photobox"); setPhotoStatus(""); }} className="min-h-11 rounded-xl bg-[#16587B] px-4 text-xs font-black text-white shadow-md transition hover:-translate-y-0.5">Buka photobox →</button></div></article>}
				</div>
				<aside className="rounded-[1.6rem] border border-[#84B3CE]/40 bg-white/65 p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#16587B]/55">KOLEKSI PETUALANGAN</p><h3 className="mt-1 text-xl font-black">Badge perjalanan</h3></div><span className="rounded-full bg-[#16587B] px-3 py-1.5 text-[10px] font-black text-white">{progress.badges.length}/{totalBadges}</span></div><div className="mt-4 space-y-2">{Object.entries(BADGE_LABELS).map(([id, badge]) => { const earned = progress.badges.includes(id); return <div key={id} className={"flex items-center gap-3 rounded-2xl border p-3 transition " + (earned ? "border-[#84B3CE]/55 bg-[#84B3CE]/20" : "border-[#84B3CE]/20 bg-white/55 opacity-60")}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xl">{earned ? badge.icon : "🔒"}</span><div><p className="text-xs font-extrabold">{badge.title}</p><p className="mt-0.5 text-[10px] leading-4 text-[#16587B]/65">{badge.detail}</p></div>{earned && <span className="ml-auto text-sm">✓</span>}</div>; })}</div><p className="mt-4 rounded-xl border border-[#84B3CE]/30 bg-[#F5EEDD] p-3 text-[10px] leading-5 text-[#16587B]/65">Progres tersimpan di browser perangkat ini. XP dan badge adalah koleksi permainan, bukan hadiah yang dapat ditukar.</p></aside>
			</div>
		</section>

		{activeGame && <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#102F43]/80 p-3 backdrop-blur-md sm:grid sm:place-items-center sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="active-game-title" className="mx-auto my-4 w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/80 bg-[#F5EEDD] p-5 text-[#16587B] shadow-2xl sm:my-0 sm:rounded-[2.2rem] sm:p-7"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#16587B]/55">MINIGAME · {destinationName}</p><h3 id="active-game-title" className="mt-1 text-2xl font-black">{activeGame === "find_friends" ? "Cari teman maskot 🐾" : "Photobox Jelajah 📸"}</h3></div><button type="button" onClick={() => { stopCameras(); setActiveGame(null); }} aria-label="Kembali ke papan permainan" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#84B3CE]/45 bg-white text-2xl">×</button></div>
					<div className="relative mt-5 aspect-[4/3] overflow-hidden rounded-[1.5rem] border-4 border-white bg-[#16587B] shadow-inner"><video ref={videoRef} muted playsInline className={"h-full w-full object-cover " + (activeGame === "photobox" && cameraFacing === "user" ? "scale-x-[-1]" : "")} /><div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[72%] w-[72%] rounded-[2rem] border-2 border-dashed border-white/75 shadow-[0_0_0_999px_rgba(16,47,67,.16)]" /></div>{activeGame === "photobox" && <div className="pointer-events-none absolute bottom-1 left-2 h-24 w-24 sm:h-32 sm:w-32"><Image src="/maskot/frame_0.png" alt="Maskot MadiunTrip" fill unoptimized sizes="128px" className="object-contain drop-shadow-lg" /></div>}{!cameraOn && <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#16587B] to-[#84B3CE] px-8 text-center text-white"><div><span className="text-5xl">{activeGame === "find_friends" ? "📷" : "✨"}</span><p className="mt-3 text-sm font-bold leading-6">{activeGame === "find_friends" ? "Siapkan kamera untuk memindai QR di lokasi wisata." : "Izinkan kamera untuk berfoto dengan teman maskot."}</p></div></div>}</div>
					{activeGame === "find_friends" ? <><p className="mt-4 text-sm leading-6 text-[#16587B]/75">Arahkan kamera ke QR aktif di <strong>{destinationName}</strong>. Teman baru dan XP hanya dihitung sekali untuk setiap QR unik.</p>{qrStatus && <p role="status" className="mt-3 rounded-xl border border-[#84B3CE]/35 bg-white/75 p-3 text-xs font-bold">{qrStatus}</p>}<div className="mt-4 flex gap-2"><button type="button" onClick={startQrScanner} disabled={cameraOn} className="min-h-12 flex-1 rounded-xl bg-[#16587B] px-4 font-black text-white disabled:opacity-50">{cameraOn ? "Kamera aktif…" : "Aktifkan kamera"}</button>{cameraOn && <button type="button" onClick={stopCameras} className="min-h-12 rounded-xl border border-[#84B3CE]/50 bg-white px-4 font-bold">Hentikan</button>}</div></> : <><p className="mt-4 text-sm leading-6 text-[#16587B]/75">Atur pose, ambil foto, lalu unduh hasilnya. Foto tidak diunggah dan hanya dibuat saat kamu menekan tombol.</p>{photoStatus && <p role="status" className="mt-3 rounded-xl border border-[#84B3CE]/35 bg-white/75 p-3 text-xs font-bold">{photoStatus}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={startPhotoCamera} disabled={cameraOn} className="min-h-12 flex-1 rounded-xl bg-[#16587B] px-4 font-black text-white disabled:opacity-50">{cameraOn ? "Kamera siap" : "Buka kamera"}</button>{cameraOn && <><button type="button" onClick={capturePhoto} className="min-h-12 flex-1 rounded-xl bg-[#84B3CE] px-4 font-black text-[#16587B]">📸 Ambil foto</button><button type="button" onClick={() => { setCameraFacing((value) => value === "user" ? "environment" : "user"); stopCameras(); }} className="min-h-12 rounded-xl border border-[#84B3CE]/50 bg-white px-4 font-bold">Balik kamera</button></>}{cameraOn && <button type="button" onClick={stopCameras} className="min-h-12 rounded-xl border border-[#84B3CE]/50 bg-white px-4 font-bold">Tutup</button>}</div>{photoUrl && <a href={photoUrl} download={"madiuntrip-" + destinationSlug + ".png"} className="mt-3 flex min-h-12 items-center justify-center rounded-xl border border-[#84B3CE]/50 bg-white px-4 text-sm font-black text-[#16587B]">Unduh foto kenangan ↓</a>}</>}
				</section></div>}
	</div>;
}
