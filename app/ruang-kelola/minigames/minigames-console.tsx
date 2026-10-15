"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { MediaUploadField } from "@/app/ruang-kelola/media-upload-field";
import {
	configureTourismMinigameAssignmentAction,
	saveTourismMinigameProgramAction,
	type WorkspaceActionState,
} from "@/src/server/auth/actions";

type ComponentKey = "find_friends" | "photobox" | "chat_ai";
type LayoutKey = "single" | "strip2" | "grid6" | "travel_strip" | "memory_triptych";
type RatioKey = "portrait" | "story" | "square";
type Template = { id: string; name: string; layout: LayoutKey; ratio: RatioKey; frameUrl: string; enabled: boolean; source?: "preset" | "custom" };
type Program = { id: string; name: string; slug: string; is_enabled: boolean; components: ComponentKey[]; required_components: ComponentKey[]; default_photobox_access_mode?: "standalone" | "mission_reward"; created_at: string; updated_at: string };
type Assignment = { id: string; program_id: string; destination_id: string; is_enabled: boolean; components: ComponentKey[]; required_components: ComponentKey[]; photobox_access_mode: "standalone" | "mission_reward"; photobox_templates: Template[]; caption_template: string; max_caption_length: number; max_dependency_distance_meters: number };
type Destination = { id: string; name: string; slug: string; is_published: boolean };
type QrPoint = { id: string; destination_id: string; name: string; code: string; is_active: boolean };
type GroupPoint = { assignment_id: string; qr_point_id: string; is_required: boolean; friend_name: string | null; friend_image_url: string | null };
type Dependency = { assignment_id: string; qr_point_id: string; prerequisite_qr_point_id: string };
export type MinigameConsoleData = { role: "admin" | "editor"; programs: Program[]; assignments: Assignment[]; destinations: Destination[]; qrPoints: QrPoint[]; groupPoints: GroupPoint[]; dependencies: Dependency[] };

const componentMeta: Record<ComponentKey, { label: string; icon: string; note: string }> = {
	find_friends: { label: "Find Our Friends", icon: "🐾", note: "Grup QR dengan prasyarat antartitik." },
	photobox: { label: "Photobox", icon: "📸", note: "Kamera layar penuh, bingkai, kolase, dan share." },
	chat_ai: { label: "Chat AI", icon: "✨", note: "Pemandu destinasi; aktif secara default." },
};
const nonMissionComponents = new Set<ComponentKey>(["photobox", "chat_ai"]);
const missionComponentKeys = (components: ComponentKey[]) => components.filter((key) => !nonMissionComponents.has(key));
const defaultTemplates: Template[] = [
	{ id: "tiloc-twibon", name: "Twibon Jelajah", layout: "single", ratio: "portrait", frameUrl: "/photobox/frames/twibon.svg", enabled: true, source: "preset" },
	{ id: "retro-strip", name: "Retro 2 Foto", layout: "strip2", ratio: "story", frameUrl: "/photobox/frames/retro-strip.svg", enabled: true, source: "preset" },
	{ id: "postcard-grid", name: "Kolase 2×3", layout: "grid6", ratio: "square", frameUrl: "/photobox/frames/postcard-grid.svg", enabled: true, source: "preset" },
	{ id: "preset-travel-strip", name: "Jelajah TiLoc · Strip", layout: "travel_strip", ratio: "story", frameUrl: "/photobox/frames/presets_2_foto.png", enabled: true, source: "preset" },
	{ id: "preset-memory-triptych", name: "TiLoc Memory · Kolase", layout: "memory_triptych", ratio: "story", frameUrl: "/photobox/frames/presets_3_foto.png", enabled: true, source: "preset" },
];
const friendNameSuggestions = ["Kiko si Kijang", "Momo si Kelinci", "Bubu si Beruang", "Tutu si Kura-kura", "Lala si Lutung", "Piko si Tupai"];
const initialActionState: WorkspaceActionState = {};

function initialTemplates(saved: Template[] = []) {
	if (!saved.length) return defaultTemplates;
	const byId = new Map(saved.map((template) => [template.id, template]));
	const presets = defaultTemplates.map((preset) => {
		const current = byId.get(preset.id);
		return current ? { ...preset, name: current.name, layout: current.layout, ratio: current.ratio, frameUrl: current.frameUrl, enabled: current.enabled, source: "preset" as const } : { ...preset, enabled: false };
	});
	const custom = saved.filter((template) => !defaultTemplates.some((preset) => preset.id === template.id))
		.map((template) => ({ id: template.id, name: template.name, layout: template.layout, ratio: template.ratio, frameUrl: template.frameUrl, enabled: template.enabled, source: "custom" as const }));
	return [...presets, ...custom];
}

