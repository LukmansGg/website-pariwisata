import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import {
	createDriveAssetsFolder,
	exchangeGoogleDriveCode,
	encryptDriveConnection,
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
	const { data: staff } = userId
		? await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle()
		: { data: null };
	const response = NextResponse.redirect(dashboardUrl("connect-failed"));
	response.cookies.set("google_drive_oauth_state", "", {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/api/google-drive/callback",
		maxAge: 0,
	});
	if (!stateMatches || claimsError || !userId || staff?.role !== "admin") return response;
	if (url.searchParams.has("error")) return NextResponse.redirect(dashboardUrl("consent-denied"), { headers: response.headers });
	const code = url.searchParams.get("code");
	if (!code) return response;

	try {
		const tokens = await exchangeGoogleDriveCode(code);
		if (!tokens.refresh_token) return NextResponse.redirect(dashboardUrl("reauthorize"), { headers: response.headers });
		const folderId = await createDriveAssetsFolder(tokens.access_token!);
		const encryptedCredentials = encryptDriveConnection({ refreshToken: tokens.refresh_token, folderId });
		const { error } = await supabase.from("google_drive_connections").upsert({
			id: "primary",
			encrypted_credentials: encryptedCredentials,
			connected_by: userId,
			updated_at: new Date().toISOString(),
		}, { onConflict: "id" });
		if (error) return NextResponse.redirect(dashboardUrl("migration-required"), { headers: response.headers });
		return NextResponse.redirect(dashboardUrl("connected"), { headers: response.headers });
	} catch {
		return response;
	}
}
