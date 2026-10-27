import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/src/infrastructure/supabase/server";

type PartnerPageProps = { params: Promise<{ slug: string }> };

export default function LocalPartnerPage({ params }: PartnerPageProps) {
	return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-[#F3FAFE] px-4 text-[#16587B]"><p className="rounded-2xl border border-white bg-white/80 px-6 py-4 text-sm font-semibold shadow-lg">Memuat profil mitra…</p></main>}>
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
	const website = partner.website_url && /^https?:\/\//i.test(partner.website_url) ? partner.website_url : null;
	const phone = partner.contact_phone?.replace(/[^\d+]/g, "") ?? "";
	const whatsappHref = phone ? `https://wa.me/${phone.replace(/^\+/, "")}` : null;

	return <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_10%_0%,#DFF4FF_0,transparent_36%),radial-gradient(circle_at_100%_12%,#FBE9D7_0,transparent_30%),linear-gradient(145deg,#F5EEDD,#F3FAFE_58%,#EAF3FA)] px-4 py-8 text-[#16587B] sm:px-8 sm:py-12">
		<div className="mx-auto max-w-4xl">
			<Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/80 bg-white/65 px-4 text-xs font-bold shadow-sm transition hover:-translate-y-0.5">← Kembali ke TiLoc</Link>
			<article className="mt-6 overflow-hidden rounded-[2rem] border border-white/90 bg-white/75 shadow-[0_30px_90px_-45px_rgba(22,88,123,.4)] backdrop-blur-xl sm:rounded-[2.6rem]">
				<div className="relative grid min-h-72 items-end overflow-hidden bg-gradient-to-br from-sky-100 via-white to-amber-50 p-6 sm:min-h-96 sm:p-10">
					{partner.logo_url && <Image src={partner.logo_url} alt={`Logo atau foto ${partner.business_name}`} fill priority unoptimized className="object-cover opacity-25 blur-[1px]"/>}
					<div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/65 to-white/25"/>
					<div className="relative z-10 flex flex-col items-start gap-5 sm:flex-row sm:items-end">
						{partner.logo_url ? <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border-4 border-white bg-white shadow-xl sm:h-32 sm:w-32"><Image src={partner.logo_url} alt={`Logo ${partner.business_name}`} fill unoptimized className="object-cover"/></div> : <div className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-sky-100 text-4xl">🏡</div>}
						<div><p className="text-[10px] font-black uppercase tracking-[.2em] text-sky-700">MITRA LOKAL · TILOC</p><h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">{partner.business_name}</h1><div className="mt-3 flex flex-wrap gap-2">{categories.map((category) => <span key={category} className="rounded-full border border-sky-200 bg-white/90 px-3 py-1.5 text-[10px] font-bold text-sky-900">{category}</span>)}</div></div>
					</div>
				</div>
				<div className="grid gap-8 p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_260px]">
					<section><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#16587B]/50">TENTANG USAHA</p><p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#16587B]/80 sm:text-base">{partner.description}</p>{partner.address && <div className="mt-6 rounded-2xl border border-[#84B3CE]/25 bg-sky-50/55 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-[#16587B]/50">ALAMAT</p><p className="mt-1 text-sm font-semibold">{partner.address}</p></div>}</section>
					<aside className="space-y-3"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#16587B]/50">HUBUNGI MITRA</p>{whatsappHref && <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#16587B] px-4 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5">WhatsApp mitra ↗</a>}{website && <a href={website} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#84B3CE]/35 bg-white px-4 py-3 text-sm font-bold text-[#16587B] transition hover:bg-sky-50">Kunjungi tautan ↗</a>}{!whatsappHref && !website && <p className="rounded-xl bg-sky-50 p-4 text-xs leading-5 text-[#16587B]/60">Kontak publik belum tersedia.</p>}<p className="pt-2 text-[10px] leading-5 text-[#16587B]/45">Profil mitra lokal di halaman TiLoc.</p></aside>
				</div>
			</article>
			<footer className="mt-6 text-center text-[10px] font-semibold text-[#16587B]/45">TiLoc · Jelajahi wisata dan usaha lokal</footer>
		</div>
	</main>;
}
