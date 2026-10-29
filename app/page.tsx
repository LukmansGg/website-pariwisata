"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "@/src/components/theme-provider";
import { SystemCampaignPrompt } from "@/src/components/system-campaign-prompt";
import { trackVisitorEvent } from "@/src/features/visitor-insights/events";
import { TiLocBrand, TiLocMark } from "@/src/components/tiloc-brand";

const MOODS = [
	{ name: "Alam", icon: "🍃" },
	{ name: "Kuliner", icon: "🍜" },
	{ name: "Spot Foto", icon: "📸" },
	{ name: "Sejarah & Budaya", icon: "🏛️" },
	{ name: "Petualangan & Aktivitas", icon: "🚴" },
	{ name: "Rekreasi", icon: "🎡" },
	{ name: "Religi", icon: "🕌" },
	{ name: "Lainnya", icon: "✨" },
];

type DestinationRow = {
	id: string;
	slug: string;
	name: string;
	description?: string | null;
	category?: string | null;
	categories?: string[] | null;
	short_description?: string | null;
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
	categories: string[];
	shortDescription: string;
	image?: string;
	rating?: number;
	reviews?: number;
	tags: string[];
	featured: boolean;
	latitude: number;
	longitude: number;
};

type MapArea = { id: "county" | "city"; name: string; latitude: number; longitude: number };
type MapBoundaries = { countyPath: string; cityPath: string; areas: MapArea[] };
const MADIUN_MAP_BOUNDS = { minX: 111.18, maxX: 111.88, minY: -7.91, maxY: -7.32 };
function projectMapPoint(longitude: number, latitude: number) {
	return {
		x: ((longitude - MADIUN_MAP_BOUNDS.minX) / (MADIUN_MAP_BOUNDS.maxX - MADIUN_MAP_BOUNDS.minX)) * 1000,
		y: (1 - (latitude - MADIUN_MAP_BOUNDS.minY) / (MADIUN_MAP_BOUNDS.maxY - MADIUN_MAP_BOUNDS.minY)) * 560,
	};
}
function tourismMarkerStyle(destination: DestinationCard) {
	const category = destination.categories.join(" ").toLocaleLowerCase("id") || destination.category.toLocaleLowerCase("id");
	if (category.includes("alam") || category.includes("air")) return { shape: "leaf", color: "#059669" } as const;
	if (category.includes("budaya") || category.includes("sejarah")) return { shape: "star", color: "#7c3aed" } as const;
	if (category.includes("kuliner") || category.includes("makan")) return { shape: "diamond", color: "#ea580c" } as const;
	if (category.includes("spot") || category.includes("lokasi")) return { shape: "pin", color: "#0284c7" } as const;
	return { shape: "circle", color: "#0284c7" } as const;
}

