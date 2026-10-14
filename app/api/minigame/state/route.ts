import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

async function ensureVisitor(supabase: Awaited<ReturnType<typeof createClient>>) {
	const { data } = await supabase.auth.getUser();
	if (data.user) return true;
	const { error } = await supabase.auth.signInAnonymously();
	return !error;
}

export async function GET(request: Request) {
	const slug = new URL(request.url).searchParams.get("destinationSlug")?.trim();
	if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		return NextResponse.json({ error: "Destinasi tidak valid." }, { status: 400 });
	}

	try {
		const supabase = await createClient();
		if (!(await ensureVisitor(supabase))) {
			return NextResponse.json({ error: "Sesi pengunjung belum siap. Muat ulang halaman." }, { status: 401 });
		}
		const { data, error } = await supabase.rpc("get_public_minigame_state", { p_destination_slug: slug });
		if (error) throw error;
		if (data?.error === "DESTINATION_NOT_FOUND") {
			return NextResponse.json({ error: "Destinasi tidak ditemukan." }, { status: 404 });
		}
		return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
	} catch {
		return NextResponse.json({ error: "Data petualangan belum dapat dimuat. Pastikan migration minigame sudah diterapkan." }, { status: 503 });
	}
}
