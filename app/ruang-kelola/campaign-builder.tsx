"use client";

import { useState } from "react";
import { createPromotionAction, type WorkspaceActionState } from "@/src/server/auth/actions";
import { getCampaignFormPreset, type CampaignFormPreset } from "@/src/features/campaigns/form-presets";
import type { CampaignFormBlock, CampaignInputType } from "@/src/features/campaigns/form-schema";
import { MediaUploadField } from "./media-upload-field";

type Mode = "nearby" | "find_friends" | "photobox" | "system" | "destination_feedback" | "website_feedback";
type Destination = { id: string; name: string; slug: string; latitude: number | null; longitude: number | null };
type Partner = { id: string; business_name: string; destination_id: string | null; latitude: number | null; longitude: number | null; allow_minigame_integration: boolean };
type Minigame = { id: string; name: string; slug: string; destination_id: string; destination_name: string; components: string[]; is_enabled: boolean };

const modes: { id: Mode; title: string; summary: string }[] = [
	{ id: "nearby", title: "Wisata terpilih", summary: "Popup di halaman wisata yang dipilih; bisa pilih beberapa." },
	{ id: "find_friends", title: "Titik bonus Find Our Friends", summary: "QR mitra dibuat otomatis sebagai titik bonus, tidak wajib untuk menuntaskan misi." },
	{ id: "photobox", title: "Frame Photobox", summary: "Tambahkan frame mitra ke studio Photobox pada program terpilih." },
	{ id: "system", title: "Umum · lintas halaman", summary: "Tanpa tautan wisata atau mitra; bisa muncul di halaman sistem dan objek wisata pilihan." },
	{ id: "destination_feedback", title: "Ulasan objek wisata", summary: "Form rating dan saran yang terhubung ke satu atau beberapa wisata." },
	{ id: "website_feedback", title: "Ulasan website", summary: "Form masukan website tanpa perlu menautkan ke wisata atau mitra." },
];

