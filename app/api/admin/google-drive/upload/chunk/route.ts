import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import {
	decryptDriveConnection,
	DRIVE_UPLOAD_CHUNK_BYTES,
	readDriveUploadToken,
	refreshDriveAccessToken,
	uploadDriveChunk,
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

	const contentLength = Number(request.headers.get("content-length") ?? 0);
	if (contentLength && (!Number.isInteger(contentLength) || contentLength < 1 || contentLength > DRIVE_UPLOAD_CHUNK_BYTES)) {
		return NextResponse.json({ error: "Ukuran potongan upload tidak valid." }, { status: 413 });
	}
	const token = request.headers.get("x-drive-upload-token") ?? "";
	const contentRange = request.headers.get("content-range") ?? "";
	const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
	if (!token || token.length > 4096 || !range) {
		return NextResponse.json({ error: "Sesi atau rentang upload tidak valid." }, { status: 400 });
	}

	let uploadSession;
	try {
		uploadSession = readDriveUploadToken(token);
	} catch {
		return NextResponse.json({ error: "Sesi upload sudah kedaluwarsa. Silakan pilih ulang gambar." }, { status: 401 });
	}
	const start = Number(range[1]);
	const end = Number(range[2]);
	const totalBytes = Number(range[3]);
	const expectedChunkSize = Math.min(DRIVE_UPLOAD_CHUNK_BYTES, totalBytes - start);
	if (
		totalBytes !== uploadSession.totalBytes ||
		start < 0 || start >= totalBytes || start % DRIVE_UPLOAD_CHUNK_BYTES !== 0 ||
		end < start || end - start + 1 !== expectedChunkSize || (contentLength > 0 && contentLength !== expectedChunkSize)
	) {
		return NextResponse.json({ error: "Urutan atau ukuran potongan upload tidak sesuai." }, { status: 400 });
	}

	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	if (claimsError || !userId || userId !== uploadSession.userId) {
		return NextResponse.json({ error: "Sesi staf tidak cocok. Silakan login kembali." }, { status: 401 });
	}
	const { data: role, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
	if (roleError || !role || !["admin", "editor"].includes(role.role)) {
		return NextResponse.json({ error: "Akses admin/editor diperlukan." }, { status: 403 });
	}

	try {
		const { data: connection, error: connectionError } = await supabase
			.from("google_drive_connections")
			.select("encrypted_credentials")
			.eq("id", "primary")
			.maybeSingle();
		if (connectionError || !connection?.encrypted_credentials) {
			return NextResponse.json({ error: "Google Drive belum dihubungkan admin." }, { status: 503 });
		}
		const credentials = decryptDriveConnection(connection.encrypted_credentials);
		const accessToken = await refreshDriveAccessToken(credentials.refreshToken);
		const bytes = new Uint8Array(await request.arrayBuffer());
		if (bytes.byteLength !== contentLength) return NextResponse.json({ error: "Ukuran potongan upload berubah saat dikirim." }, { status: 400 });

		const result = await uploadDriveChunk({
			accessToken,
			sessionUri: uploadSession.sessionUri,
			bytes,
			mimeType: uploadSession.mimeType,
			start,
			end,
			totalBytes,
		});
		if (!result.complete) return NextResponse.json({ complete: false, nextOffset: result.nextOffset });
		return NextResponse.json({ complete: true, imageUrl: result.imageUrl });
	} catch {
		return NextResponse.json({ error: "Google Drive gagal menerima potongan gambar. Coba lagi atau hubungkan ulang Drive." }, { status: 502 });
	}
}
