import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
	DRIVE_ASSET_FOLDERS,
	DRIVE_IMAGE_TYPES,
	DRIVE_UPLOAD_CHUNK_BYTES,
	MAX_DRIVE_IMAGE_BYTES,
} from "@/src/shared/google-drive-upload";

export { DRIVE_ASSET_FOLDERS, DRIVE_IMAGE_TYPES, DRIVE_UPLOAD_CHUNK_BYTES, MAX_DRIVE_IMAGE_BYTES };
export const DRIVE_REDIRECT_PATH = "/api/google-drive/callback";
const DRIVE_SCOPE = "openid email https://www.googleapis.com/auth/drive.file";

export type DriveConnection = { refreshToken: string; folderId: string };
export type DriveUploadSession = {
	sessionUri: string;
	totalBytes: number;
	mimeType: string;
	assetFolder: string;
	userId: string;
	expiresAt: number;
};

export function isGoogleDriveConfigured() {
	return Boolean(
		process.env.GOOGLE_DRIVE_CLIENT_ID &&
		process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
		process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY &&
		process.env.GOOGLE_DRIVE_OWNER_EMAIL &&
		process.env.APP_ORIGIN,
	);
}

export function googleDriveOwnerEmail() {
	return process.env.GOOGLE_DRIVE_OWNER_EMAIL?.trim().toLowerCase() ?? "";
}

export function googleDriveRedirectUri() {
	const origin = process.env.APP_ORIGIN;
	if (!origin) throw new Error("APP_ORIGIN belum dikonfigurasi.");
	const parsed = new URL(origin);
	if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
		throw new Error("APP_ORIGIN harus HTTPS, kecuali saat memakai localhost.");
	}
	return new URL(DRIVE_REDIRECT_PATH, parsed.origin).toString();
}

export function googleDriveAuthorizationUrl(state: string) {
	const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
	if (!clientId || !process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
		throw new Error("OAuth Client ID dan Client Secret Google Drive belum dikonfigurasi.");
	}
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.search = new URLSearchParams({
		client_id: clientId,
		redirect_uri: googleDriveRedirectUri(),
		response_type: "code",
		access_type: "offline",
		prompt: "consent select_account",
		scope: DRIVE_SCOPE,
		state,
	}).toString();
	return url;
}

export async function exchangeGoogleDriveCode(code: string) {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		cache: "no-store",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
			client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
			redirect_uri: googleDriveRedirectUri(),
			grant_type: "authorization_code",
		}),
	});
	const result = await response.json() as { access_token?: string; refresh_token?: string; error?: string };
	if (!response.ok || !result.access_token) {
		throw new Error(result.error || "Google gagal menyelesaikan proses OAuth.");
	}
	return result;
}

export async function getGoogleAccountEmail(accessToken: string) {
	const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
		cache: "no-store",
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	const result = await response.json() as { email?: string; email_verified?: boolean };
	if (!response.ok || !result.email || result.email_verified !== true) {
		throw new Error("Google tidak mengembalikan email akun terverifikasi.");
	}
	return result.email.trim().toLowerCase();
}

function encryptionKey() {
	const raw = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
	if (!raw) throw new Error("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY belum dikonfigurasi.");
	const key = /^[\da-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
	if (key.length !== 32) throw new Error("Kunci enkripsi Drive harus 32 byte (base64 atau 64 karakter hex).");
	return key;
}

export function encryptDriveConnection(connection: DriveConnection) {
	return encryptPayload(connection);
}

function encryptPayload(payload: unknown) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
	return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

function decryptPayload<T>(value: string): T {
	const [ivText, tagText, cipherText] = value.split(".");
	if (!ivText || !tagText || !cipherText) throw new Error("Data integrasi Google Drive tidak valid.");
	const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
	decipher.setAuthTag(Buffer.from(tagText, "base64url"));
	const cleartext = Buffer.concat([
		decipher.update(Buffer.from(cipherText, "base64url")),
		decipher.final(),
	]).toString("utf8");
	return JSON.parse(cleartext) as T;
}

export function decryptDriveConnection(value: string): DriveConnection {
	const parsed = decryptPayload<Partial<DriveConnection>>(value);
	if (typeof parsed.refreshToken !== "string" || typeof parsed.folderId !== "string") {
		throw new Error("Data koneksi Google Drive tidak lengkap.");
	}
	return { refreshToken: parsed.refreshToken, folderId: parsed.folderId };
}

export function createDriveUploadToken(session: Omit<DriveUploadSession, "expiresAt">) {
	return encryptPayload({ ...session, expiresAt: Date.now() + 60 * 60 * 1000 } satisfies DriveUploadSession);
}

export function readDriveUploadToken(token: string): DriveUploadSession {
	const session = decryptPayload<Partial<DriveUploadSession>>(token);
	let sessionUrl: URL;
	try {
		sessionUrl = new URL(session.sessionUri ?? "");
	} catch {
		throw new Error("Sesi upload Google Drive tidak valid.");
	}
	if (
		sessionUrl.protocol !== "https:" ||
		sessionUrl.hostname !== "www.googleapis.com" ||
		sessionUrl.pathname !== "/upload/drive/v3/files" ||
		typeof session.totalBytes !== "number" ||
		session.totalBytes < 1 ||
		session.totalBytes > MAX_DRIVE_IMAGE_BYTES ||
		typeof session.mimeType !== "string" ||
		!DRIVE_IMAGE_TYPES.has(session.mimeType) ||
		typeof session.assetFolder !== "string" ||
		!DRIVE_ASSET_FOLDERS.has(session.assetFolder) ||
		typeof session.userId !== "string" ||
		typeof session.expiresAt !== "number" ||
		session.expiresAt < Date.now()
	) {
		throw new Error("Sesi upload Google Drive tidak valid atau sudah kedaluwarsa.");
	}
	return session as DriveUploadSession;
}

export async function createDriveAssetsFolder(accessToken: string) {
	const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
		method: "POST",
		cache: "no-store",
		headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
		body: JSON.stringify({ name: "MadiunTrip Assets", mimeType: "application/vnd.google-apps.folder" }),
	});
	const result = await response.json() as { id?: string; error?: { message?: string } };
	if (!response.ok || !result.id) throw new Error(result.error?.message || "Folder aset MadiunTrip gagal dibuat di Drive.");
	return result.id;
}

