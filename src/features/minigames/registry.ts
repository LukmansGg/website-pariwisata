export const minigameComponentRegistry = {
	find_friends: {
		label: "Find Our Friends",
		icon: "🐾",
		note: "Misi jelajah QR dengan teman dan prasyarat antartitik.",
		role: "mission",
		setupKind: "qr_group",
		progressKind: "qr_points",
	},
	photobox: {
		label: "Photobox",
		icon: "📸",
		note: "Studio foto dengan bingkai, kolase, dan opsi hadiah.",
		role: "reward",
		setupKind: "photo_studio",
		progressKind: "photo_count",
	},
	chat_ai: {
		label: "Pemandu AI",
		icon: "✨",
		note: "Pemandu destinasi; tidak dihitung sebagai misi.",
		role: "guide",
		setupKind: "destination_context",
		progressKind: "none",
	},
} as const;

export type MinigameComponentKey = keyof typeof minigameComponentRegistry;

export function isMinigameComponentKey(value: string): value is MinigameComponentKey {
	return Object.prototype.hasOwnProperty.call(minigameComponentRegistry, value);
}

export function getMinigameComponent(value: string) {
	return isMinigameComponentKey(value) ? minigameComponentRegistry[value] : null;
}

export function missionComponentKeys(values: readonly string[]): MinigameComponentKey[] {
	return values.filter(
		(value): value is MinigameComponentKey =>
			isMinigameComponentKey(value) && minigameComponentRegistry[value].role === "mission",
	);
}
