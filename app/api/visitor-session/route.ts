import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { createOrResumeVisitorSession } from "@/src/server/visitor-session/visitor-session.service";

export async function POST(request: Request) {
	try {
		const body: unknown = await request.json();

		if (
			typeof body !== "object" ||
			body === null ||
			!("destinationSlug" in body) ||
			typeof body.destinationSlug !== "string" ||
			!body.destinationSlug.trim()
		) {
			return NextResponse.json(
				{ error: "destinationSlug wajib diisi." },
				{ status: 400 },
			);
		}

		const destinationSlug = body.destinationSlug.trim();
		const supabase = await createClient();

		// Buat identitas anonim jika pengunjung belum memiliki sesi login.
		const { data: userData, error: userError } = await supabase.auth.getUser();

		if (userError || !userData.user) {
			const { error: signInError } = await supabase.auth.signInAnonymously();

			if (signInError) {
				return NextResponse.json(
					{
						error: `Gagal membuat identitas pengunjung: ${signInError.message}`,
					},
					{ status: 401 },
				);
			}
		}

		// Ambil destinasi berdasarkan slug, bukan ID yang dikirim bebas oleh browser.
		const { data: destination, error: destinationError } = await supabase
			.from("destinations")
			.select("id")
			.eq("slug", destinationSlug)
			.eq("is_published", true)
			.not("image_url", "is", null)
			.not("latitude", "is", null)
			.not("longitude", "is", null)
			.maybeSingle();

		if (destinationError) {
			return NextResponse.json(
				{ error: "Gagal memeriksa destinasi." },
				{ status: 500 },
			);
		}

		if (!destination) {
			return NextResponse.json(
				{ error: "Destinasi tidak ditemukan atau belum dipublikasikan." },
				{ status: 404 },
			);
		}

		const session = await createOrResumeVisitorSession(
			supabase,
			destination.id,
		);

		// Keep a small, staff-readable projection for the workspace monitor. The
		// session RPC remains the source of truth for the visitor experience.
		const { error: monitorError } = await supabase
			.from("tourism_visitor_sessions")
			.upsert({
				id: session.id,
				visitor_id: session.visitor_id,
				destination_id: session.destination_id ?? destination.id,
				started_at: session.started_at,
				last_activity_at: session.last_activity_at,
				expires_at: session.expires_at,
				status: session.status,
				updated_at: new Date().toISOString(),
			}, { onConflict: "id" });
		if (monitorError) {
			console.error("Visitor session monitor projection failed", {
				code: monitorError.code,
			});
		}

		return NextResponse.json({ session }, { status: 200 });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Terjadi kesalahan.";

		return NextResponse.json({ error: message }, { status: 500 });
	}
}
