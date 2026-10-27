import type { CampaignFormBlock } from "./form-schema";

export type CampaignFormPreset = "none" | "interest" | "offer" | "suggestion";

const PRESETS: Record<Exclude<CampaignFormPreset, "none">, CampaignFormBlock[]> = {
	interest: [
		{ id: "interest_intro", type: "label", text: "Bantu kami menyiapkan pengalaman wisata yang kamu suka." },
		{ id: "interest_category", type: "dropdown", label: "Apa yang paling menarik buatmu?", options: ["Kuliner lokal", "Sejarah & budaya", "Spot foto", "Alam & aktivitas"], required: true },
		{ id: "interest_timing", type: "choice", label: "Kapan rencana berkunjung?", options: ["Hari ini", "Akhir pekan", "Belum ditentukan"], required: false },
		{ id: "interest_submit", type: "button", label: "Kirim minat", action: "submit" },
	],
	offer: [
		{ id: "offer_intro", type: "label", text: "Pilih penawaran yang ingin kamu simpan untuk kunjungan berikutnya." },
		{ id: "offer_kind", type: "dropdown", label: "Penawaran pilihan", options: ["Paket hemat", "Menu favorit", "Promo aktivitas", "Info fasilitas"], required: true },
		{ id: "offer_visit", type: "choice", label: "Simpan minat ini?", options: ["Ya, simpan", "Saya masih melihat-lihat"], required: true },
		{ id: "offer_submit", type: "button", label: "Simpan pilihan", action: "submit" },
	],
	suggestion: [
		{ id: "suggestion_intro", type: "label", text: "Ceritakan singkat pengalaman atau hal yang ingin kamu lihat di sini." },
		{ id: "suggestion_text", type: "input", label: "Saran singkat", placeholder: "Tulis ide kamu…", inputType: "text", required: true, maxLength: 240 },
		{ id: "suggestion_submit", type: "button", label: "Kirim saran", action: "submit" },
	],
};

export function getCampaignFormPreset(preset: CampaignFormPreset): CampaignFormBlock[] {
	if (preset === "none") return [];
	return PRESETS[preset].map((block) => block.type === "choice" || block.type === "dropdown"
		? { ...block, options: [...block.options] }
		: { ...block });
}
