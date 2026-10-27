import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { logoutAction } from "@/src/server/auth/actions";
import { googleDriveOwnerEmail, isGoogleDriveConfigured } from "@/src/server/storage/google-drive";
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

	const [destinationQuery, partnersResult, qrPointsResult, promotionsResult, driveResult] = await Promise.all([
		supabase.from("destinations").select("id, slug, name, description, category, categories, short_description, address, latitude, longitude, image_url, tags, additional_minigames, photobox_access_mode, mascot_mode, mascot_image_url, is_published, is_featured, created_at").order("created_at", { ascending: false }),
		supabase.from("tourism_partners").select("id, business_name, slug, destination_id, max_distance_meters, business_type, address, status, created_at").order("created_at", { ascending: false }),
		supabase.from("qr_points").select("id, destination_id, name, code, address, latitude, longitude, is_active, created_at").order("created_at", { ascending: false }),
		supabase.from("promotion_campaigns").select("id, partner_id, qr_point_id, title, experience_type, status, starts_at, ends_at, created_at, form_schema").order("created_at", { ascending: false }),
		supabase.from("google_drive_connections").select("id, connected_email, updated_at").eq("id", "primary").maybeSingle(),
	]);

	let destinationRows = destinationQuery.data as WorkspaceData["destinations"] | null;
	let destinationError = destinationQuery.error;
	if (destinationError?.code === "42703") {
		const legacyDestinations = await supabase.from("destinations")
			.select("id, slug, name, description, category, categories, short_description, address, latitude, longitude, image_url, tags, additional_minigames, photobox_access_mode, is_published, is_featured, created_at")
			.order("created_at", { ascending: false });
		destinationRows = legacyDestinations.data as WorkspaceData["destinations"] | null;
		destinationError = legacyDestinations.error;
	}
	const destinations = destinationRows ?? [];
	const partnerById = new Map((partnersResult.data ?? []).map((partner) => [partner.id, partner.business_name]));
	const destinationById = new Map(destinations.map((destination) => [destination.id, destination.name]));
	const qrPoints = (qrPointsResult.data ?? []).map((point) => ({
		...point,
		destination_name: destinationById.get(point.destination_id) ?? "Destinasi tidak diketahui",
	}));
	const qrById = new Map(qrPoints.map((point) => [point.id, point]));
	const dataIssues = [
		destinationError ? `destinations: ${databaseIssue(destinationError)}` : null,
		partnersResult.error ? `tourism_partners: ${databaseIssue(partnersResult.error)}` : null,
		qrPointsResult.error ? `qr_points: ${databaseIssue(qrPointsResult.error)}` : null,
		promotionsResult.error ? `promotion_campaigns: ${databaseIssue(promotionsResult.error)}` : null,
	].filter((issue): issue is string => issue !== null);

	const data: WorkspaceData = {
		role: staff.role as "admin" | "editor",
		email: typeof claimsData?.claims.email === "string" ? claimsData.claims.email : "Petugas Pariwisata",
		destinations,
		partners: (partnersResult.data ?? []).map((partner) => ({
			...partner,
			destination_name: partner.destination_id ? destinationById.get(partner.destination_id) ?? null : null,
		})),
		qrPoints,
		promotions: (promotionsResult.data ?? []).map((campaign) => ({
			...campaign,
			has_form: Array.isArray(campaign.form_schema) && campaign.form_schema.some((block: { type?: string }) => ["input", "choice", "dropdown"].includes(block?.type ?? "")),
			partner_name: partnerById.get(campaign.partner_id) ?? "Mitra tidak diketahui",
			qr_label: qrById.get(campaign.qr_point_id)?.name ?? "Titik QR tidak diketahui",
		})),
		driveConnected: Boolean(driveResult.data?.id),
		driveConnectedEmail: driveResult.data?.connected_email ?? undefined,
		driveOwnerEmail: googleDriveOwnerEmail(),
		driveConfigured: isGoogleDriveConfigured(),
		driveNotice: driveNotice(driveStatus),
		dataIssues,
		driveIssue: driveResult.error ? `google_drive_connections: ${databaseIssue(driveResult.error)}` : undefined,
	};

	return <DashboardWorkspace data={data} logoutAction={logoutAction} />;
}

