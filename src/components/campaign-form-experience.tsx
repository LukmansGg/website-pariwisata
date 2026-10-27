"use client";

import { useEffect, useState, type FormEvent } from "react";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import type { CampaignFormBlock } from "@/src/features/campaigns/form-schema";

type CampaignFormExperienceProps = {
	campaignId: string;
	pageKey: "destination" | "minigame";
	destinationSlug: string;
	fallbackHref: string;
	fallbackLabel: string;
	onNavigate?: () => void;
};

type CampaignPublicConfig = { formSchema: CampaignFormBlock[]; ctaLabel: string | null; ctaUrl: string | null };

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

export function CampaignFormExperience({ campaignId, pageKey, destinationSlug, fallbackHref, fallbackLabel, onNavigate }: CampaignFormExperienceProps) {
	const [config, setConfig] = useState<CampaignPublicConfig | null>(null);
	const [loadError, setLoadError] = useState("");
	const [values, setValues] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		void fetch("/api/campaigns/" + encodeURIComponent(campaignId), { cache: "no-store", signal: controller.signal })
			.then(async (response) => {
				const result = await response.json() as CampaignPublicConfig & { error?: string };
				if (!response.ok) throw new Error(result.error || "Campaign belum dapat dimuat.");
				setConfig(result);
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
				body: JSON.stringify({ values: responseValues }),
			});
			const result = await response.json() as { error?: string; status?: string };
			if (response.status === 409 || result.status === "already_submitted") {
				setSubmitted(true);
				setMessage("Jawabanmu untuk campaign ini sudah tercatat.");
			} else if (!response.ok) throw new Error(result.error || "Jawaban belum tersimpan.");
			else { setSubmitted(true); setMessage("Pilihanmu sudah tercatat. Terima kasih! ✨"); }
		} catch (error) { setMessage(error instanceof Error ? error.message : "Jawaban belum tersimpan."); }
		finally { setBusy(false); }
	}

	if (!config && !loadError) return <div role="status" className="mt-5 rounded-xl bg-white/65 px-4 py-3 text-xs font-semibold text-[#16587B]/70">Menyiapkan pilihan campaign…</div>;
	if (loadError) return <div role="status" className="mt-5 rounded-xl bg-white/65 px-4 py-3 text-xs font-semibold text-[#16587B]/70">{loadError}</div>;
	if (!config) return null;
	const fields = config.formSchema.filter(isFormField);
	const hasSubmitButton = config.formSchema.some((block) => block.type === "button" && block.action === "submit");
	const customFormUrl = config.formSchema.filter((block): block is Extract<CampaignFormBlock, { type: "button" }> => block.type === "button" && block.action === "link").map((block) => safeUrl(block.url ?? null)).find(Boolean);
	const campaignHref = customFormUrl ?? safeUrl(config.ctaUrl) ?? safeUrl(fallbackHref);
	const resolvedLabel = config.ctaLabel || fallbackLabel;

	if (!fields.length) return <div className="mt-5 space-y-3">{config.formSchema.filter((block) => block.type === "label").map((block) => block.type === "label" ? <p key={block.id} className="text-sm leading-6 text-[#16587B]/75">{block.text}</p> : null)}{customFormUrl ? config.formSchema.filter((block): block is Extract<CampaignFormBlock, { type: "button" }> => block.type === "button" && block.action === "link").map((block) => {
		const href = safeUrl(block.url ?? null);
		return href ? <a key={block.id} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={() => { trackClick(); onNavigate?.(); }} className="flex min-h-11 items-center justify-center rounded-xl bg-[#16587B] px-3 text-center text-xs font-black text-white transition hover:-translate-y-0.5">{block.label}</a> : null;
	}) : campaignHref ? <a href={campaignHref} target={campaignHref.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={() => { trackClick(); onNavigate?.(); }} className="flex min-h-11 items-center justify-center rounded-xl bg-[#16587B] px-3 text-center text-xs font-black text-white transition hover:-translate-y-0.5">{resolvedLabel}</a> : <button type="button" onClick={() => { trackClick(); onNavigate?.(); }} className="min-h-11 w-full rounded-xl bg-[#16587B] px-3 text-xs font-black text-white">{resolvedLabel}</button>}</div>;
	if (submitted) return <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</p>;

	return <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl border border-[#84B3CE]/30 bg-white/50 p-4">
		{config.formSchema.map((block) => {
			if (block.type === "label") return <p key={block.id} className="text-sm leading-6 text-[#16587B]/75">{block.text}</p>;
			if (block.type === "input") return <label key={block.id} className="block text-xs font-bold text-[#16587B]">{block.label}{block.required ? " *" : ""}<input type={block.inputType} required={block.required} maxLength={block.maxLength} placeholder={block.placeholder} value={values[block.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [block.id]: event.currentTarget.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-[#84B3CE]/40 bg-white px-3 text-sm outline-none focus:border-[#16587B]" /></label>;
			if (block.type === "choice") return <fieldset key={block.id} className="space-y-2"><legend className="text-xs font-bold text-[#16587B]">{block.label}{block.required ? " *" : ""}</legend><div className="grid gap-2">{block.options.map((option) => <label key={option} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#84B3CE]/30 bg-white/75 px-3 text-xs font-semibold text-[#16587B]"><input type="radio" name={block.id} required={block.required} checked={values[block.id] === option} onChange={() => setValues((current) => ({ ...current, [block.id]: option }))} className="accent-[#16587B]" />{option}</label>)}</div></fieldset>;
			if (block.type === "dropdown") return <label key={block.id} className="block text-xs font-bold text-[#16587B]">{block.label}{block.required ? " *" : ""}<select required={block.required} value={values[block.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [block.id]: event.currentTarget.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-[#84B3CE]/40 bg-white px-3 text-sm"><option value="" disabled>Pilih salah satu</option>{block.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
			if (block.type === "button" && block.action === "link") {
				const href = safeUrl(block.url ?? null);
				return href ? <a key={block.id} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" onClick={() => { trackClick(); onNavigate?.(); }} className="flex min-h-11 items-center justify-center rounded-xl border border-[#16587B]/20 bg-white px-3 text-xs font-black text-[#16587B]">{block.label}</a> : null;
			}
			if (block.type === "button" && block.action === "submit") return <button key={block.id} type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-[#16587B] px-3 text-xs font-black text-white disabled:opacity-50">{busy ? "Mengirim…" : block.label}</button>;
			return null;
		})}
		{!hasSubmitButton && <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-[#16587B] px-3 text-xs font-black text-white disabled:opacity-50">{busy ? "Mengirim…" : resolvedLabel || "Kirim pilihan"}</button>}
		{message && <p role="alert" className="text-xs font-semibold text-rose-600">{message}</p>}
	</form>;
}
