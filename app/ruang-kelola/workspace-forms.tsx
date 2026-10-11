"use client";

import { useActionState, useState } from "react";
import {
	createDestinationAction,
	createPartnerAction,
	createPromotionAction,
	createQrPointAction,
	updateDestinationAction,
	type WorkspaceActionState,
} from "@/src/server/auth/actions";
import { MediaUploadField } from "@/app/ruang-kelola/media-upload-field";

type DestinationOption = { id: string; name: string; slug: string };
type PartnerOption = { id: string; business_name: string };
type QrPointOption = { id: string; name: string; code: string; destination_name: string };

const initialState: WorkspaceActionState = {};
const inputClass = "w-full rounded-xl border border-[#84B3CE]/40 bg-white px-4 py-3 text-sm text-[#16587B] outline-none transition placeholder:text-[#16587B]/35 focus:border-[#16587B] focus:ring-4 focus:ring-[#84B3CE]/20";
const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#16587B]/75";

function ActionFeedback({ state }: { state: WorkspaceActionState }) {
	return <>
		{state.error && <p role="alert" className="rounded-xl border border-[#16587B]/15 bg-[#F5EEDD] px-4 py-3 text-sm font-semibold text-[#16587B]">{state.error}</p>}
		{state.success && <p role="status" className="rounded-xl border border-[#84B3CE]/40 bg-[#84B3CE]/15 px-4 py-3 text-sm font-semibold text-[#16587B]">{state.success}</p>}
	</>;
}

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
	return <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#16587B] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#104866] disabled:cursor-wait disabled:opacity-60">
		{pending ? "Menyimpan…" : children}
	</button>;
}

type EditableDestination = { id: string; name: string; slug: string; category: string | null; address: string | null; description?: string; image_url?: string | null; latitude: number | null; longitude: number | null; tags?: string[]; is_featured: boolean; is_published: boolean };

