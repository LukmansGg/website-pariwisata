import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import {
	createDriveAssetsFolder,
	exchangeGoogleDriveCode,
	encryptDriveConnection,
	getGoogleAccountEmail,
	googleDriveOwnerEmail,
} from "@/src/server/storage/google-drive";

function dashboardUrl(status: string) {
	return new URL(`/ruang-kelola?drive=${encodeURIComponent(status)}`, process.env.APP_ORIGIN ?? "http://localhost:3000");
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const cookieStore = await cookies();
	const expectedState = cookieStore.get("google_drive_oauth_state")?.value;
	const state = url.searchParams.get("state") ?? "";
	const stateMatches = Boolean(expectedState && state && expectedState.length === state.length && timingSafeEqual(Buffer.from(expectedState), Buffer.from(state)));
	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	const { data: staff, error: roleError } = userId
		? await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle()
		: { data: null, error: null };
	const response = NextResponse.redirect(dashboardUrl("connect-failed"));
	response.cookies.set("google_drive_oauth_state", "", {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/api/google-drive/callback",
		maxAge: 0,
	});
	const fail = (status: string) => NextResponse.redirect(dashboardUrl(status), { headers: response.headers });
	if (!stateMatches) return fail("state-invalid");
	if (claimsError || !userId) return fail("session-missing");
	if (roleError || staff?.role !== "admin") return fail("admin-required");
	if (url.searchParams.has("error")) return fail("consent-denied");
	const code = url.searchParams.get("code");
	if (!code) return fail("code-missing");

	let tokens: Awaited<ReturnType<typeof exchangeGoogleDriveCode>>;
	try {
		tokens = await exchangeGoogleDriveCode(code);
	} catch (error) {
		console.error("[google-drive] OAuth token exchange failed:", error instanceof Error ? error.message : "Unknown error");
		return fail("oauth-failed");
	}
	if (!tokens.refresh_token) return fail("reauthorize");
	let connectedEmail: string;
	try {
		connectedEmail = await getGoogleAccountEmail(tokens.access_token!);
	} catch (error) {
		console.error("[google-drive] Google account verification failed:", error instanceof Error ? error.message : "Unknown error");
		return fail("account-unverified");
	}
	const expectedOwner = googleDriveOwnerEmail();
	if (!expectedOwner) return fail("owner-not-configured");
	if (connectedEmail !== expectedOwner) return fail("owner-mismatch");

	let encryptedCredentials: string;
	try {
		// Validate the encryption key before creating anything in the owner's Drive.
		encryptedCredentials = encryptDriveConnection({ refreshToken: tokens.refresh_token, folderId: "pending" });
	} catch (error) {
		console.error("[google-drive] Credential encryption failed:", error instanceof Error ? error.message : "Unknown error");
		return fail("drive-config-failed");
	}

	let folderId: string;
	try {
		folderId = await createDriveAssetsFolder(tokens.access_token!);
	} catch (error) {
		console.error("[google-drive] Drive API folder setup failed:", error instanceof Error ? error.message : "Unknown error");
		return fail("drive-api-failed");
	}

	try {
		encryptedCredentials = encryptDriveConnection({ refreshToken: tokens.refresh_token, folderId });
	} catch (error) {
		console.error("[google-drive] Credential encryption failed:", error instanceof Error ? error.message : "Unknown error");
		return fail("drive-config-failed");
	}

	const { error: saveError } = await supabase.from("google_drive_connections").upsert({
		id: "primary",
		encrypted_credentials: encryptedCredentials,
		connected_email: connectedEmail,
		connected_by: userId,
		updated_at: new Date().toISOString(),
	}, { onConflict: "id" });
	if (saveError) {
		console.error("[google-drive] Encrypted connection save failed:", saveError.message);
		return fail("migration-required");
	}
	return fail("connected");
}
