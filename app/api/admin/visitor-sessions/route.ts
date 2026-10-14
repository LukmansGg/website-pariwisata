import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

type SessionRow = {
	id: string;
	visitor_id: string;
	destination_id: string;
	started_at: string;
	last_activity_at: string;
	expires_at: string;
	status: "active" | "expired" | "ended";
	updated_at: string;
};

function jakartaDate(value: Date) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Jakarta",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(value);
}

export async function GET() {
	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	if (claimsError || !userId) {
		return NextResponse.json({ error: "Sesi petugas tidak valid. Silakan login kembali." }, { status: 401 });
	}

	const { data: staff, error: roleError } = await supabase
		.from("user_roles")
		.select("role")
		.eq("user_id", userId)
		.maybeSingle();
	if (roleError || !staff || !["admin", "editor"].includes(staff.role)) {
		return NextResponse.json({ error: "Pemantauan sesi hanya tersedia untuk petugas." }, { status: 403 });
	}

	const now = new Date();
	const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
	const { data, error } = await supabase
		.from("tourism_visitor_sessions")
		.select("id, visitor_id, destination_id, started_at, last_activity_at, expires_at, status, updated_at")
		.gte("started_at", since)
		.order("started_at", { ascending: false })
		.limit(1000);

	if (error) {
		console.error("Visitor session monitor query failed", { code: error.code });
		const missingTable = error.code === "42P01" || error.code === "PGRST205";
		return NextResponse.json({
			error: missingTable
				? "Tabel pemantauan belum tersedia. Jalankan migration visitor_session_monitor di Supabase."
				: "Data sesi belum dapat dibaca. Periksa migration dan policy akses Supabase.",
		}, { status: 503 });
	}

	const rows = (data ?? []) as SessionRow[];
	const destinationIds = [...new Set(rows.map((row) => row.destination_id))];
	const { data: destinations, error: destinationsError } = destinationIds.length
		? await supabase.from("destinations").select("id, name").in("id", destinationIds)
		: { data: [], error: null };
	if (destinationsError) {
		console.error("Visitor session destination labels query failed", { code: destinationsError.code });
	}
	const destinationNames = new Map((destinations ?? []).map((destination) => [destination.id, destination.name]));
	const today = jakartaDate(now);
	const sessionsToday = rows.filter((row) => jakartaDate(new Date(row.started_at)) === today);
	const active = rows.filter((row) => row.status === "active" && new Date(row.expires_at).getTime() > now.getTime());
	const popularity = new Map<string, { name: string; count: number }>();
	for (const row of sessionsToday) {
		const name = destinationNames.get(row.destination_id) ?? "Destinasi tidak diketahui";
		const item = popularity.get(row.destination_id) ?? { name, count: 0 };
		item.count += 1;
		popularity.set(row.destination_id, item);
	}
	const busiest = [...popularity.values()].sort((left, right) => right.count - left.count)[0] ?? null;
	const durations = sessionsToday.map((row) => {
		const isActive = row.status === "active" && new Date(row.expires_at).getTime() > now.getTime();
		const end = isActive ? now.getTime() : new Date(row.last_activity_at).getTime();
		return Math.max(0, end - new Date(row.started_at).getTime());
	});
	const averageDurationMinutes = durations.length
		? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length / 60_000)
		: 0;

	return NextResponse.json({
		updatedAt: now.toISOString(),
		metrics: {
			sessionsToday: sessionsToday.length,
			activeNow: active.length,
			averageDurationMinutes,
			busiestDestination: busiest,
		},
		sessions: rows.slice(0, 30).map((row) => ({
			id: row.id,
			visitorLabel: `Explorer ${row.visitor_id.slice(-4).toUpperCase()}`,
			destinationName: destinationNames.get(row.destination_id) ?? "Destinasi tidak diketahui",
			startedAt: row.started_at,
			lastActivityAt: row.last_activity_at,
			expiresAt: row.expires_at,
			status: row.status === "active" && new Date(row.expires_at).getTime() > now.getTime() ? "active" : row.status === "active" ? "expired" : row.status,
		})),
	}, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
