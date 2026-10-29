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
	return <main className="relative min-h-dvh overflow-hidden bg-[#eaf7ff] px-4 py-8 text-sky-950 dark:bg-[#06172a] dark:text-sky-50 sm:px-8 sm:py-12">
		<div aria-hidden="true" className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl dark:bg-blue-500/15" />
		<div aria-hidden="true" className="pointer-events-none absolute -right-24 top-64 h-80 w-80 rounded-full bg-cyan-200/50 blur-3xl dark:bg-indigo-500/15" />
		<div className="relative mx-auto max-w-7xl">
			<div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-700 text-xl text-white shadow-lg motion-safe:animate-bounce">🕹️</span><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-sky-700 dark:text-sky-300">GAME DESIGN STUDIO</p><p className="mt-1 text-sm font-bold">Menyiapkan arena minigame…</p></div></div>
			<div className="mt-8 h-32 animate-pulse rounded-[2rem] border border-white/70 bg-white/60 shadow-xl backdrop-blur-xl dark:border-sky-200/10 dark:bg-slate-900/55" />
			<div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]"><div className="h-72 animate-pulse rounded-[2rem] border border-white/70 bg-white/60 dark:border-sky-200/10 dark:bg-slate-900/55"/><div className="h-72 animate-pulse rounded-[2rem] border border-white/70 bg-white/60 dark:border-sky-200/10 dark:bg-slate-900/55"/></div>
		</div>
	</main>;
}

async function MinigamesContent() {
	await connection();
	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	if (claimsError || !userId) redirect("/login");
	const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
	if (!role || !["admin", "editor", "destination_manager"].includes(role.role)) redirect("/login");
	const petugasRole = role.role !== "admin";
	const accessResult = role.role === "destination_manager"
		? await supabase.from("user_destination_access").select("destination_id").eq("user_id", userId)
		: null;
	const assignedDestinationIds = new Set((accessResult?.data ?? []).map((access) => access.destination_id));

	const [programsResult, assignmentsResult, destinationsResult, qrPointsResult, groupPointsResult, dependenciesResult] = await Promise.all([
		supabase.from("tourism_minigame_programs").select("*").order("created_at", { ascending: false }),
		supabase.from("tourism_minigame_destinations").select("*"),
		supabase.from("destinations").select("id,name,slug,is_published,created_by").order("name"),
		supabase.from("qr_points").select("id,destination_id,name,code,is_active").order("name"),
		supabase.from("tourism_minigame_qr_points").select("assignment_id,qr_point_id,is_required,friend_name,friend_image_url"),
		supabase.from("tourism_minigame_qr_dependencies").select("assignment_id,qr_point_id,prerequisite_qr_point_id"),
	]);
	const migrationError = [programsResult, assignmentsResult, groupPointsResult, dependenciesResult].find((result) => result.error)?.error;
	if (migrationError) {
			return <main className="min-h-dvh bg-[#eaf7ff] p-4 text-sky-950 dark:bg-[#06172a] dark:text-sky-50 sm:p-8"><div className="mx-auto max-w-3xl rounded-3xl border border-sky-200 bg-white/90 p-6 shadow-xl dark:border-sky-200/10 dark:bg-slate-900/80 sm:p-10"><Link href="/ruang-kelola" className="text-sm font-bold text-sky-800 dark:text-sky-200">← Kembali ke ruang pengelola</Link><p className="mt-8 text-xs font-black uppercase tracking-[.18em] text-sky-700 dark:text-sky-300">Database perlu diperbarui</p><h1 className="mt-2 text-3xl font-black">Minigames belum siap dibuka</h1><p className="mt-3 leading-7 text-sky-950/75 dark:text-sky-100/75">Jalankan migration minigame secara berurutan di Supabase SQL Editor, termasuk <code>20261024000000_minigame_progress_configuration_hash.sql</code>, lalu muat ulang halaman ini.</p></div></main>;
	}
	const ownedDestinationIds = new Set((destinationsResult.data ?? []).filter((destination) => role.role === "admin" || (role.role === "editor" && destination.created_by === userId) || (role.role === "destination_manager" && (assignedDestinationIds.has(destination.id) || destination.created_by === userId))).map((destination) => destination.id));
	const data: MinigameConsoleData = {
		role: role.role as MinigameConsoleData["role"],
		userId,
		programs: programsResult.data ?? [],
		assignments: (assignmentsResult.data ?? []).filter((assignment) => !petugasRole || ownedDestinationIds.has(assignment.destination_id)).map((assignment) => petugasRole ? { ...assignment, photobox_templates: Array.isArray(assignment.photobox_templates) ? assignment.photobox_templates.filter((template: { source?: string }) => template.source !== "campaign") : [] } : assignment),
		destinations: (destinationsResult.data ?? []).filter((destination) => !petugasRole || ownedDestinationIds.has(destination.id)),
		qrPoints: qrPointsResult.data ?? [],
		groupPoints: groupPointsResult.data ?? [],
		dependencies: dependenciesResult.data ?? [],
	};
	return <MinigamesConsole data={data} />;
}
