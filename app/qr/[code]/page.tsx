import { createClient } from "@/src/infrastructure/supabase/server";
import { notFound, redirect } from "next/navigation";

type PageProps = { params: Promise<{ code: string }> };

export default async function QrDestinationPage({ params }: PageProps) {
	const { code } = await params;
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) notFound();

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("resolve_public_qr", { p_code: code });
	const destination = Array.isArray(data) ? data[0] : data;
	if (
		error || !destination || typeof destination !== "object" ||
		!("slug" in destination) || typeof destination.slug !== "string" ||
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destination.slug)
	) notFound();

	redirect(`/wisata/${encodeURIComponent(destination.slug)}?qr=${encodeURIComponent(code)}`);
}
