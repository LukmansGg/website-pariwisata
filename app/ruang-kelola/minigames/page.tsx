import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/infrastructure/supabase/server";
import MinigamesConsole, { type MinigameConsoleData } from "./minigames-console";

export default function MinigamesPage() {
	return <Suspense fallback={<MinigamesLoading />}><MinigamesContent /></Suspense>;
}

function MinigamesLoading() {
	return <main className="min-h-dvh bg-[#F5EEDD] p-4 text-[#16587B] sm:p-8"><div className="mx-auto max-w-7xl animate-pulse"><div className="h-4 w-44 rounded bg-[#84B3CE]/30" /><div className="mt-7 h-10 w-64 rounded-xl bg-[#84B3CE]/30" /><div className="mt-3 h-5 w-full max-w-2xl rounded bg-[#84B3CE]/20" /><div className="mt-8 h-40 rounded-[2rem] bg-white/70" /><div className="mt-5 h-64 rounded-[2rem] bg-white/70" /></div></main>;
}

async function MinigamesContent() {
	await connection();
	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	if (claimsError || !userId) redirect("/login");
	const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
	if (!role || !["admin", "editor"].includes(role.role)) redirect("/login");

	const [programsResult, assignmentsResult, destinationsResult, qrPointsResult, groupPointsResult, dependenciesResult] = await Promise.all([
		supabase.from("tourism_minigame_programs").select("*").order("created_at", { ascending: false }),
		supabase.from("tourism_minigame_destinations").select("*"),
		supabase.from("destinations").select("id,name,slug,is_published").order("name"),
		supabase.from("qr_points").select("id,destination_id,name,code,is_active").order("name"),
		supabase.from("tourism_minigame_qr_points").select("assignment_id,qr_point_id,is_required,friend_name,friend_image_url"),
		supabase.from("tourism_minigame_qr_dependencies").select("assignment_id,qr_point_id,prerequisite_qr_point_id"),
	]);
	const migrationError = [programsResult, assignmentsResult, groupPointsResult, dependenciesResult].find((result) => result.error)?.error;
	if (migrationError) {
			return <main className="min-h-dvh bg-[#F5EEDD] p-4 text-[#16587B] sm:p-8"><div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-white p-6 shadow-xl sm:p-10"><Link href="/ruang-kelola" className="text-sm font-bold text-[#16587B]">← Kembali ke ruang pengelola</Link><p className="mt-8 text-xs font-black uppercase tracking-[.18em] text-amber-700">Database perlu diperbarui</p><h1 className="mt-2 text-3xl font-black">Minigames belum siap dibuka</h1><p className="mt-3 leading-7 text-[#16587B]/75">Jalankan migration minigame secara berurutan di Supabase SQL Editor, termasuk <code>20261024000000_minigame_progress_configuration_hash.sql</code>, lalu muat ulang halaman ini.</p></div></main>;
	}
	const data: MinigameConsoleData = {
		role: role.role as "admin" | "editor",
		programs: programsResult.data ?? [],
		assignments: assignmentsResult.data ?? [],
		destinations: destinationsResult.data ?? [],
		qrPoints: qrPointsResult.data ?? [],
		groupPoints: groupPointsResult.data ?? [],
		dependencies: dependenciesResult.data ?? [],
	};
	return <MinigamesConsole data={data} />;
}
