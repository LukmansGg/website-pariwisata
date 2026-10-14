"use client";

import { useActionState, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
	createDestinationAction,
	createPartnerAction,
	createPromotionAction,
	createQrPointAction,
	updatePartnerProximityAction,
	updateDestinationAction,
	type WorkspaceActionState,
} from "@/src/server/auth/actions";
import { MediaUploadField } from "@/app/ruang-kelola/media-upload-field";

type DestinationOption = { id: string; name: string; slug: string; latitude?: number | null; longitude?: number | null };
type PartnerOption = { id: string; business_name: string; destination_id: string | null; max_distance_meters: number };
type QrPointOption = { id: string; name: string; code: string; destination_id: string; destination_name: string };

const initialState: WorkspaceActionState = {};
const inputClass = "form-input";
const labelClass = "form-label";
const MAX_DESCRIPTION_WORDS = 300;

function countWords(text: string) {
	return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function limitWords(text: string) {
	const words = [...text.matchAll(/\S+/g)];
	if (words.length <= MAX_DESCRIPTION_WORDS) return text;
	return text.slice(0, words[MAX_DESCRIPTION_WORDS].index);
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

type EditableDestination = { id: string; name: string; slug: string; category: string | null; categories?: string[]; short_description?: string | null; address: string | null; description?: string; image_url?: string | null; latitude: number | null; longitude: number | null; tags?: string[]; additional_minigames?: string[]; is_featured: boolean; is_published: boolean };

const DESTINATION_CATEGORIES = ["Alam", "Kuliner", "Spot Foto", "Sejarah & Budaya", "Petualangan & Aktivitas", "Rekreasi", "Religi", "Lainnya"];
type EditableQrPoint = { id: string; name: string; code: string; address: string | null; latitude: number | null; longitude: number | null };

function QrDownloadCard({ code, ready }: { code: string; ready: boolean }) {
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

export function DestinationForm({ destination, qrPoint, onCancel }: { destination?: EditableDestination; qrPoint?: EditableQrPoint; onCancel?: () => void }) {
	const formAction = destination ? updateDestinationAction : createDestinationAction;
	const [state, action, pending] = useActionState(formAction, initialState);
	const [slug, setSlug] = useState(destination?.slug ?? "");
	const [slugEdited, setSlugEdited] = useState(false);
	const [latitude, setLatitude] = useState(destination?.latitude?.toString() ?? "");
	const [longitude, setLongitude] = useState(destination?.longitude?.toString() ?? "");
	const [qrLatitude, setQrLatitude] = useState(qrPoint?.latitude?.toString() ?? destination?.latitude?.toString() ?? "");
	const [qrLongitude, setQrLongitude] = useState(qrPoint?.longitude?.toString() ?? destination?.longitude?.toString() ?? "");
	const [qrLatitudeEdited, setQrLatitudeEdited] = useState(Boolean(qrPoint));
	const [qrLongitudeEdited, setQrLongitudeEdited] = useState(Boolean(qrPoint));
	const [qrCode, setQrCode] = useState(qrPoint?.code ?? (destination?.slug ? `qr-${destination.slug}` : ""));
	const [qrName, setQrName] = useState(qrPoint?.name ?? (destination?.name ? `${destination.name} · QR utama` : "QR utama"));
	const [minigames, setMinigames] = useState<string[]>(destination?.additional_minigames ?? []);
	const [description, setDescription] = useState(destination?.description ?? "");
	const [shortDescription, setShortDescription] = useState(destination?.short_description ?? "");
	const [categories, setCategories] = useState<string[]>(destination?.categories?.length ? destination.categories : destination?.category?.split(", ").filter(Boolean) ?? []);
	const [storyEditorOpen, setStoryEditorOpen] = useState(false);
	useEffect(() => {
		if (!storyEditorOpen) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setStoryEditorOpen(false); };
		window.addEventListener("keydown", handleKeyDown);
		return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
	}, [storyEditorOpen]);
	const slugify = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
	const handleName = (value: string) => {
		if (!slugEdited && !qrPoint) {
			const nextSlug = slugify(value);
			setSlug(nextSlug);
			setQrCode(nextSlug ? `qr-${nextSlug}` : "");
		}
		if (!qrPoint) setQrName(value ? `${value} · QR utama` : "QR utama");
	};
	const toggleMinigame = (game: string) => setMinigames((current) => current.includes(game) ? current.filter((item) => item !== game) : [...current, game]);
	const toggleCategory = (category: string) => setCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
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
				<div className="min-w-0"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label className={labelClass} htmlFor="destination-description">Deskripsi destinasi</label><button type="button" onClick={() => setStoryEditorOpen(true)} className="inline-flex min-h-9 items-center rounded-lg border border-madiun-light/40 bg-white px-3 py-1.5 text-xs font-semibold text-madiun-blue transition hover:bg-sky-50 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">Buka layar penuh</button></div><textarea className={`${inputClass} min-h-64 w-full resize-y leading-6`} id="destination-description" name="description" rows={10} maxLength={10000} value={description} onChange={(event) => setDescription(limitWords(event.currentTarget.value))} placeholder="Jelaskan daya tarik, fasilitas, akses, jam kunjung, dan informasi penting bagi pengunjung." /><div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-madiun-blue/55 dark:text-slate-400"><span>Informasi untuk halaman destinasi dan konteks AI.</span><span className="font-semibold tabular-nums">{countWords(description)} / {MAX_DESCRIPTION_WORDS} kata</span></div></div>
				<div><MediaUploadField folder="destinations" name="image_url" label="Foto sampul · wajib agar wisata tayang" defaultUrl={destination?.image_url ?? ""} /></div>
				<div><label className={labelClass} htmlFor="destination-short-description">Ringkasan singkat</label><textarea className={`${inputClass} min-h-24 w-full resize-y leading-6`} id="destination-short-description" name="short_description" maxLength={180} rows={3} value={shortDescription} onChange={(event) => setShortDescription(event.currentTarget.value)} placeholder="Contoh: Waduk tenang untuk menikmati senja dan aktivitas air bersama keluarga." /><div className="mt-1 flex justify-between gap-2 text-xs text-madiun-blue/55 dark:text-slate-400"><span>Ringkasan tampil di kartu wisata.</span><span className="tabular-nums">{shortDescription.length}/180</span></div><input type="hidden" name="tags" value={destination?.tags?.join(", ") ?? ""} /></div>
				<fieldset className="rounded-2xl border border-madiun-light/25 bg-sky-50/50 p-4 dark:bg-slate-900/35 sm:p-5"><legend className="px-1 text-xs font-bold uppercase tracking-wide text-madiun-blue/75 dark:text-slate-300">Pin koordinat destinasi *</legend><div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass} htmlFor="destination-latitude">Latitude destinasi</label><input className={inputClass} id="destination-latitude" name="latitude" type="number" min="-90" max="90" step="any" required value={latitude} onChange={(event) => { const value = event.currentTarget.value; setLatitude(value); if (!qrLatitudeEdited) setQrLatitude(value); }} placeholder="-7.6…" /></div><div><label className={labelClass} htmlFor="destination-longitude">Longitude destinasi</label><input className={inputClass} id="destination-longitude" name="longitude" type="number" min="-180" max="180" step="any" required value={longitude} onChange={(event) => { const value = event.currentTarget.value; setLongitude(value); if (!qrLongitudeEdited) setQrLongitude(value); }} placeholder="111.5…" /></div></div><p className="mt-2 text-xs text-madiun-blue/65 dark:text-slate-400">Koordinat wajib untuk registrasi QR dan publikasi wisata. Foto boleh dilengkapi sebelum tayang.</p></fieldset>
			</div>
			<aside className="min-w-0 space-y-5">
				<fieldset className="rounded-3xl border border-madiun-light/25 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/45 sm:p-6"><legend className="px-1"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-madiun-blue/55 dark:text-slate-400">Fitur tambahan</span></legend><h3 className="text-lg font-bold text-madiun-blue dark:text-white">Minigame</h3><p className="mt-1 text-xs leading-5 text-madiun-blue/60 dark:text-slate-400">Pilih mode untuk destinasi ini.</p><div className="mt-4 space-y-3"><label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-madiun-light/20 bg-sky-50/60 p-3 dark:bg-slate-800/60"><input className="mt-1 h-4 w-4 accent-madiun-blue" type="checkbox" name="additional_minigames" value="find_friends" checked={minigames.includes("find_friends")} onChange={() => toggleMinigame("find_friends")} /><span><span className="block text-sm font-semibold text-madiun-blue dark:text-white">Find Our Friends</span><span className="mt-0.5 block text-xs text-madiun-blue/55 dark:text-slate-400">Temukan karakter di area wisata.</span></span></label><label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-madiun-light/20 bg-sky-50/60 p-3 dark:bg-slate-800/60"><input className="mt-1 h-4 w-4 accent-madiun-blue" type="checkbox" name="additional_minigames" value="photobox" checked={minigames.includes("photobox")} onChange={() => toggleMinigame("photobox")} /><span><span className="block text-sm font-semibold text-madiun-blue dark:text-white">Photobox</span><span className="mt-0.5 block text-xs text-madiun-blue/55 dark:text-slate-400">Bingkai foto destinasi.</span></span></label></div><p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:bg-amber-950/35 dark:text-amber-200">Konfigurasi tersimpan. Engine minigame belum tersedia.</p></fieldset>
				<input type="hidden" name="qr_code" value={qrCode} /><input type="hidden" name="qr_address" value={qrPoint?.address ?? destination?.address ?? ""} /><input type="hidden" name="qr_latitude" value={qrLatitude} /><input type="hidden" name="qr_longitude" value={qrLongitude} />
				<div className="min-w-0 rounded-3xl border border-madiun-light/25 bg-sky-50/40 p-5 dark:bg-slate-900/35 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-madiun-blue/55 dark:text-slate-400">Titik pemasangan</p><h3 className="mt-1 text-lg font-bold text-madiun-blue dark:text-white">QR utama</h3></div><span className="max-w-full truncate rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-madiun-blue dark:bg-slate-800 dark:text-slate-200" title={qrName}>{qrName}</span></div><p className="mt-2 text-xs text-madiun-blue/60 dark:text-slate-400">Tentukan koordinat tempat QR dipasang.</p><div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2"><div><label className={labelClass} htmlFor="qr-latitude">Latitude *</label><input className={inputClass} id="qr-latitude" name="qr_latitude_visible" type="number" min="-90" max="90" step="any" required value={qrLatitude} onChange={(event) => { setQrLatitudeEdited(true); setQrLatitude(event.currentTarget.value); }} /></div><div><label className={labelClass} htmlFor="qr-longitude">Longitude *</label><input className={inputClass} id="qr-longitude" name="qr_longitude_visible" type="number" min="-180" max="180" step="any" required value={qrLongitude} onChange={(event) => { setQrLongitudeEdited(true); setQrLongitude(event.currentTarget.value); }} /></div></div><div className="mt-3"><label className={labelClass} htmlFor="qr-name-visible">Nama titik QR</label><input className={inputClass} id="qr-name-visible" name="qr_name_visible" value={qrName} onChange={(event) => setQrName(event.currentTarget.value)} required maxLength={120} /></div><p className="mt-3 truncate text-xs text-madiun-blue/55 dark:text-slate-400" title={qrCode}>Kode QR: <strong>{qrCode}</strong>{qrPoint && " · tetap saat tautan destinasi berubah"}</p><div className="mt-4"><QrDownloadCard code={qrCode} ready={Boolean(destination && qrPoint) || Boolean(state.success)} /></div></div>
			</aside>
		</div>
		<div role="note" className="rounded-xl border border-madiun-light/35 bg-sky-50 px-4 py-3 text-xs leading-5 text-madiun-blue dark:bg-sky-950/25 dark:text-sky-100"><strong>Pengecekan sebelum tayang:</strong> foto sampul dan pin koordinat wajib tersedia. QR titik utama dibuat atau diperbarui dalam penyimpanan yang sama; wisata tanpa foto tetap tersimpan sebagai draft.</div>
		<div className="flex flex-wrap items-center justify-between gap-3 border-t border-madiun-light/20 pt-4"><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-madiun-blue" type="checkbox" name="is_featured" defaultChecked={destination?.is_featured} /> Tampilkan sebagai unggulan</label><label className="flex items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-madiun-blue" type="checkbox" name="is_published" defaultChecked={destination?.is_published} /> Terbitkan sekarang</label></div><div className="flex justify-end gap-2">{destination && <button type="button" onClick={onCancel} className="rounded-xl border border-madiun-light/40 px-4 py-3 text-sm font-bold text-madiun-blue dark:text-slate-200">Batal</button>}<SubmitButton pending={pending}>{destination ? "Simpan perubahan" : "Simpan wisata + QR"}</SubmitButton></div></div><ActionFeedback state={state} />
		{storyEditorOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setStoryEditorOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="destination-story-title" className="flex h-dvh w-full max-w-5xl flex-col bg-white p-4 shadow-2xl dark:bg-slate-900 sm:h-[min(92dvh,900px)] sm:rounded-3xl sm:p-6"><header className="flex items-start justify-between gap-4 border-b border-madiun-light/20 pb-4"><div><h2 id="destination-story-title" className="text-xl font-bold text-madiun-blue dark:text-white">Deskripsi destinasi</h2><p className="mt-1 text-sm text-madiun-blue/60 dark:text-slate-400">Maksimal {MAX_DESCRIPTION_WORDS} kata.</p></div><button type="button" onClick={() => setStoryEditorOpen(false)} className="min-h-10 rounded-lg border border-madiun-light/40 px-3 text-sm font-semibold text-madiun-blue dark:text-slate-100">Tutup</button></header><textarea autoFocus aria-label="Deskripsi destinasi" className="form-input my-4 min-h-0 w-full flex-1 resize-none leading-7" maxLength={5000} value={description} onChange={(event) => setDescription(limitWords(event.currentTarget.value))} placeholder="Jelaskan daya tarik, fasilitas, akses, jam kunjung, dan informasi penting bagi pengunjung."/><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-madiun-light/20 pt-4"><span aria-live="polite" className="text-sm font-semibold text-madiun-blue/65 dark:text-slate-300">{countWords(description)} / {MAX_DESCRIPTION_WORDS} kata</span><button type="button" onClick={() => setStoryEditorOpen(false)} className="min-h-11 rounded-xl bg-madiun-blue px-5 py-2.5 text-sm font-bold text-white dark:bg-indigo-600">Selesai</button></footer></section></div>}
	</form>;
}

export function QrPointForm({ destinations }: { destinations: DestinationOption[] }) {
	const [state, action, pending] = useActionState(createQrPointAction, initialState);
	return <form action={action} className="space-y-5">
		<div><label className={labelClass} htmlFor="qr-destination">Destinasi *</label><select className={inputClass} id="qr-destination" name="destination_id" required defaultValue=""><option value="" disabled>Pilih destinasi</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="qr-name">Nama titik QR *</label><input className={inputClass} id="qr-name" name="name" required maxLength={120} placeholder="Gerbang utama" /></div>
			<div><label className={labelClass} htmlFor="qr-code">Kode QR *</label><input className={inputClass} id="qr-code" name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="monumen-kresek-gerbang" /></div>
		</div>
		<div><label className={labelClass} htmlFor="qr-address">Alamat pemasangan</label><input className={inputClass} id="qr-address" name="address" maxLength={500} placeholder="Letak fisik QR dipasang" /></div>
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="qr-latitude">Latitude titik QR *</label><input className={inputClass} id="qr-latitude" name="latitude" type="number" min="-90" max="90" step="any" required /></div>
			<div><label className={labelClass} htmlFor="qr-longitude">Longitude titik QR *</label><input className={inputClass} id="qr-longitude" name="longitude" type="number" min="-180" max="180" step="any" required /></div>
		</div>
		<p className="-mt-2 text-xs leading-5 text-[#16587B]/60">Koordinat QR wajib karena radius minigame dihitung dari posisi pengunjung ke titik pemasangan ini.</p>
		<ActionFeedback state={state} /><div className="flex justify-end"><SubmitButton pending={pending}>Simpan titik QR</SubmitButton></div>
	</form>;
}

export function PartnerForm({ destinations }: { destinations: DestinationOption[] }) {
	const [state, action, pending] = useActionState(createPartnerAction, initialState);
	const [businessName, setBusinessName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const slugify = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
	return <form action={action} className="space-y-5">
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="partner-name">Nama mitra / UMKM *</label><input className={inputClass} id="partner-name" name="business_name" value={businessName} onChange={(event) => { setBusinessName(event.currentTarget.value); if (!slugEdited) setSlug(slugify(event.currentTarget.value)); }} required maxLength={160} placeholder="Warung Pecel Madiun" /></div>
			<div><label className={labelClass} htmlFor="partner-slug">Slug *</label><input className={inputClass} id="partner-slug" name="slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.currentTarget.value)); }} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="warung-pecel-madiun" /><p className="mt-1 text-xs text-[#16587B]/55">Terbentuk otomatis dari nama dan tetap bisa diedit.</p></div>
			<div><label className={labelClass} htmlFor="partner-type">Jenis usaha *</label><select className={inputClass} id="partner-type" name="business_type" required defaultValue=""><option value="" disabled>Pilih jenis usaha</option><option>Kuliner</option><option>Penginapan</option><option>Transportasi</option><option>Kerajinan</option><option>Jasa wisata</option><option>Lainnya</option></select></div>
			<div><label className={labelClass} htmlFor="partner-address">Alamat</label><input className={inputClass} id="partner-address" name="address" maxLength={500} /></div>
		</div>
		<div className="rounded-2xl border border-[#84B3CE]/30 bg-[#E0F2FE]/45 p-4 sm:p-5">
			<div className="mb-3"><p className="text-xs font-black uppercase tracking-[0.14em] text-[#16587B]">Keterkaitan lokasi · untuk minigame</p><p className="mt-1 text-xs leading-5 text-[#16587B]/65">Pilih destinasi wisata terdekat secara manual. Kampanye mitra hanya dapat memakai QR yang terpasang di destinasi pilihan ini.</p></div>
			<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
				<div><label className={labelClass} htmlFor="partner-destination">Wisata lokal terdekat *</label><select className={inputClass} id="partner-destination" name="destination_id" required defaultValue=""><option value="" disabled>Pilih wisata berkoordinat</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
				<div><label className={labelClass} htmlFor="partner-max-distance">Jarak maksimal dari QR *</label><div className="relative"><input className={`${inputClass} pr-14`} id="partner-max-distance" name="max_distance_meters" type="number" min="50" max="2000" step="50" required defaultValue="500"/><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-bold text-[#16587B]/50">meter</span></div></div>
			</div>
			<p className="mt-2 text-xs leading-5 text-[#16587B]/65">Saran awal 500 m · bisa diatur 50–2.000 m. Ini batas jarak pengunjung dari QR kampanye yang nantinya dipakai minigame. Lokasi fisik mitra tidak dihitung otomatis.</p>
		</div>
		<div><label className={labelClass} htmlFor="partner-description">Deskripsi usaha</label><textarea className={inputClass} id="partner-description" name="description" rows={4} maxLength={5000} /></div>
		<MediaUploadField folder="partners" name="logo_url" label="Logo / foto mitra" />
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="partner-contact">Nama kontak</label><input className={inputClass} id="partner-contact" name="contact_name" maxLength={120} /></div>
			<div><label className={labelClass} htmlFor="partner-phone">Nomor WhatsApp / telepon</label><input className={inputClass} id="partner-phone" name="contact_phone" type="tel" maxLength={40} /></div>
			<div><label className={labelClass} htmlFor="partner-email">Email kontak</label><input className={inputClass} id="partner-email" name="contact_email" type="email" maxLength={254} /></div>
			<div><label className={labelClass} htmlFor="partner-website">Website / media sosial</label><input className={inputClass} id="partner-website" name="website_url" type="url" placeholder="https://…" /></div>
		</div>
		<ActionFeedback state={state} /><div className="flex justify-end"><SubmitButton pending={pending}>Simpan mitra</SubmitButton></div>
	</form>;
}

export function PartnerProximityForm({ partner, destinations, onCancel }: { partner: PartnerOption; destinations: DestinationOption[]; onCancel: () => void }) {
	const [state, action, pending] = useActionState(updatePartnerProximityAction, initialState);
	return <form action={action} className="mt-4 space-y-4 rounded-2xl border border-[#84B3CE]/25 bg-white/65 p-4">
		<input type="hidden" name="partner_id" value={partner.id} />
		<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
			<div><label className={labelClass} htmlFor={`partner-destination-${partner.id}`}>Wisata lokal terdekat *</label><select className={inputClass} id={`partner-destination-${partner.id}`} name="destination_id" required defaultValue={partner.destination_id ?? ""}><option value="" disabled>Pilih wisata berkoordinat</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
			<div><label className={labelClass} htmlFor={`partner-distance-${partner.id}`}>Jarak maksimal QR *</label><div className="relative"><input className={`${inputClass} pr-14`} id={`partner-distance-${partner.id}`} name="max_distance_meters" type="number" min="50" max="2000" step="50" required defaultValue={partner.max_distance_meters || 500}/><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-bold text-[#16587B]/50">meter</span></div></div>
		</div>
		<ActionFeedback state={state} />
		<div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-[#84B3CE]/40 px-4 py-3 text-sm font-bold text-[#16587B]">Tutup</button><SubmitButton pending={pending}>Simpan tautan</SubmitButton></div>
	</form>;
}

export function PromotionForm({ partners, qrPoints }: { partners: PartnerOption[]; qrPoints: QrPointOption[] }) {
	const [state, action, pending] = useActionState(createPromotionAction, initialState);
	const [partnerId, setPartnerId] = useState("");
	const partner = partners.find((item) => item.id === partnerId);
	const eligibleQrPoints = partner?.destination_id ? qrPoints.filter((point) => point.destination_id === partner.destination_id) : [];
	return <form action={action} className="space-y-5">
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="promotion-partner">Mitra pemilik promosi *</label><select className={inputClass} id="promotion-partner" name="partner_id" required value={partnerId} onChange={(event) => setPartnerId(event.currentTarget.value)}><option value="" disabled>Pilih mitra</option>{partners.map((item) => <option key={item.id} value={item.id}>{item.business_name}{item.destination_id ? "" : " · perlu ditautkan ke wisata"}</option>)}</select>{partner && <p className="mt-1 text-xs text-[#16587B]/55">Batas jarak minigame: {partner.max_distance_meters} m dari QR.</p>}</div>
			<div><label className={labelClass} htmlFor="promotion-qr">Titik QR penempatan *</label><select className={inputClass} id="promotion-qr" name="qr_point_id" required defaultValue="" disabled={!eligibleQrPoints.length}><option value="" disabled>{!partnerId ? "Pilih mitra dahulu" : eligibleQrPoints.length ? "Pilih QR di wisata mitra" : "Belum ada QR pada wisata mitra"}</option>{eligibleQrPoints.map((item) => <option key={item.id} value={item.id}>{item.destination_name} · {item.name} ({item.code})</option>)}</select>{partner?.destination_id && <p className="mt-1 text-xs text-[#16587B]/55">Hanya menampilkan titik QR pada wisata yang ditautkan ke mitra.</p>}</div>
		</div>
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="promotion-title">Nama kampanye *</label><input className={inputClass} id="promotion-title" name="title" required maxLength={160} placeholder="Promo kuliner lokal" /></div>
			<div><label className={labelClass} htmlFor="promotion-type">Pengalaman setelah scan *</label><select className={inputClass} id="promotion-type" name="experience_type" required defaultValue="popup"><option value="popup">Popup promosi</option><option value="minigame">Masuk minigame</option><option value="photobox">Buka photobox</option></select></div>
		</div>
		<div><label className={labelClass} htmlFor="promotion-description">Isi promosi</label><textarea className={inputClass} id="promotion-description" name="description" rows={4} maxLength={5000} placeholder="Informasi yang akan ditampilkan kepada pengunjung." /></div>
		<MediaUploadField folder="campaigns" name="image_url" label="Gambar promosi" />
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="promotion-cta">Label tombol</label><input className={inputClass} id="promotion-cta" name="cta_label" maxLength={60} placeholder="Lihat promo" /></div>
			<div><label className={labelClass} htmlFor="promotion-url">Tautan tombol</label><input className={inputClass} id="promotion-url" name="cta_url" type="url" placeholder="https://…" /></div>
			<div><label className={labelClass} htmlFor="promotion-start">Mulai</label><input className={inputClass} id="promotion-start" name="starts_at" type="date" /></div>
			<div><label className={labelClass} htmlFor="promotion-end">Berakhir</label><input className={inputClass} id="promotion-end" name="ends_at" type="date" /></div>
		</div>
		<label className="flex items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-[#16587B]" type="checkbox" name="is_published" /> Aktifkan kampanye</label>
		<ActionFeedback state={state} /><div className="flex justify-end"><SubmitButton pending={pending}>Simpan kampanye</SubmitButton></div>
	</form>;
}
