"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import type { CampaignFormBlock } from "@/src/features/campaigns/form-schema";
import { campaignButtonClass, type CampaignAppearance } from "@/src/features/campaigns/appearance";
import { useTheme } from "@/src/components/theme-provider";

type CampaignFormExperienceProps = {
	campaignId: string;
	pageKey: "home" | "destination" | "minigame" | "photobox" | "scan";
	destinationSlug: string;
	fallbackHref: string;
	fallbackLabel: string;
	onNavigate?: () => void;
	onAppearanceLoaded?: (appearance: CampaignAppearance) => void;
};

type CampaignPublicConfig = { formSchema: CampaignFormBlock[]; appearance: CampaignAppearance; ctaLabel: string | null; ctaUrl: string | null; placementMode: string };

export function CampaignCallToAction({ label, style, isDark, href, onClick, submit = false, disabled = false, fullWidth = true }: { label: string; style: CampaignAppearance["buttonStyle"]; isDark: boolean; href?: string | null; onClick?: () => void; submit?: boolean; disabled?: boolean; fullWidth?: boolean }) {
	const className = `group relative flex min-h-12 ${fullWidth ? "w-full" : "w-fit max-w-full"} items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-center text-sm font-black transition duration-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 ${campaignButtonClass(style, isDark)} focus-visible:ring-sky-300/50 disabled:cursor-wait disabled:opacity-55`;
	const contents = <><span className="relative z-10">{label}</span><span className="relative z-10" aria-hidden="true">→</span>{style === "gloss" && <span className="campaign-gloss-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3" aria-hidden="true"/>}</>;
	if (href) return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={onClick} className={className}>{contents}</a>;
	return <button type={submit ? "submit" : "button"} disabled={disabled} onClick={onClick} className={className}>{contents}</button>;
}

function safeUrl(value: string | null) {
	if (!value) return null;
	if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
	} catch { return null; }
}

function isFormField(block: CampaignFormBlock): block is Extract<CampaignFormBlock, { type: "input" | "choice" | "dropdown" }> {
	return block.type === "input" || block.type === "choice" || block.type === "dropdown";
}

function ratingScore(option: string) {
	const match = option.trim().match(/^([1-5])(?:\s|·|$)/);
	return match ? Number(match[1]) : null;
}

