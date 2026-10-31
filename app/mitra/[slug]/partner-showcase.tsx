"use client";

import Link from "next/link";
import { TiLocBrand } from "@/src/components/tiloc-brand";
import { useTheme } from "@/src/components/theme-provider";

type PartnerShowcaseProps = {
	name: string;
	businessType: string | null;
	categories: string[];
	description: string;
	address: string | null;
	logoUrl: string | null;
	websiteUrl: string | null;
	whatsappUrl: string | null;
};

export function PartnerShowcase({ name, businessType, categories, description, address, logoUrl, websiteUrl, whatsappUrl }: PartnerShowcaseProps) {
	const { isDark, toggleTheme } = useTheme();
	const shell = isDark
		? "bg-[#080f1e] text-sky-50"
		: "bg-[linear-gradient(165deg,#bae6fd_0%,#e0f2fe_38%,#f8fbff_72%,#fff7e7_100%)] text-[#123a59]";
	const card = isDark
		? "border-white/10 bg-slate-900/75 shadow-[0_24px_65px_rgba(0,0,0,.35)]"
		: "border-white/80 bg-white/70 shadow-[0_24px_65px_rgba(22,88,123,.13)]";
	const muted = isDark ? "text-sky-100/65" : "text-[#16587B]/65";
	const linkCard = isDark ? "border-white/10 bg-white/[.045] hover:bg-white/[.09]" : "border-sky-900/10 bg-white/70 hover:bg-white";

	return <main className={`relative isolate min-h-dvh overflow-hidden px-4 py-5 sm:px-8 sm:py-8 ${shell}`}>
		<style>{`@keyframes partner-drift{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-9px,0)}}@keyframes partner-twinkle{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.12)}}@media(prefers-reduced-motion:reduce){.partner-drift,.partner-twinkle{animation:none!important}}`}</style>
		<div aria-hidden="true" className={`pointer-events-none absolute -top-28 left-[8%] h-72 w-72 rounded-full blur-3xl ${isDark ? "bg-sky-600/15" : "bg-white/65"}`} />
		<div aria-hidden="true" className={`pointer-events-none absolute right-[-7rem] top-[34%] h-80 w-80 rounded-full blur-3xl ${isDark ? "bg-indigo-500/10" : "bg-amber-200/35"}`} />
		{isDark && <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(#bfdbfe_1px,transparent_1px)] [background-size:39px_39px]" />}
		<div className="relative mx-auto max-w-6xl">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<Link href="/" aria-label="TiLoc! beranda" className="transition hover:-translate-y-0.5"><TiLocBrand markClassName="h-10 w-10" wordmarkClassName={isDark ? "text-lg font-black tracking-tight text-sky-50" : "text-lg font-black tracking-tight text-[#16587B]"} accentClassName="text-amber-500" tagline="Titik Lokasi" /></Link>
				<div className="flex items-center gap-2"><button type="button" onClick={toggleTheme} aria-label={isDark ? "Ganti ke tema langit" : "Ganti ke tema malam"} className={`grid h-11 w-11 place-items-center rounded-full border text-lg shadow-sm transition hover:-translate-y-0.5 ${isDark ? "border-white/10 bg-white/5 text-amber-200 hover:bg-white/10" : "border-white bg-white/70 text-sky-800 hover:bg-white"}`}>{isDark ? "☀️" : "🌙"}</button><Link href="/" className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-black transition hover:-translate-y-0.5 ${isDark ? "border-white/10 bg-white/5 text-sky-100 hover:bg-white/10" : "border-white bg-white/70 text-[#16587B] hover:bg-white"}`}>← Jelajah</Link></div>
			</header>

			<section className={`relative mt-7 overflow-hidden rounded-[2.25rem] border p-5 sm:mt-10 sm:rounded-[2.8rem] sm:p-9 lg:p-12 ${card}`}>
				<div aria-hidden="true" className={`absolute -right-10 -top-20 h-64 w-64 rounded-full blur-3xl ${isDark ? "bg-indigo-400/10" : "bg-sky-300/35"}`} />
				<div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-12">
					<div className="min-w-0">
						<div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/50 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.15em] text-emerald-700 dark:text-emerald-200"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />MITRA LOKAL · KENALAN YUK</div>
						<h1 className="mt-5 max-w-[16ch] break-words text-4xl font-black leading-[1.04] tracking-tight sm:text-6xl">{name}<span className="text-sky-500">!</span></h1>
						<p className={`mt-3 text-sm font-bold sm:text-base ${muted}`}>{categories.length ? categories.join(" · ") : businessType || "Usaha lokal"}</p>
						<p className={`mt-5 max-w-2xl whitespace-pre-line text-sm leading-7 sm:text-base sm:leading-8 ${muted}`}>{description}</p>
						{categories.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{categories.map((category) => <span key={category} className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${isDark ? "border-sky-200/15 bg-sky-300/10 text-sky-100" : "border-sky-200 bg-white/75 text-sky-900"}`}>{category}</span>)}</div>}
						<div className="mt-7 flex flex-wrap gap-3">{whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="partner-drift inline-flex min-h-13 items-center gap-2 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-3 text-sm font-black text-white shadow-[0_5px_0_#08734c,0_12px_28px_rgba(5,150,105,.25)] transition hover:-translate-y-1 active:translate-y-1 active:shadow-[0_2px_0_#08734c]">💬 Sapa lewat WhatsApp</a>}{websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer" className={`inline-flex min-h-13 items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black transition hover:-translate-y-1 ${isDark ? "border-sky-200/15 bg-white/5 text-sky-50" : "border-sky-200 bg-white/75 text-[#16587B]"}`}>🌐 Kunjungi tautan ↗</a>}</div>
					</div>
					<div className="partner-drift relative mx-auto w-full max-w-md">
						<div className={`absolute -inset-4 rotate-3 rounded-[2rem] border-2 ${isDark ? "border-sky-300/15 bg-sky-300/5" : "border-white/75 bg-sky-200/25"}`} />
						<div className={`relative overflow-hidden rounded-[1.8rem] border p-3 ${isDark ? "border-white/10 bg-gradient-to-br from-slate-800 to-[#102c4a]" : "border-white bg-gradient-to-br from-white to-sky-100"}`}>
							<div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-sky-200 via-blue-100 to-amber-100 dark:from-sky-950 dark:via-indigo-950 dark:to-slate-900">
								{logoUrl ? <><img src={logoUrl} alt={`Foto atau logo ${name}`} className="absolute inset-0 h-full w-full object-cover opacity-55"/><div className="absolute inset-0 bg-gradient-to-t from-[#08243e]/80 via-[#0b3d60]/10 to-transparent"/><img src={logoUrl} alt="" className="relative z-10 h-36 w-36 rounded-[2rem] border-4 border-white/90 object-cover shadow-[0_20px_50px_rgba(0,0,0,.3)] sm:h-44 sm:w-44"/></> : <div className="grid h-36 w-36 place-items-center rounded-[2rem] border-4 border-white/75 bg-white/40 text-7xl shadow-xl">🏡</div>}
								<span className="partner-twinkle absolute right-4 top-4 text-3xl text-amber-400 drop-shadow">✦</span><span className="partner-twinkle absolute bottom-5 left-5 text-2xl text-white drop-shadow" style={{ animationDelay: "700ms" }}>✧</span>
								<div className="absolute bottom-4 left-4 right-4 z-10 flex items-end justify-between gap-3"><span className="min-w-0 truncate text-sm font-black text-white drop-shadow-md sm:text-base">{name}</span><span className="shrink-0 rounded-full border border-white/50 bg-white/20 px-2.5 py-1 text-[9px] font-black uppercase text-white backdrop-blur">Local pick</span></div>
							</div>
							<div className="flex items-center justify-between gap-3 px-2 pb-1 pt-4"><div><p className={`text-[9px] font-black uppercase tracking-[.18em] ${muted}`}>SPOTLIGHT USAHA LOKAL</p><p className="mt-1 text-xs font-black">Usaha di sekitar cerita wisata ✨</p></div><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-amber-300 to-orange-400 text-xl shadow-[0_4px_0_#b45309]">⭐</span></div>
						</div>
					</div>
				</div>
			</section>

			<div className="mt-5 grid gap-4 md:grid-cols-2">
				<section className={`rounded-[1.8rem] border p-5 sm:p-6 ${card}`}><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-b from-sky-300 to-blue-500 text-xl shadow-[0_4px_0_#1d4ed8]">🧭</span><div><p className={`text-[9px] font-black uppercase tracking-[.18em] ${muted}`}>INFO SINGKAT</p><h2 className="text-base font-black">Singgah & nikmati</h2></div></div><div className={`mt-5 rounded-2xl border p-4 text-sm leading-6 ${isDark ? "border-white/10 bg-white/[.04]" : "border-sky-100 bg-sky-50/75"}`}>{address ? <><p className={`text-[9px] font-black uppercase tracking-[.15em] ${muted}`}>ALAMAT</p><p className="mt-1 font-bold">{address}</p></> : <p className={muted}>Alamat belum dicantumkan. Hubungi mitra untuk petunjuk lokasi.</p>}</div></section>
				<section className={`rounded-[1.8rem] border p-5 sm:p-6 ${card}`}><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-b from-amber-300 to-orange-500 text-xl shadow-[0_4px_0_#b45309]">🎒</span><div><p className={`text-[9px] font-black uppercase tracking-[.18em] ${muted}`}>KARTU KONTAK</p><h2 className="text-base font-black">Mau tanya sesuatu?</h2></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${linkCard}`}><span className="text-xl">💬</span><strong className="mt-2 block text-xs">Chat mitra</strong><span className={`mt-1 block text-[10px] ${muted}`}>Tanya langsung lewat WhatsApp</span></a> : <div className={`rounded-2xl border p-4 ${linkCard}`}><span className="text-xl">📭</span><strong className="mt-2 block text-xs">Kontak belum tersedia</strong><span className={`mt-1 block text-[10px] ${muted}`}>Info akan ditampilkan saat sudah ada.</span></div>}{websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer" className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${linkCard}`}><span className="text-xl">🌐</span><strong className="mt-2 block text-xs">Kanal online</strong><span className={`mt-1 block text-[10px] ${muted}`}>Buka halaman resmi mitra</span></a> : <div className={`rounded-2xl border p-4 ${linkCard}`}><span className="text-xl">🧩</span><strong className="mt-2 block text-xs">Temukan usaha ini</strong><span className={`mt-1 block text-[10px] ${muted}`}>Simpan namanya saat menjelajah.</span></div>}</div></section>
			</div>
			<footer className={`mt-7 flex flex-wrap items-center justify-between gap-3 px-2 pb-5 text-[10px] font-bold ${muted}`}><span>TiLoc! · Temukan cerita dan usaha lokal.</span><Link href="/" className="underline decoration-sky-400/50 underline-offset-4">Jelajahi tempat lain ↗</Link></footer>
		</div>
	</main>;
}
