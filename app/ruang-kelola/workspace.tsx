"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { DestinationForm, PartnerForm, PromotionForm, QrPointForm } from "./workspace-forms";

type Destination = {
	id: string; slug: string; name: string; category: string | null; address: string | null;
	latitude: number | null; longitude: number | null; is_published: boolean; is_featured: boolean; created_at: string;
};
type Partner = { id: string; business_name: string; slug: string; business_type: string; address: string | null; status: string; created_at: string };
type QrPoint = { id: string; destination_id: string; destination_name: string; name: string; code: string; address: string | null; latitude: number | null; longitude: number | null; is_active: boolean; created_at: string };
type Promotion = { id: string; partner_id: string; partner_name: string; qr_point_id: string; qr_label: string; title: string; experience_type: string; status: string; starts_at: string | null; ends_at: string | null; created_at: string };

export type WorkspaceData = {
	role: "admin" | "editor";
	email: string;
	destinations: Destination[];
	partners: Partner[];
	qrPoints: QrPoint[];
	promotions: Promotion[];
	driveConnected: boolean;
	driveConfigured: boolean;
	driveNotice?: string;
	dataWarning?: string;
};

type Section = "overview" | "destinations" | "qr" | "partners" | "promotions" | "experiences" | "sessions" | "staff";
const navigation: { id: Section; label: string; group: string; marker: string }[] = [
	{ id: "overview", label: "Ringkasan", group: "WORKSPACE", marker: "01" },
	{ id: "destinations", label: "Destinasi wisata", group: "KONTEN", marker: "02" },
	{ id: "qr", label: "Lokasi & titik QR", group: "KONTEN", marker: "03" },
	{ id: "partners", label: "Mitra lokal", group: "KEMITRAAN", marker: "04" },
	{ id: "promotions", label: "Kampanye promosi", group: "KEMITRAAN", marker: "05" },
	{ id: "experiences", label: "Karakter & permainan", group: "PENGALAMAN", marker: "06" },
	{ id: "sessions", label: "Sesi pengunjung", group: "PENGALAMAN", marker: "07" },
	{ id: "staff", label: "Petugas & akses", group: "PENGATURAN", marker: "08" },
];
const sectionCopy: Record<Section, { eyebrow: string; title: string; description: string }> = {
	overview: { eyebrow: "MADIUNTRIP · CONTROL ROOM", title: "Ruang pengelola", description: "Kelola informasi destinasi dan pengalaman pengunjung dari satu tempat." },
	destinations: { eyebrow: "KONTEN PARIWISATA", title: "Destinasi wisata", description: "Input informasi faktual, lokasi, foto, dan status publikasi destinasi." },
	qr: { eyebrow: "AKTIVASI LOKASI", title: "Lokasi & titik QR", description: "Hubungkan setiap kode QR ke destinasi dan posisi pemasangannya." },
	partners: { eyebrow: "EKOSISTEM LOKAL", title: "Mitra lokal", description: "Simpan profil UMKM, kontak, dan jenis layanan pariwisata." },
	promotions: { eyebrow: "PROMOSI & AKTIVASI", title: "Kampanye promosi", description: "Atur mitra, titik QR, jadwal, dan pengalaman yang muncul setelah scan." },
	experiences: { eyebrow: "PENGALAMAN DIGITAL", title: "Karakter & permainan", description: "Ruang untuk maskot, AI Chat, minigame, dan photobox." },
	sessions: { eyebrow: "PENGUNJUNG", title: "Sesi pengunjung", description: "Sesi guest dimulai otomatis saat halaman destinasi dibuka." },
	staff: { eyebrow: "PENGATURAN", title: "Petugas & akses", description: "Kelola akun internal dan hak akses workspace." },
};

