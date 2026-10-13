import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

export async function GET(request: Request) {
	const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(code)) {
		return NextResponse.json({ error: "Kode QR tidak valid." }, { status: 400 });
	}

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("resolve_public_qr", { p_code: code });
	const destination = Array.isArray(data) ? data[0] : data;
	if (error || !destination || typeof destination !== "object" || !("slug" in destination) || typeof destination.slug !== "string") {
		return NextResponse.json({ error: "QR tidak ditemukan atau destinasi belum diterbitkan." }, { status: 404 });
	}
	return NextResponse.json({ destinationSlug: destination.slug }, { headers: { "Cache-Control": "no-store" } });
}
