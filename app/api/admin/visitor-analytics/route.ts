import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const requestedDays = Number(url.searchParams.get("days") || 30);
	const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
	const supabase = await createClient();
	const { data: claims, error: claimsError } = await supabase.auth.getClaims();
	const userId = claims?.claims.sub;
	if (claimsError || !userId) return NextResponse.json({ error: "Sesi petugas tidak valid. Silakan masuk kembali." }, { status: 401 });
	const { data: staff, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
	if (roleError || !staff || !["admin", "editor"].includes(staff.role)) return NextResponse.json({ error: "Analitik hanya tersedia untuk petugas." }, { status: 403 });
	const { data, error } = await supabase.rpc("get_staff_tourism_analytics", { p_days: days });
	if (error) {
		console.error("Tourism analytics query failed", { code: error.code });
		return NextResponse.json({ error: error.code === "42883" ? "Migration insight pengunjung belum diterapkan di Supabase." : "Analitik belum dapat dimuat. Periksa migration dan hak akses petugas." }, { status: 503 });
	}
	return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
