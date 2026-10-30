import "server-only";

export type WikipediaSource = {
	title: string;
	url: string;
	extract: string;
	language: "id" | "en";
};

type WikiPage = {
	title?: string;
	fullurl?: string;
	extract?: string;
};

type WikiResponse = {
	query?: {
		pages?: WikiPage[];
	};
};

type CacheEntry = {
	expiresAt: number;
	results: WikipediaSource[];
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;
const cache = new Map<string, CacheEntry>();
const STOP_WORDS = new Set([
	"apa", "apakah", "siapa", "bagaimana", "dimana", "di", "ke", "dari", "dan", "yang",
	"ini", "itu", "untuk", "tentang", "pada", "dengan", "saya", "aku", "kamu", "tolong",
	"jelaskan", "ceritakan", "dong", "ya", "the", "what", "who", "where", "when", "why",
	"how", "about", "is", "are", "was", "were", "for", "of", "in", "at", "to", "and",
]);

export function shouldSearchWikipedia(message: string) {
	if (/\b(hari ini|sekarang|terkini|terbaru|saat ini|harga|tiket|jam buka|cuaca|event|acara minggu ini|promo|lalu lintas|macet)\b/i.test(message)) return false;
	if (/^(hai|halo|helo|apa kabar|makasih|terima kasih|dadah|sampai jumpa)\b/i.test(message.trim())) return false;
	return /\b(sejarah|asal(?:-usul)?|budaya|kisah|cerita|legenda|makna|arti|filosofi|dibangun|diresmikan|pendiri|tokoh|arsitektur|warisan|heritage|monumen|terinspirasi|latar belakang|fakta menarik|fakta|informasi|keunikan|asal mula|referensi|sumber)\b/i.test(message)
		|| (/\b(apa|apakah|bagaimana|mengapa|kenapa|siapa|di mana|dimana|jelaskan|ceritakan)\b/i.test(message)
			&& /\b(wisata|destinasi|tempat|lokasi|spot|bangunan|patung|candi|monumen|objek|di sini|disini|di sana|disana)\b/i.test(message));
}

function buildSearchQuery(destinationName: string, message: string) {
	const sanitized = message
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
		.replace(/\b(?:\+?62|0)8[\d\s().-]{7,14}\b/g, " ")
		.replace(/\b\d{16}\b/g, " ")
		.replace(/[^\p{L}\p{N}\s-]/gu, " ")
		.toLowerCase();
	const topicWords = sanitized.split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)).slice(0, 7);
	return [destinationName, ...topicWords].join(" ").trim().slice(0, 180);
}

function isUsefulSource(page: WikiPage): page is Required<Pick<WikiPage, "title" | "fullurl" | "extract">> {
	return typeof page.title === "string"
		&& typeof page.fullurl === "string"
		&& page.fullurl.startsWith("https://")
		&& typeof page.extract === "string"
		&& page.extract.trim().length > 40;
}

async function searchLanguage(language: "id" | "en", query: string, signal: AbortSignal) {
	const cacheKey = language + ":" + query.toLocaleLowerCase();
	const existing = cache.get(cacheKey);
	if (existing && existing.expiresAt > Date.now()) return existing.results;

	const url = new URL("https://" + language + ".wikipedia.org/w/api.php");
	url.searchParams.set("action", "query");
	url.searchParams.set("generator", "search");
	url.searchParams.set("gsrsearch", query);
	url.searchParams.set("gsrnamespace", "0");
	url.searchParams.set("gsrlimit", "3");
	url.searchParams.set("prop", "extracts|info");
	url.searchParams.set("exintro", "1");
	url.searchParams.set("explaintext", "1");
	url.searchParams.set("inprop", "url");
	url.searchParams.set("format", "json");
	url.searchParams.set("formatversion", "2");

	const response = await fetch(url, {
		headers: {
			"Api-User-Agent": "TiLoc tourism guide/1.0 (https://website-pariwisata-phi.vercel.app)",
			Accept: "application/json",
		},
		signal,
		cache: "no-store",
	});
	if (!response.ok) throw new Error(response.status === 429 ? "WIKIPEDIA_RATE_LIMITED" : "WIKIPEDIA_SEARCH_FAILED");

	const data = await response.json() as WikiResponse;
	const results = (data.query?.pages ?? [])
		.filter(isUsefulSource)
		.slice(0, 3)
		.map((page) => ({
			title: page.title,
			url: page.fullurl,
			extract: page.extract.trim().slice(0, 900),
			language,
		}));
	cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });
	if (cache.size > CACHE_MAX_ENTRIES) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey) cache.delete(oldestKey);
	}
	return results;
}

export async function searchWikipedia(destinationName: string, message: string, signal: AbortSignal) {
	const query = buildSearchQuery(destinationName, message);
	if (!query) return [];

	try {
		const queries = [...new Set([query, destinationName.trim()].filter(Boolean))];
		for (const language of ["id", "en"] as const) {
			for (const candidate of queries) {
				const results = await searchLanguage(language, candidate.slice(0, 180), signal);
				if (results.length > 0) return results;
			}
		}
		return [];
	} catch (error) {
		if (signal.aborted) throw error;
		console.warn("Wikipedia reference search unavailable", {
			reason: error instanceof Error ? error.message : "unknown",
		});
		return [];
	}
}

export async function searchWikipediaForEnhancement(destinationName: string, address: string, signal: AbortSignal) {
	const cleanAddress = address.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ").replace(/\b(?:\+?62|0)8[\d\s().-]{7,14}\b/g, " ").replace(/[^\p{L}\p{N}\s-]/gu, " ").trim();
	const queries = [...new Set([destinationName.trim(), cleanAddress ? `${destinationName.trim()} ${cleanAddress}` : ""].filter(Boolean))];
	try {
		for (const language of ["id", "en"] as const) {
			for (const query of queries) {
				const results = await searchLanguage(language, query.slice(0, 180), signal);
				if (results.length) return results;
			}
		}
		return [];
	} catch (error) {
		if (signal.aborted) throw error;
		console.warn("Wikipedia destination enhancement search unavailable", { reason: error instanceof Error ? error.message : "unknown" });
		return [];
	}
}
