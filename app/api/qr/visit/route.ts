import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

export async function POST(request: Request) {
	let input: { code?: unknown; source?: unknown };
	try { input = await request.json() as typeof input; }
	catch { return NextResponse.json({ error: "Data scan QR tidak terbaca." }, { status: 400 }); }
	const code = typeof input.code === "string" ? input.code.trim().toLowerCase() : "";
	const source = input.source === "camera" ? "camera" : "qr_link";
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) return NextResponse.json({ error: "Kode QR tidak valid." }, { status: 400 });
	try {
		const supabase = await createClient();
		const { data: current } = await supabase.auth.getUser();
		if (!current.user) {
			const { error: signInError } = await supabase.auth.signInAnonymously();
			if (signInError) return NextResponse.json({ error: "Sesi pengunjung belum siap. Muat ulang halaman." }, { status: 401 });
		}
		const { data, error } = await supabase.rpc("record_public_qr_visit", { p_code: code, p_source: source });
		if (error) throw error;
		const status = data?.error === "QR_NOT_FOUND" ? 404 : data?.error ? 400 : 200;
		return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
	} catch {
		return NextResponse.json({ error: "Scan belum dapat dicatat. Pastikan migration minigame programs sudah diterapkan." }, { status: 503 });
	}
}
