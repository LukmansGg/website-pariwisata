"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/client";

type ScanStatus = "idle" | "requesting" | "scanning" | "paused" | "error";

type DestinationRow = {
	slug: string;
	name: string;
	description?: string | null;
	summary?: string | null;
	category?: string | null;
	image_url?: string | null;
	photo_url?: string | null;
	cover_image?: string | null;
	image?: string | null;
};

type DestinationPreview = {
	slug: string;
	name: string;
	category: string | null;
	description: string;
	image: string | null;
};

function getDestinationSlug(value: string): string | null {
	const text = value.trim();
	if (!text) return null;

	try {
		const url = new URL(text);
		const querySlug =
			url.searchParams.get("destination") ?? url.searchParams.get("slug");
		if (querySlug && /^[a-z0-9-]+$/i.test(querySlug)) return querySlug;

		const parts = url.pathname.split("/").filter(Boolean);
		const wisataIndex = parts.findIndex(
			(part) => part === "wisata" || part === "destination",
		);
		if (wisataIndex >= 0 && parts[wisataIndex + 1]) {
			const slug = parts[wisataIndex + 1];
			return /^[a-z0-9-]+$/i.test(slug) ? slug : null;
		}
		if (parts.length === 1 && /^[a-z0-9-]+$/i.test(parts[0])) {
			return parts[0];
		}
		return null;
	} catch {
		return /^[a-z0-9-]+$/i.test(text) ? text : null;
	}
}

function CameraIcon({ className = "h-5 w-5" }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
			<path d="M4 7.5h3l1.5-2h7l1.5 2h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-16A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
			<circle cx="12" cy="13.5" r="3.5" stroke="currentColor" strokeWidth="1.7" />
		</svg>
	);
}

function FlipIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
			<path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5M19 7l2 2-2 2M5 17l-2-2 2-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function FlashIcon({ active }: { active: boolean }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
			<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
			{active ? <path d="M3 3 21 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : null}
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
			<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		</svg>
	);
}

function PinIcon({ className = "h-5 w-5" }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
			<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.7" />
			<circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
		</svg>
	);
}

