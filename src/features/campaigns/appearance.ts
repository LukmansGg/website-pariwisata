export type CampaignVisualPreset = "promo" | "event" | "rating";
export type CampaignButtonStyle = "depth" | "flat" | "gloss";
export type CampaignTitleStyle = "bold" | "editorial" | "glow";

export type CampaignAppearance = {
	preset: CampaignVisualPreset;
	buttonStyle: CampaignButtonStyle;
	titleStyle: CampaignTitleStyle;
};

const defaults: Record<CampaignVisualPreset, CampaignAppearance> = {
	promo: { preset: "promo", buttonStyle: "gloss", titleStyle: "bold" },
	event: { preset: "event", buttonStyle: "depth", titleStyle: "editorial" },
	rating: { preset: "rating", buttonStyle: "flat", titleStyle: "bold" },
};

export function getCampaignAppearance(preset: CampaignVisualPreset): CampaignAppearance {
	return { ...defaults[preset] };
}

export function parseCampaignAppearance(value: unknown): CampaignAppearance | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const appearance = value as Record<string, unknown>;
	if (appearance.preset !== "promo" && appearance.preset !== "event" && appearance.preset !== "rating") return null;
	if (appearance.buttonStyle !== "depth" && appearance.buttonStyle !== "flat" && appearance.buttonStyle !== "gloss") return null;
	if (appearance.titleStyle !== "bold" && appearance.titleStyle !== "editorial" && appearance.titleStyle !== "glow") return null;
	return {
		preset: appearance.preset,
		buttonStyle: appearance.buttonStyle,
		titleStyle: appearance.titleStyle,
	};
}

export function resolveCampaignAppearance(value: unknown, fallbackPreset: CampaignVisualPreset = "promo"): CampaignAppearance {
	return parseCampaignAppearance(value) ?? getCampaignAppearance(fallbackPreset);
}

export function campaignButtonClass(style: CampaignButtonStyle, isDark: boolean) {
	if (style === "depth") return isDark
		? "border border-sky-200/30 bg-gradient-to-b from-sky-400 to-blue-600 text-white shadow-[0_5px_0_#123b68,0_12px_24px_rgba(14,165,233,.2)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#123b68]"
		: "border border-blue-950/30 bg-gradient-to-b from-sky-400 to-blue-600 text-white shadow-[0_5px_0_#164a82,0_12px_24px_rgba(37,99,235,.2)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#164a82]";
	if (style === "flat") return isDark
		? "border border-sky-300/15 bg-sky-500 text-white shadow-sm hover:bg-sky-400 active:bg-sky-600"
		: "border border-[#16587B]/10 bg-[#16587B] text-white shadow-sm hover:bg-[#0F6A91] active:bg-[#104966]";
	return isDark
		? "border border-sky-100/25 bg-gradient-to-b from-sky-300 via-sky-500 to-blue-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_8px_22px_rgba(14,165,233,.25)] hover:brightness-110 active:brightness-95"
		: "border border-white/70 bg-gradient-to-b from-sky-300 via-sky-500 to-blue-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.55),0_8px_22px_rgba(14,116,190,.24)] hover:brightness-105 active:brightness-95";
}

export function campaignTitleClass(style: CampaignTitleStyle, isDark: boolean) {
	if (style === "editorial") return "font-serif text-[1.8rem] leading-tight tracking-[-.035em] sm:text-4xl";
	if (style === "glow") return `bg-gradient-to-r ${isDark ? "from-sky-100 via-cyan-200 to-blue-300" : "from-[#16587B] via-sky-600 to-blue-500"} bg-clip-text text-3xl font-black leading-tight tracking-[-.04em] text-transparent sm:text-4xl`;
	return "text-3xl font-black leading-tight tracking-[-.04em] sm:text-4xl";
}
