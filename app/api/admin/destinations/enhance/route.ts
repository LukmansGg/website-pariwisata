import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { enhanceDestinationDescription } from "@/src/server/ai/openrouter";
import { reserveOpenRouterRequest } from "@/src/server/ai/rate-limit";
import { searchWikipediaForEnhancement } from "@/src/server/ai/wikipedia";

export const maxDuration = 60;

const MAX_DESCRIPTION_CHARACTERS = 30000;
const SERVER_TIMEOUT_MS = 48_000;

export async function POST(request: Request) {
	const declaredLength = Number(request.headers.get("content-length") ?? 0);
	if (declaredLength > 100_000) return NextResponse.json({ error: "Draf deskripsi terlalu panjang." }, { status: 413 });

	let body: unknown;
	try {
		const rawBody = await request.text();
		if (new TextEncoder().encode(rawBody).byteLength > 100_000) return NextResponse.json({ error: "Draf deskripsi terlalu panjang." }, { status: 413 });
		body = JSON.parse(rawBody);
	} catch {
		return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
	}
	if (!body || typeof body !== "object") return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
	const input = body as Record<string, unknown>;
	const name = typeof input.name === "string" ? input.name.trim().slice(0, 160) : "";
	const address = typeof input.address === "string" ? input.address.trim().slice(0, 500) : "";
	const description = typeof input.description === "string" ? input.description.trim() : "";
	if (!name || !description || description.length > MAX_DESCRIPTION_CHARACTERS || description.split(/\s+/).length > 1500) {
		return NextResponse.json({ error: "Isi nama dan deskripsi terlebih dahulu. Batas deskripsi 1.500 kata." }, { status: 400 });
	}

	const supabase = await createClient();
	const { data: claims, error: claimsError } = await supabase.auth.getClaims();
	const userId = claims?.claims.sub;
	if (claimsError || !userId) return NextResponse.json({ error: "Masuk sebagai petugas untuk memakai Enhance." }, { status: 401 });
	const { data: staff, error: staffError } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
	if (staffError) return NextResponse.json({ error: "Hak akses petugas belum dapat diperiksa." }, { status: 503 });
	if (!staff || !["admin", "editor", "destination_manager"].includes(staff.role)) {
		return NextResponse.json({ error: "Fitur ini hanya tersedia untuk petugas pengelola." }, { status: 403 });
	}

	const apiKey = process.env.OPENROUTER_API_KEY?.trim();
	if (!apiKey) return NextResponse.json({ error: "Layanan Enhance belum dikonfigurasi." }, { status: 503 });
	try {
		const limit = await reserveOpenRouterRequest();
		if (!limit.allowed) return NextResponse.json({ error: limit.reason === "minute" ? "AI sedang ramai. Tunggu sebentar lalu coba lagi." : "Kuota AI gratis hari ini sudah penuh. Coba lagi besok." }, { status: 429 });
	} catch {
		return NextResponse.json({ error: "Pembatas pemakaian AI belum siap. Coba lagi nanti." }, { status: 503 });
	}

	const controller = new AbortController();
	let timedOut = false;
	const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, SERVER_TIMEOUT_MS);
	try {
		const sources = await searchWikipediaForEnhancement(name, address, controller.signal);
		const enhancedDescription = await enhanceDestinationDescription({ apiKey, name, address, description, wikipediaSources: sources, signal: controller.signal });
		return NextResponse.json({ enhancedDescription, sources: sources.map(({ title, url, language }) => ({ title, url, language })) });
	} catch (error) {
		const reason = error instanceof Error ? error.message : "unknown";
		console.warn("Destination description enhancement failed", { reason: timedOut ? "timeout" : reason });
		if (timedOut) return NextResponse.json({ error: "Enhance masih menyusun hasil. Coba lagi sebentar ya." }, { status: 504 });
		if (reason === "OPENROUTER_RATE_LIMITED") return NextResponse.json({ error: "Model AI sedang sibuk. Tunggu sebentar lalu coba lagi." }, { status: 429 });
		return NextResponse.json({ error: "AI belum berhasil menyempurnakan deskripsi. Teks awalmu tetap aman; coba lagi sebentar." }, { status: 502 });
	} finally {
		clearTimeout(timeout);
	}
}
