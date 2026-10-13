import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: RouteContext) {
	const { code } = await params;
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) {
		return new NextResponse("QR tidak valid.", { status: 404 });
	}

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("resolve_public_qr", { p_code: code });
	const destination = Array.isArray(data) ? data[0] : data;
	if (error || !destination || typeof destination !== "object" || !("slug" in destination) || typeof destination.slug !== "string") {
		return new NextResponse("QR tidak ditemukan atau sedang nonaktif.", { status: 404 });
	}

	const target = new URL(`/wisata/${encodeURIComponent(destination.slug)}`, request.url);
	target.searchParams.set("qr", code);
	return NextResponse.redirect(target, 307);
}
