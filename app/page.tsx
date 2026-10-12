"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@/src/components/theme-provider";

const MOODS = [
	{ id: 1, name: "Healing Alam", icon: "🍃" },
	{ id: 2, name: "Kuliner Malam", icon: "🍜" },
	{ id: 3, name: "Spot Foto", icon: "📸" },
	{ id: 4, name: "Sejarah & Budaya", icon: "🏛️" },
	{ id: 5, name: "Adrenalin", icon: "🚴" },
];

type DestinationRow = {
	id: string;
	slug: string;
	name: string;
	description?: string | null;
	category?: string | null;
	image_url?: string | null;
	image?: string | null;
	cover_image?: string | null;
	latitude?: number | string | null;
	longitude?: number | string | null;
	rating?: number | null;
	reviews?: number | null;
	tags?: string[] | null;
	is_featured?: boolean | null;
};

type DestinationCard = {
	id: string;
	slug: string;
	title: string;
	description: string;
	category: string;
	image?: string;
	rating?: number;
	reviews?: number;
	tags: string[];
	featured: boolean;
};

function toDestinationCard(row: DestinationRow): DestinationCard {
	const imageValue = row.image_url ?? row.cover_image ?? row.image;
	const image = typeof imageValue === "string" ? imageValue : undefined;
	return {
		id: row.id,
		slug: row.slug,
		title: row.name,
		description: row.description ?? "",
		category: row.category ?? "Wisata Madiun",
		...(image ? { image } : {}),
		...(typeof row.rating === "number" ? { rating: row.rating } : {}),
		...(typeof row.reviews === "number" ? { reviews: row.reviews } : {}),
		tags: Array.isArray(row.tags) ? row.tags : [],
		featured: row.is_featured === true,
	};
}

function destinationHasRequiredMediaAndLocation(row: DestinationRow) {
	const image = row.image_url ?? row.cover_image ?? row.image;
	if (row.latitude === null || row.latitude === undefined || row.latitude === "" || row.longitude === null || row.longitude === undefined || row.longitude === "") return false;
	const latitude = Number(row.latitude);
	const longitude = Number(row.longitude);
	return typeof image === "string" && image.trim().length > 0 &&
		Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
		Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

const MOOD_TERMS: Record<number, string[]> = {
	1: ["alam", "hutan", "waduk", "air terjun", "alam"],
	2: ["kuliner", "makanan", "pecel", "malam"],
	3: ["foto", "spot", "pemandangan", "view"],
	4: ["sejarah", "budaya", "monumen", "museum"],
	5: ["adrenalin", "petualangan", "camping", "sepeda", "trail"],
};

// Reusable SVG Icons to avoid external dependencies
const IconSearch = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<circle cx="11" cy="11" r="8" />
		<path d="m21 21-4.3-4.3" />
	</svg>
);
const IconMapPin = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
		<circle cx="12" cy="10" r="3" />
	</svg>
);
const IconCamera = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
		<circle cx="12" cy="13" r="3" />
	</svg>
);
const IconArrowRight = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<path d="M5 12h14" />
		<path d="m12 5 7 7-7 7" />
	</svg>
);
const IconSparkle = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" />
		<path d="m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14Z" />
	</svg>
);
const IconMessage = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
	</svg>
);
const IconX = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<path d="M18 6 6 18" />
		<path d="m6 6 12 12" />
	</svg>
);

const IconSun = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2m-3.66 5.66 1.41 1.41M6.34 6.34 4.93 4.93"/></svg>;
const IconMoon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>;
const IconMenu = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>;
const IconEnvelope = () => (
	<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<rect x="3" y="5" width="18" height="14" rx="3" />
		<path d="m4 7 8 6 8-6" />
	</svg>
);

const STAR_POSITIONS = [
	[8, 18, 3], [18, 66, 2], [28, 32, 2], [39, 82, 3], [48, 13, 2], [57, 54, 2],
	[68, 24, 3], [76, 74, 2], [86, 41, 2], [94, 16, 3], [12, 91, 2], [91, 88, 2],
] as const;

const LIGHT_SPARKLES = [[9, 20], [27, 46], [84, 18], [72, 68], [15, 84], [93, 76], [48, 12], [55, 91]] as const;

function StarParticles({ isDark }: { isDark: boolean }) {
	return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
		{(isDark ? STAR_POSITIONS : []).map(([left, top, size], index) => <span key={`star-${index}`} className="home-star" style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, animationDelay: `${(index % 6) * 370}ms` }} />)}
		{(isDark ? [[71, 18], [94, 39]] as const : LIGHT_SPARKLES).map(([left, top], index) => isDark
			? <span key={`shooting-${index}`} className="shooting-star" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${index * 3.8}s` }} />
			: <span key={`sparkle-${index}`} className="ambient-sparkle" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${index * 430}ms` }}><IconSparkle /></span>)}
		<span className="absolute -left-28 top-[18%] h-72 w-72 rounded-full bg-[var(--home-accent)]/10 blur-3xl" />
		<span className="absolute -right-32 top-[62%] h-80 w-80 rounded-full bg-[var(--home-primary)]/10 blur-3xl" />
	</div>;
}

