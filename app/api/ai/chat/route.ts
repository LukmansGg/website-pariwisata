import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { streamTourismQuestion } from "@/src/server/ai/openrouter";
import { checkAiChatLimit, reserveOpenRouterRequest } from "@/src/server/ai/rate-limit";
import { searchWikipedia, shouldSearchWikipedia } from "@/src/server/ai/wikipedia";

export const maxDuration = 60;

const SERVER_TIMEOUT_MS = 48_000;

function errorMessage(error: unknown, timedOut: boolean) {
	if (timedOut) return "Pemandu masih sibuk menyusun jawaban. Coba kirim lagi sebentar ya.";
	if (!(error instanceof Error)) return "Pemandu belum berhasil terhubung. Coba lagi sebentar ya.";
	switch (error.message) {
		case "AI_VISITOR_LIMIT":
			return "Kamu sedang banyak bertanya dalam waktu singkat. Istirahat sebentar lalu coba lagi ya.";
		case "AI_RATE_LIMITER_UNAVAILABLE":
			return "Layanan chat belum siap. Coba lagi nanti ya.";
		case "DESTINATION_LOOKUP_FAILED":
			return "Info destinasi belum dapat dimuat. Coba lagi sebentar ya.";
		case "DESTINATION_NOT_FOUND":
			return "Destinasi ini belum tersedia untuk pemandu AI.";
		case "OPENROUTER_DAILY_LIMIT":
			return "Kuota AI gratis hari ini sudah penuh. Coba lagi setelah kuota harian pulih ya.";
		case "OPENROUTER_MINUTE_LIMIT":
			return "Pemandu sedang ramai dipakai. Tunggu sebentar lalu coba lagi ya.";
		case "OPENROUTER_UPSTREAM_RATE_LIMITED":
			return "Model AI gratis sedang sibuk. Coba lagi sebentar ya.";
		default:
			return "Pemandu belum berhasil terhubung. Coba lagi sebentar ya.";
	}
}

export async function POST(request: Request) {
	let body: unknown;
	const declaredLength = Number(request.headers.get("content-length") ?? 0);
	if (declaredLength > 20_000) return NextResponse.json({ error: "Permintaan terlalu besar." }, { status: 413 });
	try {
		const rawBody = await request.text();
		if (new TextEncoder().encode(rawBody).byteLength > 20_000) return NextResponse.json({ error: "Permintaan terlalu besar." }, { status: 413 });
		body = JSON.parse(rawBody);
	} catch {
		return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
	}
	if (!body || typeof body !== "object") return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
	const { destinationSlug, message } = body as Record<string, unknown>;
	if (typeof destinationSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destinationSlug) || typeof message !== "string" || !message.trim() || message.length > 600) {
		return NextResponse.json({ error: "Pertanyaan wajib diisi dan maksimal 600 karakter." }, { status: 400 });
	}

	const apiKey = process.env.OPENROUTER_API_KEY?.trim();
	if (!apiKey) return NextResponse.json({ error: "Pemandu AI belum dikonfigurasi." }, { status: 503 });
	const ipAddress = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const encoder = new TextEncoder();
	const abortController = new AbortController();
	let cancelled = false;
	let timedOut = false;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const emit = (event: string, data: unknown) => {
				if (closed || cancelled) return;
				try {
					controller.enqueue(encoder.encode("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n"));
				} catch {
					cancelled = true;
					abortController.abort();
				}
			};
			const close = () => {
				if (closed || cancelled) return;
				closed = true;
				controller.close();
			};

			void (async () => {
				try {
					timeoutId = setTimeout(() => {
						timedOut = true;
						abortController.abort();
					}, SERVER_TIMEOUT_MS);
					emit("status", { message: "Memeriksa akses pemandu…" });
					let visitorLimit;
					try {
						visitorLimit = await checkAiChatLimit(ipAddress);
					} catch {
						throw new Error("AI_RATE_LIMITER_UNAVAILABLE");
					}
					if (!visitorLimit.allowed) throw new Error("AI_VISITOR_LIMIT");

					emit("status", { message: "Membaca info destinasi dari pengelola…" });
					const supabase = await createClient();
					const { data: destination, error } = await supabase
						.from("destinations")
						.select("name, category, categories, short_description, address, description, tags")
						.eq("slug", destinationSlug)
						.eq("is_published", true)
						.maybeSingle();
					if (error) {
						console.error("AI destination lookup failed", { code: error.code });
						throw new Error("DESTINATION_LOOKUP_FAILED");
					}
					if (!destination) throw new Error("DESTINATION_NOT_FOUND");

					let providerLimit;
					try {
						providerLimit = await reserveOpenRouterRequest();
					} catch {
						throw new Error("AI_RATE_LIMITER_UNAVAILABLE");
					}
					if (!providerLimit.allowed) {
						throw new Error(providerLimit.reason === "minute" ? "OPENROUTER_MINUTE_LIMIT" : "OPENROUTER_DAILY_LIMIT");
					}

					let wikipediaSources = [] as Awaited<ReturnType<typeof searchWikipedia>>;
					if (shouldSearchWikipedia(message)) {
						emit("status", { message: "Mencari referensi yang relevan di Wikipedia…" });
						wikipediaSources = await searchWikipedia(destination.name, message, abortController.signal);
					}
					if (wikipediaSources.length > 0) {
						emit("status", { message: "Referensi ditemukan. Menyusun jawaban yang jelas…" });
					} else {
						emit("status", { message: "Wikipedia belum menemukan rujukan yang cocok. Mengolah data pengelola…" });
					}

					await streamTourismQuestion({
						apiKey,
						destination,
						message,
						wikipediaSources,
						signal: abortController.signal,
						onToken: (text) => emit("token", { text }),
					});
					emit("done", {
						wikipediaSearched: wikipediaSources.length > 0,
						sources: wikipediaSources.map(({ title, url, language }) => ({ title, url, language })),
					});
				} catch (error) {
					if (!cancelled) {
						const reason = error instanceof Error ? error.message : "unknown";
						if (reason === "OPENROUTER_RATE_LIMITED") error = new Error("OPENROUTER_UPSTREAM_RATE_LIMITED");
						console.warn("Tourism AI request ended", { reason: timedOut ? "timeout" : reason });
						emit("error", { message: errorMessage(error, timedOut) });
					}
				} finally {
					if (timeoutId) clearTimeout(timeoutId);
					close();
				}
			})();
		},
		cancel() {
			cancelled = true;
			if (timeoutId) clearTimeout(timeoutId);
			abortController.abort();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