const presets: { id: CampaignFormPreset; label: string }[] = [
	{ id: "interest", label: "Minat pengunjung" }, { id: "offer", label: "Pilihan promo" }, { id: "suggestion", label: "Saran singkat" },
	{ id: "tourism_feedback", label: "Rating & saran wisata" }, { id: "website_feedback", label: "Rating & saran website" },
];
const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-[#84B3CE]/40 bg-white px-3 py-2 text-sm text-[#16587B] outline-none focus:border-[#16587B] focus:ring-4 focus:ring-[#84B3CE]/15";
const labelClass = "block text-xs font-bold text-[#16587B]/80";
const emptyState: WorkspaceActionState = {};

export function CampaignBuilder({ partners, destinations, minigames, initialDestinationId, initialDestinationName, initialDestinationSlug, destinationEventOnly = false }: {
	partners: Partner[]; destinations: Destination[]; minigames: Minigame[];
	initialDestinationId?: string; initialDestinationName?: string; initialDestinationSlug?: string;
	destinationEventOnly?: boolean;
}) {
	const [state, setState] = useState<WorkspaceActionState>(emptyState);
	const [pending, setPending] = useState(false);
	const [mode, setMode] = useState<Mode>(initialDestinationId ? "destination_feedback" : "nearby");
	const [partnerId, setPartnerId] = useState("");
	const [assignmentId, setAssignmentId] = useState("");
	const [exposureMode, setExposureMode] = useState<"chance" | "always">("chance");
	const [displayChance, setDisplayChance] = useState(35);
	const [formOpen, setFormOpen] = useState(Boolean(initialDestinationId));
	const [formPreset, setFormPreset] = useState<CampaignFormPreset>(initialDestinationId ? "tourism_feedback" : "none");
	const [blocks, setBlocks] = useState<CampaignFormBlock[]>(() => initialDestinationId ? getCampaignFormPreset("tourism_feedback") : []);
	const [frameUrl, setFrameUrl] = useState("");
	const [frameLayout, setFrameLayout] = useState("single");
	const [frameRatio, setFrameRatio] = useState("portrait");
	const [campaignTitle, setCampaignTitle] = useState(initialDestinationName ? `Ulasan ${initialDestinationName}` : "");
	const [campaignDescription, setCampaignDescription] = useState(initialDestinationName ? `Bagikan penilaian singkatmu tentang ${initialDestinationName}.` : "");
	const partner = partners.find((item) => item.id === partnerId);
	const minigameOptions = minigames.filter((item) => item.is_enabled && (mode === "find_friends" ? item.components.includes("find_friends") : item.components.includes("photobox")));
	const formJson = JSON.stringify(blocks);
	const selectedDestinationRequired = mode === "nearby" || mode === "destination_feedback";
	const title = modes.find((item) => item.id === mode)?.title ?? "Campaign";

	function chooseMode(nextMode: Mode) {
		setMode(nextMode); setAssignmentId("");
		setDisplayChance(nextMode === "system" ? 10 : 35);
		if (nextMode === "website_feedback") {
			setCampaignTitle("Masukan untuk website TiLoc"); setCampaignDescription("Bantu kami membuat website TiLoc lebih nyaman.");
			setFormOpen(true); setFormPreset("website_feedback"); setBlocks(getCampaignFormPreset("website_feedback"));
		} else if (nextMode === "destination_feedback") {
			setCampaignTitle(initialDestinationName ? `Ulasan ${initialDestinationName}` : "Ulasan objek wisata"); setCampaignDescription(initialDestinationName ? `Bagikan penilaian singkatmu tentang ${initialDestinationName}.` : "Bantu pengelola meningkatkan pengalaman di objek wisata ini.");
			setFormOpen(true); setFormPreset("tourism_feedback"); setBlocks(getCampaignFormPreset("tourism_feedback"));
		} else if (nextMode === "nearby" && initialDestinationName) {
			setCampaignTitle(`Pengalaman di ${initialDestinationName}`); setCampaignDescription("");
		}
	}
	function applyPreset(preset: CampaignFormPreset) {
		setFormPreset(preset); setBlocks(preset === "none" ? [] : getCampaignFormPreset(preset));
	}
	function updateBlock(id: string, update: Partial<CampaignFormBlock>) {
		setBlocks((current) => current.map((item) => item.id === id ? { ...item, ...update } as CampaignFormBlock : item));
	}
	function addBlock(type: CampaignFormBlock["type"]) {
		const id = `${type}_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
		const block: CampaignFormBlock = type === "label" ? { id, type, text: "Informasi singkat untuk pengunjung" }
			: type === "input" ? { id, type, label: "Pertanyaan singkat", placeholder: "Tulis jawaban…", inputType: "text", required: false, maxLength: 120 }
			: type === "choice" || type === "dropdown" ? { id, type, label: "Pilih salah satu", options: ["Pilihan 1", "Pilihan 2"], required: false }
			: { id, type: "button", label: "Kirim jawaban", action: "submit" };
		setBlocks((current) => [...current, block].slice(0, 12));
	}
	async function submit(formData: FormData) {
		setPending(true); setState({});
		formData.set("form_schema", formJson);
		formData.set("placement_mode", mode);
		formData.set("exposure_mode", exposureMode);
		formData.set("frame_url", frameUrl);
		formData.set("frame_layout", frameLayout);
		formData.set("frame_ratio", frameRatio);
		try { setState(await createPromotionAction(emptyState, formData)); }
		catch { setState({ error: "Campaign belum tersimpan. Periksa koneksi lalu coba lagi." }); }
		finally { setPending(false); }
	}
	const visibleDestinations = destinations.filter((item) => item.latitude !== null && item.longitude !== null);
	const formCount = blocks.filter((block) => block.type === "input" || block.type === "choice" || block.type === "dropdown").length;
	const quickNote = mode === "find_friends"
		? "Titik QR campaign menjadi bonus. Pengunjung tetap bisa menyelesaikan semua misi tanpa scan QR mitra."
		: mode === "photobox"
			? "Frame mitra dimasukkan ke daftar preset Photobox program yang dipilih."
			: mode === "system"
				? "Tidak perlu mitra atau objek wisata. Campaign umum bisa dipakai sebagai pengumuman, rating, atau promosi website."
				: mode === "website_feedback"
					? "Jawaban ulasan website tetap terpisah dari rating objek wisata."
					: "Pilih objek wisata tujuan; satu campaign boleh ditampilkan di beberapa wisata.";

	return <form action={submit} className="space-y-6">
		<input type="hidden" name="form_schema" value={formJson}/>
		<input type="hidden" name="placement_mode" value={mode}/>
		<input type="hidden" name="exposure_mode" value={exposureMode}/>
		<input type="hidden" name="frame_url" value={frameUrl}/>
		<input type="hidden" name="frame_layout" value={frameLayout}/>
		<input type="hidden" name="frame_ratio" value={frameRatio}/>
		{destinationEventOnly && <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 text-xs leading-5 text-violet-950"><strong className="block">Campaign acara wisata · perlu persetujuan admin</strong><span className="mt-1 block text-violet-950/70">Petugas Wisata dapat mengajukan pengumuman atau aktivitas umum untuk destinasi miliknya. Campaign baru tampil setelah disetujui.</span></div>}
		<section className="rounded-2xl border border-[#84B3CE]/30 bg-[#E0F2FE]/35 p-4 sm:p-5">
			<div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#16587B] text-xs font-black text-white">01</span><div><h3 className="text-sm font-black text-[#16587B]">Tujuan & penempatan campaign</h3><p className="mt-1 text-xs leading-5 text-[#16587B]/60">Pilih pengalaman dulu. Form berikutnya hanya menampilkan pengaturan yang dibutuhkan untuk jenis itu.</p></div></div>
			<div className="mt-4 grid gap-2 sm:grid-cols-2">{modes.filter((item) => !destinationEventOnly || item.id === "nearby").map((item) => <label key={item.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${mode === item.id ? "border-[#16587B] bg-white ring-2 ring-sky-200/70" : "border-[#84B3CE]/25 bg-white/55 hover:bg-white/90"}`}><input className="mt-1 accent-[#16587B]" type="radio" name="placement_mode_choice" value={item.id} checked={mode === item.id} onChange={() => chooseMode(item.id)}/><span><strong className="block text-xs text-[#16587B]">{item.title}</strong><span className="mt-1 block text-[11px] leading-4 text-[#16587B]/60">{item.summary}</span></span></label>)}</div>
			<p className="mt-3 rounded-xl bg-white/75 px-3 py-2.5 text-xs leading-5 text-[#16587B]/70">{quickNote}</p>
		</section>

		<section className="rounded-2xl border border-[#84B3CE]/25 p-4 sm:p-5">
			<div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-100 text-xs font-black text-[#16587B]">02</span><div><h3 className="text-sm font-black text-[#16587B]">Pilih tempat tampil</h3><p className="mt-1 text-xs leading-5 text-[#16587B]/60">Keterkaitan ke mitra atau objek wisata tidak wajib kecuali alur memerlukan QR atau frame.</p></div></div>
			{(mode === "find_friends" || mode === "photobox") && <div className="mt-4 space-y-4">
				<div><label className={labelClass} htmlFor="campaign-partner">Mitra lokal · {mode === "find_friends" ? "wajib untuk QR di lokasi usaha" : "opsional"}</label><select className={fieldClass} id="campaign-partner" name="partner_id" value={partnerId} required={mode === "find_friends"} onChange={(event) => { setPartnerId(event.currentTarget.value); setAssignmentId(""); }}><option value="">{mode === "find_friends" ? "Pilih mitra yang mengizinkan integrasi minigame" : "Tanpa mitra · campaign milik sistem"}</option>{partners.map((item) => <option key={item.id} value={item.id}>{item.business_name}{mode === "find_friends" && !item.allow_minigame_integration ? " · integrasi belum diizinkan" : ""}</option>)}</select>{mode === "find_friends" && partner && !partner.allow_minigame_integration && <p role="alert" className="mt-2 text-xs font-bold text-rose-700">Mitra ini belum mengizinkan QR bonus Find Our Friends. Aktifkan izinnya di halaman Mitra Lokal.</p>}</div>
				{mode === "find_friends" && partner && <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-xs leading-5 text-[#16587B]/75">QR campaign dibuat otomatis pada koordinat usaha dan hanya tersedia di wisata yang berjarak maksimal <strong>500 m</strong>. Titiknya bonus dan tidak menambah target misi wajib.</div>}
				<div><label className={labelClass} htmlFor="campaign-assignment">{mode === "find_friends" ? "Grup Find Our Friends *" : "Program dengan Photobox *"}</label><select className={fieldClass} id="campaign-assignment" name="assignment_id" value={assignmentId} required onChange={(event) => setAssignmentId(event.currentTarget.value)}><option value="">Pilih program minigame</option>{minigameOptions.map((item) => <option key={item.id} value={item.id}>{item.destination_name} · {item.name}</option>)}</select>{!minigameOptions.length && <p className="mt-2 text-xs text-amber-800">Belum ada program aktif dengan komponen yang sesuai. Atur programnya dahulu di menu Minigames.</p>}</div>
			</div>}
			{selectedDestinationRequired && <fieldset className="mt-4"><legend className={labelClass}>{mode === "destination_feedback" ? "Objek wisata yang dinilai * · boleh lebih dari satu" : "Objek wisata tempat popup tampil * · boleh lebih dari satu"}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{visibleDestinations.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-xl border border-[#84B3CE]/25 bg-white/65 p-3 text-xs font-semibold text-[#16587B]"><input type="checkbox" name="destination_ids" value={item.id} defaultChecked={item.id === initialDestinationId} className="h-4 w-4 accent-[#16587B]"/>{item.name}</label>)}</div>{!visibleDestinations.length && <p className="mt-2 text-xs text-amber-800">Tambahkan koordinat pada destinasi sebelum menautkan campaign.</p>}</fieldset>}
			{mode === "system" && <fieldset className="mt-4"><legend className={labelClass}>Tempat campaign umum tampil</legend><div className="mt-2 flex flex-wrap gap-2">{[["home", "Beranda"], ["scan", "Scan QR"], ["destination", "Semua halaman wisata"], ["minigame", "Minigame"], ["photobox", "Photobox"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded-full border border-[#84B3CE]/30 bg-white px-3 py-2 text-xs font-semibold text-[#16587B]"><input type="checkbox" name="system_pages" value={value} defaultChecked={value === "home" || value === "scan"} className="accent-[#16587B]"/>{label}</label>)}</div><p className="mt-2 text-[11px] text-[#16587B]/55">Campaign umum tidak perlu ditautkan ke mitra atau wisata. Pilih halaman utama dan halaman wisata yang boleh menampilkannya.</p></fieldset>}
			{mode === "nearby" && !destinationEventOnly && <div className="mt-4"><label className={labelClass} htmlFor="campaign-partner-nearby">Mitra pemilik campaign · opsional</label><select className={fieldClass} id="campaign-partner-nearby" name="partner_id" value={partnerId} onChange={(event) => setPartnerId(event.currentTarget.value)}><option value="">Campaign umum / milik sistem</option>{partners.map((item) => <option key={item.id} value={item.id}>{item.business_name}</option>)}</select></div>}
		</section>

		<section className="space-y-4 rounded-2xl border border-[#84B3CE]/25 p-4 sm:p-5">
			<div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-100 text-xs font-black text-[#16587B]">03</span><div><h3 className="text-sm font-black text-[#16587B]">Materi yang dilihat pengunjung</h3><p className="mt-1 text-xs leading-5 text-[#16587B]/60">Konten campaign dan jadwalnya. Campaign tidak perlu mitra untuk bisa dibuat.</p></div></div>
			<div className="grid gap-4 sm:grid-cols-2"><label className={labelClass} htmlFor="promotion-title">Nama campaign *<input className={fieldClass} id="promotion-title" name="title" required maxLength={160} value={campaignTitle} onChange={(event) => setCampaignTitle(event.currentTarget.value)} placeholder="Contoh: Ceritakan pengalamanmu"/></label><label className={labelClass} htmlFor="promotion-chance">Peluang tayang · persen<input className={fieldClass} id="promotion-chance" name="display_chance" type="number" min="0" max="100" step="5" value={displayChance} onChange={(event) => setDisplayChance(Number(event.currentTarget.value))} disabled={exposureMode === "always"}/></label></div>
			<div className="grid gap-4 sm:grid-cols-2"><label className={labelClass} htmlFor="promotion-description">Deskripsi singkat<textarea className={`${fieldClass} min-h-24 resize-y`} id="promotion-description" name="description" rows={3} maxLength={5000} value={campaignDescription} onChange={(event) => setCampaignDescription(event.currentTarget.value)} placeholder="Jelaskan manfaat atau alasan pengunjung membuka campaign ini."/></label><div className="space-y-3"><p className={labelClass}>Frekuensi tampil</p><label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#84B3CE]/25 bg-white p-3 text-xs text-[#16587B]"><input type="radio" name="exposure_mode_choice" checked={exposureMode === "chance"} onChange={() => setExposureMode("chance")} className="mt-0.5 accent-[#16587B]"/><span><strong className="block">Acak sesuai peluang</strong><span className="mt-1 block text-[11px] text-[#16587B]/60">Tidak mengganggu setiap kunjungan.</span></span></label><label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#84B3CE]/25 bg-white p-3 text-xs text-[#16587B]"><input type="radio" name="exposure_mode_choice" checked={exposureMode === "always"} onChange={() => setExposureMode("always")} className="mt-0.5 accent-[#16587B]"/><span><strong className="block">Selalu tersedia</strong><span className="mt-1 block text-[11px] text-[#16587B]/60">Selalu masuk pilihan yang sesuai target.</span></span></label></div></div>
			{mode === "photobox" && <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4"><p className="text-xs font-black text-[#16587B]">Frame mitra · preset Photobox</p><p className="mt-1 text-[11px] leading-4 text-[#16587B]/60">Unggah PNG transparan. Frame akan muncul sebagai preset di program yang dipilih.</p><div className="mt-3"><MediaUploadField folder="photobox" name="campaign-frame-upload" label="Unggah frame PNG / WebP *" onUrlChange={setFrameUrl}/></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Layout<select className={fieldClass} value={frameLayout} onChange={(event) => setFrameLayout(event.currentTarget.value)}><option value="single">1 foto</option><option value="strip2">2 foto</option><option value="grid6">Kolase 2×3</option><option value="travel_strip">Strip perjalanan · 3 foto</option><option value="memory_triptych">Kolase memori · 3 foto</option></select></label><label className={labelClass}>Rasio<select className={fieldClass} value={frameRatio} onChange={(event) => setFrameRatio(event.currentTarget.value)}><option value="portrait">Portrait 4:5</option><option value="story">Story 9:16</option><option value="square">Kotak 1:1</option></select></label></div>{frameUrl && <div className="mt-3 flex items-center gap-3 rounded-xl bg-white p-3"><img src={frameUrl} alt="Pratinjau frame campaign" className="h-20 w-16 object-contain"/><div className="text-xs font-bold text-[#16587B]">Pratinjau frame siap<span className="mt-1 block text-[10px] font-normal text-[#16587B]/55">{exposureMode === "always" ? "Selalu tersedia" : "Dapat ditampilkan sesuai peluang campaign"}</span></div></div>}</div>}
			<MediaUploadField folder="campaigns" name="image_url" label="Gambar promosi · opsional"/>
			<div className="grid gap-4 sm:grid-cols-2"><label className={labelClass} htmlFor="promotion-cta">Label tombol<input className={fieldClass} id="promotion-cta" name="cta_label" maxLength={60} placeholder="Lihat informasi"/></label><label className={labelClass} htmlFor="promotion-url">Tautan tombol<input className={fieldClass} id="promotion-url" name="cta_url" type="text" defaultValue={initialDestinationSlug ? `/wisata/${initialDestinationSlug}` : ""} placeholder="/wisata/nama-wisata atau https://…"/></label><label className={labelClass} htmlFor="promotion-start">Mulai tayang<input className={fieldClass} id="promotion-start" name="starts_at" type="date"/></label><label className={labelClass} htmlFor="promotion-end">Berakhir<input className={fieldClass} id="promotion-end" name="ends_at" type="date"/></label></div>
		</section>

		<section className="rounded-2xl border border-[#84B3CE]/25 p-4 sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-[#16587B]">04 · Form pengunjung <span className="font-medium text-[#16587B]/55">opsional</span></h3><p className="mt-1 text-xs text-[#16587B]/60">Pilih preset untuk mulai cepat; editor lanjutan bisa ditutup kembali.</p></div><button type="button" onClick={() => setFormOpen((open) => !open)} aria-expanded={formOpen} className="min-h-10 rounded-lg border border-[#84B3CE]/40 bg-white px-3 text-xs font-bold text-[#16587B]">{formOpen ? "Sembunyikan form" : blocks.length ? `Edit form · ${formCount} pertanyaan` : "+ Tambah form"}</button></div>
			{formOpen && <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]"><div className="space-y-4"><label className={labelClass} htmlFor="promotion-form-preset">Mulai dari preset<select className={fieldClass} id="promotion-form-preset" value={formPreset} onChange={(event) => applyPreset(event.currentTarget.value as CampaignFormPreset)}><option value="none">Form kosong</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label><div className="flex flex-wrap gap-2">{(["label", "input", "choice", "dropdown", "button"] as const).map((type) => <button key={type} type="button" disabled={blocks.length >= 12} onClick={() => addBlock(type)} className="min-h-9 rounded-lg border border-[#84B3CE]/35 bg-white px-3 text-xs font-bold text-[#16587B] disabled:opacity-40">+ {{ label: "Label", input: "Input", choice: "Pilihan", dropdown: "Dropdown", button: "Tombol" }[type]}</button>)}</div><div className="space-y-3">{blocks.map((block, index) => <fieldset key={block.id} className="rounded-xl border border-[#84B3CE]/25 bg-white/70 p-3"><div className="mb-2 flex items-center justify-between"><legend className="text-[10px] font-black uppercase text-[#16587B]/55">{index + 1} · {block.type}</legend><button type="button" onClick={() => setBlocks((current) => current.filter((item) => item.id !== block.id))} className="text-[10px] font-bold text-rose-700">Hapus</button></div>{block.type === "label" && <textarea aria-label="Teks informasi" className={fieldClass} value={block.text} maxLength={180} onChange={(event) => updateBlock(block.id, { text: event.currentTarget.value })}/>}{block.type === "input" && <div className="grid gap-2 sm:grid-cols-2"><label className={labelClass}>Label<input className={fieldClass} value={block.label} maxLength={80} onChange={(event) => updateBlock(block.id, { label: event.currentTarget.value })}/></label><label className={labelClass}>Placeholder<input className={fieldClass} value={block.placeholder} maxLength={100} onChange={(event) => updateBlock(block.id, { placeholder: event.currentTarget.value })}/></label><label className={labelClass}>Jenis input<select className={fieldClass} value={block.inputType} onChange={(event) => updateBlock(block.id, { inputType: event.currentTarget.value as CampaignInputType })}><option value="text">Teks</option><option value="email">Email</option><option value="tel">Telepon</option></select></label><label className="flex items-center gap-2 text-xs font-bold text-[#16587B]"><input type="checkbox" checked={block.required} onChange={(event) => updateBlock(block.id, { required: event.currentTarget.checked })}/>Wajib diisi</label></div>}{(block.type === "choice" || block.type === "dropdown") && <div className="grid gap-2 sm:grid-cols-2"><label className={labelClass}>Pertanyaan<input className={fieldClass} value={block.label} maxLength={80} onChange={(event) => updateBlock(block.id, { label: event.currentTarget.value })}/></label><label className={labelClass}>Pilihan · satu per baris<textarea className={fieldClass} rows={3} value={block.options.join("\n")} onChange={(event) => updateBlock(block.id, { options: event.currentTarget.value.split("\n").slice(0, 10) })}/></label><label className="flex items-center gap-2 text-xs font-bold text-[#16587B]"><input type="checkbox" checked={block.required} onChange={(event) => updateBlock(block.id, { required: event.currentTarget.checked })}/>Wajib dijawab</label></div>}{block.type === "button" && <div className="grid gap-2 sm:grid-cols-2"><label className={labelClass}>Label tombol<input className={fieldClass} value={block.label} maxLength={60} onChange={(event) => updateBlock(block.id, { label: event.currentTarget.value })}/></label><label className={labelClass}>Aksi<select className={fieldClass} value={block.action} onChange={(event) => updateBlock(block.id, event.currentTarget.value === "link" ? { action: "link", url: "/" } : { action: "submit" })}><option value="submit">Kirim jawaban</option><option value="link">Buka tautan</option></select></label>{block.action === "link" && <label className={labelClass}>Tautan<input className={fieldClass} value={block.url ?? ""} onChange={(event) => updateBlock(block.id, { url: event.currentTarget.value })}/></label>}</div>}</fieldset>)}</div><p className="text-[11px] text-[#16587B]/50">Maksimal 12 komponen per form. Hindari meminta data pribadi yang tidak dibutuhkan.</p></div><aside className="rounded-xl border border-[#84B3CE]/25 bg-sky-50/65 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-[#16587B]/55">Pratinjau ringkas</p><h4 className="mt-2 text-base font-black text-[#16587B]">{campaignTitle || "Judul campaign"}</h4><p className="mt-1 text-xs leading-5 text-[#16587B]/60">{campaignDescription || "Deskripsi campaign akan tampil di sini."}</p><div className="mt-4 space-y-3">{blocks.map((block) => block.type === "label" ? <p key={block.id} className="text-xs text-[#16587B]/70">{block.text}</p> : block.type === "input" ? <div key={block.id} className="text-[11px] font-bold text-[#16587B]">{block.label}<div className="mt-1 rounded-lg border border-[#84B3CE]/30 bg-white p-2 font-normal text-[#16587B]/40">{block.placeholder || "Jawaban"}</div></div> : block.type === "choice" || block.type === "dropdown" ? <div key={block.id} className="text-[11px] font-bold text-[#16587B]">{block.label}<div className="mt-1 rounded-lg bg-white p-2 font-normal text-[#16587B]/65">{block.options.slice(0, 3).join(" · ")}</div></div> : <div key={block.id} className="rounded-lg bg-[#16587B] p-2 text-center text-xs font-bold text-white">{block.label}</div>)}</div>{!blocks.length && <p className="mt-3 rounded-lg border border-dashed border-[#84B3CE]/40 p-3 text-xs text-[#16587B]/55">Pilih preset atau tambahkan pertanyaan.</p>}</aside></div>}
		</section>

		{destinationEventOnly ? <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-5 text-amber-950"><strong>Campaign masuk antrean admin.</strong> Petugas tidak dapat mengaktifkan campaign sendiri. Admin akan memeriksa materi dan destinasi sebelum tayang.</div> : <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900"><input className="mt-0.5 h-4 w-4 accent-emerald-700" type="checkbox" name="is_published"/><span><strong className="block">Aktifkan campaign setelah disimpan</strong><span className="mt-1 block text-[11px]">Campaign akan mengikuti target, jadwal, dan peluang tampil yang dipilih.</span></span></label>}
		{state.error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{state.error}</p>}
		{state.success && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{state.success}</p>}
		<div className="flex justify-end"><button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-[#16587B] px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">{pending ? "Menyimpan…" : "Simpan campaign"}</button></div>
	</form>;
}
