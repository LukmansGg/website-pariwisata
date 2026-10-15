"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import NearbyCampaignPopup from "@/app/wisata/[slug]/nearby-campaign-popup";

type Layout = "single" | "strip2" | "grid6" | "travel_strip" | "memory_triptych";
type Ratio = "portrait" | "story" | "square";
type Template = { id: string; name: string; layout: Layout; ratio: Ratio; frameUrl: string; enabled: boolean };
type Program = { assignmentId: string; programSlug: string; programName: string; components: string[]; requiredComponents: string[]; photoboxAccessMode: "standalone" | "mission_reward"; photoboxTemplates: Template[]; captionTemplate: string; maxCaptionLength: number; progress: { completedComponents: string[]; completed: boolean } };
type State = { destinationName: string; destinationAddress?: string | null; destinationTags?: string[]; programs: Program[] };
type Destination = { slug: string; name: string; description: string | null; address: string | null; tags: string[] | null; mascot_mode: "tiloc" | "custom"; mascot_image_url: string | null };
type DraftPhoto = { url: string; file: File };
type PhotoSlot = DraftPhoto | null;
type PhotoTransform = { zoom: number; x: number; y: number };
type ImageSize = { width: number; height: number };
type PhotoDrag = { slot: number; pointerId: number; startX: number; startY: number; width: number; height: number; offsetX: number; offsetY: number };
const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = { zoom: 1, x: 0, y: 0 };
type IconName = "back" | "sun" | "moon" | "camera" | "flip" | "flashOn" | "flashOff" | "upload" | "check" | "download" | "share" | "close" | "lock" | "trash";

function templateAspectRatio(template: Template) {
	if (template.layout === "travel_strip") return "1 / 3";
	if (template.layout === "memory_triptych") return "9 / 16";
	return template.ratio === "story" ? "9 / 16" : template.ratio === "square" ? "1 / 1" : "4 / 5";
}

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
	const paths: Record<IconName, ReactNode> = {
		back: <path d="m15 18-6-6 6-6M9 12h12" />,
		sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
		moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />,
		camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>,
		flip: <><path d="M21 16v-2a4 4 0 0 0-4-4h-4M17 6l-4 4 4 4" /><path d="M3 8v2a4 4 0 0 0 4 4h4M7 18l4-4-4-4" /></>,
		flashOn: <path d="m13 2-3 8h7l-6 12 1-9H5l8-11Z" />,
		flashOff: <><path d="m3 3 18 18M13 2l-3 8h4M5 14l6 0-1 8 3-6" /></>,
		upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></>,
		check: <polyline points="20 6 9 17 4 12" />,
		download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
		share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>,
		close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
		lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
		trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
	};
	return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function AtmosphereLayer({ dark }: { dark: boolean }) {
	return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0B1221]">
		<div className={`absolute inset-0 bg-gradient-to-b from-[#78B3CE] via-[#C9E6F0] to-[#F5F8FA] transition-opacity duration-1000 ease-in-out ${dark ? "opacity-0" : "opacity-100"}`}>
			<div className="photobox-sun-glow absolute -left-[10%] -top-[10%] h-[60vw] w-[60vw] rounded-full bg-white/40 blur-[100px]" />
			<div className="photobox-sun-glow absolute -bottom-[15%] -right-[10%] h-[50vw] w-[50vw] rounded-full bg-white/30 blur-[90px] [animation-delay:-6s]" />
			{Array.from({ length: 7 }, (_, index) => <span key={`cloud-${index}`} className="photobox-cloud absolute rounded-full bg-white/40 blur-[40px]" style={{ top: `${(index * 31 + 4) % 94}%`, left: `${(index * 47 + 3) % 96}%`, width: `${14 + index * 4}vw`, height: `${6 + index * 2}vw`, animationDelay: `${-index * 2}s` }} />)}
		</div>
		<div className={`absolute inset-0 bg-gradient-to-b from-[#0B1221] via-[#112340] to-[#0A1930] transition-opacity duration-1000 ease-in-out ${dark ? "opacity-100" : "opacity-0"}`}>
			{Array.from({ length: 48 }, (_, index) => <span key={`star-${index}`} className="photobox-star absolute h-1 w-1 rounded-full bg-white/80" style={{ top: `${(index * 29 + 13) % 100}%`, left: `${(index * 67 + 7) % 100}%`, width: `${1 + index % 3}px`, height: `${1 + index % 3}px`, animationDelay: `${(index % 11) * .3}s`, boxShadow: `0 0 ${index % 4 + 2}px rgba(255,255,255,.8)` }} />)}
			<div className="photobox-aurora absolute -left-[10%] -top-[20%] h-[70%] w-[130%] -rotate-12 bg-gradient-to-r from-transparent via-sky-400/25 to-indigo-400/15 blur-[90px]" />
		</div>
	</div>;
}

function slotRects(layout: Layout, width: number, height: number) {
	if (layout === "travel_strip") return [
		{ x: width * (64 / 600), y: height * (192 / 1800), w: width * (476 / 600), h: height * (420 / 1800) },
		{ x: width * (62 / 600), y: height * (635 / 1800), w: width * (475 / 600), h: height * (421 / 1800) },
		{ x: width * (60 / 600), y: height * (1079 / 1800), w: width * (475 / 600), h: height * (421 / 1800) },
	];
	if (layout === "memory_triptych") return [
		{ x: width * (418 / 1080), y: height * (62 / 1920), w: width * (550 / 1080), h: height * (361 / 1920) },
		{ x: width * (226 / 1080), y: height * (427 / 1920), w: width * (628 / 1080), h: height * (595 / 1920) },
		{ x: width * (100 / 1080), y: height * (1436 / 1920), w: width * (733 / 1080), h: height * (438 / 1920) },
	];
	const pad = width * .0611;
	const top = height * .1185;
	const bottom = height * .8963;
	const gap = height * (layout === "grid6" ? .0133 : .0178);
	if (layout === "single") return [{ x: pad, y: top, w: width - pad * 2, h: bottom - top }];
	if (layout === "strip2") return [{ x: pad, y: top, w: width - pad * 2, h: (bottom - top - gap) / 2 }, { x: pad, y: top + (bottom - top + gap) / 2, w: width - pad * 2, h: (bottom - top - gap) / 2 }];
	const cellW = (width - pad * 2 - gap * 2) / 3;
	const cellH = (bottom - top - gap) / 2;
	return Array.from({ length: 6 }, (_, index) => ({ x: pad + (index % 3) * (cellW + gap), y: top + Math.floor(index / 3) * (cellH + gap), w: cellW, h: cellH }));
}

