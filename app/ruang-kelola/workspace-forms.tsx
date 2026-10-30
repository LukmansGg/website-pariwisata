"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import {
	createDestinationAction,
	createPartnerAction,
	createQrPointAction,
	updatePartnerAction,
	updatePartnerProximityAction,
	updateDestinationAction,
	type WorkspaceActionState,
} from "@/src/server/auth/actions";
import { MediaUploadField } from "@/app/ruang-kelola/media-upload-field";

type DestinationOption = { id: string; name: string; slug: string; latitude?: number | null; longitude?: number | null };
type MinigameProgramOption = { id: string; name: string; slug: string; is_enabled: boolean; components: string[]; required_components: string[]; created_by: string | null; default_photobox_access_mode?: "standalone" | "mission_reward"; ai_is_mission?: boolean };
type DestinationMinigameAssignment = { program_id: string; required_components: string[]; is_selected: boolean };
type PartnerOption = { id: string; business_name: string; slug: string; destination_id: string | null; max_distance_meters: number; business_type: string; business_categories: string[]; allow_minigame_integration?: boolean; latitude?: number | null; longitude?: number | null; address?: string | null; description?: string | null; logo_url?: string | null; contact_name?: string | null; contact_phone?: string | null; contact_email?: string | null; website_url?: string | null };

const initialState: WorkspaceActionState = {};
const inputClass = "form-input";
const labelClass = "form-label";
const MAX_DESCRIPTION_WORDS = 1500;
const MAX_DESCRIPTION_CHARACTERS = 30000;

