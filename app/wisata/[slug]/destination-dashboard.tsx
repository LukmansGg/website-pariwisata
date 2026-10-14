"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import MinigameEngine from "./minigame-engine";
import NearbyCampaignPopup from "./nearby-campaign-popup";

type Destination = {
	id: string; slug: string; name: string; description: string;
	short_description?: string | null; category?: string | null; categories?: string[] | null;
	address?: string | null; latitude?: number | null; longitude?: number | null;
	image_url?: string | null; tags?: string[] | null; additional_minigames?: string[] | null;
};
type VisitorSession = { id: string; destination_id: string | null; started_at: string; expires_at: string; status: "active" | "expired" | "ended" };
type ChatMessage = { role: "user" | "model"; text: string; local?: boolean };

const MASCOT_FRAMES = ["/maskot/frame_0.png", "/maskot/frame_1.png", "/maskot/frame_2.png", "/maskot/frame_3.png", "/maskot/frame_4.png", "/maskot/frame_5.png"];
const QUICK_PROMPTS = ["Ceritakan daya tarik tempat ini", "Apa informasi yang tercatat?", "Di mana lokasinya?"];
const GREETINGS = [
	"Hai, {name}! Senang kamu mampir ke {destination}. Mau mulai dengan melihat daya tariknya?",
	"Halo, {name}! Selamat datang di {destination}. Aku siap menemani kamu menjelajah.",
	"Hai, {name}! Petualangan di {destination} dimulai. Ada yang ingin kamu ketahui?",
	"Selamat datang, {name}! Semoga betah di {destination}. Yuk, tanya apa saja tentang tempat ini.",
];
const GUIDE_ITEMS = [
	{ icon: "📷", title: "Scan QR di lokasi", text: "Pindai kode QR yang tersedia di spot wisata untuk membuka cerita dan informasi menarik." },
	{ icon: "🧭", title: "Tanya pemandu wisata", text: "Tanyakan lokasi, daya tarik, dan informasi yang tercatat. Jawaban pemandu bersumber dari data pengelola." },
	{ icon: "✨", title: "Selesaikan misi perjalanan", text: "Cari teman maskot atau gunakan photobox jika misi tersebut tersedia di destinasi ini." },
];

