"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import NearbyCampaignPopup from "@/app/wisata/[slug]/nearby-campaign-popup";

type Layout = "single" | "strip2" | "grid6";
type Ratio = "portrait" | "story" | "square";
type Template = { id: string; name: string; layout: Layout; ratio: Ratio; frameUrl: string; enabled: boolean };
type Program = { assignmentId: string; programSlug: string; programName: string; components: string[]; requiredComponents: string[]; photoboxAccessMode: "standalone" | "mission_reward"; photoboxTemplates: Template[]; captionTemplate: string; maxCaptionLength: number; progress: { completedComponents: string[]; completed: boolean } };
type State = { destinationName: string; destinationAddress?: string | null; destinationTags?: string[]; programs: Program[] };
type Destination = { slug: string; name: string; description: string | null; address: string | null; tags: string[] | null; mascot_mode: "tiloc" | "custom"; mascot_image_url: string | null };
type PhotoSlot = { url: string; file: File } | null;

function slotRects(layout: Layout, width: number, height: number) {
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

function drawCover(context: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
	const scale = Math.max(w / image.width, h / image.height);
	const sw = w / scale;
	const sh = h / scale;
	const sx = (image.width - sw) / 2;
	const sy = (image.height - sh) / 2;
	context.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

export default function PhotoboxStudio({ programSlug, destination }: { programSlug: string; destination: Destination }) {
	const [state, setState] = useState<State | null>(null);
	const [selectedTemplateId, setSelectedTemplateId] = useState("");
	const [photos, setPhotos] = useState<PhotoSlot[]>([]);
	const [caption, setCaption] = useState("");
	const [outputUrl, setOutputUrl] = useState("");
	const [outputFile, setOutputFile] = useState<File | null>(null);
	const [cameraOn, setCameraOn] = useState(false);
	const [activeSlot, setActiveSlot] = useState(0);
	const [saveToDrive, setSaveToDrive] = useState(false);
	const [saved, setSaved] = useState(false);
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const photoUrlsRef = useRef(new Set<string>());
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
	const slotCount = selectedTemplate?.layout === "grid6" ? 6 : selectedTemplate?.layout === "strip2" ? 2 : 1;
	const locked = program?.photoboxAccessMode === "mission_reward" && !program.progress.completed;
	const mascot = destination.mascot_mode === "custom" && destination.mascot_image_url ? destination.mascot_image_url : "/maskot/frame_0.png";

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
		photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
		photoUrlsRef.current.clear();
		setPhotos([]);
		clearOutput();
	}

	function putFile(file: File, preferSlot?: number) {
		if (!file.type.startsWith("image/")) { setStatus("Pilih file gambar seperti JPEG, PNG, atau WebP."); return; }
		if (file.size > 18 * 1024 * 1024) { setStatus("Ukuran tiap foto maksimal 18 MB."); return; }
		const url = URL.createObjectURL(file);
		photoUrlsRef.current.add(url);
		setPhotos((current) => {
			const next = [...current];
			let index = preferSlot ?? next.findIndex((photo) => !photo);
			if (index < 0) index = 0;
			if (next[index]) { URL.revokeObjectURL(next[index]!.url); photoUrlsRef.current.delete(next[index]!.url); }
			next[index] = { url, file };
			return next;
		});
		clearOutput(); setSaved(false); setStatus("");
	}

	function handleDrop(event: DragEvent<HTMLDivElement>, index: number) {
		event.preventDefault();
		const file = event.dataTransfer.files[0];
		if (file) putFile(file, index);
	}

	async function startCamera() {
		setStatus("");
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 960 } } });
			streamRef.current = stream;
			setCameraOn(true);
		} catch (error) { setStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Izin kamera ditolak. Aktifkan kamera di browser, lalu coba lagi." : "Kamera tidak dapat dibuka. Pastikan situs memakai HTTPS atau localhost."); }
	}

	function stopCamera() {
		streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
		if (videoRef.current) videoRef.current.srcObject = null;
		setCameraOn(false);
	}

	async function capturePhoto() {
		const video = videoRef.current;
		if (!video || !video.videoWidth) return;
		const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
		const context = canvas.getContext("2d"); if (!context) return;
		context.save(); context.translate(canvas.width, 0); context.scale(-1, 1); context.drawImage(video, 0, 0, canvas.width, canvas.height); context.restore();
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
		if (blob) putFile(new File([blob], `momen-${Date.now()}.jpg`, { type: "image/jpeg" }), activeSlot);
	}

	async function compose() {
		if (!selectedTemplate || !program) return;
		if (photos.slice(0, slotCount).some((photo) => !photo)) { setStatus(`Isi semua ${slotCount} bidang foto sebelum membuat hasil.`); return; }
		setBusy(true); setStatus("");
		try {
			const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = selectedTemplate.ratio === "story" ? 1920 : selectedTemplate.ratio === "square" ? 1080 : 1350;
			const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas tidak tersedia pada browser ini.");
			context.fillStyle = "#fff8e8"; context.fillRect(0, 0, canvas.width, canvas.height);
			const rects = slotRects(selectedTemplate.layout, canvas.width, canvas.height);
			for (let index = 0; index < slotCount; index++) {
				const photo = photos[index]; if (!photo) continue;
				const image = await imageFromFile(photo.file);
				const rect = rects[index];
				context.save(); context.beginPath(); context.roundRect(rect.x, rect.y, rect.w, rect.h, 12); context.clip(); drawCover(context, image, rect.x, rect.y, rect.w, rect.h); context.restore();
			}
			const frame = new window.Image(); frame.crossOrigin = "anonymous";
			await new Promise<void>((resolve, reject) => { frame.onload = () => resolve(); frame.onerror = () => reject(new Error("Frame custom tidak dapat dirender. Gunakan URL gambar yang mengizinkan akses lintas situs.")); frame.src = selectedTemplate.frameUrl; });
			context.drawImage(frame, 0, 0, canvas.width, canvas.height);
			context.fillStyle = "rgba(22,88,123,.82)"; context.font = "bold 22px Arial"; context.textAlign = "center";
			const place = destination.address || state?.destinationAddress || destination.name;
			context.fillText(place.slice(0, 70), 540, canvas.height - 30);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .92));
			if (!blob) throw new Error("Gambar hasil belum dapat dibuat.");
		if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
			const nextUrl = URL.createObjectURL(blob);
			outputUrlRef.current = nextUrl;
			setOutputUrl(nextUrl); setOutputFile(new File([blob], `${destination.slug}-photobox.jpg`, { type: "image/jpeg" })); setSaved(false);
		} catch (error) { setStatus(error instanceof Error ? error.message : "Hasil foto belum dapat dibuat."); }
		finally { setBusy(false); }
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
	const downloadName = `${destination.slug}-${selectedTemplate?.id ?? "photobox"}.jpg`;

	if (status.startsWith("Program ini belum") || (state && !program)) return <main className="grid min-h-dvh place-items-center bg-[#f5eedd] p-5 text-[#16587b]"><section className="max-w-lg rounded-3xl bg-white p-7 shadow-xl"><h1 className="text-2xl font-black">Photobox belum aktif</h1><p className="mt-2 text-sm">Program ini belum menerapkan Photobox ke destinasi ini.</p><Link href={`/wisata/${encodeURIComponent(destination.slug)}`} className="mt-5 inline-flex rounded-xl bg-[#16587b] px-4 py-3 text-sm font-bold text-white">Kembali ke wisata</Link></section></main>;
	if (locked) return <main className="grid min-h-dvh place-items-center bg-[linear-gradient(145deg,#f5eedd,#eaf7fb)] p-5 text-[#16587b]"><section className="w-full max-w-lg rounded-[2rem] border border-white bg-white/85 p-7 text-center shadow-xl"><div className="mx-auto relative h-28 w-28"><Image src={mascot} alt="Maskot" fill unoptimized className="object-contain" /></div><p className="mt-3 text-4xl">🔒</p><h1 className="mt-2 text-2xl font-black">Photobox hadiah belum terbuka</h1><p className="mt-2 text-sm leading-6 text-[#16587b]/70">Selesaikan semua misi wajib program di {destination.name} untuk membuka studio kenangan.</p><Link href={`/minigame/${encodeURIComponent(programSlug)}/${encodeURIComponent(destination.slug)}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#16587b] px-5 py-3 text-xs font-black text-white">Kembali ke program misi</Link></section></main>;

	return <main className="min-h-dvh bg-[#121923] text-white"><header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-[#101720]/75 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-7"><Link href={`/wisata/${encodeURIComponent(destination.slug)}`} aria-label="Tutup Photobox" className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-xl">×</Link><div className="min-w-0 text-center"><p className="truncate text-[9px] font-black uppercase tracking-[.18em] text-cyan-200/70">RETRO PHOTO STUDIO</p><h1 className="truncate text-sm font-black sm:text-base">{destination.name}</h1></div><span className="rounded-full bg-white/10 px-3 py-2 text-[10px] font-black">{selectedTemplate ? selectedTemplate.layout === "single" ? "1 FRAME" : selectedTemplate.layout === "strip2" ? "2 FRAME" : "2×3 FRAME" : "MEMUAT"}</span></header>
		<div className="mx-auto grid min-h-dvh max-w-7xl gap-5 px-3 pb-8 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-[minmax(0,1.3fr)_minmax(330px,.7fr)] lg:items-start">
			<section className="flex min-h-[70dvh] flex-col rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_50%_0%,#243443,#151c26_64%)] p-3 shadow-2xl sm:min-h-[78dvh] sm:p-5"><div className="mb-3 flex items-center justify-between gap-3 px-1"><div><p className="text-[9px] font-black uppercase tracking-[.15em] text-white/45">YOUR PHOTOBOOTH</p><p className="mt-0.5 text-xs font-bold text-white/80">{selectedTemplate?.name ?? "Pilih template dulu"}</p></div><button type="button" onClick={cameraOn ? stopCamera : () => void startCamera()} className={`min-h-10 rounded-full px-4 py-2 text-xs font-black transition ${cameraOn ? "bg-rose-500 text-white" : "bg-white text-[#152231] hover:bg-cyan-100"}`}>{cameraOn ? "Tutup kamera" : "Buka kamera"}</button></div>
				<div className="relative mx-auto flex w-full max-w-[560px] flex-1 items-center justify-center overflow-hidden rounded-[1.5rem] bg-[#202a35] p-3"><div style={{ aspectRatio: selectedTemplate?.ratio === "story" ? "9 / 16" : selectedTemplate?.ratio === "square" ? "1 / 1" : "4 / 5" }} className="relative h-full max-h-[min(70dvh,760px)] w-auto max-w-full overflow-hidden rounded-xl bg-[#fff8e8] shadow-[0_22px_70px_rgba(0,0,0,.5)]"><div className="absolute inset-0 grid" style={{ top: "11.85%", bottom: "10.37%", left: "6.11%", right: "6.11%", gridTemplateColumns: selectedTemplate?.layout === "grid6" ? "repeat(3,1fr)" : "1fr", gridTemplateRows: selectedTemplate?.layout === "grid6" ? "repeat(2,1fr)" : selectedTemplate?.layout === "strip2" ? "repeat(2,1fr)" : "1fr", columnGap: selectedTemplate?.layout === "grid6" ? "1.67%" : "0", rowGap: selectedTemplate?.layout === "grid6" ? selectedTemplate.ratio === "story" ? "2.37%" : selectedTemplate.ratio === "square" ? "1.33%" : "1.67%" : selectedTemplate?.layout === "strip2" ? selectedTemplate.ratio === "story" ? "3.16%" : selectedTemplate.ratio === "square" ? "1.78%" : "2.22%" : "0" }}>{Array.from({ length: slotCount }, (_, index) => <div key={index} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, index)} onClick={() => setActiveSlot(index)} className={`relative overflow-hidden rounded-sm bg-[#b9c4c7] transition ${activeSlot === index ? "ring-2 ring-amber-300 ring-offset-1 ring-offset-[#fff8e8]" : ""}`}>{cameraOn && activeSlot === index && <video ref={videoRef} muted playsInline aria-label="Pratinjau kamera langsung" className="absolute inset-0 z-10 h-full w-full scale-x-[-1] object-cover"/>}{photos[index] ? <img src={photos[index]!.url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover"/> : <span className="absolute inset-0 grid place-items-center text-2xl text-white/70">＋</span>}{cameraOn && activeSlot === index && <button type="button" onClick={() => void capturePhoto()} aria-label={`Ambil foto untuk bidang ${activeSlot + 1}`} className="absolute bottom-3 left-1/2 z-30 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full border-4 border-white bg-rose-500 text-xl text-white shadow-xl ring-4 ring-black/20">●</button>}</div>)}</div>{selectedTemplate?.frameUrl && <img src={selectedTemplate.frameUrl} alt="" className="pointer-events-none absolute inset-0 z-20 h-full w-full object-fill"/>}</div></div>
				<div className="mx-auto mt-3 grid w-full max-w-[560px] grid-cols-2 gap-2"><label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-center text-[11px] font-bold text-white/85 hover:bg-white/10">Pilih foto dari perangkat<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={(event) => { Array.from(event.currentTarget.files ?? []).forEach((file) => putFile(file)); event.currentTarget.value = ""; }}/></label><button type="button" onClick={() => void capturePhoto()} disabled={!cameraOn} className="min-h-11 rounded-xl bg-rose-500 px-3 py-2 text-[11px] font-black text-white disabled:bg-white/10 disabled:text-white/35">Ambil foto {slotCount > 1 ? `· ${activeSlot + 1}/${slotCount}` : ""}</button></div><p className="mx-auto mt-2 max-w-[560px] text-center text-[10px] text-white/45">Seret foto ke kotak yang diinginkan. Tekan satu kotak untuk memilih posisi kamera.</p>
			</section>

			<aside className="space-y-4"><section className="rounded-[2rem] border border-white/10 bg-[#1b2530] p-4 shadow-xl sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-200/55">PILIH LAYOUT</p><h2 className="mt-1 text-lg font-black">Template frame</h2></div><span className="text-2xl">🎞️</span></div><div className="mt-3 grid grid-cols-3 gap-2">{templates.map((template) => <button key={template.id} type="button" onClick={() => { setSelectedTemplateId(template.id); clearPhotos(); setSaved(false); }} className={`overflow-hidden rounded-xl border text-left transition ${selectedTemplate?.id === template.id ? "border-amber-300 bg-white/10 ring-2 ring-amber-300/50" : "border-white/10 bg-white/[.03] hover:bg-white/[.08]"}`}><div className="relative aspect-[4/3] bg-[#fff8e8]"><img src={template.frameUrl} alt="" className="h-full w-full object-contain p-1"/></div><span className="block px-2 py-2 text-[9px] font-black leading-3">{template.name}</span></button>)}</div></section>
				<section className="rounded-[2rem] border border-white/10 bg-[#1b2530] p-4 shadow-xl sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-200/55">CAPTION CERITA</p><h2 className="mt-1 text-lg font-black">Tambah caption</h2></div><span className="text-xl">✍️</span></div><textarea required value={caption} onChange={(event) => { setCaption(event.currentTarget.value.slice(0, maxCaption)); setSaved(false); }} maxLength={maxCaption} rows={4} placeholder="Ceritakan kenanganmu…" className="mt-3 w-full resize-y rounded-2xl border border-white/10 bg-[#111820] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-cyan-300/60"/><div className="mt-1 flex justify-between text-[10px] text-white/45"><span>Nama wisata dan hashtag otomatis disiapkan, bebas kamu edit.</span><span className="shrink-0 pl-2 tabular-nums">{caption.length}/{maxCaption}</span></div><p className="mt-2 text-[10px] leading-4 text-white/45">Lokasi: {destination.address || destination.name}</p></section>
				{outputUrl && <section className="rounded-[2rem] border border-emerald-300/20 bg-emerald-500/10 p-4"><p className="text-sm font-black text-emerald-100">✨ Hasil siap dibagikan</p><img src={outputUrl} alt="Hasil Photobox" className="mt-3 max-h-56 w-full rounded-xl object-contain"/><div className="mt-3 grid grid-cols-2 gap-2"><a href={outputUrl} download={downloadName} className="flex min-h-10 items-center justify-center rounded-xl bg-white px-3 py-2 text-[11px] font-black text-[#152231]">Unduh foto</a><button type="button" onClick={() => void sharePhoto()} className="min-h-10 rounded-xl bg-emerald-300 px-3 py-2 text-[11px] font-black text-emerald-950">Bagikan ↗</button></div></section>}
				<section className="rounded-[2rem] border border-white/10 bg-[#1b2530] p-4 shadow-xl sm:p-5"><label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white/[.04] p-3"><input type="checkbox" checked={saveToDrive} onChange={(event) => setSaveToDrive(event.currentTarget.checked)} className="mt-0.5 h-4 w-4 accent-emerald-400"/><span><strong className="block text-xs">Simpan salinan privat ke Google Drive</strong><span className="mt-1 block text-[10px] leading-4 text-white/50">Foto hanya dapat dilihat pengelola. Tanpa dicentang, hasil tetap di perangkat dan progres tetap tercatat.</span></span></label><button type="button" onClick={() => void compose()} disabled={busy || !selectedTemplate || !caption.trim()} className="mt-3 min-h-12 w-full rounded-xl bg-gradient-to-r from-amber-300 to-rose-300 px-4 py-3 text-xs font-black text-[#18202b] shadow-lg disabled:opacity-50">{busy ? "Sedang menyiapkan…" : "Buat foto kenangan ✨"}</button><button type="button" onClick={() => void saveProgress()} disabled={busy || !outputFile || !caption.trim() || saved} className="mt-2 min-h-11 w-full rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-[#102d42] disabled:bg-white/10 disabled:text-white/35">{busy ? "Menyimpan…" : saved ? "Kenangan sudah tersimpan ✓" : saveToDrive ? "Simpan ke Drive + progres" : "Simpan progres kenangan"}</button>{status && <p role="status" className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/80">{status}</p>}</section>
				<Link href={`/minigame/${encodeURIComponent(programSlug)}/${encodeURIComponent(destination.slug)}`} className="flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-xs font-bold text-white/70 hover:bg-white/10">Kembali ke program minigame</Link>
			</aside>
		</div>
		<NearbyCampaignPopup destinationSlug={destination.slug} active={Boolean(program && !locked)} />
	</main>;
}
