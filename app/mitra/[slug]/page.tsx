import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/src/infrastructure/supabase/server";
import { PartnerShowcase } from "./partner-showcase";

type PartnerPageProps = { params: Promise<{ slug: string }> };

export default function LocalPartnerPage({ params }: PartnerPageProps) {
	return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-sky-50 px-4 text-sky-950"><p className="rounded-2xl border border-white bg-white/80 px-6 py-4 text-sm font-semibold shadow-lg">Memuat profil mitra…</p></main>}>
		<LocalPartnerProfile params={params} />
	</Suspense>;
}

async function LocalPartnerProfile({ params }: PartnerPageProps) {
	await connection();
	const { slug } = await params;
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
	const supabase = await createClient();
	const { data: partner, error } = await supabase.from("tourism_partners")
		.select("business_name,slug,business_type,business_categories,description,contact_phone,address,website_url,logo_url,status")
		.eq("slug", slug).eq("status", "active").maybeSingle();
	if (error || !partner) notFound();
	const categories: string[] = Array.isArray(partner.business_categories)
		? partner.business_categories.filter((category: unknown): category is string => typeof category === "string" && category.trim().length > 0)
		: [];
	if (!categories.length && partner.business_type) categories.push(partner.business_type);
	const websiteUrl = partner.website_url && /^https?:\/\//i.test(partner.website_url) ? partner.website_url : null;
	const phone = partner.contact_phone?.replace(/[^\d+]/g, "") ?? "";
	const whatsappUrl = phone ? `https://wa.me/${phone.replace(/^\+/, "")}` : null;

	return <PartnerShowcase
		name={partner.business_name}
		businessType={partner.business_type}
		categories={categories}
		description={partner.description}
		address={partner.address}
		logoUrl={partner.logo_url}
		websiteUrl={websiteUrl}
		whatsappUrl={whatsappUrl}
	/>;
}
