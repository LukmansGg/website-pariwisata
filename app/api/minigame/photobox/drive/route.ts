import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import {
	decryptDriveConnection,
	googleDriveOwnerEmail,
	refreshDriveAccessToken,
} from "@/src/server/storage/google-drive";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function originIsAllowed(request: Request) {
	const origin = request.headers.get("origin");
	const appOrigin = process.env.APP_ORIGIN;
	return !origin || !appOrigin || new URL(origin).origin === new URL(appOrigin).origin;
}

async function uploadPrivatePhoto(accessToken: string, folderId: string, bytes: Uint8Array) {
	const boundary = `tiloc_${randomUUID().replaceAll("-", "")}`;
	const metadata = JSON.stringify({
		name: `kenangan-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.jpg`,
		mimeType: "image/jpeg",
		parents: [folderId],
		appProperties: { tilocAsset: "true", assetFolder: "visitor_photobox" },
	});
	const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`);
	const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);
	const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
	body.set(prefix, 0);
	body.set(bytes, prefix.length);
	body.set(suffix, prefix.length + bytes.length);
	const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
		method: "POST",
		cache: "no-store",
		headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
		body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
	});
	const result = await response.json() as { id?: string; error?: { message?: string } };
	if (!response.ok || !result.id) throw new Error(result.error?.message || "Drive gagal menyimpan foto.");
	return result.id;
}

export async function POST(request: Request) {
	try {
		if (!originIsAllowed(request)) return NextResponse.json({ error: "Asal permintaan tidak diizinkan." }, { status: 403 });
	} catch {
		return NextResponse.json({ error: "Konfigurasi alamat website tidak valid." }, { status: 503 });
	}
	const form = await request.formData().catch(() => null);
	const file = form?.get("photo");
	const programSlug = String(form?.get("programSlug") ?? "").trim().toLowerCase();
	const destinationSlug = String(form?.get("destinationSlug") ?? "").trim().toLowerCase();
	const templateId = String(form?.get("templateId") ?? "").trim();
	const caption = String(form?.get("caption") ?? "").trim();
	if (!(file instanceof File) || file.type !== "image/jpeg" || file.size < 256 || file.size > MAX_PHOTO_BYTES
		|| !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(programSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destinationSlug)
		|| !/^[a-z0-9_-]{1,80}$/i.test(templateId) || !caption || caption.length > 1000) {
		return NextResponse.json({ error: "Foto, caption, atau identitas Photobox tidak valid. Gambar maksimal 8 MB." }, { status: 400 });
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
		return NextResponse.json({ error: "File harus berupa foto JPEG yang valid." }, { status: 400 });
	}

	try {
		const visitorClient = await createClient();
		const { data: current } = await visitorClient.auth.getUser();
		if (!current.user) {
			const { error: signInError } = await visitorClient.auth.signInAnonymously();
			if (signInError) return NextResponse.json({ error: "Sesi pengunjung belum siap. Muat ulang halaman." }, { status: 401 });
		}
		const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceKey) return NextResponse.json({ error: "Penyimpanan Photobox belum disiapkan. Admin perlu menambahkan secret server Supabase." }, { status: 503 });
		const adminClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
		const { data: connection, error: connectionError } = await adminClient.from("google_drive_connections")
			.select("encrypted_credentials, connected_by").eq("id", "primary").maybeSingle();
		if (connectionError || !connection?.encrypted_credentials || !connection.connected_by) return NextResponse.json({ error: "Google Drive belum dihubungkan admin." }, { status: 503 });
		const { data: ownerRole } = await adminClient.from("user_roles").select("role").eq("user_id", connection.connected_by).maybeSingle();
		if (ownerRole?.role !== "admin") return NextResponse.json({ error: "Koneksi Drive perlu dihubungkan oleh akun admin." }, { status: 503 });
		const { data: ownerEmail } = await adminClient.auth.admin.getUserById(connection.connected_by);
		if (!googleDriveOwnerEmail() || ownerEmail.user?.email?.toLowerCase() !== googleDriveOwnerEmail()) {
			return NextResponse.json({ error: "Koneksi Drive belum sesuai dengan pemilik aplikasi." }, { status: 503 });
		}
		const credentials = decryptDriveConnection(connection.encrypted_credentials);
		const accessToken = await refreshDriveAccessToken(credentials.refreshToken);
		const driveFileId = await uploadPrivatePhoto(accessToken, credentials.folderId, bytes);
		const { data, error } = await visitorClient.rpc("record_public_minigame_photo", {
			p_program_slug: programSlug,
			p_destination_slug: destinationSlug,
			p_template_id: templateId,
			p_caption: caption,
			p_drive_file_id: driveFileId,
		});
		if (error || data?.error) {
			await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`, {
				method: "DELETE", cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` },
			}).catch(() => undefined);
			return NextResponse.json({ error: data?.error === "PHOTOBOX_LOCKED" ? "Photobox hadiah terbuka setelah semua misi wajib program selesai." : "Foto tersimpan belum bisa ditautkan ke progres minigame." }, { status: data?.error === "PHOTOBOX_LOCKED" ? 403 : 400 });
		}
		return NextResponse.json({ status: "saved", photosCreated: data.photosCreated, xp: data.xp }, { headers: { "Cache-Control": "no-store" } });
	} catch {
		return NextResponse.json({ error: "Foto belum dapat disimpan ke Google Drive. Coba lagi sebentar." }, { status: 503 });
	}
}
