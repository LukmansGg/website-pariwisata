import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

type SurveyScope = "website" | "destination";

async function ensureVisitor(supabase: Awaited<ReturnType<typeof createClient>>) {
	const { data: current } = await supabase.auth.getUser();
	if (current.user) return current.user;
	const { error } = await supabase.auth.signInAnonymously();
	if (error) return null;
	const { data: signedIn } = await supabase.auth.getUser();
	return signedIn.user;
}

async function resolveTarget(supabase: Awaited<ReturnType<typeof createClient>>, scope: SurveyScope, destinationSlug: string) {
	if (scope === "website") return { id: null, name: null };
	if (!destinationSlug || destinationSlug.length > 120) return null;
	const { data, error } = await supabase.from("destinations").select("id,name").eq("slug", destinationSlug).eq("is_published", true).maybeSingle();
	if (error || !data) return null;
	return { id: data.id, name: data.name };
}

function validScope(value: string | null): value is SurveyScope {
	return value === "website" || value === "destination";
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const scopeValue = url.searchParams.get("scope");
	if (!validScope(scopeValue)) return NextResponse.json({ error: "Jenis survei tidak valid." }, { status: 400 });
	try {
		const supabase = await createClient();
		const visitor = await ensureVisitor(supabase);
		if (!visitor) return NextResponse.json({ error: "Sesi pengunjung belum siap." }, { status: 401 });
		const target = await resolveTarget(supabase, scopeValue, url.searchParams.get("destinationSlug") ?? "");
		if (!target) return NextResponse.json({ error: "Wisata tidak ditemukan." }, { status: 404 });
		const { data, error } = await supabase.rpc("get_tourism_survey_status", { p_scope: scopeValue, p_destination_id: target.id });
		if (error) throw error;
		return NextResponse.json({ ...(data as Record<string, unknown>), scope: scopeValue, destinationName: target.name }, { headers: { "Cache-Control": "no-store, max-age=0" } });
	} catch {
		return NextResponse.json({ error: "Status survei belum dapat dimuat. Pastikan migration insight pengunjung sudah diterapkan." }, { status: 503 });
	}
}

export async function POST(request: Request) {
	let body: Record<string, unknown>;
	try {
		const parsed = await request.json() as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "Jawaban survei tidak valid." }, { status: 400 });
		body = parsed as Record<string, unknown>;
	} catch { return NextResponse.json({ error: "Jawaban survei tidak terbaca." }, { status: 400 }); }
	const scope = body.scope;
	const rating = body.rating;
	const suggestion = typeof body.suggestion === "string" ? body.suggestion.trim() : "";
	const destinationSlug = typeof body.destinationSlug === "string" ? body.destinationSlug.trim() : "";
	if ((scope !== "website" && scope !== "destination") || !Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5
		|| suggestion.length > 1500 || (scope === "website" && destinationSlug)) {
		return NextResponse.json({ error: "Isi penilaian bintang 1–5 dan periksa kembali sarannya." }, { status: 400 });
	}
	try {
		const supabase = await createClient();
		const visitor = await ensureVisitor(supabase);
		if (!visitor) return NextResponse.json({ error: "Sesi pengunjung belum siap." }, { status: 401 });
		const target = await resolveTarget(supabase, scope, destinationSlug);
		if (!target) return NextResponse.json({ error: "Wisata tidak ditemukan." }, { status: 404 });
		const { data, error } = await supabase.rpc("submit_tourism_survey", {
			p_scope: scope,
			p_destination_id: target.id,
			p_rating: rating,
			p_suggestion: suggestion || null,
		});
		if (error) throw error;
		const result = data as { error?: string; status?: string };
		if (result?.error) return NextResponse.json({ error: result.error }, { status: 400 });
		return NextResponse.json(result, { status: result?.status === "already_submitted" ? 409 : 200, headers: { "Cache-Control": "no-store, max-age=0" } });
	} catch {
		return NextResponse.json({ error: "Penilaian belum tersimpan. Coba lagi sebentar." }, { status: 503 });
	}
}
