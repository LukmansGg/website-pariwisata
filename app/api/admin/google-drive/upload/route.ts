import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/src/infrastructure/supabase/server";
import { DRIVE_UPLOAD_CHUNK_BYTES } from "@/src/shared/google-drive-upload";
import {
	createDriveUploadToken,
	decryptDriveConnection,
	DRIVE_ASSET_FOLDERS,
	DRIVE_IMAGE_TYPES,
	MAX_DRIVE_IMAGE_BYTES,
	googleDriveOwnerEmail,
	refreshDriveAccessToken,
	startDriveResumableUpload,
} from "@/src/server/storage/google-drive";

function originIsAllowed(request: Request) {
	const origin = request.headers.get("origin");
	const appOrigin = process.env.APP_ORIGIN;
	return !origin || !appOrigin || new URL(origin).origin === new URL(appOrigin).origin;
}

export async function POST(request: Request) {
	try {
		if (!originIsAllowed(request)) return NextResponse.json({ error: "Asal permintaan tidak diizinkan." }, { status: 403 });
	} catch {
		return NextResponse.json({ error: "Konfigurasi alamat website tidak valid." }, { status: 503 });
	}

	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	if (claimsError || !userId) return NextResponse.json({ error: "Silakan masuk sebagai petugas." }, { status: 401 });
	const { data: role, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
	if (roleError || !role || !["admin", "editor", "destination_manager"].includes(role.role)) {
		return NextResponse.json({ error: "Akun tidak memiliki akses upload." }, { status: 403 });
	}

	let input: { folder?: unknown; mimeType?: unknown; size?: unknown };
	try {
		input = await request.json();
	} catch {
		return NextResponse.json({ error: "Informasi gambar tidak valid." }, { status: 400 });
	}
	if (
		typeof input.folder !== "string" || !DRIVE_ASSET_FOLDERS.has(input.folder) ||
		typeof input.mimeType !== "string" || !DRIVE_IMAGE_TYPES.has(input.mimeType) ||
		typeof input.size !== "number" || !Number.isInteger(input.size) ||
		input.size < 1 || input.size > MAX_DRIVE_IMAGE_BYTES
	) {
		return NextResponse.json({ error: "Pilih JPEG, PNG, WebP, atau AVIF dengan ukuran maksimal 25 MB." }, { status: 400 });
	}
	if (role.role === "destination_manager" && !["destinations", "mascots", "photobox"].includes(input.folder)) {
		return NextResponse.json({ error: "Pengelola wisata hanya dapat mengunggah foto wisata, maskot, dan frame Photobox." }, { status: 403 });
	}

	const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (role.role === "destination_manager" && (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL)) return NextResponse.json({ error: "Layanan upload belum disiapkan server." }, { status: 503 });
	const serviceClient = serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL
		? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
		: null;
	const connectionClient = role.role === "destination_manager" ? serviceClient! : supabase;
	const { data: connection, error: connectionError } = await connectionClient
		.from("google_drive_connections")
		.select("encrypted_credentials, connected_email, connected_by")
		.eq("id", "primary")
		.maybeSingle();
	if (connectionError || !connection?.encrypted_credentials || !connection.connected_by) {
		return NextResponse.json({ error: "Google Drive belum dihubungkan admin. Buka tab Petugas & akses." }, { status: 503 });
	}
	if (role.role === "destination_manager") {
		const { data: ownerRole } = await serviceClient!.from("user_roles").select("role").eq("user_id", connection.connected_by).maybeSingle();
		const { data: ownerUser } = await serviceClient!.auth.admin.getUserById(connection.connected_by);
		if (ownerRole?.role !== "admin" || !ownerUser.user?.email || ownerUser.user.email.toLowerCase() !== googleDriveOwnerEmail()) return NextResponse.json({ error: "Koneksi Drive harus dimiliki akun admin aplikasi." }, { status: 503 });
	}
	if (!googleDriveOwnerEmail() || connection.connected_email?.toLowerCase() !== googleDriveOwnerEmail()) {
		return NextResponse.json({ error: "Akun Drive belum cocok dengan pemilik yang ditetapkan. Admin harus menghubungkan ulang akun pemilik aplikasi." }, { status: 503 });
	}

	try {
		const credentials = decryptDriveConnection(connection.encrypted_credentials);
		const accessToken = await refreshDriveAccessToken(credentials.refreshToken);
		const sessionUri = await startDriveResumableUpload({
			accessToken,
			folderId: credentials.folderId,
			mimeType: input.mimeType,
			totalBytes: input.size,
			assetFolder: input.folder,
		});
		const uploadToken = createDriveUploadToken({
			sessionUri,
			totalBytes: input.size,
			mimeType: input.mimeType,
			assetFolder: input.folder,
			userId,
		});
		return NextResponse.json({ uploadToken, chunkSize: DRIVE_UPLOAD_CHUNK_BYTES }, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Upload Google Drive gagal disiapkan.";
		const status = message.includes("belum dikonfigurasi") || message.includes("Kunci enkripsi") ? 503 : 502;
		return NextResponse.json({ error: status === 503 ? message : "Google Drive belum siap. Admin perlu menghubungkan ulang Drive." }, { status });
	}
}
