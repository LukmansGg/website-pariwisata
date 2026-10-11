import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { DRIVE_UPLOAD_CHUNK_BYTES } from "@/src/shared/google-drive-upload";
import {
	createDriveUploadToken,
	decryptDriveConnection,
	DRIVE_ASSET_FOLDERS,
	DRIVE_IMAGE_TYPES,
	MAX_DRIVE_IMAGE_BYTES,
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
	if (roleError || !role || !["admin", "editor"].includes(role.role)) {
		return NextResponse.json({ error: "Akses admin/editor diperlukan." }, { status: 403 });
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
		return NextResponse.json({ error: "Pilih JPEG, PNG, WebP, atau AVIF dengan ukuran maksimal 8 MB." }, { status: 400 });
	}

	const { data: connection, error: connectionError } = await supabase
		.from("google_drive_connections")
		.select("encrypted_credentials")
		.eq("id", "primary")
		.maybeSingle();
	if (connectionError || !connection?.encrypted_credentials) {
		return NextResponse.json({ error: "Google Drive belum dihubungkan admin. Buka tab Petugas & akses." }, { status: 503 });
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