export function CampaignFormExperience({ campaignId, pageKey, destinationSlug, fallbackHref, fallbackLabel, onNavigate, onAppearanceLoaded }: CampaignFormExperienceProps) {
	const { isDark } = useTheme();
	const [config, setConfig] = useState<CampaignPublicConfig | null>(null);
	const [loadError, setLoadError] = useState("");
	const [values, setValues] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const appearanceLoadedRef = useRef(onAppearanceLoaded);
	useEffect(() => { appearanceLoadedRef.current = onAppearanceLoaded; }, [onAppearanceLoaded]);

	useEffect(() => {
		const controller = new AbortController();
		void fetch("/api/campaigns/" + encodeURIComponent(campaignId), { cache: "no-store", signal: controller.signal })
			.then(async (response) => {
				const result = await response.json() as CampaignPublicConfig & { error?: string };
				if (!response.ok) throw new Error(result.error || "Campaign belum dapat dimuat.");
				setConfig(result);
				appearanceLoadedRef.current?.(result.appearance);
			})
			.catch((error) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Campaign belum dapat dimuat."); });
		return () => controller.abort();
	}, [campaignId]);

	function trackClick() {
		void trackVisitorEvent({ eventName: "campaign_click", pageKey, destinationSlug, campaignId });
	}

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!config || busy) return;
		setBusy(true);
		setMessage("");
		trackClick();
		const responseValues = Object.fromEntries(config.formSchema.filter(isFormField).map((field) => [field.id, values[field.id] ?? ""]));
		try {
			const response = await fetch("/api/campaigns/" + encodeURIComponent(campaignId), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ values: responseValues, destinationSlug: destinationSlug || undefined }),
			});
			const result = await response.json() as { error?: string; status?: string };
			if (response.status === 409 || result.status === "already_submitted") {
				setSubmitted(true);
				setMessage(config.placementMode === "website_feedback" || config.placementMode === "destination_feedback"
					? "Kamu sudah memberi masukan untuk bagian ini bulan ini."
					: "Jawabanmu untuk campaign ini sudah tercatat.");
			} else if (!response.ok) throw new Error(result.error || "Jawaban belum tersimpan.");
			else {
				setSubmitted(true); setMessage("Pilihanmu sudah tercatat. Terima kasih! ✨");
				if (config.placementMode === "website_feedback" || config.placementMode === "destination_feedback") {
					window.dispatchEvent(new CustomEvent("tiloc:survey-submitted", { detail: { placementMode: config.placementMode, destinationSlug } }));
				}
			}
		} catch (error) { setMessage(error instanceof Error ? error.message : "Jawaban belum tersimpan."); }
		finally { setBusy(false); }
	}

	if (!config && !loadError) return <div role="status" className={`mt-5 rounded-xl px-4 py-3 text-xs font-semibold ${isDark ? "bg-sky-100/5 text-sky-100/70" : "bg-white/65 text-[#16587B]/70"}`}>Menyiapkan pilihan campaign…</div>;
	if (loadError) return <div role="status" className={`mt-5 rounded-xl px-4 py-3 text-xs font-semibold ${isDark ? "bg-sky-100/5 text-sky-100/70" : "bg-white/65 text-[#16587B]/70"}`}>{loadError}</div>;
	if (!config) return null;
	const fields = config.formSchema.filter(isFormField);
	const hasSubmitButton = config.formSchema.some((block) => block.type === "button" && block.action === "submit");
	const customFormUrl = config.formSchema.filter((block): block is Extract<CampaignFormBlock, { type: "button" }> => block.type === "button" && block.action === "link").map((block) => safeUrl(block.url ?? null)).find(Boolean);
	const campaignHref = customFormUrl ?? safeUrl(config.ctaUrl) ?? safeUrl(fallbackHref);
	const resolvedLabel = config.ctaLabel || fallbackLabel;
	const inputClass = `mt-1.5 min-h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-sky-400 focus-visible:ring-4 focus-visible:ring-sky-400/20 ${isDark ? "border-sky-200/20 bg-slate-950/45 text-sky-50 placeholder:text-sky-100/35" : "border-[#84B3CE]/40 bg-white text-[#16587B] placeholder:text-[#16587B]/40"}`;
	const fieldLabelClass = `block text-xs font-bold ${isDark ? "text-sky-100" : "text-[#16587B]"}`;
	const optionClass = `flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${isDark ? "border-sky-200/15 bg-white/[.04] text-sky-100 hover:bg-white/[.08]" : "border-[#84B3CE]/30 bg-white/80 text-[#16587B] hover:bg-white"}`;

	if (!fields.length) return <div className="mt-5 space-y-3">{config.formSchema.filter((block) => block.type === "label").map((block) => block.type === "label" ? <p key={block.id} className="text-sm leading-6 text-[#16587B]/75">{block.text}</p> : null)}{customFormUrl ? config.formSchema.filter((block): block is Extract<CampaignFormBlock, { type: "button" }> => block.type === "button" && block.action === "link").map((block) => {
		const href = safeUrl(block.url ?? null);
		return href ? <CampaignCallToAction key={block.id} label={block.label} style={config.appearance.buttonStyle} isDark={isDark} href={href} onClick={() => { trackClick(); onNavigate?.(); }}/> : null;
	}) : campaignHref ? <CampaignCallToAction label={resolvedLabel} style={config.appearance.buttonStyle} isDark={isDark} href={campaignHref} onClick={() => { trackClick(); onNavigate?.(); }}/> : <CampaignCallToAction label={resolvedLabel} style={config.appearance.buttonStyle} isDark={isDark} onClick={() => { trackClick(); onNavigate?.(); }}/>}</div>;
	if (submitted) return <p role="status" className={`mt-5 rounded-xl border px-4 py-3 text-sm font-bold ${isDark ? "border-emerald-200/15 bg-emerald-300/10 text-emerald-100" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message}</p>;

	return <form onSubmit={submit} className={`mt-5 space-y-4 rounded-2xl border p-4 ${isDark ? "border-sky-200/12 bg-slate-950/20" : "border-[#84B3CE]/30 bg-white/50"}`}>
		{config.formSchema.map((block) => {
			if (block.type === "label") return <p key={block.id} className={`text-sm leading-6 ${isDark ? "text-sky-100/75" : "text-[#16587B]/75"}`}>{block.text}</p>;
			if (block.type === "input") return <label key={block.id} className={fieldLabelClass}>{block.label}{block.required ? " *" : ""}<input type={block.inputType} required={block.required} maxLength={block.maxLength} placeholder={block.placeholder} value={values[block.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [block.id]: event.currentTarget.value }))} className={inputClass} /></label>;
			if (block.type === "choice") return <fieldset key={block.id} className="space-y-2"><legend className={fieldLabelClass}>{block.label}{block.required ? " *" : ""}</legend><div className="grid gap-2">{block.options.map((option) => <label key={option} className={optionClass}><input type="radio" name={block.id} required={block.required} checked={values[block.id] === option} onChange={() => setValues((current) => ({ ...current, [block.id]: option }))} className="accent-sky-600" />{option}</label>)}</div></fieldset>;
			if (block.type === "dropdown" && block.options.length === 5 && block.options.every((option) => ratingScore(option) !== null)) {
				const selectedScore = ratingScore(values[block.id] ?? "") ?? 0;
				const scale = [...block.options].sort((left, right) => (ratingScore(left) ?? 0) - (ratingScore(right) ?? 0));
				return <fieldset key={block.id} className="space-y-2"><legend className={fieldLabelClass}>{block.label}{block.required ? " *" : ""}</legend><div role="radiogroup" aria-label={block.label} className="flex flex-wrap gap-1.5">{scale.map((option) => { const score = ratingScore(option) ?? 0; return <label key={option} className={`group grid h-11 w-11 cursor-pointer place-items-center rounded-xl border transition hover:-translate-y-0.5 ${isDark ? "border-sky-100/10 bg-white/[.04] hover:bg-white/10" : "border-sky-900/10 bg-white/80 hover:bg-white"}`} title={option}><input type="radio" name={block.id} value={option} required={block.required} checked={values[block.id] === option} onChange={() => setValues((current) => ({ ...current, [block.id]: option }))} className="sr-only"/><span aria-hidden="true" className={`text-2xl transition ${score <= selectedScore ? "text-amber-400 drop-shadow-[0_2px_5px_rgba(251,191,36,.25)]" : isDark ? "text-sky-100/25" : "text-slate-300"}`}>★</span><span className="sr-only">{option}</span></label>; })}</div><p aria-live="polite" className={`text-[11px] font-semibold ${isDark ? "text-sky-100/60" : "text-[#16587B]/60"}`}>{scale.find((option) => option === values[block.id]) ?? "Pilih nilai 1 sampai 5"}</p></fieldset>;
			}
			if (block.type === "dropdown") return <label key={block.id} className={fieldLabelClass}>{block.label}{block.required ? " *" : ""}<select required={block.required} value={values[block.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [block.id]: event.currentTarget.value }))} className={inputClass}><option value="" disabled>Pilih salah satu</option>{block.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
			if (block.type === "button" && block.action === "link") {
				const href = safeUrl(block.url ?? null);
				return href ? <CampaignCallToAction key={block.id} label={block.label} style={config.appearance.buttonStyle} isDark={isDark} href={href} onClick={() => { trackClick(); onNavigate?.(); }}/> : null;
			}
			if (block.type === "button" && block.action === "submit") return <CampaignCallToAction key={block.id} label={busy ? "Mengirim…" : block.label} style={config.appearance.buttonStyle} isDark={isDark} submit disabled={busy}/>;
			return null;
		})}
		{!hasSubmitButton && <CampaignCallToAction label={busy ? "Mengirim…" : resolvedLabel || "Kirim pilihan"} style={config.appearance.buttonStyle} isDark={isDark} submit disabled={busy}/>}
		{message && <p role="alert" className={`text-xs font-semibold ${isDark ? "text-rose-300" : "text-rose-600"}`}>{message}</p>}
	</form>;
}
