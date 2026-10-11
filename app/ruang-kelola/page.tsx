import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { logoutAction } from "@/src/server/auth/actions";
import { isGoogleDriveConfigured } from "@/src/server/storage/google-drive";
import { DashboardWorkspace, type WorkspaceData } from "./workspace";

type DashboardProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default function StaffDashboard({ searchParams }: DashboardProps) {
	return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-[#F5EEDD] p-6 text-[#16587B]"><div className="rounded-3xl bg-white px-8 py-6 text-center shadow-sm"><p className="font-bold">Memuat ruang kerja…</p><p className="mt-1 text-sm text-[#16587B]/65">Memeriksa sesi petugas dan data pariwisata.</p></div></main>}>
		<StaffDashboardContent searchParams={searchParams} />
	</Suspense>;
}

async function StaffDashboardContent({ searchParams }: DashboardProps) {
	await connection();
	const params = await searchParams;
	const driveStatus = Array.isArray(params.drive) ? params.drive[0] : params.drive;
	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	if (claimsError || !userId) redirect("/login");

	const { data: staff, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
	if (roleError || !staff || !["admin", "editor"].includes(staff.role)) redirect("/login");

	const [destinationsResult, partnersResult, qrPointsResult, promotionsResult, driveResult] = await Promise.all([
		supabase.from("destinations").select("id, slug, name, category, address, latitude, longitude, is_published, is_featured, created_at").order("created_at", { ascending: false }),
		supabase.from("tourism_partners").select("id, business_name, slug, business_type, address, status, created_at").order("created_at", { ascending: false }),
		supabase.from("qr_points").select("id, destination_id, name, code, address, latitude, longitude, is_active, created_at").order("created_at", { ascending: false }),
		supabase.from("promotion_campaigns").select("id, partner_id, qr_point_id, title, experience_type, status, starts_at, ends_at, created_at").order("created_at", { ascending: false }),
		supabase.from("google_drive_connections").select("id, updated_at").eq("id", "primary").maybeSingle(),
	]);

	const destinations = destinationsResult.data ?? [];
	const partnerById = new Map((partnersResult.data ?? []).map((partner) => [partner.id, partner.business_name]));
	const destinationById = new Map(destinations.map((destination) => [destination.id, destination.name]));
	const qrPoints = (qrPointsResult.data ?? []).map((point) => ({
		...point,
		destination_name: destinationById.get(point.destination_id) ?? "Destinasi tidak diketahui",
	}));
	const qrById = new Map(qrPoints.map((point) => [point.id, point]));

	const data: WorkspaceData = {
		role: staff.role as "admin" | "editor",
		email: typeof claimsData?.claims.email === "string" ? claimsData.claims.email : "Petugas Pariwisata",
		destinations,
		partners: partnersResult.data ?? [],
		qrPoints,
		promotions: (promotionsResult.data ?? []).map((campaign) => ({
			...campaign,
			partner_name: partnerById.get(campaign.partner_id) ?? "Mitra tidak diketahui",
			qr_label: qrById.get(campaign.qr_point_id)?.name ?? "Titik QR tidak diketahui",
		})),
		driveConnected: Boolean(driveResult.data?.id),
		driveConfigured: isGoogleDriveConfigured(),
		driveNotice: driveNotice(driveStatus),
		dataWarning: [destinationsResult, partnersResult, qrPointsResult, promotionsResult, driveResult].some((result) => result.error)
			? "Sebagian tabel belum tersedia. Jalankan migration admin workspace di Supabase sebelum menyimpan data."
			: undefined,
	};

	return <DashboardWorkspace data={data} logoutAction={logoutAction} />;
}

function driveNotice(status?: string) {
	const notices: Record<string, string> = {
		connected: "Akun Google Drive berhasil dihubungkan. Upload foto sudah tersedia untuk admin dan editor.",
		"connect-failed": "Koneksi Google Drive gagal. Periksa callback OAuth, akun petugas admin, lalu coba sambungkan ulang.",
		"consent-denied": "Izin Google Drive belum diberikan. Setujui izin drive.file agar dashboard dapat menyimpan media.",
		reauthorize: "Google tidak mengirim refresh token. Admin perlu cabut izin MadiunTrip di akun Google lalu hubungkan ulang.",
		"migration-required": "Koneksi Google berhasil, tetapi tabel integrasi belum tersedia. Jalankan migration Google Drive di Supabase lalu hubungkan ulang.",
		"not-configured": "Isi variabel OAuth Google Drive di .env.local dan restart server sebelum menghubungkan akun.",
		"admin-required": "Hanya akun admin yang dapat menghubungkan Google Drive.",
	};
	return status ? notices[status] : undefined;
}
