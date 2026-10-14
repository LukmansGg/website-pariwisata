import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

type ScanInput = { programSlug?: unknown; destinationSlug?: unknown; code?: unknown; source?: unknown };

export async function POST(request: Request) {
	let body: ScanInput;
	try { body = await request.json() as ScanInput; }
	catch { return NextResponse.json({ error: "Data scan tidak terbaca." }, { status: 400 }); }

	const slug = typeof body.destinationSlug === "string" ? body.destinationSlug.trim() : "";
	const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
	const programSlug = typeof body.programSlug === "string" ? body.programSlug.trim().toLowerCase() : "";
	const source = body.source === "camera" ? "camera" : "qr_link";
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(programSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) {
		return NextResponse.json({ error: "QR atau nama program tidak valid." }, { status: 400 });
	}

	try {
		const supabase = await createClient();
		let { data: userData } = await supabase.auth.getUser();
		if (!userData.user) {
			const { data, error: signInError } = await supabase.auth.signInAnonymously();
			if (signInError) return NextResponse.json({ error: "Sesi pengunjung belum siap. Muat ulang halaman." }, { status: 401 });
			userData = data;
		}
		const { data, error } = await supabase.rpc("record_public_minigame_scan", {
			p_program_slug: programSlug,
			p_destination_slug: slug,
			p_code: code,
			p_source: source,
		});
		if (error) throw error;
		const status = data?.error === "PHOTOBOX_LOCKED" ? 403 : data?.error ? 400 : 200;
		return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
	} catch {
		return NextResponse.json({ error: "Scan belum dapat diproses. Pastikan migration minigame sudah diterapkan." }, { status: 503 });
	}
}