export async function refreshDriveAccessToken(refreshToken: string) {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		cache: "no-store",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
			client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});
	const result = await response.json() as { access_token?: string; error?: string };
	if (!response.ok || !result.access_token) throw new Error(result.error || "Token Google Drive kedaluwarsa. Hubungkan ulang Drive dari dashboard.");
	return result.access_token;
}

export async function startDriveResumableUpload({ accessToken, folderId, mimeType, totalBytes, assetFolder }: {
	accessToken: string; folderId: string; mimeType: string; totalBytes: number; assetFolder: string;
}) {
	const extension: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
	const metadata = {
		name: `${assetFolder}-${randomBytes(16).toString("hex")}.${extension[mimeType]}`,
		mimeType,
		parents: [folderId],
		appProperties: { madiuntripAsset: "true", assetFolder },
	};
	const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType", {
		method: "POST",
		cache: "no-store",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json; charset=UTF-8",
			"X-Upload-Content-Type": mimeType,
			"X-Upload-Content-Length": String(totalBytes),
		},
		body: JSON.stringify(metadata),
	});
	const sessionUri = response.headers.get("location");
	if (!response.ok || !sessionUri) {
		const error = await response.json().catch(() => null) as { error?: { message?: string } } | null;
		throw new Error(error?.error?.message || "Sesi upload Google Drive gagal dibuat.");
	}
	const parsedSessionUri = new URL(sessionUri);
	if (parsedSessionUri.protocol !== "https:" || parsedSessionUri.hostname !== "www.googleapis.com" || parsedSessionUri.pathname !== "/upload/drive/v3/files") {
		throw new Error("Google mengembalikan URL sesi upload yang tidak valid.");
	}
	return sessionUri;
}

export async function uploadDriveChunk({ accessToken, sessionUri, bytes, mimeType, start, end, totalBytes }: {
	accessToken: string; sessionUri: string; bytes: Uint8Array; mimeType: string; start: number; end: number; totalBytes: number;
}) {
	const body = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(body).set(bytes);
	const response = await fetch(sessionUri, {
		method: "PUT",
		cache: "no-store",
		redirect: "manual",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": mimeType,
			"Content-Length": String(bytes.byteLength),
			"Content-Range": `bytes ${start}-${end}/${totalBytes}`,
		},
		body,
	});

	if (response.status === 308) {
		const range = response.headers.get("range");
		const acceptedThrough = range?.match(/bytes=0-(\d+)/i)?.[1];
		return { complete: false as const, nextOffset: acceptedThrough ? Number(acceptedThrough) + 1 : end + 1 };
	}

	const created = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
	if (!response.ok || !created?.id) {
		throw new Error(created?.error?.message || "Potongan gambar gagal dikirim ke Google Drive.");
	}

	const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(created.id)}/permissions`, {
		method: "POST",
		cache: "no-store",
		headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
		body: JSON.stringify({ type: "anyone", role: "reader" }),
	});
	if (!permissionResponse.ok) {
		await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(created.id)}`, {
			method: "DELETE", cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` },
		});
		throw new Error("File terunggah, tetapi akses publik gambarnya gagal diaktifkan. Periksa kebijakan berbagi akun Google.");
	}
	return { complete: true as const, imageUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(created.id)}&sz=w1600` };
}
