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
import {
	minigameComponentRegistry,
	missionComponentKeys,
	type MinigameComponentKey,
} from "@/src/features/minigames/registry";

type ComponentKey = MinigameComponentKey;
type LayoutKey = "single" | "strip2" | "grid6" | "travel_strip" | "memory_triptych";
type RatioKey = "portrait" | "story" | "square";
type Template = { id: string; name: string; layout: LayoutKey; ratio: RatioKey; frameUrl: string; enabled: boolean; source?: "preset" | "custom" | "campaign"; campaignId?: string; displayChance?: number; alwaysShow?: boolean };
type Program = { id: string; name: string; slug: string; is_enabled: boolean; components: ComponentKey[]; required_components: ComponentKey[]; default_photobox_access_mode?: "standalone" | "mission_reward"; photobox_templates?: Template[]; ai_is_mission?: boolean; photobox_is_mission?: boolean; completion_effect?: "none" | "confetti" | "sparkles" | "fireworks"; created_at: string; updated_at: string; created_by?: string | null };
type Assignment = { id: string; program_id: string; destination_id: string; is_enabled: boolean; is_selected: boolean; components: ComponentKey[]; required_components: ComponentKey[]; photobox_access_mode: "standalone" | "mission_reward"; photobox_templates: Template[]; caption_template: string; max_caption_length: number; max_dependency_distance_meters: number };
type Destination = { id: string; name: string; slug: string; is_published: boolean };
type QrPoint = { id: string; destination_id: string; name: string; code: string; is_active: boolean };
type GroupPoint = { assignment_id: string; qr_point_id: string; is_required: boolean; friend_name: string | null; friend_image_url: string | null };
type Dependency = { assignment_id: string; qr_point_id: string; prerequisite_qr_point_id: string };
export type MinigameConsoleData = { role: "admin" | "editor" | "destination_manager"; userId: string; programs: Program[]; assignments: Assignment[]; destinations: Destination[]; qrPoints: QrPoint[]; groupPoints: GroupPoint[]; dependencies: Dependency[] };

const componentMeta = minigameComponentRegistry;
const defaultTemplates: Template[] = [
	{ id: "tiloc-twibon", name: "Twibon Jelajah", layout: "single", ratio: "portrait", frameUrl: "/photobox/frames/twibon.svg", enabled: true, source: "preset" },
	{ id: "retro-strip", name: "Retro 2 Foto", layout: "strip2", ratio: "story", frameUrl: "/photobox/frames/retro-strip.svg", enabled: true, source: "preset" },
	{ id: "postcard-grid", name: "Kolase 2×3", layout: "grid6", ratio: "square", frameUrl: "/photobox/frames/postcard-grid.svg", enabled: true, source: "preset" },
	{ id: "preset-travel-strip", name: "Jelajah TiLoc! · Strip", layout: "travel_strip", ratio: "story", frameUrl: "/photobox/frames/presets_2_foto.png", enabled: true, source: "preset" },
	{ id: "preset-memory-triptych", name: "TiLoc! Memory · Kolase", layout: "memory_triptych", ratio: "story", frameUrl: "/photobox/frames/presets_3_foto.png", enabled: true, source: "preset" },
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
	const custom = saved.filter((template) => template.source !== "campaign" && !defaultTemplates.some((preset) => preset.id === template.id))
		.map((template) => ({ id: template.id, name: template.name, layout: template.layout, ratio: template.ratio, frameUrl: template.frameUrl, enabled: template.enabled, source: "custom" as const }));
	const campaign = saved.filter((template) => template.source === "campaign").map((template) => ({ ...template, source: "campaign" as const }));
	return [...presets, ...custom, ...campaign];
}

function StepHeading({ step, title, description }: { step: string; title: string; description: string }) {
	return <div className="mb-4 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 -rotate-3 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-800 text-xs font-black text-white shadow-md">{step}</span><div><h3 className="text-sm font-black text-sky-950 dark:text-sky-100">{title}</h3><p className="mt-1 text-xs leading-5 text-sky-950/60 dark:text-sky-100/60">{description}</p></div></div>;
}

function Feedback({ state }: { state: WorkspaceActionState }) {
	return state.error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{state.error}</p>
		: state.success ? <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{state.success}</p> : null;
}

