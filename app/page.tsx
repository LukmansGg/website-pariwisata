"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/src/infrastructure/supabase/client";

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
const IconStar = ({ filled }: { filled?: boolean }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill={filled ? "currentColor" : "none"}
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round">
		<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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

const GlobalStyles = () => (
	<style
		dangerouslySetInnerHTML={{
			__html: `
    :root {
      --merino: #F5EEDD;
      --venice: #16587B;
      --rock: #84B3CE;
    }

    body {
      background-color: var(--merino);
      color: var(--venice);
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      -webkit-font-smoothing: antialiased;
    }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: var(--merino); }
    ::-webkit-scrollbar-thumb { background: var(--rock); border-radius: 5px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--venice); }

    /* Animations */
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
      0% { box-shadow: 0 0 0 0 rgba(22, 88, 123, 0.4); }
      70% { box-shadow: 0 0 0 20px rgba(22, 88, 123, 0); }
      100% { box-shadow: 0 0 0 0 rgba(22, 88, 123, 0); }
    }

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

  `,
		}}
	/>
);

const Navbar = () => (
	<nav className="fixed top-0 w-full z-50 transition-all duration-300 bg-[#F5EEDD]/90 backdrop-blur-md border-b border-[#16587B]/10">
		<div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
			<div className="flex items-center gap-2 cursor-pointer group">
				<div className="w-10 h-10 rounded-full bg-[#16587B] flex items-center justify-center text-[#F5EEDD] font-bold text-xl group-hover:scale-105 transition-transform">
					M
				</div>
				<span className="text-xl font-extrabold text-[#16587B] tracking-tight">
					MadiunTrip<span className="text-[#84B3CE]">.</span>
				</span>
			</div>
			<div className="hidden md:flex items-center gap-8 text-[#16587B] font-medium">
				<a
					href="#destinasi"
					className="hover:text-[#84B3CE] transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-[#84B3CE] hover:after:w-full after:transition-all">
					Destinasi
				</a>
				<a
					href="#kuliner"
					className="hover:text-[#84B3CE] transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-[#84B3CE] hover:after:w-full after:transition-all">
					Kuliner
				</a>
				<a
					href="#promo"
					className="hover:text-[#84B3CE] transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-[#84B3CE] hover:after:w-full after:transition-all">
					Promo
				</a>
				<Link href="/scan" className="hover:text-[#84B3CE] transition-colors">
					Scan QR
				</Link>
			</div>
			<Link
				href="/login"
				className="bg-[#16587B] text-white px-6 py-2.5 rounded-full font-medium hover:bg-[#84B3CE] hover:text-[#16587B] transition-all transform hover:scale-105 shadow-sm">
				Masuk
			</Link>
		</div>
	</nav>
);

const HeroSection = () => {
	return (
		<section className="relative pt-32 pb-20 px-6 overflow-hidden min-h-[90vh] flex flex-col items-center justify-center">
			{/* Decorative Background Elements */}
			<div className="absolute top-40 left-10 w-32 h-32 bg-[#84B3CE]/20 rounded-full blur-3xl animate-float"></div>
			<div className="absolute bottom-20 right-10 w-64 h-64 bg-[#84B3CE]/20 rounded-full blur-3xl animate-float delay-300"></div>

			{/* Tiny Map Coordinates / Decor */}
			<div className="absolute top-32 right-20 text-[#16587B]/40 text-xs font-mono hidden lg:block animate-fade">
				7°37&apos;48.0&apos;S 111°31&apos;24.0&quot;E
			</div>

			<div className="max-w-4xl mx-auto w-full flex flex-col items-center text-center z-10">
				{/* Main Headline */}
				<h1 className="text-5xl md:text-7xl font-black text-[#16587B] leading-[1.1] tracking-tight mb-6 animate-fade-up delay-100">
					Liburanmu, <br className="md:hidden" />
					<span className="relative inline-block">
						<span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[#16587B] to-[#84B3CE]">
							Cerita Barumu.
						</span>
						<svg
							className="absolute -bottom-2 w-full h-4 text-[#84B3CE]/40 -z-10"
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

				<p className="text-lg md:text-xl text-[#16587B]/80 max-w-2xl mb-12 animate-fade-up delay-200">
					Temukan spot rahasia, kuliner legendaris, dan petualangan epik di
					Kabupaten Madiun.
				</p>

				{/* The Main Feature: Interactive QR Scanner Concept */}
				<div className="w-full max-w-lg animate-fade-up delay-300 group">
					<div className="flex flex-col items-center justify-center p-8 bg-white/60 backdrop-blur-xl rounded-[2.5rem] border border-white/50 shadow-[0_20px_60px_-15px_rgba(22,88,123,0.1)] relative overflow-hidden transition-transform duration-500 hover:shadow-[0_30px_70px_-15px_rgba(132,179,206,0.3)] hover:-translate-y-2">
						{/* Scanner Corner Brackets (Game UI feel) */}
						<div className="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-[#16587B] rounded-tl-xl transition-all group-hover:border-[#84B3CE] group-hover:scale-110"></div>
						<div className="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-[#16587B] rounded-tr-xl transition-all group-hover:border-[#84B3CE] group-hover:scale-110"></div>
						<div className="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-[#16587B] rounded-bl-xl transition-all group-hover:border-[#84B3CE] group-hover:scale-110"></div>
						<div className="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-[#16587B] rounded-br-xl transition-all group-hover:border-[#84B3CE] group-hover:scale-110"></div>

						{/* Eyebrow Label */}
						<span className="bg-[#F5EEDD] text-[#16587B] text-xs font-bold px-4 py-1.5 rounded-full tracking-wider mb-6 border border-[#16587B]/10 z-10">
							PETUALANGANMU DIMULAI DI SINI
						</span>

						{/* Scanner Graphic Area */}
						<div className="relative w-48 h-48 mb-8 rounded-2xl bg-[#F5EEDD]/50 border border-[#84B3CE]/30 flex items-center justify-center overflow-hidden">
							<IconCamera />
							{/* Animated Scan Line */}
							<div className="absolute left-0 right-0 h-1 bg-[#84B3CE] shadow-[0_0_15px_3px_#84B3CE] animate-scan-line"></div>
							{/* Subtle Grid Pattern in background */}
							<div
								className="absolute inset-0 opacity-10"
								style={{
									backgroundImage:
										"radial-gradient(#16587B 2px, transparent 2px)",
									backgroundSize: "16px 16px",
								}}></div>
						</div>

						<p className="text-sm text-[#16587B]/70 mb-8 max-w-xs text-center z-10">
							Scan QR Code di destinasi wisata untuk membuka cerita lokal,
							mini-games, dan kejutan eksklusif.
						</p>

						{/* Main CTA */}
						<Link
							href="/scan"
							className="w-full relative z-10 flex items-center justify-center gap-3 bg-[#16587B] text-white py-4 px-8 rounded-2xl font-bold text-lg overflow-hidden group/btn shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] btn-pulse active:scale-95">
							<span className="relative z-10">Mulai Scan QR</span>
							<IconArrowRight />
							{/* Button hover effect */}
							<div className="absolute inset-0 bg-gradient-to-r from-[#16587B] to-[#84B3CE] opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
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
	return (
		<section
			id="peta"
			className="relative px-6 -mt-10 z-20 pb-20 max-w-6xl mx-auto">
			<div className="animate-fade-up delay-400">
				{/* Floating Search Capsule */}
				<div className="absolute -top-8 left-1/2 -translate-x-1/2 w-full max-w-2xl z-30 px-4">
					<div className="bg-white p-2 rounded-full shadow-[0_10px_40px_-10px_rgba(22,88,123,0.2)] flex items-center border border-[#F5EEDD]">
						<div className="pl-4 text-[#84B3CE]">
							<IconSearch />
						</div>
						<input
							type="text"
							placeholder="Cari hidden gem, kuliner, atau wisata alam..."
							className="w-full bg-transparent border-none outline-none px-4 py-3 text-[#16587B] placeholder-[#16587B]/40 font-medium"
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
							className="bg-[#84B3CE] text-[#16587B] px-6 py-3 rounded-full font-bold hover:bg-[#16587B] hover:text-white transition-colors shadow-sm">
							Cari
						</button>
					</div>
				</div>

				{/* Map Container */}
				<div className="bg-white rounded-[2rem] p-4 shadow-xl border border-[#F5EEDD] pt-16 map-container relative overflow-hidden group">
					{/* Decorative map corner */}
					<div className="absolute top-0 right-0 bg-[#F5EEDD] text-[#16587B] text-xs font-bold px-4 py-2 rounded-bl-2xl rounded-tr-xl border-b border-l border-[#16587B]/10 z-10">
						Jelajah Peta Digital
					</div>

					<div className="w-full h-[400px] rounded-2xl overflow-hidden bg-[#F5EEDD] relative">
						<iframe
							width="100%"
							height="100%"
							frameBorder="0"
							scrolling="no"
							marginHeight={0}
							marginWidth={0}
							src="https://www.openstreetmap.org/export/embed.html?bbox=111.45%2C-7.75%2C111.75%2C-7.45&layer=mapnik"
							title="Peta Madiun"
							className="w-full h-full object-cover"></iframe>
						{/* Overlay interaction hint */}
						<div className="absolute inset-0 bg-[#16587B]/5 pointer-events-none group-hover:bg-transparent transition-colors duration-500"></div>
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
			<h2 className="text-3xl font-extrabold text-[#16587B] mb-4">
				Jelajahi Sesuai Mood
			</h2>
			<p className="text-[#16587B]/70">
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
					className={`flex items-center gap-3 px-6 py-4 rounded-2xl border shadow-sm hover:shadow-md hover:border-[#84B3CE] hover:-translate-y-1 transition-all group ${selectedMood === mood.id ? "bg-[#84B3CE]/30 border-[#84B3CE]" : "bg-white border-[#16587B]/10"}`}>
					<span className="text-2xl group-hover:scale-110 transition-transform">
						{mood.icon}
					</span>
					<span className="font-bold text-[#16587B]">{mood.name}</span>
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
}: {
	destinations: DestinationCard[];
	loading: boolean;
	error: string;
	onClearFilters: () => void;
}) => (
	<section id="destinasi" className="py-20 px-6 max-w-7xl mx-auto">
		<div className="flex justify-between items-end mb-12 animate-fade-up">
			<div>
				<h2 className="text-3xl font-extrabold text-[#16587B] mb-2">
					Highlight Hari Ini
				</h2>
				<p className="text-[#16587B]/70">
					Pilihan terbaik yang wajib kamu kunjungi.
				</p>
			</div>
			{destinations.length > 0 && (
				<p className="hidden md:block text-sm text-[#16587B]/60">
					{destinations.length} destinasi
				</p>
			)}
		</div>

		{loading ? (
			<p className="rounded-2xl bg-white p-8 text-center text-[#16587B]/70">
				Memuat destinasi wisata…
			</p>
		) : null}
		{error ? (
			<p
				role="alert"
				className="rounded-2xl border border-[#84B3CE]/40 bg-[#84B3CE]/10 p-6 text-[#16587B]">
				{error}
			</p>
		) : null}
		{!loading && !error && destinations.length === 0 ? (
			<div className="rounded-2xl bg-white p-8 text-center">
				<p className="font-bold text-[#16587B]">
					Belum ada destinasi terbit atau hasil yang cocok.
				</p>
				<button
					type="button"
					onClick={onClearFilters}
					className="mt-3 font-semibold text-[#16587B] underline decoration-[#84B3CE] underline-offset-4">
					Hapus pencarian dan filter
				</button>
			</div>
		) : null}
		{!loading && !error && destinations.length > 0 ? (
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				{destinations.map((dest, i) => (
					<Link
						href={`/wisata/${encodeURIComponent(dest.slug)}`}
						key={dest.id}
						style={{ animationDelay: `${Math.min((i + 1) * 100, 500)}ms` }}
						className="group bg-white rounded-[2rem] p-3 shadow-sm hover:shadow-xl transition-all duration-300 border border-[#F5EEDD] animate-fade-up">
						<div className="relative w-full h-48 rounded-[1.5rem] overflow-hidden mb-4 bg-gradient-to-br from-[#F5EEDD] to-[#84B3CE]/50">
							{dest.image ? (
								<Image
									src={dest.image}
									alt={dest.title}
									fill
									sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
									className="object-cover transform group-hover:scale-105 transition-transform duration-500"
								/>
							) : (
								<div className="flex h-full items-center justify-center text-[#16587B]">
									<IconMapPin />
								</div>
							)}
						</div>
						<div className="px-3 pb-3">
							<h3 className="text-lg font-bold text-[#16587B] mb-2 line-clamp-1 group-hover:text-[#84B3CE] transition-colors">
								{dest.title}
							</h3>
							<p className="min-h-10 text-sm text-[#16587B]/70 line-clamp-2">
								{dest.description || "Lihat informasi destinasi wisata ini."}
							</p>
							{dest.rating !== undefined && (
								<div className="mt-3 flex items-center gap-1 text-[#16587B] text-sm font-medium">
									<IconStar filled />
									<span>{dest.rating.toFixed(1)}</span>
									{dest.reviews !== undefined && (
										<span className="text-[#16587B]/50">
											({dest.reviews} ulasan)
										</span>
									)}
								</div>
							)}
							{dest.tags.length > 0 && (
								<div className="mt-3 flex flex-wrap gap-2">
									{dest.tags.map((tag) => (
										<span
											key={tag}
											className="bg-[#F5EEDD] text-[#16587B] text-xs px-2 py-1 rounded-md">
											{tag}
										</span>
									))}
								</div>
							)}
						</div>
					</Link>
				))}
			</div>
		) : null}

		<Link
			href="/scan"
			className="md:hidden w-full mt-8 flex items-center justify-center gap-2 text-[#16587B] font-bold py-4 rounded-xl border-2 border-[#16587B]/10 hover:bg-[#16587B]/5 transition-colors">
			Scan QR Destinasi <IconArrowRight />
		</Link>
	</section>
);

const PromotionalSection = () => (
	<section id="promo" className="py-20 px-6 max-w-6xl mx-auto">
		<div className="bg-[#16587B] rounded-[3rem] p-8 md:p-16 relative overflow-hidden shadow-2xl animate-fade-up">
			{/* Decorative Graphics */}
			<div className="absolute top-0 right-0 w-64 h-64 bg-[#84B3CE] rounded-full blur-[80px] opacity-50 -translate-y-1/2 translate-x-1/4"></div>
			<div className="absolute bottom-0 left-0 w-64 h-64 bg-[#84B3CE] rounded-full blur-[80px] opacity-40 translate-y-1/4 -translate-x-1/4"></div>

			<div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
				<div className="text-white max-w-lg text-center md:text-left">
					<span className="inline-block bg-white/20 backdrop-blur-sm text-white text-sm font-bold px-4 py-2 rounded-full mb-6">
						PANDUAN WISATA
					</span>
					<h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
						Jelajah Lebih, <br />
						Kenali Madiun.
					</h2>
					<p className="text-white/80 text-lg mb-8">
						Pindai QR di lokasi wisata untuk membuka halaman destinasi, cerita
						lokal, dan sesi pengunjung.
					</p>
					<Link
						href="/scan"
						className="inline-flex items-center gap-3 bg-white text-[#16587B] px-8 py-4 rounded-2xl font-bold hover:bg-[#84B3CE] transition-all transform hover:scale-105">
						Buka QR Scanner <IconArrowRight />
					</Link>
				</div>

				{/* Mockup / Graphic area */}
				<div className="w-full max-w-sm relative group cursor-pointer">
					<div className="absolute inset-0 bg-[#84B3CE] rounded-[2rem] rotate-6 group-hover:rotate-12 transition-transform duration-500"></div>
					<div className="relative bg-white rounded-[2rem] p-6 shadow-xl border-4 border-white transform group-hover:-translate-y-2 group-hover:-rotate-3 transition-transform duration-500">
						<div className="h-40 bg-[#F5EEDD] rounded-xl mb-4 overflow-hidden relative flex items-center justify-center">
							<div
								className="grid h-28 w-28 grid-cols-5 gap-1 rounded-xl bg-white p-2"
								aria-hidden="true">
								{Array.from({ length: 25 }, (_, index) => (
									<span
										key={index}
										className={`rounded-sm ${[0, 1, 3, 5, 7, 12, 16, 18, 20, 21, 23, 24].includes(index) ? "bg-[#16587B]" : "bg-[#84B3CE]/40"}`}
									/>
								))}
							</div>
						</div>
						<div className="font-bold text-[#16587B] text-xl mb-1">
							Cerita lokal Madiun
						</div>
						<div className="text-[#84B3CE] font-bold">Scan QR di destinasi</div>
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
				<div className="bg-white rounded-3xl rounded-br-none shadow-2xl border border-[#F5EEDD] w-80 mb-4 overflow-hidden animate-fade-up origin-bottom-right transition-all">
					<div className="bg-[#16587B] p-4 text-white flex justify-between items-center">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">
								💧
							</div>
							<div>
								<div className="font-bold">Tirta</div>
								<div className="text-xs text-white/70">Pencarian destinasi</div>
							</div>
						</div>
						<button
							onClick={() => setIsOpen(false)}
							className="hover:bg-white/20 p-2 rounded-full transition-colors">
							<IconX />
						</button>
					</div>
					<div className="p-6 h-64 bg-[#F5EEDD]/30 flex flex-col justify-end">
						<div className="bg-[#F5EEDD] text-[#16587B] p-3 rounded-2xl rounded-tl-none inline-block max-w-[85%] text-sm mb-4 shadow-sm border border-[#16587B]/5">
							Halo! Aku Tirta. Sebut nama tempat, kuliner, atau suasana yang
							ingin kamu cari.
						</div>
						<form onSubmit={handleSearch} className="flex gap-2">
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Cari destinasi..."
								className="min-w-0 flex-1 bg-white border border-[#16587B]/20 rounded-full px-4 py-2 text-sm outline-none focus:border-[#84B3CE]"
							/>
							<button
								type="submit"
								aria-label="Cari destinasi"
								className="bg-[#16587B] text-white p-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#84B3CE] hover:text-[#16587B] transition-colors">
								<IconArrowRight />
							</button>
						</form>
					</div>
				</div>
			)}

			{/* Floating Action Button */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="w-16 h-16 bg-[#16587B] text-white rounded-full shadow-[0_10px_25px_-5px_rgba(22,88,123,0.5)] flex items-center justify-center hover:scale-110 hover:bg-[#84B3CE] transition-all duration-300">
				{isOpen ? <IconX /> : <IconMessage />}
			</button>
		</div>
	);
};

const Footer = () => (
	<footer className="bg-white pt-20 pb-10 px-6 border-t border-[#F5EEDD]">
		<div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
			<div className="md:col-span-2">
				<div className="flex items-center gap-2 mb-6">
					<div className="w-10 h-10 rounded-full bg-[#16587B] flex items-center justify-center text-white font-bold text-xl">
						M
					</div>
					<span className="text-2xl font-extrabold text-[#16587B] tracking-tight">
						MadiunTrip<span className="text-[#84B3CE]">.</span>
					</span>
				</div>
				<p className="text-[#16587B]/70 max-w-sm mb-6 leading-relaxed">
					Platform penemuan wisata premium untuk mengeksplorasi keindahan alam,
					budaya, dan kuliner Kabupaten Madiun.
				</p>
			</div>
			<div>
				<h4 className="font-bold text-[#16587B] mb-6 text-lg">Eksplorasi</h4>
				<ul className="space-y-4 text-[#16587B]/70">
					<li>
						<a
							href="#destinasi"
							className="hover:text-[#84B3CE] transition-colors">
							Semua Destinasi
						</a>
					</li>
					<li>
						<a href="#peta" className="hover:text-[#84B3CE] transition-colors">
							Peta Wisata
						</a>
					</li>
					<li>
						<Link
							href="/scan"
							className="hover:text-[#84B3CE] transition-colors">
							Scan QR Code
						</Link>
					</li>
				</ul>
			</div>
			<div>
				<h4 className="font-bold text-[#16587B] mb-6 text-lg">Dukungan</h4>
				<ul className="space-y-4 text-[#16587B]/70">
					<li>
						<Link
							href="/login"
							className="hover:text-[#84B3CE] transition-colors">
							Ruang Petugas
						</Link>
					</li>
					<li>
						<Link
							href="/scan"
							className="hover:text-[#84B3CE] transition-colors">
							Panduan QR
						</Link>
					</li>
				</ul>
			</div>
		</div>
		<div className="max-w-7xl mx-auto pt-8 border-t border-[#F5EEDD] text-center md:text-left text-[#16587B]/50 text-sm flex flex-col md:flex-row justify-between items-center gap-4">
			<p>&copy; MadiunTrip. Hak Cipta Dilindungi.</p>
			<Link
				href="/scan"
				className="font-semibold text-[#16587B] hover:text-[#84B3CE]">
				Jelajahi dengan QR <IconArrowRight />
			</Link>
		</div>
	</footer>
);

export default function MadiunTripApp() {
	const [destinations, setDestinations] = useState<DestinationCard[]>([]);
	const [loadingDestinations, setLoadingDestinations] = useState(true);
	const [destinationError, setDestinationError] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedMood, setSelectedMood] = useState<number | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function loadDestinations() {
			try {
				const supabase = createClient();
				const { data, error } = await supabase
					.from("destinations")
					.select("*")
					.eq("is_published", true)
					.limit(12);

				if (cancelled) return;
				if (error) {
					setDestinationError(
						"Destinasi belum dapat dimuat. Periksa koneksi Supabase dan kebijakan akses publik.",
					);
					return;
				}

				const rows = (data ?? []) as unknown as DestinationRow[];
				const cards = rows
					.filter(
						(row) =>
							typeof row.id === "string" &&
							typeof row.slug === "string" &&
							typeof row.name === "string",
					)
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

	return (
		<>
			<GlobalStyles />
			<div className="min-h-screen relative selection:bg-[#84B3CE] selection:text-white">
				<Navbar />

				<main>
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
