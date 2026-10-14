import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

export async function POST(request: Request) {
	let destinationSlug = "";
	try {
		const body: unknown = await request.json();
		if (body && typeof body === "object" && "destinationSlug" in body && typeof body.destinationSlug === "string") {
			destinationSlug = body.destinationSlug.trim();
		}
	} catch { return NextResponse.json({ error: "Data photobox tidak terbaca." }, { status: 400 }); }
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destinationSlug)) {
		return NextResponse.json({ error: "Destinasi tidak valid." }, { status: 400 });
	}

	try {
		const supabase = await createClient();
		let { data: userData } = await supabase.auth.getUser();
		if (!userData.user) {
			const { data, error: signInError } = await supabase.auth.signInAnonymously();
			if (signInError) return NextResponse.json({ error: "Sesi pengunjung belum siap. Muat ulang halaman." }, { status: 401 });
			userData = data;
		}
		const { data, error } = await supabase.rpc("record_public_photobox_creation", { p_destination_slug: destinationSlug });
		if (error) throw error;
		const status = data?.error === "PHOTOBOX_LOCKED" ? 403 : data?.error ? 400 : 200;
		return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
	} catch {
		return NextResponse.json({ error: "Photobox belum dapat disimpan. Pastikan migration minigame sudah diterapkan." }, { status: 503 });
	}
}
