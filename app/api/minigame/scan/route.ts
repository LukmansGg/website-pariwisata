import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

type ScanInput = { destinationSlug?: unknown; code?: unknown; latitude?: unknown; longitude?: unknown };

export async function POST(request: Request) {
	let body: ScanInput;
	try { body = await request.json() as ScanInput; }
	catch { return NextResponse.json({ error: "Data scan tidak terbaca." }, { status: 400 }); }

	const slug = typeof body.destinationSlug === "string" ? body.destinationSlug.trim() : "";
	const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
	const latitude = typeof body.latitude === "number" ? body.latitude : NaN;
	const longitude = typeof body.longitude === "number" ? body.longitude : NaN;
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)
		|| !Number.isFinite(latitude) || !Number.isFinite(longitude)
		|| latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
		return NextResponse.json({ error: "QR atau lokasi tidak valid." }, { status: 400 });
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
			p_destination_slug: slug,
			p_code: code,
			p_latitude: latitude,
			p_longitude: longitude,
		});
		if (error) throw error;
		const status = data?.error === "OUT_OF_ORDER" ? 409
			: data?.error === "TOO_FAR" || data?.error === "ROUTE_GAP" || data?.error === "LOCATION_REQUIRED" ? 422
			: data?.error ? 400 : 200;
		return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
	} catch {
		return NextResponse.json({ error: "Scan belum dapat diproses. Pastikan migration minigame sudah diterapkan." }, { status: 503 });
	}
}