function toDestinationCard(row: DestinationRow): DestinationCard {
	const imageValue = row.image_url ?? row.cover_image ?? row.image;
	const image = typeof imageValue === "string" ? imageValue : undefined;
	return {
		id: row.id,
		slug: row.slug,
		title: row.name,
		description: row.description ?? "",
		category: (Array.isArray(row.categories) && row.categories.length ? row.categories.join(" · ") : row.category) ?? "Wisata Madiun",
		categories: Array.isArray(row.categories) && row.categories.length ? row.categories : (row.category ? row.category.split(", ") : []),
		shortDescription: row.short_description ?? "",
		...(image ? { image } : {}),
		...(typeof row.rating === "number" ? { rating: row.rating } : {}),
		...(typeof row.reviews === "number" ? { reviews: row.reviews } : {}),
		tags: Array.isArray(row.tags) ? row.tags : [],
		featured: row.is_featured === true,
		latitude: Number(row.latitude),
		longitude: Number(row.longitude),
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
	<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" />
		<path d="m19 14 1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14Z" />
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

const STAR_TONES = ["#f5fcff", "#c9edff", "#a9dcff", "#d7e2ff"] as const;
const STAR_POSITIONS = Array.from({ length: 30 }, (_, index) => {
	const jitter = (seed: number) => {
		const value = Math.sin((index + seed) * 127.1) * 43758.5453;
		return value - Math.floor(value);
	};
	const flare = index === 4 || index === 17 || index === 27;
	return {
		left: 3 + jitter(4) * 94,
		top: 4 + jitter(19) * 91,
		size: flare ? 3.1 + jitter(38) * .8 : 1.3 + jitter(37) * 1.9,
		delay: Math.round(jitter(51) * 4800),
		duration: 4.2 + jitter(69) * 4.2,
		tone: STAR_TONES[Math.floor(jitter(77) * STAR_TONES.length)],
		flare,
	};
});

const LIGHT_SPARKLES = [[9, 20], [27, 46], [84, 18], [72, 68], [15, 84], [93, 76], [48, 12], [55, 91]] as const;

function StarParticles({ isDark }: { isDark: boolean }) {
	return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
		{(isDark ? STAR_POSITIONS : []).map((star, index) => <span key={`star-${index}`} className={`home-star${star.flare ? " is-flare" : ""}`} style={{ left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size, animationDelay: `${star.delay}ms`, animationDuration: `${star.duration}s`, "--star-size": `${star.size}px`, "--star-tone": star.tone } as React.CSSProperties} />)}
		{(isDark ? [[71, 18], [94, 39]] as const : LIGHT_SPARKLES).map(([left, top], index) => isDark
			? <span key={`shooting-${index}`} className="shooting-star" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${index * 3.8}s` }} />
			: <span key={`sparkle-${index}`} className="ambient-sparkle" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${index * 430}ms` }}><IconSparkle /></span>)}
		<span className="home-ambient-glow absolute -left-28 top-[18%] h-72 w-72 rounded-full bg-[var(--home-accent)]/10 blur-3xl" />
		<span className="home-ambient-glow absolute -right-32 top-[62%] h-80 w-80 rounded-full bg-[var(--home-primary)]/10 blur-3xl" />
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
      --home-canvas: #07182b;
      --home-ink: #eaf2ff;
      --home-primary: #236c9b;
      --home-accent: #8bd9ff;
      --home-soft: #102b45;
      --home-glass: rgba(7, 24, 43, 0.97);
      --home-glass-border: rgba(139, 217, 255, 0.28);
      --home-on-primary: #ffffff;
      --home-on-accent: #08243a;
      --home-bloom: rgba(77, 180, 231, 0.4);
      color-scheme: dark;
      color: var(--home-ink);
      background: linear-gradient(135deg, #061426 0%, #09213a 55%, #0c3150 100%) !important;
      background-color: #07182b !important;
    }
    .home-page:not(.dark) { background-image: linear-gradient(135deg, #e0f2fe 0%, #f5fbff 50%, #c9edff 100%); }
    .home-page .glass-panel {
      background: var(--home-glass);
      border: 1px solid var(--home-glass-border);
      box-shadow: 0 12px 34px -24px var(--home-bloom);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 260ms ease, border-color 260ms ease;
    }
    .home-page .glass-panel:hover {
      box-shadow: 0 18px 42px -24px var(--home-bloom);
      border-color: color-mix(in srgb, var(--home-accent) 48%, transparent);
    }
    .home-page .home-star {
      position: absolute;
      display: block;
      border-radius: 999px;
      background: radial-gradient(circle, #fff 0%, var(--star-tone) 38%, #8bd9ff 72%, rgba(76,184,237,.12) 100%);
      box-shadow: 0 0 3px 1px rgba(224,248,255,.48), 0 0 9px 2px var(--home-bloom);
      animation: homeTwinkle 5.6s cubic-bezier(.4,0,.2,1) infinite;
      transform-origin: center;
      will-change: transform, opacity;
    }
    .home-page .home-star::before {
      content: "";
      position: absolute;
      left: 50%; top: 50%;
      width: calc(var(--star-size) * 2.2);
      height: calc(var(--star-size) * 2.2);
      transform: translate(-50%, -50%);
      background: linear-gradient(90deg, transparent 43%, rgba(239,251,255,.55) 50%, transparent 57%), linear-gradient(0deg, transparent 43%, rgba(239,251,255,.55) 50%, transparent 57%);
      filter: blur(.15px);
      opacity: .42;
      pointer-events: none;
    }
    .home-page .home-star.is-flare { z-index: 0; box-shadow: 0 0 4px 1px rgba(238,250,255,.66), 0 0 14px 3px var(--home-bloom); }
    .home-page .home-star.is-flare::before { width: calc(var(--star-size) * 3.1); height: calc(var(--star-size) * 3.1); opacity: .54; }
    .home-page.dark .home-ambient-glow { opacity: .38; }
    .home-page .matrix-cell { animation: matrixPulse 1.8s ease-in-out infinite; }
    .home-page .matrix-cell.is-fixed { animation: none; opacity: 1; }
    .home-page .matrix-qr-stage::after { content: ""; position: absolute; left: 8%; right: 8%; top: 10%; height: 2px; background: var(--home-accent); box-shadow: 0 0 14px var(--home-accent); opacity: .8; animation: qrScan 3.4s ease-in-out infinite; pointer-events: none; }
    .home-page .mood-float { animation: moodFloat 4.6s ease-in-out infinite; }
    .home-page .madiun-marker { transform-box: fill-box; transform-origin: center; animation: markerIdle 2.8s ease-in-out infinite; }
    .home-page .madiun-marker:hover { animation: markerBoing 520ms cubic-bezier(.2,.9,.25,1.25) both; }
    .home-page .marker-visibility { opacity: 1; visibility: visible; transition: opacity 180ms ease, visibility 180ms; }
    .home-page .markers-hidden { opacity: 0; visibility: hidden; }
    .home-page .map-explore-button { box-shadow: 0 8px 24px rgba(47, 116, 159, .13), inset 0 1px 0 rgba(255,255,255,.95); transition: transform 220ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease, background-color 220ms ease; }
    .home-page .map-explore-button:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(47, 116, 159, .2), inset 0 1px 0 rgba(255,255,255,.98); }
    .home-page .map-hand-icon { transform-origin: 55% 78%; animation: mapHandNudge 2.2s ease-in-out infinite; }
    .home-page .map-hand-halo { animation: mapHandHalo 2.8s ease-out infinite; }
    .home-page .map-control-bar { box-shadow: 0 8px 24px rgba(31, 71, 99, .12), inset 0 1px 0 rgba(255,255,255,.9); }
    .home-page .map-surface { box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 8px 28px rgba(50, 112, 145, .08); }
    .home-page .map-marker-halo { transform-box: fill-box; transform-origin: center; animation: selectedMarkerAura 2.1s ease-out infinite; }
    @keyframes markerIdle { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    @keyframes markerBoing { 0% { transform: translateY(0) scale(1); } 45% { transform: translateY(-9px) scale(1.08); } 75% { transform: translateY(2px) scale(.96); } 100% { transform: translateY(0) scale(1); } }
    @keyframes mapHandNudge { 0%,100% { transform: rotate(0) translateY(0); } 38% { transform: rotate(-9deg) translateY(-2px); } 70% { transform: rotate(2deg) translateY(0); } }
    @keyframes mapHandHalo { 0% { opacity: .5; transform: scale(.88); } 75%,100% { opacity: 0; transform: scale(1.2); } }
    @media (prefers-reduced-motion: reduce) { .home-page .map-hand-icon, .home-page .map-hand-halo { animation: none; } }
    @keyframes selectedMarkerAura { 0% { opacity: .95; transform: scale(.78); } 75%,100% { opacity: 0; transform: scale(1.65); } }
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
    @keyframes homeTwinkle { 0%, 100% { opacity: .34; transform: scale(.86) rotate(0); filter:brightness(.94); } 50% { opacity: .82; transform: scale(1.1) rotate(28deg); filter:brightness(1.12); } }
    @keyframes matrixPulse { 0%, 100% { opacity: 0.18; } 50% { opacity: 0.9; filter: drop-shadow(0 0 5px var(--home-accent)); } }
    @keyframes qrScan { 0%,100% { top: 12%; opacity: .35; } 50% { top: 88%; opacity: .9; } }
    @keyframes envelopeFloat { 0%, 100% { transform: translateY(0) rotate(-5deg); } 50% { transform: translateY(-7px) rotate(4deg); } }
    @keyframes moodFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
    @keyframes shootingStar { 0% { transform: translate(0,0) rotate(315deg) scaleX(0); opacity: 0; } 10% { opacity: 1; scale: 1; } 100% { transform: translate(-55vw,55vh) rotate(315deg) scaleX(1); opacity: 0; } }
    @keyframes sparkleFloat { 0%,100% { transform: translateY(0) scale(.72) rotate(0); opacity: .32; } 50% { transform: translateY(-12px) scale(1) rotate(28deg); opacity: .74; } }
    .home-page .shooting-star { position:absolute; width:108px; height:1px; border-radius:99px; background:linear-gradient(90deg,transparent,rgba(139,217,255,.8)); box-shadow:0 0 7px rgba(77,180,231,.28); opacity:.72; animation:shootingStar 9.5s linear infinite; }
    .home-page .ambient-sparkle { position:absolute; color:var(--home-accent); opacity:.66; filter:drop-shadow(0 0 5px color-mix(in srgb,var(--home-bloom) 72%,transparent)); animation:sparkleFloat 5.6s ease-in-out infinite; }
    .home-page .discovery-nav { animation: discoveryNavEnter 480ms cubic-bezier(.2,.8,.2,1) both; }
    .home-page .discovery-label-enter { animation: discoveryLabelEnter 360ms cubic-bezier(.2,.8,.2,1) both; }
    .home-page .discovery-chips { scrollbar-width: none; }
    .home-page .discovery-chips::-webkit-scrollbar { display: none; }
    .home-page .mood-chip { animation: moodChipEnter 440ms cubic-bezier(.2,.8,.2,1) both; }
    .home-page .mood-chip:nth-child(2) { animation-delay: 35ms; }
    .home-page .mood-chip:nth-child(3) { animation-delay: 70ms; }
    .home-page .mood-chip:nth-child(4) { animation-delay: 105ms; }
    .home-page .mood-chip:nth-child(5) { animation-delay: 140ms; }
    .home-page .mood-chip:nth-child(6) { animation-delay: 175ms; }
    .home-page .mood-chip:nth-child(7) { animation-delay: 210ms; }
    .home-page .mood-chip:nth-child(8) { animation-delay: 245ms; }
    @keyframes discoveryNavEnter { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes discoveryLabelEnter { from { opacity: 0; transform: translateY(5px); filter: blur(3px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
    @keyframes moodChipEnter { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

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
	{ id: "kuliner", label: "Kategori" },
	{ id: "destinasi", label: "Destinasi" },
	{ id: "promo", label: "Promo" },
	{ id: "tentang", label: "Tentang" },
] as const;

function Navbar({ isDark, onToggleTheme, discoveryMode = false, discoveryLabel = "", resultCount = 0, onExitDiscovery }: { isDark: boolean; onToggleTheme: () => void; discoveryMode?: boolean; discoveryLabel?: string; resultCount?: number; onExitDiscovery?: () => void }) {
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

	if (discoveryMode) return <nav aria-label="Mode jelajah" className="discovery-nav fixed inset-x-0 top-0 z-50 border-b border-[var(--home-glass-border)] bg-[var(--home-glass)]/95 shadow-[0_16px_45px_-34px_rgba(3,80,130,.75)] backdrop-blur-2xl">
		<div className="mx-auto flex min-h-[76px] max-w-7xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
			<a href="#kuliner" aria-label="Mode jelajah TiLoc!" className="transition hover:-rotate-6 hover:scale-105"><TiLocMark className="h-11 w-11 drop-shadow-[0_8px_22px_rgba(14,116,190,.3)]"/></a>
			<div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.19em] text-[var(--home-primary)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400"/>Mode jelajah<span className="hidden text-[var(--home-ink)]/35 sm:inline">· {resultCount} spot</span></div><p key={discoveryLabel || "all"} className="discovery-label-enter mt-0.5 truncate text-sm font-black text-[var(--home-ink)] sm:text-base">{discoveryLabel || "Pilih suasana perjalananmu"}</p></div>
			<span className="hidden rounded-full border border-[var(--home-glass-border)] bg-white/45 px-3 py-2 text-[10px] font-bold text-[var(--home-ink)]/65 md:inline-flex">{resultCount} {resultCount === 1 ? "spot cocok" : "spot cocok"}</span>
			<button type="button" onClick={onExitDiscovery} className="discovery-exit group inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl border border-sky-300/60 bg-gradient-to-br from-white/95 to-sky-100 px-4 text-xs font-black text-sky-950 shadow-[0_8px_22px_rgba(14,116,190,.14)] transition duration-300 hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-[0_12px_30px_rgba(14,116,190,.25)] active:scale-95 dark:border-sky-200/15 dark:from-slate-800 dark:to-blue-950 dark:text-sky-50 sm:px-5"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-sky-500/10 text-base transition duration-300 group-hover:rotate-90">×</span><span className="hidden sm:inline">Keluar dari mode</span></button>
			<button type="button" onClick={onToggleTheme} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--home-glass-border)] bg-[var(--home-glass)] text-[var(--home-ink)] transition hover:-translate-y-0.5" aria-label={isDark ? "Aktifkan tema terang" : "Aktifkan tema gelap"} title={isDark ? "Tema terang" : "Tema gelap"}>{isDark ? <IconSun /> : <IconMoon />}</button>
		</div>
	</nav>;

	return (
		<nav className="glass-panel fixed top-0 z-50 w-full !border-x-0 !border-t-0 !rounded-none bg-[var(--home-glass)]/90 transition-all duration-300">
			<div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
				<a href="#beranda" aria-label="TiLoc! · Titik Lokasi" className="group">
					<TiLocBrand markClassName="h-10 w-10 transition-transform group-hover:scale-105" wordmarkClassName="text-xl font-extrabold tracking-tight text-[var(--home-ink)]" accentClassName="text-[var(--home-accent)]"/>
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
					Madiun.
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
	destinations,
	selectedDestinationId,
	selectedSpot,
	onSpotSelected,
	onClearSelectedSpot,
	compact = false,
}: {
	searchQuery: string;
	onSearchChange: (value: string) => void;
	destinations: DestinationCard[];
	selectedDestinationId: string | null;
	selectedSpot: DestinationCard | null;
	onSpotSelected: (destination: DestinationCard | null) => void;
	onClearSelectedSpot: () => void;
	compact?: boolean;
}) => {
	const [boundaryPaths, setBoundaryPaths] = useState<MapBoundaries | null>(null);
	const [mapAreas, setMapAreas] = useState<MapArea[]>([]);
	const [boundaryFailed, setBoundaryFailed] = useState(false);
	const [selectedArea, setSelectedArea] = useState<MapArea | null>(null);
	const [mapActive, setMapActive] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [mapScale, setMapScale] = useState(1);
	const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
	const mapOffsetRef = useRef(mapOffset);
	const mapLayerRef = useRef<HTMLDivElement | null>(null);
	const [isMapDragging, setIsMapDragging] = useState(false);
	const [showMarkers, setShowMarkers] = useState(true);
	const mapViewportRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
	const suppressMapClickRef = useRef(false);

	useEffect(() => {
		let active = true;
		fetch("/api/map-boundaries", { cache: "no-store" }).then(async (response) => {
			if (!response.ok) throw new Error("Batas wilayah tidak tersedia");
			return response.json() as Promise<MapBoundaries>;
		}).then((data) => {
			if (!data.countyPath || !data.cityPath || !Array.isArray(data.areas)) throw new Error("Geometri batas kosong");
			if (active) {
				setBoundaryPaths(data);
				setMapAreas(data.areas);
			}
		}).catch(() => { if (active) setBoundaryFailed(true); });
		return () => { active = false; };
	}, []);

	useEffect(() => {
		if (!mapActive) return;
		const handleOutsidePress = (event: PointerEvent) => {
			if (event.target instanceof Element && event.target.closest("[data-map-explore]")) return;
			if (event.target instanceof Node && !mapViewportRef.current?.contains(event.target)) setMapActive(false);
		};
		const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMapActive(false); };
		document.addEventListener("pointerdown", handleOutsidePress);
		window.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("pointerdown", handleOutsidePress);
			window.removeEventListener("keydown", handleEscape);
		};
	}, [mapActive]);

	const setZoomAround = useCallback((nextScale: number, anchorX?: number, anchorY?: number) => {
		const viewport = mapViewportRef.current;
		const scale = Math.max(1, Math.min(2, nextScale));
		if (!viewport || scale === mapScale) return;
		const bounds = viewport.getBoundingClientRect();
		const focalX = anchorX === undefined ? 0 : anchorX - bounds.left - bounds.width / 2;
		const focalY = anchorY === undefined ? 0 : anchorY - bounds.top - bounds.height / 2;
		const ratio = scale / mapScale;
		const maxX = Math.max(0, (bounds.width * (1.2 * scale - 1)) / 2);
		const maxY = Math.max(0, (bounds.height * (1.2 * scale - 1)) / 2);
		const offset = {
			x: Math.max(-maxX, Math.min(maxX, focalX - (focalX - mapOffsetRef.current.x) * ratio)),
			y: Math.max(-maxY, Math.min(maxY, focalY - (focalY - mapOffsetRef.current.y) * ratio)),
		};
		mapOffsetRef.current = offset;
		setMapOffset(offset);
		setMapScale(scale);
	}, [mapScale]);

	useEffect(() => {
		const viewport = mapViewportRef.current;
		if (!mapActive || !viewport) return;
		const handleWheel = (event: WheelEvent) => {
			event.preventDefault();
			const nextScale = mapScale * Math.exp(-event.deltaY * 0.001);
			setZoomAround(nextScale, event.clientX, event.clientY);
		};
		viewport.addEventListener("wheel", handleWheel, { passive: false });
		return () => viewport.removeEventListener("wheel", handleWheel);
	}, [mapActive, mapScale, setZoomAround]);

	const markers = useMemo(() => destinations.filter((destination) => destination.longitude >= MADIUN_MAP_BOUNDS.minX && destination.longitude <= MADIUN_MAP_BOUNDS.maxX && destination.latitude >= MADIUN_MAP_BOUNDS.minY && destination.latitude <= MADIUN_MAP_BOUNDS.maxY).map((destination) => ({ destination, point: projectMapPoint(destination.longitude, destination.latitude) })), [destinations]);
	const googleMapsUrl = "https://www.google.com/maps/search/?api=1&query=Madiun";
	const zoom = (delta: number) => setZoomAround(mapScale + delta);
	const areaSuggestions = mapAreas.filter((area) => !searchQuery.trim() || area.name.toLocaleLowerCase("id").includes(searchQuery.trim().toLocaleLowerCase("id")) || searchQuery.trim().toLocaleLowerCase("id").split(/\s+/).every((term) => area.name.toLocaleLowerCase("id").includes(term)));
	const moveToArea = (area: MapArea) => {
		const point = projectMapPoint(area.longitude, area.latitude);
		const viewport = mapViewportRef.current;
		const scale = area.id === "city" ? 1.32 : 1.12;
		setSelectedArea(area);
		onSpotSelected(null);
		setMapActive(false);
		setMapScale(scale);
		if (viewport) {
			const width = viewport.clientWidth;
			const height = viewport.clientHeight;
			const maxX = width * (1.2 * scale - 1) / 2;
			const maxY = height * (1.2 * scale - 1) / 2;
			const desiredX = -((point.x / 1000 - .5) * width * 1.2 * scale);
			const desiredY = -((point.y / 560 - .5) * height * 1.2 * scale);
			const offset = { x: Math.max(-maxX, Math.min(maxX, desiredX)), y: Math.max(-maxY, Math.min(maxY, desiredY)) };
			mapOffsetRef.current = offset;
			setMapOffset(offset);
		}
		setSearchOpen(false);
		onSearchChange("");
		window.requestAnimationFrame(() => document.getElementById("peta")?.scrollIntoView({ behavior: "smooth", block: "start" }));
	};
	const destinationSuggestions = searchQuery.trim()
		? destinations.filter((destination) => {
			const inBounds = destination.longitude >= MADIUN_MAP_BOUNDS.minX && destination.longitude <= MADIUN_MAP_BOUNDS.maxX && destination.latitude >= MADIUN_MAP_BOUNDS.minY && destination.latitude <= MADIUN_MAP_BOUNDS.maxY;
			return inBounds && `${destination.title} ${destination.category}`.toLocaleLowerCase("id").includes(searchQuery.trim().toLocaleLowerCase("id"));
		}).slice(0, 5)
		: [];
	const focusDestination = (destination: DestinationCard) => {
		const point = projectMapPoint(destination.longitude, destination.latitude);
		const viewport = mapViewportRef.current;
		const scale = 1.35;
		setSelectedArea(null);
		onSearchChange(destination.title);
		onSpotSelected(destination);
		setMapScale(scale);
		if (viewport) {
			const width = viewport.clientWidth;
			const height = viewport.clientHeight;
			const maxX = width * (1.2 * scale - 1) / 2;
			const maxY = height * (1.2 * scale - 1) / 2;
			const desiredX = -((point.x / 1000 - .5) * width * 1.2 * scale);
			const desiredY = -((point.y / 560 - .5) * height * 1.2 * scale);
			const offset = { x: Math.max(-maxX, Math.min(maxX, desiredX)), y: Math.max(-maxY, Math.min(maxY, desiredY)) };
			mapOffsetRef.current = offset;
			setMapOffset(offset);
		}
		setSearchOpen(false);
		setMapActive(false);
	};
	const handleMapPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!mapActive || (event.target as HTMLElement).closest("[data-map-control], [data-marker]")) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: mapOffsetRef.current.x, originY: mapOffsetRef.current.y, moved: false };
		setIsMapDragging(true);
	};
	const handleMapPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!mapActive || !drag || drag.pointerId !== event.pointerId) return;
		const deltaX = event.clientX - drag.x;
		const deltaY = event.clientY - drag.y;
		if (Math.abs(deltaX) + Math.abs(deltaY) > 5) drag.moved = true;
		const maxX = event.currentTarget.clientWidth * (1.2 * mapScale - 1) / 2;
		const maxY = event.currentTarget.clientHeight * (1.2 * mapScale - 1) / 2;
		const offset = { x: Math.max(-maxX, Math.min(maxX, drag.originX + deltaX)), y: Math.max(-maxY, Math.min(maxY, drag.originY + deltaY)) };
		mapOffsetRef.current = offset;
		mapLayerRef.current?.style.setProperty("transform", `translate(${offset.x}px, ${offset.y}px) scale(${mapScale})`);
	};
	const handleMapPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		if (dragRef.current.moved) suppressMapClickRef.current = true;
		dragRef.current = null;
		setMapOffset(mapOffsetRef.current);
		setIsMapDragging(false);
	};
	const handleMapPointerCancel = () => {
		dragRef.current = null;
		suppressMapClickRef.current = false;
		setMapOffset(mapOffsetRef.current);
		setIsMapDragging(false);
	};
	const clearMapSelection = () => {
		setSelectedArea(null);
		setMapActive(false);
		setMapScale(1);
		mapOffsetRef.current = { x: 0, y: 0 };
		setMapOffset({ x: 0, y: 0 });
		onClearSelectedSpot();
	};

	return (
		<section id="peta" className={`relative z-20 mx-auto w-full max-w-[1760px] px-4 pb-16 sm:px-6 xl:px-8 ${compact ? "mt-0" : "-mt-8"} ${compact && selectedDestinationId ? "order-[20]" : compact ? "order-[30]" : "order-[20]"}`}>
			<div className="animate-fade-up delay-400">
				<div className="mb-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
					<div className="min-w-0">
						<p className="mb-2 text-[10px] font-black uppercase tracking-[.2em] text-[var(--home-primary)]">PETA INTERAKTIF · MADIUN</p>
						<h2 className="text-2xl font-black tracking-tight text-[var(--home-ink)] sm:text-3xl">Jelajahi sekitar</h2>
						<p className="mt-1 max-w-xl text-sm leading-6 text-[var(--home-ink)]/65">Cari destinasi, lihat posisinya, lalu buka profil tempat yang ingin kamu kunjungi.</p>
					</div>
					<div className="relative z-30 w-full lg:max-w-[min(48vw,620px)]">
						<div className="glass-panel flex items-center rounded-2xl border border-[var(--home-glass-border)] p-1.5 shadow-[0_10px_40px_-10px_var(--home-bloom)] sm:rounded-full">
							<div className="pl-3 text-[var(--home-accent)] sm:pl-4"><IconSearch /></div>
							<input type="text" aria-label="Cari wisata atau area Madiun" placeholder="Cari wisata atau area Madiun..." className="w-full min-w-0 border-none bg-transparent px-3 py-3 font-medium text-[var(--home-ink)] outline-none placeholder:text-[var(--home-ink)]/40 sm:px-4" value={selectedArea ? selectedArea.name : searchQuery} onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 140)} onChange={(event) => { setSelectedArea(null); onSearchChange(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Enter" && areaSuggestions.length + destinationSuggestions.length === 1) { event.preventDefault(); if (destinationSuggestions.length === 1) focusDestination(destinationSuggestions[0]); else moveToArea(areaSuggestions[0]); } }} />
							{(searchQuery || selectedArea || selectedSpot) && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={clearMapSelection} aria-label="Tutup pencarian dan tampilkan semua destinasi" title="Tutup pencarian" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--home-ink)]/55 transition hover:bg-[var(--home-soft)] hover:text-[var(--home-ink)]"><IconX /></button>}
							<button type="button" onClick={() => { if (areaSuggestions.length + destinationSuggestions.length === 1) { if (destinationSuggestions.length === 1) focusDestination(destinationSuggestions[0]); else moveToArea(areaSuggestions[0]); } else setSearchOpen(true); }} className="shrink-0 rounded-xl bg-[var(--home-accent)] px-4 py-3 font-bold text-[var(--home-on-accent)] shadow-sm transition-colors hover:bg-[var(--home-primary)] hover:text-white sm:rounded-full sm:px-6">Cari</button>
						</div>
						{searchOpen && (areaSuggestions.length > 0 || destinationSuggestions.length > 0) && <div className="absolute left-0 right-0 top-full mt-2 max-h-[min(55vh,360px)] overflow-y-auto rounded-2xl border border-sky-100 bg-white/95 p-2 shadow-xl backdrop-blur-xl">
							{areaSuggestions.length > 0 && <><p className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-sky-700">Wilayah</p>{areaSuggestions.map((area) => <button key={area.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => moveToArea(area)} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-800 transition hover:bg-sky-50"><span>{area.name}</span><span className="text-xs font-semibold text-sky-700">Tampilkan →</span></button>)}</>}
							{destinationSuggestions.length > 0 && <><p className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-sky-700">Destinasi terdaftar</p>{destinationSuggestions.map((destination) => <button key={destination.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => focusDestination(destination)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-sky-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{destination.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{destination.category}</span></span><span className="shrink-0 text-xs font-semibold text-sky-700">Lihat peta →</span></button>)}</>}
							<button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchOpen(false)} className="mt-1 min-h-10 w-full rounded-xl border-t border-sky-100 px-3 text-left text-xs font-bold text-sky-800 transition hover:bg-sky-50">Tutup hasil pencarian</button>
						</div>}
					</div>
				</div>

				<div className="rounded-[1.75rem] border border-[var(--home-glass-border)] bg-[var(--home-glass)] p-3 shadow-[0_18px_55px_-36px_var(--home-bloom)] backdrop-blur-xl sm:rounded-[2rem] sm:p-5">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
						<div><p className="text-sm font-extrabold text-[var(--home-ink)]">Wilayah Madiun</p><p className="mt-0.5 text-xs text-[var(--home-ink)]/55">{markers.length} destinasi dengan titik lokasi</p></div>
					</div>
					<div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
						<div className={`min-w-0 ${selectedSpot ? "order-2 lg:order-1" : "order-1"}`}>
							<div ref={mapViewportRef} className={`map-surface relative h-[min(64vh,620px)] min-h-[420px] w-full overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-[#f5f9fc] shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_8px_28px_rgba(50,112,145,.08)] sm:h-[clamp(560px,68vh,760px)] sm:min-h-0 lg:h-[clamp(620px,72vh,840px)] ${mapActive ? "touch-none cursor-grab active:cursor-grabbing" : "touch-pan-y cursor-default"}`} aria-label={mapActive ? "Peta interaktif. Geser atau scroll untuk navigasi." : "Peta pratinjau. Aktifkan jelajah untuk menggeser atau zoom."} onClick={() => { if (suppressMapClickRef.current) { suppressMapClickRef.current = false; return; } if (!mapActive) setMapActive(true); }} onPointerDown={handleMapPointerDown} onPointerMove={handleMapPointerMove} onPointerUp={handleMapPointerUp} onPointerCancel={handleMapPointerCancel}>
								<div ref={mapLayerRef} className="absolute -inset-[10%] origin-center will-change-transform" style={{ transform: `translate3d(${mapOffset.x}px, ${mapOffset.y}px, 0) scale(${mapScale})`, transition: isMapDragging ? "none" : "transform 480ms cubic-bezier(.22,.8,.22,1)" }}>
									<iframe className="pointer-events-none absolute inset-0 h-full w-full border-0" loading="lazy" scrolling="no" title="Peta OpenStreetMap Madiun" src="https://www.openstreetmap.org/export/embed.html?bbox=111.18%2C-7.91%2C111.88%2C-7.32&amp;layer=mapnik" />
									<div className="pointer-events-none absolute inset-0 bg-sky-50/20" />
									<svg viewBox="0 0 1000 560" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label="Batas wilayah Madiun">
										{boundaryPaths?.countyPath && <path d={boundaryPaths.countyPath} fill="none" fillRule="evenodd" stroke="#0284c7" strokeWidth="2.4" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />}
										{boundaryPaths?.cityPath && <path d={boundaryPaths.cityPath} fill="none" fillRule="evenodd" stroke="#7c3aed" strokeWidth="2.8" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
										{selectedArea && (() => { const point = projectMapPoint(selectedArea.longitude, selectedArea.latitude); return <g data-marker className="madiun-marker" aria-label={`Area ${selectedArea.name}`}><circle cx={point.x} cy={point.y} r="12" fill="#f97316" stroke="white" strokeWidth="3"/><circle cx={point.x} cy={point.y} r="4" fill="white"/><text x={point.x + 16} y={point.y - 12} fill="#7c2d12" stroke="white" strokeWidth="4" paintOrder="stroke" fontSize="18" fontWeight="800">{selectedArea.name}</text></g>; })()}
										<g className={`marker-visibility${showMarkers ? "" : " markers-hidden"}`}>{markers.map(({ destination, point }) => { const marker = tourismMarkerStyle(destination); const isSelected = destination.id === selectedDestinationId; return <g key={destination.id} data-marker role="button" tabIndex={0} aria-pressed={isSelected} aria-label={`Pilih wisata ${destination.title}`} onClick={(event) => { event.stopPropagation(); if (suppressMapClickRef.current) { suppressMapClickRef.current = false; return; } focusDestination(destination); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focusDestination(destination); } }} className={`madiun-marker cursor-pointer${isSelected ? " selected-map-marker" : ""}`}>
											<title>{destination.title} · {destination.category}</title>
											{isSelected && <><circle cx={point.x} cy={point.y} r="23" fill="rgba(14,165,233,.18)" stroke="#38bdf8" strokeWidth="2" className="map-marker-halo"/><text x={point.x} y={point.y - 27} textAnchor="middle" fill="#082f49" stroke="white" strokeWidth="5" paintOrder="stroke" fontSize="15" fontWeight="900">{destination.title}</text></>}
											{marker.shape === "pin" ? <><path d={`M${point.x} ${point.y + 11}S${point.x - 8} ${point.y + 2} ${point.x - 8} ${point.y - 3}a8 8 0 1 1 16 0c0 5-8 14-8 14Z`} fill={marker.color} stroke="white" strokeWidth="2"/><circle cx={point.x} cy={point.y - 3} r="2.5" fill="white"/></> : marker.shape === "star" ? <path d={`m${point.x} ${point.y - 9} 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9Z`} fill={marker.color} stroke="white" strokeWidth="1.5"/> : marker.shape === "diamond" ? <path d={`m${point.x} ${point.y - 9} 8 9-8 9-8-9Z`} fill={marker.color} stroke="white" strokeWidth="1.5"/> : marker.shape === "leaf" ? <path d={`M${point.x} ${point.y + 8}C${point.x - 12} ${point.y + 1} ${point.x - 3} ${point.y - 10} ${point.x + 8} ${point.y - 8}C${point.x + 9} ${point.y + 2} ${point.x + 3} ${point.y + 8} ${point.x} ${point.y + 8}M${point.x} ${point.y + 7}l5-8`} fill={marker.color} stroke="white" strokeWidth="1.5"/> : <circle cx={point.x} cy={point.y} r="7" fill={marker.color} stroke="white" strokeWidth="2"/>}
										</g>; })}</g>
									</svg>
								</div>
								<div className="absolute left-3 top-3 z-10 flex max-w-[45%] items-center gap-2 rounded-xl border border-white/75 bg-white/90 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-sm backdrop-blur-md sm:left-4 sm:top-4 sm:max-w-[62%] sm:text-xs"><span className="h-2 w-2 shrink-0 rounded-full bg-sky-500"/>{selectedSpot ? "Destinasi terpilih" : selectedArea ? "Wilayah terpilih" : "Madiun · Jawa Timur"}</div>
								{mapActive && <div className="absolute right-3 top-3 z-10 flex gap-2 sm:right-4 sm:top-4"><div className="map-control-bar flex overflow-hidden rounded-xl border border-white/90 bg-white/95 text-slate-700 shadow-lg backdrop-blur-md"><button data-map-control type="button" onClick={() => zoom(.2)} className="px-3 py-2 text-lg font-semibold transition hover:bg-sky-50 hover:text-sky-700" aria-label="Perbesar peta">+</button><button data-map-control type="button" onClick={() => zoom(-.2)} className="border-l border-slate-100 px-3 py-2 text-lg font-semibold transition hover:bg-sky-50 hover:text-sky-700" aria-label="Perkecil peta">−</button><button data-map-control type="button" onClick={() => { setMapScale(1); mapOffsetRef.current = { x: 0, y: 0 }; setMapOffset({ x: 0, y: 0 }); }} className="border-l border-slate-100 px-3 py-2 text-xs font-bold transition hover:bg-sky-50 hover:text-sky-700">Reset</button></div><button data-map-control type="button" onClick={() => setMapActive(false)} className="map-control-bar rounded-xl border border-white/90 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg backdrop-blur-md transition hover:bg-sky-50 hover:text-sky-700">Selesai <span aria-hidden="true">×</span></button></div>}
								<div className="absolute bottom-3 left-3 rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-sm backdrop-blur-md sm:bottom-4 sm:left-4 sm:text-[11px]">{markers.length} wisata ditandai</div>
								<div className="absolute bottom-3 right-3 rounded-md bg-white/90 px-2 py-1 text-[9px] font-semibold text-slate-600 shadow-sm backdrop-blur sm:bottom-4 sm:right-4 sm:text-[10px]">© OpenStreetMap</div>
								{!boundaryPaths && <div className="absolute left-3 top-14 z-10 rounded-xl bg-white/90 px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-sm sm:left-4 sm:top-16 sm:text-xs">{boundaryFailed ? "Garis batas belum termuat." : "Memuat garis batas…"}</div>}
							</div>
							<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
								<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-semibold text-[var(--home-ink)]/65 sm:text-xs" aria-label="Legenda peta"><span className="inline-flex items-center gap-2"><i className="h-0 w-5 border-t-2 border-dashed border-sky-600"/>Kabupaten</span><span className="inline-flex items-center gap-2"><i className="h-0 w-5 border-t-2 border-dashed border-violet-600"/>Kota</span><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-sky-600"/>Wisata</span></div>
								<a href={googleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-[var(--home-ink)] transition hover:bg-[var(--home-soft)]">Buka di Google Maps <IconArrowRight/></a>
							</div>
							<div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--home-glass-border)] pt-3">
								<button type="button" data-map-explore aria-pressed={mapActive} onClick={() => setMapActive((active) => !active)} className="map-explore-button group relative inline-flex min-h-11 items-center gap-3 overflow-hidden rounded-2xl border border-sky-200/70 bg-white/90 px-3 py-2 text-left text-sky-900 shadow-sm dark:border-sky-300/15 dark:bg-slate-900/70 dark:text-sky-100 sm:px-4">
									<span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-200"><span className="map-hand-halo absolute inset-0 rounded-xl border border-sky-400/50"/><svg className="map-hand-icon relative h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V12 4.5a1.5 1.5 0 0 1 3 0V12 6a1.5 1.5 0 0 1 3 0v7l.8-2.1a1.7 1.7 0 0 1 3.2 1.2l-2 5.5A5 5 0 0 1 15.3 21h-3.1a5 5 0 0 1-3.8-1.8L5.6 16a1.8 1.8 0 0 1 2.4-2.7L10 15"/></svg></span>
									<span><span className="block text-xs font-extrabold">{mapActive ? "Mode jelajah aktif" : "Jelajahi peta"}</span><span className="mt-0.5 block text-[10px] font-medium text-sky-800/65 dark:text-sky-100/55">{mapActive ? "Geser peta · scroll untuk zoom" : "Ketuk untuk geser dan zoom"}</span></span>
								</button>
								{mapActive && <button type="button" onClick={() => setShowMarkers((shown) => !shown)} aria-pressed={showMarkers} className="rounded-xl border border-[var(--home-glass-border)] px-3 py-2 text-xs font-bold text-[var(--home-ink)] transition hover:bg-[var(--home-soft)]">{showMarkers ? "Sembunyikan pin" : "Tampilkan pin"}</button>}
							</div>
						</div>

						<aside className={`min-w-0 overflow-hidden rounded-[1.35rem] border border-[var(--home-glass-border)] bg-white/60 p-4 dark:bg-slate-950/25 sm:p-5 lg:flex lg:min-h-[clamp(620px,72vh,840px)] lg:flex-col ${selectedSpot ? "order-1 lg:order-2" : "order-2"}`}>
							<div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.17em] text-[var(--home-primary)]">{selectedSpot ? "PROFIL DESTINASI" : selectedArea ? "WILAYAH TERPILIH" : searchQuery ? "HASIL PENCARIAN" : "PILIHAN WISATA"}</p><h3 className="mt-1 break-words text-lg font-black text-[var(--home-ink)]">{selectedSpot ? selectedSpot.title : selectedArea ? selectedArea.name : searchQuery ? "Destinasi yang cocok" : "Spot wisata"}</h3></div><div className="flex shrink-0 items-center gap-2">{selectedSpot?.featured && <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-300">Unggulan</span>}{(selectedSpot || selectedArea || searchQuery) && <button type="button" onClick={clearMapSelection} aria-label="Tutup pilihan dan tampilkan semua destinasi" title="Tutup pilihan" className="grid h-10 w-10 place-items-center rounded-full border border-[var(--home-glass-border)] bg-[var(--home-glass)] text-[var(--home-ink)]/65 transition hover:bg-[var(--home-soft)] hover:text-[var(--home-ink)]"><IconX /></button>}</div></div>
							{selectedSpot ? <>
								<div className="relative mt-4 aspect-[16/10] overflow-hidden rounded-2xl bg-sky-100 dark:bg-slate-800">{selectedSpot.image ? <Image src={selectedSpot.image} alt={selectedSpot.title} fill sizes="(min-width: 1024px) 380px, 100vw" className="object-cover"/> : <div className="grid h-full place-items-center text-3xl">📍</div>}<span className="absolute bottom-3 left-3 max-w-[85%] truncate rounded-full border border-white/40 bg-white/90 px-3 py-1.5 text-[10px] font-extrabold text-slate-900 shadow-sm backdrop-blur">{selectedSpot.category}</span></div>
								<p className="mt-4 line-clamp-4 text-sm leading-6 text-[var(--home-ink)]/70">{selectedSpot.shortDescription || selectedSpot.description || "Buka profil destinasi untuk melihat cerita dan informasi lengkap tempat ini."}</p>
								{selectedSpot.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{selectedSpot.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold text-sky-800 dark:text-sky-200">#{tag}</span>)}</div>}
								<div className="mt-auto flex flex-col gap-2 pt-5"><Link href={`/wisata/${encodeURIComponent(selectedSpot.slug)}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--home-primary)] px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-sky-900/10 transition hover:-translate-y-0.5">Buka profil wisata <IconArrowRight/></Link><button type="button" onClick={clearMapSelection} className="min-h-10 rounded-xl px-3 py-2 text-xs font-bold text-[var(--home-ink)]/65 transition hover:bg-[var(--home-soft)]">Tampilkan semua destinasi</button></div>
							</> : <>
								{selectedArea && <div className="mt-3 rounded-xl border border-sky-200/60 bg-sky-500/5 px-3 py-2 text-xs text-[var(--home-ink)]/70 dark:border-sky-300/10">Wilayah ditandai di peta. <button type="button" onClick={clearMapSelection} className="font-extrabold text-sky-800 underline underline-offset-2 dark:text-sky-200">Lihat semua</button></div>}
								{destinations.length > 0 && <div className="mt-4 min-h-0 lg:flex-1"><p className="mb-2 text-[10px] font-black uppercase tracking-[.15em] text-[var(--home-ink)]/55">{searchQuery ? "Hasil pencarian" : "Spot tersedia"}</p><div className="space-y-1.5 lg:max-h-[min(34vh,340px)] lg:overflow-y-auto lg:pr-1">{destinations.slice(0, 6).map((destination) => <button key={destination.id} type="button" onClick={() => focusDestination(destination)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-sky-500/10"><span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-sky-100 dark:bg-slate-800">{destination.image ? <Image src={destination.image} alt="" fill sizes="44px" className="object-cover"/> : <span className="grid h-full place-items-center">📍</span>}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-[var(--home-ink)]">{destination.title}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--home-ink)]/55">{destination.category}</span></span><span className="text-sm text-sky-700 dark:text-sky-300">→</span></button>)}</div></div>}
							</>}
						</aside>
					</div>
				</div>
			</div>
		</section>
	);
};

const MoodCategories = ({
	selectedCategories,
	onSelect,
	compact = false,
}: {
	selectedCategories: string[];
	onSelect: (categories: string[]) => void;
	compact?: boolean;
}) => (
	<section id="kuliner" className={`mx-auto w-full max-w-7xl px-4 sm:px-6 ${compact ? "order-[10] relative z-10 mt-[76px] py-2" : "order-[30] py-20"}`}>
		{!compact && <div className="mb-12 animate-fade-up text-center"><h2 className="mb-4 text-3xl font-extrabold text-[var(--home-ink)]">Pilih kategori</h2><p className="text-[var(--home-ink)]/70">Pilih satu atau beberapa kategori untuk menyaring destinasi.</p></div>}

		{compact && <div className="mb-2 flex items-center justify-between gap-3 px-1"><div><p className="text-[9px] font-black uppercase tracking-[.17em] text-[var(--home-primary)]">SARING PERASAAN</p><p className="mt-0.5 text-[11px] font-medium text-[var(--home-ink)]/60">Pilih satu atau beberapa suasana</p></div><span className="rounded-full bg-[var(--home-accent)]/10 px-3 py-1.5 text-[10px] font-black text-[var(--home-primary)]">{selectedCategories.length ? `${selectedCategories.length} dipilih` : "Semua suasana"}</span></div>}
		<div className={`flex gap-2.5 animate-fade-up ${compact ? "discovery-chips overflow-x-auto rounded-[1.5rem] border border-[var(--home-glass-border)] bg-[var(--home-glass)]/90 p-2.5 shadow-[0_14px_40px_-34px_rgba(3,80,130,.65)] backdrop-blur-xl sm:flex-wrap sm:overflow-visible" : "flex-wrap justify-center gap-3 delay-200"}`}>
			{MOODS.map((mood) => (
				<button
					key={mood.name}
					type="button"
					aria-pressed={selectedCategories.includes(mood.name)}
					onClick={() => onSelect(selectedCategories.includes(mood.name) ? selectedCategories.filter((item) => item !== mood.name) : [...selectedCategories, mood.name])}
					className={`mood-chip group flex shrink-0 items-center gap-2.5 rounded-full border transition-all duration-300 hover:-translate-y-1 hover:border-[var(--home-accent)] hover:shadow-[0_10px_24px_rgba(14,116,190,.18)] active:scale-95 ${compact ? "px-4 py-2.5 text-xs" : "glass-panel mood-float px-5 py-3.5 text-sm"} ${selectedCategories.includes(mood.name) ? "!border-[var(--home-accent)] !bg-[var(--home-accent)]/20 !shadow-[0_0_0_3px_rgba(56,189,248,.12)]" : ""}`}>
					<span className={`${compact ? "text-base" : "text-xl"} transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-6`}>
						{mood.icon}
					</span>
					<span className="font-bold text-[var(--home-ink)]">{mood.name}</span>
				</button>
			))}
			{selectedCategories.length > 0 && <button type="button" onClick={() => onSelect([])} className="rounded-full px-3 py-2 text-xs font-bold text-[var(--home-ink)]/65 underline underline-offset-4">Reset</button>}
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
	compact = false,
	selectedDestinationId = null,
}: {
	destinations: DestinationCard[];
	loading: boolean;
	error: string;
	onClearFilters: () => void;
	hasActiveFilters: boolean;
	incompleteCount: number;
	compact?: boolean;
	selectedDestinationId?: string | null;
}) => (
	<section id="destinasi" className={`mx-auto max-w-7xl px-6 ${compact ? selectedDestinationId ? "order-[30] py-6" : "order-[20] py-6" : "order-[40] py-20"}`}>
		<div className={`flex justify-between items-end animate-fade-up ${compact ? "mb-6" : "mb-12"}`}>
			<div>
				<p className="mb-3 text-xs font-black uppercase tracking-[.22em] text-[var(--home-primary)]">Curated for your next story</p>
				<h2 className="text-3xl font-extrabold text-[var(--home-ink)] mb-2">
					Spot pilihan
				</h2>
				<p className="text-[var(--home-ink)]/70">
					Tempat seru di Madiun.
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
						className={`glass-panel group rounded-[1.75rem] p-3 shadow-sm transition-all duration-500 hover:-translate-y-2 hover:rotate-[.25deg] hover:border-sky-300/70 hover:shadow-[0_24px_55px_-32px_rgba(14,116,190,.55)] active:scale-[.985] animate-fade-up ${selectedDestinationId === dest.id ? "!border-sky-400 !ring-2 !ring-sky-400/25" : ""}`}>
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
							<span title={dest.category} className="absolute bottom-3 left-3 max-w-[82%] truncate rounded-full border border-white/35 bg-white/85 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-sm backdrop-blur-md">{dest.category}</span>
						</div>
						<div className="px-3 pb-3">
							<h3 className="text-lg font-bold text-[var(--home-ink)] mb-2 line-clamp-1 group-hover:text-[var(--home-primary)] transition-colors">
								{dest.title}
							</h3>
							<p className="min-h-10 text-sm leading-relaxed text-[var(--home-ink)]/70 line-clamp-2">
								{dest.shortDescription || dest.description || "Lihat informasi destinasi wisata ini."}
							</p>
							<div className="mt-4 flex items-center justify-between border-t border-[var(--home-glass-border)] pt-3 text-sm font-bold text-[var(--home-primary)]"><span>Kenali spot ini</span><span className="transition-transform group-hover:translate-x-1"><IconArrowRight /></span></div>
						</div>
					</Link>
				))}
			</div>
		) : null}

	</section>
);

type PublicCampaign = {
	id: string;
	title: string;
	description: string;
	imageUrl: string | null;
	experienceType: "popup" | "minigame" | "photobox";
	displayChance: number;
	ctaLabel: string | null;
	ctaUrl: string;
};

const PromotionalSection = () => {
	const [campaigns, setCampaigns] = useState<PublicCampaign[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const touchStartX = useRef<number | null>(null);
	const seenCampaigns = useRef(new Set<string>());

	useEffect(() => {
		let isMounted = true;
		fetch("/api/public-campaigns")
			.then((response) => (response.ok ? response.json() : { campaigns: [] }))
			.then((result: { campaigns?: PublicCampaign[] }) => {
				if (isMounted && Array.isArray(result.campaigns)) setCampaigns(result.campaigns.filter((campaign) => Math.random() * 100 < campaign.displayChance));
			})
			.catch(() => undefined);
		return () => { isMounted = false; };
	}, []);

	const slides = [
		{ id: "boarding-pass", campaign: null as PublicCampaign | null },
		...campaigns.map((campaign) => ({ id: campaign.id, campaign })),
	];
	const activeSlide = slides[activeIndex] ?? slides[0];
	const campaign = activeSlide.campaign;
	useEffect(() => {
		if (!campaign || seenCampaigns.current.has(campaign.id)) return;
		seenCampaigns.current.add(campaign.id);
		void trackVisitorEvent({ eventName: "campaign_impression", pageKey: "home", campaignId: campaign.id });
	}, [campaign?.id]);
	function trackCampaignClick() {
		if (campaign) void trackVisitorEvent({ eventName: "campaign_click", pageKey: "home", campaignId: campaign.id });
	}
	const campaignType = campaign?.experienceType === "minigame"
		? "MINIGAME · TiLoc!"
		: campaign?.experienceType === "photobox"
			? "PHOTO EXPERIENCE · TiLoc!"
			: "CAMPAIGN · TiLoc!";
	const ctaLabel = campaign?.ctaLabel?.trim() || (campaign?.experienceType === "photobox" ? "Coba photobox" : campaign?.experienceType === "minigame" ? "Mulai minigame" : "Jelajahi event");
	const ctaUrl = campaign?.ctaUrl || "/scan";

	function moveSlide(direction: -1 | 1) {
		setActiveIndex((current) => (current + direction + slides.length) % slides.length);
	}

	return (
		<section id="promo" className="py-20 px-6 max-w-6xl mx-auto">
			<div
				className="relative"
				onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
				onTouchEnd={(event) => {
					const endX = event.changedTouches[0]?.clientX;
					if (touchStartX.current === null || endX === undefined) return;
					const distance = endX - touchStartX.current;
					if (Math.abs(distance) > 48) moveSlide(distance > 0 ? -1 : 1);
					touchStartX.current = null;
				}}>
				<div key={activeSlide.id} className="min-h-[420px] bg-[var(--home-primary)] rounded-[2.5rem] p-8 md:p-14 relative overflow-hidden shadow-[0_24px_80px_-34px_var(--home-bloom)] animate-fade-up">
					<div className="absolute top-0 right-0 w-64 h-64 bg-[var(--home-accent)] rounded-full blur-[80px] opacity-50 -translate-y-1/2 translate-x-1/4" />
					<div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--home-accent)] rounded-full blur-[80px] opacity-40 translate-y-1/4 -translate-x-1/4" />
					<div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
						<div className="text-white max-w-lg text-center md:text-left">
							<span className="inline-block bg-[var(--home-glass)]/20 backdrop-blur-sm text-white text-xs md:text-sm font-bold tracking-[.12em] px-4 py-2 rounded-full mb-6">
								{campaign ? campaignType : "PREMIUM ACCESS · TiLoc!"}
							</span>
							<h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
								{campaign ? campaign.title : <>Boarding Pass <br />Digital-mu.</>}
							</h2>
							<p className="text-white/80 text-lg mb-8">
								{campaign?.description?.trim() || "Scan QR di lokasi untuk membuka cerita destinasi, memulai sesi pengunjung, dan menemukan kejutan visual sepanjang perjalanan."}
							</p>
							{ctaUrl.startsWith("/") ? (
								<Link href={ctaUrl} onClick={trackCampaignClick} className="inline-flex items-center gap-3 bg-[var(--home-glass)] text-[var(--home-ink)] px-7 py-4 rounded-2xl font-bold hover:bg-[var(--home-accent)] transition-all transform hover:scale-[1.03]">
									{campaign ? ctaLabel : "Aktifkan perjalanan"} <IconArrowRight />
								</Link>
							) : (
								<a href={ctaUrl} target="_blank" rel="noreferrer" onClick={trackCampaignClick} className="inline-flex items-center gap-3 bg-[var(--home-glass)] text-[var(--home-ink)] px-7 py-4 rounded-2xl font-bold hover:bg-[var(--home-accent)] transition-all transform hover:scale-[1.03]">
									{ctaLabel} <IconArrowRight />
								</a>
							)}
						</div>

						{campaign?.imageUrl ? (
							<div className="w-full max-w-sm h-64 md:h-80 relative overflow-hidden rounded-[2rem] border border-white/30 shadow-2xl">
								<Image src={campaign.imageUrl} alt={campaign.title} fill unoptimized sizes="(max-width: 768px) 90vw, 380px" className="object-cover" />
								<div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent" />
								<div className="absolute inset-x-0 bottom-0 p-5 text-white">
									<div className="text-xs font-bold tracking-[.16em] text-white/75">TiLoc! EVENT</div>
									<div className="mt-1 text-xl font-black">{campaign.title}</div>
								</div>
							</div>
						) : campaign ? (
							<div className="w-full max-w-sm h-64 md:h-80 relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 flex items-center justify-center">
								<div className="absolute inset-5 rounded-[1.5rem] border border-dashed border-white/25" />
								<div className="relative text-center text-white"><div className="text-6xl mb-4" aria-hidden="true">{campaign.experienceType === "photobox" ? "📸" : campaign.experienceType === "minigame" ? "🎮" : "✨"}</div><div className="text-xs font-bold tracking-[.18em] text-white/70">TiLoc! EVENT</div><div className="mt-2 text-2xl font-black">{campaign.title}</div></div>
							</div>
						) : (
							<div className="w-full max-w-sm relative group">
								<div className="absolute inset-0 bg-[var(--home-accent)] rounded-[2rem] rotate-6 group-hover:rotate-12 transition-transform duration-500" />
								<div className="absolute -right-4 -top-5 z-20 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--home-glass-border)] bg-[var(--home-glass)] text-[var(--home-accent)] shadow-[0_0_24px_var(--home-bloom)] animate-envelope-float"><IconEnvelope /></div>
								<div className="relative bg-[var(--home-glass)] rounded-[2rem] p-6 shadow-xl border-4 border-[var(--home-glass-border)] transform group-hover:-translate-y-2 group-hover:-rotate-3 transition-transform duration-500">
									<div className="mb-4 flex items-center justify-between border-b border-[var(--home-glass-border)] pb-3 text-[var(--home-ink)]"><span className="font-black tracking-[.18em]">MDN-TRP</span><IconCamera /></div>
									<div className="matrix-qr-stage h-40 bg-[var(--home-soft)] rounded-xl mb-4 overflow-hidden relative flex items-center justify-center">
										<div className="grid h-28 w-28 grid-cols-5 gap-1 rounded-xl bg-[var(--home-glass)] p-2" aria-hidden="true">
											{Array.from({ length: 25 }, (_, index) => <span key={index} className={`matrix-cell rounded-sm ${[0, 1, 3, 5, 7, 12, 16, 18, 20, 21, 23, 24].includes(index) ? "is-fixed bg-[var(--home-primary)]" : "bg-[var(--home-accent)]/40"}`} style={{ animationDelay: `${(index % 5) * 180}ms` }} />)}
										</div>
									</div>
									<div className="flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-[var(--home-ink)]/55">Destinasi</div><div className="font-bold text-[var(--home-ink)] text-lg">TiLoc! Explorer</div></div><div className="rounded bg-[var(--home-accent)]/15 px-2 py-1 font-mono text-xs font-bold text-[var(--home-ink)]">READY TO SCAN</div></div>
								</div>
							</div>
						)}
					</div>
				</div>

				<div className="mt-5 flex items-center justify-between gap-4 px-1">
					<div className="flex items-center gap-2" aria-label="Pilih promo">
						{slides.map((slide, index) => <button key={slide.id} type="button" onClick={() => setActiveIndex(index)} aria-label={`Tampilkan promo ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined} className={`h-2.5 rounded-full transition-all duration-300 ${index === activeIndex ? "w-8 bg-[var(--home-primary)]" : "w-2.5 bg-[var(--home-primary)]/25 hover:bg-[var(--home-primary)]/50"}`} />)}
						<span className="ml-2 text-xs font-bold tracking-widest text-[var(--home-ink)]/55">{String(activeIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
					</div>
					<div className="flex items-center gap-2">
						<button type="button" onClick={() => moveSlide(-1)} aria-label="Promo sebelumnya" className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--home-primary)]/15 bg-[var(--home-glass)] text-[var(--home-primary)] shadow-sm transition hover:-translate-x-0.5 hover:shadow-md"><span className="rotate-180"><IconArrowRight /></span></button>
						<button type="button" onClick={() => moveSlide(1)} aria-label="Promo berikutnya" className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--home-primary)]/15 bg-[var(--home-glass)] text-[var(--home-primary)] shadow-sm transition hover:translate-x-0.5 hover:shadow-md"><IconArrowRight /></button>
					</div>
				</div>
			</div>
		</section>
	);
};