function countWords(text: string) {
	return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function limitWords(text: string) {
	const words = [...text.matchAll(/\S+/g)];
	if (words.length <= MAX_DESCRIPTION_WORDS) return text;
	return text.slice(0, words[MAX_DESCRIPTION_WORDS].index);
}

function geocodeLabel(feature: GeocodeFeature) {
	const properties = feature.properties ?? {};
	const name = properties.name ?? properties.street ?? "Lokasi tanpa nama";
	const area = [...new Set([properties.district, properties.city, properties.county, properties.state, properties.country].filter(Boolean))].join(", ");
	return area && !name.includes(area) ? `${name} · ${area}` : name;
}

function CoordinateTools({ onSelect }: { onSelect: (latitude: string, longitude: string) => void }) {
	const searchId = `coordinate-search-${useId().replace(/:/g, "")}`;
	const optionsId = `${searchId}-options`;
	const [query, setQuery] = useState("");
	const [features, setFeatures] = useState<GeocodeFeature[]>([]);
	const [searching, setSearching] = useState(false);
	const [status, setStatus] = useState("");
	useEffect(() => {
		const term = query.trim();
		if (term.length < 3) { setFeatures([]); setSearching(false); return; }
		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			setSearching(true);
			try {
				const response = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`, { signal: controller.signal });
				const payload = await response.json() as { features?: GeocodeFeature[]; message?: string };
				if (!response.ok) throw new Error(payload.message || "Pencarian lokasi sedang bermasalah.");
				setFeatures(payload.features ?? []);
				setStatus(payload.features?.length ? "Pilih hasil yang paling sesuai." : "Lokasi belum ditemukan. Coba nama tempat atau area terdekat.");
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") return;
				setFeatures([]);
				setStatus(error instanceof Error ? error.message : "Pencarian lokasi belum tersedia.");
			} finally {
				if (!controller.signal.aborted) setSearching(false);
			}
		}, 500);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [query]);
	function useCurrentLocation() {
		if (!navigator.geolocation) { setStatus("Browser ini tidak menyediakan lokasi otomatis."); return; }
		setStatus("Meminta izin lokasi perangkat…");
		navigator.geolocation.getCurrentPosition((position) => {
			onSelect(position.coords.latitude.toFixed(6), position.coords.longitude.toFixed(6));
			setQuery(""); setFeatures([]); setStatus("Pin diisi dari lokasi perangkat.");
		}, () => setStatus("Lokasi belum diizinkan. Coba cari nama tempat atau isi koordinat manual."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
	}
	return <div className="mb-3 rounded-2xl border border-sky-200/70 bg-white/70 p-3 dark:border-sky-200/10 dark:bg-slate-950/35">
		<div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={searchId} className="text-xs font-bold text-sky-950 dark:text-sky-100">Cari nama tempat</label><button type="button" onClick={useCurrentLocation} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-sky-300/70 bg-sky-50 px-3 py-1.5 text-[11px] font-black text-sky-900 transition hover:-translate-y-0.5 hover:bg-sky-100 dark:border-sky-200/15 dark:bg-sky-950/60 dark:text-sky-100 dark:hover:bg-sky-900/60"><span aria-hidden="true">◎</span>Gunakan lokasi saat ini</button></div>
		<div className="relative mt-2"><input id={searchId} role="combobox" aria-autocomplete="list" aria-expanded={features.length > 0} aria-controls={optionsId} value={query} onChange={(event) => { setQuery(event.currentTarget.value); setStatus(""); }} className="form-input w-full" placeholder="Ketik nama wisata, jalan, atau area…" autoComplete="off" /><div className="mt-1 flex min-h-4 justify-between gap-2 text-[10px] text-sky-950/55 dark:text-sky-100/55"><span>{status || (query.trim().length < 3 ? "Mulai dari 3 huruf · data © OpenStreetMap · Photon" : "")}</span>{searching && <span className="shrink-0 animate-pulse font-bold text-sky-700 dark:text-sky-300">Mencari…</span>}</div>
			{features.length > 0 && <ul id={optionsId} role="listbox" className="absolute inset-x-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-sky-200 bg-white p-1 shadow-[0_18px_45px_-18px_rgba(8,47,73,.4)] dark:border-sky-200/15 dark:bg-slate-900">{features.map((feature, index) => { const [longitude, latitude] = feature.geometry.coordinates; return <li key={`${latitude}-${longitude}-${index}`} role="presentation"><button type="button" role="option" aria-selected="false" onClick={() => { onSelect(latitude.toFixed(6), longitude.toFixed(6)); setStatus("Pin koordinat diperbarui dari hasil pencarian."); setQuery(""); setFeatures([]); }} className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-sky-950 transition hover:bg-sky-50 focus-visible:bg-sky-50 dark:text-sky-100 dark:hover:bg-sky-950/60 dark:focus-visible:bg-sky-950/60"><span className="block">📍 {geocodeLabel(feature)}</span><span className="mt-1 block font-mono text-[10px] text-sky-900/50 dark:text-sky-100/45">{latitude.toFixed(5)}, {longitude.toFixed(5)}</span></button></li>; })}</ul>}
		</div>
	</div>;
}

function ActionFeedback({ state }: { state: WorkspaceActionState }) {
	return <>
		{state.error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/50 dark:text-rose-200">{state.error}</p>}
		{state.success && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-200">{state.success}</p>}
	</>;
}

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
	return <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-madiun-blue px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:cursor-wait disabled:opacity-60 dark:bg-indigo-600 sm:py-3">
		{pending ? "Menyimpan…" : children}
	</button>;
}

type EditableDestination = { id: string; name: string; slug: string; category: string | null; categories?: string[]; short_description?: string | null; address: string | null; description?: string; image_url?: string | null; latitude: number | null; longitude: number | null; tags?: string[]; mascot_mode?: "tiloc" | "custom"; mascot_image_url?: string | null; is_featured: boolean; is_published: boolean };

const DESTINATION_CATEGORIES = ["Alam", "Kuliner", "Spot Foto", "Sejarah & Budaya", "Petualangan & Aktivitas", "Rekreasi", "Religi", "Lainnya"];
type EditableQrPoint = { id: string; name: string; code: string; address: string | null; latitude: number | null; longitude: number | null };
type GeocodeFeature = { geometry: { coordinates: [number, number] }; properties?: { name?: string; street?: string; district?: string; city?: string; county?: string; state?: string; country?: string } };

export function QrDownloadCard({ code, ready }: { code: string; ready: boolean }) {
	const [qrImage, setQrImage] = useState<{ code: string; dataUrl: string } | null>(null);
	const dataUrl = qrImage?.code === code ? qrImage.dataUrl : "";
	const path = `/qr/${encodeURIComponent(code)}`;
	const configuredBaseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
	const targetUrl = configuredBaseUrl ? `${configuredBaseUrl}${path}` : path;
	useEffect(() => {
		const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, "");
		const url = `${baseUrl}${path}`;
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) return;
		let cancelled = false;
		void QRCode.toDataURL(url, { width: 260, margin: 2, errorCorrectionLevel: "H", color: { dark: "#16587B", light: "#FFFFFF" } }).then((result) => { if (!cancelled) setQrImage({ code, dataUrl: result }); }).catch(() => undefined);
		return () => { cancelled = true; };
	}, [code, path]);
	return <section className="min-w-0 rounded-3xl border border-madiun-light/25 bg-white/75 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/45 sm:p-6">
		<div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-madiun-blue/55 dark:text-slate-400">Kode QR destinasi</p><h3 className="mt-1 text-xl font-bold text-madiun-blue dark:text-white">Generate QR</h3></div><span className={`status-pill ${ready ? "status-published" : "status-draft"}`}>{ready ? "Aktif" : "Draft"}</span></div>
		<div className="mt-5 grid min-w-0 gap-5 rounded-2xl bg-sky-50/80 p-4 dark:bg-slate-950/40 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-6 sm:p-5"><div className="mx-auto grid h-40 w-40 shrink-0 place-items-center rounded-2xl border border-white bg-white p-2 shadow-sm dark:border-slate-700 sm:mx-0">{dataUrl ? <img src={dataUrl} alt={`QR untuk ${targetUrl}`} className="h-full w-full"/> : <span className="text-xs text-madiun-blue/55">Membuat QR…</span>}</div><div className="min-w-0"><p className="text-sm font-semibold text-madiun-blue dark:text-white">QR menuju halaman destinasi</p><a href={targetUrl || undefined} target="_blank" rel="noreferrer" title={targetUrl} aria-label={`Buka tautan QR: ${targetUrl}`} className="mt-2 block max-w-full truncate text-sm font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 dark:text-sky-300 dark:decoration-sky-700">{targetUrl || "Tautan tersedia setelah kode dibuat."}</a><p className="mt-2 text-xs leading-5 text-madiun-blue/60 dark:text-slate-400">Simpan gambar QR untuk dicetak atau dipasang.</p>{!ready && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">QR aktif setelah formulir disimpan.</p>}</div></div>
		{dataUrl && <a href={dataUrl} download={`${code || "destinasi"}-qr.png`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-madiun-blue px-5 py-3 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 dark:bg-indigo-600">Unduh PNG</a>}
	</section>;
}

export function DestinationForm({ destination, qrPoint, minigamePrograms = [], minigameAssignment, onCancel, externalManager = false }: { destination?: EditableDestination; qrPoint?: EditableQrPoint; minigamePrograms?: MinigameProgramOption[]; minigameAssignment?: DestinationMinigameAssignment; onCancel?: () => void; externalManager?: boolean }) {
	const formAction = destination ? updateDestinationAction : createDestinationAction;
	const [state, action, pending] = useActionState(formAction, initialState);
	const [slug, setSlug] = useState(destination?.slug ?? "");
	const [slugEdited, setSlugEdited] = useState(false);
	const [latitude, setLatitude] = useState(destination?.latitude?.toString() ?? "");
	const [longitude, setLongitude] = useState(destination?.longitude?.toString() ?? "");
	const [qrLatitude, setQrLatitude] = useState(qrPoint?.latitude?.toString() ?? destination?.latitude?.toString() ?? "");
	const [qrLongitude, setQrLongitude] = useState(qrPoint?.longitude?.toString() ?? destination?.longitude?.toString() ?? "");
	const [useCustomQrLocation, setUseCustomQrLocation] = useState(Boolean(qrPoint && (qrPoint.latitude !== (destination?.latitude ?? null) || qrPoint.longitude !== (destination?.longitude ?? null))));
	const [qrCode, setQrCode] = useState(qrPoint?.code ?? (destination?.slug ? `qr-${destination.slug}` : ""));
	const [qrName, setQrName] = useState(qrPoint?.name ?? (destination?.name ? `${destination.name} · QR utama` : "QR utama"));
	const [mascotMode, setMascotMode] = useState<"tiloc" | "custom">(destination?.mascot_mode ?? "tiloc");
	const [selectedMinigameId, setSelectedMinigameId] = useState(minigameAssignment?.program_id ?? "");
	const [findFriendsRequired, setFindFriendsRequired] = useState(minigameAssignment?.required_components.includes("find_friends") ?? true);
	const [description, setDescription] = useState(destination?.description ?? "");
	const [shortDescription, setShortDescription] = useState(destination?.short_description ?? "");
	const [categories, setCategories] = useState<string[]>(destination?.categories?.length ? destination.categories : destination?.category?.split(", ").filter(Boolean) ?? []);
	const selectedMinigame = minigamePrograms.find((program) => program.id === selectedMinigameId);
	const findFriendsLockedByGift = selectedMinigame?.default_photobox_access_mode === "mission_reward" && !selectedMinigame.ai_is_mission;
	useEffect(() => {
		setSelectedMinigameId(minigameAssignment?.program_id ?? "");
		setFindFriendsRequired(minigameAssignment?.required_components.includes("find_friends") ?? true);
	}, [destination?.id, minigameAssignment?.program_id]);
	const [storyEditorOpen, setStoryEditorOpen] = useState(false);
	const [enhancing, setEnhancing] = useState(false);
	const [enhancementError, setEnhancementError] = useState("");
	const [enhancement, setEnhancement] = useState<{ before: string; after: string; sources: { title: string; url: string; language: "id" | "en" }[] } | null>(null);
	const [enhancedDraft, setEnhancedDraft] = useState("");
	const enhancementReviewRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!storyEditorOpen) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setStoryEditorOpen(false); };
		window.addEventListener("keydown", handleKeyDown);
		return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
	}, [storyEditorOpen]);
	useEffect(() => {
		if (!enhancement || !storyEditorOpen) return;
		window.requestAnimationFrame(() => enhancementReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
	}, [enhancement, storyEditorOpen]);
	const slugify = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
	const handleName = (value: string) => {
		if (!slugEdited && !qrPoint) {
			const nextSlug = slugify(value);
			setSlug(nextSlug);
			setQrCode(nextSlug ? `qr-${nextSlug}` : "");
		}
		if (!qrPoint) setQrName(value ? `${value} · QR utama` : "QR utama");
	};
	const toggleCategory = (category: string) => setCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
	async function enhanceDescription() {
		if (!description.trim()) { setEnhancementError("Isi dulu beberapa fakta tentang destinasi agar AI punya bahan untuk disempurnakan."); return; }
		setEnhancing(true);
		setEnhancementError("");
		try {
			const response = await fetch("/api/admin/destinations/enhance", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: document.getElementById("destination-name") instanceof HTMLInputElement ? (document.getElementById("destination-name") as HTMLInputElement).value : destination?.name ?? "", address: document.getElementById("destination-address") instanceof HTMLInputElement ? (document.getElementById("destination-address") as HTMLInputElement).value : destination?.address ?? "", description }),
			});
			const result = await response.json() as { enhancedDescription?: string; sources?: { title: string; url: string; language: "id" | "en" }[]; error?: string };
			if (!response.ok || !result.enhancedDescription) throw new Error(result.error || "Belum berhasil menyempurnakan deskripsi.");
			setEnhancement({ before: description, after: result.enhancedDescription, sources: result.sources ?? [] });
			setEnhancedDraft(result.enhancedDescription);
		} catch (error) {
			setEnhancementError(error instanceof Error ? error.message : "Layanan AI belum dapat digunakan. Coba lagi sebentar.");
		} finally { setEnhancing(false); }
	}
	function applyEnhancedDescription() {
		setDescription(limitWords(enhancedDraft.slice(0, MAX_DESCRIPTION_CHARACTERS)));
		setEnhancement(null);
		setEnhancementError("");
	}
	const enhanceButton = <button type="button" onClick={() => void enhanceDescription()} disabled={enhancing} title="Nama, area, dan deskripsi dikirim ke AI saat tombol ini ditekan; teks awal tetap aman." className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-300/70 bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-900 transition hover:-translate-y-0.5 hover:bg-sky-100 disabled:cursor-wait disabled:opacity-60 dark:border-sky-300/20 dark:bg-sky-950/55 dark:text-sky-100 dark:hover:bg-sky-900/60"><span aria-hidden="true">✦</span>{enhancing ? "Menyempurnakan…" : "Enhance dengan AI"}</button>;
	return <form action={action} className="space-y-6">
		{destination && <input type="hidden" name="id" value={destination.id} />}
		{qrPoint && <input type="hidden" name="qr_point_id" value={qrPoint.id} />}
		<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.95fr)] 2xl:grid-cols-[minmax(0,1.2fr)_minmax(500px,1fr)]">
			<div className="space-y-5">
				<div className="grid gap-4 sm:grid-cols-2">
					<div><label className={labelClass} htmlFor="destination-name">Nama tempat wisata *</label><input className={inputClass} id="destination-name" name="name" required maxLength={160} defaultValue={destination?.name} placeholder="Contoh: Waduk Bening Widas" onChange={(event) => handleName(event.currentTarget.value)} /><p className="mt-1 text-xs text-madiun-blue/55">Nama yang paling dikenal pengunjung.</p></div>
					<div><label className={labelClass} htmlFor="destination-slug">Link halaman *</label><div className="flex overflow-hidden rounded-xl border border-madiun-light/40 bg-white focus-within:border-madiun-blue focus-within:ring-4 focus-within:ring-madiun-light/20 dark:bg-slate-800"><span className="shrink-0 self-center pl-3 text-xs text-madiun-blue/40">/wisata/</span><input className="min-w-0 flex-1 border-0 bg-transparent px-2 py-3 text-sm text-madiun-blue outline-none placeholder:text-madiun-blue/35 dark:text-white" id="destination-slug" name="slug" value={slug} onChange={(event) => { setSlugEdited(true); const nextSlug = slugify(event.currentTarget.value); setSlug(nextSlug); if (!qrPoint) setQrCode(nextSlug ? `qr-${nextSlug}` : ""); }} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="waduk-bening-widas" /></div><p className="mt-1 text-xs text-madiun-blue/55">Otomatis dibuat dari nama. Tetap bisa kamu edit.</p></div>
					<fieldset className="min-w-0 sm:col-span-2"><legend className={labelClass}>Kategori destinasi</legend><p className="mb-3 text-xs text-madiun-blue/55 dark:text-slate-400">Pilih satu atau beberapa kategori agar wisata lebih mudah ditemukan.</p><div className="flex flex-wrap gap-2">{DESTINATION_CATEGORIES.map((category) => { const selected = categories.includes(category); return <label key={category} className={`cursor-pointer rounded-full border px-3.5 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 ${selected ? "border-sky-500 bg-sky-100 text-sky-900 shadow-sm ring-2 ring-sky-200/70 dark:border-sky-400 dark:bg-sky-950/60 dark:text-sky-100 dark:ring-sky-900/60" : "border-madiun-light/30 bg-white/75 text-madiun-blue/75 hover:border-sky-300 hover:bg-sky-50 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-300"}`}><input className="sr-only" type="checkbox" name="categories" value={category} checked={selected} onChange={() => toggleCategory(category)} /><span aria-hidden="true" className="mr-1.5">{selected ? "✓" : "+"}</span>{category}</label>; })}</div><p className="mt-2 text-[11px] text-madiun-blue/50 dark:text-slate-500">{categories.length ? `${categories.length} kategori dipilih` : "Belum ada kategori dipilih"}</p></fieldset>
					<div><label className={labelClass} htmlFor="destination-address">Alamat / area</label><input className={inputClass} id="destination-address" name="address" maxLength={500} defaultValue={destination?.address ?? ""} placeholder="Desa Kresek, Kecamatan Wungu" /></div>
				</div>
				<div className="min-w-0"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label className={labelClass} htmlFor="destination-description">Deskripsi destinasi</label><div className="flex flex-wrap gap-2">{enhanceButton}<button type="button" onClick={() => setStoryEditorOpen(true)} className="inline-flex min-h-9 items-center rounded-lg border border-madiun-light/40 bg-white px-3 py-1.5 text-xs font-semibold text-madiun-blue transition hover:bg-sky-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">Buka layar penuh</button></div></div><textarea className={`${inputClass} min-h-64 w-full resize-y leading-6`} id="destination-description" name="description" rows={10} maxLength={MAX_DESCRIPTION_CHARACTERS} value={description} onChange={(event) => setDescription(limitWords(event.currentTarget.value))} placeholder="Jelaskan daya tarik, fasilitas, akses, jam kunjung, dan informasi penting bagi pengunjung." /><div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-madiun-blue/55 dark:text-slate-400"><span>Hingga {MAX_DESCRIPTION_WORDS} kata · konteks untuk pengunjung dan pemandu AI. Enhance mengirim teks ini ke AI saat diminta.</span><span className="font-semibold tabular-nums">{countWords(description)} / {MAX_DESCRIPTION_WORDS} kata</span></div>{enhancementError && <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-400/15 dark:bg-rose-950/35 dark:text-rose-200">{enhancementError}</p>}{enhancement && !storyEditorOpen && <section aria-label="Tinjau hasil penyempurnaan AI" className="mt-4 space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-sky-800 dark:text-sky-300">DRAF AI · TINJAU SEBELUM DIPAKAI</p><p className="mt-1 text-xs leading-5 text-sky-950/65 dark:text-sky-100/65">Bandingkan dan edit hasilnya. Teks lama belum berubah sampai kamu memilih pakai hasil.</p></div><button type="button" onClick={() => setEnhancement(null)} aria-label="Tutup perbandingan hasil AI" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-sky-200 bg-white text-xl text-sky-900 dark:border-white/10 dark:bg-slate-900 dark:text-sky-100">×</button></div><div className="mt-3 grid gap-3 lg:grid-cols-2"><details className="min-w-0 overflow-hidden rounded-xl border border-sky-200/70 bg-white/80 dark:border-white/10 dark:bg-slate-900/55"><summary className="cursor-pointer px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Sebelum · buka teks awal</summary><p className="max-h-64 overflow-y-auto border-t border-sky-100 px-3 py-3 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700 dark:border-white/10 dark:text-slate-200">{enhancement.before || "Belum ada teks awal."}</p></details><label className="min-w-0 rounded-xl border border-sky-300/80 bg-white p-3 dark:border-sky-300/25 dark:bg-slate-900/70"><span className="mb-2 block text-[10px] font-black uppercase tracking-wide text-sky-800 dark:text-sky-300">Sesudah · bisa diedit</span><textarea aria-label="Hasil penyempurnaan AI, bisa diedit" value={enhancedDraft} maxLength={MAX_DESCRIPTION_CHARACTERS} onChange={(event) => setEnhancedDraft(limitWords(event.currentTarget.value))} rows={10} className="min-h-52 w-full resize-y rounded-lg bg-transparent text-xs leading-5 text-slate-800 outline-none focus:ring-2 focus:ring-sky-300 dark:text-slate-100" /></label></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] leading-4 text-sky-950/60 dark:text-sky-100/55">{enhancement.sources.length ? "Referensi tambahan hasil pencarian Wikipedia:" : "Tidak ada artikel Wikipedia yang cocok; AI hanya merapikan teks tanpa menambah fakta dari luar."}</p><div className="flex flex-wrap gap-2">{enhancement.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener" className="max-w-full truncate rounded-full border border-sky-300/50 bg-white/80 px-2.5 py-1.5 text-[10px] font-bold text-sky-900 underline decoration-sky-300 underline-offset-2 dark:border-sky-300/15 dark:bg-slate-900/70 dark:text-sky-100">Wikipedia · {source.title}</a>)}</div></div><p className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">Periksa klaim dan sumbernya sebelum disimpan. Draf dikirim ke model AI untuk disunting.</p><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEnhancement(null)} className="min-h-10 rounded-xl border border-sky-200 bg-white px-3 text-xs font-bold text-sky-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">Tetap pakai teks awal</button><button type="button" onClick={applyEnhancedDescription} className="min-h-10 rounded-xl bg-sky-700 px-4 text-xs font-black text-white transition hover:-translate-y-0.5 hover:bg-sky-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">Pakai hasil sesudah</button></div></section>}</div>
				<div><MediaUploadField folder="destinations" name="image_url" label="Foto sampul · wajib agar wisata tayang" defaultUrl={destination?.image_url ?? ""} /></div>
				<div><label className={labelClass} htmlFor="destination-short-description">Ringkasan singkat</label><textarea className={`${inputClass} min-h-24 w-full resize-y leading-6`} id="destination-short-description" name="short_description" maxLength={180} rows={3} value={shortDescription} onChange={(event) => setShortDescription(event.currentTarget.value)} placeholder="Contoh: Waduk tenang untuk menikmati senja dan aktivitas air bersama keluarga." /><div className="mt-1 flex justify-between gap-2 text-xs text-madiun-blue/55 dark:text-slate-400"><span>Ringkasan tampil di kartu wisata.</span><span className="tabular-nums">{shortDescription.length}/180</span></div><input type="hidden" name="tags" value={destination?.tags?.join(", ") ?? ""} /></div>
				<fieldset className="rounded-2xl border border-sky-200/75 bg-gradient-to-br from-sky-50/90 to-white/75 p-4 dark:border-sky-200/10 dark:from-sky-950/40 dark:to-slate-900/60 sm:p-5"><legend className="px-1 text-xs font-black uppercase tracking-wide text-sky-900 dark:text-sky-100">Lokasi utama wisata *</legend><p className="mb-3 text-xs leading-5 text-sky-950/65 dark:text-sky-100/60">Ini sumber koordinat wisata. QR utama akan mengikutinya otomatis, kecuali kamu atur titik QR tersendiri.</p><CoordinateTools onSelect={(lat, lng) => { setLatitude(lat); setLongitude(lng); if (!useCustomQrLocation) { setQrLatitude(lat); setQrLongitude(lng); } }} /><div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass} htmlFor="destination-latitude">Latitude wisata *</label><input className={inputClass} id="destination-latitude" name="latitude" type="number" min="-90" max="90" step="any" required value={latitude} onChange={(event) => { const value = event.currentTarget.value; setLatitude(value); if (!useCustomQrLocation) setQrLatitude(value); }} placeholder="Terisi dari pencarian / lokasi saat ini" /></div><div><label className={labelClass} htmlFor="destination-longitude">Longitude wisata *</label><input className={inputClass} id="destination-longitude" name="longitude" type="number" min="-180" max="180" step="any" required value={longitude} onChange={(event) => { const value = event.currentTarget.value; setLongitude(value); if (!useCustomQrLocation) setQrLongitude(value); }} placeholder="Terisi otomatis" /></div></div><p className="mt-2 text-xs text-sky-950/55 dark:text-sky-100/50">Satu pin ini dipakai untuk peta dan sebagai lokasi bawaan QR utama.</p></fieldset>
			</div>
			<aside className="min-w-0 space-y-5">
				<section className="rounded-3xl border border-madiun-light/25 bg-gradient-to-br from-sky-50 via-white to-amber-50 p-5 shadow-sm dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 sm:p-6">
					<div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-madiun-blue/55 dark:text-slate-400">Personality of this place</p><h3 className="mt-1 text-lg font-black text-madiun-blue dark:text-white">Pilih maskot destinasi</h3><p className="mt-1 text-xs leading-5 text-madiun-blue/60 dark:text-slate-400">Maskot hanya untuk identitas wisata. Program minigame dikelola terpisah di navigasi Minigames.</p></div>
					<div className="grid gap-3 sm:grid-cols-2"><label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${mascotMode === "tiloc" ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100 dark:bg-sky-950/35" : "border-madiun-light/25 bg-white/60 dark:bg-slate-800/50"}`}><input type="radio" name="mascot_mode" value="tiloc" checked={mascotMode === "tiloc"} onChange={() => setMascotMode("tiloc")} /><span><strong className="block text-sm text-madiun-blue dark:text-white">TiLoc!</strong><span className="mt-1 block text-xs text-madiun-blue/60 dark:text-slate-400">Maskot bawaan TiLoc!</span></span></label><label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${mascotMode === "custom" ? "border-amber-400 bg-amber-50 ring-2 ring-amber-100 dark:bg-amber-950/25" : "border-madiun-light/25 bg-white/60 dark:bg-slate-800/50"}`}><input type="radio" name="mascot_mode" value="custom" checked={mascotMode === "custom"} onChange={() => setMascotMode("custom")} /><span><strong className="block text-sm text-madiun-blue dark:text-white">Maskot custom</strong><span className="mt-1 block text-xs text-madiun-blue/60 dark:text-slate-400">Gunakan satu gambar karakter.</span></span></label></div>
					{mascotMode === "custom" ? <div className="mt-4"><MediaUploadField folder="mascots" name="mascot_image_url" label="Gambar maskot custom · wajib" defaultUrl={destination?.mascot_image_url ?? ""} /></div> : <input type="hidden" name="mascot_image_url" value="" />}
				</section>
				<input type="hidden" name="qr_code" value={qrCode} /><input type="hidden" name="qr_address" value={qrPoint?.address ?? destination?.address ?? ""} /><input type="hidden" name="qr_latitude" value={useCustomQrLocation ? qrLatitude : latitude} /><input type="hidden" name="qr_longitude" value={useCustomQrLocation ? qrLongitude : longitude} />
				<div className="min-w-0 rounded-3xl border border-sky-200/70 bg-gradient-to-br from-white/90 to-sky-50/70 p-5 shadow-sm dark:border-sky-200/10 dark:from-slate-900/80 dark:to-sky-950/35 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-800/55 dark:text-sky-200/55">Titik pemasangan</p><h3 className="mt-1 text-lg font-black text-sky-950 dark:text-sky-50">QR utama</h3></div><span className="max-w-full truncate rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-madiun-blue dark:bg-slate-800 dark:text-slate-200" title={qrName}>{qrName}</span></div><p className="mt-2 text-xs leading-5 text-sky-950/60 dark:text-sky-100/60">{useCustomQrLocation ? "Gunakan pin ini jika QR dipasang agak jauh dari titik utama wisata." : "Mengikuti lokasi utama wisata. Tidak perlu mengisi koordinat QR dua kali."}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-sky-100 px-3 py-1.5 text-[10px] font-bold text-sky-900 dark:bg-sky-900/45 dark:text-sky-100">{useCustomQrLocation ? "Pin QR khusus" : "Pin wisata · otomatis"}</span><button type="button" aria-expanded={useCustomQrLocation} onClick={() => { if (useCustomQrLocation) { setUseCustomQrLocation(false); } else { setQrLatitude(latitude); setQrLongitude(longitude); setUseCustomQrLocation(true); } }} className="min-h-10 rounded-xl border border-sky-300/70 bg-white px-3 py-2 text-xs font-black text-sky-900 transition hover:-translate-y-0.5 hover:bg-sky-50 dark:border-sky-200/15 dark:bg-slate-800 dark:text-sky-100 dark:hover:bg-slate-700">{useCustomQrLocation ? "Gunakan lokasi wisata" : "Atur lokasi QR khusus"}</button></div><div className="grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: useCustomQrLocation ? "1fr" : "0fr", opacity: useCustomQrLocation ? 1 : 0 }}><div className="min-h-0 overflow-hidden">{useCustomQrLocation && <div className="pt-4"><p className="mb-2 text-xs font-bold text-sky-950 dark:text-sky-100">Lokasi QR tambahan</p><CoordinateTools onSelect={(lat, lng) => { setQrLatitude(lat); setQrLongitude(lng); }} /><div className="grid min-w-0 gap-3 sm:grid-cols-2"><div><label className={labelClass} htmlFor="qr-latitude">Latitude QR *</label><input className={inputClass} id="qr-latitude" name="qr_latitude_visible" type="number" min="-90" max="90" step="any" required value={qrLatitude} onChange={(event) => setQrLatitude(event.currentTarget.value)} placeholder="Cari tempat atau gunakan lokasi saat ini" /></div><div><label className={labelClass} htmlFor="qr-longitude">Longitude QR *</label><input className={inputClass} id="qr-longitude" name="qr_longitude_visible" type="number" min="-180" max="180" step="any" required value={qrLongitude} onChange={(event) => setQrLongitude(event.currentTarget.value)} placeholder="Terisi otomatis" /></div></div><p className="mt-2 text-[11px] leading-5 text-sky-950/55 dark:text-sky-100/50">Bisa dipakai untuk QR yang dipasang di pintu masuk atau titik lain dalam area wisata.</p></div>}</div></div><div className="mt-3"><label className={labelClass} htmlFor="qr-name-visible">Nama titik QR</label><input className={inputClass} id="qr-name-visible" name="qr_name_visible" value={qrName} onChange={(event) => setQrName(event.currentTarget.value)} required maxLength={120} /></div><p className="mt-3 truncate text-xs text-madiun-blue/55 dark:text-slate-400" title={qrCode}>Kode QR: <strong>{qrCode}</strong>{qrPoint && " · tetap saat tautan destinasi berubah"}</p><div className="mt-4"><QrDownloadCard code={qrCode} ready={Boolean(destination && qrPoint) || Boolean(state.success)} /></div></div>
			</aside>
		</div>
		<fieldset className="rounded-3xl border border-violet-200/70 bg-violet-50/55 p-4 dark:border-violet-200/10 dark:bg-violet-950/20 sm:p-5"><legend className="px-2 text-sm font-black text-violet-950 dark:text-violet-100">Ikuti minigame</legend><label className="block text-xs font-bold text-violet-950 dark:text-violet-100">Pilih satu minigame<select id="destination-minigame" name="minigame_program_id" value={selectedMinigameId} onChange={(event) => { const nextId = event.currentTarget.value; setSelectedMinigameId(nextId); const next = minigamePrograms.find((program) => program.id === nextId); setFindFriendsRequired(next?.default_photobox_access_mode === "mission_reward" && !next.ai_is_mission && next.components.includes("find_friends") ? true : (next?.required_components.includes("find_friends") ?? true)); }} className="form-input mt-1.5 w-full"><option value="">Tidak mengikuti minigame</option>{minigamePrograms.map((program) => <option key={program.id} value={program.id}>{program.name}{!program.is_enabled ? " · menunggu admin" : ""}</option>)}</select></label>{selectedMinigame && selectedMinigame.components.includes("find_friends") && <>{findFriendsLockedByGift && findFriendsRequired && <input type="hidden" name="find_friends_required" value="on" />}<label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-violet-200/60 bg-white/65 p-3 text-xs font-semibold text-violet-950 dark:border-violet-100/10 dark:bg-slate-900/45 dark:text-violet-100"><input type="checkbox" name="find_friends_required" checked={findFriendsRequired} disabled={findFriendsLockedByGift} onChange={(event) => setFindFriendsRequired(event.currentTarget.checked)} className="mt-0.5 h-4 w-4 accent-violet-700" /><span><strong className="block">Wajibkan rangkaian Find Our Friends di wisata ini</strong><span className="mt-1 block font-normal leading-5 text-violet-900/65 dark:text-violet-100/60">Matikan jika jarak antartitik terlalu jauh. Program hadiah Photobox mengunci rangkaian ini bila belum ada misi lain yang bisa menyelesaikan minigame.</span></span></label></>}{selectedMinigame && !selectedMinigame.components.includes("find_friends") && <p className="mt-3 rounded-xl bg-white/60 p-3 text-xs leading-5 text-violet-950/70 dark:bg-slate-900/40 dark:text-violet-100/70">Find Our Friends tidak aktif pada minigame ini.</p>}{!selectedMinigame && <p className="mt-3 text-xs leading-5 text-violet-950/65 dark:text-violet-100/60">Tanpa minigame, pemandu AI tetap aktif secara default di dashboard wisata.</p>}</fieldset>
		<div role="note" className="rounded-xl border border-madiun-light/35 bg-sky-50 px-4 py-3 text-xs leading-5 text-madiun-blue dark:bg-sky-950/25 dark:text-sky-100"><strong>{externalManager ? "Persetujuan admin diperlukan:" : "Pengecekan sebelum tayang:"}</strong> {externalManager ? "Wisata baru dan perubahan pada wisata yang sedang tayang masuk antrean pemeriksaan. Halaman disembunyikan sementara selama review; admin mengirim alasan jika perlu perbaikan atau menurunkan wisata." : "Foto sampul dan pin koordinat wajib tersedia. QR titik utama dibuat atau diperbarui dalam penyimpanan yang sama; wisata tanpa foto tetap tersimpan sebagai draft."}</div>
		<div className="flex flex-wrap items-center justify-between gap-3 border-t border-madiun-light/20 pt-4"><div className="flex flex-wrap gap-4">{!externalManager && <label className="flex items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-madiun-blue" type="checkbox" name="is_featured" defaultChecked={destination?.is_featured} /> Tampilkan sebagai unggulan</label>}<label className="flex items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-madiun-blue" type="checkbox" name="is_published" defaultChecked={destination?.is_published} disabled={externalManager && destination?.is_published} /> {externalManager ? "Ajukan persetujuan admin" : "Terbitkan sekarang"}</label>{externalManager && destination?.is_published && <p className="basis-full text-xs text-madiun-blue/60 dark:text-slate-400">Perubahan wisata yang sedang tayang otomatis dimasukkan ke review admin.</p>}</div><div className="flex justify-end gap-2">{destination && <button type="button" onClick={onCancel} className="rounded-xl border border-madiun-light/40 px-4 py-3 text-sm font-bold text-madiun-blue dark:text-slate-200">Batal</button>}<SubmitButton pending={pending}>{destination ? "Simpan perubahan" : "Simpan wisata + QR"}</SubmitButton></div></div><ActionFeedback state={state} />
		{storyEditorOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setStoryEditorOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="destination-story-title" className="flex h-dvh w-full max-w-5xl flex-col bg-white p-4 shadow-2xl dark:bg-slate-900 sm:h-[min(92dvh,900px)] sm:rounded-3xl sm:p-6"><header className="flex flex-wrap items-start justify-between gap-4 border-b border-madiun-light/20 pb-4"><div><h2 id="destination-story-title" className="text-xl font-bold text-madiun-blue dark:text-white">Deskripsi destinasi</h2><p className="mt-1 text-sm text-madiun-blue/60 dark:text-slate-400">Maksimal {MAX_DESCRIPTION_WORDS} kata.</p></div><div className="flex items-center gap-2">{enhanceButton}<button type="button" onClick={() => setStoryEditorOpen(false)} className="min-h-10 rounded-lg border border-madiun-light/40 px-3 text-sm font-semibold text-madiun-blue dark:text-slate-100">Tutup</button></div></header>{enhancement ? <div ref={enhancementReviewRef} className="my-4 min-h-0 flex-1 overflow-y-auto pr-1" aria-live="polite"><div className="mb-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">✨ Hasil Enhance siap ditinjau. Teks awal tetap aman sampai kamu memilih hasil baru.</div><div className="grid gap-3 lg:grid-cols-2"><details className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-800/70"><summary className="cursor-pointer px-4 py-3 text-xs font-black text-slate-700 dark:text-slate-200">Sebelum · buka teks awal</summary><p className="max-h-64 overflow-y-auto border-t border-slate-200 px-4 py-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:border-white/10 dark:text-slate-300">{enhancement.before || "Belum ada teks awal."}</p></details><label className="flex min-h-64 min-w-0 flex-col rounded-2xl border border-sky-300 bg-white p-4 dark:border-sky-300/25 dark:bg-slate-800"><span className="mb-2 text-xs font-black text-sky-800 dark:text-sky-200">Sesudah · bisa diedit</span><textarea aria-label="Hasil Enhance, bisa diedit" className="min-h-52 w-full flex-1 resize-y bg-transparent text-sm leading-6 text-slate-800 outline-none focus:ring-2 focus:ring-sky-300 dark:text-slate-100" maxLength={MAX_DESCRIPTION_CHARACTERS} value={enhancedDraft} onChange={(event) => setEnhancedDraft(limitWords(event.currentTarget.value))}/></label></div>{enhancement.sources.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><span className="font-bold">Sumber tambahan:</span>{enhancement.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener" className="underline decoration-sky-400 underline-offset-2">Wikipedia · {source.title}</a>)}</div>}<div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setEnhancement(null)} className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-white/15 dark:text-slate-200">Tetap pakai teks awal</button><button type="button" onClick={applyEnhancedDescription} className="min-h-10 rounded-xl bg-sky-700 px-4 text-xs font-black text-white dark:bg-sky-500 dark:text-slate-950">Pakai hasil sesudah</button></div></div> : <textarea autoFocus aria-label="Deskripsi destinasi" className="form-input my-4 min-h-0 w-full flex-1 resize-none leading-7" maxLength={MAX_DESCRIPTION_CHARACTERS} value={description} onChange={(event) => setDescription(limitWords(event.currentTarget.value))} placeholder="Jelaskan daya tarik, fasilitas, akses, jam kunjung, dan informasi penting bagi pengunjung."/>}<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-madiun-light/20 pt-4"><span aria-live="polite" className="text-sm font-semibold text-madiun-blue/65 dark:text-slate-300">{countWords(enhancement ? enhancedDraft : description)} / {MAX_DESCRIPTION_WORDS} kata</span><div className="flex flex-wrap items-center gap-2">{enhancementError && <span role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-300">{enhancementError}</span>}<button type="button" onClick={() => setStoryEditorOpen(false)} className="min-h-11 rounded-xl bg-madiun-blue px-5 py-2.5 text-sm font-bold text-white dark:bg-indigo-600">Selesai</button></div></footer></section></div>}
	</form>;
}

export function QrPointForm({ destinations }: { destinations: DestinationOption[] }) {
	const [savedQrCode, setSavedQrCode] = useState("");
	const [state, action, pending] = useActionState(async (previous: WorkspaceActionState, formData: FormData) => {
		const result = await createQrPointAction(previous, formData);
		setSavedQrCode(result.success ? String(formData.get("code") ?? "") : "");
		return result;
	}, initialState);
	const [destinationId, setDestinationId] = useState("");
	const [qrCode, setQrCode] = useState("");
	const [latitude, setLatitude] = useState("");
	const [longitude, setLongitude] = useState("");
	const destination = destinations.find((item) => item.id === destinationId);
	return <form action={action} className="space-y-5">
		<div><label className={labelClass} htmlFor="qr-destination">Destinasi *</label><select className={inputClass} id="qr-destination" name="destination_id" required value={destinationId} onChange={(event) => { const id = event.currentTarget.value; const selected = destinations.find((item) => item.id === id); setDestinationId(id); setLatitude(selected?.latitude?.toString() ?? ""); setLongitude(selected?.longitude?.toString() ?? ""); }}><option value="" disabled>Pilih destinasi</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="qr-name">Nama titik QR *</label><input className={inputClass} id="qr-name" name="name" required maxLength={120} placeholder="Gerbang utama" /></div>
			<div><label className={labelClass} htmlFor="qr-code">Kode QR *</label><input className={inputClass} id="qr-code" name="code" value={qrCode} onChange={(event) => setQrCode(event.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="monumen-kresek-gerbang" /></div>
		</div>
		<div><label className={labelClass} htmlFor="qr-address">Alamat pemasangan</label><input className={inputClass} id="qr-address" name="address" maxLength={500} placeholder="Letak fisik QR dipasang" /></div>
		<fieldset className="rounded-2xl border border-sky-200/75 bg-sky-50/65 p-4 dark:border-sky-200/10 dark:bg-sky-950/25"><legend className="px-1 text-xs font-black text-sky-950 dark:text-sky-100">Lokasi pemasangan QR *</legend><p className="mb-3 text-xs leading-5 text-sky-950/60 dark:text-sky-100/55">{destination?.latitude != null && destination.longitude != null ? "Terisi dari lokasi utama wisata. Ubah hanya jika QR dipasang di titik lain." : "Pilih lokasi di peta atau gunakan posisi perangkat. Koordinat QR menentukan titik scan."}</p><CoordinateTools onSelect={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} /><div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="qr-point-latitude">Latitude titik QR *</label><input className={inputClass} id="qr-point-latitude" name="latitude" type="number" min="-90" max="90" step="any" required value={latitude} onChange={(event) => setLatitude(event.currentTarget.value)} placeholder="Pilih lokasi di atas" /></div>
			<div><label className={labelClass} htmlFor="qr-point-longitude">Longitude titik QR *</label><input className={inputClass} id="qr-point-longitude" name="longitude" type="number" min="-180" max="180" step="any" required value={longitude} onChange={(event) => setLongitude(event.currentTarget.value)} placeholder="Terisi otomatis" /></div>
		</div></fieldset>
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-[#16587B]/75">QR lokasi dikelola terpisah dari minigame. Setelah titik tersimpan, pilih dan hubungkan QR dari menu Minigames.</p>
		<p className="-mt-2 text-xs leading-5 text-[#16587B]/60">QR hanya mencatat kunjungan. Hubungkan titik ke program dan atur prasyaratnya di menu Minigames.</p>
		{qrCode && <QrDownloadCard code={qrCode} ready={savedQrCode === qrCode} />}
		<ActionFeedback state={state} /><div className="flex justify-end"><SubmitButton pending={pending}>Simpan titik QR</SubmitButton></div>
	</form>;
}

export function PartnerForm({ destinations, partner, onCancel }: { destinations: DestinationOption[]; partner?: PartnerOption; onCancel?: () => void }) {
	const [state, action, pending] = useActionState(partner ? updatePartnerAction : createPartnerAction, initialState);
	const categoryChoices = ["Kuliner", "Penginapan", "Transportasi", "Kerajinan", "Jasa wisata"];
	const existingCategories = partner?.business_categories?.length ? partner.business_categories : partner?.business_type ? [partner.business_type] : [];
	const [businessName, setBusinessName] = useState(partner?.business_name ?? "");
	const [slug, setSlug] = useState(partner?.slug ?? "");
	const [slugEdited, setSlugEdited] = useState(Boolean(partner));
	const [categories, setCategories] = useState<string[]>(existingCategories.filter((item) => categoryChoices.includes(item)));
	const [customCategories, setCustomCategories] = useState(existingCategories.filter((item) => !categoryChoices.includes(item)).join(", "));
	const [destinationId, setDestinationId] = useState(partner?.destination_id ?? "");
	const [allowMinigame, setAllowMinigame] = useState(partner?.allow_minigame_integration ?? false);
	const [latitude, setLatitude] = useState(partner?.latitude?.toString() ?? "");
	const [longitude, setLongitude] = useState(partner?.longitude?.toString() ?? "");
	const [locationStatus, setLocationStatus] = useState("");
	const [logoUrl, setLogoUrl] = useState(partner?.logo_url ?? "");
	const normalizedCategories = [...new Set([...categories, ...customCategories.split(",").map((item) => item.trim()).filter(Boolean)])];
	const categoryValue = normalizedCategories.join(", ");
	const destinationsWithCoordinates = destinations.filter((item) => item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined);
	const bestDestination = (() => {
		const lat = Number(latitude); const lng = Number(longitude);
		if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
		return destinations.filter((item) => item.latitude !== null && item.longitude !== null).map((item) => {
			const rad = Math.PI / 180;
			const a = Math.sin((item.latitude! - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(item.latitude! * rad) * Math.sin((item.longitude! - lng) * rad / 2) ** 2;
			return { item, distance: Math.round(6371000 * 2 * Math.asin(Math.sqrt(a))) };
		}).sort((a, b) => a.distance - b.distance)[0] ?? null;
	})();
	const linkedDestination = destinationsWithCoordinates.find((item) => item.id === destinationId);
	const selectedDestinationDistance = linkedDestination && latitude && longitude && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
		? Math.round((() => {
			const radians = Math.PI / 180;
			const lat = Number(latitude);
			const lng = Number(longitude);
			const dLat = (linkedDestination.latitude! - lat) * radians;
			const dLng = (linkedDestination.longitude! - lng) * radians;
			const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * radians) * Math.cos(linkedDestination.latitude! * radians) * Math.sin(dLng / 2) ** 2;
			return 6371000 * 2 * Math.asin(Math.sqrt(a));
		})())
		: null;
	const slugify = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
	function useMyLocation() {
		if (!navigator.geolocation) { setLocationStatus("Browser ini tidak menyediakan lokasi otomatis."); return; }
		setLocationStatus("Meminta izin lokasi…");
		navigator.geolocation.getCurrentPosition((position) => {
			setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6));
			setLocationStatus("Koordinat usaha berhasil diisi dari lokasi perangkat.");
		}, () => setLocationStatus("Lokasi belum diizinkan. Kamu masih bisa mengisi koordinat secara manual."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
	}
	return <form action={action} className="space-y-5">
		{partner && <input type="hidden" name="partner_id" value={partner.id} />}
		<input type="hidden" name="business_categories" value={categoryValue} />
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="partner-name">Nama mitra / UMKM *</label><input className={inputClass} id="partner-name" name="business_name" value={businessName} onChange={(event) => { setBusinessName(event.currentTarget.value); if (!slugEdited) setSlug(slugify(event.currentTarget.value)); }} required maxLength={160} placeholder="Warung Pecel" /></div>
			<div><label className={labelClass} htmlFor="partner-slug">ID halaman mitra *</label><div className="flex items-center overflow-hidden rounded-xl border border-[#84B3CE]/40 bg-white"><span className="shrink-0 pl-3 text-xs text-[#16587B]/45">/mitra/</span><input className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm outline-none" id="partner-slug" name="slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.currentTarget.value)); }} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="warung-pecel-madiun" /></div><p className="mt-1 text-xs text-[#16587B]/55">ID unik di alamat halaman mitra, misalnya <strong>/mitra/warung-pecel</strong>.</p></div>
			<fieldset className="min-w-0 sm:col-span-2"><legend className={labelClass}>Jenis usaha * · pilih minimal satu</legend><p className="mb-3 text-xs text-[#16587B]/55">Pilih beberapa tag agar mitra lebih mudah ditemukan. Jenis lain bisa ditulis dipisahkan koma.</p><div className="flex flex-wrap gap-2">{categoryChoices.map((category) => { const selected = categories.includes(category); return <label key={category} className={`cursor-pointer rounded-full border px-3.5 py-2 text-xs font-semibold transition ${selected ? "border-sky-500 bg-sky-100 text-sky-900 ring-2 ring-sky-200/60" : "border-[#84B3CE]/35 bg-white/75 text-[#16587B]/75 hover:bg-sky-50"}`}><input className="sr-only" type="checkbox" checked={selected} onChange={() => setCategories((current) => selected ? current.filter((item) => item !== category) : [...current, category])} /><span className="mr-1">{selected ? "✓" : "+"}</span>{category}</label>; })}</div><label className="mt-3 block text-xs font-bold text-[#16587B]" htmlFor="partner-custom-categories">Jenis usaha lainnya<input className={inputClass} id="partner-custom-categories" value={customCategories} onChange={(event) => setCustomCategories(event.currentTarget.value)} placeholder="Contoh: Pemandu sejarah, toko oleh-oleh" /></label><p className="mt-1 text-[11px] text-[#16587B]/55">Pisahkan jenis khusus dengan koma. Tag terpilih: {categoryValue || "belum ada"}.</p></fieldset>
			<div className="sm:col-span-2"><label className={labelClass} htmlFor="partner-address">Alamat usaha</label><input className={inputClass} id="partner-address" name="address" maxLength={500} defaultValue={partner?.address ?? ""} placeholder="Nama jalan, area, atau patokan" /></div>
		</div>
		<div className="rounded-2xl border border-[#84B3CE]/30 bg-[#E0F2FE]/45 p-4 sm:p-5">
			<div className="mb-3"><p className="text-xs font-black uppercase tracking-[0.14em] text-[#16587B]">Keterkaitan lokasi · opsional</p><p className="mt-1 text-xs leading-5 text-[#16587B]/65">Mitra tetap bisa terdaftar tanpa ditautkan ke wisata. Jika lokasi diisi, sistem dapat menyarankan wisata dan memeriksa batas jarak tetap 500 m saat dipakai di Find Our Friends.</p></div>
			<div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass} htmlFor="partner-destination">Wisata lokal terdekat</label><select className={inputClass} id="partner-destination" name="destination_id" value={destinationId} required={allowMinigame} onChange={(event) => setDestinationId(event.currentTarget.value)}><option value="">Belum ditautkan</option>{destinationsWithCoordinates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{selectedDestinationDistance !== null && <p className={`mt-2 text-xs font-semibold ${selectedDestinationDistance <= 500 ? "text-emerald-700" : "text-amber-800"}`}>{linkedDestination?.name}: sekitar {selectedDestinationDistance} m dari lokasi mitra{allowMinigame && selectedDestinationDistance > 500 ? " · di luar batas integrasi 500 m" : ""}</p>}{!destinationsWithCoordinates.length && <p className="mt-2 text-xs text-amber-800">Belum ada wisata berkoordinat. Tambahkan koordinat destinasi untuk mengaitkan mitra.</p>}{bestDestination && <button type="button" onClick={() => setDestinationId(bestDestination.item.id)} className="mt-2 text-left text-xs font-bold text-sky-800 underline decoration-dotted underline-offset-2">Saran terdekat: {bestDestination.item.name} · sekitar {(bestDestination.distance / 1000).toFixed(1)} km</button>}</div><div className="rounded-xl border border-[#84B3CE]/25 bg-white/75 p-3"><p className="text-xs font-black text-[#16587B]">Batas jarak kampanye mitra</p><p className="mt-1 text-2xl font-black text-[#16587B]">500 <span className="text-sm">meter</span></p><p className="mt-1 text-[11px] leading-4 text-[#16587B]/55">Tetap · tidak dapat diubah. Jika jarak lebih jauh, mitra tetap terdaftar di profil tetapi tidak bisa menjadi titik Find Our Friends di wisata itu.</p></div></div>
			<div className="mt-4 rounded-xl border border-[#84B3CE]/25 bg-white/75 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black text-[#16587B]">Koordinat lokasi usaha · opsional</p><p className="mt-1 text-[11px] leading-4 text-[#16587B]/55">Dipakai untuk rekomendasi wisata terdekat dan QR campaign. Bisa isi manual atau ambil lokasi perangkat.</p></div><button type="button" onClick={useMyLocation} className="min-h-10 rounded-lg border border-[#84B3CE]/45 bg-white px-3 text-xs font-bold text-[#16587B] hover:bg-sky-50">◎ Gunakan lokasi saya</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className={labelClass} htmlFor="partner-latitude">Latitude</label><input className={inputClass} id="partner-latitude" name="latitude" type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.currentTarget.value)} placeholder="-7.629…" required={allowMinigame} /></div><div><label className={labelClass} htmlFor="partner-longitude">Longitude</label><input className={inputClass} id="partner-longitude" name="longitude" type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.currentTarget.value)} placeholder="111.523…" required={allowMinigame} /></div></div>{locationStatus && <p role="status" className="mt-2 text-xs text-[#16587B]/65">{locationStatus}</p>}</div>
			<label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#84B3CE]/25 bg-white/75 p-3"><input className="mt-0.5 h-4 w-4 accent-[#16587B]" type="checkbox" name="allow_minigame_integration" checked={allowMinigame} onChange={(event) => setAllowMinigame(event.currentTarget.checked)} /><span><strong className="block text-xs text-[#16587B]">Izinkan mitra masuk ke Find Our Friends</strong><span className="mt-1 block text-[11px] leading-4 text-[#16587B]/60">Jika dicentang, admin dapat membuat QR bonus di lokasi usaha dan memilih program Find Our Friends. Perlu koordinat serta wisata berkoordinat dalam radius tetap 500 m. Jika tidak dicentang, mitra tetap memiliki profil dan dapat dipakai pada promo lain; lokasinya tidak masuk ke rute minigame.</span></span></label>
		</div>
		<div><label className={labelClass} htmlFor="partner-description">Deskripsi usaha *</label><textarea className={inputClass} id="partner-description" name="description" rows={3} maxLength={5000} required defaultValue={partner?.description ?? ""} placeholder="Ceritakan singkat usaha dan layanan yang ditawarkan." /><p className="mt-1 text-xs text-[#16587B]/55">Cukup satu atau dua kalimat yang membantu pengunjung mengenali usaha.</p></div>
		<div><MediaUploadField folder="partners" name="logo_url" label="Logo / foto mitra · wajib untuk verifikasi" defaultUrl={partner?.logo_url ?? ""} onUrlChange={setLogoUrl} /><input type="hidden" name="logo_required_check" value={logoUrl ? "ready" : ""} /></div>
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="partner-contact">Nama kontak</label><input className={inputClass} id="partner-contact" name="contact_name" maxLength={120} defaultValue={partner?.contact_name ?? ""} /></div>
			<div><label className={labelClass} htmlFor="partner-phone">Nomor WhatsApp / telepon</label><input className={inputClass} id="partner-phone" name="contact_phone" type="tel" maxLength={40} defaultValue={partner?.contact_phone ?? ""} /></div>
			<div><label className={labelClass} htmlFor="partner-email">Email kontak</label><input className={inputClass} id="partner-email" name="contact_email" type="email" maxLength={254} defaultValue={partner?.contact_email ?? ""} /></div>
			<div><label className={labelClass} htmlFor="partner-website">Website / media sosial</label><input className={inputClass} id="partner-website" name="website_url" type="url" defaultValue={partner?.website_url ?? ""} placeholder="https://…" /></div>
		</div>
		<ActionFeedback state={state} /><div className="flex justify-end gap-2">{onCancel && <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-[#84B3CE]/40 px-4 py-2.5 text-sm font-bold text-[#16587B]">Batal</button>}<SubmitButton pending={pending}>{partner ? "Simpan perubahan" : "Simpan mitra"}</SubmitButton></div>
	</form>;
}

export function PartnerProximityForm({ partner, destinations, onCancel }: { partner: PartnerOption; destinations: DestinationOption[]; onCancel: () => void }) {
	const [state, action, pending] = useActionState(updatePartnerProximityAction, initialState);
	const [allowMinigame, setAllowMinigame] = useState(partner.allow_minigame_integration ?? false);
	const [latitude, setLatitude] = useState(partner.latitude?.toString() ?? "");
	const [longitude, setLongitude] = useState(partner.longitude?.toString() ?? "");
	const [locationStatus, setLocationStatus] = useState("");
	function useMyLocation() {
		if (!navigator.geolocation) { setLocationStatus("Browser ini tidak menyediakan lokasi otomatis."); return; }
		setLocationStatus("Meminta izin lokasi…");
		navigator.geolocation.getCurrentPosition((position) => {
			setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6));
			setLocationStatus("Koordinat mitra berhasil diisi dari lokasi perangkat.");
		}, () => setLocationStatus("Lokasi belum diizinkan. Isi koordinat secara manual."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
	}
	return <form action={action} className="mt-4 space-y-4 rounded-2xl border border-[#84B3CE]/25 bg-white/65 p-4">
		<input type="hidden" name="partner_id" value={partner.id} />
		<div><label className={labelClass} htmlFor={`partner-destination-${partner.id}`}>Wisata terkait · opsional</label><select className={inputClass} id={`partner-destination-${partner.id}`} name="destination_id" defaultValue={partner.destination_id ?? ""} required={allowMinigame}><option value="">Tidak dikaitkan</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
		<div className="rounded-xl border border-[#84B3CE]/25 bg-white/75 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-[#16587B]">Koordinat lokasi usaha · opsional</p><p className="mt-1 text-[11px] leading-4 text-[#16587B]/55">Koordinat diperlukan jika integrasi Find Our Friends diaktifkan.</p></div><button type="button" onClick={useMyLocation} className="min-h-9 rounded-lg border border-[#84B3CE]/45 bg-white px-3 text-[11px] font-bold text-[#16587B]">◎ Gunakan lokasi saya</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Latitude<input className={inputClass} name="latitude" type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.currentTarget.value)} required={allowMinigame}/></label><label className={labelClass}>Longitude<input className={inputClass} name="longitude" type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.currentTarget.value)} required={allowMinigame}/></label></div>{locationStatus && <p role="status" className="mt-2 text-xs text-[#16587B]/65">{locationStatus}</p>}</div>
		<p className="rounded-xl bg-sky-50 px-3 py-2 text-xs leading-5 text-[#16587B]/70">Batas integrasi tetap 500 m dari wisata terpilih. Usaha di luar batas tetap bisa memakai profil dan campaign lain.</p>
		<label className="flex items-start gap-2 text-xs font-semibold text-[#16587B]"><input className="mt-0.5 accent-[#16587B]" type="checkbox" name="allow_minigame_integration" checked={allowMinigame} onChange={(event) => setAllowMinigame(event.currentTarget.checked)}/><span>Izinkan mitra digunakan sebagai titik bonus Find Our Friends.</span></label>
		<ActionFeedback state={state} />
		<div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-[#84B3CE]/40 px-4 py-3 text-sm font-bold text-[#16587B]">Tutup</button><SubmitButton pending={pending}>Simpan tautan</SubmitButton></div>
	</form>;
}