const GlobalStyles = () => (
	<style
		dangerouslySetInnerHTML={{
			__html: `
    .home-page {
      --home-canvas: #f6fbff;
      --home-ink: #103b56;
      --home-primary: #287fa8;
      --home-accent: #83c9e8;
      --home-soft: #e8f6fd;
      --home-glass: rgba(255, 255, 255, 0.86);
      --home-glass-border: rgba(190, 229, 246, 0.82);
      --home-on-primary: #ffffff;
      --home-on-accent: #103b56;
      --home-bloom: rgba(99, 190, 230, 0.25);
      color-scheme: only light;
      forced-color-adjust: none;
      color: var(--home-ink);
      background: var(--home-canvas) !important;
      background-color: #f6fbff !important;
      isolation: isolate;
      overflow-x: clip;
      transition: background-color 350ms ease, color 350ms ease;
      -webkit-font-smoothing: antialiased;
    }
    .home-page.dark {
      --home-canvas: #070c18;
      --home-ink: #eaf2ff;
      --home-primary: #15233d;
      --home-accent: #b99aff;
      --home-soft: #111b31;
      --home-glass: rgba(15, 24, 43, 0.78);
      --home-glass-border: rgba(185, 154, 255, 0.24);
      --home-on-primary: #ffffff;
      --home-on-accent: #211638;
      --home-bloom: rgba(156, 123, 255, 0.32);
      color-scheme: dark;
      color: var(--home-ink);
      background: linear-gradient(135deg, #050914 0%, #0a1427 55%, #11152a 100%) !important;
      background-color: #070c18 !important;
    }
    .home-page:not(.dark) { background-image: linear-gradient(135deg, #e0f2fe 0%, #f5fbff 50%, #c9edff 100%); }
    .home-page .glass-panel {
      background: var(--home-glass);
      border: 1px solid var(--home-glass-border);
      box-shadow: 0 12px 34px -24px var(--home-bloom);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 260ms ease, border-color 260ms ease;
    }
    .home-page .glass-panel:hover {
      box-shadow: 0 18px 42px -24px var(--home-bloom);
      border-color: color-mix(in srgb, var(--home-accent) 48%, transparent);
    }
    .home-page .home-star {
      position: absolute;
      border-radius: 999px;
      background: var(--home-accent);
      box-shadow: 0 0 12px var(--home-bloom);
      animation: homeTwinkle 3.8s ease-in-out infinite;
    }
    .home-page .matrix-cell { animation: matrixPulse 1.8s ease-in-out infinite; }
    .home-page .matrix-cell.is-fixed { animation: none; opacity: 1; }
    .home-page .matrix-qr-stage::after { content: ""; position: absolute; left: 8%; right: 8%; top: 10%; height: 2px; background: var(--home-accent); box-shadow: 0 0 14px var(--home-accent); opacity: .8; animation: qrScan 3.4s ease-in-out infinite; pointer-events: none; }
    .home-page .mood-float { animation: moodFloat 4.6s ease-in-out infinite; }
    .home-page .animate-envelope-float { animation: envelopeFloat 4.5s ease-in-out infinite; }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes float {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
      100% { transform: translateY(0px); }
    }

    @keyframes scanVertical {
      0% { top: 10%; opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { top: 90%; opacity: 0; }
    }

    @keyframes pulseGlow {
      0% { box-shadow: 0 0 0 0 var(--home-bloom); }
      70% { box-shadow: 0 0 0 16px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }
    @keyframes homeTwinkle { 0%, 100% { opacity: 0.18; transform: scale(0.75); } 50% { opacity: 0.8; transform: scale(1); } }
    @keyframes matrixPulse { 0%, 100% { opacity: 0.18; } 50% { opacity: 0.9; filter: drop-shadow(0 0 5px var(--home-accent)); } }
    @keyframes qrScan { 0%,100% { top: 12%; opacity: .35; } 50% { top: 88%; opacity: .9; } }
    @keyframes envelopeFloat { 0%, 100% { transform: translateY(0) rotate(-5deg); } 50% { transform: translateY(-7px) rotate(4deg); } }
    @keyframes moodFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
    @keyframes shootingStar { 0% { transform: translate(0,0) rotate(315deg) scaleX(0); opacity: 0; } 10% { opacity: 1; scale: 1; } 100% { transform: translate(-55vw,55vh) rotate(315deg) scaleX(1); opacity: 0; } }
    @keyframes sparkleFloat { 0%,100% { transform: translateY(0) scale(.55) rotate(0); opacity: .2; } 50% { transform: translateY(-18px) scale(1) rotate(35deg); opacity: .8; } }
    .home-page .shooting-star { position:absolute; width:150px; height:2px; border-radius:99px; background:linear-gradient(90deg,transparent,var(--home-accent)); box-shadow:0 0 12px var(--home-bloom); animation:shootingStar 8s linear infinite; }
    .home-page .ambient-sparkle { position:absolute; color:var(--home-accent); filter:drop-shadow(0 0 8px var(--home-bloom)); animation:sparkleFloat 5s ease-in-out infinite; }

    @keyframes mobileNavEnter {
      from { opacity: 0; transform: translateY(7px); filter: blur(4px); }
      to { opacity: 1; transform: translateY(0); filter: blur(0); }
    }

    .mobile-nav-enter { animation: mobileNavEnter 360ms cubic-bezier(0.16, 1, 0.3, 1) both; }

    .animate-fade-up {
      animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      opacity: 0;
    }
    
    .animate-fade {
      animation: fadeIn 1s ease-out forwards;
      opacity: 0;
    }

    .animate-float {
      animation: float 6s ease-in-out infinite;
    }

    .animate-scan-line {
      animation: scanVertical 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    .btn-pulse:hover {
      animation: pulseGlow 1.5s infinite;
    }

    /* Animation Delays for Staggered Load */
    .delay-100 { animation-delay: 100ms; }
    .delay-200 { animation-delay: 200ms; }
    .delay-300 { animation-delay: 300ms; }
    .delay-400 { animation-delay: 400ms; }
    .delay-500 { animation-delay: 500ms; }

    @media (prefers-reduced-motion: reduce) {
      .home-page *, .home-page *::before, .home-page *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: 1ms !important; }
    }

  `,
		}}
	/>
);

const HOME_SECTIONS = [
	{ id: "beranda", label: "Beranda" },
	{ id: "peta", label: "Jelajah peta" },
	{ id: "kuliner", label: "Pilih suasana" },
	{ id: "destinasi", label: "Destinasi" },
	{ id: "promo", label: "Promo" },
	{ id: "tentang", label: "Tentang" },
] as const;