function StepHeading({ step, title, description }: { step: string; title: string; description: string }) {
	return <div className="mb-4 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#16587B] text-xs font-black text-white">{step}</span><div><h3 className="text-sm font-black text-[#16587B]">{title}</h3><p className="mt-1 text-xs leading-5 text-[#16587B]/60">{description}</p></div></div>;
}

function Feedback({ state }: { state: WorkspaceActionState }) {
	return state.error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{state.error}</p>
		: state.success ? <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{state.success}</p> : null;
}

function ProgramForm({ program, destinations, selectedDestinationIds = [] }: { program?: Program; destinations: Destination[]; selectedDestinationIds?: string[] }) {
	const [state, action, pending] = useActionState(saveTourismMinigameProgramAction, initialActionState);
	const router = useRouter();
	const refreshedAfterSave = useRef(false);
	const [name, setName] = useState(program?.name ?? "");
	const [slug, setSlug] = useState(program?.slug ?? "");
	const [slugEdited, setSlugEdited] = useState(Boolean(program));
	const [components, setComponents] = useState<ComponentKey[]>(program?.components ?? ["chat_ai"]);
	const [required, setRequired] = useState<ComponentKey[]>(() => missionComponentKeys(program?.required_components ?? []));
	const [photoboxAccessMode, setPhotoboxAccessMode] = useState<"standalone" | "mission_reward">(program?.default_photobox_access_mode ?? "standalone");
	const [selectedDestinations, setSelectedDestinations] = useState<string[]>(selectedDestinationIds);
	const [enabled, setEnabled] = useState(program?.is_enabled ?? false);
	const canUseGiftAccess = components.includes("photobox") && missionComponentKeys(required).some((key) => components.includes(key));
	useEffect(() => {
		setName(program?.name ?? "");
		setSlug(program?.slug ?? "");
		setSlugEdited(Boolean(program));
		setComponents(program?.components ?? ["chat_ai"]);
		setRequired(missionComponentKeys(program?.required_components ?? []));
		setPhotoboxAccessMode(program?.default_photobox_access_mode ?? "standalone");
		setSelectedDestinations(selectedDestinationIds);
		setEnabled(program?.is_enabled ?? false);
	}, [program?.id, program?.updated_at, selectedDestinationIds.join(",")]);
	useEffect(() => {
		if (!state.success || refreshedAfterSave.current) return;
		refreshedAfterSave.current = true;
		router.refresh();
	}, [state, router]);
	const slugify = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
	function toggleComponent(key: ComponentKey) {
		const removing = components.includes(key);
		setComponents((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
		if (key === "chat_ai") return;
		setRequired((current) => current.filter((item) => item !== key));
		if (removing && (key === "photobox" || (required.includes(key) && required.filter((item) => item !== key).length === 0))) setPhotoboxAccessMode("standalone");
	}
	function toggleRequired(key: ComponentKey) {
		const removingLastMission = required.includes(key) && required.length === 1;
		setRequired((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
		if (removingLastMission && photoboxAccessMode === "mission_reward") setPhotoboxAccessMode("standalone");
	}
	return <form action={action} onSubmit={() => { refreshedAfterSave.current = false; }} className="space-y-4">
		{program && <input type="hidden" name="program_id" value={program.id} />}
		<input type="hidden" name="default_photobox_access_mode" value={components.includes("photobox") && (photoboxAccessMode === "standalone" || canUseGiftAccess) ? photoboxAccessMode : "standalone"} />
		<section className="rounded-2xl border border-[#84B3CE]/25 bg-white/70 p-4 sm:p-5"><StepHeading step="01" title="Rancang program" description="Beri nama program, lalu tentukan game dan fitur yang dipakai." />
			<div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#16587B]/70">Nama program *</span><input required maxLength={120} name="program_name" value={name} onChange={(event) => { setName(event.currentTarget.value); if (!slugEdited) setSlug(slugify(event.currentTarget.value)); }} placeholder="Petualangan TILOC" className="w-full rounded-xl border border-[#84B3CE]/40 bg-white px-4 py-3 text-sm outline-none focus:border-[#16587B] focus:ring-4 focus:ring-[#84B3CE]/20" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#16587B]/70">ID program *</span><div className="flex rounded-xl border border-[#84B3CE]/40 bg-white"><span className="self-center pl-3 text-xs text-[#16587B]/45">/minigame/</span><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} name="program_slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.currentTarget.value)); }} placeholder="petualangan-tiloc" className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-3 text-sm outline-none" /></div></label></div>
			<fieldset className="mt-5"><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-[#16587B]/70">Komponen program</legend><div className="grid gap-3 md:grid-cols-3">{(Object.keys(componentMeta) as ComponentKey[]).map((key) => <label key={key} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${components.includes(key) ? "border-sky-400 bg-sky-50 shadow-sm" : "border-[#84B3CE]/25 bg-white/65"}`}><input type="checkbox" name="components" value={key} checked={components.includes(key)} onChange={() => toggleComponent(key)} className="mt-1 h-4 w-4 accent-[#16587B]" /><span><strong className="block text-sm text-[#16587B]">{componentMeta[key].icon} {componentMeta[key].label}</strong><span className="mt-1 block text-xs leading-5 text-[#16587B]/65">{componentMeta[key].note}</span></span></label>)}</div></fieldset>
		</section>
		<section className="rounded-2xl border border-amber-200 bg-amber-50/45 p-4 sm:p-5"><StepHeading step="02" title="Tentukan misi wajib" description="Misi yang ditandai wajib menentukan kapan program dianggap selesai. Photobox adalah hadiah atau fitur, bukan misi." />
			<div className="flex flex-wrap gap-2">{missionComponentKeys(components).map((key) => <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${required.includes(key) ? "border-amber-300 bg-amber-100 text-amber-950" : "border-[#84B3CE]/30 bg-white/80 text-[#16587B]/70"}`}><input name="required_components" type="checkbox" value={key} checked={required.includes(key)} onChange={() => toggleRequired(key)} className="h-3.5 w-3.5 accent-amber-600" />{componentMeta[key].label} wajib</label>)}{!missionComponentKeys(components).length && <span className="rounded-xl bg-white/70 px-3 py-2 text-xs text-[#16587B]/60">Tambahkan game misi untuk menentukan syarat program selesai.</span>}</div>
		</section>
		{components.includes("photobox") && <section className="rounded-2xl border border-rose-200 bg-rose-50/45 p-4 sm:p-5"><StepHeading step="03" title="Default akses Photobox" description="Photobox bukan misi. Tentukan akses awal untuk destinasi baru; tiap destinasi tetap dapat memakai aturan sendiri." />
			<label className="block max-w-2xl text-xs font-bold text-[#16587B]">Akses default<select value={canUseGiftAccess ? photoboxAccessMode : "standalone"} disabled={!canUseGiftAccess} onChange={(event) => setPhotoboxAccessMode(event.currentTarget.value as "standalone" | "mission_reward")} className="mt-1.5 w-full rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm"><option value="standalone">Bebas dibuka</option><option value="mission_reward">Hadiah setelah semua misi wajib selesai</option></select><span className="mt-1.5 block font-normal leading-5 text-[#16587B]/60">Mode hadiah berlaku untuk seluruh Photobox dan baru tersedia jika ada minimal satu misi wajib.</span></label>
		</section>}
		<section className="rounded-2xl border border-[#84B3CE]/25 bg-white/70 p-4 sm:p-5"><StepHeading step={components.includes("photobox") ? "04" : "03"} title="Pilih destinasi" description="Terapkan program ini ke destinasi. Aturan misi dan Photobox tetap bisa disesuaikan per destinasi." />
			<div className="grid max-h-52 gap-2 overflow-y-auto rounded-2xl border border-[#84B3CE]/25 bg-white/65 p-3 sm:grid-cols-2">{destinations.map((destination) => <label key={destination.id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-sky-50"><input type="checkbox" name="destination_ids" value={destination.id} checked={selectedDestinations.includes(destination.id)} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedDestinations((current) => checked ? [...current, destination.id] : current.filter((id) => id !== destination.id)); }} className="h-4 w-4 accent-[#16587B]" />{destination.name}{!destination.is_published && <span className="ml-auto text-[10px] text-amber-700">Draft</span>}</label>)}</div>
			<p className="mt-2 text-[11px] text-[#16587B]/55">Destinasi yang dipilih akan mendapat penerapan baru atau diperbarui mengikuti komponen program.</p>
			<label className="mt-4 flex items-center gap-2 text-sm font-bold text-[#16587B]"><input type="checkbox" name="is_enabled" checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} className="h-4 w-4 accent-emerald-600" />Aktifkan program untuk pengunjung</label>
		</section>
		<Feedback state={state} /><button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-[#16587B] px-6 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{pending ? "Menyimpan…" : program ? "Simpan program" : "Buat program minigame"}</button>
	</form>;
}

function AssignmentEditor({ program, assignment, destination, qrPoints, savedPoints, dependencies }: { program: Program; assignment: Assignment; destination: Destination; qrPoints: QrPoint[]; savedPoints: GroupPoint[]; dependencies: Dependency[] }) {
	const [state, action, pending] = useActionState(configureTourismMinigameAssignmentAction, initialActionState);
	const [editorOpen, setEditorOpen] = useState(false);
	const [focusPhotobox, setFocusPhotobox] = useState(false);
	const photoboxSectionRef = useRef<HTMLElement | null>(null);
	const pointIds = new Set(savedPoints.filter((item) => item.assignment_id === assignment.id).map((item) => item.qr_point_id));
	const dependencyRows = dependencies.filter((item) => item.assignment_id === assignment.id);
	const [selectedPoints, setSelectedPoints] = useState(() => qrPoints.filter((point) => point.destination_id === destination.id && pointIds.has(point.id)).map((point) => {
		const saved = savedPoints.find((item) => item.assignment_id === assignment.id && item.qr_point_id === point.id);
		return { qrPointId: point.id, isRequired: saved?.is_required ?? true, requires: dependencyRows.filter((item) => item.qr_point_id === point.id).map((item) => item.prerequisite_qr_point_id), friendName: saved?.friend_name ?? "", friendImageUrl: saved?.friend_image_url ?? "" };
	}));
	const availablePoints = qrPoints.filter((point) => point.destination_id === destination.id && point.is_active);
	const currentComponents = assignment.components?.length ? assignment.components : program.components;
	const [components, setComponents] = useState<ComponentKey[]>(currentComponents);
	const [requiredComponents, setRequiredComponents] = useState<ComponentKey[]>(() => missionComponentKeys(assignment.required_components ?? program.required_components ?? []));
	const [accessMode, setAccessMode] = useState(assignment.photobox_access_mode ?? "standalone");
	const [templates, setTemplates] = useState<Template[]>(() => initialTemplates(assignment.photobox_templates));
	const [captionTemplate, setCaptionTemplate] = useState(assignment.caption_template || "Kenangan seru di {destination}! #TiLoc");
	const [maxCaption, setMaxCaption] = useState(assignment.max_caption_length || 280);
	const [maxLinkDistance, setMaxLinkDistance] = useState(assignment.max_dependency_distance_meters || 1000);
	const canUseGiftAccess = components.includes("photobox") && missionComponentKeys(requiredComponents).some((key) => components.includes(key));
	const selectedSet = new Set(selectedPoints.map((point) => point.qrPointId));
	useEffect(() => {
		if (!editorOpen || !focusPhotobox || !components.includes("photobox")) return;
		photoboxSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		setFocusPhotobox(false);
	}, [components, editorOpen, focusPhotobox]);
	function toggleComponent(key: ComponentKey) {
		const removing = components.includes(key);
		setComponents((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
		if (key === "chat_ai") return;
		if (removing && (key === "photobox" || (requiredComponents.includes(key) && requiredComponents.length === 1))) setAccessMode("standalone");
		setRequiredComponents((current) => current.filter((item) => item !== key));
	}
	function toggleRequiredComponent(key: ComponentKey) {
		const removingLastMission = requiredComponents.includes(key) && requiredComponents.length === 1;
		setRequiredComponents((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
		if (removingLastMission && accessMode === "mission_reward") setAccessMode("standalone");
	}
	function updatePoint(id: string, change: Partial<(typeof selectedPoints)[number]>) { setSelectedPoints((current) => current.map((point) => point.qrPointId === id ? { ...point, ...change } : point)); }
	function addPoint(point: QrPoint) { setSelectedPoints((current) => current.some((item) => item.qrPointId === point.id) ? current : [...current, { qrPointId: point.id, isRequired: true, requires: [], friendName: "", friendImageUrl: "" }]); }
	function removePoint(id: string) { setSelectedPoints((current) => current.filter((point) => point.qrPointId !== id).map((point) => ({ ...point, requires: point.requires.filter((requiredId) => requiredId !== id) }))); }
	function addCustomTemplate() { setTemplates((current) => [...current, { id: `custom-${crypto.randomUUID()}`, name: "Bingkai custom", layout: "single", ratio: "portrait", frameUrl: "", enabled: true, source: "custom" }]); }
	function changeTemplate(index: number, patch: Partial<Template>) { setTemplates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
	function removeCustomTemplate(id: string) { setTemplates((current) => current.filter((item) => item.id !== id)); }
	function openPhotoboxSettings() {
		if (!program.components.includes("photobox")) return;
		setComponents((current) => current.includes("photobox") ? current : [...current, "photobox"]);
		setEditorOpen(true);
		setFocusPhotobox(true);
	}
	const serializedTemplates = JSON.stringify(templates.filter((item) => item.source !== "custom" || item.frameUrl.trim()));
		return <article className="overflow-hidden rounded-3xl border border-[#84B3CE]/25 bg-white/75 shadow-sm"><header className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6"><button type="button" onClick={() => setEditorOpen((open) => !open)} aria-expanded={editorOpen} className="min-w-0 text-left"><span className="block text-[10px] font-black uppercase tracking-[.16em] text-[#16587B]/50">PENERAPAN DESTINASI</span><strong className="mt-1 block text-xl font-black text-[#16587B]">{destination.name}</strong></button><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-black ${assignment.is_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{assignment.is_enabled ? "Aktif" : "Nonaktif"}</span>{components.includes("photobox") ? <button type="button" onClick={openPhotoboxSettings} title="Buka langsung pilihan preset dan upload gambar Photobox." className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-900 hover:bg-rose-100">🖼️ Atur gambar & frame Photobox</button> : <span title="Aktifkan komponen Photobox di pengaturan destinasi terlebih dahulu." className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">📸 Photobox belum aktif</span>}<button type="button" onClick={() => setEditorOpen((open) => !open)} className="min-h-10 rounded-xl bg-[#16587B] px-3 py-2 text-xs font-black text-white">{editorOpen ? "Tutup pengaturan" : "Pengaturan destinasi"}</button></div></header>
		<div hidden={!editorOpen}>
		<form action={action} className="space-y-6 border-t border-[#84B3CE]/20 p-5 sm:p-6">
			<input type="hidden" name="assignment_id" value={assignment.id} /><input type="hidden" name="find_points_json" value={JSON.stringify(selectedPoints)} /><input type="hidden" name="photobox_templates_json" value={serializedTemplates} /><input type="hidden" name="max_dependency_distance_meters" value={maxLinkDistance} /><datalist id={`friend-name-options-${assignment.id}`}>{friendNameSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
			<section className="rounded-2xl border border-sky-200 bg-sky-50/55 p-4 sm:p-5"><StepHeading step="01" title="Komponen destinasi" description="Aktifkan game dan fitur yang tersedia di destinasi ini." />
				<div className="flex flex-wrap gap-3"><label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#16587B]"><input type="checkbox" name="assignment_enabled" defaultChecked={assignment.is_enabled} className="h-4 w-4 accent-emerald-600" />Penerapan aktif</label>{(["find_friends", "photobox", "chat_ai"] as ComponentKey[]).filter((key) => program.components.includes(key)).map((key) => <label key={key} className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#16587B]"><input type="checkbox" name="assignment_components" value={key} checked={components.includes(key)} onChange={() => toggleComponent(key)} className="h-4 w-4 accent-[#16587B]" />{componentMeta[key].icon} {componentMeta[key].label}</label>)}</div>
			</section>
			<section className="rounded-2xl border border-amber-200 bg-amber-50/45 p-4 sm:p-5"><StepHeading step="02" title="Syarat program selesai" description="Tandai game yang wajib dituntaskan. Photobox tidak dihitung sebagai misi dan tidak bisa menjadi syarat wajib." />
				<div className="flex flex-wrap gap-2">{missionComponentKeys(components).map((key) => <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${requiredComponents.includes(key) ? "border-amber-300 bg-amber-100 text-amber-950" : "border-[#84B3CE]/30 bg-white/80 text-[#16587B]/70"}`}><input type="checkbox" name="assignment_required_components" value={key} checked={requiredComponents.includes(key)} onChange={() => toggleRequiredComponent(key)} className="h-4 w-4 accent-amber-600" />{componentMeta[key].label} wajib</label>)}{!missionComponentKeys(components).length && <span className="rounded-xl bg-white/70 px-3 py-2 text-xs text-[#16587B]/60">Tambahkan game misi jika program perlu syarat selesai.</span>}</div>
			</section>
			{components.includes("find_friends") && <section className="rounded-2xl border border-sky-200 bg-sky-50/55 p-4 sm:p-5"><StepHeading step="03" title="Grup Find Our Friends" description="Masukkan QR ke grup. Titik dengan prasyarat akan terbuka otomatis setelah QR yang dibutuhkan ditemukan." /><div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-2xl text-xs leading-5 text-[#16587B]/65">Pengunjung bisa memindai titik mana saja dulu. Atur relasi antartitik di bawah.</p><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#16587B]">{selectedPoints.length} titik masuk</span></div>
				<label className="mt-4 block max-w-sm text-xs font-bold text-[#16587B]/75">Jarak maksimum antar QR yang saling terhubung<input type="number" min={100} max={10000} step={100} value={maxLinkDistance} onChange={(event) => setMaxLinkDistance(Number(event.currentTarget.value))} className="mt-1.5 w-full rounded-xl border border-[#84B3CE]/35 bg-white px-3 py-2.5 text-sm text-[#16587B]"/><span className="mt-1 block font-normal leading-5 text-[#16587B]/55">Batas ini divalidasi saat menyimpan relasi. Ubah sesuai kondisi kawasan wisata.</span></label>
				<div className="mt-4 grid gap-2 sm:grid-cols-2">{availablePoints.map((point) => <button key={point.id} type="button" onClick={() => selectedSet.has(point.id) ? removePoint(point.id) : addPoint(point)} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${selectedSet.has(point.id) ? "border-sky-400 bg-white shadow-sm" : "border-white/80 bg-white/50 hover:bg-white"}`}><span><strong className="block text-sm text-[#16587B]">{point.name}</strong><span className="text-[10px] font-mono text-[#16587B]/50">{point.code}</span></span><span className={`grid h-7 w-7 place-items-center rounded-lg ${selectedSet.has(point.id) ? "bg-[#16587B] text-white" : "bg-sky-100 text-[#16587B]"}`}>{selectedSet.has(point.id) ? "✓" : "+"}</span></button>)}</div>
				{!availablePoints.length && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Belum ada QR aktif di destinasi ini. Tambahkan di menu Lokasi & titik QR.</p>}
				<div className="mt-4 space-y-3">{selectedPoints.map((entry, entryIndex) => { const point = availablePoints.find((item) => item.id === entry.qrPointId); return <article key={entry.qrPointId} className="rounded-2xl border border-[#84B3CE]/25 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-black text-[#16587B]">{point?.name ?? "Titik QR"}</h4><p className="text-[10px] font-mono text-[#16587B]/50">{point?.code}</p></div><button type="button" onClick={() => removePoint(entry.qrPointId)} className="rounded-full px-3 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50">Keluarkan</button></div>
					<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 text-xs font-bold text-[#16587B]"><input type="checkbox" checked={entry.isRequired} onChange={(event) => updatePoint(entry.qrPointId, { isRequired: event.currentTarget.checked })} className="h-4 w-4 accent-amber-600" />Titik wajib</label><label className="text-xs font-bold text-[#16587B]/70">Nama teman maskot (opsional)<input list={`friend-name-options-${assignment.id}`} value={entry.friendName} onChange={(event) => updatePoint(entry.qrPointId, { friendName: event.currentTarget.value })} maxLength={80} placeholder={`mis. ${friendNameSuggestions[entryIndex % friendNameSuggestions.length]}`} className="mt-1.5 w-full rounded-xl border border-[#84B3CE]/30 px-3 py-2 text-sm font-medium outline-none focus:border-[#16587B]" /></label></div>
					<fieldset className="mt-3 rounded-xl bg-sky-50/80 p-3"><legend className="px-1 text-[10px] font-black uppercase tracking-wide text-[#16587B]/70">Titik ini membutuhkan scan</legend><div className="flex flex-wrap gap-2">{selectedPoints.filter((other) => other.qrPointId !== entry.qrPointId).map((other) => { const otherPoint = availablePoints.find((item) => item.id === other.qrPointId); const selected = entry.requires.includes(other.qrPointId); return <label key={other.qrPointId} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold ${selected ? "border-sky-400 bg-white text-[#16587B]" : "border-transparent bg-white/55 text-[#16587B]/65"}`}><input type="checkbox" checked={selected} onChange={(event) => updatePoint(entry.qrPointId, { requires: event.currentTarget.checked ? [...entry.requires, other.qrPointId] : entry.requires.filter((id) => id !== other.qrPointId) })} className="h-3.5 w-3.5 accent-[#16587B]" />{otherPoint?.name ?? "QR"}</label>; })}{selectedPoints.length < 2 && <span className="text-[11px] text-[#16587B]/55">Tambahkan titik lain bila ada prasyarat.</span>}</div></fieldset>
				</article>; })}</div>
				<div className="mt-4 rounded-xl border border-sky-200 bg-white/70 p-3 text-xs leading-5 text-[#16587B]/75"><strong>Contoh relasi:</strong> A membutuhkan B, C membutuhkan B, dan D membutuhkan A. Jika D dipindai lebih awal, ia tersimpan sebagai tertunda sampai B dan A ditemukan.</div>
			</section>}
			{components.includes("photobox") && <section ref={photoboxSectionRef} id={`photobox-frames-${assignment.id}`} className="scroll-mt-6 rounded-2xl border border-rose-200 bg-rose-50/45 p-4 sm:p-5"><StepHeading step={components.includes("find_friends") ? "04" : "03"} title="Photobox & bingkai" description="Atur akses sekali untuk seluruh Photobox, lalu pilih frame yang tersedia. Mode hadiah terbuka setelah semua misi wajib selesai." /><div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-3xl text-xs leading-5 text-[#16587B]/65">Pengunjung memilih satu dari frame yang aktif saat membuka studio. Pengaturan hadiah di bawah berlaku untuk semua frame, bukan per frame.</p><span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#16587B]">{templates.filter((item) => item.enabled && (item.source !== "custom" || item.frameUrl.trim())).length} aktif · maksimal 12</span></div>
				<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{templates.map((template, index) => <article key={template.id} className={`overflow-hidden rounded-2xl border bg-white transition ${template.enabled ? "border-rose-300 shadow-sm" : "border-[#84B3CE]/25 opacity-75"}`}><div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-sky-50 to-amber-50 p-3">{template.frameUrl ? <img src={template.frameUrl} alt={`Pratinjau ${template.name}`} className="h-full max-w-full object-contain" /> : <span className="text-center text-xs font-semibold text-[#16587B]/50">Pratinjau muncul setelah frame diunggah</span>}<span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${template.source === "custom" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>{template.source === "custom" ? "Kustom · Drive" : "Preset web"}</span><span className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${template.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{template.enabled ? "Aktif" : "Nonaktif"}</span></div>
					<div className="space-y-3 p-3">{template.source === "custom" ? <><label className="block text-[10px] font-bold uppercase tracking-wide text-[#16587B]/65">Nama frame<input value={template.name} maxLength={80} onChange={(event) => changeTemplate(index, { name: event.currentTarget.value })} className="mt-1 w-full rounded-xl border border-[#84B3CE]/30 px-3 py-2 text-sm normal-case" /></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold uppercase tracking-wide text-[#16587B]/65">Layout<select value={template.layout} onChange={(event) => changeTemplate(index, { layout: event.currentTarget.value as LayoutKey })} className="mt-1 w-full rounded-xl border border-[#84B3CE]/30 bg-white px-2 py-2 text-xs normal-case"><option value="single">1 foto</option><option value="strip2">2 foto</option><option value="grid6">Kolase 2×3</option></select></label><label className="text-[10px] font-bold uppercase tracking-wide text-[#16587B]/65">Rasio<select value={template.ratio} onChange={(event) => changeTemplate(index, { ratio: event.currentTarget.value as RatioKey })} className="mt-1 w-full rounded-xl border border-[#84B3CE]/30 bg-white px-2 py-2 text-xs normal-case"><option value="portrait">Portrait 4:5</option><option value="story">Story 9:16</option><option value="square">Kotak 1:1</option></select></label></div><MediaUploadField folder="photobox" name={`custom-frame-${assignment.id}-${template.id}`} label="Upload frame kustom ke Google Drive" defaultUrl={template.frameUrl} onUrlChange={(url) => changeTemplate(index, { frameUrl: url })} /></> : <div><strong className="block text-sm text-[#16587B]">{template.name}</strong><span className="text-[10px] text-[#16587B]/55">{template.layout === "single" ? "1 foto" : template.layout === "strip2" ? "2 foto" : template.layout === "travel_strip" ? "3 foto · strip perjalanan" : template.layout === "memory_triptych" ? "3 foto · kolase memori" : "Kolase 2×3"} · {template.layout === "travel_strip" ? "1:3" : template.ratio === "portrait" ? "4:5" : template.ratio === "story" ? "9:16" : "1:1"}</span></div>}
						<div className="border-t border-[#84B3CE]/15 pt-3"><label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-[#16587B]"><input type="checkbox" checked={template.enabled} onChange={(event) => changeTemplate(index, { enabled: event.currentTarget.checked })} className="h-4 w-4 accent-emerald-600" />Tampilkan frame ini di studio pengunjung</label></div>{template.source === "custom" && <button type="button" onClick={() => removeCustomTemplate(template.id)} className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-bold text-rose-600 hover:bg-rose-50">Hapus frame kustom</button>}</div>
				</article>)}</div>
				<button type="button" onClick={addCustomTemplate} disabled={templates.length >= 12} className="mt-3 rounded-xl border border-dashed border-rose-300 px-4 py-2.5 text-xs font-black text-rose-800 hover:bg-white disabled:opacity-50">＋ Tambah frame kustom</button>
				<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[#16587B]">Akses Photobox destinasi ini<select value={canUseGiftAccess ? accessMode : "standalone"} disabled={!canUseGiftAccess} onChange={(event) => setAccessMode(event.currentTarget.value as "standalone" | "mission_reward")} className="mt-1.5 w-full rounded-xl border border-[#84B3CE]/35 bg-white px-3 py-3 text-sm"><option value="standalone">Bebas dibuka</option><option value="mission_reward">Hadiah setelah semua misi wajib selesai</option></select><span className="mt-1 block font-normal text-[#16587B]/55">{canUseGiftAccess ? "Aturan khusus destinasi ini. Semua frame aktif terbuka setelah seluruh misi wajib selesai." : "Pilih minimal satu game sebagai misi wajib untuk membuka opsi hadiah."}</span></label><label className="text-xs font-bold text-[#16587B]">Batas karakter caption<input type="number" min={40} max={1000} value={maxCaption} onChange={(event) => setMaxCaption(Number(event.currentTarget.value))} className="mt-1.5 w-full rounded-xl border border-[#84B3CE]/35 bg-white px-3 py-3 text-sm" /></label><label className="text-xs font-bold text-[#16587B] sm:col-span-2">Caption awal<input name="caption_template_visible" value={captionTemplate} onChange={(event) => setCaptionTemplate(event.currentTarget.value)} maxLength={500} placeholder="Kenangan seru di {destination}! #TiLoc" className="mt-1.5 w-full rounded-xl border border-[#84B3CE]/35 bg-white px-3 py-3 text-sm font-medium" /><input type="hidden" name="caption_template" value={captionTemplate} /><span className="mt-1 block font-normal text-[#16587B]/55">Gunakan <code>{"{destination}"}</code> untuk nama wisata.</span></label></div>
				</section>}
			<Feedback state={state} /><button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-[#16587B] px-6 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{pending ? "Menyimpan…" : "Simpan pengaturan destinasi"}</button>
		</form></div></article>;
}

export default function MinigamesConsole({ data }: { data: MinigameConsoleData }) {
	const [showCreate, setShowCreate] = useState(data.programs.length === 0);
	const assignmentsByProgram = new Map(data.programs.map((program) => [program.id, data.assignments.filter((assignment) => assignment.program_id === program.id)]));
	return <main className="min-h-dvh bg-[radial-gradient(circle_at_10%_0%,#d8f1ff_0,transparent_32%),radial-gradient(circle_at_100%_10%,#ffe9d6_0,transparent_30%),linear-gradient(135deg,#f5eedd,#eff8fb_60%,#f8fafc)] px-4 py-6 text-[#16587B] sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl">
		<header className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><Link href="/ruang-kelola" className="text-sm font-bold text-[#16587B]/65 hover:text-[#16587B]">← Ruang Pengelola</Link><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-sky-700">GAME DESIGN STUDIO · TILOC</p><h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Minigames<span className="text-amber-500"> ✨</span></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#16587B]/70 sm:text-base">Buat program minigame sekali, lalu terapkan ke destinasi yang dipilih. Tiap destinasi memiliki grup QR dan konfigurasi Photobox sendiri.</p></div><button type="button" onClick={() => setShowCreate((value) => !value)} className="min-h-12 rounded-2xl bg-[#16587B] px-5 py-3 text-sm font-black text-white shadow-lg hover:-translate-y-0.5">{showCreate ? "Tutup form" : "＋ Buat minigame"}</button></header>
		{showCreate && <section className="mb-8 overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-[0_25px_80px_-45px_rgba(22,88,123,.45)] backdrop-blur sm:p-8"><div className="mb-6 flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-100 to-amber-100 text-3xl">🕹️</span><div><h2 className="text-2xl font-black">{data.programs.length ? "Program baru" : "Rancang pengalaman pertama"}</h2><p className="mt-1 text-sm text-[#16587B]/65">Komponen bisa berdiri sendiri atau digabung.</p></div></div><ProgramForm destinations={data.destinations} /></section>}
		<section className="space-y-5"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#16587B]/50">LIBRARY PROGRAM</p><h2 className="mt-1 text-2xl font-black">Program minigame</h2></div><span className="rounded-full border border-white bg-white/75 px-3 py-1.5 text-xs font-bold">{data.programs.length} program</span></div>
		{data.programs.map((program) => <article key={program.id} className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 shadow-[0_20px_70px_-45px_rgba(22,88,123,.4)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#84B3CE]/20 bg-white/50 p-5 sm:p-6"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#16587B]/50">/{program.slug}</p><h3 className="mt-1 text-2xl font-black">{program.name}</h3><div className="mt-3 flex flex-wrap gap-2">{program.components.map((key) => <span key={key} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold">{componentMeta[key].icon} {componentMeta[key].label}</span>)}</div></div><span className={`rounded-full px-4 py-2 text-xs font-black ${program.is_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{program.is_enabled ? "● Program aktif" : "Program nonaktif"}</span></div>
			<div className="space-y-4 p-4 sm:p-6"><details className="rounded-2xl border border-[#84B3CE]/25 bg-white/80"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-black">✏️ Edit nama, komponen, dan destinasi</summary><div className="border-t border-[#84B3CE]/20 p-4"><ProgramForm program={program} destinations={data.destinations} selectedDestinationIds={(assignmentsByProgram.get(program.id) ?? []).filter((assignment) => assignment.is_enabled).map((assignment) => assignment.destination_id)} /></div></details>
			{(assignmentsByProgram.get(program.id) ?? []).map((assignment) => { const destination = data.destinations.find((item) => item.id === assignment.destination_id); return destination ? <AssignmentEditor key={assignment.id} program={program} assignment={assignment} destination={destination} qrPoints={data.qrPoints} savedPoints={data.groupPoints} dependencies={data.dependencies} /> : null; })}
			{!(assignmentsByProgram.get(program.id) ?? []).length && <p className="rounded-2xl border border-dashed border-[#84B3CE]/40 p-5 text-center text-sm text-[#16587B]/60">Program ini belum diterapkan ke destinasi. Edit program dan pilih destinasi di atas.</p>}</div></article>)}
		{!data.programs.length && <div className="rounded-3xl border border-dashed border-[#84B3CE]/45 bg-white/50 p-10 text-center"><div className="text-5xl">🧩</div><h3 className="mt-4 text-xl font-black">Belum ada program minigame</h3><p className="mt-2 text-sm text-[#16587B]/65">Buat satu program untuk mulai mengatur komponen dan kelompok destinasi.</p></div>}</section>
		<footer className="mt-10 border-t border-white/70 pt-5 text-center text-xs font-semibold text-[#16587B]/50">Find Our Friends adalah grup relasi QR. Siklus prasyarat ditolak agar progres selalu bisa dituntaskan.</footer>
	</div></main>;
}