function MascotCrew({ group }: { group: "upper" | "lower" }) {
	const indexes = group === "upper" ? [0, 1, 2] : [3, 4, 5];
	return <div aria-label="Maskot MadiunTrip" className={"mascot-crew " + group}>{indexes.map((frame, index) => <div key={frame} className={"mascot-sprite mascot-sprite--" + index}><Image src={MASCOT_FRAMES[frame]} alt={index === 0 ? "Maskot pemandu MadiunTrip" : ""} aria-hidden={index > 0} fill sizes="200px" unoptimized className="object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /></div>)}</div>;
}

function MagicBackground({ dark }: { dark: boolean }) {
	return <div aria-hidden="true" className={"tourism-sky " + (dark ? "is-night" : "is-day")}>
		<div className="sky-pattern" /><div className="sky-glow sky-glow--one" /><div className="sky-glow sky-glow--two" />
		{Array.from({ length: 24 }, (_, index) => <span key={index} className="sky-star" style={{ top: ((index * 37 + 11) % 93) + "%", left: ((index * 61 + 7) % 97) + "%", fontSize: (10 + (index % 3) * 5) + "px", animationDelay: ((index % 7) * 0.42) + "s" }}>✦</span>)}
		{dark && <><span className="sky-moon" /><span className="sky-aurora" /></>}
	</div>;
}

function Icon({ name, className = "" }: { name: "back" | "sun" | "moon" | "pin" | "sound" | "book" | "send"; className?: string }) {
	const paths: Record<typeof name, ReactNode> = {
		back: <path d="m15 18-6-6 6-6M9 12h12" />,
		sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
		moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />,
		pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
		sound: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" /></>,
		book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20" /></>,
		send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
	};
	return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function DestinationDashboard({ destination, initialQrCode, initialGame }: { destination: Destination; initialQrCode?: string; initialGame?: string }) {
	const [dark, setDark] = useState(false);
	const [visitorName, setVisitorName] = useState("Teman");
	const [nameInput, setNameInput] = useState("");
	const [showNameModal, setShowNameModal] = useState(false);
	const [showGuideModal, setShowGuideModal] = useState(false);
	const [showSessionModal, setShowSessionModal] = useState(false);
	const [showMinigame, setShowMinigame] = useState(false);
	const [session, setSession] = useState<VisitorSession | null>(null);
	const [sessionLoading, setSessionLoading] = useState(true);
	const [sessionError, setSessionError] = useState("");
	const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
	const [message, setMessage] = useState("");
	const [isTyping, setIsTyping] = useState(false);
	const [chatError, setChatError] = useState("");
	const [isSpeaking, setIsSpeaking] = useState(false);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const chatStorageKey = "mt_tourism_chat_v1:" + destination.slug;
	const location = destination.address?.trim();
	const latitude = Number(destination.latitude);
	const longitude = Number(destination.longitude);
	const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
	const categories = destination.categories?.length ? destination.categories : destination.category ? [destination.category] : [];
	const tags = destination.tags ?? [];
	const configuredMinigames = destination.additional_minigames ?? [];
	const minigames = configuredMinigames.length ? configuredMinigames : ["photobox"];
	const routeGameEnabled = configuredMinigames.includes("find_friends");
	const sessionIsActive = session?.status === "active" && new Date(session.expires_at).getTime() > Date.now();
	useEffect(() => {
		if ((initialQrCode && routeGameEnabled) || initialGame === "photobox") setShowMinigame(true);
	}, [initialGame, initialQrCode, routeGameEnabled]);

	const startSession = useCallback(async () => {
		setSessionLoading(true);
		setSessionError("");
		try {
			const response = await fetch("/api/visitor-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinationSlug: destination.slug }) });
			const result = await response.json();
			if (!response.ok || !result.session) throw new Error(result.error || "Sesi pengunjung belum dapat dibuat.");
			setSession(result.session as VisitorSession);
			return true;
		} catch (error) {
			setSessionError(error instanceof Error ? error.message : "Sesi pengunjung belum dapat dibuat.");
			return false;
		} finally { setSessionLoading(false); }
	}, [destination.slug]);

	useEffect(() => {
		const savedName = sessionStorage.getItem("mt_visitor_name");
		if (savedName) setVisitorName(savedName);
		else if (!sessionStorage.getItem("mt_visitor_started")) setShowNameModal(true);
		const cachedChat = sessionStorage.getItem(chatStorageKey);
		let restored: ChatMessage[] | null = null;
		if (cachedChat) {
			try {
				const parsed: unknown = JSON.parse(cachedChat);
				if (Array.isArray(parsed) && parsed.length <= 14 && parsed.every((item) =>
					item && typeof item === "object" &&
					((item as ChatMessage).role === "user" || (item as ChatMessage).role === "model") &&
					typeof (item as ChatMessage).text === "string" &&
					(item as ChatMessage).text.length <= 1200
				)) restored = parsed as ChatMessage[];
			} catch { sessionStorage.removeItem(chatStorageKey); }
		}
		if (restored?.length) {
			setChatHistory(restored);
		} else {
			const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
				.replace("{name}", savedName || "Teman")
				.replace("{destination}", destination.name);
			const initialChat: ChatMessage[] = [{ role: "model", text: greeting, local: true }];
			setChatHistory(initialChat);
			sessionStorage.setItem(chatStorageKey, JSON.stringify(initialChat));
		}
		void startSession();
	}, [chatStorageKey, destination.name, startSession]);

	useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [chatHistory, isTyping]);
	useEffect(() => {
		if (!session || session.status !== "active") return;
		const remaining = new Date(session.expires_at).getTime() - Date.now();
		const timer = window.setTimeout(() => setShowSessionModal(true), Math.max(0, remaining - 60_000));
		return () => window.clearTimeout(timer);
	}, [session]);

	async function sendPrompt(prompt: string) {
		const question = prompt.trim();
		if (!question || isTyping) return;
		const normalized = question.toLocaleLowerCase("id");
		let localReply = "";
		if (normalized.includes("daya tarik")) {
			localReply = destination.short_description?.trim() || destination.description?.trim().slice(0, 480) || "Informasi daya tarik belum dicatat oleh pengelola.";
		} else if (normalized.includes("informasi yang tercatat")) {
			const facts = [
				categories.length ? "Kategori: " + categories.join(", ") : "",
				tags.length ? "Tag: " + tags.slice(0, 6).join(", ") : "",
				location ? "Lokasi: " + location : "",
				destination.short_description ? "Ringkasan: " + destination.short_description.slice(0, 220) : "",
			].filter(Boolean);
			localReply = facts.length ? facts.join("\n") : "Belum ada ringkasan tambahan yang dicatat pengelola.";
		} else if (normalized.includes("lokasinya")) {
			localReply = location || "Alamat belum dicatat oleh pengelola.";
			if (hasCoordinates) localReply += "\nKoordinat: " + latitude.toFixed(5) + ", " + longitude.toFixed(5);
		}
		const userTurn: ChatMessage = { role: "user", text: question, ...(localReply ? { local: true } : {}) };
		const nextHistory = [...chatHistory, userTurn].slice(-14);
		setChatHistory(nextHistory);
		setMessage("");
		setChatError("");
		if (localReply) {
			const updated = [...nextHistory, { role: "model" as const, text: localReply, local: true }].slice(-14);
			setChatHistory(updated);
			sessionStorage.setItem(chatStorageKey, JSON.stringify(updated));
			return;
		}
		sessionStorage.setItem(chatStorageKey, JSON.stringify(nextHistory));
		const history = chatHistory.filter((item) => !item.local).slice(-4).map(({ role, text }) => ({ role, text }));
		setIsTyping(true);
		try {
			const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinationSlug: destination.slug, message: question, history }) });
			const result = await response.json();
			if (!response.ok || typeof result.reply !== "string") throw new Error(result.error || "Jawaban belum tersedia.");
			const updated = [...nextHistory, { role: "model" as const, text: result.reply as string }].slice(-14);
			setChatHistory(updated);
			sessionStorage.setItem(chatStorageKey, JSON.stringify(updated));
		} catch (error) { setChatError(error instanceof Error ? error.message : "Pemandu belum dapat menjawab. Coba lagi."); }
		finally { setIsTyping(false); }
	}

	function submitChat(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void sendPrompt(message); }
	function commitJourney(name: string) {
		const cleanName = name.trim().slice(0, 32);
		if (cleanName) { setVisitorName(cleanName); sessionStorage.setItem("mt_visitor_name", cleanName); }
		else { setVisitorName("Teman"); sessionStorage.removeItem("mt_visitor_name"); }
		sessionStorage.setItem("mt_visitor_started", "1");
		setShowNameModal(false);
	}
	function startJourney(event: FormEvent<HTMLFormElement>) { event.preventDefault(); commitJourney(nameInput); }
	function skipName() { setNameInput(""); commitJourney(""); }
	function speakLastReply() {
		if (!("speechSynthesis" in window)) return;
		const latest = [...chatHistory].reverse().find((item) => item.role === "model")?.text;
		if (!latest) return;
		window.speechSynthesis.cancel();
		const utterance = new SpeechSynthesisUtterance(latest);
		utterance.lang = "id-ID"; utterance.rate = 1.02; utterance.pitch = 1.08;
		utterance.onstart = () => setIsSpeaking(true); utterance.onend = () => setIsSpeaking(false); utterance.onerror = () => setIsSpeaking(false);
		window.speechSynthesis.speak(utterance);
	}

	return <div className={"destination-shell " + (dark ? "destination-shell--night" : "")}>
		<style>{`
			.destination-shell{--ink:#16587B;--soft:rgba(22,88,123,.72);--accent:#84B3CE;--paper:#F5EEDD;min-height:100vh;position:relative;isolation:isolate;overflow:hidden;background:var(--paper);color:var(--ink);transition:background .5s,color .5s}
			.destination-shell--night{--ink:#F5EEDD;--soft:rgba(245,238,221,.72);--accent:#84B3CE;--paper:#102F43}
			.destination-shell--night [class*="text-[#16587B]"]{color:#F5EEDD!important}
			.destination-shell--night header{background:rgba(16,47,67,.82);border-color:rgba(132,179,206,.27)}
			.tourism-sky{position:absolute;inset:0;z-index:-2;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse at 12% 0%,rgba(132,179,206,.45),transparent 43%),radial-gradient(ellipse at 88% 35%,rgba(255,255,255,.65),transparent 42%),linear-gradient(145deg,#F5EEDD,#EAF3F4 56%,#D6E8EF)}
			.destination-shell--night .tourism-sky{background:radial-gradient(ellipse at 15% 15%,rgba(132,179,206,.24),transparent 40%),linear-gradient(145deg,#0D283A,#143C55 55%,#16587B)}
			.sky-pattern{position:absolute;inset:0;opacity:.4;background-image:radial-gradient(rgba(22,88,123,.13) 1px,transparent 1px);background-size:30px 30px;mask-image:linear-gradient(to bottom,black,transparent 85%)}
			.destination-shell--night .sky-pattern{opacity:.28;background-image:radial-gradient(rgba(245,238,221,.28) 1px,transparent 1px)}
			.sky-glow{position:absolute;width:25rem;height:25rem;border-radius:50%;filter:blur(72px);background:rgba(132,179,206,.33);animation:sky-drift 18s ease-in-out infinite alternate}
			.sky-glow--one{top:11%;left:-12rem}.sky-glow--two{right:-12rem;top:47%;animation-delay:-8s;background:rgba(132,179,206,.25)}
			.sky-star{position:absolute;color:#84B3CE;opacity:.52;animation:twinkle 3.5s ease-in-out infinite;text-shadow:0 0 12px rgba(132,179,206,.7)}
			.destination-shell--night .sky-star{color:#F5EEDD;opacity:.62}
			.sky-moon{position:absolute;right:10%;top:7%;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle at 34% 35%,#fff 0%,#F5EEDD 58%,rgba(132,179,206,.5) 75%,transparent 78%);filter:drop-shadow(0 0 38px rgba(245,238,221,.38))}
			.sky-aurora{position:absolute;top:-24%;left:-20%;width:140%;height:48%;background:linear-gradient(100deg,transparent,rgba(132,179,206,.16),rgba(245,238,221,.13),transparent);filter:blur(55px);transform:rotate(-9deg);animation:aurora 13s ease-in-out infinite alternate}
			.tourism-glass{background:linear-gradient(145deg,rgba(255,255,255,.88),rgba(255,255,255,.61));border:1px solid rgba(255,255,255,.86);box-shadow:0 24px 54px -30px rgba(22,88,123,.38),inset 0 1px rgba(255,255,255,.9);backdrop-filter:blur(20px);transition:transform .28s,box-shadow .28s}
			.destination-shell--night .tourism-glass{background:linear-gradient(145deg,rgba(22,68,94,.88),rgba(16,47,67,.8));border-color:rgba(132,179,206,.27);box-shadow:0 24px 54px -30px rgba(0,0,0,.55),inset 0 1px rgba(245,238,221,.09)}
			.mascot-crew{position:absolute;inset:0;pointer-events:none}.mascot-sprite{position:absolute;width:55%;height:100%;filter:drop-shadow(0 14px 16px rgba(22,88,123,.2));animation:mascot-float 4s ease-in-out infinite}.mascot-sprite img{width:100%;height:100%;object-fit:contain}
			.mascot-sprite--0{left:22%;top:0;z-index:2}.mascot-sprite--1{left:0;top:18%;transform:scale(.78);animation-delay:-1.2s;z-index:1}.mascot-sprite--2{right:0;top:17%;transform:scale(.74);animation-delay:-2.4s}
			.mascot-crew.lower .mascot-sprite{transform:scaleX(-1)}.mascot-crew.lower .mascot-sprite--0{left:22%;top:0;transform:scaleX(-1)}.mascot-crew.lower .mascot-sprite--1{left:0;top:17%;transform:scaleX(-1) scale(.78);animation-delay:-1.5s}.mascot-crew.lower .mascot-sprite--2{right:0;top:15%;transform:scaleX(-1) scale(.75);animation-delay:-2.8s}
			.tourism-chat-scroll::-webkit-scrollbar{width:6px}.tourism-chat-scroll::-webkit-scrollbar-thumb{background:rgba(132,179,206,.65);border-radius:99px}
			@keyframes mascot-float{0%,100%{translate:0 0}50%{translate:0 -9px}}@keyframes twinkle{0%,100%{opacity:.24;transform:scale(.8)}50%{opacity:.85;transform:scale(1.15)}}@keyframes sky-drift{to{transform:translate(42px,28px) scale(1.1)}}@keyframes aurora{to{transform:rotate(6deg) translateX(5%);opacity:.65}}
			@media(prefers-reduced-motion:reduce){.destination-shell *, .destination-shell *::before,.destination-shell *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
		`}</style>
		<MagicBackground dark={dark} />
		<header className="sticky top-0 z-30 border-b border-white/70 bg-white/65 px-4 py-3 shadow-sm backdrop-blur-2xl sm:px-6"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
			<div className="flex min-w-0 items-center gap-3"><Link href="/" aria-label="Kembali ke beranda" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#84B3CE]/40 bg-white/80 text-[#16587B] shadow-sm transition hover:-translate-x-0.5 hover:bg-white"><Icon name="back" className="h-5 w-5" /></Link><Link href="/" className="hidden text-lg font-black tracking-tight text-[#16587B] sm:block">Madiun<span className="text-[#84B3CE]">Trip</span></Link></div>
			<div className="flex items-center gap-2 sm:gap-3"><span className="hidden items-center gap-2 rounded-full border border-[#84B3CE]/45 bg-[#F5EEDD]/85 px-4 py-2 text-[10px] font-black uppercase tracking-[.16em] text-[#16587B] sm:flex"><span className={"h-2 w-2 rounded-full " + (sessionIsActive ? "bg-[#84B3CE] shadow-[0_0_10px_#84B3CE]" : "bg-[#16587B]/35")} />Perjalanan {visitorName}</span><button type="button" onClick={() => setDark((value) => !value)} aria-label={dark ? "Gunakan tema terang" : "Gunakan tema malam"} className="grid h-10 w-10 place-items-center rounded-full border border-[#84B3CE]/35 bg-white/85 text-[#16587B] shadow-sm transition hover:rotate-6 hover:scale-105"><Icon name={dark ? "sun" : "moon"} className="h-5 w-5" /></button></div>
		</div></header>

		<main className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-7 sm:px-6 sm:pt-10">
			<div className="mb-6 flex w-max items-center gap-2 rounded-full border border-[#84B3CE]/45 bg-white/65 px-4 py-2 text-[10px] font-black uppercase tracking-[.16em] text-[#16587B] shadow-sm sm:hidden"><span className={"h-2 w-2 rounded-full " + (sessionIsActive ? "bg-[#84B3CE]" : "bg-[#16587B]/35")} />Perjalanan {visitorName}</div>
			<div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
				<section className="flex flex-col gap-6 lg:col-span-7" aria-label="Informasi destinasi">
					<div className="group relative isolate aspect-[4/3] overflow-hidden rounded-[2rem] border-[5px] border-white/90 bg-[#84B3CE]/25 shadow-[0_22px_55px_-22px_rgba(22,88,123,.48)] sm:aspect-[16/9] sm:rounded-[2.6rem]">
						{destination.image_url && <Image src={destination.image_url} alt={"Pemandangan " + destination.name} fill priority unoptimized sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover transition duration-700 group-hover:scale-[1.04]" />}
						<div className="absolute inset-0 bg-gradient-to-t from-[#102F43]/60 via-transparent to-transparent" />
						{categories.length > 0 && <div className="absolute left-5 top-5 flex flex-wrap gap-2">{categories.map((category) => <span key={category} className="rounded-full border border-white/75 bg-white/90 px-4 py-2 text-[10px] font-black uppercase tracking-[.14em] text-[#16587B] shadow-lg backdrop-blur">{category}</span>)}</div>}
						<div className="absolute bottom-5 left-5 right-5 text-white sm:bottom-7 sm:left-7"><p className="mb-1 text-[10px] font-black uppercase tracking-[.22em] text-white/80">DESTINASI PILIHAN</p><p className="text-2xl font-black leading-tight drop-shadow-md sm:text-4xl">{destination.name}</p></div>
					</div>
					<div className="tourism-glass rounded-[2rem] p-6 sm:rounded-[2.5rem] sm:p-9">
						<p className="mb-3 text-[10px] font-black uppercase tracking-[.2em] text-[#16587B]/65">KENALI DESTINASI</p><h1 className="text-3xl font-black leading-tight tracking-tight text-[#16587B] sm:text-5xl">{destination.name}</h1>
						{tags.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="rounded-xl border border-[#84B3CE]/50 bg-[#84B3CE]/15 px-3.5 py-1.5 text-xs font-bold text-[#16587B]">#{tag}</span>)}</div>}
						<p className="mt-6 text-base font-medium leading-8 text-[#16587B]/80">{destination.description || destination.short_description || "Temukan pesona destinasi ini dan nikmati pengalaman baru di Madiun."}</p>
						<div className="mt-7 flex items-start gap-4 rounded-3xl border border-[#84B3CE]/45 bg-white/60 p-4 shadow-inner sm:p-5"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#16587B] text-white shadow-lg shadow-[#16587B]/20"><Icon name="pin" className="h-6 w-6" /></span>
							<div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#16587B]/65">LOKASI TERCATAT</p><p className="mt-1 font-bold leading-6 text-[#16587B]">{location || "Lokasi akan diperbarui oleh pengelola."}</p>
								{hasCoordinates && <p className="mt-2 inline-flex rounded-lg border border-[#84B3CE]/35 bg-[#F5EEDD]/75 px-2.5 py-1 font-mono text-xs text-[#16587B]/75">{latitude.toFixed(5)}, {longitude.toFixed(5)}</p>}
								{hasCoordinates && <a href={"https://www.google.com/maps/search/?api=1&query=" + latitude + "," + longitude} target="_blank" rel="noreferrer" className="mt-3 block w-fit text-xs font-extrabold text-[#16587B] underline decoration-[#84B3CE] decoration-2 underline-offset-4">Buka petunjuk arah ↗</a>}
							</div>
						</div>
					</div>
						{minigames.some((game) => game === "find_friends" || game === "photobox") && <section className="relative overflow-hidden rounded-[2rem] bg-[#16587B] p-6 text-white shadow-[0_22px_50px_-20px_rgba(22,88,123,.65)] sm:rounded-[2.5rem] sm:p-9" aria-labelledby="mission-title"><div aria-hidden="true" className="absolute -right-12 -top-20 h-64 w-64 rounded-full border border-white/20" /><div aria-hidden="true" className="absolute bottom-0 right-12 h-32 w-32 rounded-full bg-[#84B3CE]/30 blur-3xl" />
						<div className="relative z-10 flex items-center justify-between gap-3"><span className="rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-[.18em]">MISI PERJALANAN</span><span className="text-xs font-bold text-white/75">{minigames.length} misi tersedia</span></div>
						<h2 id="mission-title" className="relative z-10 mt-5 text-3xl font-black sm:text-4xl">{minigames.includes("find_friends") ? "Find Our Friends! 🦊" : "Misi Seru Menantimu! ✨"}</h2>
						<p className="relative z-10 mt-3 max-w-lg leading-7 text-white/80">{minigames.includes("find_friends") ? "Beberapa teman maskot bersembunyi di sekitar sini. Temukan mereka sambil menjelajahi spot wisata!" : "Abadikan momen dan jelajahi tantangan pilihan pengelola di destinasi ini."}</p>
						<div className="relative z-10 mt-5 flex flex-wrap gap-2">{minigames.map((game) => <span key={game} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">{game === "find_friends" ? "🦊 Cari teman maskot" : game === "photobox" ? "📸 Photobox" : game}</span>)}</div>
						<button type="button" onClick={() => setShowMinigame(true)} className="relative z-10 mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#F5EEDD] px-6 py-3 font-black text-[#16587B] shadow-lg transition hover:-translate-y-0.5 hover:bg-white">Buka Papan Petualangan <span className="ml-2">→</span></button>
					</section>}
				</section>

				<aside className="relative mt-16 lg:col-span-5 lg:mt-16" aria-label="Pemandu AI"><div className="pointer-events-none absolute -top-24 right-3 z-0 h-36 w-52 sm:-top-32 sm:right-4 sm:h-48 sm:w-64"><MascotCrew group="upper" /></div>
					<section className="tourism-glass relative z-10 flex min-h-[650px] flex-col rounded-[2rem] p-5 pt-14 sm:rounded-[2.5rem] sm:p-7 sm:pt-16" aria-labelledby="guide-chat-title">
						<div className="mb-4 flex items-center justify-between gap-3 border-b border-[#84B3CE]/35 pb-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#16587B] text-xl text-white shadow-lg">✦</span><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-[#16587B]/65">PEMANDU AI</p><h2 id="guide-chat-title" className="mt-0.5 text-lg font-black text-[#16587B] sm:text-xl">MadiunTrip Guide</h2></div></div>
							<button type="button" onClick={speakLastReply} aria-label={isSpeaking ? "Sedang membacakan jawaban" : "Dengarkan jawaban terakhir"} title="Dengarkan jawaban terakhir" className={"grid h-10 w-10 shrink-0 place-items-center rounded-2xl border transition " + (isSpeaking ? "border-[#16587B] bg-[#16587B] text-white" : "border-[#84B3CE]/40 bg-white/80 text-[#16587B] hover:bg-[#84B3CE]/20")}><Icon name="sound" className="h-5 w-5" /></button>
						</div>
						<p className="mb-4 text-xs leading-5 text-[#16587B]/70">Tanyakan apa saja tentang <strong>{destination.name}</strong>. Jawaban merujuk pada informasi dari pengelola.</p>
						<div aria-live="polite" aria-relevant="additions" className="tourism-chat-scroll flex-1 space-y-4 overflow-y-auto pr-1">
							{chatHistory.map((item, index) => <div key={index} className={"flex flex-col " + (item.role === "user" ? "items-end" : "items-start")}><div className={"max-w-[88%] rounded-3xl px-4 py-3 text-sm font-medium leading-6 " + (item.role === "user" ? "rounded-br-md bg-[#16587B] text-white shadow-lg shadow-[#16587B]/15" : "rounded-bl-md border border-[#84B3CE]/30 bg-white/85 text-[#16587B] shadow-sm")}>{item.text}</div>{item.role === "model" && index === chatHistory.length - 1 && <span className="mt-1.5 px-2 text-[9px] font-bold uppercase tracking-wider text-[#16587B]/55">ⓘ Berdasarkan data pengelola</span>}</div>)}
							{isTyping && <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-md border border-[#84B3CE]/30 bg-white/85 px-4 py-4"><span className="h-2 w-2 animate-bounce rounded-full bg-[#16587B]" /><span className="h-2 w-2 animate-bounce rounded-full bg-[#84B3CE] [animation-delay:120ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-[#16587B] [animation-delay:240ms]" /><span className="ml-2 text-xs text-[#16587B]/65">Pemandu sedang berpikir…</span></div>}<div ref={chatEndRef} />
						</div>
						{chatError && <p role="alert" className="mt-3 rounded-xl border border-[#84B3CE]/40 bg-[#F5EEDD] px-3 py-2 text-xs font-semibold leading-5 text-[#16587B]">{chatError}</p>}
						<div className="mt-4 border-t border-[#84B3CE]/35 pt-4"><p className="mb-3 text-center text-[9px] font-black uppercase tracking-[.16em] text-[#16587B]/65">TANYA AKU SOAL TEMPAT INI</p><div className="flex flex-wrap justify-center gap-2">{QUICK_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => void sendPrompt(prompt)} disabled={isTyping} className="rounded-2xl border border-[#84B3CE]/50 bg-white/75 px-3 py-2 text-[11px] font-bold text-[#16587B] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#84B3CE]/20 disabled:opacity-50">{prompt}</button>)}</div>
							<form onSubmit={submitChat} className="mt-3 flex gap-2 rounded-2xl border border-[#84B3CE]/50 bg-white/75 p-1.5 focus-within:border-[#16587B] focus-within:ring-2 focus-within:ring-[#84B3CE]/30"><label htmlFor="tourism-chat-input" className="sr-only">Tulis pertanyaan untuk pemandu</label><input id="tourism-chat-input" value={message} onChange={(event) => setMessage(event.currentTarget.value.slice(0, 600))} maxLength={600} disabled={isTyping} placeholder="Tulis pertanyaan…" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#16587B] outline-none placeholder:text-[#16587B]/45 disabled:opacity-60" /><button type="submit" disabled={isTyping || !message.trim()} aria-label="Kirim pertanyaan" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#16587B] text-white transition hover:bg-[#10445f] disabled:opacity-45"><Icon name="send" className="h-4 w-4" /></button></form>
							<p className="mt-1.5 text-right text-[10px] tabular-nums text-[#16587B]/50">{message.length} / 600</p>
						</div>
					</section>
				</aside>
			</div>

			<section className="tourism-glass relative mt-14 flex flex-col items-center gap-5 overflow-hidden rounded-[2rem] p-6 sm:mt-20 sm:flex-row sm:gap-8 sm:rounded-[2.5rem] sm:p-9" aria-labelledby="explore-title"><div aria-hidden="true" className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-[#84B3CE]/20 blur-3xl" />
				<div className="relative h-36 w-52 shrink-0 sm:h-44 sm:w-60"><MascotCrew group="lower" /></div><div className="relative z-10 flex-1 text-center sm:text-left"><h2 id="explore-title" className="text-2xl font-black text-[#16587B] sm:text-3xl">Jelajahi MadiunTrip!</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#16587B]/75 sm:mx-0 sm:text-base">Temukan pesona wisata lokal bersama pemandu cerdas kami. Pindai QR di spot menarik untuk menyambung petualanganmu.</p>
					<div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start"><button type="button" onClick={() => setShowGuideModal(true)} className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#84B3CE]/50 bg-white/70 px-4 py-2.5 font-bold text-[#16587B] shadow-sm transition hover:-translate-y-0.5 hover:bg-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#84B3CE]/20"><Icon name="book" className="h-5 w-5" /></span>Panduan Wisata</button><button type="button" onClick={() => setShowSessionModal(true)} className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#84B3CE]/50 bg-[#84B3CE]/15 px-4 py-2.5 font-bold text-[#16587B] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#84B3CE]/25"><span className="relative grid h-9 w-9 place-items-center rounded-xl bg-[#16587B] text-lg text-white"><span className={"absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-[#F5EEDD] " + (sessionIsActive ? "bg-[#84B3CE]" : "bg-[#84B3CE]/45")} />◉</span>Status Sesi</button></div>
				</div>
			</section>
			<footer className="pb-5 pt-7 text-center text-xs font-semibold text-[#16587B]/55">© MadiunTrip · Jelajah dengan nyaman, simpan kenangan indah.</footer>
		</main>

		{showNameModal && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#102F43]/55 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="tourism-glass relative my-auto w-full max-w-md overflow-hidden rounded-[2.5rem] border-2 border-white/80 p-7 text-center shadow-2xl sm:p-9"><div aria-hidden="true" className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#84B3CE]/30 blur-3xl" /><div className="relative mx-auto mb-3 h-36 w-52"><MascotCrew group="upper" /></div>
			<h2 id="welcome-title" className="relative text-3xl font-black text-[#16587B]">Halo, Teman! 👋</h2><p className="relative mt-3 text-sm leading-6 text-[#16587B]/75">Sebelum jalan-jalan di <strong>{destination.name}</strong>, mau pakai nama panggilan?</p>
			<form onSubmit={startJourney} className="relative mt-6"><label htmlFor="visitor-name" className="mb-2 block text-left text-xs font-extrabold text-[#16587B]">Nama panggilan <span className="font-medium text-[#16587B]/55">(opsional)</span></label><input id="visitor-name" type="text" value={nameInput} onChange={(event) => setNameInput(event.currentTarget.value.slice(0, 32))} maxLength={32} placeholder="mis. Kelinci Ceria" autoComplete="nickname" className="mb-4 min-h-12 w-full rounded-2xl border-2 border-[#84B3CE]/40 bg-white/85 px-4 text-center font-bold text-[#16587B] outline-none transition placeholder:font-medium placeholder:text-[#16587B]/40 focus:border-[#16587B] focus:ring-4 focus:ring-[#84B3CE]/20" /><button type="submit" className="min-h-13 w-full rounded-2xl bg-[#16587B] px-5 py-3.5 text-base font-black text-white shadow-lg shadow-[#16587B]/25 transition hover:-translate-y-0.5 hover:bg-[#10445f]">Mulai Perjalanan ✨</button><button type="button" onClick={skipName} className="mt-3 min-h-11 w-full rounded-2xl px-4 text-sm font-bold text-[#16587B]/75 transition hover:bg-[#84B3CE]/15">Lewati, lanjut sebagai Teman</button></form>
		</section></div>}

		{showSessionModal && <div className="fixed inset-0 z-50 grid place-items-center bg-[#102F43]/55 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="session-title" className="tourism-glass w-full max-w-md rounded-[2.5rem] p-7 text-center shadow-2xl sm:p-9">
			<div className="mb-4 text-5xl" aria-hidden="true">{sessionLoading ? "⏳" : sessionIsActive ? "✨" : "🧭"}</div><h2 id="session-title" className="text-2xl font-black text-[#16587B]">{sessionLoading ? "Memeriksa sesi…" : sessionIsActive ? "Perjalananmu masih aktif" : "Sesi perjalanan selesai"}</h2><p className="mt-3 text-sm leading-6 text-[#16587B]/75">{sessionError || (sessionIsActive ? "Kamu bisa terus menjelajahi destinasi dan bertanya kepada pemandu." : "Mulai lagi untuk memperbarui sesi dan melanjutkan petualangan.")}</p>
			{session && <div className="mt-5 rounded-2xl border border-[#84B3CE]/35 bg-white/65 p-4 text-left text-xs text-[#16587B]"><p><strong>Status:</strong> {session.status === "active" && !sessionIsActive ? "segera berakhir" : session.status}</p><p className="mt-1"><strong>Berakhir:</strong> {new Date(session.expires_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p></div>}
			<div className="mt-6 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => setShowSessionModal(false)} className="min-h-12 flex-1 rounded-2xl border border-[#84B3CE]/45 bg-white/70 px-4 font-bold text-[#16587B] hover:bg-white">Kembali menjelajah</button><button type="button" onClick={() => { void startSession().then((success) => { if (success) setShowSessionModal(false); }); }} disabled={sessionLoading} className="min-h-12 flex-1 rounded-2xl bg-[#16587B] px-4 font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{sessionIsActive ? "Perbarui sesi" : "Lanjutkan perjalanan"}</button></div>
		</section></div>}

		{showGuideModal && <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#102F43]/60 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="guide-title" className="tourism-glass relative my-auto w-full max-w-2xl overflow-hidden rounded-[2.5rem] p-6 shadow-2xl sm:p-9">
			<div className="flex items-center gap-4 border-b border-[#84B3CE]/35 pb-5"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#16587B] text-white shadow-lg"><Icon name="book" className="h-6 w-6" /></span><div><h2 id="guide-title" className="text-2xl font-black text-[#16587B]">Panduan Wisata</h2><p className="mt-1 text-[10px] font-black uppercase tracking-[.16em] text-[#16587B]/60">Tips dan cara bermain</p></div><button type="button" onClick={() => setShowGuideModal(false)} aria-label="Tutup panduan" className="ml-auto grid h-10 w-10 place-items-center rounded-full text-2xl text-[#16587B] hover:bg-[#84B3CE]/20">×</button></div>
			<div className="mt-5 max-h-[55vh] space-y-3 overflow-y-auto pr-1">{GUIDE_ITEMS.map((item, index) => <article key={item.title} className="rounded-2xl border border-[#84B3CE]/30 bg-white/65 p-4 transition hover:-translate-y-0.5"><h3 className="flex items-center gap-2 font-extrabold text-[#16587B]"><span className="text-xl">{item.icon}</span>{index + 1}. {item.title}</h3><p className="mt-2 text-sm leading-6 text-[#16587B]/75">{item.text}</p></article>)}</div>
			<button type="button" onClick={() => setShowGuideModal(false)} className="mt-5 min-h-12 w-full rounded-2xl bg-[#16587B] px-5 font-black text-white shadow-lg transition hover:-translate-y-0.5">Tutup Panduan</button>
		</section></div>}
		{showMinigame && !sessionLoading && <MinigameEngine destinationSlug={destination.slug} destinationName={destination.name} destinationDescription={destination.short_description || destination.description} destinationAddress={destination.address} destinationTags={tags} games={minigames.filter((game) => game === "find_friends" || game === "photobox")} initialQrCode={initialQrCode} initialGame={initialGame === "photobox" ? "photobox" : undefined} onClose={() => setShowMinigame(false)} />}
		<NearbyCampaignPopup destinationSlug={destination.slug} active={Boolean(sessionIsActive && !showNameModal && !showGuideModal && !showSessionModal)} />
	</div>;
}
