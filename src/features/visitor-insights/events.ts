export type VisitorEventName = "page_view" | "destination_view" | "feature_use" | "campaign_impression" | "campaign_click";
export type VisitorPageKey = "home" | "destination" | "minigame" | "photobox" | "scan" | "map" | "other";
export type VisitorFeatureKey = "destination_dashboard" | "find_friends" | "photobox" | "chat_ai" | "qr_scan" | "map" | "other";

export function createEventKey() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
		const random = Math.floor(Math.random() * 16);
		return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
	});
}

export async function trackVisitorEvent(event: {
	eventName: VisitorEventName;
	eventKey?: string;
	pageKey?: VisitorPageKey;
	featureKey?: VisitorFeatureKey;
	destinationSlug?: string;
	campaignId?: string;
}) {
	try {
		await fetch("/api/analytics/event", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			keepalive: true,
			body: JSON.stringify({ ...event, eventKey: event.eventKey ?? createEventKey() }),
		});
	} catch { /* Analytics must never block the visitor experience. */ }
}
