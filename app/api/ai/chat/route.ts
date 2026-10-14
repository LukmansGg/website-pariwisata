import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { answerTourismQuestion } from "@/src/server/ai/gemini";
import { checkAiChatLimit } from "@/src/server/ai/rate-limit";

type ChatTurn = { role: "user" | "model"; text: string };

function validHistory(value: unknown): ChatTurn[] | null {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > 6) return null;
	const turns: ChatTurn[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") return null;
		const { role, text } = item as Record<string, unknown>;
		if ((role !== "user" && role !== "model") || typeof text !== "string" || !text.trim() || text.length > 1200) return null;
		turns.push({ role, text: text.trim() });
	}
	return turns;
}

export async function POST(request: Request) {
	let body: unknown;
	const declaredLength = Number(request.headers.get("content-length") ?? 0);
	if (declaredLength > 20_000) return NextResponse.json({ error: "Permintaan terlalu besar." }, { status: 413 });
	try {
		const rawBody = await request.text();
		if (new TextEncoder().encode(rawBody).byteLength > 20_000) return NextResponse.json({ error: "Permintaan terlalu besar." }, { status: 413 });
		body = JSON.parse(rawBody);
	} catch { return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
	if (!body || typeof body !== "object") return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
	const { destinationSlug, message, history } = body as Record<string, unknown>;
	if (typeof destinationSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destinationSlug) || typeof message !== "string" || !message.trim() || message.length > 600) {
		return NextResponse.json({ error: "Pertanyaan wajib diisi dan maksimal 600 karakter." }, { status: 400 });
	}
	const safeHistory = validHistory(history);
	if (!safeHistory) return NextResponse.json({ error: "Riwayat percakapan tidak valid." }, { status: 400 });

	const ipAddress = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	try {
		const limit = await checkAiChatLimit(ipAddress);
		if (!limit.allowed) {
			return NextResponse.json({ error: "Batas pertanyaan tercapai. Silakan coba lagi nanti." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) } });
		}
	} catch (error) {
		console.error("AI rate limiter unavailable", error);
		return NextResponse.json({ error: "Layanan chat belum siap. Periksa konfigurasi Redis." }, { status: 503 });
	}

	try {
		const supabase = await createClient();
		const { data: destination, error } = await supabase
			.from("destinations")
			.select("name, category, address, description, tags")
			.eq("slug", destinationSlug)
			.eq("is_published", true)
			.not("image_url", "is", null)
			.not("latitude", "is", null)
			.not("longitude", "is", null)
			.maybeSingle();
		if (error) {
			console.error("AI destination lookup failed", error);
			return NextResponse.json({ error: "Data destinasi belum dapat dimuat." }, { status: 500 });
		}
		if (!destination) return NextResponse.json({ error: "Destinasi tidak ditemukan atau belum tayang." }, { status: 404 });

		const reply = await answerTourismQuestion({ destination, history: safeHistory, message: message.trim() });
		return NextResponse.json({ reply }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") return NextResponse.json({ error: "Asisten sedang lambat merespons. Coba lagi sebentar." }, { status: 504 });
		const reason = error instanceof Error ? error.message : "";
		if (reason === "AI_PROVIDER_NOT_CONFIGURED") return NextResponse.json({ error: "AI belum aktif. Tambahkan kunci Gemini di environment server." }, { status: 503 });
		if (reason === "AI_PROVIDER_RATE_LIMITED") return NextResponse.json({ error: "Kuota AI sedang penuh. Coba lagi sebentar." }, { status: 429 });
		if (reason === "AI_PROVIDER_UNAVAILABLE") return NextResponse.json({ error: "Layanan AI sedang tidak tersedia. Coba lagi nanti." }, { status: 503 });
		console.error("Tourism AI request failed", error);
		return NextResponse.json({ error: "Jawaban belum dapat dibuat. Coba lagi nanti." }, { status: 502 });
	}
}