function databaseIssue(error: { code?: string; message: string }) {
	if (error.code === "42P01" || error.code === "PGRST205") return "tabel belum ditemukan. Jalankan migration admin workspace di Supabase SQL Editor.";
	if (error.code === "42501" || error.code === "PGRST301") return "akses ditolak oleh privilege/RLS. Periksa policy dan role akun petugas di Supabase.";
	if (error.code === "42703") {
		const missingColumn = error.message.match(/column [\"']?([\w.]+)[\"']? does not exist/i)?.[1];
		return missingColumn
			? `kolom ${missingColumn} belum ada. Jalankan migration admin workspace; jika masih muncul, tambahkan kolom itu sesuai skema. (42703)`
			: "kolom yang diminta belum ada. Jalankan migration admin workspace dan periksa skema tabel destinations. (42703)";
	}
	return `query gagal (${error.code ?? "tanpa kode"}). Periksa skema dan policy Supabase.`;
}

function driveNotice(status?: string) {
	const notices: Record<string, string> = {
		connected: "Akun Google Drive berhasil dihubungkan. Upload foto sudah tersedia untuk admin dan editor.",
		"connect-failed": "Koneksi Google Drive gagal. Periksa callback OAuth, akun petugas admin, lalu coba sambungkan ulang.",
		"state-invalid": "Pemeriksaan keamanan OAuth gagal. Mulai ulang koneksi dari tab yang sama dan gunakan hostname yang sama (localhost atau 127.0.0.1).",
		"session-missing": "Sesi admin tidak terbawa kembali dari Google. Login ulang di dashboard lalu hubungkan Drive lagi.",
		"code-missing": "Google tidak mengirim kode otorisasi. Mulai ulang koneksi Drive.",
		"oauth-failed": "Kode Google diterima, tetapi gagal ditukar menjadi token. Periksa Client ID, Client Secret, dan redirect URI di Google Cloud; lihat terminal Next.js untuk detail aman.",
		"drive-api-failed": "OAuth berhasil, tetapi Google Drive API gagal membuat folder aset. Pastikan Google Drive API aktif di project Google Cloud; lihat terminal Next.js untuk detail.",
		"drive-config-failed": "Token Google diterima tetapi gagal dienkripsi. Pastikan GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY berisi 32 byte (base64 atau 64 karakter hex).",
		"consent-denied": "Izin Google Drive belum diberikan. Setujui izin drive.file agar dashboard dapat menyimpan media.",
		reauthorize: "Google tidak mengirim refresh token. Admin perlu cabut izin TiLoc di akun Google lalu hubungkan ulang.",
		"migration-required": "Koneksi Google berhasil, tetapi tabel integrasi belum tersedia. Jalankan migration Google Drive di Supabase lalu hubungkan ulang.",
		"not-configured": "Isi variabel OAuth, kunci enkripsi, APP_ORIGIN, dan GOOGLE_DRIVE_OWNER_EMAIL di konfigurasi server sebelum menghubungkan akun.",
		"owner-not-configured": "Pemilik Drive belum ditentukan. Isi GOOGLE_DRIVE_OWNER_EMAIL di konfigurasi server dengan akun Google milik aplikasi sebelum menghubungkan.",
		"owner-mismatch": "Akun Google yang dipilih bukan akun pemilik aplikasi. Tidak ada folder atau token yang disimpan; login dengan email yang ditetapkan pada GOOGLE_DRIVE_OWNER_EMAIL.",
		"account-unverified": "Google tidak mengembalikan email terverifikasi, jadi akun Drive tidak disambungkan.",
		"admin-required": "Hanya akun admin yang dapat menghubungkan Google Drive.",
	};
	return status ? notices[status] : undefined;
}