function Navbar({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
	const [activeSection, setActiveSection] = useState<string>(HOME_SECTIONS[0].id);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		let frame = 0;
		const updateActiveSection = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const scrollLine = window.innerHeight * 0.38;
				let current: string = HOME_SECTIONS[0].id;
				for (const section of HOME_SECTIONS) {
					const element = document.getElementById(section.id);
					if (element && element.getBoundingClientRect().top <= scrollLine) current = section.id;
				}
				if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
					current = "tentang";
				}
				setActiveSection(current);
			});
		};

		updateActiveSection();
		window.addEventListener("scroll", updateActiveSection, { passive: true });
		window.addEventListener("resize", updateActiveSection);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", updateActiveSection);
			window.removeEventListener("resize", updateActiveSection);
		};
	}, []);

	const activeIndex = Math.max(0, HOME_SECTIONS.findIndex((section) => section.id === activeSection));
	const current = HOME_SECTIONS[activeIndex];

	return (
		<nav className="glass-panel fixed top-0 z-50 w-full !border-x-0 !border-t-0 !rounded-none bg-[var(--home-glass)]/90 transition-all duration-300">
			<div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
				<a href="#beranda" className="flex items-center gap-2 cursor-pointer group">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--home-primary)] text-xl font-bold text-[var(--home-on-primary)] transition-transform group-hover:scale-105">M</div>
					<span className="text-xl font-extrabold tracking-tight text-[var(--home-ink)]">MadiunTrip<span className="text-[var(--home-accent)]">.</span></span>
				</a>
				<div className="hidden items-center gap-8 font-medium text-[var(--home-ink)] md:flex">
					<a href="#destinasi" className="relative transition-colors after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-[var(--home-accent)] after:transition-all hover:text-[var(--home-accent)] hover:after:w-full">Destinasi</a>
					<a href="#kuliner" className="relative transition-colors after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-[var(--home-accent)] after:transition-all hover:text-[var(--home-accent)] hover:after:w-full">Kuliner</a>
					<a href="#promo" className="relative transition-colors after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-[var(--home-accent)] after:transition-all hover:text-[var(--home-accent)] hover:after:w-full">Promo</a>
					<Link href="/scan" className="transition-colors hover:text-[var(--home-accent)]">Scan QR</Link>
				</div>
				<div className="hidden items-center gap-2 sm:flex md:hidden" aria-label={`Bagian halaman: ${current.label}`} aria-live="polite">
					<span className="relative flex h-2.5 w-2.5 shrink-0">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--home-accent)]/70" />
						<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--home-primary)]" />
					</span>
					<span key={`${current.id}-index`} className="mobile-nav-enter min-w-5 font-mono text-[10px] font-bold text-[var(--home-ink)]/45">{String(activeIndex + 1).padStart(2, "0")}</span>
					<span className="h-4 w-px bg-[var(--home-primary)]/15" />
					<span key={current.id} className="mobile-nav-enter max-w-[30vw] truncate text-xs font-bold text-[var(--home-ink)]">{current.label}</span>
					<span className="ml-1 h-1 w-10 overflow-hidden rounded-full bg-[var(--home-accent)]/25"><span className="block h-full rounded-full bg-[var(--home-primary)] transition-[width] duration-500 ease-out" style={{ width: `${((activeIndex + 1) / HOME_SECTIONS.length) * 100}%` }} /></span>
				</div>
				<div className="flex items-center gap-2">
					<button type="button" onClick={onToggleTheme} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--home-glass-border)] bg-[var(--home-glass)] text-[var(--home-ink)] transition hover:-translate-y-0.5" aria-label={isDark ? "Aktifkan tema terang" : "Aktifkan tema gelap"} title={isDark ? "Tema terang" : "Tema gelap"}>{isDark ? <IconSun /> : <IconMoon />}</button>
					<Link href="/login" className="hidden rounded-full bg-[var(--home-primary)] px-5 py-2.5 font-medium text-white shadow-sm transition-all hover:scale-105 md:inline-flex">Masuk</Link>
					<button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--home-glass-border)] text-[var(--home-ink)] md:hidden" aria-expanded={menuOpen} aria-label={menuOpen ? "Tutup menu" : "Buka menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <IconX /> : <IconMenu />}</button>
				</div>
			</div>
			{menuOpen && <div className="border-t border-[var(--home-glass-border)] px-5 py-4 shadow-lg md:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-1">{HOME_SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`} onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 font-semibold text-[var(--home-ink)] transition hover:bg-[var(--home-soft)]">{section.label}</a>)}<Link href="/scan" onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 font-semibold text-[var(--home-ink)] transition hover:bg-[var(--home-soft)]">Scan QR</Link><Link href="/login" onClick={() => setMenuOpen(false)} className="mt-2 rounded-xl bg-[var(--home-primary)] px-4 py-3 text-center font-bold text-white">Masuk petugas</Link></div></div>}
		</nav>
	);
}

const HeroSection = () => {
	return (
		<section id="beranda" className="relative pt-32 pb-20 px-6 overflow-hidden min-h-[90vh] flex flex-col items-center justify-center">
			{/* Decorative Background Elements */}
			<div className="absolute top-40 left-10 w-32 h-32 bg-[var(--home-accent)]/20 rounded-full blur-3xl animate-float"></div>
			<div className="absolute bottom-20 right-10 w-64 h-64 bg-[var(--home-accent)]/20 rounded-full blur-3xl animate-float delay-300"></div>

			{/* Tiny Map Coordinates / Decor */}
			<div className="absolute top-32 right-20 text-[var(--home-ink)]/40 text-xs font-mono hidden lg:block animate-fade">
				7°37&apos;48.0&apos;S 111°31&apos;24.0&quot;E
			</div>

			<div className="max-w-4xl mx-auto w-full flex flex-col items-center text-center z-10">
				{/* Main Headline */}
				<h1 className="text-5xl md:text-7xl font-black text-[var(--home-ink)] leading-[1.1] tracking-tight mb-6 animate-fade-up delay-100">
					Liburanmu, <br className="md:hidden" />
					<span className="relative inline-block">
						<span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[var(--home-primary)] to-[var(--home-accent)]">
							Cerita Barumu.
						</span>
						<svg
							className="absolute -bottom-2 w-full h-4 text-[var(--home-accent)]/40 -z-10"
							viewBox="0 0 200 20"
							preserveAspectRatio="none">
							<path
								d="M0,10 Q50,20 100,10 T200,10"
								fill="none"
								stroke="currentColor"
								strokeWidth="8"
								strokeLinecap="round"
							/>
						</svg>
					</span>
				</h1>

				<p className="text-lg md:text-xl text-[var(--home-ink)]/80 max-w-2xl mb-12 animate-fade-up delay-200">
					Temukan spot rahasia, kuliner legendaris, dan petualangan epik di
					Kabupaten Madiun.
				</p>

				{/* The Main Feature: Interactive QR Scanner Concept */}
				<div className="w-full max-w-lg animate-fade-up delay-300 group">
					<div className="glass-panel flex flex-col items-center justify-center p-8 rounded-[2.5rem] relative overflow-hidden transition-transform duration-500 hover:-translate-y-2 shadow-[0_20px_60px_-15px_var(--home-bloom)]">
						{/* Scanner Corner Brackets (Game UI feel) */}
						<div className="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-[var(--home-ink)] rounded-tl-xl transition-all group-hover:border-[var(--home-accent)] group-hover:scale-110"></div>
						<div className="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-[var(--home-ink)] rounded-tr-xl transition-all group-hover:border-[var(--home-accent)] group-hover:scale-110"></div>
						<div className="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-[var(--home-ink)] rounded-bl-xl transition-all group-hover:border-[var(--home-accent)] group-hover:scale-110"></div>
						<div className="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-[var(--home-ink)] rounded-br-xl transition-all group-hover:border-[var(--home-accent)] group-hover:scale-110"></div>

						{/* Eyebrow Label */}
						<span className="bg-[var(--home-soft)] text-[var(--home-ink)] text-xs font-bold px-4 py-1.5 rounded-full tracking-wider mb-6 border border-[var(--home-ink)]/10 z-10">
							PETUALANGANMU DIMULAI DI SINI
						</span>

						{/* Scanner Graphic Area */}
						<div className="relative w-48 h-48 mb-8 rounded-2xl bg-[var(--home-soft)]/50 border border-[var(--home-accent)]/30 flex items-center justify-center overflow-hidden">
							<IconCamera />
							{/* Animated Scan Line */}
						<div className="absolute left-0 right-0 h-1 bg-[var(--home-accent)] shadow-[0_0_15px_3px_var(--home-bloom)] animate-scan-line"></div>
							{/* Subtle Grid Pattern in background */}
							<div
								className="absolute inset-0 opacity-10"
								style={{
									backgroundImage:
										"radial-gradient(var(--home-ink) 2px, transparent 2px)",
									backgroundSize: "16px 16px",
								}}></div>
						</div>

						<p className="text-sm text-[var(--home-ink)]/70 mb-8 max-w-xs text-center z-10">
							Scan QR Code di destinasi wisata untuk membuka cerita lokal,
							mini-games, dan kejutan eksklusif.
						</p>

						{/* Main CTA */}
						<Link
							href="/scan"
							className="w-full relative z-10 flex items-center justify-center gap-3 bg-[var(--home-primary)] text-white py-4 px-8 rounded-2xl font-bold text-lg overflow-hidden group/btn shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] btn-pulse active:scale-95">
							<span className="relative z-10">Mulai Scan QR</span>
							<IconArrowRight />
							{/* Button hover effect */}
							<div className="absolute inset-0 bg-gradient-to-r from-[var(--home-primary)] to-[var(--home-accent)] opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
};

const DiscoveryMap = ({
	searchQuery,
	onSearchChange,
}: {
	searchQuery: string;
	onSearchChange: (value: string) => void;
}) => {
	const [area, setArea] = useState<"kabupaten" | "kota">("kabupaten");
	const mapAreas = {
		kabupaten: { label: "Kabupaten Madiun", bbox: "111.20,-7.88,111.86,-7.35", marker: "-7.62,111.55" },
		kota: { label: "Kota Madiun", bbox: "111.48,-7.68,111.56,-7.59", marker: "-7.63,111.53" },
	} as const;
	const selectedArea = mapAreas[area];
	const mapEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(selectedArea.bbox)}&layer=mapnik&marker=${encodeURIComponent(selectedArea.marker)}`;
	const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedArea.label)}`;

	return (
		<section
			id="peta"
			className="relative px-6 -mt-10 z-20 pb-20 max-w-6xl mx-auto">
			<div className="animate-fade-up delay-400">
				{/* Floating Search Capsule */}
				<div className="absolute -top-8 left-1/2 -translate-x-1/2 w-full max-w-2xl z-30 px-4">
					<div className="glass-panel p-2 rounded-full shadow-[0_10px_40px_-10px_var(--home-bloom)] flex items-center">
						<div className="pl-4 text-[var(--home-accent)]">
							<IconSearch />
						</div>
						<input
							type="text"
							placeholder="Cari hidden gem, kuliner, atau wisata alam..."
							className="w-full bg-transparent border-none outline-none px-4 py-3 text-[var(--home-ink)] placeholder-[var(--home-ink)]/40 font-medium"
							value={searchQuery}
							onChange={(e) => onSearchChange(e.target.value)}
						/>
						<button
							type="button"
							onClick={() =>
								document
									.getElementById("destinasi")
									?.scrollIntoView({ behavior: "smooth" })
							}
							className="bg-[var(--home-accent)] text-[var(--home-on-accent)] px-6 py-3 rounded-full font-bold hover:bg-[var(--home-primary)] hover:text-white transition-colors shadow-sm">
							Cari
						</button>
					</div>
				</div>

				{/* Map Container */}
				<div className="glass-panel rounded-[2rem] p-4 pt-16 map-container relative overflow-hidden group">
					{/* Decorative map corner */}
					<div className="absolute top-0 right-0 bg-[var(--home-soft)] text-[var(--home-ink)] text-xs font-bold px-4 py-2 rounded-bl-2xl rounded-tr-xl border-b border-l border-[var(--home-ink)]/10 z-10">
						Peta · {selectedArea.label}
					</div>

					<div className="w-full h-[400px] rounded-2xl overflow-hidden bg-[var(--home-soft)] relative">
						<iframe
							width="100%"
							height="100%"
							frameBorder="0"
							scrolling="yes"
							marginHeight={0}
							marginWidth={0}
							loading="lazy"
							src={mapEmbedUrl}
							title={`Peta interaktif ${selectedArea.label}`}
							className="w-full h-full object-cover"></iframe>
						{/* Overlay interaction hint */}
						<div className="absolute inset-0 bg-[var(--home-primary)]/5 pointer-events-none group-hover:bg-transparent transition-colors duration-500"></div>
					</div>
					<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
						<div className="inline-flex rounded-full border border-[var(--home-glass-border)] bg-[var(--home-glass)] p-1" aria-label="Pilih area peta">
							<button type="button" aria-pressed={area === "kabupaten"} onClick={() => setArea("kabupaten")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${area === "kabupaten" ? "bg-[var(--home-primary)] text-white" : "text-[var(--home-ink)] hover:bg-[var(--home-soft)]"}`}>Kabupaten</button>
							<button type="button" aria-pressed={area === "kota"} onClick={() => setArea("kota")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${area === "kota" ? "bg-[var(--home-primary)] text-white" : "text-[var(--home-ink)] hover:bg-[var(--home-soft)]"}`}>Kota Madiun</button>
						</div>
						<a href={googleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[var(--home-ink)] transition hover:bg-[var(--home-soft)]">Buka di Google Maps <IconArrowRight /></a>
					</div>
				</div>
			</div>
		</section>
	);
};

const MoodCategories = ({
	selectedMood,
	onSelect,
}: {
	selectedMood: number | null;
	onSelect: (id: number | null) => void;
}) => (
	<section id="kuliner" className="py-20 px-6 max-w-7xl mx-auto">
		<div className="text-center mb-12 animate-fade-up">
			<h2 className="text-3xl font-extrabold text-[var(--home-ink)] mb-4">
				Jelajahi Sesuai Mood
			</h2>
			<p className="text-[var(--home-ink)]/70">
				Pilih suasana hati dan temukan destinasi yang pas buat kamu.
			</p>
		</div>

		<div className="flex flex-wrap justify-center gap-4 animate-fade-up delay-200">
			{MOODS.map((mood) => (
				<button
					key={mood.id}
					type="button"
					aria-pressed={selectedMood === mood.id}
					onClick={() => onSelect(selectedMood === mood.id ? null : mood.id)}
					style={{ animationDelay: `${mood.id * 180}ms` }}
					className={`glass-panel mood-float flex items-center gap-3 px-6 py-4 rounded-2xl shadow-sm hover:shadow-md hover:border-[var(--home-accent)] hover:-translate-y-1 transition-all group ${selectedMood === mood.id ? "!bg-[var(--home-accent)]/20 !border-[var(--home-accent)]" : ""}`}>
					<span className="text-2xl group-hover:scale-110 transition-transform">
						{mood.icon}
					</span>
					<span className="font-bold text-[var(--home-ink)]">{mood.name}</span>
				</button>
			))}
		</div>
	</section>
);

const Highlights = ({
	destinations,
	loading,
	error,
	onClearFilters,
	hasActiveFilters,
	incompleteCount,
}: {
	destinations: DestinationCard[];
	loading: boolean;
	error: string;
	onClearFilters: () => void;
	hasActiveFilters: boolean;
	incompleteCount: number;
}) => (
	<section id="destinasi" className="py-20 px-6 max-w-7xl mx-auto">
		<div className="flex justify-between items-end mb-12 animate-fade-up">
			<div>
				<p className="mb-3 text-xs font-black uppercase tracking-[.22em] text-[var(--home-primary)]">Curated for your next story</p>
				<h2 className="text-3xl font-extrabold text-[var(--home-ink)] mb-2">
					Spot pilihan
				</h2>
				<p className="text-[var(--home-ink)]/70">
					Tempat seru di Kabupaten dan Kota Madiun.
				</p>
			</div>
			{destinations.length > 0 && (
				<p className="hidden md:block text-sm text-[var(--home-ink)]/60">
					{destinations.length} destinasi
				</p>
			)}
		</div>

		{loading ? (
			<p className="rounded-2xl bg-[var(--home-glass)] p-8 text-center text-[var(--home-ink)]/70">
				Memuat destinasi wisata…
			</p>
		) : null}
		{error ? (
			<p
				role="alert"
				className="rounded-2xl border border-[var(--home-accent)]/40 bg-[var(--home-accent)]/10 p-6 text-[var(--home-ink)]">
				{error}
			</p>
		) : null}
		{!loading && !error && destinations.length === 0 && hasActiveFilters ? (
			<div className="rounded-2xl bg-[var(--home-glass)] p-8 text-center">
				<p className="font-bold text-[var(--home-ink)]">Belum ada destinasi yang cocok dengan pencarian atau mood ini.</p>
				<button
					type="button"
					onClick={onClearFilters}
					className="mt-3 font-semibold text-[var(--home-ink)] underline decoration-[var(--home-accent)] underline-offset-4">
					Hapus pencarian dan filter
				</button>
			</div>
		) : null}
		{!loading && !error && destinations.length === 0 && !hasActiveFilters ? (
			<div className="rounded-2xl border border-[var(--home-accent)]/35 bg-[var(--home-glass)] p-8 text-center">
				<p className="font-bold text-[var(--home-ink)]">Belum ada destinasi terbit dengan foto dan koordinat lengkap.</p>
				<p className="mx-auto mt-2 max-w-xl text-sm text-[var(--home-ink)]/70">Destinasi tanpa foto atau titik lokasi memang tidak ditampilkan. Petugas bisa melengkapi datanya dari ruang kelola.</p>
				<Link href="/login" className="mt-4 inline-flex rounded-full bg-[var(--home-primary)] px-5 py-3 font-bold text-white">Buka ruang petugas</Link>
			</div>
		) : null}
		{!loading && !error && incompleteCount > 0 ? <p role="status" className="mb-5 rounded-xl border border-amber-400/40 bg-amber-300/15 px-4 py-3 text-sm text-[var(--home-ink)]">{incompleteCount} destinasi disembunyikan karena foto atau koordinat belum lengkap. <Link href="/login" className="font-bold underline underline-offset-2">Petugas, lengkapi di ruang kelola.</Link></p> : null}
		{!loading && !error && destinations.length > 0 ? (
			<div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
				{destinations.map((dest, i) => (
					<Link
						href={`/wisata/${encodeURIComponent(dest.slug)}`}
						key={dest.id}
						style={{ animationDelay: `${Math.min((i + 1) * 100, 500)}ms` }}
						className="glass-panel group rounded-[1.75rem] p-3 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-fade-up">
						<div className="relative w-full h-56 rounded-[1.25rem] overflow-hidden mb-4 bg-gradient-to-br from-[var(--home-soft)] to-[var(--home-accent)]/50">
							{dest.image ? (
								<Image
									src={dest.image}
									alt={dest.title}
									fill
									sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
									className="object-cover transform group-hover:scale-105 transition-transform duration-500"
								/>
							) : (
								<div className="flex h-full items-center justify-center text-[var(--home-ink)]">
									<IconMapPin />
								</div>
							)}
							<div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent pointer-events-none" />
							<span className="absolute bottom-3 left-3 rounded-full border border-white/35 bg-white/85 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-sm backdrop-blur-md">{dest.category}</span>
						</div>
						<div className="px-3 pb-3">
							<h3 className="text-lg font-bold text-[var(--home-ink)] mb-2 line-clamp-1 group-hover:text-[var(--home-primary)] transition-colors">
								{dest.title}
							</h3>
							<p className="min-h-10 text-sm leading-relaxed text-[var(--home-ink)]/70 line-clamp-2">
								{dest.description || "Lihat informasi destinasi wisata ini."}
							</p>
							<div className="mt-4 flex items-center justify-between border-t border-[var(--home-glass-border)] pt-3 text-sm font-bold text-[var(--home-primary)]"><span>Kenali spot ini</span><span className="transition-transform group-hover:translate-x-1"><IconArrowRight /></span></div>
						</div>
					</Link>
				))}
			</div>
		) : null}

		<Link
			href="/scan"
			className="md:hidden w-full mt-8 flex items-center justify-center gap-2 text-[var(--home-ink)] font-bold py-4 rounded-xl border-2 border-[var(--home-ink)]/10 hover:bg-[var(--home-primary)]/5 transition-colors">
			Scan QR Destinasi <IconArrowRight />
		</Link>
	</section>
);

const PromotionalSection = () => (
	<section id="promo" className="py-20 px-6 max-w-6xl mx-auto">
		<div className="bg-[var(--home-primary)] rounded-[3rem] p-8 md:p-16 relative overflow-hidden shadow-2xl animate-fade-up">
			{/* Decorative Graphics */}
			<div className="absolute top-0 right-0 w-64 h-64 bg-[var(--home-accent)] rounded-full blur-[80px] opacity-50 -translate-y-1/2 translate-x-1/4"></div>
			<div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--home-accent)] rounded-full blur-[80px] opacity-40 translate-y-1/4 -translate-x-1/4"></div>

			<div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
				<div className="text-white max-w-lg text-center md:text-left">
					<span className="inline-block bg-[var(--home-glass)]/20 backdrop-blur-sm text-white text-sm font-bold px-4 py-2 rounded-full mb-6">
						PREMIUM ACCESS · MADIUNTRIP
					</span>
					<h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
						Boarding Pass <br />
						Digital-mu.
					</h2>
					<p className="text-white/80 text-lg mb-8">
						Scan QR di lokasi untuk membuka cerita destinasi, memulai sesi pengunjung,
						dan menemukan kejutan visual sepanjang perjalanan.
					</p>
					<Link
						href="/scan"
						className="inline-flex items-center gap-3 bg-[var(--home-glass)] text-[var(--home-ink)] px-8 py-4 rounded-2xl font-bold hover:bg-[var(--home-accent)] transition-all transform hover:scale-105">
						Aktifkan perjalanan <IconArrowRight />
					</Link>
				</div>

				{/* Mockup / Graphic area */}
				<div className="w-full max-w-sm relative group cursor-pointer">
					<div className="absolute inset-0 bg-[var(--home-accent)] rounded-[2rem] rotate-6 group-hover:rotate-12 transition-transform duration-500"></div>
					<div className="absolute -right-4 -top-5 z-20 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--home-glass-border)] bg-[var(--home-glass)] text-[var(--home-accent)] shadow-[0_0_24px_var(--home-bloom)] animate-envelope-float"><IconEnvelope /></div>
					<div className="relative bg-[var(--home-glass)] rounded-[2rem] p-6 shadow-xl border-4 border-[var(--home-glass-border)] transform group-hover:-translate-y-2 group-hover:-rotate-3 transition-transform duration-500">
						<div className="mb-4 flex items-center justify-between border-b border-[var(--home-glass-border)] pb-3 text-[var(--home-ink)]"><span className="font-black tracking-[.18em]">MDN-TRP</span><IconCamera /></div>
						<div className="matrix-qr-stage h-40 bg-[var(--home-soft)] rounded-xl mb-4 overflow-hidden relative flex items-center justify-center">
							<div
								className="grid h-28 w-28 grid-cols-5 gap-1 rounded-xl bg-[var(--home-glass)] p-2"
								aria-hidden="true">
								{Array.from({ length: 25 }, (_, index) => (
									<span
										key={index}
										className={`matrix-cell rounded-sm ${[0, 1, 3, 5, 7, 12, 16, 18, 20, 21, 23, 24].includes(index) ? "is-fixed bg-[var(--home-primary)]" : "bg-[var(--home-accent)]/40"}`}
										style={{ animationDelay: `${(index % 5) * 180}ms` }}
									/>
								))}
							</div>
						</div>
						<div className="flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-[var(--home-ink)]/55">Destinasi</div><div className="font-bold text-[var(--home-ink)] text-lg">Madiun Explorer</div></div><div className="rounded bg-[var(--home-accent)]/15 px-2 py-1 font-mono text-xs font-bold text-[var(--home-ink)]">READY TO SCAN</div></div>
					</div>
				</div>
			</div>
		</div>
	</section>
);

const AssistantTirta = ({
	onSearch,
}: {
	onSearch: (query: string) => void;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");

	function handleSearch(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!query.trim()) return;
		onSearch(query.trim());
		setIsOpen(false);
		requestAnimationFrame(() =>
			document
				.getElementById("destinasi")
				?.scrollIntoView({ behavior: "smooth" }),
		);
	}

	return (
		<div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
			{/* Chat Bubble */}
			{isOpen && (
				<div className="bg-[var(--home-glass)] rounded-3xl rounded-br-none shadow-2xl border border-[var(--home-glass-border)] w-80 mb-4 overflow-hidden animate-fade-up origin-bottom-right transition-all">
					<div className="bg-[var(--home-primary)] p-4 text-white flex justify-between items-center">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 bg-[var(--home-glass)]/20 rounded-full flex items-center justify-center text-xl">
								💧
							</div>
							<div>
								<div className="font-bold">Tirta</div>
								<div className="text-xs text-white/70">Pencarian destinasi</div>
							</div>
						</div>
						<button
							onClick={() => setIsOpen(false)}
							className="hover:bg-[var(--home-glass)]/20 p-2 rounded-full transition-colors">
							<IconX />
						</button>
					</div>
					<div className="p-6 h-64 bg-[var(--home-soft)]/30 flex flex-col justify-end">
						<div className="bg-[var(--home-soft)] text-[var(--home-ink)] p-3 rounded-2xl rounded-tl-none inline-block max-w-[85%] text-sm mb-4 shadow-sm border border-[var(--home-ink)]/5">
							Halo! Aku Tirta. Sebut nama tempat, kuliner, atau suasana yang
							ingin kamu cari.
						</div>
						<form onSubmit={handleSearch} className="flex gap-2">
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Cari destinasi..."
								className="min-w-0 flex-1 bg-[var(--home-glass)] border border-[var(--home-ink)]/20 rounded-full px-4 py-2 text-sm outline-none focus:border-[var(--home-accent)]"
							/>
							<button
								type="submit"
								aria-label="Cari destinasi"
								className="bg-[var(--home-primary)] text-white p-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-[var(--home-accent)] hover:text-[var(--home-ink)] transition-colors">
								<IconArrowRight />
							</button>
						</form>
					</div>
				</div>
			)}

			{/* Floating Action Button */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="w-16 h-16 bg-[var(--home-primary)] text-white rounded-full shadow-[0_10px_25px_-5px_var(--home-bloom)] flex items-center justify-center hover:scale-110 hover:bg-[var(--home-accent)] transition-all duration-300">
				{isOpen ? <IconX /> : <IconMessage />}
			</button>
		</div>
	);
};

const Footer = () => {
	return (
	<footer id="tentang" className="bg-[var(--home-glass)] pt-20 pb-10 px-6 border-t border-[var(--home-glass-border)]">
		<div className="max-w-7xl mx-auto">
			<div className="mb-12 flex flex-col items-start justify-between gap-6 border-b border-[var(--home-glass-border)] pb-10 md:flex-row md:items-center"><div><h3 className="mb-2 text-2xl font-bold text-[var(--home-ink)]">Mau mulai dari mana?</h3><p className="text-[var(--home-ink)]/65">Pilih cara eksplorasi yang paling cocok buat trip-mu.</p></div><div className="flex flex-wrap gap-3"><a href="#peta" className="rounded-full border border-[var(--home-glass-border)] bg-[var(--home-glass)] px-5 py-3 font-bold text-[var(--home-ink)] transition hover:-translate-y-0.5 hover:border-[var(--home-accent)]">Jelajah peta</a><a href="#kuliner" className="rounded-full border border-[var(--home-glass-border)] bg-[var(--home-glass)] px-5 py-3 font-bold text-[var(--home-ink)] transition hover:-translate-y-0.5 hover:border-[var(--home-accent)]">Pilih mood</a><Link href="/scan" className="rounded-full bg-[var(--home-primary)] px-5 py-3 font-bold text-white transition hover:-translate-y-0.5">Scan QR</Link></div></div>
		<div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
			<div className="md:col-span-2">
				<div className="flex items-center gap-2 mb-6">
					<div className="w-10 h-10 rounded-full bg-[var(--home-primary)] flex items-center justify-center text-white font-bold text-xl">
						M
					</div>
					<span className="text-2xl font-extrabold text-[var(--home-ink)] tracking-tight">
						MadiunTrip<span className="text-[var(--home-accent)]">.</span>
					</span>
				</div>
				<p className="text-[var(--home-ink)]/70 max-w-sm mb-6 leading-relaxed">
					Platform penemuan wisata premium untuk mengeksplorasi keindahan alam,
					budaya, dan kuliner Kabupaten Madiun.
				</p>
			</div>
			<div>
				<h4 className="font-bold text-[var(--home-ink)] mb-6 text-lg">Eksplorasi</h4>
				<ul className="space-y-4 text-[var(--home-ink)]/70">
					<li>
						<a
							href="#destinasi"
							className="hover:text-[var(--home-accent)] transition-colors">
							Semua Destinasi
						</a>
					</li>
					<li>
						<a href="#peta" className="hover:text-[var(--home-accent)] transition-colors">
							Peta Wisata
						</a>
					</li>
					<li>
						<Link
							href="/scan"
							className="hover:text-[var(--home-accent)] transition-colors">
							Scan QR Code
						</Link>
					</li>
				</ul>
			</div>
			<div>
				<h4 className="font-bold text-[var(--home-ink)] mb-6 text-lg">Dukungan</h4>
				<ul className="space-y-4 text-[var(--home-ink)]/70">
					<li>
						<Link
							href="/login"
							className="hover:text-[var(--home-accent)] transition-colors">
							Ruang Petugas
						</Link>
					</li>
					<li>
						<Link
							href="/scan"
							className="hover:text-[var(--home-accent)] transition-colors">
							Panduan QR
						</Link>
					</li>
				</ul>
			</div>
		</div>
		<div className="max-w-7xl mx-auto pt-8 border-t border-[var(--home-glass-border)] text-center md:text-left text-[var(--home-ink)]/50 text-sm flex flex-col md:flex-row justify-between items-center gap-4">
			<p>&copy; MadiunTrip. Hak Cipta Dilindungi.</p>
			<Link
				href="/scan"
				className="font-semibold text-[var(--home-ink)] hover:text-[var(--home-accent)]">
				Jelajahi dengan QR <IconArrowRight />
			</Link>
		</div>
		</div>
	</footer>
	);
};

export default function MadiunTripApp() {
	const { isDark, toggleTheme } = useTheme();
	const [destinations, setDestinations] = useState<DestinationCard[]>([]);
	const [loadingDestinations, setLoadingDestinations] = useState(true);
	const [destinationError, setDestinationError] = useState("");
	const [incompleteDestinationCount, setIncompleteDestinationCount] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedMood, setSelectedMood] = useState<number | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function loadDestinations() {
			try {
				const response = await fetch("/api/public-destinations");

				if (cancelled) return;
				if (!response.ok) {
					setDestinationError(
						"Destinasi belum dapat dimuat. Periksa koneksi lalu coba lagi.",
					);
					return;
				}

				const payload = (await response.json()) as { data?: DestinationRow[] };
				const rows = Array.isArray(payload.data) ? payload.data : [];
				const identifiedRows = rows.filter((row) => typeof row.id === "string" && typeof row.slug === "string" && typeof row.name === "string");
				const readyRows = identifiedRows.filter(destinationHasRequiredMediaAndLocation);
				setIncompleteDestinationCount(identifiedRows.length - readyRows.length);
				const cards = readyRows
					.map(toDestinationCard)
					.sort((a, b) => Number(b.featured) - Number(a.featured));
				setDestinations(cards);
			} catch {
				if (!cancelled)
					setDestinationError(
						"Koneksi ke data destinasi gagal. Coba muat ulang halaman.",
					);
			} finally {
				if (!cancelled) setLoadingDestinations(false);
			}
		}

		void loadDestinations();
		return () => {
			cancelled = true;
		};
	}, []);

	const visibleDestinations = destinations.filter((destination) => {
		const searchable =
			`${destination.title} ${destination.description} ${destination.category} ${destination.tags.join(" ")}`.toLocaleLowerCase(
				"id",
			);
		const matchesSearch = searchable.includes(
			searchQuery.trim().toLocaleLowerCase("id"),
		);
		const terms = selectedMood ? MOOD_TERMS[selectedMood] : undefined;
		const matchesMood =
			!terms || terms.some((term) => searchable.includes(term));
		return matchesSearch && matchesMood;
	});
	const hasActiveFilters = Boolean(searchQuery.trim()) || selectedMood !== null;

	return (
		<>
			<GlobalStyles />
			<div className={`home-page min-h-screen relative selection:bg-[var(--home-accent)] selection:text-white${isDark ? " dark" : ""}`}>
				<StarParticles isDark={isDark} />
				<Navbar isDark={isDark} onToggleTheme={toggleTheme} />

				<main className="relative z-10">
					<HeroSection />
					<DiscoveryMap
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
					/>
					<MoodCategories
						selectedMood={selectedMood}
						onSelect={setSelectedMood}
					/>
					<Highlights
						destinations={visibleDestinations}
						loading={loadingDestinations}
						error={destinationError}
						hasActiveFilters={hasActiveFilters}
						incompleteCount={incompleteDestinationCount}
						onClearFilters={() => {
							setSearchQuery("");
							setSelectedMood(null);
						}}
					/>
					<PromotionalSection />
				</main>

				<AssistantTirta
					onSearch={(query) => {
						setSearchQuery(query);
						setSelectedMood(null);
					}}
				/>
				<Footer />
			</div>
		</>
	);
}