const Footer = () => {
	return (
	<footer id="tentang" className="bg-[var(--home-glass)] pt-20 pb-10 px-6 border-t border-[var(--home-glass-border)]">
		<div className="max-w-7xl mx-auto">
			<div className="mb-12 flex flex-col items-start justify-between gap-6 border-b border-[var(--home-glass-border)] pb-10 md:flex-row md:items-center"><div><h3 className="mb-2 text-2xl font-bold text-[var(--home-ink)]">Mau mulai dari mana?</h3><p className="text-[var(--home-ink)]/65">Pilih cara eksplorasi yang paling cocok buat trip-mu.</p></div><div className="flex flex-wrap gap-3"><a href="#peta" className="rounded-full border border-[var(--home-glass-border)] bg-[var(--home-glass)] px-5 py-3 font-bold text-[var(--home-ink)] transition hover:-translate-y-0.5 hover:border-[var(--home-accent)]">Jelajah peta</a><a href="#kuliner" className="rounded-full border border-[var(--home-glass-border)] bg-[var(--home-glass)] px-5 py-3 font-bold text-[var(--home-ink)] transition hover:-translate-y-0.5 hover:border-[var(--home-accent)]">Pilih mood</a><a href="#destinasi" className="rounded-full bg-[var(--home-primary)] px-5 py-3 font-bold text-white transition hover:-translate-y-0.5">Lihat spot pilihan</a></div></div>
		<div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
			<div className="md:col-span-2">
				<div className="mb-6"><TiLocBrand markClassName="h-10 w-10" wordmarkClassName="text-2xl font-extrabold tracking-tight text-[var(--home-ink)]" accentClassName="text-[var(--home-accent)]" tagline="Titik Lokasi" taglineClassName="mt-0.5 block text-[10px] font-bold uppercase tracking-[.18em] text-[var(--home-ink)]/55"/></div>
				<p className="text-[var(--home-ink)]/70 max-w-sm mb-6 leading-relaxed">
					Platform penemuan wisata premium untuk mengeksplorasi keindahan alam,
					budaya, dan kuliner Madiun.
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
			<p>&copy; TiLoc! Hak Cipta Dilindungi.</p>
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

export default function TiLocApp() {
	const { isDark, toggleTheme } = useTheme();
	const [destinations, setDestinations] = useState<DestinationCard[]>([]);
	const [loadingDestinations, setLoadingDestinations] = useState(true);
	const [destinationError, setDestinationError] = useState("");
	const [incompleteDestinationCount, setIncompleteDestinationCount] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
	const [mapFocusPanelOpen, setMapFocusPanelOpen] = useState(false);
	const [selectedMapSpot, setSelectedMapSpot] = useState<DestinationCard | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function loadDestinations() {
			try {
				const query = searchQuery.trim();
				const url = query ? `/api/public-destinations?q=${encodeURIComponent(query)}` : "/api/public-destinations";
				const response = await fetch(url, { cache: "no-store" });

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
				setDestinationError("");
			} catch {
				if (!cancelled)
					setDestinationError(
						"Koneksi ke data destinasi gagal. Coba muat ulang halaman.",
					);
			} finally {
				if (!cancelled) setLoadingDestinations(false);
			}
		}

		const debounce = window.setTimeout(() => { void loadDestinations(); }, searchQuery.trim() ? 280 : 0);
		return () => {
			cancelled = true;
			window.clearTimeout(debounce);
		};
	}, [searchQuery]);

	const visibleDestinations = destinations.filter((destination) => {
		const searchable =
			`${destination.title} ${destination.shortDescription} ${destination.description} ${destination.category} ${destination.tags.join(" ")}`.toLocaleLowerCase(
				"id",
			);
		const matchesSearch = searchable.includes(
			searchQuery.trim().toLocaleLowerCase("id"),
		);
		const matchesCategory = !selectedCategories.length || selectedCategories.some((category) => destination.categories.some((item) => item.toLocaleLowerCase("id") === category.toLocaleLowerCase("id")));
		return matchesSearch && matchesCategory;
	});
	const hasActiveFilters = Boolean(searchQuery.trim()) || selectedCategories.length > 0;
	const categoryFocused = selectedCategories.length > 0;
	const compactDiscovery = hasActiveFilters || mapFocusPanelOpen;
	const compactLabel = selectedMapSpot?.title ?? (searchQuery.trim() ? `Pencarian: ${searchQuery.trim()}` : selectedCategories.join(", "));
	const handleMapSearchChange = (value: string) => {
		setSearchQuery(value);
		setSelectedMapSpot(null);
		if (!value.trim()) {
			setMapFocusPanelOpen(false);
		}
	};
	const handleMapSpotSelected = (destination: DestinationCard | null) => {
		setSelectedMapSpot(destination);
		if (!destination) {
			setMapFocusPanelOpen(false);
			return;
		}
		setSelectedCategories([]);
		setMapFocusPanelOpen(true);
		window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
	};
	const handleCategorySelect = (categories: string[]) => {
		setSearchQuery("");
		setMapFocusPanelOpen(false);
		setSelectedMapSpot(null);
		setSelectedCategories(categories);
	};
	const clearDiscoveryFilters = () => {
		setSearchQuery("");
		setSelectedCategories([]);
		setMapFocusPanelOpen(false);
		setSelectedMapSpot(null);
	};
	useEffect(() => {
		if (categoryFocused) window.scrollTo({ top: 0, behavior: "smooth" });
	}, [categoryFocused]);

	return (
		<>
			<GlobalStyles />
			<div className={`home-page min-h-screen relative selection:bg-[var(--home-accent)] selection:text-white${isDark ? " dark" : ""}`}>
				<StarParticles isDark={isDark} />
				<Navbar isDark={isDark} onToggleTheme={toggleTheme} discoveryMode={compactDiscovery} discoveryLabel={compactLabel} resultCount={visibleDestinations.length} onExitDiscovery={clearDiscoveryFilters} />

				<main className="relative z-10">
					<div className="flex flex-col">
						{!compactDiscovery && <div className="order-10"><HeroSection /></div>}
						<MoodCategories selectedCategories={selectedCategories} onSelect={handleCategorySelect} compact={compactDiscovery} />
						<Highlights destinations={visibleDestinations} loading={loadingDestinations} error={destinationError} hasActiveFilters={hasActiveFilters} incompleteCount={incompleteDestinationCount} onClearFilters={clearDiscoveryFilters} compact={compactDiscovery} selectedDestinationId={selectedMapSpot?.id ?? null} />
						<DiscoveryMap searchQuery={searchQuery} onSearchChange={handleMapSearchChange} destinations={visibleDestinations} selectedDestinationId={selectedMapSpot?.id ?? null} selectedSpot={selectedMapSpot} onSpotSelected={handleMapSpotSelected} onClearSelectedSpot={clearDiscoveryFilters} compact={compactDiscovery} />
					</div>
					<PromotionalSection />
					<SystemCampaignPrompt pageKey="home" />
				</main>

				<Footer />
			</div>
		</>
	);
}
