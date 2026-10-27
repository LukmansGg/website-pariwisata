import type { CampaignFormBlock } from "./form-schema";

export type CampaignFormPreset = "none" | "interest" | "offer" | "suggestion" | "tourism_feedback" | "website_feedback";

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
	tourism_feedback: [
		{ id: "tourism_feedback_intro", type: "label", text: "Bantu pengelola memahami pengalamanmu di objek wisata ini." },
		{ id: "tourism_feedback_rating", type: "dropdown", label: "Bagaimana penilaianmu?", options: ["5 · Sangat baik", "4 · Baik", "3 · Cukup", "2 · Kurang", "1 · Sangat kurang"], required: true },
		{ id: "tourism_feedback_suggestion", type: "input", label: "Saran untuk objek wisata", placeholder: "Apa yang bisa ditingkatkan?", inputType: "text", required: false, maxLength: 240 },
		{ id: "tourism_feedback_submit", type: "button", label: "Kirim ulasan wisata", action: "submit" },
	],
	website_feedback: [
		{ id: "website_feedback_intro", type: "label", text: "Masukan ini hanya untuk pengalaman menggunakan website TiLoc." },
		{ id: "website_feedback_rating", type: "dropdown", label: "Bagaimana penilaianmu terhadap website?", options: ["5 · Sangat nyaman", "4 · Nyaman", "3 · Cukup", "2 · Kurang nyaman", "1 · Tidak nyaman"], required: true },
		{ id: "website_feedback_suggestion", type: "input", label: "Saran untuk website", placeholder: "Apa yang perlu ditingkatkan?", inputType: "text", required: false, maxLength: 240 },
		{ id: "website_feedback_submit", type: "button", label: "Kirim ulasan website", action: "submit" },
	],
};

export function getCampaignFormPreset(preset: CampaignFormPreset): CampaignFormBlock[] {
	if (preset === "none") return [];
	return PRESETS[preset].map((block) => block.type === "choice" || block.type === "dropdown"
		? { ...block, options: [...block.options] }
		: { ...block });
}
