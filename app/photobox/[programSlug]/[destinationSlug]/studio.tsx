"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import NearbyCampaignPopup from "@/app/wisata/[slug]/nearby-campaign-popup";
import { TiLocBrand } from "@/src/components/tiloc-brand";

type Layout = "single" | "strip2" | "grid6" | "travel_strip" | "memory_triptych";
type Ratio = "portrait" | "story" | "square";
type Template = { id: string; name: string; layout: Layout; ratio: Ratio; frameUrl: string; enabled: boolean; source?: "preset" | "custom" | "campaign"; displayChance?: number; alwaysShow?: boolean };
type Program = { assignmentId: string; programSlug: string; programName: string; components: string[]; requiredComponents: string[]; photoboxAccessMode: "standalone" | "mission_reward"; photoboxTemplates: Template[]; captionTemplate: string; maxCaptionLength: number; progress: { completedComponents: string[]; completed: boolean } };
type State = { destinationName: string; destinationAddress?: string | null; destinationTags?: string[]; programs: Program[] };
type Destination = { slug: string; name: string; description: string | null; address: string | null; tags: string[] | null; mascot_mode: "tiloc" | "custom"; mascot_image_url: string | null };
type DraftPhoto = { url: string; file: File };
type PhotoSlot = DraftPhoto | null;
type PhotoTransform = { zoom: number; x: number; y: number };
type ImageSize = { width: number; height: number };
type PhotoDrag = { slot: number; pointerId: number; startX: number; startY: number; width: number; height: number; offsetX: number; offsetY: number };
type CanvasDrag = { pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number };
type GesturePointer = { slot: number | null; x: number; y: number };
const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = { zoom: 1, x: 0, y: 0 };
type IconName = "back" | "sun" | "moon" | "camera" | "flip" | "flashOn" | "flashOff" | "upload" | "check" | "download" | "share" | "close" | "lock" | "trash" | "grid" | "fit" | "swap" | "sparkle" | "image";

