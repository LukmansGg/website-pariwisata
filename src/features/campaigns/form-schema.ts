export type CampaignInputType = "text" | "email" | "tel";

export type CampaignFormBlock =
	| { id: string; type: "label"; text: string }
	| { id: string; type: "input"; label: string; placeholder: string; inputType: CampaignInputType; required: boolean; maxLength: number }
	| { id: string; type: "choice" | "dropdown"; label: string; options: string[]; required: boolean }
	| { id: string; type: "button"; label: string; action: "submit" | "link"; url?: string };

const ID_PATTERN = /^[a-z0-9_-]{1,40}$/;
const SAFE_URL_PATTERN = /^(https?:\/\/[^\s]+|\/(?!\/)[^\s\\]*)$/i;

function text(value: unknown, maxLength: number) {
	return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function parseCampaignFormSchema(value: unknown): CampaignFormBlock[] | null {
	if (!Array.isArray(value) || value.length > 12) return null;
	const seen = new Set<string>();
	const blocks: CampaignFormBlock[] = [];
	for (const raw of value) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
		const block = raw as Record<string, unknown>;
		const id = typeof block.id === "string" ? block.id : "";
		if (!ID_PATTERN.test(id) || seen.has(id)) return null;
		seen.add(id);
		if (block.type === "label") {
			const content = text(block.text, 180);
			if (!content) return null;
			blocks.push({ id, type: "label", text: content });
		} else if (block.type === "input") {
			const label = text(block.label, 80);
			const inputType: CampaignInputType = block.inputType === "email" || block.inputType === "tel" ? block.inputType : "text";
			const maxLength = Number(block.maxLength);
			if (!label || !Number.isInteger(maxLength) || maxLength < 2 || maxLength > 240) return null;
			blocks.push({ id, type: "input", label, placeholder: text(block.placeholder, 100), inputType, required: block.required === true, maxLength });
		} else if (block.type === "choice" || block.type === "dropdown") {
			const label = text(block.label, 80);
			if (!label || !Array.isArray(block.options)) return null;
			const options = [...new Set(block.options.map((item) => text(item, 80)).filter(Boolean))];
			if (options.length < 2 || options.length > 10) return null;
			blocks.push({ id, type: block.type, label, options, required: block.required === true });
		} else if (block.type === "button") {
			const label = text(block.label, 60);
			if (!label || (block.action !== "submit" && block.action !== "link")) return null;
			if (block.action === "link") {
				const url = text(block.url, 2048);
				if (!SAFE_URL_PATTERN.test(url)) return null;
				blocks.push({ id, type: "button", label, action: "link", url });
			} else blocks.push({ id, type: "button", label, action: "submit" });
		} else return null;
	}
	if (blocks.some((block) => block.type === "button" && block.action === "submit")
		&& !blocks.some((block) => block.type === "input" || block.type === "choice" || block.type === "dropdown")) return null;
	return blocks;
}
