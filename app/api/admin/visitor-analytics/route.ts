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
	if (roleError || !staff || staff.role !== "admin") return NextResponse.json({ error: "Analitik dan masukan pengunjung hanya tersedia untuk admin." }, { status: 403 });
	const { data, error } = await supabase.rpc("get_staff_tourism_analytics", { p_days: days });
	if (error) {
		console.error("Tourism analytics query failed", { code: error.code });
		const migrationMissing = ["42883", "42P01"].includes(error.code ?? "");
		const apiSchemaStale = ["PGRST202", "PGRST205"].includes(error.code ?? "");
		const accessDenied = ["42501", "PGRST301"].includes(error.code ?? "");
		const message = migrationMissing
			? "Data analitik belum tersedia di database. Jalankan migration 20261026000000_visitor_insights_and_campaign_forms.sql di Supabase sampai selesai."
			: apiSchemaStale
				? "Fungsi atau tabel analitik belum terbaca oleh Supabase API. Pastikan migration selesai, lalu refresh schema cache Supabase dan muat ulang halaman."
			: accessDenied
				? "Akses analitik ditolak. Pastikan akun memiliki role admin dan migration analitik sudah selesai."
				: error.code === "42703"
					? "Struktur database analitik belum cocok. Periksa apakah migration visitor_insights_and_campaign_forms selesai tanpa error, lalu jalankan ulang jika belum."
					: "Analitik belum dapat dimuat. Periksa status migration dan log database untuk detail error.";
		return NextResponse.json({ error: message }, { status: accessDenied ? 403 : 503 });
	}
	return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
