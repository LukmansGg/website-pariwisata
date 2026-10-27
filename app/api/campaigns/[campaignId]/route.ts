import { NextResponse } from "next/server";
import { createClient } from "@/src/infrastructure/supabase/server";
import { parseCampaignFormSchema } from "@/src/features/campaigns/form-schema";

type RouteContext = { params: Promise<{ campaignId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext) {
	const { campaignId } = await params;
	if (!uuidPattern.test(campaignId)) return NextResponse.json({ error: "Campaign tidak valid." }, { status: 400 });
	try {
		const supabase = await createClient();
		const { data, error } = await supabase.from("promotion_campaigns")
			.select("id,form_schema,cta_label,cta_url,starts_at,ends_at")
			.eq("id", campaignId).eq("status", "published").maybeSingle();
		if (error) throw error;
		if (!data || (data.starts_at && new Date(data.starts_at).getTime() > Date.now())
			|| (data.ends_at && new Date(data.ends_at).getTime() <= Date.now())) {
			return NextResponse.json({ error: "Campaign sudah tidak tersedia." }, { status: 404 });
		}
		const formSchema = parseCampaignFormSchema(data.form_schema);
		if (!formSchema) return NextResponse.json({ error: "Form campaign belum valid." }, { status: 503 });
		return NextResponse.json({ id: data.id, formSchema, ctaLabel: data.cta_label, ctaUrl: data.cta_url }, { headers: { "Cache-Control": "no-store, max-age=0" } });
	} catch {
		return NextResponse.json({ error: "Campaign belum dapat dimuat. Pastikan migration form campaign sudah diterapkan." }, { status: 503 });
	}
}

export async function POST(request: Request, { params }: RouteContext) {
	const { campaignId } = await params;
	if (!uuidPattern.test(campaignId)) return NextResponse.json({ error: "Campaign tidak valid." }, { status: 400 });
	let body: Record<string, unknown>;
	try {
		const parsed = await request.json() as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "Jawaban form tidak valid." }, { status: 400 });
		body = parsed as Record<string, unknown>;
	} catch { return NextResponse.json({ error: "Jawaban form tidak terbaca." }, { status: 400 }); }
	const values = body.values;
	if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length > 12) {
		return NextResponse.json({ error: "Jawaban form tidak valid." }, { status: 400 });
	}
	try {
		const supabase = await createClient();
		const { data: current } = await supabase.auth.getUser();
		if (!current.user) {
			const { error } = await supabase.auth.signInAnonymously();
			if (error) return NextResponse.json({ error: "Sesi pengunjung belum siap." }, { status: 401 });
		}
		const { data, error } = await supabase.rpc("submit_public_campaign_response", { p_campaign_id: campaignId, p_values: values });
		if (error) throw error;
		const result = data as { error?: string; status?: string; field?: string };
		if (result?.error) {
			const messages: Record<string, string> = {
				REQUIRED_FIELD_MISSING: "Lengkapi kolom wajib sebelum mengirim.",
				INVALID_CHOICE: "Pilih salah satu opsi yang tersedia.",
				INVALID_EMAIL: "Periksa kembali alamat email.",
				FORM_NOT_CONFIGURED: "Form ini sudah tidak tersedia.",
				CAMPAIGN_NOT_AVAILABLE: "Campaign sudah berakhir atau tidak aktif.",
				already_submitted: "Pilihanmu untuk campaign ini sudah tercatat.",
			};
			return NextResponse.json({ error: messages[result.error] || "Jawaban form tidak valid." }, { status: 400 });
		}
		return NextResponse.json(result, { status: result?.status === "already_submitted" ? 409 : 200, headers: { "Cache-Control": "no-store, max-age=0" } });
	} catch {
		return NextResponse.json({ error: "Jawaban belum tersimpan. Coba lagi sebentar." }, { status: 503 });
	}
}