function imageFromFile(file: File) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new window.Image();
		const url = URL.createObjectURL(file);
		image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
		image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Foto ini belum bisa dibuka.")); };
		image.src = url;
	});
}

function drawCover(context: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, transform: PhotoTransform = DEFAULT_PHOTO_TRANSFORM) {
	const scale = Math.max(w / image.width, h / image.height) * transform.zoom;
	const drawWidth = image.width * scale;
	const drawHeight = image.height * scale;
	const drawX = x + (w - drawWidth) / 2 + transform.x * w;
	const drawY = y + (h - drawHeight) / 2 + transform.y * h;
	context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

export default function PhotoboxStudio({ programSlug, destination }: { programSlug: string; destination: Destination }) {
	const [dark, setDark] = useState(false);
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [state, setState] = useState<State | null>(null);
	const [selectedTemplateId, setSelectedTemplateId] = useState("");
	const [pendingTemplateId, setPendingTemplateId] = useState("");
	const [photos, setPhotos] = useState<PhotoSlot[]>([]);
	const [photoTransforms, setPhotoTransforms] = useState<PhotoTransform[]>([]);
	const [drafts, setDrafts] = useState<DraftPhoto[]>([]);
	const [caption, setCaption] = useState("");
	const [outputUrl, setOutputUrl] = useState("");
	const [outputFile, setOutputFile] = useState<File | null>(null);
	const [cameraOn, setCameraOn] = useState(false);
	const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
	const [flashOn, setFlashOn] = useState(false);
	const [flashSupported, setFlashSupported] = useState(false);
	const [activeSlot, setActiveSlot] = useState(0);
	const [saveToDrive, setSaveToDrive] = useState(false);
	const [saved, setSaved] = useState(false);
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const photoUrlsRef = useRef(new Set<string>());
	const imageSizesRef = useRef(new Map<string, ImageSize>());
	const photoDragRef = useRef<PhotoDrag | null>(null);
	const outputUrlRef = useRef("");
	const initializedCaption = useRef(false);

	const refresh = useCallback(async () => {
		const response = await fetch(`/api/minigame/state?destinationSlug=${encodeURIComponent(destination.slug)}`, { cache: "no-store" });
		const result = await response.json() as State & { error?: string };
		if (!response.ok) throw new Error(result.error || "Photobox belum dapat dimuat.");
		setState(result);
	}, [destination.slug]);
	useEffect(() => { void refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Photobox belum dapat dimuat.")); }, [refresh]);
	const program = state?.programs.find((item) => item.programSlug === programSlug);
	const templates = useMemo(() => (program?.photoboxTemplates ?? []).filter((template) => template.enabled), [program]);
	const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
	const slotCount = selectedTemplate?.layout === "grid6" ? 6 : selectedTemplate?.layout === "strip2" ? 2 : selectedTemplate?.layout === "travel_strip" || selectedTemplate?.layout === "memory_triptych" ? 3 : 1;
	const locked = program?.photoboxAccessMode === "mission_reward" && !program.progress.completed;
	const mascot = destination.mascot_mode === "custom" && destination.mascot_image_url ? destination.mascot_image_url : "/maskot/frame_0.png";
	const completedSlots = photos.slice(0, slotCount).filter(Boolean).length;
	const allSlotsFilled = slotCount > 0 && completedSlots === slotCount;
	const frameWidth = selectedTemplate?.layout === "travel_strip" ? 600 : 1080;
	const frameHeight = selectedTemplate?.layout === "travel_strip" ? 1800 : selectedTemplate?.layout === "memory_triptych" ? 1920 : selectedTemplate?.ratio === "story" ? 1920 : selectedTemplate?.ratio === "square" ? 1080 : 1350;
	const previewRects = selectedTemplate ? slotRects(selectedTemplate.layout, frameWidth, frameHeight) : [];
	const activeTransform = photoTransforms[activeSlot] ?? DEFAULT_PHOTO_TRANSFORM;

	useEffect(() => { if (selectedTemplate && selectedTemplate.id !== selectedTemplateId) setSelectedTemplateId(selectedTemplate.id); }, [selectedTemplate, selectedTemplateId]);
	useEffect(() => {
		if (!program || initializedCaption.current) return;
		const tags = (state?.destinationTags ?? destination.tags ?? []).map((tag) => `#${tag.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "")}`).filter((tag) => tag.length > 1).slice(0, 4);
		const base = (program.captionTemplate || "Kenangan seru di {destination}!").replaceAll("{destination}", destination.name);
		const place = destination.address || state?.destinationAddress;
		setCaption(`${base} ${place ? `📍 ${place}` : ""} ${[...new Set([...tags, "#TiLoc", "#JelajahMadiun"])].join(" ")}`.trim().slice(0, program.maxCaptionLength));
		initializedCaption.current = true;
	}, [destination.name, destination.tags, program, state?.destinationTags]);
	useEffect(() => () => {
		streamRef.current?.getTracks().forEach((track) => track.stop());
		photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
		photoUrlsRef.current.clear();
		if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
	}, []);
	useEffect(() => {
		const liveUrls = new Set([...drafts, ...photos.filter((photo): photo is DraftPhoto => Boolean(photo))].map((photo) => photo.url));
		for (const url of photoUrlsRef.current) {
			if (!liveUrls.has(url)) { URL.revokeObjectURL(url); photoUrlsRef.current.delete(url); imageSizesRef.current.delete(url); }
		}
	}, [drafts, photos]);

	useEffect(() => {
		const video = videoRef.current;
		if (!cameraOn || !video || !streamRef.current) return;
		video.srcObject = streamRef.current;
		void video.play().catch(() => setStatus("Kamera siap, tetapi browser belum dapat memutar pratinjau."));
		return () => { video.srcObject = null; };
	}, [cameraOn, activeSlot]);

	function clearOutput() {
		if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
		outputUrlRef.current = "";
		setOutputUrl("");
		setOutputFile(null);
	}

	function clearPhotos() {
		setPhotos([]);
		setPhotoTransforms([]);
		clearOutput();
	}

	function panLimits(index: number, zoom: number) {
		const photo = photos[index];
		const imageSize = photo ? imageSizesRef.current.get(photo.url) : undefined;
		const rect = previewRects[index];
		if (!imageSize || !rect) return { x: 0, y: 0 };
		const scale = Math.max(rect.w / imageSize.width, rect.h / imageSize.height) * zoom;
		return {
			x: Math.max(0, (imageSize.width * scale - rect.w) / (2 * rect.w)),
			y: Math.max(0, (imageSize.height * scale - rect.h) / (2 * rect.h)),
		};
	}

	function clampTransform(index: number, transform: PhotoTransform): PhotoTransform {
		const zoom = Math.min(3, Math.max(1, transform.zoom));
		const limits = panLimits(index, zoom);
		return {
			zoom,
			x: Math.min(limits.x, Math.max(-limits.x, transform.x)),
			y: Math.min(limits.y, Math.max(-limits.y, transform.y)),
		};
	}

	function updatePhotoTransform(index: number, patch: Partial<PhotoTransform>) {
		setPhotoTransforms((current) => {
			const next = [...current];
			next[index] = clampTransform(index, { ...(current[index] ?? DEFAULT_PHOTO_TRANSFORM), ...patch });
			return next;
		});
		clearOutput();
		setSaved(false);
	}

	function recordPhotoSize(index: number, url: string, image: HTMLImageElement) {
		imageSizesRef.current.set(url, { width: image.naturalWidth, height: image.naturalHeight });
		setPhotoTransforms((current) => {
			const transform = current[index];
			if (!transform) return current;
			const next = [...current];
			next[index] = clampTransform(index, transform);
			return next;
		});
	}

	function beginPhotoDrag(event: ReactPointerEvent<HTMLDivElement>, index: number) {
		if (step !== 2 || !photos[index] || event.button !== 0) return;
		const bounds = event.currentTarget.getBoundingClientRect();
		if (!bounds.width || !bounds.height) return;
		event.preventDefault();
		const transform = photoTransforms[index] ?? DEFAULT_PHOTO_TRANSFORM;
		photoDragRef.current = { slot: index, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: bounds.width, height: bounds.height, offsetX: transform.x, offsetY: transform.y };
		setActiveSlot(index);
		event.currentTarget.setPointerCapture(event.pointerId);
		clearOutput();
		setSaved(false);
	}

	function movePhotoDrag(event: ReactPointerEvent<HTMLDivElement>, index: number) {
		const drag = photoDragRef.current;
		if (!drag || drag.slot !== index || drag.pointerId !== event.pointerId) return;
		setPhotoTransforms((current) => {
			const next = [...current];
			next[index] = clampTransform(index, {
				...(current[index] ?? DEFAULT_PHOTO_TRANSFORM),
				x: drag.offsetX + (event.clientX - drag.startX) / drag.width,
				y: drag.offsetY + (event.clientY - drag.startY) / drag.height,
			});
			return next;
		});
	}

	function endPhotoDrag(event: ReactPointerEvent<HTMLDivElement>) {
		if (photoDragRef.current?.pointerId === event.pointerId) photoDragRef.current = null;
	}

	function clearPhotoSlot(index: number) {
		setPhotos((current) => { const next = [...current]; next[index] = null; return next; });
		setPhotoTransforms((current) => { const next = [...current]; next[index] = DEFAULT_PHOTO_TRANSFORM; return next; });
		clearOutput();
		setSaved(false);
	}

	function advanceSlot(from: number) {
		for (let offset = 1; offset < slotCount; offset++) {
			const candidate = (from + offset) % slotCount;
			if (!photos[candidate]) { setActiveSlot(candidate); return; }
		}
		setActiveSlot(from);
	}

	function putFile(file: File, preferSlot?: number, advance = true) {
		if (!file.type.startsWith("image/")) { setStatus("Pilih file gambar seperti JPEG, PNG, atau WebP."); return; }
		if (file.size > 18 * 1024 * 1024) { setStatus("Ukuran tiap foto maksimal 18 MB."); return; }
		const url = URL.createObjectURL(file);
		photoUrlsRef.current.add(url);
		const photo = { url, file };
		setDrafts((current) => [photo, ...current.filter((draft) => draft.url !== url)].slice(0, 12));
		const index = preferSlot ?? Math.max(0, photos.findIndex((item) => !item));
		setPhotos((current) => {
			const next = [...current];
			next[index] = photo;
			return next;
		});
		setPhotoTransforms((current) => { const next = [...current]; next[index] = DEFAULT_PHOTO_TRANSFORM; return next; });
		if (advance) advanceSlot(index);
		clearOutput(); setSaved(false); setStatus("");
	}

	function assignDraftToSlot(draft: DraftPhoto) {
		setPhotos((current) => { const next = [...current]; next[activeSlot] = draft; return next; });
		setPhotoTransforms((current) => { const next = [...current]; next[activeSlot] = DEFAULT_PHOTO_TRANSFORM; return next; });
		advanceSlot(activeSlot);
		clearOutput(); setSaved(false); setStatus("");
	}

	function removeDraft(index: number) {
		setDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index));
	}

	function handleDrop(event: DragEvent<HTMLDivElement>, index: number) {
		event.preventDefault();
		const file = event.dataTransfer.files[0];
		if (file) putFile(file, index, false);
	}

	async function startCamera(mode: "user" | "environment" = facingMode) {
		stopCamera();
		setStatus("");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 960 } } });
			streamRef.current = stream;
			const track = stream.getVideoTracks()[0];
			const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
			setFlashSupported(Boolean(capabilities?.torch));
			setFacingMode(mode);
			setCameraOn(true);
		} catch (error) { setStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Izin kamera ditolak. Aktifkan kamera di browser, lalu coba lagi." : "Kamera tidak dapat dibuka. Pastikan situs memakai HTTPS atau localhost."); }
	}

	function toggleCameraFacing() {
		void startCamera(facingMode === "user" ? "environment" : "user");
	}

	function stopCamera() {
		streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
		setCameraOn(false);
		setFlashOn(false);
		setFlashSupported(false);
	}

	async function toggleFlash() {
		const track = streamRef.current?.getVideoTracks()[0];
		if (!track || !flashSupported) return;
		try {
			const next = !flashOn;
			const constraints = { advanced: [{ torch: next }] } as unknown as MediaTrackConstraints;
			await track.applyConstraints(constraints);
			setFlashOn(next);
		} catch { setStatus("Flash tidak dapat diaktifkan pada kamera ini."); }
	}

	async function capturePhoto() {
		const video = videoRef.current;
		if (!video || !video.videoWidth) return;
		const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
		const context = canvas.getContext("2d"); if (!context) return;
		context.save();
		if (facingMode === "user") { context.translate(canvas.width, 0); context.scale(-1, 1); }
		context.drawImage(video, 0, 0, canvas.width, canvas.height); context.restore();
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
		if (blob) putFile(new File([blob], `momen-${Date.now()}.jpg`, { type: "image/jpeg" }), activeSlot);
	}

	async function compose() {
		if (!selectedTemplate || !program) return false;
		if (!allSlotsFilled) { setStatus(`Isi semua ${slotCount} bidang foto sebelum membuat hasil.`); return false; }
		setBusy(true); setStatus("");
		try {
			const canvas = document.createElement("canvas"); canvas.width = frameWidth; canvas.height = frameHeight;
			const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas tidak tersedia pada browser ini.");
			context.fillStyle = "#fff8e8"; context.fillRect(0, 0, canvas.width, canvas.height);
			const rects = slotRects(selectedTemplate.layout, canvas.width, canvas.height);
			for (let index = 0; index < slotCount; index++) {
				const photo = photos[index]; if (!photo) continue;
				const image = await imageFromFile(photo.file);
				const rect = rects[index];
				context.save(); context.beginPath(); context.roundRect(rect.x, rect.y, rect.w, rect.h, 12); context.clip(); drawCover(context, image, rect.x, rect.y, rect.w, rect.h, photoTransforms[index] ?? DEFAULT_PHOTO_TRANSFORM); context.restore();
			}
			const frame = new window.Image(); frame.crossOrigin = "anonymous";
			await new Promise<void>((resolve, reject) => { frame.onload = () => resolve(); frame.onerror = () => reject(new Error("Frame custom tidak dapat dirender. Gunakan URL gambar yang mengizinkan akses lintas situs.")); frame.src = selectedTemplate.frameUrl; });
			context.drawImage(frame, 0, 0, canvas.width, canvas.height);
			context.fillStyle = "rgba(22,88,123,.82)"; context.font = `bold ${Math.max(14, canvas.width * (22 / 1080))}px Arial`; context.textAlign = "center";
			const place = destination.address || state?.destinationAddress || destination.name;
			context.fillText(place.slice(0, 70), canvas.width / 2, canvas.height - canvas.width * (30 / 1080));
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
			if (!blob) throw new Error("Gambar hasil belum dapat dibuat.");
		if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
			const nextUrl = URL.createObjectURL(blob);
			outputUrlRef.current = nextUrl;
			setOutputUrl(nextUrl); setOutputFile(new File([blob], `${destination.slug}-photobox.jpg`, { type: "image/jpeg" })); setSaved(false);
			return true;
		} catch (error) { setStatus(error instanceof Error ? error.message : "Hasil foto belum dapat dibuat."); return false; }
		finally { setBusy(false); }
	}

	function requestTemplateChange(templateId: string) {
		if (templateId === selectedTemplate?.id) return;
		if (photos.some(Boolean)) { setPendingTemplateId(templateId); return; }
		applyTemplateChange(templateId);
	}

	function applyTemplateChange(templateId: string) {
		stopCamera();
		clearPhotos();
		setSelectedTemplateId(templateId);
		setActiveSlot(0);
		setStep(1);
		setSaved(false);
		setPendingTemplateId("");
	}

	async function continueToReview() {
		const ready = await compose();
		if (ready) { stopCamera(); setStep(3); }
	}
	async function saveProgress() {
		if (!program || !selectedTemplate || !caption.trim() || !outputFile) return;
		setBusy(true); setStatus("");
		try {
			let response: Response;
			if (saveToDrive) {
				const form = new FormData(); form.set("photo", outputFile); form.set("programSlug", programSlug); form.set("destinationSlug", destination.slug); form.set("templateId", selectedTemplate.id); form.set("caption", caption.trim());
				response = await fetch("/api/minigame/photobox/drive", { method: "POST", body: form });
			} else {
				response = await fetch("/api/minigame/photobox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programSlug, destinationSlug: destination.slug, templateId: selectedTemplate.id, caption: caption.trim() }) });
			}
			const result = await response.json() as { error?: string; photosCreated?: number };
			if (!response.ok) throw new Error(result.error || "Kenangan belum tersimpan.");
			setSaved(true);
			setStatus(saveToDrive ? "Kenangan tersimpan privat di Drive pengelola dan tercatat di progres." : "Kenangan tercatat di progres. File foto tetap ada di perangkatmu.");
			await refresh().catch(() => undefined);
		} catch (error) { setStatus(error instanceof Error ? error.message : "Kenangan belum tersimpan."); }
		finally { setBusy(false); }
	}

	async function sharePhoto() {
		if (!outputFile) return;
		try {
			if (navigator.share && navigator.canShare?.({ files: [outputFile] })) await navigator.share({ files: [outputFile], title: `Kenangan ${destination.name}`, text: caption });
			else { await navigator.clipboard.writeText(caption); setStatus("Caption disalin. Unduh gambar, lalu unggah ke media sosial pilihanmu."); }
		} catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("Menu berbagi tidak tersedia. Unduh foto untuk membagikannya."); }
	}

	const maxCaption = program?.maxCaptionLength ?? 280;
	const downloadName = destination.slug + "-" + (selectedTemplate?.id ?? "photobox") + ".jpg";
	const ink = dark ? "text-white" : "text-[#0F2C59]";
	const muted = dark ? "text-slate-300/70" : "text-slate-600";
	const glassPanel = dark ? "border-white/10 bg-[#0F172A]/75 shadow-2xl transition-colors duration-500" : "border-white/80 bg-white/75 shadow-2xl transition-colors duration-500";
	const btnSolid = dark ? "bg-[#38BDF8] text-[#0F172A] hover:brightness-105" : "bg-[#0F2C59] text-white hover:bg-[#173d75]";
	const btnSecondary = dark ? "border-white/20 bg-white/5 text-white hover:bg-white/10" : "border-black/15 bg-white/80 text-[#0F2C59] hover:bg-black/5";
	const atmosphereStyle = ".photobox-cloud{animation:photobox-drift 34s ease-in-out infinite alternate}.photobox-sun-glow{animation:photobox-glow 14s ease-in-out infinite alternate}.photobox-star{animation:photobox-twinkle 3.4s ease-in-out infinite alternate}.photobox-aurora{animation:photobox-aurora 18s ease-in-out infinite alternate}@keyframes photobox-drift{from{transform:translate3d(-2%,0,0)}to{transform:translate3d(3%,2%,0)}}@keyframes photobox-glow{from{transform:scale(.96);opacity:.55}to{transform:scale(1.08);opacity:.9}}@keyframes photobox-twinkle{from{opacity:.28;transform:scale(.75)}to{opacity:1;transform:scale(1.25)}}@keyframes photobox-aurora{from{transform:translateX(-4%) rotate(-12deg);opacity:.5}to{transform:translateX(5%) rotate(-7deg);opacity:.9}}.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}@media(prefers-reduced-motion:reduce){.photobox-cloud,.photobox-sun-glow,.photobox-star,.photobox-aurora{animation:none!important}}";
	const frameHeightVh = step === 1 ? 42 : selectedTemplate?.layout === "travel_strip" ? 62 : 48;
	const previewWidth = "min(100%, " + (frameWidth / frameHeight * frameHeightVh) + "dvh, " + (frameWidth / frameHeight * 560) + "px)";

	if (!state) return <main className={"relative isolate grid min-h-dvh place-items-center overflow-hidden p-5 " + ink}><AtmosphereLayer dark={dark} /><style>{atmosphereStyle}</style><section className={"relative z-10 w-full max-w-md rounded-[2rem] border p-8 text-center backdrop-blur-xl " + glassPanel}><Icon name="camera" className="mx-auto h-10 w-10 text-sky-500" /><h1 className="mt-4 text-2xl font-black">{status || "Menyiapkan Photobox…"}</h1><p className={"mt-2 text-sm " + muted}>{status ? "Periksa koneksi lalu coba lagi." : "Memuat frame dan pengaturan destinasi."}</p>{status && <button type="button" onClick={() => { setStatus(""); void refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Photobox belum dapat dimuat.")); }} className={"mt-5 rounded-xl px-5 py-3 text-xs font-black " + btnSolid}>Coba lagi</button>}</section></main>;
	if (!program) return <main className={"relative isolate grid min-h-dvh place-items-center overflow-hidden p-5 " + ink}><AtmosphereLayer dark={dark} /><style>{atmosphereStyle}</style><section className={"relative z-10 w-full max-w-md rounded-[2rem] border p-8 text-center backdrop-blur-xl " + glassPanel}><h1 className="text-2xl font-black">Photobox belum aktif</h1><p className={"mt-3 text-sm leading-6 " + muted}>Program ini belum menerapkan Photobox ke destinasi ini.</p><Link href={"/wisata/" + encodeURIComponent(destination.slug)} className={"mt-6 inline-flex rounded-xl px-5 py-3 text-xs font-black " + btnSolid}>Kembali ke wisata</Link></section></main>;
	if (locked) return <main className={"relative isolate grid min-h-dvh place-items-center overflow-hidden p-5 " + ink}><AtmosphereLayer dark={dark} /><style>{atmosphereStyle}</style><div className="absolute right-4 top-4 z-20"><button type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? "Tema siang" : "Tema malam"} className={"grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md " + (dark ? "border-white/10 bg-black/40 text-yellow-300" : "border-black/10 bg-white/60 text-amber-500")}><Icon name={dark ? "sun" : "moon"} className="h-5 w-5" /></button></div><section className={"relative z-10 w-full max-w-md rounded-[2rem] border p-8 text-center backdrop-blur-xl " + glassPanel}><div className="relative mx-auto h-20 w-20"><Image src={mascot} alt="Maskot TiLoc" fill unoptimized className="object-contain" /></div><Icon name="lock" className="mx-auto mt-3 h-7 w-7 text-sky-500" /><h1 className="mt-3 text-2xl font-black">Photobox terkunci</h1><p className={"mt-3 text-sm leading-6 " + muted}>Selesaikan seluruh misi wajib di {destination.name} untuk membuka kenangan ini.</p><Link href={"/minigame/" + encodeURIComponent(programSlug) + "/" + encodeURIComponent(destination.slug)} className={"mt-6 inline-flex rounded-xl px-5 py-3 text-xs font-black " + btnSolid}>Kembali ke misi</Link></section></main>;

	return <main className={"relative isolate flex min-h-dvh flex-col overflow-hidden " + ink}>
		<AtmosphereLayer dark={dark} /><style>{atmosphereStyle}</style>
		<header className="relative z-40 mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">{step > 1 ? <button type="button" onClick={() => { if (step === 2) stopCamera(); setStep(step === 2 ? 1 : 2); }} aria-label="Kembali ke langkah sebelumnya" className={"grid h-10 w-10 place-items-center rounded-2xl border backdrop-blur-md shadow-sm transition-transform hover:-translate-x-1 " + (dark ? "border-white/10 bg-black/40 text-white" : "border-black/10 bg-white/60 text-[#0F2C59]")}><Icon name="back" className="h-5 w-5" /></button> : <Link href={"/wisata/" + encodeURIComponent(destination.slug)} aria-label="Kembali ke wisata" className={"grid h-10 w-10 place-items-center rounded-2xl border backdrop-blur-md shadow-sm transition-transform hover:-translate-x-1 " + (dark ? "border-white/10 bg-black/40 text-white" : "border-black/10 bg-white/60 text-[#0F2C59]")}><Icon name="back" className="h-5 w-5" /></Link>}<div className="min-w-0 px-3 text-center"><span className={"block text-[10px] font-black uppercase tracking-[.18em] " + (dark ? "text-sky-300" : "text-[#0F2C59]/60")}>PHOTOBOX STUDIO</span><span className="block truncate text-sm font-bold">{destination.name}</span></div><button type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? "Gunakan tema siang" : "Gunakan tema malam"} className={"grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md shadow-sm transition-transform hover:rotate-12 " + (dark ? "border-white/10 bg-black/40 text-yellow-300" : "border-black/10 bg-white/60 text-amber-500")}><Icon name={dark ? "sun" : "moon"} className="h-5 w-5" /></button></header>

		<section className={"relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-3 transition-all duration-500 " + (step === 1 ? "min-h-[40dvh]" : "min-h-[45dvh]")}>
			{step === 3 && outputUrl ? <img src={outputUrl} alt="Hasil Photobox" className="max-h-[48dvh] max-w-full rounded-xl object-contain shadow-2xl transition-all duration-500" /> : selectedTemplate ? <div className="relative inline-block overflow-hidden rounded-md bg-slate-200/80 shadow-2xl transition-all duration-500" style={{ aspectRatio: frameWidth + " / " + frameHeight, width: previewWidth, maxWidth: "100%", boxShadow: "inset 0 0 20px rgba(0,0,0,.12), 0 24px 60px rgba(8,34,60,.25)" }}>
				{previewRects.map((rect, index) => {
					const photo = photos[index];
					const transform = photoTransforms[index] ?? DEFAULT_PHOTO_TRANSFORM;
					const isActiveEdit = step === 2 && activeSlot === index && Boolean(photo);
					return <div key={index} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, index)} onClick={() => { if (step === 2) setActiveSlot(index); }} onPointerDown={(event) => beginPhotoDrag(event, index)} onPointerMove={(event) => movePhotoDrag(event, index)} onPointerUp={endPhotoDrag} onPointerCancel={endPhotoDrag} className={"absolute overflow-hidden bg-slate-300 transition-all duration-300 " + (isActiveEdit ? "cursor-grab active:cursor-grabbing " : "cursor-pointer ") + (isActiveEdit ? (dark ? "ring-2 ring-inset ring-sky-300" : "ring-2 ring-inset ring-[#0F2C59]") : "")} style={{ top: (rect.y / frameHeight * 100) + "%", left: (rect.x / frameWidth * 100) + "%", width: (rect.w / frameWidth * 100) + "%", height: (rect.h / frameHeight * 100) + "%", zIndex: 1, touchAction: isActiveEdit ? "none" : "auto" }}>
						{photo && <img src={photo.url} alt={"Foto " + (index + 1)} draggable={false} onLoad={(event) => recordPhotoSize(index, photo.url, event.currentTarget)} className="absolute max-w-none select-none object-cover" style={{ width: `${transform.zoom * 100}%`, height: `${transform.zoom * 100}%`, left: `${50 + transform.x * 100}%`, top: `${50 + transform.y * 100}%`, transform: "translate(-50%, -50%)" }} />}
					{step === 2 && cameraOn && activeSlot === index && <video ref={videoRef} className={"absolute inset-0 z-[2] h-full w-full object-cover " + (facingMode === "user" ? "scale-x-[-1]" : "")} playsInline muted autoPlay aria-label="Pratinjau kamera" />}
					{!photos[index] && !(step === 2 && cameraOn && activeSlot === index) && <div className="absolute inset-0 grid place-items-center opacity-40"><Icon name="camera" className="h-1/4 max-h-10 w-1/4 text-slate-700" /></div>}
					{step === 2 && activeSlot === index && <div className={"pointer-events-none absolute inset-0 z-[3] border-[3px] border-dashed animate-pulse " + (dark ? "border-sky-400" : "border-[#0F2C59]")} />}
					</div>;
				})}
				<img src={selectedTemplate.frameUrl} alt={"Frame " + selectedTemplate.name} className="pointer-events-none absolute inset-0 z-[4] h-full w-full object-fill drop-shadow-xl" />
			</div> : <div className={"rounded-3xl border p-8 text-center backdrop-blur-xl " + glassPanel}><span className="text-4xl">☁️</span><h2 className="mt-3 font-black">Belum ada frame aktif</h2><p className={"mt-2 text-xs " + muted}>Pengelola perlu mengaktifkan frame untuk destinasi ini.</p></div>}
		</section>

		<section className={"relative z-20 mx-auto max-h-[62dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border-t p-5 pb-[max(2rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-all duration-500 " + glassPanel}>
			<div className="mb-3 flex items-center justify-center gap-2" aria-label={"Langkah " + step + " dari 3"}>{[1, 2, 3].map((item) => <span key={item} className={"h-1.5 rounded-full transition-all duration-300 " + (item === step ? "w-8 " + (dark ? "bg-sky-400" : "bg-[#0F2C59]") : "w-3 " + (dark ? "bg-white/20" : "bg-black/15"))} />)}</div>

			{step === 1 && <div className="animate-in slide-in-from-right-8 duration-300"><div className="mb-3 flex items-end justify-between"><div><p className={"text-[9px] font-black uppercase tracking-[.18em] " + muted}>LANGKAH 01</p><h2 className="mt-1 text-xl font-black">Pilih frame</h2></div><span className={"text-[10px] font-bold " + muted}>{templates.length} tersedia</span></div><div className="hide-scrollbar -mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-4">{templates.map((template) => <button key={template.id} type="button" onClick={() => requestTemplateChange(template.id)} aria-pressed={selectedTemplate?.id === template.id} className={"relative shrink-0 snap-center overflow-hidden rounded-2xl border-[3px] bg-white/20 transition-all duration-300 " + (selectedTemplate?.id === template.id ? (dark ? "scale-100 border-sky-400 shadow-[0_0_18px_rgba(56,189,248,.3)]" : "scale-100 border-[#0F2C59] shadow-xl") : "scale-95 border-transparent opacity-65")} style={{ height: "140px", aspectRatio: templateAspectRatio(template) }}><img src={template.frameUrl} className="h-full w-full object-cover" alt={template.name} />{selectedTemplate?.id === template.id && <span className={"absolute bottom-2 right-2 rounded-full p-1 " + (dark ? "bg-sky-400 text-[#0F172A]" : "bg-[#0F2C59] text-white")}><Icon name="check" className="h-3 w-3" /></span>}<span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 text-left text-[10px] font-black text-white">{template.name}</span></button>)}{templates.length === 0 && <p className={"py-6 text-sm " + muted}>Belum ada frame aktif.</p>}</div><button type="button" onClick={() => { setStep(2); setActiveSlot(0); }} disabled={!selectedTemplate} className={"w-full rounded-2xl py-4 text-base font-black shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-40 " + btnSolid}>Pilih &amp; Lanjut</button></div>}

			{step === 2 && selectedTemplate && <div className="animate-in slide-in-from-right-8 flex flex-col gap-4 duration-300"><div className="flex items-center justify-between"><div><p className={"text-[9px] font-black uppercase tracking-[.18em] " + muted}>LANGKAH 02</p><h2 className="mt-1 text-xl font-black">Isi bidang fotomu</h2></div><span className={"text-[10px] font-bold " + muted}>{completedSlots}/{slotCount} terisi</span></div><div className="flex w-full justify-center gap-2">{Array.from({ length: slotCount }, (_, index) => <button key={index} type="button" onClick={() => setActiveSlot(index)} className={"max-w-[80px] flex-1 rounded-full border py-2 text-[10px] font-bold transition-all " + (activeSlot === index ? (dark ? "border-sky-400 bg-sky-400 text-[#0F172A]" : "border-[#0F2C59] bg-[#0F2C59] text-white") : photos[index] ? (dark ? "border-transparent bg-white/20 text-white" : "border-transparent bg-black/10 text-[#0F2C59]") : (dark ? "border-white/20 text-white/55" : "border-black/20 text-black/55"))}>Slot {index + 1}{photos[index] ? " ✓" : ""}</button>)}</div>
{photos[activeSlot] && <div className={"rounded-2xl border p-3 " + (dark ? "border-sky-300/20 bg-sky-300/5" : "border-[#0F2C59]/10 bg-white/55")}>
	<div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black">Atur foto · Slot {activeSlot + 1}</p><p className={"mt-1 text-[10px] " + muted}>Geser foto pada pratinjau untuk mengatur posisi.</p></div><span className={"rounded-full px-2 py-1 text-[10px] font-black tabular-nums " + (dark ? "bg-sky-300/10 text-sky-200" : "bg-[#0F2C59]/10 text-[#0F2C59]")}>{activeTransform.zoom.toFixed(2).replace(/0$/, "")}×</span></div>
	<div className="mt-3 flex items-center gap-3"><span className={"text-[10px] font-bold " + muted}>Zoom</span><input type="range" min="1" max="3" step="0.05" value={activeTransform.zoom} onChange={(event) => updatePhotoTransform(activeSlot, { zoom: Number(event.currentTarget.value) })} aria-label={"Perbesar foto slot " + (activeSlot + 1)} className="h-2 flex-1 cursor-pointer accent-sky-500" /><button type="button" onClick={() => updatePhotoTransform(activeSlot, DEFAULT_PHOTO_TRANSFORM)} className={"rounded-lg border px-2.5 py-1.5 text-[10px] font-bold " + btnSecondary}>Reset</button></div>
	<button type="button" onClick={() => clearPhotoSlot(activeSlot)} className="mt-3 text-[10px] font-bold text-rose-500">Kosongkan slot ini</button>
</div>}
<div className={"hide-scrollbar flex min-h-[74px] w-full items-center gap-2 overflow-x-auto rounded-2xl border p-2 " + (dark ? "border-white/10 bg-black/20" : "border-black/10 bg-white/55")}>{drafts.length === 0 && <p className={"w-full text-center text-xs font-semibold " + muted}>Draf foto sesi ini muncul di sini.</p>}{drafts.map((draft, index) => <div key={draft.url} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-transparent"><button type="button" onClick={() => assignDraftToSlot(draft)} aria-label={"Pasang draf foto " + (index + 1) + " ke slot " + (activeSlot + 1)} className="h-full w-full cursor-pointer"><img src={draft.url} className="h-full w-full object-cover" alt={"Draf foto " + (index + 1)} /></button><button type="button" onClick={() => removeDraft(index)} aria-label={"Hapus draf foto " + (index + 1)} className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-bl-lg bg-rose-500/90 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><Icon name="trash" className="h-3 w-3" /></button></div>)}</div><div className="flex w-full items-center justify-around gap-3 px-1"><label className="flex cursor-pointer flex-col items-center gap-1"><span className={"grid h-12 w-12 place-items-center rounded-2xl border " + btnSecondary}><Icon name="upload" className="h-5 w-5" /></span><span className="text-[9px] font-bold opacity-70">Unggah</span><input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); const start = activeSlot; files.slice(0, slotCount).forEach((file, offset) => putFile(file, (start + offset) % slotCount, false)); if (files.length) setActiveSlot((start + Math.min(files.length, slotCount)) % slotCount); if (files.length > slotCount) setStatus("Frame ini memiliki " + slotCount + " slot foto."); event.currentTarget.value = ""; }} /></label>{flashSupported && <button type="button" onClick={() => void toggleFlash()} className={"flex flex-col items-center gap-1"}><span className={"grid h-12 w-12 place-items-center rounded-2xl border " + (flashOn ? "border-amber-400 bg-amber-400/20 text-amber-500" : btnSecondary)}><Icon name={flashOn ? "flashOn" : "flashOff"} className="h-5 w-5" /></span><span className="text-[9px] font-bold opacity-70">Flash</span></button>}{cameraOn ? <><button type="button" onClick={() => void capturePhoto()} className={"flex flex-col items-center gap-1"}><span className={"grid h-16 w-16 place-items-center rounded-full border-4 p-1 shadow-lg active:scale-95 " + (dark ? "border-sky-400" : "border-[#0F2C59]")}><span className={"h-full w-full rounded-full " + (dark ? "bg-sky-400" : "bg-[#0F2C59]")} /></span><span className="text-[9px] font-bold opacity-70">Jepret</span></button><button type="button" onClick={toggleCameraFacing} className="flex flex-col items-center gap-1"><span className={"grid h-12 w-12 place-items-center rounded-2xl border " + btnSecondary}><Icon name="flip" className="h-5 w-5" /></span><span className="text-[9px] font-bold opacity-70">Kamera</span></button></> : <button type="button" onClick={() => void startCamera()} className={"rounded-full px-7 py-4 text-sm font-black shadow-xl transition-transform hover:scale-105 " + btnSolid}>Buka Kamera</button>}</div><p className={"text-center text-[10px] " + muted}>Pilih foto draf atau jepret untuk mengganti slot aktif.</p><button type="button" onClick={() => { stopCamera(); setStep(1); }} className={"w-full rounded-xl border py-3 text-xs font-bold " + btnSecondary}>Kembali pilih frame</button><button type="button" onClick={() => void continueToReview()} disabled={!allSlotsFilled || busy} className={"w-full rounded-2xl py-4 text-base font-black transition-all disabled:opacity-40 " + btnSolid}>{busy ? "Merangkai foto…" : "Lanjut publish →"}</button></div>}

			{step === 3 && <div className="animate-in slide-in-from-right-8 duration-300"><div className="mb-4"><p className={"text-[9px] font-black uppercase tracking-[.18em] " + muted}>LANGKAH 03</p><h2 className="mt-1 text-xl font-black">Satu cerita, satu kenangan</h2><label className="mt-4 block text-xs font-bold">Caption kenangan<textarea value={caption} onChange={(event) => { setCaption(event.currentTarget.value.slice(0, maxCaption)); setSaved(false); }} maxLength={maxCaption} rows={3} className={"mt-2 h-24 w-full resize-none rounded-xl border p-3 text-sm outline-none transition-colors " + (dark ? "border-white/20 bg-black/40 focus:border-sky-400" : "border-black/10 bg-white/80 focus:border-[#0F2C59]")} placeholder="Tulis ceritamu…" /></label><div className={"mt-1 text-right text-[10px] " + muted}>{caption.length}/{maxCaption}</div></div><label className="mb-4 flex cursor-pointer items-center gap-3"><span className={"relative h-6 w-12 shrink-0 rounded-full transition-colors duration-300 " + (saveToDrive ? (dark ? "bg-sky-400" : "bg-[#0F2C59]") : (dark ? "bg-white/20" : "bg-black/20"))}><span className={"absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform duration-300 " + (saveToDrive ? "translate-x-6" : "")} /></span><input type="checkbox" className="sr-only" checked={saveToDrive} onChange={(event) => setSaveToDrive(event.currentTarget.checked)} /><span className="flex-1 text-xs font-bold leading-tight">Simpan salinan privat ke Google Drive</span></label>{status && <p role="status" className={"mb-4 rounded-lg px-4 py-2 text-center text-xs font-bold " + (dark ? "bg-sky-400/15 text-sky-200" : "bg-[#0F2C59]/10 text-[#0F2C59]")}>{busy && <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" />}{status}</p>}<div className="mb-3 grid grid-cols-2 gap-3"><a href={outputUrl || undefined} download={downloadName} aria-disabled={!outputUrl} className={"flex items-center justify-center gap-2 rounded-xl border py-3.5 text-xs font-bold aria-disabled:pointer-events-none aria-disabled:opacity-50 " + btnSecondary}><Icon name="download" className="h-4 w-4" />Unduh</a><button type="button" onClick={() => void sharePhoto()} disabled={!outputFile || busy} className={"flex items-center justify-center gap-2 rounded-xl border py-3.5 text-xs font-bold disabled:opacity-50 " + btnSecondary}><Icon name="share" className="h-4 w-4" />Bagikan</button></div><button type="button" onClick={() => void saveProgress()} disabled={busy || !outputFile || !caption.trim() || saved} className={"w-full rounded-2xl py-4 text-base font-black disabled:opacity-50 " + btnSolid}>{busy ? "Menyimpan…" : saved ? "Kenangan tersimpan ✓" : saveToDrive ? "Selesai & simpan ke Drive" : "Selesai & simpan progres"}</button>{saved && <p className="mt-3 text-center text-xs font-bold text-emerald-500">Kenangan sudah tercatat di progres program.</p>}<button type="button" onClick={() => setStep(2)} className={"mt-3 w-full rounded-xl border py-3 text-xs font-bold " + btnSecondary}>Kembali ke foto</button></div>}
			{status && step !== 3 && <p role="status" className={"mt-3 rounded-xl px-4 py-2 text-center text-xs font-bold " + (dark ? "bg-sky-400/15 text-sky-200" : "bg-[#0F2C59]/10 text-[#0F2C59]")}>{status}</p>}
		</section>
		{pendingTemplateId && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="change-frame-title" className={"w-full max-w-sm rounded-[2rem] border p-6 text-center shadow-2xl " + glassPanel}><h2 id="change-frame-title" className="text-xl font-black">Ubah frame?</h2><p className={"mt-2 text-sm leading-relaxed " + muted}>Mengganti frame mengosongkan bidang yang terisi. Draf fotomu tetap tersimpan di tray.</p><div className="mt-6 flex gap-3"><button type="button" onClick={() => setPendingTemplateId("")} className={"flex-1 rounded-xl border py-3 font-bold " + btnSecondary}>Batal</button><button type="button" onClick={() => applyTemplateChange(pendingTemplateId)} className={"flex-1 rounded-xl py-3 font-black " + btnSolid}>Ya, lanjutkan</button></div></section></div>}
		<NearbyCampaignPopup destinationSlug={destination.slug} active={Boolean(program && !locked)} />
	</main>;
}