function SectionTitle({ title, description }: { title: string; description?: string }) {
	return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black tracking-tight text-[#16587B]">{title}</h2>{description && <p className="mt-1 text-sm text-[#16587B]/60">{description}</p>}</div></div>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
	return <section className={`rounded-3xl border border-[#84B3CE]/20 bg-white p-5 shadow-[0_12px_34px_-28px_rgba(22,88,123,0.5)] sm:p-7 ${className}`}>{children}</section>;
}

function StatCard({ label, value, note, index }: { label: string; value: number | string; note: string; index: string }) {
	return <div className="rounded-2xl border border-[#84B3CE]/20 bg-white p-5 shadow-[0_12px_34px_-28px_rgba(22,88,123,0.5)]"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[0.14em] text-[#16587B]/55">{label}</span><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#F5EEDD] text-[10px] font-black text-[#16587B]">{index}</span></div><p className="mt-5 text-3xl font-black text-[#16587B]">{value}</p><p className="mt-1 text-xs text-[#16587B]/55">{note}</p></div>;
}

function StatusPill({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
	return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${muted ? "bg-[#F5EEDD] text-[#16587B]/60" : "bg-[#84B3CE]/20 text-[#16587B]"}`}>{children}</span>;
}

function EmptyRow({ children }: { children: string }) {
	return <div className="rounded-2xl border border-dashed border-[#84B3CE]/35 bg-[#F5EEDD]/35 px-5 py-8 text-center text-sm text-[#16587B]/60">{children}</div>;
}

function DestinationList({ items }: { items: Destination[] }) {
	return items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead><tr className="border-b border-[#84B3CE]/20 text-[10px] uppercase tracking-widest text-[#16587B]/50"><th className="py-3 pr-4">Destinasi</th><th className="py-3 pr-4">Lokasi</th><th className="py-3 pr-4">Kategori</th><th className="py-3 pr-4">Status</th><th className="py-3">Tautan</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-[#84B3CE]/10 last:border-0"><td className="py-4 pr-4"><p className="font-bold text-[#16587B]">{item.name}</p><p className="mt-0.5 text-xs text-[#16587B]/50">/{item.slug}{item.is_featured ? " · Unggulan" : ""}</p></td><td className="max-w-52 py-4 pr-4 text-xs text-[#16587B]/65">{item.address || "Koordinat/alamat belum diisi"}</td><td className="py-4 pr-4 text-xs">{item.category || "—"}</td><td className="py-4 pr-4"><StatusPill muted={!item.is_published}>{item.is_published ? "Terbit" : "Draft"}</StatusPill></td><td className="py-4"><Link className="font-bold text-[#16587B] underline decoration-[#84B3CE] underline-offset-4" href={`/wisata/${encodeURIComponent(item.slug)}`} target="_blank">Lihat</Link></td></tr>)}</tbody></table></div> : <EmptyRow>Belum ada destinasi. Tambahkan data pertama melalui formulir di atas.</EmptyRow>;
}

export function DashboardWorkspace({ data, logoutAction }: { data: WorkspaceData; logoutAction: () => Promise<void> }) {
	const [section, setSection] = useState<Section>("overview");
	const copy = sectionCopy[section];
	const nav = (item: (typeof navigation)[number], mobile = false) => <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${section === item.id ? "bg-[#16587B] text-white shadow-sm" : "text-[#16587B]/70 hover:bg-[#F5EEDD] hover:text-[#16587B]"} ${mobile ? "w-auto shrink-0" : ""}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[9px] font-black ${section === item.id ? "bg-white/15 text-white" : "bg-[#F5EEDD] text-[#16587B]/65"}`}>{item.marker}</span><span>{item.label}</span></button>;
	const groups = [...new Set(navigation.map((item) => item.group))];

	return <div className="min-h-dvh bg-[#F5EEDD]/65 text-[#16587B]">
		<div className="mx-auto flex min-h-dvh max-w-[1600px]">
			<aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-[#84B3CE]/20 bg-white px-4 py-5 md:flex">
				<div className="flex items-center gap-3 px-3 pb-7"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#16587B] text-xs font-black tracking-tight text-white">MT</div><div><p className="text-sm font-black tracking-tight">MadiunTrip</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#16587B]/45">Admin workspace</p></div></div>
				<nav aria-label="Navigasi dashboard" className="flex-1 space-y-5 overflow-y-auto">{groups.map((group) => <div key={group}><p className="mb-2 px-3 text-[9px] font-black tracking-[0.18em] text-[#16587B]/35">{group}</p><div className="space-y-1">{navigation.filter((item) => item.group === group).map((item) => nav(item))}</div></div>)}</nav>
				<div className="mt-5 border-t border-[#84B3CE]/20 pt-4"><Link href="/scan" className="flex items-center justify-between rounded-xl bg-[#F5EEDD] px-3 py-3 text-sm font-bold hover:bg-[#84B3CE]/25"><span>Buka kamera QR</span><span aria-hidden>↗</span></Link><form action={logoutAction} className="mt-2"><button className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#16587B]/60 hover:bg-[#F5EEDD] hover:text-[#16587B]">Keluar dari akun</button></form></div>
			</aside>

			<div className="min-w-0 flex-1">
				<header className="sticky top-0 z-20 border-b border-[#84B3CE]/20 bg-[#F5EEDD]/95 px-4 py-3 backdrop-blur-lg sm:px-7 md:px-10">
					<div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3 md:hidden"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#16587B] text-[10px] font-black text-white">MT</div><span className="text-sm font-black">MadiunTrip</span></div><p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-[#16587B]/45 md:block">Dashboard / {copy.title}</p><div className="ml-auto flex items-center gap-3"><span className="hidden max-w-56 truncate text-xs font-medium text-[#16587B]/60 sm:block">{data.email}</span><div className="flex items-center gap-2 rounded-full border border-[#84B3CE]/25 bg-white px-2.5 py-1.5"><span className="h-2 w-2 rounded-full bg-[#84B3CE]"/><span className="text-[10px] font-black uppercase tracking-wide">{data.role}</span></div></div></div>
					<nav aria-label="Navigasi dashboard ponsel" className="mt-3 flex gap-1 overflow-x-auto pb-1 md:hidden">{navigation.map((item) => nav(item, true))}<Link href="/scan" className="shrink-0 rounded-xl bg-[#16587B] px-3 py-2.5 text-xs font-bold text-white">Kamera QR ↗</Link><form action={logoutAction} className="shrink-0"><button className="rounded-xl border border-[#84B3CE]/30 bg-white px-3 py-2.5 text-xs font-bold">Keluar</button></form></nav>
				</header>

				<main className="px-4 py-7 sm:px-7 sm:py-9 md:px-10 md:py-10">
					<div className="mx-auto max-w-[1180px]">
						<div className="mb-7"><p className="text-[10px] font-black tracking-[0.2em] text-[#84B3CE]">{copy.eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{copy.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#16587B]/60">{copy.description}</p></div>
						{data.dataWarning && <div role="status" className="mb-6 rounded-2xl border border-[#84B3CE]/35 bg-white px-4 py-3 text-sm text-[#16587B]"><strong>Skema workspace belum lengkap.</strong> {data.dataWarning}</div>}
						{section === "overview" && <Overview data={data} onNavigate={setSection} />}
						{section === "destinations" && <DestinationsSection items={data.destinations} />}
						{section === "qr" && <QrSection destinations={data.destinations} points={data.qrPoints} />}
						{section === "partners" && <PartnersSection partners={data.partners} />}
						{section === "promotions" && <PromotionsSection campaigns={data.promotions} partners={data.partners} qrPoints={data.qrPoints} />}
						{section === "experiences" && <ExperiencesSection />}
						{section === "sessions" && <SessionsSection />}
						{section === "staff" && <StaffSection role={data.role} driveConnected={data.driveConnected} driveConfigured={data.driveConfigured} />}
						<footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#84B3CE]/20 pt-5 text-xs text-[#16587B]/45"><span>MadiunTrip · Ruang Pengelola</span><span>Editor dapat membuat, mengubah, dan menerbitkan konten.</span></footer>
					</div>
				</main>
			</div>
		</div>
	</div>;
}

function DriveIntegrationCard({ role, connected, configured, notice }: { role: "admin" | "editor"; connected: boolean; configured: boolean; notice?: string }) {
	const ready = configured && connected;
	return <div className="rounded-2xl border border-[#84B3CE]/25 bg-[#F5EEDD]/55 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ready ? "bg-emerald-600" : "bg-[#84B3CE]"}`} /><div><p className="font-bold text-[#16587B]">Google Drive · {ready ? "Terhubung" : configured ? "Belum terhubung" : "Perlu konfigurasi server"}</p><p className="mt-1 max-w-2xl text-xs leading-5 text-[#16587B]/65">Foto destinasi, mitra, dan promosi disimpan di folder MadiunTrip Assets. File gambar yang diunggah akan dapat dilihat publik.</p></div></div>{role === "admin" && (configured ? <a href="/api/admin/google-drive/connect" className="shrink-0 rounded-xl bg-[#16587B] px-4 py-3 text-center text-sm font-bold text-white hover:bg-[#104866]">{ready ? "Hubungkan ulang" : "Hubungkan Drive"}</a> : <span className="shrink-0 rounded-xl border border-[#84B3CE]/40 px-4 py-3 text-center text-xs font-semibold text-[#16587B]/65">Isi variabel server dahulu</span>)}</div>{notice && <p role="status" className="mt-4 rounded-xl border border-[#84B3CE]/30 bg-white px-4 py-3 text-sm leading-6 text-[#16587B]">{notice}</p>}</div>;
}

function Overview({ data, onNavigate }: { data: WorkspaceData; onNavigate: (section: Section) => void }) {
	return <div className="space-y-7">
		<DriveIntegrationCard role={data.role} connected={data.driveConnected} configured={data.driveConfigured} notice={data.driveNotice} />
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Destinasi" value={data.destinations.length} note={`${data.destinations.filter((item) => item.is_published).length} sudah terbit`} index="01"/><StatCard label="Titik QR" value={data.qrPoints.length} note="Lokasi pengalaman wisata" index="02"/><StatCard label="Mitra lokal" value={data.partners.length} note="UMKM dan layanan wisata" index="03"/><StatCard label="Kampanye" value={data.promotions.length} note={`${data.promotions.filter((item) => item.status === "published").length} sedang aktif`} index="04"/></div>
		<div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]"><Panel><SectionTitle title="Destinasi terbaru" description="Data yang baru masuk ke katalog pariwisata."/><DestinationList items={data.destinations.slice(0, 5)}/><button onClick={() => onNavigate("destinations")} className="mt-4 text-sm font-bold text-[#16587B] underline decoration-[#84B3CE] underline-offset-4">Kelola semua destinasi →</button></Panel><Panel className="bg-[#16587B] text-white"><p className="text-[10px] font-black tracking-[0.2em] text-[#84B3CE]">AKSI CEPAT</p><h2 className="mt-2 text-2xl font-black">Mulai kelola</h2><p className="mt-2 text-sm leading-6 text-white/65">Bangun informasi yang akurat sebelum mengaktifkan promosi dan pengalaman interaktif.</p><div className="mt-6 grid gap-2">{([ ["destinations", "Tambah destinasi"], ["partners", "Daftarkan mitra lokal"], ["qr", "Hubungkan titik QR"] ] as [Section, string][]).map(([target, label]) => <button key={target} onClick={() => onNavigate(target)} className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm font-bold transition hover:bg-white/10"><span>{label}</span><span>→</span></button>)}</div></Panel></div>
		<div className="rounded-3xl border border-[#84B3CE]/20 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] font-black tracking-[0.2em] text-[#84B3CE]">PENGALAMAN PENGUNJUNG</p><h2 className="mt-1 text-xl font-black">QR → Destinasi → Guest Session</h2><p className="mt-1 text-sm text-[#16587B]/60">Sesi guest otomatis dimulai ketika halaman destinasi dibuka.</p></div><Link href="/scan" className="rounded-xl bg-[#16587B] px-4 py-3 text-sm font-bold text-white">Buka scanner QR ↗</Link></div></div>
	</div>;
}

function DestinationsSection({ items }: { items: Destination[] }) {
	return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]"><Panel><SectionTitle title="Tambah destinasi" description="Alamat dan koordinat boleh dilengkapi bertahap."/><DestinationForm/></Panel><Panel><SectionTitle title="Daftar destinasi" description={`${items.length} data tersimpan`}/><DestinationList items={items}/></Panel></div>;
}

function QrSection({ destinations, points }: { destinations: Destination[]; points: QrPoint[] }) {
	return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><Panel><SectionTitle title="Daftarkan titik QR" description="Titik dapat dibuat tanpa koordinat dahulu; gunakan nama area yang mudah dikenali."/>{destinations.length ? <QrPointForm destinations={destinations.map(({ id, name, slug }) => ({ id, name, slug }))}/> : <EmptyRow>Tambahkan destinasi terlebih dahulu agar titik QR bisa ditautkan.</EmptyRow>}</Panel><Panel><SectionTitle title="Peta titik QR" description="Titik yang sudah terhubung ke destinasi."/>{points.length ? <div className="space-y-3">{points.map((point) => <div key={point.id} className="rounded-2xl border border-[#84B3CE]/20 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{point.name}</p><p className="mt-1 text-xs text-[#16587B]/55">{point.destination_name} · {point.code}</p><p className="mt-1 text-xs text-[#16587B]/55">{point.address || "Alamat pemasangan belum diisi"}</p></div><StatusPill muted={!point.is_active}>{point.is_active ? "Aktif" : "Nonaktif"}</StatusPill></div></div>)}</div> : <EmptyRow>Belum ada titik QR. Tambahkan lokasi pemasangan di formulir.</EmptyRow>}</Panel></div>;
}

function PartnersSection({ partners }: { partners: Partner[] }) {
	return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]"><Panel><SectionTitle title="Daftarkan mitra lokal" description="Profil UMKM dan penyedia layanan pariwisata."/><PartnerForm/></Panel><Panel><SectionTitle title="Mitra terdaftar" description={`${partners.length} mitra tersimpan`}/>{partners.length ? <div className="space-y-3">{partners.map((partner) => <div key={partner.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[#84B3CE]/20 p-4"><div><p className="font-bold">{partner.business_name}</p><p className="mt-1 text-xs text-[#16587B]/55">{partner.business_type} · /{partner.slug}</p><p className="mt-1 text-xs text-[#16587B]/55">{partner.address || "Alamat belum diisi"}</p></div><StatusPill muted={partner.status !== "active"}>{partner.status}</StatusPill></div>)}</div> : <EmptyRow>Belum ada mitra lokal yang didaftarkan.</EmptyRow>}</Panel></div>;
}

function PromotionsSection({ campaigns, partners, qrPoints }: { campaigns: Promotion[]; partners: Partner[]; qrPoints: QrPoint[] }) {
	return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]"><Panel><SectionTitle title="Buat kampanye promosi" description="Tentukan mitra, lokasi QR, jadwal, dan tujuan aktivasi."/>{partners.length && qrPoints.length ? <PromotionForm partners={partners.map(({ id, business_name }) => ({ id, business_name }))} qrPoints={qrPoints.map(({ id, name, code, destination_name }) => ({ id, name, code, destination_name }))}/> : <EmptyRow>Tambahkan minimal satu mitra lokal dan satu titik QR sebelum membuat kampanye.</EmptyRow>}</Panel><Panel><SectionTitle title="Kampanye tersimpan" description={`${campaigns.length} kampanye`}/>{campaigns.length ? <div className="space-y-3">{campaigns.map((campaign) => <div key={campaign.id} className="rounded-2xl border border-[#84B3CE]/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{campaign.title}</p><p className="mt-1 text-xs text-[#16587B]/55">{campaign.partner_name} · {campaign.qr_label}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#16587B]/60">{campaign.experience_type === "popup" ? "Popup" : campaign.experience_type === "minigame" ? "Minigame" : "Photobox"}</p></div><StatusPill muted={campaign.status !== "published"}>{campaign.status}</StatusPill></div></div>)}</div> : <EmptyRow>Belum ada kampanye. Lengkapi mitra dan titik QR lebih dulu.</EmptyRow>}</Panel></div>;
}

function ExperiencesSection() {
	const experiences = [ ["Maskot & karakter", "Unggah aset, ekspresi, dan variasi karakter."], ["AI Chat pariwisata", "Gunakan deskripsi dan sumber fakta destinasi."], ["Find Our Friends", "Atur karakter tersembunyi dan reward permainan."], ["Photobox", "Atur bingkai foto dan materi kampanye." ] ];
	return <div className="grid gap-4 md:grid-cols-2">{experiences.map(([title, text], i) => <Panel key={title}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black tracking-[0.15em] text-[#84B3CE]">MODUL PROTOTIPE 0{i+1}</p><h2 className="mt-2 text-xl font-black">{title}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#16587B]/60">{text}</p></div><StatusPill muted>Rencana</StatusPill></div><div className="mt-5 rounded-xl bg-[#F5EEDD]/70 px-4 py-3 text-xs text-[#16587B]/60">Engine modul menyusul setelah pengelolaan data wisata dan kampanye stabil.</div></Panel>)}</div>;
}

function SessionsSection() {
	return <Panel><div className="max-w-2xl"><p className="text-[10px] font-black tracking-[0.2em] text-[#84B3CE]">ALUR SESI OTOMATIS</p><h2 className="mt-2 text-2xl font-black">Pengunjung tidak perlu membuat akun</h2><p className="mt-3 text-sm leading-6 text-[#16587B]/65">Ketika pengunjung membuka halaman destinasi, aplikasi mencoba membuat atau melanjutkan sesi guest yang terkait dengan destinasi tersebut. Pengelolaan dan analitik sesi ditambahkan setelah tabel serta fungsi sesi di Supabase siap.</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{[["01", "Scan QR"], ["02", "Buka destinasi"], ["03", "Sesi guest aktif"]].map(([number, label]) => <div key={number} className="rounded-2xl bg-[#F5EEDD] p-4"><p className="text-xs font-black text-[#84B3CE]">{number}</p><p className="mt-3 text-sm font-bold">{label}</p></div>)}</div><Link href="/scan" className="mt-6 inline-flex rounded-xl bg-[#16587B] px-4 py-3 text-sm font-bold text-white">Coba scanner QR ↗</Link></div></Panel>;
}

function StaffSection({ role, driveConnected, driveConfigured }: { role: "admin" | "editor"; driveConnected: boolean; driveConfigured: boolean }) {
	return <div className="space-y-5"><Panel><SectionTitle title="Integrasi media" description="Pengaturan penyimpanan konten yang dipakai oleh seluruh petugas."/><DriveIntegrationCard role={role} connected={driveConnected} configured={driveConfigured} notice={undefined} /></Panel><Panel><SectionTitle title="Pembagian akses petugas" description="Aturan role yang dipakai workspace."/><div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl bg-[#F5EEDD] p-5"><StatusPill>Admin</StatusPill><ul className="mt-4 space-y-2 text-sm text-[#16587B]/75"><li>• Mengelola semua konten, kampanye, dan titik QR.</li><li>• Menghapus destinasi.</li><li>• Mengelola akun serta role petugas.</li><li>• Menghubungkan akun Google Drive media.</li></ul></div><div className="rounded-2xl border border-[#84B3CE]/30 p-5"><StatusPill muted>Editor</StatusPill><ul className="mt-4 space-y-2 text-sm text-[#16587B]/75"><li>• Membuat dan mengubah destinasi.</li><li>• Mengunggah gambar ke folder media Drive.</li><li>• Menerbitkan dan mengelola promosi.</li><li>• Tidak menghapus destinasi atau mengubah role.</li></ul></div></div>{role === "editor" && <p className="mt-4 text-xs text-[#16587B]/50">Pengelolaan akun petugas dan koneksi Google Drive hanya tersedia untuk admin.</p>}</Panel></div>;
}
