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
	categories?: string[] | null;
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
		const url = new URL(text, window.location.origin);
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

function getQrCode(value: string): string | null {
	try {
		const url = new URL(value.trim(), window.location.origin);
		const parts = url.pathname.split("/").filter(Boolean);
		const qrIndex = parts.findIndex((part) => part === "qr");
		const code = qrIndex >= 0 ? parts[qrIndex + 1] : null;
		return code && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(code) ? code : null;
	} catch {
		return null;
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
	const streamRef = useRef<MediaStream | null>(null);
	const controlsRef = useRef<IScannerControls | null>(null);
	const qrRequestRef = useRef<AbortController | null>(null);
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
	const [scannedQrCode, setScannedQrCode] = useState<string | null>(null);
	const [preview, setPreview] = useState<DestinationPreview | null>(null);
	const [loadingPreview, setLoadingPreview] = useState(false);
	const [previewError, setPreviewError] = useState("");
	const [isExploring, setIsExploring] = useState(false);
	const [qrDetected, setQrDetected] = useState(false);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			controlsRef.current?.stop();
			controlsRef.current = null;
			qrRequestRef.current?.abort();
			qrRequestRef.current = null;
			streamRef.current?.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
			startedRef.current = false;
		};
	}, []);

	const stopCamera = useCallback(() => {
		controlsRef.current?.stop();
		controlsRef.current = null;
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
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
				.not("image_url", "is", null)
				.not("latitude", "is", null)
				.not("longitude", "is", null)
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
				category: row.categories?.length ? row.categories.join(" · ") : row.category ?? null,
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
		setQrDetected(true);
		controls.stop();
		controlsRef.current = null;
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
		startedRef.current = false;
		setTorchSupported(false);
		setTorchOn(false);
		setStatus("paused");

		const qrCode = getQrCode(text);
		setScannedQrCode(qrCode);
		const slug = getDestinationSlug(text);
		if (slug) {
			setScannedSlug(slug);
			void loadDestination(slug);
			return;
		}

		if (qrCode) {
			const requestController = new AbortController();
			qrRequestRef.current?.abort();
			qrRequestRef.current = requestController;
			const requestTimeout = window.setTimeout(() => requestController.abort(), 10000);
			void fetch(`/api/qr/resolve?code=${encodeURIComponent(qrCode)}`, { signal: requestController.signal })
				.then(async (response) => {
					const result = (await response.json()) as { destinationSlug?: string; error?: string };
					if (!response.ok || !result.destinationSlug) throw new Error(result.error || "QR tidak ditemukan.");
					setScannedSlug(result.destinationSlug);
					await loadDestination(result.destinationSlug);
				})
				.catch((resolveError) => {
					if (qrRequestRef.current !== requestController) return;
					setPreviewError(resolveError instanceof DOMException && resolveError.name === "AbortError"
						? "Verifikasi QR memerlukan waktu terlalu lama. Periksa koneksi lalu coba lagi."
						: "QR ini tidak aktif atau destinasi belum diterbitkan.");
				})
				.finally(() => {
					window.clearTimeout(requestTimeout);
					if (qrRequestRef.current === requestController) qrRequestRef.current = null;
				});
			return;
		}

		if (!slug) {
			setScannedSlug(null);
			setPreviewError("Format QR belum dikenali. Gunakan QR yang berisi URL atau slug destinasi.");
			return;
		}
	}

	async function startCamera(deviceId?: string) {
		if (!videoRef.current || startedRef.current) return;
		setError("");
		setQrDetected(false);
		setStatus("requesting");
		startedRef.current = true;
		handledResultRef.current = false;

		try {
			controlsRef.current?.stop();
			controlsRef.current = null;
			streamRef.current?.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
			// Call getUserMedia directly from the button gesture so mobile browsers
			// can show their native permission prompt reliably.
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: deviceId
					? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }
					: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
			});
			if (!mountedRef.current) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			streamRef.current = stream;
			if (videoRef.current) videoRef.current.srcObject = stream;
			await videoRef.current.play();
			const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 700, tryPlayVideoTimeout: 10000 });
			const controls = await reader.decodeFromStream(
				stream,
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
			const activeStream = videoRef.current?.srcObject as MediaStream | null;
			const track = activeStream?.getVideoTracks()[0];
			const currentId = track?.getSettings().deviceId ?? deviceId ?? "";
			setActiveDeviceId(currentId);
			setStatus("scanning");

			try {
				const availableDevices = await BrowserQRCodeReader.listVideoInputDevices();
				if (mountedRef.current) setDevices(availableDevices);
			} catch {
				// Keep the active scan usable if device enumeration is restricted.
			}
			window.setTimeout(checkTorch, 400);
		} catch (cameraError) {
			startedRef.current = false;
			controlsRef.current?.stop();
			controlsRef.current = null;
			streamRef.current?.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
			if (videoRef.current) videoRef.current.srcObject = null;
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
		qrRequestRef.current?.abort();
		qrRequestRef.current = null;
		setQrDetected(false);
		setScannedSlug(null);
		setScannedQrCode(null);
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
			const scanIntent = new URLSearchParams(window.location.search);
			const gameSlug = scanIntent.get("game")?.trim().toLowerCase() ?? "";
			const gameDestination = scanIntent.get("destination")?.trim().toLowerCase() ?? "";
			if (scannedQrCode && gameSlug && gameDestination === scannedSlug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameSlug)) {
				const gameUrl = new URL(`/minigame/${encodeURIComponent(gameSlug)}/${encodeURIComponent(scannedSlug)}`, window.location.origin);
				gameUrl.searchParams.set("qr", scannedQrCode);
				gameUrl.searchParams.set("source", "camera");
				router.push(gameUrl.pathname + gameUrl.search);
				return;
			}
			const destinationUrl = new URL(`/wisata/${encodeURIComponent(scannedSlug)}`, window.location.origin);
			if (scannedQrCode) {
				destinationUrl.searchParams.set("qr", scannedQrCode);
				destinationUrl.searchParams.set("source", "camera");
			}
			router.push(destinationUrl.pathname + destinationUrl.search);
		} catch (exploreError) {
			setPreviewError(
				exploreError instanceof Error
					? exploreError.message
					: "Gagal menghubungi server. Silakan coba lagi.",
			);
			setIsExploring(false);
		}
	}

	const modalOpen = qrDetected || Boolean(scannedSlug || previewError);
	return (
		<main className="fixed inset-0 z-40 flex h-[100dvh] min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-[#16587B] px-0 py-0 text-[#F5EEDD]">

			<header className="absolute left-0 right-0 top-0 z-30 flex w-full items-center justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 sm:pb-6">
				<Link href="/" className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2.5 text-sm font-bold text-[#16587B] shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B]">
					<span aria-hidden="true">←</span> Beranda
				</Link>
				<div className="flex items-center gap-2 rounded-full border border-[#84B3CE]/40 bg-white/90 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#16587B] shadow-sm backdrop-blur">
					<span className={`h-2.5 w-2.5 rounded-full ${status === "scanning" ? "animate-pulse bg-[#84B3CE]" : "bg-[#16587B]/35"}`} />
					QR Scanner
				</div>
			</header>

			<section className="absolute inset-0 z-10 m-0 w-full max-w-none">
				<div className="absolute inset-0 overflow-hidden bg-[#16587B]">
					<div className="relative isolate h-full w-full overflow-hidden bg-[#16587B]">
						<video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay aria-label="Tampilan kamera untuk memindai QR" />

						{status !== "idle" && status !== "error" ? (
							<div aria-hidden="true" className="pointer-events-none absolute inset-0">
								<div className="absolute inset-0 bg-[#16587B]/15" />
								<div className="absolute left-1/2 top-1/2 aspect-square w-[min(72vw,56svh,390px)] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-white/35 shadow-[0_0_0_999px_rgba(22,88,123,0.34)] sm:w-[min(42vw,62svh,440px)]">
									<div className="absolute -left-1 -top-1 h-12 w-12 rounded-tl-2xl border-l-[5px] border-t-[5px] border-[#F5EEDD]" />
									<div className="absolute -right-1 -top-1 h-12 w-12 rounded-tr-2xl border-r-[5px] border-t-[5px] border-[#F5EEDD]" />
									<div className="absolute -bottom-1 -left-1 h-12 w-12 rounded-bl-2xl border-b-[5px] border-l-[5px] border-[#F5EEDD]" />
									<div className="absolute -bottom-1 -right-1 h-12 w-12 rounded-br-2xl border-b-[5px] border-r-[5px] border-[#F5EEDD]" />
									{status === "scanning" ? <div className="absolute inset-x-5 top-1/2 h-0.5 animate-[scanline_2.4s_ease-in-out_infinite] bg-[#84B3CE] shadow-[0_0_16px_4px_rgba(132,179,206,0.7)]" /> : null}
								</div>
							</div>
						) : null}

						{status === "idle" ? (
							<div className="absolute inset-0 flex items-center justify-center bg-[#16587B]/30 px-4 py-20 text-center backdrop-blur-[2px] landscape:py-12">
								<div className="w-full max-w-sm rounded-[2rem] border border-white/35 bg-[#F5EEDD]/95 p-5 text-[#16587B] shadow-[0_24px_90px_-22px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8 landscape:rounded-2xl landscape:p-3">
									<div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-[#16587B] text-[#F5EEDD] shadow-lg shadow-[#16587B]/25 landscape:mb-1 landscape:h-9 landscape:w-9"><CameraIcon className="h-7 w-7 landscape:h-5 landscape:w-5" /></div>
									<p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#16587B]/55">TiLoc · QR Scanner</p>
									<h2 className="mt-2 text-xl font-black sm:text-2xl landscape:mt-1 landscape:text-lg">Siap untuk menjelajah?</h2>
									<p className="mt-2 text-sm leading-6 text-[#16587B]/70 landscape:mt-1 landscape:text-xs landscape:leading-4">Izinkan kamera untuk mengenali QR dan menampilkan informasi wisata. Kamera hanya aktif saat halaman scanner dibuka.</p>
									<button type="button" onClick={() => void startCamera()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#16587B] px-6 py-3 font-bold text-white shadow-lg shadow-[#16587B]/20 transition hover:-translate-y-0.5 hover:bg-[#16587B]/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#84B3CE]/60 landscape:mt-2 landscape:min-h-10 landscape:py-2">
										<CameraIcon /> Izinkan & aktifkan kamera
									</button>
									<p className="mt-2 text-xs text-[#16587B]/55 landscape:mt-1 landscape:text-[10px]">Dialog izin dari browser akan muncul setelah tombol ditekan.</p>
								</div>
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

						{qrDetected ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
							<div className="absolute inset-0 animate-[qr-screen-flash_700ms_ease-out_forwards] bg-cyan-100/30" />
							<div className="absolute left-1/2 top-1/2 aspect-square w-[min(72vw,56svh,390px)] -translate-x-1/2 -translate-y-1/2 animate-[qr-frame-pop_650ms_cubic-bezier(.2,.8,.2,1)_forwards] rounded-[1.75rem] border-[3px] border-cyan-100 shadow-[0_0_24px_8px_rgba(103,232,249,.72),0_0_0_999px_rgba(22,88,123,.16)] sm:w-[min(42vw,62svh,440px)]">
								<span className="qr-sparkle" /><span className="qr-sparkle" /><span className="qr-sparkle" /><span className="qr-sparkle" /><span className="qr-sparkle" /><span className="qr-sparkle" /><span className="qr-sparkle" /><span className="qr-sparkle" />
							</div>
						</div> : null}

						{status === "paused" && !modalOpen ? (
							<div className="absolute inset-0 flex items-center justify-center bg-[#16587B]/70 p-6 text-center text-white"><Spinner /><span className="ml-3 font-semibold">Memeriksa QR…</span></div>
						) : null}
					</div>

					{status === "scanning" ? <div aria-label="Kontrol kamera" className="absolute bottom-[max(.75rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 flex-nowrap items-center justify-center gap-2 rounded-2xl border border-white/30 bg-[#F5EEDD]/95 p-2 shadow-xl backdrop-blur-xl sm:bottom-6 sm:gap-2.5 sm:p-2.5">
						{status === "scanning" && devices.length > 1 ? (
							<button type="button" onClick={() => void switchCamera()} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#84B3CE]/50 bg-white text-[#16587B] transition hover:bg-[#84B3CE]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B]" aria-label="Putar kamera" title="Putar kamera"><FlipIcon /></button>
						) : null}
						{status === "scanning" && torchSupported ? (
							<button type="button" onClick={() => void toggleTorch()} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B] ${torchOn ? "bg-[#16587B] text-white" : "border border-[#84B3CE]/50 bg-white text-[#16587B] hover:bg-[#84B3CE]/25"}`} aria-label={torchOn ? "Matikan flash" : "Nyalakan flash"} title={torchOn ? "Matikan flash" : "Nyalakan flash"} aria-pressed={torchOn}><FlashIcon active={torchOn} /></button>
						) : null}
						{status === "scanning" ? (
							<button type="button" onClick={() => { stopCamera(); setStatus("idle"); }} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#84B3CE]/50 bg-white text-[#16587B] transition hover:bg-[#F5EEDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B]" aria-label="Selesai memindai" title="Selesai"><CloseIcon /></button>
						) : null}
					</div> : null}
				</div>

				{status === "scanning" ? <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+4.75rem)] z-20 w-[min(calc(100%-2rem),28rem)] -translate-x-1/2 rounded-xl border border-white/20 bg-[#0b3044]/70 px-4 py-2 text-center text-xs leading-5 text-white shadow-lg backdrop-blur-md">
					<p>Arahkan QR ke dalam bingkai. Pastikan gambar terang dan fokus.</p>
				</div> : null}
			</section>

			{modalOpen ? (
				<div className="fixed inset-0 z-50 flex items-end justify-center bg-[#16587B]/45 p-3 backdrop-blur-sm sm:items-center sm:p-6" role="presentation">
					<section role="dialog" aria-modal="true" aria-labelledby="destination-preview-title" className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white shadow-[0_30px_90px_-25px_rgba(22,88,123,0.5)]">
						<button type="button" onClick={resumeScanning} disabled={isExploring} className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#16587B] shadow transition hover:bg-[#F5EEDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16587B] disabled:opacity-50" aria-label="Tutup dan pindai lagi"><CloseIcon /></button>
						{loadingPreview ? (
							<div className="flex min-h-72 flex-col items-center justify-center p-10 text-center"><Spinner /><p className="mt-4 font-bold">Mencari destinasi…</p></div>
						) : qrDetected && !scannedSlug && !previewError ? (
							<div className="relative flex min-h-72 flex-col items-center justify-center overflow-hidden p-8 text-center sm:p-10">
								<div aria-hidden="true" className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-100/70 blur-3xl" />
								<div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-cyan-100 to-sky-50 text-[#16587B] shadow-[0_0_35px_rgba(56,189,248,.32)]"><svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="absolute inset-0 animate-ping rounded-2xl border border-sky-300/70" /></div>
								<p className="relative mt-5 text-xs font-black uppercase tracking-[.18em] text-sky-700">Pemindaian berhasil</p>
								<h2 id="destination-preview-title" className="relative mt-2 text-2xl font-black tracking-tight">QR terdeteksi!</h2>
								<p className="relative mt-2 max-w-xs text-sm leading-6 text-[#16587B]/70">Sedang memeriksa kode dan mencocokkan destinasi.</p>
								<div className="relative mt-5"><Spinner /></div>
							</div>
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
				@keyframes qr-screen-flash {
					0% { opacity: 0; }
					22% { opacity: 1; }
					100% { opacity: 0; }
				}
				@keyframes qr-frame-pop {
					0% { opacity: .55; transform: translate(-50%, -50%) scale(.88); }
					55% { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
					100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
				}
				.qr-sparkle { position: absolute; width: 8px; height: 8px; border-radius: 2px; background: #ecfeff; box-shadow: 0 0 12px 4px rgba(103,232,249,.9); animation: qr-sparkle-burst 700ms cubic-bezier(.16,.84,.44,1) both; }
				.qr-sparkle:nth-child(1) { top: 4%; left: 10%; --sparkle-x: -18px; --sparkle-y: -22px; }
				.qr-sparkle:nth-child(2) { top: 12%; right: 7%; --sparkle-x: 22px; --sparkle-y: -18px; }
				.qr-sparkle:nth-child(3) { top: 45%; right: 2%; --sparkle-x: 25px; --sparkle-y: -2px; }
				.qr-sparkle:nth-child(4) { bottom: 8%; right: 12%; --sparkle-x: 18px; --sparkle-y: 22px; }
				.qr-sparkle:nth-child(5) { bottom: 3%; left: 35%; --sparkle-x: -3px; --sparkle-y: 25px; }
				.qr-sparkle:nth-child(6) { bottom: 19%; left: 3%; --sparkle-x: -24px; --sparkle-y: 12px; }
				.qr-sparkle:nth-child(7) { top: 25%; left: 1%; --sparkle-x: -20px; --sparkle-y: -12px; }
				.qr-sparkle:nth-child(8) { top: 3%; left: 54%; --sparkle-x: 2px; --sparkle-y: -24px; }
				@keyframes qr-sparkle-burst {
					0% { opacity: 0; transform: scale(.2) rotate(0); }
					35% { opacity: 1; transform: scale(1.2) rotate(45deg); }
					100% { opacity: 0; transform: translate(var(--sparkle-x),var(--sparkle-y)) scale(.25) rotate(100deg); }
				}
				@media (prefers-reduced-motion: reduce) {
					*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
				}
			`}</style>
		</main>
	);
}