function templateSlotCount(template?: Template) {
	if (template?.layout === "grid6") return 6;
	if (template?.layout === "strip2") return 2;
	if (template?.layout === "travel_strip" || template?.layout === "memory_triptych") return 3;
	return 1;
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
		grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
		fit: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" /><path d="M8 8h8v8H8z" /></>,
		swap: <><path d="M7 7h13l-3-3m3 3-3 3M17 17H4l3 3m-3-3 3-3" /></>,
		sparkle: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
		image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
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
	const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
	const [state, setState] = useState<State | null>(null);
	const [selectedTemplateId, setSelectedTemplateId] = useState("");
	const [templateExposureRoll] = useState(() => Math.random() * 100);
	const [pendingTemplateId, setPendingTemplateId] = useState("");
	const [photos, setPhotos] = useState<PhotoSlot[]>([]);
	const [photoTransforms, setPhotoTransforms] = useState<PhotoTransform[]>([]);
	const [drafts, setDrafts] = useState<DraftPhoto[]>([]);
	const [caption, setCaption] = useState("");
	const [outputUrl, setOutputUrl] = useState("");
	const [outputFile, setOutputFile] = useState<File | null>(null);
	const [cameraOn, setCameraOn] = useState(false);
	const [cameraOverlayOpen, setCameraOverlayOpen] = useState(false);
	const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
	const [flashOn, setFlashOn] = useState(false);
	const [flashSupported, setFlashSupported] = useState(false);
	const [gridOn, setGridOn] = useState(false);
	const [activeSlot, setActiveSlot] = useState(0);
	const [canvasZoom, setCanvasZoom] = useState(1);
	const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
	const [canvasDragging, setCanvasDragging] = useState(false);
	const [saveToDrive, setSaveToDrive] = useState(false);
	const [saved, setSaved] = useState(false);
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const photoUrlsRef = useRef(new Set<string>());
	const imageSizesRef = useRef(new Map<string, ImageSize>());
	const photoDragRef = useRef<PhotoDrag | null>(null);
	const gesturePointersRef = useRef(new Map<number, GesturePointer>());
	const photoPinchRef = useRef<{ slot: number; distance: number; zoom: number } | null>(null);
	const canvasPinchRef = useRef<{ distance: number; zoom: number } | null>(null);
	const canvasViewportRef = useRef<HTMLDivElement>(null);
	const canvasDragRef = useRef<CanvasDrag | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cameraRequestRef = useRef(0);
	const outputUrlRef = useRef("");
	const initializedCaption = useRef(false);
	const stopCamera = useCallback(() => {
		cameraRequestRef.current++;
		streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
		setCameraOn(false);
		setFlashOn(false);
		setFlashSupported(false);
	}, []);
	const closeCamera = useCallback(() => {
		setCameraOverlayOpen(false);
		stopCamera();
	}, [stopCamera]);

	const refresh = useCallback(async () => {
		const response = await fetch(`/api/minigame/state?destinationSlug=${encodeURIComponent(destination.slug)}`, { cache: "no-store" });
		const result = await response.json() as State & { error?: string };
		if (!response.ok) throw new Error(result.error || "Photobox belum dapat dimuat.");
		setState(result);
	}, [destination.slug]);
	useEffect(() => {
		const initialLoad = window.setTimeout(() => void refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Photobox belum dapat dimuat.")), 0);
		return () => window.clearTimeout(initialLoad);
	}, [refresh]);
	const program = state?.programs.find((item) => item.programSlug === programSlug);
	const templates = useMemo(() => (program?.photoboxTemplates ?? []).filter((template) => template.enabled && (template.source !== "campaign" || template.alwaysShow || templateExposureRoll < (template.displayChance ?? 35))), [program, templateExposureRoll]);
	const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
	const slotCount = templateSlotCount(selectedTemplate);
	const locked = program?.photoboxAccessMode === "mission_reward" && !program.progress.completed;
	const mascot = destination.mascot_mode === "custom" && destination.mascot_image_url ? destination.mascot_image_url : "/maskot/frame_0.png";
	const completedSlots = photos.slice(0, slotCount).filter(Boolean).length;
	const allSlotsFilled = slotCount > 0 && completedSlots === slotCount;
	const frameWidth = selectedTemplate?.layout === "travel_strip" ? 600 : 1080;
	const frameHeight = selectedTemplate?.layout === "travel_strip" ? 1800 : selectedTemplate?.layout === "memory_triptych" ? 1920 : selectedTemplate?.ratio === "story" ? 1920 : selectedTemplate?.ratio === "square" ? 1080 : 1350;
	const previewRects = selectedTemplate ? slotRects(selectedTemplate.layout, frameWidth, frameHeight) : [];
	const activeTransform = photoTransforms[activeSlot] ?? DEFAULT_PHOTO_TRANSFORM;
	const canvasPanLimits = (zoom: number) => {
		const viewport = canvasViewportRef.current;
		if (!viewport || !selectedTemplate) return { x: 0, y: 0 };
		const bounds = viewport.getBoundingClientRect();
		const ratio = frameWidth / frameHeight;
		const isDesktop = window.innerWidth >= 768;
		const width = Math.min(bounds.width - 24, window.innerWidth - (isDesktop ? 500 : 32), ratio * window.innerHeight * (isDesktop ? 0.84 : 0.5), 880);
		const height = width / ratio;
		return { x: Math.max(0, (width * zoom - bounds.width) / 2), y: Math.max(0, (height * zoom - bounds.height) / 2) };
	};
	const updateCanvasZoom = (value: number) => {
		const zoom = Math.min(2.5, Math.max(1, value));
		setCanvasZoom(zoom);
		const limits = canvasPanLimits(zoom);
		setCanvasOffset((offset) => ({ x: Math.max(-limits.x, Math.min(limits.x, offset.x)), y: Math.max(-limits.y, Math.min(limits.y, offset.y)) }));
	};
	const resetCanvasView = () => { setCanvasZoom(1); setCanvasOffset({ x: 0, y: 0 }); };

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
		if (!cameraOn || !cameraOverlayOpen || !video || !streamRef.current) return;
		video.srcObject = streamRef.current;
		void video.play().catch(() => setStatus("Kamera siap, tetapi browser belum dapat memutar pratinjau."));
		return () => { video.srcObject = null; };
	}, [cameraOn, cameraOverlayOpen]);
	useEffect(() => {
		if (!cameraOverlayOpen) return;
		const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeCamera(); };
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [cameraOverlayOpen, closeCamera]);

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
		if (step !== 3 || !photos[index] || event.button !== 0) return;
		if (activeSlot !== index) { setActiveSlot(index); return; }
		const bounds = event.currentTarget.getBoundingClientRect();
		if (!bounds.width || !bounds.height) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		gesturePointersRef.current.set(event.pointerId, { slot: index, x: event.clientX, y: event.clientY });
		const points = [...gesturePointersRef.current.entries()].filter(([, point]) => point.slot === index).map(([id, point]) => ({ id, ...point }));
		if (points.length >= 2) {
			const [first, second] = points.slice(-2);
			photoPinchRef.current = { slot: index, distance: Math.hypot(second.x - first.x, second.y - first.y), zoom: photoTransforms[index]?.zoom ?? 1 };
			photoDragRef.current = null;
		} else {
			photoPinchRef.current = null;
			const transform = photoTransforms[index] ?? DEFAULT_PHOTO_TRANSFORM;
			photoDragRef.current = { slot: index, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: bounds.width, height: bounds.height, offsetX: transform.x, offsetY: transform.y };
		}
		clearOutput();
		setSaved(false);
	}

	function movePhotoDrag(event: ReactPointerEvent<HTMLDivElement>, index: number) {
		const pointer = gesturePointersRef.current.get(event.pointerId);
		if (pointer?.slot === index) gesturePointersRef.current.set(event.pointerId, { ...pointer, x: event.clientX, y: event.clientY });
		const pinch = photoPinchRef.current;
		if (pinch?.slot === index) {
			const points = [...gesturePointersRef.current.values()].filter((point) => point.slot === index);
			if (points.length >= 2) {
				const [first, second] = points;
				const distance = Math.hypot(second.x - first.x, second.y - first.y);
				if (pinch.distance > 0) updatePhotoTransform(index, { zoom: pinch.zoom * distance / pinch.distance });
			}
			return;
		}
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

	function endPhotoDrag(event: ReactPointerEvent<HTMLDivElement>, index: number) {
		gesturePointersRef.current.delete(event.pointerId);
		const remaining = [...gesturePointersRef.current.values()].filter((point) => point.slot === index);
		if (remaining.length < 2) photoPinchRef.current = null;
		if (remaining.length === 1 && step === 3 && photos[index]) {
			const bounds = event.currentTarget.getBoundingClientRect();
			const transform = photoTransforms[index] ?? DEFAULT_PHOTO_TRANSFORM;
			const point = remaining[0];
			const remainingEntry = [...gesturePointersRef.current.entries()].find(([, value]) => value.slot === index);
			if (remainingEntry) {
				const [pointerId] = remainingEntry;
				photoDragRef.current = { slot: index, pointerId, startX: point.x, startY: point.y, width: bounds.width, height: bounds.height, offsetX: transform.x, offsetY: transform.y };
			}
		} else if (photoDragRef.current?.pointerId === event.pointerId || remaining.length === 0) photoDragRef.current = null;
	}

	function beginCanvasDrag(event: ReactPointerEvent<HTMLDivElement>) {
		if (step === 4 || event.button !== 0 || (event.target instanceof Element && event.target.closest("[data-photo-slot]"))) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		gesturePointersRef.current.set(event.pointerId, { slot: null, x: event.clientX, y: event.clientY });
		const points = [...gesturePointersRef.current.entries()].filter(([, point]) => point.slot === null).map(([id, point]) => ({ id, ...point }));
		if (points.length >= 2) {
			const [first, second] = points.slice(-2);
			canvasPinchRef.current = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom: canvasZoom };
			canvasDragRef.current = null;
			setCanvasDragging(false);
			return;
		}
		canvasPinchRef.current = null;
		canvasDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: canvasOffset.x, offsetY: canvasOffset.y };
		setCanvasDragging(true);
	}

	function moveCanvasDrag(event: ReactPointerEvent<HTMLDivElement>) {
		const pointer = gesturePointersRef.current.get(event.pointerId);
		if (pointer?.slot === null) gesturePointersRef.current.set(event.pointerId, { ...pointer, x: event.clientX, y: event.clientY });
		const pinch = canvasPinchRef.current;
		if (pinch) {
			const points = [...gesturePointersRef.current.values()].filter((point) => point.slot === null);
			if (points.length >= 2) {
				const [first, second] = points;
				const distance = Math.hypot(second.x - first.x, second.y - first.y);
				if (pinch.distance > 0) updateCanvasZoom(pinch.zoom * distance / pinch.distance);
			}
			return;
		}
		const drag = canvasDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const limits = canvasPanLimits(canvasZoom);
		setCanvasOffset({
			x: Math.max(-limits.x, Math.min(limits.x, drag.offsetX + event.clientX - drag.startX)),
			y: Math.max(-limits.y, Math.min(limits.y, drag.offsetY + event.clientY - drag.startY)),
		});
	}

	function endCanvasDrag(event: ReactPointerEvent<HTMLDivElement>) {
		gesturePointersRef.current.delete(event.pointerId);
		const remaining = [...gesturePointersRef.current.values()].filter((point) => point.slot === null);
		if (remaining.length < 2) canvasPinchRef.current = null;
		if (canvasDragRef.current?.pointerId === event.pointerId || remaining.length === 0) {
			canvasDragRef.current = null;
			setCanvasDragging(false);
		}
		if (remaining.length === 1) {
			const remainingEntry = [...gesturePointersRef.current.entries()].find(([, value]) => value.slot === null);
			if (remainingEntry) {
				const [pointerId, point] = remainingEntry;
				canvasDragRef.current = { pointerId, startX: point.x, startY: point.y, offsetX: canvasOffset.x, offsetY: canvasOffset.y };
				setCanvasDragging(true);
			}
		}
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
	function swapPhoto(index: number) {
		if (slotCount < 2) return;
		let targetIndex = (index + 1) % slotCount;
		let attempts = 0;
		while (!photos[targetIndex] && attempts < slotCount) {
			targetIndex = (targetIndex + 1) % slotCount;
			attempts++;
		}
		if (attempts >= slotCount || targetIndex === index) { setStatus("Isi slot lain dulu untuk menukar urutan foto."); return; }
		setPhotos((current) => { const next = [...current]; [next[index], next[targetIndex]] = [next[targetIndex], next[index]]; return next; });
		setPhotoTransforms((current) => { const next = [...current]; [next[index], next[targetIndex]] = [next[targetIndex], next[index]]; return next; });
		clearOutput(); setSaved(false); setStatus(`Foto slot ${index + 1} dan ${targetIndex + 1} ditukar.`);
	}
	function importFiles(files: FileList | File[]) {
		const selectedFiles = Array.from(files);
		if (!selectedFiles.length) return;
		const start = activeSlot;
		selectedFiles.slice(0, slotCount).forEach((file, offset) => putFile(file, (start + offset) % slotCount, false));
		setActiveSlot((start + Math.min(selectedFiles.length, slotCount)) % slotCount);
		if (selectedFiles.length > slotCount) setStatus(`Frame ini memiliki ${slotCount} slot foto. Foto selebihnya tetap ada di draf.`);
	}
	function addDemoPhoto() {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#59bce2"/><stop offset="1" stop-color="#f7d9a0"/></linearGradient></defs><rect width="900" height="1200" fill="url(#sky)"/><circle cx="680" cy="240" r="90" fill="#fff0ad"/><path d="M0 760 240 480l200 250 170-190 290 270v390H0Z" fill="#497f80"/><path d="M0 900 300 660l240 240 220-170 140 110v360H0Z" fill="#234c5d"/><path d="M0 1040q240-100 460 0t440 0v160H0Z" fill="#173d57"/><text x="50%" y="1100" fill="white" font-family="Arial,sans-serif" font-size="46" font-weight="700" text-anchor="middle">Contoh komposisi TiLoc!</text></svg>`;
		putFile(new File([svg], "contoh-photobox.svg", { type: "image/svg+xml" }), activeSlot);
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
		const requestId = cameraRequestRef.current;
		setCameraOverlayOpen(true);
		setStatus("");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 960 } } });
			if (requestId !== cameraRequestRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
			streamRef.current = stream;
			const track = stream.getVideoTracks()[0];
			const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
			setFlashSupported(Boolean(capabilities?.torch));
			setFacingMode(mode);
			setCameraOn(true);
		} catch (error) { setStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Izin kamera ditolak. Aktifkan kamera di browser, lalu coba lagi." : "Kamera tidak dapat dibuka. Pastikan situs memakai HTTPS atau localhost."); }
	}

	function openCamera() {
		setCameraOverlayOpen(true);
		void startCamera();
	}
	function toggleCameraFacing() {
		void startCamera(facingMode === "user" ? "environment" : "user");
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
		if (blob) {
			putFile(new File([blob], "momen.jpg", { type: "image/jpeg" }), activeSlot);
			setCameraOverlayOpen(false);
			stopCamera();
		}
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
		setCameraOverlayOpen(false);
		clearPhotos();
		setSelectedTemplateId(templateId);
		setActiveSlot(0);
		resetCanvasView();
		setCanvasDragging(false);
		gesturePointersRef.current.clear();
		setStep(1);
		setSaved(false);
		setPendingTemplateId("");
	}

	function continueToReview() {
		closeCamera();
		setStatus("");
		setStep(3);
	}
	async function composeAndFinish() {
		const ready = await compose();
		if (ready) { closeCamera(); setStep(4); }
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
			const canShareFile = navigator.canShare ? navigator.canShare({ files: [outputFile] }) : true;
			if (navigator.share && canShareFile) {
				await navigator.share({ files: [outputFile], title: `Kenangan ${destination.name}`, text: caption });
			} else {
				if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(caption);
				setStatus("Menu berbagi perangkat tidak tersedia. Unduh foto, lalu unggah ke Instagram atau media sosial pilihanmu.");
			}
		} catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("Menu berbagi tidak tersedia. Unduh foto untuk membagikannya."); }
	}
	function addHashtag(tag: string) {
		if (caption.includes(tag)) return;
		const next = `${caption.trim()} ${tag}`.trim();
		if (next.length > maxCaption) { setStatus("Caption sudah mencapai batas karakter."); return; }
		setCaption(next);
		setSaved(false);
	}
	async function shareToSocial(platform: "Instagram" | "TikTok") {
		if (!outputFile || !outputUrl) return;
		const platformUrl = platform === "Instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/";
		try {
			const canShareFile = navigator.canShare ? navigator.canShare({ files: [outputFile] }) : false;
			if (navigator.share && canShareFile) {
				await navigator.share({ files: [outputFile], title: `Kenangan ${destination.name}`, text: caption });
				setStatus(`Pilih ${platform} pada menu berbagi perangkat jika tersedia.`);
				return;
			}
			const appWindow = window.open(platformUrl, "_blank", "noopener,noreferrer");
			if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(caption);
			const anchor = document.createElement("a"); anchor.href = outputUrl; anchor.download = downloadName; anchor.click();
			setStatus(appWindow ? `Foto diunduh dan caption disalin. Unggah fotonya di ${platform}.` : `Foto diunduh dan caption disalin. Buka ${platform}, lalu unggah foto dari galeri.`);
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError")) setStatus(`Berbagi ${platform} tidak tersedia. Unduh foto lalu unggah dari galeri.`);
		}
	}

	const maxCaption = program?.maxCaptionLength ?? 280;
	const downloadName = destination.slug + "-" + (selectedTemplate?.id ?? "photobox") + ".jpg";
	const ink = dark ? "text-white" : "text-[#0F2C59]";
	const muted = dark ? "text-slate-300/70" : "text-slate-600";
	const glassPanel = dark ? "border-white/10 bg-[#0F172A]/75 shadow-2xl transition-colors duration-500" : "border-white/80 bg-white/75 shadow-2xl transition-colors duration-500";
	const btnSolid = dark ? "bg-[#38BDF8] text-[#0F172A] hover:brightness-105" : "bg-[#0F2C59] text-white hover:bg-[#173d75]";
	const btnSecondary = dark ? "border-white/20 bg-white/5 text-white hover:bg-white/10" : "border-black/15 bg-white/80 text-[#0F2C59] hover:bg-black/5";
	const atmosphereStyle = ".photobox-cloud{animation:photobox-drift 34s ease-in-out infinite alternate}.photobox-sun-glow{animation:photobox-glow 14s ease-in-out infinite alternate}.photobox-star{animation:photobox-twinkle 3.4s ease-in-out infinite alternate}.photobox-aurora{animation:photobox-aurora 18s ease-in-out infinite alternate}.photobox-preview-frame{width:min(calc(100vw - 2rem)," + (frameWidth / frameHeight * 50) + "dvh,880px)}.photobox-camera-grid{background-image:linear-gradient(to right,transparent 33.1%,rgba(255,255,255,.44) 33.1%,rgba(255,255,255,.44) 33.45%,transparent 33.45%,transparent 66.45%,rgba(255,255,255,.44) 66.45%,rgba(255,255,255,.44) 66.8%,transparent 66.8%),linear-gradient(to bottom,transparent 33.1%,rgba(255,255,255,.44) 33.1%,rgba(255,255,255,.44) 33.45%,transparent 33.45%,transparent 66.45%,rgba(255,255,255,.44) 66.45%,rgba(255,255,255,.44) 66.8%,transparent 66.8%)}@media(min-width:768px){.photobox-preview-frame{width:min(calc(100vw - 500px)," + (frameWidth / frameHeight * 84) + "dvh,880px)}}@keyframes photobox-drift{from{transform:translate3d(-2%,0,0)}to{transform:translate3d(3%,2%,0)}}@keyframes photobox-glow{from{transform:scale(.96);opacity:.55}to{transform:scale(1.08);opacity:.9}}@keyframes photobox-twinkle{from{opacity:.28;transform:scale(.75)}to{opacity:1;transform:scale(1.25)}}@keyframes photobox-aurora{from{transform:translateX(-4%) rotate(-12deg);opacity:.5}to{transform:translateX(5%) rotate(-7deg);opacity:.9}}.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}@media(prefers-reduced-motion:reduce){.photobox-cloud,.photobox-sun-glow,.photobox-star,.photobox-aurora{animation:none!important}}";
	const previewWidth = "min(calc(100vw - 2rem), " + (frameWidth / frameHeight * 50) + "dvh, 880px)";
	const canvasTransform = `translate3d(${canvasOffset.x}px, ${canvasOffset.y}px, 0) scale(${canvasZoom})`;
	const cameraRect = previewRects[activeSlot];
	const cameraRatio = cameraRect ? cameraRect.w / cameraRect.h : 0.8;
	const cameraPreviewWidth = "min(84vw, 440px, " + Math.round(cameraRatio * 65) + "dvh)";

	if (!state) return <main className={"relative isolate grid min-h-dvh place-items-center overflow-hidden p-5 " + ink}><AtmosphereLayer dark={dark} /><style>{atmosphereStyle}</style><section className={"relative z-10 w-full max-w-md rounded-[2rem] border p-8 text-center backdrop-blur-xl " + glassPanel}><Icon name="camera" className="mx-auto h-10 w-10 text-sky-500" /><h1 className="mt-4 text-2xl font-black">{status || "Menyiapkan Photobox…"}</h1><p className={"mt-2 text-sm " + muted}>{status ? "Periksa koneksi lalu coba lagi." : "Memuat frame dan pengaturan destinasi."}</p>{status && <button type="button" onClick={() => { setStatus(""); void refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Photobox belum dapat dimuat.")); }} className={"mt-5 rounded-xl px-5 py-3 text-xs font-black " + btnSolid}>Coba lagi</button>}</section></main>;
	if (!program) return <main className={"relative isolate grid min-h-dvh place-items-center overflow-hidden p-5 " + ink}><AtmosphereLayer dark={dark} /><style>{atmosphereStyle}</style><section className={"relative z-10 w-full max-w-md rounded-[2rem] border p-8 text-center backdrop-blur-xl " + glassPanel}><h1 className="text-2xl font-black">Photobox belum aktif</h1><p className={"mt-3 text-sm leading-6 " + muted}>Program ini belum menerapkan Photobox ke destinasi ini.</p><Link href={"/wisata/" + encodeURIComponent(destination.slug)} className={"mt-6 inline-flex rounded-xl px-5 py-3 text-xs font-black " + btnSolid}>Kembali ke wisata</Link></section></main>;
	if (locked) return <main className={"relative isolate grid min-h-dvh place-items-center overflow-hidden p-5 " + ink}><AtmosphereLayer dark={dark} /><style>{atmosphereStyle}</style><div className="absolute right-4 top-4 z-20"><button type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? "Tema siang" : "Tema malam"} className={"grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md " + (dark ? "border-white/10 bg-black/40 text-yellow-300" : "border-black/10 bg-white/60 text-amber-500")}><Icon name={dark ? "sun" : "moon"} className="h-5 w-5" /></button></div><section className={"relative z-10 w-full max-w-md rounded-[2rem] border p-8 text-center backdrop-blur-xl " + glassPanel}><div className="relative mx-auto h-20 w-20"><Image src={mascot} alt="Maskot TiLoc!" fill unoptimized className="object-contain" /></div><Icon name="lock" className="mx-auto mt-3 h-7 w-7 text-sky-500" /><h1 className="mt-3 text-2xl font-black">Photobox terkunci</h1><p className={"mt-3 text-sm leading-6 " + muted}>Selesaikan seluruh misi wajib di {destination.name} untuk membuka kenangan ini.</p><Link href={"/minigame/" + encodeURIComponent(programSlug) + "/" + encodeURIComponent(destination.slug)} className={"mt-6 inline-flex rounded-xl px-5 py-3 text-xs font-black " + btnSolid}>Kembali ke misi</Link></section></main>;

	return <main className={"relative isolate flex h-dvh flex-col overflow-hidden md:flex-row " + ink}>
		<AtmosphereLayer dark={dark} /><style>{atmosphereStyle}</style>
		{step === 3 && <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] bg-[#050b14]/20 backdrop-blur-[1px] transition-opacity duration-700" />}
		<header className="absolute left-0 top-0 z-40 flex w-full items-center justify-between px-4 py-4 md:px-8 md:py-7">
			{step > 1 ? <button type="button" onClick={() => { if (step === 2) { closeCamera(); setStep(1); } else setStep((current) => (current - 1) as 1 | 2 | 3); }} aria-label="Kembali ke langkah sebelumnya" className={"grid h-12 w-12 place-items-center rounded-2xl border backdrop-blur-xl shadow-sm transition-transform hover:-translate-x-1 " + (dark ? "border-white/10 bg-black/40 text-white" : "border-white/70 bg-white/60 text-[#0F2C59]")}><Icon name="back" className="h-5 w-5" /></button> : <Link href={"/wisata/" + encodeURIComponent(destination.slug)} aria-label="Kembali ke wisata" className={"grid h-12 w-12 place-items-center rounded-2xl border backdrop-blur-xl shadow-sm transition-transform hover:-translate-x-1 " + (dark ? "border-white/10 bg-black/40 text-white" : "border-white/70 bg-white/60 text-[#0F2C59]")}><Icon name="back" className="h-5 w-5" /></Link>}
			<div className="min-w-0 px-2 text-center"><TiLocBrand className="justify-center" markClassName="h-7 w-7" wordmarkClassName={"text-sm font-black tracking-tight " + (dark ? "text-sky-50" : "text-[#0F2C59]")} accentClassName="text-amber-500"/><span className={"mt-1 block max-w-[52vw] truncate text-[10px] font-black uppercase tracking-[.14em] " + (dark ? "text-sky-300" : "text-[#0F2C59]/60")}>Photobox · {destination.name}</span></div>
			<button type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? "Gunakan tema siang" : "Gunakan tema malam"} className={"grid h-12 w-12 place-items-center rounded-2xl border backdrop-blur-xl shadow-sm transition-transform hover:rotate-12 " + (dark ? "border-white/10 bg-black/40 text-yellow-300" : "border-white/70 bg-white/60 text-amber-500")}><Icon name={dark ? "sun" : "moon"} className="h-5 w-5" /></button>
		</header>

		<section className="relative z-10 flex h-[55dvh] w-full flex-col items-center px-3 pb-2 pt-[4.5rem] md:h-dvh md:flex-1 md:min-w-0 md:px-6 md:pb-6 md:pt-24">
		<div ref={canvasViewportRef} onPointerDown={beginCanvasDrag} onPointerMove={moveCanvasDrag} onPointerUp={endCanvasDrag} onPointerCancel={endCanvasDrag} className={"relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[2rem] border backdrop-blur-sm touch-none " + (canvasDragging ? "cursor-grabbing " : "cursor-grab ") + (dark ? "border-white/10 bg-black/15" : "border-white/45 bg-white/25")}>
			{step === 4 && outputUrl ? <img src={outputUrl} alt="Hasil Photobox" className="max-h-[49dvh] max-w-full rounded-2xl object-contain shadow-2xl md:max-h-[82dvh]" /> : selectedTemplate ? <div className="photobox-preview-frame relative inline-block overflow-hidden rounded-[1.15rem] bg-slate-200/80 shadow-2xl" style={{ aspectRatio: frameWidth + " / " + frameHeight, width: previewWidth, maxWidth: "100%", transform: canvasTransform, transformOrigin: "center", transition: canvasDragging ? "none" : "transform 120ms ease-out", boxShadow: "inset 0 0 20px rgba(0,0,0,.12), 0 24px 60px rgba(8,34,60,.25)" }}>
				{previewRects.map((rect, index) => {
					const photo = photos[index];
					const transform = photoTransforms[index] ?? DEFAULT_PHOTO_TRANSFORM;
					const isActiveSlot = (step === 2 || step === 3) && activeSlot === index;
					const isActiveEdit = step === 3 && isActiveSlot && Boolean(photo);
					return <div key={index} data-photo-slot={index} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, index)} onClick={() => { if (step === 2 || step === 3) setActiveSlot(index); }} onPointerDown={(event) => beginPhotoDrag(event, index)} onPointerMove={(event) => movePhotoDrag(event, index)} onPointerUp={(event) => endPhotoDrag(event, index)} onPointerCancel={(event) => endPhotoDrag(event, index)} className={"absolute overflow-hidden bg-slate-300 transition-all duration-300 " + (isActiveEdit ? "cursor-grab active:cursor-grabbing " : "cursor-pointer ") + (isActiveSlot ? (dark ? "ring-2 ring-inset ring-sky-300" : "ring-2 ring-inset ring-[#0F2C59]") : "")} style={{ top: (rect.y / frameHeight * 100) + "%", left: (rect.x / frameWidth * 100) + "%", width: (rect.w / frameWidth * 100) + "%", height: (rect.h / frameHeight * 100) + "%", zIndex: 1, touchAction: isActiveEdit ? "none" : "auto" }}>
						{photo && <img src={photo.url} alt={"Foto " + (index + 1)} draggable={false} onLoad={(event) => recordPhotoSize(index, photo.url, event.currentTarget)} className="absolute max-w-none select-none object-cover" style={{ width: `${transform.zoom * 100}%`, height: `${transform.zoom * 100}%`, left: `${50 + transform.x * 100}%`, top: `${50 + transform.y * 100}%`, transform: "translate(-50%, -50%)" }} />}
						{!photos[index] && <div className="absolute inset-0 grid place-items-center opacity-50"><div className="grid place-items-center gap-2 text-slate-700"><Icon name="camera" className="h-8 w-8" /><span className="text-[10px] font-black uppercase tracking-[.18em]">Slot {index + 1}</span></div></div>}
						{isActiveSlot && <div className={"pointer-events-none absolute inset-0 z-[3] border-2 border-dashed " + (dark ? "border-sky-300" : "border-[#0F2C59]")} />}
					</div>;
				})}
				<img src={selectedTemplate.frameUrl} alt={"Frame " + selectedTemplate.name} className="pointer-events-none absolute inset-0 z-[4] h-full w-full object-fill drop-shadow-xl" />
			</div> : <div className={"rounded-3xl border p-8 text-center backdrop-blur-xl " + glassPanel}><span className="text-4xl">☁️</span><h2 className="mt-3 font-black">Belum ada frame aktif</h2><p className={"mt-2 text-xs " + muted}>Pengelola perlu mengaktifkan frame untuk destinasi ini.</p></div>}
		</div>
		{step !== 4 && selectedTemplate && <div className="absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2 md:bottom-8 md:right-8" aria-label="Kontrol tampilan canvas">
			<div className={"rounded-xl border px-3 py-1.5 text-[10px] font-black tabular-nums backdrop-blur-xl " + (dark ? "border-white/10 bg-black/45 text-white" : "border-white/70 bg-white/70 text-[#0F2C59]")}>Canvas · {Math.round(canvasZoom * 100)}%</div>
			<div className={"flex items-center gap-1 rounded-2xl border p-1.5 backdrop-blur-xl " + (dark ? "border-white/10 bg-black/45" : "border-white/70 bg-white/70")}>
				<button type="button" onClick={() => updateCanvasZoom(canvasZoom - 0.15)} disabled={canvasZoom <= 1} aria-label="Perkecil canvas" className={"grid h-10 w-10 place-items-center rounded-xl text-xl font-bold disabled:opacity-40 " + btnSecondary}>−</button>
				<button type="button" onClick={() => updateCanvasZoom(canvasZoom + 0.15)} disabled={canvasZoom >= 2.5} aria-label="Perbesar canvas" className={"grid h-10 w-10 place-items-center rounded-xl text-xl font-bold disabled:opacity-40 " + btnSecondary}>+</button>
				<button type="button" onClick={resetCanvasView} aria-label="Tengahkan dan atur ulang tampilan" title="Tengahkan canvas" className={"grid h-10 w-10 place-items-center rounded-xl " + btnSecondary}><Icon name="fit" className="h-4 w-4" /></button>
			</div>
		</div>}
		</section>

		<section className={"relative z-20 flex h-[45dvh] w-full shrink-0 flex-col overflow-hidden rounded-t-[2rem] border-t backdrop-blur-2xl transition-all duration-500 md:my-[7.5dvh] md:h-[85dvh] md:w-[420px] md:rounded-3xl md:border " + glassPanel}>
			<div className="shrink-0 border-b border-white/25 px-5 pb-3 pt-4 md:px-7 md:pt-6">
				<div className="mb-3 flex items-end justify-between gap-3"><div><p className={"mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] " + (dark ? "text-sky-300" : "text-[#2563EB]")}><span className="h-2 w-2 animate-pulse rounded-full bg-current" />TAHAP {step} DARI 4</p><h2 className="text-xl font-black md:text-2xl">{["Pilih frame", "Isi momen", "Atur komposisi", "Karya selesai"][step - 1]}</h2></div><span className={"shrink-0 text-[10px] font-bold " + muted}>{step === 2 ? `${completedSlots}/${slotCount} foto` : step === 3 ? `Slot ${activeSlot + 1}/${slotCount}` : step === 1 ? `${templates.length} frame` : "Siap dibagikan"}</span></div>
				<div className="flex items-center gap-1.5" aria-label={"Langkah " + step + " dari 4"}>{[1, 2, 3, 4].map((item) => <span key={item} className={"h-1.5 flex-1 rounded-full transition-colors duration-300 " + (item <= step ? (dark ? "bg-sky-400" : "bg-[#2563EB]") : (dark ? "bg-white/15" : "bg-black/10"))} />)}</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">

			{step === 1 && <div className="animate-in slide-in-from-right-8 mx-auto w-full max-w-3xl duration-300">
				<p className={"mb-4 text-sm leading-5 " + muted}>Pilih bingkai untuk melihat susunan dan jumlah foto yang dibutuhkan.</p>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1">{templates.map((template) => <button key={template.id} type="button" onClick={() => requestTemplateChange(template.id)} aria-pressed={selectedTemplate?.id === template.id} className={"group flex min-h-[104px] items-center gap-4 rounded-2xl border p-3 text-left transition-all duration-300 " + (selectedTemplate?.id === template.id ? (dark ? "border-sky-300 bg-sky-300/10 shadow-[0_0_24px_rgba(56,189,248,.16)]" : "border-[#2563EB] bg-blue-50/80 shadow-lg") : (dark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-black/10 bg-white/55 hover:bg-white/80"))}><span className="grid h-[78px] w-[62px] shrink-0 place-items-center overflow-hidden rounded-xl bg-black/10 p-1"><img src={template.frameUrl} className="max-h-full max-w-full object-contain" alt="" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{template.name}</span><span className={"mt-1 block text-xs font-semibold " + muted}>{templateSlotCount(template)} foto · rasio {template.ratio === "story" ? "9:16" : template.ratio === "square" ? "1:1" : template.ratio === "portrait" ? "4:5" : template.ratio}</span><span className={"mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide " + (selectedTemplate?.id === template.id ? (dark ? "text-sky-300" : "text-blue-700") : muted)}>{selectedTemplate?.id === template.id ? <><Icon name="check" className="h-3 w-3" /> Terpilih</> : "Lihat pratinjau"}</span></span></button>)}{templates.length === 0 && <div className={"rounded-2xl border p-6 text-center text-sm " + muted}>Belum ada frame aktif untuk destinasi ini.</div>}</div>
				<button type="button" onClick={() => { setStep(2); setActiveSlot(0); setStatus(""); }} disabled={!selectedTemplate} className={"sticky bottom-0 mt-4 w-full rounded-2xl py-4 text-sm font-black shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-40 " + btnSolid}>Pilih frame &amp; lanjut ke foto <span aria-hidden="true">→</span></button>
			</div>}
			{step === 2 && selectedTemplate && <div className="animate-in slide-in-from-right-8 mx-auto w-full max-w-3xl space-y-4 duration-300">
				<p className={"text-sm leading-5 " + muted}>Pilih slot, lalu ambil foto, unggah dari galeri, atau pakai draf sebelumnya.</p>
				<div className="space-y-2">{Array.from({ length: slotCount }, (_, index) => <div key={index} className={"flex items-center gap-2 rounded-2xl border p-2 transition-colors " + (activeSlot === index ? (dark ? "border-sky-300/70 bg-sky-300/10" : "border-blue-500 bg-blue-50") : (dark ? "border-white/10 bg-white/5" : "border-black/10 bg-white/55"))}>
					<button type="button" onClick={() => setActiveSlot(index)} aria-pressed={activeSlot === index} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left"><span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-black/10">{photos[index] ? <img src={photos[index]!.url} alt={"Foto slot " + (index + 1)} className="h-full w-full object-cover" /> : <Icon name="image" className="h-5 w-5 opacity-50" />}</span><span className="min-w-0"><span className="block text-sm font-black">Slot {index + 1}</span><span className={"block truncate text-[10px] font-semibold " + muted}>{photos[index] ? "Foto siap · ketuk untuk mengganti" : "Belum terisi · ketuk untuk memilih"}</span></span></button>
					{photos[index] && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => swapPhoto(index)} aria-label={"Tukar urutan foto slot " + (index + 1)} title="Tukar urutan" className={"grid h-10 w-10 place-items-center rounded-xl " + btnSecondary}><Icon name="swap" className="h-4 w-4" /></button><button type="button" onClick={() => clearPhotoSlot(index)} aria-label={"Hapus foto slot " + (index + 1)} title="Hapus foto" className="grid h-10 w-10 place-items-center rounded-xl text-rose-500 hover:bg-rose-500/10"><Icon name="trash" className="h-4 w-4" /></button></div>}
				</div>)}</div>
				<div className="grid grid-cols-3 gap-2">
					<button type="button" onClick={openCamera} className={"flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-black " + btnSecondary}><Icon name="camera" className="h-5 w-5" />Kamera</button>
					<label className={"flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-black " + btnSecondary}><Icon name="upload" className="h-5 w-5" />Galeri<input type="file" accept="image/*" multiple className="sr-only" ref={fileInputRef} onChange={(event) => { importFiles(event.currentTarget.files ?? []); event.currentTarget.value = ""; }} /></label>
					<button type="button" onClick={addDemoPhoto} className={"flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-black " + btnSecondary}><Icon name="sparkle" className="h-5 w-5" />Contoh</button>
				</div>
				<div><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-black">Draf foto</h3><span className={"text-[10px] " + muted}>{drafts.length} di sesi ini</span></div><div className={"hide-scrollbar flex min-h-[74px] items-center gap-2 overflow-x-auto rounded-2xl border p-2 " + (dark ? "border-white/10 bg-black/20" : "border-black/10 bg-white/55")}>{drafts.length === 0 && <p className={"w-full text-center text-xs font-semibold " + muted}>Foto kamera dan unggahan akan muncul di sini.</p>}{drafts.map((draft, index) => <div key={draft.url} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl"><button type="button" onClick={() => assignDraftToSlot(draft)} aria-label={"Pasang draf foto " + (index + 1) + " ke slot " + (activeSlot + 1)} className="h-full w-full"><img src={draft.url} className="h-full w-full object-cover" alt={"Draf foto " + (index + 1)} /></button><button type="button" onClick={() => removeDraft(index)} aria-label={"Hapus draf foto " + (index + 1)} className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-bl-lg bg-rose-500/90 text-white"><Icon name="trash" className="h-3 w-3" /></button></div>)}</div></div>
				<button type="button" onClick={continueToReview} disabled={!allSlotsFilled} className={"sticky bottom-0 w-full rounded-2xl py-4 text-sm font-black shadow-lg disabled:opacity-40 " + btnSolid}>Atur komposisi <span aria-hidden="true">→</span></button>
			</div>}
			{step === 3 && selectedTemplate && <div className="animate-in slide-in-from-right-8 mx-auto w-full max-w-3xl space-y-4 duration-300">
				<p className={"text-sm leading-5 " + muted}>Pilih slot foto, lalu geser atau cubit foto di canvas. Geser area kosong untuk memindahkan frame.</p>
				<div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: slotCount }, (_, index) => <button key={index} type="button" onClick={() => setActiveSlot(index)} aria-pressed={activeSlot === index} className={"flex min-h-12 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-black " + (activeSlot === index ? (dark ? "border-sky-300 bg-sky-300 text-[#07111f]" : "border-[#0F2C59] bg-[#0F2C59] text-white") : btnSecondary)}>{photos[index] && <img src={photos[index]!.url} alt="" className="h-7 w-7 rounded-md object-cover" />}Slot {index + 1}</button>)}</div>
				{photos[activeSlot] && <div className={"rounded-2xl border p-4 " + (dark ? "border-white/10 bg-black/25" : "border-white/70 bg-white/65")}>
					<div className="flex items-center justify-between"><div><p className="text-sm font-black">Atur foto · Slot {activeSlot + 1}</p><p className={"mt-1 text-[10px] " + muted}>Zoom foto {activeTransform.zoom.toFixed(1)}×</p></div><button type="button" onClick={() => updatePhotoTransform(activeSlot, DEFAULT_PHOTO_TRANSFORM)} className={"min-h-10 rounded-xl border px-3 text-xs font-bold " + btnSecondary}>Reset foto</button></div>
					<div className="mt-3 flex items-center gap-3"><span className={"text-xs font-bold " + muted}>Zoom</span><input type="range" min="1" max="3" step="0.05" value={activeTransform.zoom} onChange={(event) => updatePhotoTransform(activeSlot, { zoom: Number(event.currentTarget.value) })} aria-label={"Zoom foto slot " + (activeSlot + 1)} className="h-11 min-w-0 flex-1 cursor-pointer accent-sky-500" /><span className={"w-12 text-right text-xs font-black tabular-nums " + ink}>{Math.round(activeTransform.zoom * 100)}%</span></div>
				</div>}
				<div className={"rounded-2xl border p-3 text-xs leading-5 " + (dark ? "border-sky-300/15 bg-sky-300/5 text-sky-100/80" : "border-blue-200 bg-blue-50/75 text-blue-900")}><span className="font-black">Mode fokus aktif.</span> Tarik foto di slot untuk mengatur posisi; cubit dua jari untuk memperbesar. Tombol +/− mengubah pembesaran seluruh canvas.</div>
				<button type="button" onClick={() => void composeAndFinish()} disabled={!allSlotsFilled || busy} className={"sticky bottom-0 w-full rounded-2xl py-4 text-sm font-black shadow-lg disabled:opacity-40 " + btnSolid}>{busy ? "Menyusun hasil…" : "Selesai & lihat hasil"} <span aria-hidden="true">→</span></button>
			</div>}

			{step === 4 && <div className="animate-in slide-in-from-right-8 mx-auto w-full max-w-3xl space-y-4 duration-300">
				<div className={"rounded-2xl border p-4 " + (dark ? "border-emerald-300/20 bg-emerald-300/10" : "border-emerald-200 bg-emerald-50/80")}><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xl text-emerald-500">✓</span><div><h3 className="text-sm font-black">Hasil Photobox siap</h3><p className={"mt-0.5 text-xs " + muted}>Unduh, bagikan, atau simpan kenanganmu.</p></div></div></div>
				<label className="block text-xs font-black">Caption kenangan<textarea value={caption} onChange={(event) => { setCaption(event.currentTarget.value.slice(0, maxCaption)); setSaved(false); }} maxLength={maxCaption} rows={3} className={"mt-2 min-h-24 w-full resize-y rounded-xl border p-3 text-sm font-medium outline-none transition-colors " + (dark ? "border-white/20 bg-black/40 focus:border-sky-400" : "border-black/10 bg-white/85 focus:border-[#0F2C59]")} placeholder="Ceritakan momenmu…" /></label>
				<div className="flex items-center justify-between gap-2"><span className={"text-[10px] font-semibold " + muted}>Tambahkan tag</span><span className={"text-[10px] tabular-nums " + muted}>{caption.length}/{maxCaption}</span></div>
				<div className="-mt-2 flex flex-wrap gap-2">{["#JelajahMadiun", "#TiLoc", "#WisataMadiun"].map((tag) => <button key={tag} type="button" onClick={() => addHashtag(tag)} disabled={caption.includes(tag)} className={"min-h-10 rounded-full border px-3 text-xs font-bold disabled:opacity-45 " + btnSecondary}>{tag}</button>)}</div>
				<label className={"flex cursor-pointer items-center gap-3 rounded-2xl border p-3 " + (dark ? "border-white/10 bg-white/5" : "border-black/10 bg-white/55")}><span className={"relative h-6 w-12 shrink-0 rounded-full transition-colors duration-300 " + (saveToDrive ? (dark ? "bg-sky-400" : "bg-[#0F2C59]") : (dark ? "bg-white/20" : "bg-black/20"))}><span className={"absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform duration-300 " + (saveToDrive ? "translate-x-6" : "")} /></span><input type="checkbox" className="sr-only" checked={saveToDrive} onChange={(event) => setSaveToDrive(event.currentTarget.checked)} /><span className="min-w-0 flex-1"><span className="block text-xs font-black">Simpan salinan privat ke Google Drive</span><span className={"mt-0.5 block text-[10px] leading-4 " + muted}>Kenangan juga dicatat dalam progres pengunjung.</span></span></label>
				<div className="grid grid-cols-2 gap-2"><a href={outputUrl || undefined} download={downloadName} aria-disabled={!outputUrl} className={"flex min-h-12 items-center justify-center gap-2 rounded-xl border text-xs font-black aria-disabled:pointer-events-none aria-disabled:opacity-45 " + btnSecondary}><Icon name="download" className="h-4 w-4" />Unduh foto</a><button type="button" onClick={() => void sharePhoto()} disabled={!outputFile || busy} className={"flex min-h-12 items-center justify-center gap-2 rounded-xl border text-xs font-black disabled:opacity-45 " + btnSecondary}><Icon name="share" className="h-4 w-4" />Bagikan</button></div>
				<div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => void shareToSocial("Instagram")} disabled={!outputFile || busy} className={"min-h-11 rounded-xl border px-3 text-xs font-black disabled:opacity-45 " + btnSecondary}>Instagram ↗</button><button type="button" onClick={() => void shareToSocial("TikTok")} disabled={!outputFile || busy} className={"min-h-11 rounded-xl border px-3 text-xs font-black disabled:opacity-45 " + btnSecondary}>TikTok ↗</button></div>
				<p className={"-mt-2 text-[10px] leading-4 " + muted}>Jika berbagi langsung tidak tersedia, foto akan diunduh dan caption disalin agar bisa kamu unggah dari aplikasi.</p>
				<button type="button" onClick={() => void saveProgress()} disabled={busy || !outputFile || !caption.trim() || saved} className={"w-full rounded-2xl py-4 text-sm font-black shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-45 " + btnSolid}>{busy ? "Menyimpan kenangan…" : saved ? "Kenangan tersimpan ✓" : saveToDrive ? "Simpan progres & Drive" : "Simpan progres"}</button>
				{saved && <p className="text-center text-xs font-bold text-emerald-500">Kenangan tercatat. File foto hasil tetap tersedia di perangkatmu.</p>}
				<button type="button" onClick={() => { setStatus(""); setStep(3); }} className={"w-full rounded-xl border py-3 text-xs font-bold " + btnSecondary}>Kembali atur komposisi</button>
			</div>}
			{status && <p role="status" className={"mt-3 rounded-xl px-4 py-2 text-center text-xs font-bold " + (dark ? "bg-sky-400/15 text-sky-200" : "bg-[#0F2C59]/10 text-[#0F2C59]")}>{busy && <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" />}{status}</p>}
			</div>
		</section>
		{cameraOverlayOpen && <div role="dialog" aria-modal="true" aria-label="Kamera Photobox" className="fixed inset-0 z-[120] isolate flex flex-col overflow-hidden bg-[#050914] text-white">
			{cameraOn ? <video ref={videoRef} autoPlay playsInline muted className={"absolute inset-0 h-full w-full object-cover " + (facingMode === "user" ? "scale-x-[-1]" : "")} /> : <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,.18),transparent_55%),linear-gradient(160deg,#111b2e,#050914)]" />}
			<div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75" />
			<div className="relative z-10 flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] md:px-8"><button type="button" onClick={closeCamera} aria-label="Tutup kamera" className="grid h-12 w-12 place-items-center rounded-2xl border border-white/20 bg-black/35 text-2xl backdrop-blur-xl">×</button><div className="px-3 text-center"><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-200">PHOTOBOX · SLOT {activeSlot + 1}</p><p className="mt-1 text-xs font-semibold text-white/70">{facingMode === "user" ? "Kamera depan" : "Kamera belakang"}</p></div><button type="button" onClick={() => setGridOn((value) => !value)} aria-pressed={gridOn} aria-label={gridOn ? "Sembunyikan grid komposisi" : "Tampilkan grid komposisi"} className={"grid h-12 w-12 place-items-center rounded-2xl border text-xs font-black backdrop-blur-xl " + (gridOn ? "border-sky-300 bg-sky-300/20 text-sky-100" : "border-white/20 bg-black/35 text-white") }><Icon name="grid" className="h-5 w-5" /></button></div>
			<div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-5 py-2"><div className="relative overflow-hidden rounded-[1.75rem] border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,.32),0_20px_70px_rgba(0,0,0,.45)]" style={{ aspectRatio: cameraRect ? cameraRect.w + " / " + cameraRect.h : "4 / 5", width: cameraPreviewWidth, maxHeight: "65dvh" }}><div className="pointer-events-none absolute inset-0 z-10 border border-white/20" />{gridOn && <div aria-hidden="true" className="photobox-camera-grid pointer-events-none absolute inset-0 z-10" />}{!cameraOn && <div className="absolute inset-0 z-20 grid place-items-center bg-black/65 p-6 text-center"><div><Icon name="camera" className="mx-auto h-9 w-9 text-sky-300" /><p className="mt-3 text-sm font-black">Kamera belum tersedia</p><p className="mt-2 text-xs leading-5 text-white/75">{status || "Izinkan akses kamera atau lanjutkan dengan galeri."}</p><button type="button" onClick={() => void startCamera()} className="mt-4 rounded-xl bg-sky-300 px-5 py-3 text-xs font-black text-slate-950">Coba lagi</button></div></div>}</div></div>
			<div className="relative z-10 flex items-center justify-center gap-7 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 md:gap-12"><button type="button" onClick={() => { fileInputRef.current?.click(); closeCamera(); }} aria-label="Pilih foto dari galeri" className="grid h-12 w-12 place-items-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur-xl"><Icon name="image" className="h-5 w-5" /></button><button type="button" onClick={() => void capturePhoto()} disabled={!cameraOn} aria-label="Ambil foto" className="grid h-[76px] w-[76px] place-items-center rounded-full border-[5px] border-white shadow-[0_0_0_7px_rgba(255,255,255,.18)] transition-transform active:scale-95 disabled:opacity-40"><span className="h-[58px] w-[58px] rounded-full bg-white" /></button><button type="button" onClick={toggleCameraFacing} disabled={!cameraOn} aria-label="Ganti kamera depan atau belakang" className="grid h-12 w-12 place-items-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur-xl disabled:opacity-40"><Icon name="flip" className="h-5 w-5" /></button><button type="button" onClick={() => void toggleFlash()} disabled={!cameraOn || !flashSupported} aria-label={flashOn ? "Matikan flash" : "Nyalakan flash"} title={flashSupported ? "Flash" : "Flash tidak didukung kamera ini"} className={"grid h-12 w-12 place-items-center rounded-2xl border backdrop-blur-xl disabled:opacity-35 " + (flashOn ? "border-amber-300 bg-amber-300/20 text-amber-200" : "border-white/25 bg-white/10 text-white")}><Icon name={flashOn ? "flashOn" : "flashOff"} className="h-5 w-5" /></button></div>
			<p className="relative z-10 pb-2 text-center text-[10px] font-semibold text-white/65">Geser kamera agar momen pas · foto masuk ke slot {activeSlot + 1}</p>
		</div>}
		{pendingTemplateId && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="change-frame-title" className={"w-full max-w-sm rounded-[2rem] border p-6 text-center shadow-2xl " + glassPanel}><h2 id="change-frame-title" className="text-xl font-black">Ubah frame?</h2><p className={"mt-2 text-sm leading-relaxed " + muted}>Mengganti frame mengosongkan bidang yang terisi. Draf fotomu tetap tersimpan di tray.</p><div className="mt-6 flex gap-3"><button type="button" onClick={() => setPendingTemplateId("")} className={"flex-1 rounded-xl border py-3 font-bold " + btnSecondary}>Batal</button><button type="button" onClick={() => applyTemplateChange(pendingTemplateId)} className={"flex-1 rounded-xl py-3 font-black " + btnSolid}>Ya, lanjutkan</button></div></section></div>}
		<NearbyCampaignPopup destinationSlug={destination.slug} systemPage="photobox" active={Boolean(program && !locked && !cameraOverlayOpen)} />
	</main>;
}