function ProgramForm({ program, isPetugas = false }: { program?: Program; isPetugas?: boolean }) {
	const [state, action, pending] = useActionState(saveTourismMinigameProgramAction, initialActionState);
	const router = useRouter();
	const refreshedAfterSave = useRef(false);
	const [name, setName] = useState(program?.name ?? "");
	const [slug, setSlug] = useState(program?.slug ?? "");
	const [slugEdited, setSlugEdited] = useState(Boolean(program));
	const [components, setComponents] = useState<ComponentKey[]>(program?.components ?? ["find_friends", "chat_ai"]);
	const [required, setRequired] = useState<ComponentKey[]>(program ? missionComponentKeys(program.required_components ?? []) : ["find_friends"]);
	const [templates, setTemplates] = useState<Template[]>(() => initialTemplates(program?.photobox_templates ?? []));
	const [aiIsMission, setAiIsMission] = useState(program?.ai_is_mission ?? false);
	const [photoboxIsMission, setPhotoboxIsMission] = useState(program?.photobox_is_mission ?? false);
	const [accessMode, setAccessMode] = useState<"standalone" | "mission_reward">(program?.default_photobox_access_mode ?? "standalone");
	const [completionEffect, setCompletionEffect] = useState<NonNullable<Program["completion_effect"]>>(program?.completion_effect ?? "none");
	const [enabled, setEnabled] = useState(program?.is_enabled ?? false);
	const canGiftPhotobox = components.includes("photobox") && !photoboxIsMission && (required.includes("find_friends") || aiIsMission);
	const hasWinCondition = required.includes("find_friends") || aiIsMission || photoboxIsMission;
	const visibleTemplates = templates.filter((template) => template.source !== "campaign");
	const serializedTemplates = JSON.stringify(visibleTemplates);
	useEffect(() => {
		setName(program?.name ?? ""); setSlug(program?.slug ?? ""); setSlugEdited(Boolean(program));
		setComponents(program?.components ?? ["find_friends", "chat_ai"]);
		setRequired(program ? missionComponentKeys(program.required_components ?? []) : ["find_friends"]);
		setTemplates(initialTemplates(program?.photobox_templates ?? []));
		setAiIsMission(program?.ai_is_mission ?? false); setPhotoboxIsMission(program?.photobox_is_mission ?? false);
		setAccessMode(program?.default_photobox_access_mode ?? "standalone");
		setCompletionEffect(program?.completion_effect ?? "none"); setEnabled(program?.is_enabled ?? false);
	}, [program?.id, program?.updated_at]);
	useEffect(() => { if (state.success && !refreshedAfterSave.current) { refreshedAfterSave.current = true; router.refresh(); } }, [state, router]);
	const slugify = (text: string) => text.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
	function toggleComponent(key: ComponentKey) {
		const removing = components.includes(key);
		setComponents((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
		if (removing) {
			if (key === "find_friends") setRequired((current) => current.filter((item) => item !== key));
			if (key === "chat_ai") setAiIsMission(false);
			if (key === "photobox") { setPhotoboxIsMission(false); setAccessMode("standalone"); }
		}
	}
	function addCustomTemplate() {
		setTemplates((current) => [...current, { id: `custom-${crypto.randomUUID()}`, name: "Bingkai kustom", layout: "single", ratio: "portrait", frameUrl: "", enabled: true, source: "custom" }]);
	}
	function changeTemplate(id: string, patch: Partial<Template>) {
		setTemplates((current) => current.map((template) => template.id === id ? { ...template, ...patch } : template));
	}
	return <form action={action} onSubmit={() => { refreshedAfterSave.current = false; }} className="space-y-5">
		{program && <input type="hidden" name="program_id" value={program.id} />}
		<input type="hidden" name="photobox_templates_json" value={serializedTemplates} />
		<input type="hidden" name="default_photobox_access_mode" value={canGiftPhotobox && accessMode === "mission_reward" ? "mission_reward" : "standalone"} />
		<section className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block"><span className="form-label">Nama minigame *</span><input required maxLength={120} name="program_name" value={name} onChange={(event) => { const next = event.currentTarget.value; setName(next); if (!slugEdited) setSlug(slugify(next)); }} placeholder="Petualangan TiLoc!" className="form-input w-full" /></label>
				<label className="block"><span className="form-label">ID minigame *</span><span className="flex items-center rounded-xl border border-sky-200 bg-white dark:border-sky-100/10 dark:bg-slate-900"><span className="pl-3 text-xs text-sky-900/45 dark:text-sky-100/45">/minigame/</span><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} name="program_slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.currentTarget.value)); }} placeholder="petualangan-tiloc" className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-3 text-sm outline-none dark:text-white" /></span></label>
			</div>
			<fieldset><legend className="mb-2 text-xs font-black uppercase tracking-wide text-sky-900/65 dark:text-sky-100/65">Games</legend><div className="grid gap-3 md:grid-cols-3">{(Object.keys(componentMeta) as ComponentKey[]).map((key) => <label key={key} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${components.includes(key) ? "border-sky-400 bg-sky-50 shadow-sm dark:bg-sky-950/55" : "border-sky-200/60 bg-white/65 dark:border-sky-100/10 dark:bg-slate-900/40"}`}><input type="checkbox" name="components" value={key} checked={components.includes(key)} onChange={() => toggleComponent(key)} className="mt-1 h-4 w-4 accent-sky-700" /><span><strong className="block text-sm text-sky-950 dark:text-sky-50">{componentMeta[key].icon} {componentMeta[key].label}</strong><span className="mt-1 block text-xs leading-5 text-sky-900/60 dark:text-sky-100/60">{key === "chat_ai" ? "Aktif secara default; bisa disembunyikan untuk program ini." : componentMeta[key].note}</span></span></label>)}</div></fieldset>
			<div className="grid gap-3 sm:grid-cols-2">
				{components.includes("find_friends") && <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-sky-200/60 bg-white/70 p-3 text-xs font-bold text-sky-950 dark:border-sky-100/10 dark:bg-slate-900/40 dark:text-sky-100"><input className="mt-0.5 h-4 w-4 accent-sky-700" type="checkbox" name="required_components" value="find_friends" checked={required.includes("find_friends")} onChange={() => setRequired((current) => current.includes("find_friends") ? current.filter((item) => item !== "find_friends") : [...current, "find_friends"])} />Find Our Friends jadi misi wajib</label>}
				{components.includes("chat_ai") && <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-violet-200/60 bg-violet-50/60 p-3 text-xs font-bold text-violet-950 dark:border-violet-100/10 dark:bg-violet-950/25 dark:text-violet-100"><input className="mt-0.5 h-4 w-4 accent-violet-700" type="checkbox" name="ai_is_mission" value="on" checked={aiIsMission} onChange={(event) => setAiIsMission(event.currentTarget.checked)} />AI jadi misi · pengunjung bertanya minimal satu kali</label>}
			</div>
		</section>
		{components.includes("photobox") && <section className="border-t border-rose-200/70 pt-5 dark:border-rose-200/10"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-black text-sky-950 dark:text-sky-100">Frame Photobox</h3><p className="mt-1 text-xs text-sky-900/60 dark:text-sky-100/60">Pilihan ini berlaku untuk seluruh wisata yang mengikuti minigame.</p></div><button type="button" onClick={addCustomTemplate} disabled={templates.length >= 12} className="min-h-9 rounded-lg border border-dashed border-rose-300 px-3 text-xs font-black text-rose-800 hover:bg-rose-50 disabled:opacity-50">＋ Frame kustom</button></div>
			<div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleTemplates.map((template) => <article key={template.id} className={`overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 ${template.enabled ? "border-rose-300" : "border-sky-200/50 opacity-75 dark:border-sky-100/10"}`}><div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-sky-50 to-rose-50 p-3 dark:from-slate-800 dark:to-rose-950/30">{template.frameUrl ? <img src={template.frameUrl} alt={`Pratinjau ${template.name}`} className="h-full max-w-full object-contain" /> : <span className="text-xs text-sky-900/55 dark:text-sky-100/55">Unggah frame untuk melihat pratinjau</span>}<span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-black uppercase text-sky-900 dark:bg-slate-950/85 dark:text-sky-100">{template.source === "custom" ? "Kustom · Drive" : "Preset web"}</span></div><div className="space-y-3 p-3">{template.source === "custom" ? <><label className="block text-[10px] font-bold text-sky-900 dark:text-sky-100">Nama frame<input value={template.name} maxLength={80} onChange={(event) => changeTemplate(template.id, { name: event.currentTarget.value })} className="form-input mt-1 w-full" /></label><MediaUploadField folder="photobox" name={`program-frame-${template.id}`} label="Upload ke Google Drive" defaultUrl={template.frameUrl} onUrlChange={(url) => changeTemplate(template.id, { frameUrl: url })} /></> : <strong className="block text-xs text-sky-950 dark:text-sky-100">{template.name}</strong>}<label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-sky-950 dark:text-sky-100"><input type="checkbox" checked={template.enabled} onChange={(event) => changeTemplate(template.id, { enabled: event.currentTarget.checked })} className="h-4 w-4 accent-emerald-600" />Aktifkan frame ini</label>{template.source === "custom" && <button type="button" onClick={() => setTemplates((current) => current.filter((item) => item.id !== template.id))} className="text-xs font-bold text-rose-700">Hapus frame kustom</button>}</div></article>)}</div>
			<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-sky-950 dark:text-sky-100">Hadiah saat tuntas<select value={canGiftPhotobox && accessMode === "mission_reward" ? "photobox" : "none"} onChange={(event) => { const gift = event.currentTarget.value === "photobox"; setAccessMode(gift ? "mission_reward" : "standalone"); if (gift) setPhotoboxIsMission(false); }} className="form-input mt-1 w-full"><option value="none">Tidak ada hadiah Photobox</option><option value="photobox" disabled={!canGiftPhotobox}>Photobox setelah misi selesai</option></select><span className="mt-1 block font-normal text-sky-900/55 dark:text-sky-100/55">Photobox hadiah tidak dihitung sebagai misi. Pilih misi wajib lain terlebih dahulu.</span></label><label className={`flex cursor-pointer items-start gap-2 rounded-xl border border-rose-200/60 bg-rose-50/50 p-3 text-xs font-bold text-rose-950 dark:border-rose-100/10 dark:bg-rose-950/20 dark:text-rose-100 ${accessMode === "mission_reward" ? "opacity-50" : ""}`}><input className="mt-0.5 h-4 w-4 accent-rose-700" type="checkbox" name="photobox_is_mission" value="on" checked={photoboxIsMission} disabled={accessMode === "mission_reward"} onChange={(event) => setPhotoboxIsMission(event.currentTarget.checked)} />Photobox jadi misi · buat satu foto untuk menuntaskan</label></div>
		</section>}
		<section className="border-t border-sky-200/70 pt-5 dark:border-sky-200/10"><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-sky-950 dark:text-sky-100">Efek saat minigame selesai<select name="completion_effect" value={hasWinCondition ? completionEffect : "none"} disabled={!hasWinCondition} onChange={(event) => setCompletionEffect(event.currentTarget.value as NonNullable<Program["completion_effect"]>)} className="form-input mt-1 w-full"><option value="none">Tanpa efek</option><option value="confetti">Confetti</option><option value="sparkles">Kilau bintang</option><option value="fireworks">Kembang api</option></select><span className="mt-1 block font-normal text-sky-900/55 dark:text-sky-100/55">{hasWinCondition ? "Efek muncul setelah semua misi wajib selesai." : "Pilih misi wajib agar minigame punya kondisi selesai."}</span></label>{!isPetugas && <label className="flex items-center gap-2 self-center text-sm font-bold text-sky-950 dark:text-sky-100"><input type="checkbox" name="is_enabled" checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} className="h-4 w-4 accent-emerald-600" />Aktifkan minigame</label>}{isPetugas && <p className="self-center rounded-xl bg-sky-50 p-3 text-xs font-bold text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">Pengajuan menunggu persetujuan admin.</p>}</div></section>
		<Feedback state={state} /><button type="submit" disabled={pending} className="min-h-12 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-800 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{pending ? "Menyimpan…" : isPetugas ? "Ajukan minigame" : program ? "Simpan minigame" : "Tambahkan minigame"}</button>
	</form>;
}

function AssignmentEditor({ program, assignment, destination, qrPoints, savedPoints, dependencies }: { program: Program; assignment: Assignment; destination: Destination; qrPoints: QrPoint[]; savedPoints: GroupPoint[]; dependencies: Dependency[] }) {
	const [state, action, pending] = useActionState(configureTourismMinigameAssignmentAction, initialActionState);
	const [focusPhotobox, setFocusPhotobox] = useState(false);
	const photoboxSectionRef = useRef<HTMLElement | null>(null);
	const pointIds = new Set(savedPoints.filter((item) => item.assignment_id === assignment.id).map((item) => item.qr_point_id));
	const savedRequiredPointCount = savedPoints.filter((item) => item.assignment_id === assignment.id && item.is_required).length;
	const dependencyRows = dependencies.filter((item) => item.assignment_id === assignment.id);
	const currentComponents = assignment.components?.length ? assignment.components : program.components;
	const [selectedPoints, setSelectedPoints] = useState(() => qrPoints.filter((point) => point.destination_id === destination.id && pointIds.has(point.id)).map((point) => {
		const saved = savedPoints.find((item) => item.assignment_id === assignment.id && item.qr_point_id === point.id);
		return { qrPointId: point.id, isRequired: saved?.is_required ?? true, requires: dependencyRows.filter((item) => item.qr_point_id === point.id).map((item) => item.prerequisite_qr_point_id), friendName: saved?.friend_name ?? "", friendImageUrl: saved?.friend_image_url ?? "" };
	}));
	const [editorOpen, setEditorOpen] = useState(() => !assignment.is_enabled || (currentComponents.includes("find_friends") && (pointIds.size === 0 || savedRequiredPointCount === 0)));
	const [showAdvancedRules, setShowAdvancedRules] = useState(() => dependencyRows.length > 0);
	const availablePoints = qrPoints.filter((point) => point.destination_id === destination.id && point.is_active);
	const components = currentComponents;
	const requiredComponents = missionComponentKeys(assignment.required_components ?? program.required_components ?? []);
	const accessMode = program.default_photobox_access_mode ?? assignment.photobox_access_mode ?? "standalone";
	const templates = initialTemplates(program.photobox_templates?.length ? program.photobox_templates : assignment.photobox_templates);
	const [captionTemplate, setCaptionTemplate] = useState(assignment.caption_template || "Kenangan seru di {destination}! #TiLoc");
	const [maxCaption, setMaxCaption] = useState(assignment.max_caption_length || 280);
	const [maxLinkDistance, setMaxLinkDistance] = useState(assignment.max_dependency_distance_meters || 1000);
	const canUseGiftAccess = components.includes("photobox") && program.default_photobox_access_mode === "mission_reward";
	const selectedSet = new Set(selectedPoints.map((point) => point.qrPointId));
	const requiredPointCount = selectedPoints.filter((point) => point.isRequired).length;
	const enabledTemplateCount = templates.filter((item) => item.enabled && (item.source !== "custom" || item.frameUrl.trim())).length;
	const setupChecks = [
		...(components.includes("find_friends") ? [{ label: `${selectedPoints.length} titik QR · ${requiredPointCount} wajib`, ready: selectedPoints.length > 0 && requiredPointCount > 0 }] : []),
		...(components.includes("photobox") ? [{ label: `${enabledTemplateCount} frame aktif`, ready: enabledTemplateCount > 0 }] : []),
	];
	const setupReady = setupChecks.every((check) => check.ready);
	const publicReady = program.is_enabled && assignment.is_enabled && setupReady;
	useEffect(() => {
		if (!editorOpen || !focusPhotobox || !components.includes("photobox")) return;
		photoboxSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
		setFocusPhotobox(false);
	}, [components, editorOpen, focusPhotobox]);
	function updatePoint(id: string, change: Partial<(typeof selectedPoints)[number]>) { setSelectedPoints((current) => current.map((point) => point.qrPointId === id ? { ...point, ...change } : point)); }
	function addPoint(point: QrPoint) { setSelectedPoints((current) => current.some((item) => item.qrPointId === point.id) ? current : [...current, { qrPointId: point.id, isRequired: true, requires: [], friendName: "", friendImageUrl: "" }]); }
	function removePoint(id: string) { setSelectedPoints((current) => current.filter((point) => point.qrPointId !== id).map((point) => ({ ...point, requires: point.requires.filter((requiredId) => requiredId !== id) }))); }
	function openPhotoboxSettings() {
		if (!program.components.includes("photobox")) return;
		setEditorOpen(true);
		setFocusPhotobox(true);
	}
	const serializedTemplates = JSON.stringify(initialTemplates(program.photobox_templates?.length ? program.photobox_templates : templates).filter((item) => item.source !== "custom" || item.frameUrl.trim()));
		return <section className="overflow-hidden border-t border-sky-200/60 dark:border-sky-200/10"><header className="flex flex-wrap items-center justify-between gap-3 py-4"><button type="button" onClick={() => setEditorOpen((open) => !open)} aria-expanded={editorOpen} className="min-w-0 text-left"><span className="block text-[10px] font-black uppercase tracking-[.16em] text-sky-700 dark:text-sky-300">DESTINASI</span><strong className="mt-1 block text-xl font-black text-sky-950 dark:text-sky-100">{destination.name}</strong><span className="mt-1 block text-xs font-semibold text-sky-950/55 dark:text-sky-100/55">Titik QR dan relasi Find Our Friends.</span></button><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-black ${publicReady ? "bg-emerald-100 text-emerald-800" : assignment.is_enabled && program.is_enabled ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{publicReady ? "Siap untuk pengunjung" : assignment.is_enabled && program.is_enabled ? "Perlu dilengkapi · belum tampil" : assignment.is_selected && !program.is_enabled ? "Menunggu admin" : "Nonaktif"}</span>{components.includes("photobox") ? <button type="button" onClick={openPhotoboxSettings} title="Lihat frame program Photobox." className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-900 hover:bg-rose-100">🖼️ Lihat frame</button> : <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">📸 Photobox nonaktif</span>}<button type="button" onClick={() => setEditorOpen((open) => !open)} className="min-h-10 rounded-xl bg-gradient-to-r from-sky-600 to-blue-800 px-3 py-2 text-xs font-black text-white">{editorOpen ? "Tutup" : setupReady ? "Titik QR" : "Atur titik QR"}</button></div></header>
		{setupChecks.length > 0 && <div className="grid gap-2 border-t border-[#84B3CE]/15 px-5 pb-4 sm:grid-cols-2 sm:px-6">{setupChecks.map((check) => <div key={check.label} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${check.ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}><span aria-hidden="true">{check.ready ? "✓" : "○"}</span>{check.label}</div>)}</div>}
		<div hidden={!editorOpen}>
		<form action={action} className="space-y-5 border-t border-sky-200/60 py-5 dark:border-sky-200/10">
			<input type="hidden" name="assignment_id" value={assignment.id} /><input type="hidden" name="assignment_enabled" value={assignment.is_enabled ? "on" : ""} />{components.map((key) => <input key={key} type="hidden" name="assignment_components" value={key} />)}{requiredComponents.map((key) => <input key={key} type="hidden" name="assignment_required_components" value={key} />)}<input type="hidden" name="find_points_json" value={JSON.stringify(selectedPoints)} /><input type="hidden" name="photobox_templates_json" value={serializedTemplates} /><input type="hidden" name="max_dependency_distance_meters" value={maxLinkDistance} /><datalist id={`friend-name-options-${assignment.id}`}>{friendNameSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
			<section className="border-t border-sky-200/60 py-4 first:border-t-0 first:pt-0 dark:border-sky-200/10"><StepHeading step="01" title="Komponen destinasi" description="Pilih fitur yang tersedia di destinasi ini." />
				<div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-2 text-xs font-black ${assignment.is_enabled ? "bg-emerald-100 text-emerald-800" : assignment.is_selected ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{assignment.is_enabled ? "Penerapan aktif" : assignment.is_selected ? "Dipilih · menunggu aktivasi" : "Tidak mengikuti minigame"}</span>{components.map((key) => <span key={key} className="rounded-full bg-white px-3 py-2 text-xs font-bold text-[#16587B]">{componentMeta[key].icon} {componentMeta[key].label}</span>)}{program.ai_is_mission && <span className="rounded-full bg-violet-100 px-3 py-2 text-xs font-bold text-violet-900">💬 AI jadi misi</span>}</div>
			</section>
			<section className="border-t border-amber-200/60 py-4 dark:border-amber-200/10"><StepHeading step="02" title="Syarat program selesai" description="Photobox adalah fitur, bukan misi wajib." />
				<div className="flex flex-wrap gap-2">{requiredComponents.length ? requiredComponents.map((key) => <span key={key} className="rounded-full border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-bold text-amber-950">{componentMeta[key].label} wajib</span>) : <span className="rounded-xl bg-white/70 px-3 py-2 text-xs text-[#16587B]/60">Tidak ada Find Our Friends wajib di wisata ini. Atur dari form edit wisata.</span>}{program.photobox_is_mission && <span className="rounded-full border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-bold text-rose-950">Photobox wajib · satu foto</span>}</div>
			</section>
			{components.includes("find_friends") && <section className="border-t border-sky-200/60 py-4 dark:border-sky-200/10"><StepHeading step="03" title="Grup Find Our Friends" description="Pilih QR, lalu atur prasyarat bila alur cerita membutuhkannya." /><div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-2xl text-xs leading-5 text-[#16587B]/65">QR tanpa prasyarat bebas dipindai dalam urutan apa pun.</p><span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-900">{selectedPoints.length} titik</span></div>
				<p className="mt-4 rounded-xl border border-white/80 bg-white/70 p-3 text-xs leading-5 text-[#16587B]/70">Mode mudah: QR bisa dipindai dalam urutan apa pun. Aturan prasyarat hanya perlu diatur jika alur cerita memang memerlukannya. Menonaktifkan game menyimpan susunan QR untuk dipakai lagi nanti.</p>
				<button type="button" onClick={() => setShowAdvancedRules((open) => !open)} aria-expanded={showAdvancedRules} className="mt-3 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black text-[#16587B] hover:bg-sky-50">{showAdvancedRules ? "− Tutup aturan lanjutan" : "＋ Atur prasyarat dan jarak (opsional)"}</button>
				{showAdvancedRules && <label className="mt-3 block max-w-sm text-xs font-bold text-[#16587B]/75">Jarak maksimum antar QR yang saling terhubung<input type="number" min={100} max={10000} step={100} value={maxLinkDistance} onChange={(event) => setMaxLinkDistance(Number(event.currentTarget.value))} className="mt-1.5 w-full rounded-xl border border-[#84B3CE]/35 bg-white px-3 py-2.5 text-sm text-[#16587B]"/><span className="mt-1 block font-normal leading-5 text-[#16587B]/55">Batas keamanan lokasi untuk QR yang punya prasyarat.</span></label>}
				<div className="mt-4 grid gap-2 sm:grid-cols-2">{availablePoints.map((point) => <button key={point.id} type="button" onClick={() => selectedSet.has(point.id) ? removePoint(point.id) : addPoint(point)} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${selectedSet.has(point.id) ? "border-sky-400 bg-white shadow-sm" : "border-white/80 bg-white/50 hover:bg-white"}`}><span><strong className="block text-sm text-[#16587B]">{point.name}</strong><span className="text-[10px] font-mono text-[#16587B]/50">{point.code}</span></span><span className={`grid h-7 w-7 place-items-center rounded-lg ${selectedSet.has(point.id) ? "bg-[#16587B] text-white" : "bg-sky-100 text-[#16587B]"}`}>{selectedSet.has(point.id) ? "✓" : "+"}</span></button>)}</div>
				{!availablePoints.length && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Belum ada QR aktif di destinasi ini. Tambahkan di menu Lokasi & titik QR.</p>}
				<div className="mt-4 space-y-3">{selectedPoints.map((entry, entryIndex) => { const point = availablePoints.find((item) => item.id === entry.qrPointId); return <article key={entry.qrPointId} className="rounded-2xl border border-[#84B3CE]/25 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-black text-[#16587B]">{point?.name ?? "Titik QR"}</h4><p className="text-[10px] font-mono text-[#16587B]/50">{point?.code}</p></div><button type="button" onClick={() => removePoint(entry.qrPointId)} className="rounded-full px-3 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50">Keluarkan</button></div>
					<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 text-xs font-bold text-[#16587B]"><input type="checkbox" checked={entry.isRequired} onChange={(event) => updatePoint(entry.qrPointId, { isRequired: event.currentTarget.checked })} className="h-4 w-4 accent-amber-600" />Titik wajib</label><label className="text-xs font-bold text-[#16587B]/70">Nama teman maskot (opsional)<input list={`friend-name-options-${assignment.id}`} value={entry.friendName} onChange={(event) => updatePoint(entry.qrPointId, { friendName: event.currentTarget.value })} maxLength={80} placeholder={`mis. ${friendNameSuggestions[entryIndex % friendNameSuggestions.length]}`} className="mt-1.5 w-full rounded-xl border border-[#84B3CE]/30 px-3 py-2 text-sm font-medium outline-none focus:border-[#16587B]" /></label></div>
					{showAdvancedRules && <fieldset className="mt-3 rounded-xl bg-sky-50/80 p-3"><legend className="px-1 text-[10px] font-black uppercase tracking-wide text-[#16587B]/70">Titik ini membutuhkan scan</legend><div className="flex flex-wrap gap-2">{selectedPoints.filter((other) => other.qrPointId !== entry.qrPointId).map((other) => { const otherPoint = availablePoints.find((item) => item.id === other.qrPointId); const selected = entry.requires.includes(other.qrPointId); return <label key={other.qrPointId} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold ${selected ? "border-sky-400 bg-white text-[#16587B]" : "border-transparent bg-white/55 text-[#16587B]/65"}`}><input type="checkbox" checked={selected} onChange={(event) => updatePoint(entry.qrPointId, { requires: event.currentTarget.checked ? [...entry.requires, other.qrPointId] : entry.requires.filter((id) => id !== other.qrPointId) })} className="h-3.5 w-3.5 accent-[#16587B]" />{otherPoint?.name ?? "QR"}</label>; })}{selectedPoints.length < 2 && <span className="text-[11px] text-[#16587B]/55">Tambahkan titik lain bila ada prasyarat.</span>}</div></fieldset>}
				</article>; })}</div>
				<div className="mt-4 rounded-xl border border-sky-200 bg-white/70 p-3 text-xs leading-5 text-[#16587B]/75"><strong>Contoh relasi:</strong> A membutuhkan B, C membutuhkan B, dan D membutuhkan A. Jika D dipindai lebih awal, ia tersimpan sebagai tertunda sampai B dan A ditemukan.</div>
			</section>}
			{components.includes("photobox") && <section ref={photoboxSectionRef} id="photobox-frames" className="scroll-mt-6 border-t border-rose-200/70 py-4 dark:border-rose-200/10"><StepHeading step={components.includes("find_friends") ? "03" : "02"} title="Frame Photobox" description="Pilihan frame berlaku untuk seluruh minigame." /><p className="text-xs leading-5 text-[#16587B]/65 dark:text-sky-100/60">Frame dan hadiah diatur sekali pada program. Di sini hanya ditampilkan QR serta pengaturan khusus lokasi.</p><div className="mt-3 flex flex-wrap gap-2">{templates.filter((template) => template.source !== "campaign").map((template) => <span key={template.id} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${template.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-100 text-slate-500"}`}>{template.enabled ? "✓" : "○"} {template.name}</span>)}</div><p className="mt-3 rounded-xl bg-rose-50/80 p-3 text-xs font-semibold text-rose-900 dark:bg-rose-950/25 dark:text-rose-100">{canUseGiftAccess ? "Photobox dibuka sebagai hadiah setelah misi minigame selesai." : program.photobox_is_mission ? "Satu foto menyelesaikan misi Photobox." : "Photobox tersedia sesuai akses program."}</p></section>}
			<Feedback state={state} /><button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-[#16587B] px-6 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{pending ? "Menyimpan…" : "Simpan pengaturan destinasi"}</button>
		</form></div></section>;
}

export default function MinigamesConsole({ data }: { data: MinigameConsoleData }) {
	const [showCreate, setShowCreate] = useState(data.programs.length === 0);
	const assignmentsByProgram = new Map(data.programs.map((program) => [program.id, data.assignments.filter((assignment) => assignment.program_id === program.id && assignment.is_selected)]));
	return <main className="relative isolate min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_8%_4%,#b9e8ff_0,transparent_30%),radial-gradient(circle_at_92%_0%,#d9f7ff_0,transparent_26%),linear-gradient(145deg,#effaff,#f8fcff_55%,#e7f5ff)] px-4 py-6 text-sky-950 dark:bg-[radial-gradient(circle_at_8%_4%,#123b67_0,transparent_30%),radial-gradient(circle_at_92%_0%,#102f5b_0,transparent_28%),linear-gradient(145deg,#071629,#0a1b35_55%,#071426)] dark:text-sky-50 sm:px-8 sm:py-10"><div aria-hidden="true" className="pointer-events-none absolute -left-28 top-40 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl dark:bg-blue-500/15"/><div aria-hidden="true" className="pointer-events-none absolute -right-28 top-[28rem] h-80 w-80 rounded-full bg-cyan-200/45 blur-3xl dark:bg-indigo-500/15"/><div className="relative mx-auto max-w-6xl">
		<header className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><Link href="/ruang-kelola" className="text-sm font-bold text-sky-900/65 transition hover:text-blue-800 dark:text-sky-100/65 dark:hover:text-white">← Ruang Pengelola</Link><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-sky-700 dark:text-sky-300">GAME DESIGN STUDIO · TiLoc!</p><h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Minigames<span className="text-amber-500"> ✨</span></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-sky-950/70 dark:text-sky-100/70 sm:text-base">{data.role !== "admin" ? "Rancang misi untuk wisata yang kamu kelola. Admin meninjau sebelum game tampil ke pengunjung." : "Rangkai misi, QR, dan Photobox jadi petualangan yang siap dimainkan."}</p></div><button type="button" aria-expanded={showCreate} aria-controls="minigame-create-panel" onClick={() => setShowCreate((value) => !value)} className="min-h-12 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-800 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl active:scale-95">{showCreate ? "Tutup form" : data.role === "admin" ? "＋ Buat minigame" : "＋ Ajukan minigame"}</button></header>
		<div id="minigame-create-panel" aria-hidden={!showCreate} inert={!showCreate} className="mb-8 grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none" style={{ gridTemplateRows: showCreate ? "1fr" : "0fr", opacity: showCreate ? 1 : 0 }}><div className="min-h-0 overflow-hidden"><section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-[0_25px_80px_-45px_rgba(22,88,123,.42)] backdrop-blur-xl dark:border-sky-200/10 dark:bg-slate-950/60 sm:p-8"><div className="mb-4 flex items-center gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-300 to-blue-700 text-3xl shadow-lg motion-safe:animate-[float_3.2s_ease-in-out_infinite]">🕹️</span><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-sky-700 dark:text-sky-300">TAMBAHKAN MINIGAME</p><h2 className="text-2xl font-black">{data.role !== "admin" ? "Ajukan minigame" : data.programs.length ? "Minigame baru" : "Buat minigame pertama"}</h2></div></div><ProgramForm isPetugas={data.role !== "admin"} /></section></div></div>
		<section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-900/50 dark:text-sky-200/55">LIBRARY PROGRAM</p><h2 className="mt-1 text-2xl font-black">Petualangan</h2></div><span className="rounded-full border border-white/80 bg-white/65 px-3 py-1.5 text-xs font-bold dark:border-sky-200/10 dark:bg-slate-900/55">{data.programs.length} game</span></div>
		{data.programs.map((program) => <article key={program.id} className="group overflow-hidden rounded-[2rem] border border-white/85 bg-white/75 shadow-[0_20px_70px_-45px_rgba(22,88,123,.42)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_76px_-42px_rgba(22,88,123,.6)] dark:border-sky-100/10 dark:bg-slate-950/55"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-900/10 bg-white/40 p-5 dark:border-sky-100/10 dark:bg-white/[.03] sm:p-6"><div className="flex min-w-0 items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-200 text-2xl shadow-inner transition group-hover:rotate-6 dark:from-sky-900 dark:to-blue-900">🎮</span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.16em] text-sky-900/50 dark:text-sky-100/50">/{program.slug}</p><h3 className="mt-1 break-words text-xl font-black text-sky-950 dark:text-sky-50 sm:text-2xl">{program.name}</h3><div className="mt-2 flex flex-wrap gap-1.5">{program.components.map((key) => <span key={key} className="rounded-full bg-sky-100/80 px-2.5 py-1 text-[10px] font-bold text-sky-950 dark:bg-sky-900/65 dark:text-sky-100">{componentMeta[key].icon} {componentMeta[key].label}</span>)}</div></div></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${program.is_enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/55 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"}`}>{program.is_enabled ? "● Aktif" : data.role === "admin" ? program.created_by && program.created_by !== data.userId ? "Perlu ditinjau" : "Draft · nonaktif" : program.created_by === data.userId ? "Diajukan · menunggu admin" : "Draft · nonaktif"}</span></div>
			<div className="px-5 pb-4 sm:px-6">{data.role === "admin" && <details className="border-b border-sky-900/10 dark:border-sky-100/10"><summary className="cursor-pointer list-none py-3 text-sm font-black text-sky-900 transition hover:text-blue-700 dark:text-sky-100 dark:hover:text-sky-300">🔎 {program.is_enabled ? "Edit minigame" : "Tinjau & atur minigame"}<span className="float-right text-sky-700 dark:text-sky-300">⌄</span></summary><div className="border-t border-sky-900/10 py-4 dark:border-sky-100/10"><ProgramForm program={program} /></div></details>}
			{(assignmentsByProgram.get(program.id) ?? []).map((assignment) => { const destination = data.destinations.find((item) => item.id === assignment.destination_id); return destination ? <AssignmentEditor key={`${assignment.id}:${program.updated_at}`} program={program} assignment={assignment} destination={destination} qrPoints={data.qrPoints} savedPoints={data.groupPoints} dependencies={data.dependencies} /> : null; })}
			{!(assignmentsByProgram.get(program.id) ?? []).length && <p className="border-t border-dashed border-sky-900/15 py-4 text-center text-sm text-sky-950/60 dark:border-sky-100/10 dark:text-sky-100/55">Pilih minigame ini saat mendaftarkan atau mengedit wisata.</p>}</div></article>)}
		{!data.programs.length && <div className="rounded-[2rem] border border-dashed border-sky-400/45 bg-white/45 px-6 py-10 text-center dark:border-sky-300/20 dark:bg-slate-900/40"><div className="text-5xl motion-safe:animate-[float_3.2s_ease-in-out_infinite]">🧩</div><h3 className="mt-4 text-xl font-black">Arena masih kosong</h3><p className="mx-auto mt-2 max-w-sm text-sm text-sky-950/65 dark:text-sky-100/65">Mulai dari satu cerita kecil. Pilih misi, tentukan destinasi, lalu ajukan game-mu.</p><button type="button" onClick={() => setShowCreate(true)} className="mt-5 min-h-11 rounded-xl bg-sky-700 px-4 py-2 text-xs font-black text-white transition hover:-translate-y-0.5">🕹️ Rancang game</button></div>}</section>
		<footer className="mt-8 border-t border-sky-900/10 pt-5 text-center text-xs font-semibold text-sky-950/50 dark:border-sky-100/10 dark:text-sky-100/50">Find Our Friends adalah grup relasi QR. Siklus prasyarat ditolak agar progres selalu bisa dituntaskan.</footer>
	</div></main>;
}