function Spinner() {
	return <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

export default function ScanPage() {
	const router = useRouter();
	const videoRef = useRef<HTMLVideoElement>(null);
	const controlsRef = useRef<IScannerControls | null>(null);
	const startedRef = useRef(false);
	const handledResultRef = useRef(false);
	const mountedRef = useRef(false);
	const supabase = useMemo(() => createClient(), []);

	const [status, setStatus] = useState<ScanStatus>("idle");
	const [error, setError] = useState("");
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [activeDeviceId, setActiveDeviceId] = useState("");
	const [torchSupported, setTorchSupported] = useState(false);
	const [torchOn, setTorchOn] = useState(false);
	const [scannedSlug, setScannedSlug] = useState<string | null>(null);
	const [preview, setPreview] = useState<DestinationPreview | null>(null);
	const [loadingPreview, setLoadingPreview] = useState(false);
	const [previewError, setPreviewError] = useState("");
	const [isExploring, setIsExploring] = useState(false);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			controlsRef.current?.stop();
			controlsRef.current = null;
			startedRef.current = false;
		};
	}, []);

	const stopCamera = useCallback(() => {
		controlsRef.current?.stop();
		controlsRef.current = null;
		startedRef.current = false;
		setTorchSupported(false);
		setTorchOn(false);
	}, []);

	const checkTorch = useCallback(() => {
		const track = (videoRef.current?.srcObject as MediaStream | null)
			?.getVideoTracks()[0];
		let capabilities: (MediaTrackCapabilities & { torch?: boolean }) | undefined;
		try {
			capabilities = track?.getCapabilities() as
				| (MediaTrackCapabilities & { torch?: boolean })
				| undefined;
		} catch {
			capabilities = undefined;
		}
		const supported = Boolean(capabilities?.torch);
		setTorchSupported(supported);
		if (!supported) setTorchOn(false);
	}, []);

	async function loadDestination(slug: string) {
		setLoadingPreview(true);
		setPreviewError("");
		setPreview(null);
		try {
			const { data, error: queryError } = await supabase
				.from("destinations")
				.select("*")
				.eq("slug", slug)
				.eq("is_published", true)
				.maybeSingle();

			if (queryError) throw queryError;
			if (!data) {
				setPreviewError("Destinasi tidak ditemukan atau belum dipublikasikan.");
				return;
			}

			const row = data as DestinationRow;
			setPreview({
				slug: row.slug,
				name: row.name,
				category: row.category ?? null,
				description: row.description ?? row.summary ?? "Belum ada deskripsi untuk destinasi ini.",
				image: row.image_url ?? row.photo_url ?? row.cover_image ?? row.image ?? null,
			});
		} catch {
			setPreviewError("Informasi destinasi belum dapat dimuat. Periksa koneksi lalu coba lagi.");
		} finally {
			setLoadingPreview(false);
		}
	}

	function handleDecodedText(text: string, controls: IScannerControls) {
		if (handledResultRef.current) return;
		handledResultRef.current = true;
		controls.stop();
		controlsRef.current = null;
		startedRef.current = false;
		setTorchSupported(false);
		setTorchOn(false);
		setStatus("paused");

		const slug = getDestinationSlug(text);
		if (!slug) {
			setScannedSlug(null);
			setPreviewError("Format QR belum dikenali. Gunakan QR yang berisi URL atau slug destinasi.");
			return;
		}

		setScannedSlug(slug);
		void loadDestination(slug);
	}

	async function startCamera(deviceId?: string) {
		if (!videoRef.current || startedRef.current) return;
		setError("");
		setStatus("requesting");
		startedRef.current = true;
		handledResultRef.current = false;

		try {
			controlsRef.current?.stop();
			controlsRef.current = null;
			const reader = new BrowserQRCodeReader();
			const controls = await reader.decodeFromVideoDevice(
				deviceId || undefined,
				videoRef.current,
				(result, _decodeError, callbackControls) => {
					if (result) handleDecodedText(result.getText(), callbackControls);
				},
			);

			if (!mountedRef.current) {
				controls.stop();
				return;
			}
			if (handledResultRef.current) {
				controls.stop();
				return;
			}
			controlsRef.current = controls;
			const stream = videoRef.current?.srcObject as MediaStream | null;
			const track = stream?.getVideoTracks()[0];
			const currentId = track?.getSettings().deviceId ?? deviceId ?? "";
			setActiveDeviceId(currentId);
			setStatus("scanning");

			const availableDevices = await BrowserQRCodeReader.listVideoInputDevices();
			if (mountedRef.current) setDevices(availableDevices);
			window.setTimeout(checkTorch, 400);
		} catch (cameraError) {
			startedRef.current = false;
			controlsRef.current?.stop();
			controlsRef.current = null;
			if (!mountedRef.current) return;
			const name = cameraError instanceof DOMException ? cameraError.name : "";
			const message = name === "NotAllowedError" || name === "SecurityError"
				? "Izin kamera ditolak. Izinkan kamera melalui pengaturan browser, lalu coba lagi."
				: name === "NotFoundError"
					? "Kamera tidak ditemukan pada perangkat ini."
					: "Kamera tidak dapat dibuka. Pastikan halaman memakai HTTPS atau localhost dan kamera tidak sedang dipakai aplikasi lain.";
			setError(message);
			setStatus("error");
		}
	}

	function resumeScanning() {
		setScannedSlug(null);
		setPreview(null);
		setPreviewError("");
		setIsExploring(false);
		void startCamera(activeDeviceId || undefined);
	}

	async function switchCamera() {
		if (devices.length < 2) return;
		const currentIndex = devices.findIndex((device) => device.deviceId === activeDeviceId);
		const nextDevice = devices[(currentIndex + 1 + devices.length) % devices.length];
		stopCamera();
		setStatus("requesting");
		await startCamera(nextDevice.deviceId);
	}

	async function toggleTorch() {
		const track = (videoRef.current?.srcObject as MediaStream | null)
			?.getVideoTracks()[0];
		if (!track || !torchSupported) return;
		const nextState = !torchOn;
		try {
			await track.applyConstraints({
				advanced: [{ torch: nextState } as unknown as MediaTrackConstraintSet],
			} as MediaTrackConstraints);
			setTorchOn(nextState);
		} catch {
			setError("Flash tidak didukung oleh kamera ini. Pemindaian tetap dapat dilanjutkan.");
			setTorchSupported(false);
			setTorchOn(false);
		}
	}

	async function exploreDestination() {
		if (!scannedSlug || isExploring) return;
		setIsExploring(true);
		setPreviewError("");
		try {
			const response = await fetch("/api/visitor-session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ destinationSlug: scannedSlug }),
			});
			const result = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(result.error ?? "Sesi pengunjung gagal dibuat.");
			router.push(`/wisata/${encodeURIComponent(scannedSlug)}`);
		} catch (exploreError) {
			setPreviewError(
				exploreError instanceof Error
					? exploreError.message
					: "Gagal menghubungi server. Silakan coba lagi.",
			);
			setIsExploring(false);
		}
	}

	const modalOpen = Boolean(scannedSlug || previewError);
	const isCameraView = status !== "idle";

	return (
		<main className={`relative flex min-h-dvh flex-col items-center overflow-hidden text-[#16587B] ${isCameraView ? "fixed inset-0 z-40 justify-center bg-[#16587B] px-0 py-0 text-[#F5EEDD]" : "bg-[#F5EEDD] px-4 py-6 sm:px-6 sm:py-8"}`}>
			<div aria-hidden="true" className={`pointer-events-none absolute -left-28 top-24 h-72 w-72 rounded-full bg-[#84B3CE]/20 blur-3xl ${isCameraView ? "hidden" : ""}`} />
			<div aria-hidden="true" className={`pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-[#84B3CE]/20 blur-3xl ${isCameraView ? "hidden" : ""}`} />

			<header className={`z-30 flex w-full items-center justify-between ${isCameraView ? "absolute left-0 right-0 top-0 px-4 py-4 sm:px-7 sm:py-6" : "relative max-w-6xl"}`}>
				<Link href="/" className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2.5 text-sm font-bold text-[#16587B] shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B]">
					<span aria-hidden="true">←</span> Beranda
				</Link>
				<div className="flex items-center gap-2 rounded-full border border-[#84B3CE]/40 bg-white/90 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#16587B] shadow-sm backdrop-blur">
					<span className={`h-2.5 w-2.5 rounded-full ${status === "scanning" ? "animate-pulse bg-[#84B3CE]" : "bg-[#16587B]/35"}`} />
					QR Scanner
				</div>
			</header>

			<section className={`relative z-10 w-full ${isCameraView ? "absolute inset-0 m-0 max-w-none" : "mt-8 max-w-6xl sm:mt-10"}`}>
				<div className={`mx-auto mb-6 max-w-2xl text-center sm:mb-8 ${isCameraView ? "hidden" : ""}`}>
					<p className="text-xs font-black uppercase tracking-[0.24em] text-[#16587B]/60">MadiunTrip · Jelajah langsung</p>
					<h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Temukan cerita di balik QR</h1>
					<p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#16587B]/70 sm:text-base">
						Arahkan kamera ke kode destinasi. Kami akan menampilkan informasi wisata sebelum kamu melanjutkan.
					</p>
				</div>

				<div className={`${isCameraView ? "absolute inset-0 overflow-hidden bg-[#16587B]" : "overflow-hidden rounded-[2rem] border border-[#84B3CE]/35 bg-white p-2 shadow-[0_24px_70px_-24px_rgba(22,88,123,0.35)] sm:rounded-[2.5rem] sm:p-3"}`}>
					<div className={`relative isolate overflow-hidden bg-[#16587B] ${isCameraView ? "absolute inset-0 min-h-dvh" : "aspect-[4/3] min-h-[340px] rounded-[1.5rem] sm:aspect-[16/9] sm:min-h-[430px] sm:rounded-[2rem] lg:min-h-[500px]"}`}>
						<video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline aria-label="Tampilan kamera untuk memindai QR" />

						{status !== "idle" && status !== "error" ? (
							<div aria-hidden="true" className="pointer-events-none absolute inset-0">
								<div className="absolute inset-0 bg-[#16587B]/15" />
								<div className="absolute left-1/2 top-1/2 aspect-square w-[min(70vw,340px)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-white/35 shadow-[0_0_0_999px_rgba(22,88,123,0.34)] sm:w-[min(38vw,380px)]">
									<div className="absolute -left-1 -top-1 h-12 w-12 rounded-tl-2xl border-l-[5px] border-t-[5px] border-[#F5EEDD]" />
									<div className="absolute -right-1 -top-1 h-12 w-12 rounded-tr-2xl border-r-[5px] border-t-[5px] border-[#F5EEDD]" />
									<div className="absolute -bottom-1 -left-1 h-12 w-12 rounded-bl-2xl border-b-[5px] border-l-[5px] border-[#F5EEDD]" />
									<div className="absolute -bottom-1 -right-1 h-12 w-12 rounded-br-2xl border-b-[5px] border-r-[5px] border-[#F5EEDD]" />
									{status === "scanning" ? <div className="absolute inset-x-5 top-1/2 h-0.5 animate-[scanline_2.4s_ease-in-out_infinite] bg-[#84B3CE] shadow-[0_0_16px_4px_rgba(132,179,206,0.7)]" /> : null}
								</div>
							</div>
						) : null}

						{status === "idle" ? (
							<div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#F5EEDD] via-white to-[#84B3CE]/35 p-6 text-center sm:p-10">
								<div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-[#16587B] text-[#F5EEDD] shadow-lg shadow-[#16587B]/20"><CameraIcon className="h-9 w-9" /></div>
								<h2 className="text-xl font-black sm:text-2xl">Siap untuk memindai?</h2>
								<p className="mt-2 max-w-md text-sm leading-6 text-[#16587B]/70">Kamera hanya digunakan untuk membaca kode QR. MadiunTrip tidak meminta akses lokasi.</p>
								<button type="button" onClick={() => void startCamera()} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#16587B] px-7 py-3 font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#16587B]/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#84B3CE]/60">
									<CameraIcon /> Aktifkan kamera
								</button>
								<p className="mt-3 text-xs text-[#16587B]/55">Browser akan meminta izin kamera setelah tombol ditekan.</p>
							</div>
						) : null}

						{status === "requesting" ? (
							<div className="absolute inset-0 flex flex-col items-center justify-center bg-[#16587B]/85 text-center text-white">
								<Spinner />
								<p className="mt-4 font-bold">Menghubungkan kamera…</p>
								<p className="mt-1 text-sm text-white/75">Izinkan akses kamera pada dialog browser.</p>
							</div>
						) : null}

						{status === "error" ? (
							<div className="absolute inset-0 flex flex-col items-center justify-center bg-[#16587B]/90 p-6 text-center text-white backdrop-blur-sm">
								<div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#84B3CE]/50 bg-white/10 text-[#F5EEDD]"><CameraIcon className="h-8 w-8" /></div>
								<p role="alert" className="mt-4 max-w-lg font-semibold text-[#F5EEDD]">{error}</p>
								<button type="button" onClick={() => void startCamera()} className="mt-5 rounded-xl bg-[#84B3CE] px-6 py-3 font-bold text-[#16587B] transition hover:bg-[#F5EEDD] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F5EEDD]/60">Coba lagi</button>
							</div>
						) : null}

						{status === "paused" && !modalOpen ? (
							<div className="absolute inset-0 flex items-center justify-center bg-[#16587B]/70 p-6 text-center text-white"><Spinner /><span className="ml-3 font-semibold">Memeriksa QR…</span></div>
						) : null}
					</div>

					<div className={`${isCameraView ? "absolute bottom-7 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/90 p-3 text-[#16587B] shadow-xl backdrop-blur sm:bottom-9 sm:gap-4 sm:p-4" : "flex flex-wrap items-center justify-center gap-3 px-2 py-4 sm:gap-4 sm:py-5"}`}>
						{status === "scanning" && devices.length > 1 ? (
							<button type="button" onClick={() => void switchCamera()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#84B3CE]/50 bg-[#F5EEDD] px-4 py-2.5 text-sm font-bold transition hover:bg-[#84B3CE]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B]" aria-label="Putar kamera"><FlipIcon /> Putar</button>
						) : null}
						{status === "scanning" && torchSupported ? (
							<button type="button" onClick={() => void toggleTorch()} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B] ${torchOn ? "bg-[#16587B] text-white" : "border border-[#84B3CE]/50 bg-[#F5EEDD] hover:bg-[#84B3CE]/25"}`} aria-pressed={torchOn}><FlashIcon active={torchOn} /> {torchOn ? "Flash mati" : "Flash"}</button>
						) : null}
						{status === "scanning" ? (
							<button type="button" onClick={() => { stopCamera(); setStatus("idle"); }} className="min-h-11 rounded-xl border border-[#84B3CE]/50 bg-white px-4 py-2.5 text-sm font-bold transition hover:bg-[#F5EEDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B]">Selesai</button>
						) : null}
					</div>
				</div>

				<div className={`${isCameraView ? "absolute bottom-24 left-0 right-0 z-20 px-4 text-center text-xs text-white/85 sm:bottom-28" : "mt-5 flex flex-col items-center justify-between gap-3 text-center text-xs text-[#16587B]/65 sm:flex-row sm:text-left"}`}>
					<p>Arahkan QR ke dalam frame. Pastikan gambar cukup terang dan tidak buram.</p>
					<p className={isCameraView ? "mt-1 font-semibold" : "rounded-full bg-white/70 px-4 py-2 font-semibold"}>Privat · Tanpa pelacakan lokasi</p>
				</div>
			</section>

			{modalOpen ? (
				<div className="fixed inset-0 z-50 flex items-end justify-center bg-[#16587B]/45 p-3 backdrop-blur-sm sm:items-center sm:p-6" role="presentation">
					<section role="dialog" aria-modal="true" aria-labelledby="destination-preview-title" className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white shadow-[0_30px_90px_-25px_rgba(22,88,123,0.5)]">
						<button type="button" onClick={resumeScanning} disabled={isExploring} className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#16587B] shadow transition hover:bg-[#F5EEDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B] disabled:opacity-50" aria-label="Tutup dan pindai lagi"><CloseIcon /></button>
						{loadingPreview ? (
							<div className="flex min-h-72 flex-col items-center justify-center p-10 text-center"><Spinner /><p className="mt-4 font-bold">Mencari destinasi…</p></div>
						) : previewError && !preview ? (
							<div className="p-8 pt-16 text-center sm:p-10 sm:pt-16">
								<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F5EEDD] text-[#16587B]"><PinIcon className="h-8 w-8" /></div>
								<h2 id="destination-preview-title" className="mt-4 text-2xl font-black">QR belum dikenali</h2>
								<p role="alert" className="mt-2 text-sm leading-6 text-[#16587B]/70">{previewError}</p>
								<button type="button" onClick={resumeScanning} className="mt-7 w-full rounded-xl bg-[#16587B] px-5 py-3.5 font-bold text-white transition hover:bg-[#16587B]/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#84B3CE]/60">Pindai ulang</button>
							</div>
						) : preview ? (
							<>
								<div className="relative flex h-48 items-center justify-center overflow-hidden bg-gradient-to-br from-[#F5EEDD] to-[#84B3CE]/50 sm:h-56">
									{preview.image ? <img src={preview.image} alt={preview.name} className="h-full w-full object-cover" /> : <PinIcon className="h-12 w-12 text-[#16587B]" />}
									{preview.category ? <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-[#16587B] shadow">{preview.category}</span> : null}
								</div>
								<div className="p-6 sm:p-8">
									<p className="text-xs font-black uppercase tracking-[0.18em] text-[#84B3CE]">Destinasi ditemukan</p>
									<h2 id="destination-preview-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{preview.name}</h2>
									<p className="mt-3 line-clamp-4 text-sm leading-6 text-[#16587B]/75">{preview.description}</p>
									{previewError ? <p role="alert" className="mt-3 rounded-xl bg-[#F5EEDD] px-4 py-3 text-sm text-[#16587B]">{previewError}</p> : null}
									<div className="mt-7 flex gap-3">
										<button type="button" onClick={resumeScanning} disabled={isExploring} className="min-h-12 flex-1 rounded-xl border-2 border-[#84B3CE]/60 bg-white px-4 py-3 font-bold text-[#16587B] transition hover:bg-[#F5EEDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B] disabled:opacity-50">Batal</button>
										<button type="button" onClick={() => void exploreDestination()} disabled={isExploring} className="inline-flex min-h-12 flex-[1.5] items-center justify-center gap-2 rounded-xl bg-[#16587B] px-4 py-3 font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#16587B]/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#84B3CE]/60 disabled:cursor-wait disabled:opacity-70">{isExploring ? <><Spinner /> Membuka…</> : <>Jelajah <PinIcon /></>}</button>
									</div>
								</div>
							</>
						) : null}
					</section>
				</div>
			) : null}

			<style jsx global>{`
				@keyframes scanline {
					0% { transform: translateY(-120px); opacity: 0; }
					12% { opacity: 1; }
					88% { opacity: 1; }
					100% { transform: translateY(120px); opacity: 0; }
				}
				@media (prefers-reduced-motion: reduce) {
					*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
				}
			`}</style>
		</main>
	);
}