export function DestinationForm({ destination, onCancel }: { destination?: EditableDestination; onCancel?: () => void }) {
	const formAction = destination ? updateDestinationAction : createDestinationAction;
	const [state, action, pending] = useActionState(formAction, initialState);
	const [slug, setSlug] = useState(destination?.slug ?? "");
	const [slugEdited, setSlugEdited] = useState(false);
	const slugify = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
	return <form action={action} className="space-y-5">
		{destination && <input type="hidden" name="id" value={destination.id} />}
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="destination-name">Nama tempat wisata *</label><input className={inputClass} id="destination-name" name="name" required maxLength={160} defaultValue={destination?.name} placeholder="Contoh: Waduk Bening Widas" onChange={(event) => { if (!slugEdited) setSlug(slugify(event.currentTarget.value)); }} /><p className="mt-1 text-xs text-[#16587B]/55">Nama yang paling dikenal pengunjung.</p></div>
			<div><label className={labelClass} htmlFor="destination-slug">Link halaman *</label><div className="flex overflow-hidden rounded-xl border border-[#84B3CE]/40 bg-white focus-within:border-[#16587B] focus-within:ring-4 focus-within:ring-[#84B3CE]/20"><span className="shrink-0 self-center pl-3 text-xs text-[#16587B]/40">/wisata/</span><input className="min-w-0 flex-1 border-0 bg-transparent px-2 py-3 text-sm text-[#16587B] outline-none placeholder:text-[#16587B]/35" id="destination-slug" name="slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.currentTarget.value)); }} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="waduk-bening-widas" /></div><p className="mt-1 text-xs text-[#16587B]/55">Otomatis dibuat dari nama. Tetap bisa kamu edit.</p></div>
			<div><label className={labelClass} htmlFor="destination-category">Kategori</label><select className={inputClass} id="destination-category" name="category" defaultValue={destination?.category ?? ""}><option value="">Pilih kategori</option><option>Sejarah &amp; Budaya</option><option>Alam</option><option>Kuliner</option><option>Rekreasi</option><option>Religi</option><option>Lainnya</option></select></div>
			<div><label className={labelClass} htmlFor="destination-address">Alamat / area</label><input className={inputClass} id="destination-address" name="address" maxLength={500} defaultValue={destination?.address ?? ""} placeholder="Desa Kresek, Kecamatan Wungu" /></div>
		</div>
		<div><label className={labelClass} htmlFor="destination-description">Ceritakan tempatnya</label><textarea className={inputClass} id="destination-description" name="description" rows={4} maxLength={10000} defaultValue={destination?.description ?? ""} placeholder="Apa yang bikin tempat ini menarik? Tulis cerita, fasilitas, jam kunjung, atau tips lokal." /><p className="mt-1 text-xs text-[#16587B]/55">Tulis fakta yang sudah terverifikasi. Cerita ini nantinya bisa jadi bekal AI Chat wisata.</p></div>
		<div><MediaUploadField folder="destinations" name="image_url" label="Foto sampul · wajib agar wisata tayang" defaultUrl={destination?.image_url ?? ""} /></div>
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="destination-tags">Tag</label><input className={inputClass} id="destination-tags" name="tags" defaultValue={destination?.tags?.join(", ") ?? ""} placeholder="sejarah, keluarga, edukasi" /><p className="mt-1 text-xs text-[#16587B]/55">Pisahkan dengan koma.</p></div>
		</div>
		<fieldset className="rounded-2xl border border-[#84B3CE]/25 bg-[#F5EEDD]/45 p-4">
			<legend className="px-1 text-xs font-bold uppercase tracking-wide text-[#16587B]/75">Pin koordinat · wajib agar wisata tayang</legend>
			<div className="grid gap-4 sm:grid-cols-2">
				<div><label className={labelClass} htmlFor="destination-latitude">Latitude</label><input className={inputClass} id="destination-latitude" name="latitude" type="number" min="-90" max="90" step="any" defaultValue={destination?.latitude ?? ""} placeholder="-7.6…" /></div>
				<div><label className={labelClass} htmlFor="destination-longitude">Longitude</label><input className={inputClass} id="destination-longitude" name="longitude" type="number" min="-180" max="180" step="any" defaultValue={destination?.longitude ?? ""} placeholder="111.5…" /></div>
			</div>
			<p className="mt-2 text-xs text-[#16587B]/65">Isi latitude dan longitude sebagai pasangan koordinat yang valid. Wisata tanpa pin tidak akan tampil ke publik.</p>
		</fieldset>
		<div role="note" className="rounded-xl border border-[#84B3CE]/35 bg-[#F5EEDD] px-4 py-3 text-xs leading-5 text-[#16587B]"><strong>Pengecekan sebelum tayang:</strong> foto sampul dan pin koordinat wajib tersedia. Data yang belum lengkap tetap tersimpan sebagai draft sampai editor/admin melengkapinya.</div>
		<div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#84B3CE]/20 pt-4">
			<label className="flex items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-[#16587B]" type="checkbox" name="is_featured" defaultChecked={destination?.is_featured} /> Tampilkan sebagai unggulan</label>
			<label className="flex items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-[#16587B]" type="checkbox" name="is_published" defaultChecked={destination?.is_published} /> Terbitkan sekarang</label>
		</div>
		<ActionFeedback state={state} />
		<div className="flex justify-end gap-2">{destination && <button type="button" onClick={onCancel} className="rounded-xl border border-[#84B3CE]/40 px-4 py-3 text-sm font-bold text-[#16587B]">Batal</button>}<SubmitButton pending={pending}>{destination ? "Simpan perubahan" : "Simpan destinasi"}</SubmitButton></div>
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
			<div><label className={labelClass} htmlFor="qr-latitude">Latitude titik QR</label><input className={inputClass} id="qr-latitude" name="latitude" type="number" min="-90" max="90" step="any" /></div>
			<div><label className={labelClass} htmlFor="qr-longitude">Longitude titik QR</label><input className={inputClass} id="qr-longitude" name="longitude" type="number" min="-180" max="180" step="any" /></div>
		</div>
		<ActionFeedback state={state} /><div className="flex justify-end"><SubmitButton pending={pending}>Simpan titik QR</SubmitButton></div>
	</form>;
}

export function PartnerForm() {
	const [state, action, pending] = useActionState(createPartnerAction, initialState);
	return <form action={action} className="space-y-5">
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="partner-name">Nama mitra / UMKM *</label><input className={inputClass} id="partner-name" name="business_name" required maxLength={160} placeholder="Warung Pecel Madiun" /></div>
			<div><label className={labelClass} htmlFor="partner-slug">Slug *</label><input className={inputClass} id="partner-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} placeholder="warung-pecel-madiun" /></div>
			<div><label className={labelClass} htmlFor="partner-type">Jenis usaha *</label><select className={inputClass} id="partner-type" name="business_type" required defaultValue=""><option value="" disabled>Pilih jenis usaha</option><option>Kuliner</option><option>Penginapan</option><option>Transportasi</option><option>Kerajinan</option><option>Jasa wisata</option><option>Lainnya</option></select></div>
			<div><label className={labelClass} htmlFor="partner-address">Alamat</label><input className={inputClass} id="partner-address" name="address" maxLength={500} /></div>
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

export function PromotionForm({ partners, qrPoints }: { partners: PartnerOption[]; qrPoints: QrPointOption[] }) {
	const [state, action, pending] = useActionState(createPromotionAction, initialState);
	return <form action={action} className="space-y-5">
		<div className="grid gap-4 sm:grid-cols-2">
			<div><label className={labelClass} htmlFor="promotion-partner">Mitra pemilik promosi *</label><select className={inputClass} id="promotion-partner" name="partner_id" required defaultValue=""><option value="" disabled>Pilih mitra</option>{partners.map((item) => <option key={item.id} value={item.id}>{item.business_name}</option>)}</select></div>
			<div><label className={labelClass} htmlFor="promotion-qr">Titik QR penempatan *</label><select className={inputClass} id="promotion-qr" name="qr_point_id" required defaultValue=""><option value="" disabled>Pilih titik QR terdekat</option>{qrPoints.map((item) => <option key={item.id} value={item.id}>{item.destination_name} · {item.name} ({item.code})</option>)}</select></div>
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
