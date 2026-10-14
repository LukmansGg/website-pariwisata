import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";

type Input = { programSlug?: unknown; destinationSlug?: unknown; templateId?: unknown; caption?: unknown };

export async function POST(request: Request) {
	let input: Input;
	try { input = await request.json() as Input; }
	catch { return NextResponse.json({ error: "Data Photobox tidak terbaca." }, { status: 400 }); }
	const programSlug = typeof input.programSlug === "string" ? input.programSlug.trim().toLowerCase() : "";
	const destinationSlug = typeof input.destinationSlug === "string" ? input.destinationSlug.trim().toLowerCase() : "";
	const templateId = typeof input.templateId === "string" ? input.templateId.trim() : "";
	const caption = typeof input.caption === "string" ? input.caption.trim() : "";
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(programSlug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destinationSlug) || !/^[a-z0-9_-]{1,80}$/i.test(templateId) || !caption || caption.length > 1000) {
		return NextResponse.json({ error: "Program, template, atau caption tidak valid." }, { status: 400 });
	}
	try {
		const supabase = await createClient();
		const { data: current } = await supabase.auth.getUser();
		if (!current.user) {
			const { error: signInError } = await supabase.auth.signInAnonymously();
			if (signInError) return NextResponse.json({ error: "Sesi pengunjung belum siap. Muat ulang halaman." }, { status: 401 });
		}
		const { data, error } = await supabase.rpc("record_public_minigame_photo", {
			p_program_slug: programSlug,
			p_destination_slug: destinationSlug,
			p_template_id: templateId,
			p_caption: caption,
			p_drive_file_id: null,
		});
		if (error) throw error;
		const status = data?.error === "PHOTOBOX_LOCKED" ? 403 : data?.error ? 400 : 200;
		return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
	} catch {
		return NextResponse.json({ error: "Kenangan belum tersimpan ke progres. Pastikan migration minigame programs sudah diterapkan." }, { status: 503 });
	}
}
