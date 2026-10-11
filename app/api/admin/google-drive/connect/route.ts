import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { googleDriveAuthorizationUrl } from "@/src/server/storage/google-drive";

export async function GET() {
	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	if (claimsError || !userId) return NextResponse.redirect(new URL("/login", process.env.APP_ORIGIN ?? "http://localhost:3000"));
	const { data: staff } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
	if (staff?.role !== "admin") return NextResponse.redirect(new URL("/ruang-kelola?drive=admin-required", process.env.APP_ORIGIN ?? "http://localhost:3000"));

	try {
		const state = randomBytes(32).toString("hex");
		const response = NextResponse.redirect(googleDriveAuthorizationUrl(state));
		response.cookies.set("google_drive_oauth_state", state, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/api/google-drive/callback",
			maxAge: 10 * 60,
		});
		return response;
	} catch {
		return NextResponse.redirect(new URL("/ruang-kelola?drive=not-configured", process.env.APP_ORIGIN ?? "http://localhost:3000"));
	}
}
