"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTheme } from "@/src/components/theme-provider";
import MinigameHub from "./minigame-hub";
import NearbyCampaignPopup from "./nearby-campaign-popup";

type Destination = {
	id: string; slug: string; name: string; description: string;
	short_description?: string | null; category?: string | null; categories?: string[] | null;
	address?: string | null; latitude?: number | null; longitude?: number | null;
	image_url?: string | null; tags?: string[] | null; mascot_mode?: "tiloc" | "custom"; mascot_image_url?: string | null;
};
type VisitorSession = { id: string; destination_id: string | null; started_at: string; expires_at: string; status: "active" | "expired" | "ended" };
type ChatSource = { title: string; url: string; language?: "id" | "en" };
type ChatMessage = { role: "user" | "model"; text: string; local?: boolean; sources?: ChatSource[]; wikipediaUsed?: boolean };

function renderLinkedAnswer(text: string): ReactNode {
	const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
	return parts.map((part, index) => {
		const match = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
		if (!match) return part;
		return <a key={index} href={match[2]} target="_blank" rel="noreferrer noopener" className="font-bold text-[#16587B] underline decoration-[#84B3CE] underline-offset-2">{match[1]}</a>;
	});
}

const MASCOT_FRAMES = Array.from({ length: 6 }, (_, index) => `/maskot/frame_${index}.png`);
const QUICK_PROMPTS = ["Ceritakan daya tarik tempat ini", "Beri ide aktivitas di sini", "Bantu susun rencana kunjungan"];
const GREETINGS = [
	"Hai, {name}! Senang kamu mampir ke {destination}. Mau mulai dengan melihat daya tariknya?",
	"Halo, {name}! Selamat datang di {destination}. Aku siap menemani kamu menjelajah.",
	"Hai, {name}! Petualangan di {destination} dimulai. Ada yang ingin kamu ketahui?",
	"Selamat datang, {name}! Semoga betah di {destination}. Yuk, tanya apa saja tentang tempat ini.",
];
const GUIDE_ITEMS = [
	{ icon: "💬", title: "Tanya TiLoc Guide", text: "Minta cerita singkat, ide kegiatan, atau tips berkunjung." },
	{ icon: "📍", title: "Temukan titik QR", text: "Scan QR di lokasi untuk mencatat kunjungan dan membuka progres misi." },
	{ icon: "📸", title: "Buat kenangan", text: "Mainkan Photobox jika tersedia. Beberapa program membukanya setelah misi selesai." },
];

function getDestinationSummary(value: string | null | undefined) {
	const description = value?.replace(/\s+/g, " ").trim();
	if (!description) return "Temukan pesona destinasi ini dan nikmati pengalaman baru di Madiun.";
	const maxLength = 280;
	const sentenceEnds = [...description.matchAll(/[.!?](?=\s|$)/g)].map((match) => match.index!);
	const firstFewSentences = sentenceEnds[1] === undefined ? description : description.slice(0, sentenceEnds[1] + 1);
	if (firstFewSentences.length <= maxLength) return firstFewSentences;

	const lastSentenceEnd = Math.max(firstFewSentences.lastIndexOf(".", maxLength), firstFewSentences.lastIndexOf("!", maxLength), firstFewSentences.lastIndexOf("?", maxLength));
	if (lastSentenceEnd >= 0) return firstFewSentences.slice(0, lastSentenceEnd + 1).trim();

	const nextSentenceEnd = Math.min(...[".", "!", "?"].map((mark) => {
		const index = firstFewSentences.indexOf(mark, maxLength);
		return index < 0 ? Number.POSITIVE_INFINITY : index;
	}));
	if (Number.isFinite(nextSentenceEnd)) return firstFewSentences.slice(0, nextSentenceEnd + 1).trim();

	const excerpt = firstFewSentences.slice(0, maxLength);
	const lastSpace = excerpt.lastIndexOf(" ");
	return excerpt.slice(0, lastSpace > 0 ? lastSpace : maxLength).trimEnd() + "…";
}

function MascotCrew({ group, imageUrl }: { group: "upper" | "lower"; imageUrl?: string | null }) {
	const [frameIndex, setFrameIndex] = useState(0);
	const firstFrame = group === "upper" ? 0 : 3;
	useEffect(() => {
		if (imageUrl || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		for (let index = firstFrame; index < firstFrame + 3; index += 1) {
			const preload = new window.Image();
			preload.src = MASCOT_FRAMES[index];
		}
		const interval = window.setInterval(() => setFrameIndex((current) => (current + 1) % 3), 2600);
		return () => window.clearInterval(interval);
	}, [firstFrame, group, imageUrl]);
	const src = imageUrl || MASCOT_FRAMES[firstFrame + frameIndex];
	return <div role="img" aria-label="Maskot pemandu TiLoc" className={`mascot-crew ${group}`}><Image key={src} src={src} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 208px, 256px" unoptimized className="object-contain" onError={(event) => { if (imageUrl) event.currentTarget.src = MASCOT_FRAMES[firstFrame]; }} /></div>;
}

function MagicBackground({ dark }: { dark: boolean }) {
	const stars = Array.from({ length: 40 }, (_, index) => {
		const random = (seed: number) => { const value = Math.sin((index + seed) * 127.1) * 43758.5453; return value - Math.floor(value); };
		const column = index % 8;
		const row = Math.floor(index / 8);
		return { left: ((column + .12 + random(7) * .76) / 8) * 100, top: ((row + .1 + random(23) * .8) / 5) * 100, size: index % 8 === 0 ? 22 : 13 + Math.round(random(41) * 8), delay: (index % 9) * .38 };
	});
	return <div aria-hidden="true" className={"tourism-sky " + (dark ? "is-night" : "is-day")}>
		<div className="sky-pattern" /><div className="sky-glow sky-glow--one" /><div className="sky-glow sky-glow--two" />
		{stars.map((star, index) => <span key={index} className={`sky-star${index % 8 === 0 ? " is-flare" : ""}`} style={{ top: `${star.top}%`, left: `${star.left}%`, fontSize: `${star.size}px`, animationDelay: `${star.delay}s` }}>✦</span>)}
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

function BrandMark() {
	return <svg aria-hidden="true" viewBox="0 0 48 48" className="h-10 w-10 shrink-0 drop-shadow-sm">
		<defs><linearGradient id="tiloc-mark-fill" x1="8" y1="7" x2="39" y2="42" gradientUnits="userSpaceOnUse"><stop stopColor="#4BB8E5"/><stop offset="1" stopColor="#16587B"/></linearGradient></defs>
		<path d="M24 44S7 29.1 7 18.7a17 17 0 1 1 34 0C41 29.1 24 44 24 44Z" fill="url(#tiloc-mark-fill)"/>
		<circle cx="24" cy="18.5" r="9.6" fill="#F5EEDD"/>
		<path d="m24 11.8 1.85 4.75 5.1.23-3.95 3.23 1.35 4.92L24 22.15l-4.35 2.78L21 20.01l-3.95-3.23 5.1-.23L24 11.8Z" fill="#F3B94D"/>
		<path d="m38.5 4 .9 2.25 2.35.1-1.8 1.45.6 2.25-2.05-1.25-2 1.25.6-2.25-1.8-1.45 2.3-.1.9-2.25Z" fill="#F3B94D"/>
	</svg>;
}

export default function DestinationDashboard({ destination, initialQrCode, initialQrSource = "qr_link", chatAiEnabled = true }: { destination: Destination; initialQrCode?: string; initialQrSource?: "qr_link" | "camera"; chatAiEnabled?: boolean }) {
	const { isDark: dark, toggleTheme } = useTheme();
	const [visitorName, setVisitorName] = useState("Teman");
	const [nameInput, setNameInput] = useState("");
	const [showNameModal, setShowNameModal] = useState(false);
	const [showGuideModal, setShowGuideModal] = useState(false);
	const [showSessionModal, setShowSessionModal] = useState(false);
	const [session, setSession] = useState<VisitorSession | null>(null);
	const [sessionLoading, setSessionLoading] = useState(true);
	const [sessionError, setSessionError] = useState("");
	const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
	const [message, setMessage] = useState("");
	const [isTyping, setIsTyping] = useState(false);
	const [chatError, setChatError] = useState("");
	const [aiStatus, setAiStatus] = useState("");
	const [streamingReply, setStreamingReply] = useState("");
	const [isSpeaking, setIsSpeaking] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const chatAbortRef = useRef<AbortController | null>(null);
	const chatAbortReasonRef = useRef<"manual" | "timeout" | null>(null);
	const chatStorageKey = "mt_tourism_chat_v1:" + destination.slug;
	const location = destination.address?.trim();
	const latitude = Number(destination.latitude);
	const longitude = Number(destination.longitude);
	const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
	const categories = destination.categories?.length ? destination.categories : destination.category ? [destination.category] : [];
	const tags = destination.tags ?? [];
	const sessionIsActive = session?.status === "active" && (currentTime === 0 || new Date(session.expires_at).getTime() > currentTime);

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
		const frame = window.requestAnimationFrame(() => setCurrentTime(Date.now()));
		const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
		return () => {
			window.cancelAnimationFrame(frame);
			window.clearInterval(timer);
		};
	}, []);

	useEffect(() => {
		const hydrationTimer = window.setTimeout(() => {
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
		}, 0);
		return () => window.clearTimeout(hydrationTimer);
	}, [chatStorageKey, destination.name, startSession]);

	useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [chatHistory, isTyping, streamingReply, aiStatus]);
	useEffect(() => {
		if (!session || session.status !== "active") return;
		const remaining = new Date(session.expires_at).getTime() - Date.now();
		const timer = window.setTimeout(() => setShowSessionModal(true), Math.max(0, remaining - 60_000));
		return () => window.clearTimeout(timer);
	}, [session]);
	useEffect(() => {
		const heartbeat = () => {
			if (document.visibilityState === "visible") void startSession();
		};
		const timer = window.setInterval(heartbeat, 120_000);
		document.addEventListener("visibilitychange", heartbeat);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", heartbeat);
		};
	}, [startSession]);

	async function sendPrompt(prompt: string) {
		const question = prompt.trim();
		if (!question || isTyping) return;
		const userTurn: ChatMessage = { role: "user", text: question };
		const nextHistory = [...chatHistory, userTurn].slice(-14);
		setChatHistory(nextHistory);
		setMessage("");
		setChatError("");
		setAiStatus("Membaca info destinasi…");
		setStreamingReply("");
		sessionStorage.setItem(chatStorageKey, JSON.stringify(nextHistory));
		const controller = new AbortController();
		chatAbortRef.current = controller;
		chatAbortReasonRef.current = null;
		let timeoutFired = false;
		let timeoutId: number | undefined;
		let answer = "";
		let answerSources: ChatSource[] = [];
		let wikipediaUsed = false;
		setIsTyping(true);
		try {
			timeoutId = window.setTimeout(() => {
				timeoutFired = true;
				chatAbortReasonRef.current = "timeout";
				controller.abort();
			}, 50_000);
			const response = await fetch("/api/ai/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ destinationSlug: destination.slug, message: question }),
				signal: controller.signal,
			});
			const contentType = response.headers.get("content-type") ?? "";
			if (!response.ok || !contentType.includes("text/event-stream")) {
				const result = await response.json().catch(() => ({}));
				throw new Error(typeof result.error === "string" ? result.error : "Pemandu belum berhasil terhubung.");
			}
			if (!response.body) throw new Error("Koneksi jawaban tidak dapat dibaca.");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			const handleBlock = (block: string) => {
				let eventName = "message";
				const dataLines: string[] = [];
				for (const line of block.split(/\r?\n/)) {
					if (line.startsWith("event:")) eventName = line.slice(6).trim();
					if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
				}
				if (dataLines.length === 0) return;
				let payload: Record<string, unknown>;
				try {
					payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
				} catch {
					return;
				}
				if (eventName === "status" && typeof payload.message === "string") {
					setAiStatus(payload.message);
				} else if (eventName === "token" && typeof payload.text === "string") {
					answer += payload.text;
					setStreamingReply(answer);
					setAiStatus("Menulis jawaban untukmu…");
				} else if (eventName === "done") {
					wikipediaUsed = payload.wikipediaSearched === true;
					answerSources = Array.isArray(payload.sources) ? payload.sources.filter((source): source is ChatSource => {
						if (!source || typeof source !== "object") return false;
						const item = source as Record<string, unknown>;
						return typeof item.title === "string" && typeof item.url === "string" && item.url.startsWith("https://");
					}) : [];
				} else if (eventName === "error") {
					throw new Error(typeof payload.message === "string" ? payload.message : "Pemandu belum berhasil terhubung.");
				}
			};

			try {
				let streamEnded = false;
				while (!streamEnded) {
					const { done, value } = await reader.read();
					if (done) {
						streamEnded = true;
						break;
					}
					buffer += decoder.decode(value, { stream: true });
					const blocks = buffer.split(/\r?\n\r?\n/);
					buffer = blocks.pop() ?? "";
					for (const block of blocks) handleBlock(block);
				}
				buffer += decoder.decode();
				if (buffer.trim()) handleBlock(buffer);
			} finally {
				reader.releaseLock();
			}
			if (!answer.trim()) throw new Error("Pemandu belum menghasilkan jawaban. Coba lagi sebentar ya.");
			const assistantTurn: ChatMessage = { role: "model", text: answer.trim(), sources: answerSources, wikipediaUsed };
			const updated = [...nextHistory, assistantTurn].slice(-14);
			setChatHistory(updated);
			sessionStorage.setItem(chatStorageKey, JSON.stringify(updated));
		} catch (error) {
			if (answer.trim()) {
				const partialTurn: ChatMessage = { role: "model", text: answer.trim(), sources: answerSources, wikipediaUsed };
				const updated = [...nextHistory, partialTurn].slice(-14);
				setChatHistory(updated);
				sessionStorage.setItem(chatStorageKey, JSON.stringify(updated));
			}
			if (controller.signal.aborted) {
				setChatError(chatAbortReasonRef.current === "manual" ? "Permintaan dihentikan. Kamu bisa bertanya lagi kapan saja." : timeoutFired ? "Waktu tunggu habis. Coba kirim ulang pertanyaanmu ya." : "");
			} else {
				setChatError(error instanceof Error ? error.message : "Pemandu belum dapat menjawab. Coba lagi.");
			}
		} finally {
			if (timeoutId !== undefined) window.clearTimeout(timeoutId);
			chatAbortRef.current = null;
			setIsTyping(false);
			setAiStatus("");
			setStreamingReply("");
		}
	}
	function stopChatRequest() {
		if (!chatAbortRef.current) return;
		chatAbortReasonRef.current = "manual";
		chatAbortRef.current.abort();
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
			.destination-shell{--ink:#16587B;--soft:rgba(22,88,123,.72);--accent:#66bde8;--paper:#EAF6FC;min-height:100vh;position:relative;isolation:isolate;overflow:hidden;background:var(--paper);color:var(--ink);transition:background .5s,color .5s}
			.destination-shell--night{--ink:#EAF6FF;--soft:rgba(234,246,255,.74);--accent:#8bd9ff;--paper:#06172A}
			.destination-shell--night [class*="text-[#16587B]"]{color:#EAF6FF!important}
			.destination-shell--night header{background:rgba(6,23,42,.9);border-color:rgba(132,202,235,.25)}
			.brand-link{transition:transform .24s ease}.brand-link:hover{transform:translateY(-1px)}.brand-link svg{animation:brand-bob 4.2s ease-in-out infinite}
			.destination-shell--night header .back-link,.destination-shell--night header .session-toggle,.destination-shell--night header .guide-toggle,.destination-shell--night header .theme-toggle{background:rgba(234,246,255,.94);color:#16587B!important;border-color:rgba(132,202,235,.42)}
			.destination-shell--night .destination-category{color:#16587B!important}
			.destination-shell--night .intro-location{background:rgba(6,23,42,.62);border-color:rgba(132,202,235,.24)}
			.tourism-sky{position:absolute;inset:0;z-index:-2;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse at 12% 0%,rgba(102,189,232,.42),transparent 43%),radial-gradient(ellipse at 88% 35%,rgba(255,255,255,.72),transparent 42%),linear-gradient(145deg,#EAF6FC,#DDF1FA 56%,#C6E7F6)}
			.destination-shell--night .tourism-sky{background:radial-gradient(ellipse at 15% 15%,rgba(56,153,204,.22),transparent 40%),linear-gradient(145deg,#06172A,#0A2945 55%,#0D3D63)}
			.sky-pattern{position:absolute;inset:0;opacity:.4;background-image:radial-gradient(rgba(22,88,123,.13) 1px,transparent 1px);background-size:30px 30px;mask-image:linear-gradient(to bottom,black,transparent 85%)}
			.destination-shell--night .sky-pattern{opacity:.28;background-image:radial-gradient(rgba(194,232,250,.3) 1px,transparent 1px)}
			.sky-glow{position:absolute;width:25rem;height:25rem;border-radius:50%;filter:blur(72px);background:rgba(132,179,206,.33);animation:sky-drift 18s ease-in-out infinite alternate}
			.sky-glow--one{top:11%;left:-12rem}.sky-glow--two{right:-12rem;top:47%;animation-delay:-8s;background:rgba(132,179,206,.25)}
			.sky-star{position:absolute;color:#58a9d2;opacity:.85;animation:twinkle 3.5s ease-in-out infinite;text-shadow:0 0 7px #fff,0 0 18px rgba(56,189,248,.8),0 0 34px rgba(37,133,196,.55);filter:drop-shadow(0 0 4px rgba(56,189,248,.55))}
			.destination-shell--night .sky-star{color:#eaf8ff;opacity:.9}
			.sky-star.is-flare{z-index:1;text-shadow:0 0 8px #fff,0 0 24px rgba(56,189,248,.95),0 0 44px rgba(37,133,196,.65)}
			.sky-moon{position:absolute;right:10%;top:7%;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle at 34% 35%,#fff 0%,#d6f3ff 58%,rgba(112,204,242,.48) 75%,transparent 78%);filter:drop-shadow(0 0 38px rgba(112,204,242,.52))}
			.sky-aurora{position:absolute;top:-24%;left:-20%;width:140%;height:48%;background:linear-gradient(100deg,transparent,rgba(70,172,224,.2),rgba(125,211,252,.18),transparent);filter:blur(55px);transform:rotate(-9deg);animation:aurora 13s ease-in-out infinite alternate}
			.tourism-glass{background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(246,252,255,.9));border:1px solid rgba(255,255,255,.9);box-shadow:0 24px 54px -30px rgba(22,88,123,.38),inset 0 1px rgba(255,255,255,.95);backdrop-filter:blur(22px);transition:transform .28s,box-shadow .28s}
			.destination-shell--night .tourism-glass{background:linear-gradient(145deg,rgba(8,35,59,.96),rgba(6,23,42,.94));border-color:rgba(132,202,235,.26);box-shadow:0 24px 54px -30px rgba(0,0,0,.55),inset 0 1px rgba(221,245,255,.1)}
			.destination-shell--night .ai-privacy-note{background:rgba(6,23,42,.72);border-color:rgba(132,202,235,.3)}
			.ai-mascot-card{background:radial-gradient(circle at 55% 34%,rgba(255,255,255,.9),transparent 36%),linear-gradient(145deg,#d9f2fc 0%,#fff5df 56%,#e8f7ee 100%)}
			.destination-shell--night .ai-mascot-card{background:radial-gradient(circle at 55% 35%,rgba(44,119,156,.32),transparent 36%),linear-gradient(145deg,#0a2945,#0a2038 60%,#123d54);border-color:rgba(132,202,235,.26)}
			.destination-shell--night .mascot-speech{background:rgba(6,23,42,.8);border-color:rgba(132,202,235,.24)}
			.destination-shell--night .tourism-chat-scroll .assistant-bubble,.destination-shell--night .source-pill,.destination-shell--night .chat-quick,.destination-shell--night .chat-input-shell,.destination-shell--night .chat-error{background:rgba(6,23,42,.82);border-color:rgba(132,202,235,.25)}
			.destination-shell--night .guide-step{background:rgba(6,23,42,.78);border-color:rgba(132,202,235,.25)}
			.destination-shell--night .minigame-hub-shell [class*="text-[#16587B]"]{color:#16587B!important}
			.mascot-spark{position:absolute;z-index:20;color:#e7a939;text-shadow:0 0 12px rgba(255,255,255,.9);animation:spark-dance 3.4s ease-in-out infinite}.mascot-spark--one{right:16%;top:28%;font-size:1.6rem}.mascot-spark--two{left:12%;top:52%;font-size:1.2rem;animation-delay:-1.4s}
			.mascot-crew{position:absolute;inset:0;pointer-events:none;animation:mascot-float 4.2s ease-in-out infinite}.mascot-crew img{object-fit:contain;filter:drop-shadow(0 14px 18px rgba(22,88,123,.25));animation:mascot-pose-in .58s cubic-bezier(.2,.8,.2,1) both}.mascot-crew.lower img{transform:scaleX(-1)}
			.tourism-chat-scroll::-webkit-scrollbar{width:6px}.tourism-chat-scroll::-webkit-scrollbar-thumb{background:rgba(132,179,206,.65);border-radius:99px}
			@keyframes brand-bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-2px) rotate(2deg)}}@keyframes mascot-float{0%,100%{translate:0 0}50%{translate:0 -9px}}@keyframes mascot-pose-in{from{opacity:.4}to{opacity:1}}@keyframes spark-dance{0%,100%{transform:translateY(0) rotate(0) scale(.92);opacity:.78}50%{transform:translateY(-7px) rotate(16deg) scale(1.12);opacity:1}}@keyframes twinkle{0%,100%{opacity:.58;transform:scale(.86) rotate(0);filter:brightness(.9)}50%{opacity:1;transform:scale(1.18) rotate(45deg);filter:brightness(1.35)}}@keyframes sky-drift{to{transform:translate(42px,28px) scale(1.1)}}@keyframes aurora{to{transform:rotate(6deg) translateX(5%);opacity:.65}}
			@media(prefers-reduced-motion:reduce){.destination-shell *, .destination-shell *::before,.destination-shell *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
		`}</style>
		<MagicBackground dark={dark} />
		<header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-2xl sm:px-6"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
			<div className="flex min-w-0 items-center gap-2.5 sm:gap-3"><Link href="/" aria-label="Kembali ke beranda" className="back-link grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#84B3CE]/40 bg-white/85 text-[#16587B] shadow-sm transition hover:-translate-x-0.5 hover:bg-white"><Icon name="back" className="h-5 w-5" /></Link><Link href="/" aria-label="TiLoc · Titik Lokasi" className="brand-link flex min-w-0 items-center gap-2"><BrandMark /><span className="min-w-0"><span className="block text-[19px] font-black leading-none tracking-tight text-[#16587B]">TiLoc<span className="text-[#F3B94D]">!</span></span><span className="mt-1 hidden text-[9px] font-extrabold uppercase tracking-[.15em] text-[#16587B]/55 sm:block">Jelajah lokal, seru!</span></span></Link></div>
			<div className="flex shrink-0 items-center gap-2 sm:gap-2.5"><button type="button" onClick={() => setShowSessionModal(true)} title={`Perjalanan ${visitorName}`} className="session-toggle hidden min-h-10 max-w-40 items-center gap-2 rounded-full border border-[#84B3CE]/40 bg-white/75 px-3 text-xs font-extrabold text-[#16587B] transition hover:-translate-y-0.5 hover:bg-white sm:flex"><span className={"h-2.5 w-2.5 shrink-0 rounded-full " + (sessionIsActive ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" : "bg-[#16587B]/30")} /><span className="truncate">{visitorName}</span></button><button type="button" onClick={() => setShowSessionModal(true)} title={`Status perjalanan ${visitorName}`} aria-label={`Status perjalanan ${visitorName}`} className="session-toggle grid h-10 w-10 place-items-center rounded-full border border-[#84B3CE]/40 bg-white/75 text-[#16587B] sm:hidden"><span className={"h-2.5 w-2.5 rounded-full " + (sessionIsActive ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" : "bg-[#16587B]/30")} /></button><button type="button" onClick={() => setShowGuideModal(true)} title="Buka panduan" aria-label="Buka panduan wisata" className="guide-toggle flex h-10 w-10 items-center justify-center gap-2 rounded-full border border-[#84B3CE]/40 bg-white/75 text-[#16587B] transition hover:-translate-y-0.5 hover:bg-white sm:w-auto sm:px-3"><Icon name="book" className="h-4 w-4" /><span className="hidden text-xs font-bold sm:block">Panduan</span></button><button type="button" onClick={toggleTheme} aria-label={dark ? "Gunakan tema terang" : "Gunakan tema malam"} className="theme-toggle grid h-10 w-10 place-items-center rounded-full border border-[#84B3CE]/35 bg-white/85 text-[#16587B] shadow-sm transition hover:rotate-6 hover:scale-105"><Icon name={dark ? "sun" : "moon"} className="h-5 w-5" /></button></div>
		</div></header>

		<main className="relative z-10 mx-auto max-w-6xl space-y-9 px-4 pb-10 pt-5 sm:space-y-11 sm:px-6 sm:pt-8">
			<section className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.12fr)_minmax(0,.88fr)]" aria-label="Tentang destinasi">
				<div className="destination-cover group relative isolate min-h-[250px] overflow-hidden rounded-[2rem] border-4 border-white/80 bg-[#84B3CE]/30 shadow-[0_22px_55px_-28px_rgba(22,88,123,.48)] sm:min-h-[300px] sm:rounded-[2.4rem]">
					{destination.image_url ? <Image src={destination.image_url} alt={"Pemandangan " + destination.name} fill priority unoptimized sizes="(max-width: 767px) 100vw, 58vw" className="object-cover transition duration-700 group-hover:scale-[1.035]" /> : <div aria-hidden="true" className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,#f5eedda6,transparent_28%),linear-gradient(135deg,#8dd1ed,#16587b)]"><span className="text-7xl drop-shadow-lg sm:text-8xl">🌄</span></div>}
					<div className="absolute inset-0 bg-gradient-to-t from-[#102F43]/80 via-[#102F43]/10 to-transparent" />
					{categories.length > 0 && <div className="absolute left-4 top-4 flex max-w-[90%] flex-wrap gap-2 sm:left-5 sm:top-5">{categories.slice(0, 3).map((category) => <span key={category} className="destination-category max-w-full truncate rounded-full border border-white/75 bg-white/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.1em] text-[#16587B] shadow-lg backdrop-blur">{category}</span>)}</div>}
					<div className="absolute bottom-5 left-5 right-5 text-white sm:bottom-6 sm:left-7"><p className="mb-1 text-[10px] font-black uppercase tracking-[.2em] text-white/75">DESTINASI PILIHAN</p><h1 className="max-w-2xl break-words text-3xl font-black leading-[1.05] tracking-tight drop-shadow-md sm:text-4xl lg:text-5xl">{destination.name}</h1></div>
				</div>
				<div className="destination-intro tourism-glass flex min-w-0 flex-col rounded-[2rem] p-5 sm:rounded-[2.4rem] sm:p-7">
					<div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-[#16587B]/65"><span className="grid h-7 w-7 place-items-center rounded-xl bg-[#84B3CE]/20 text-[#16587B]"><Icon name="pin" className="h-4 w-4" /></span>Halo, selamat datang!</div>
					<p className="mt-4 line-clamp-3 text-sm font-medium leading-6 text-[#16587B]/75 sm:text-[15px]">{getDestinationSummary(destination.short_description || destination.description)}</p>
					{tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{tags.slice(0, 4).map((tag) => <span key={tag} className="max-w-full truncate rounded-full border border-[#84B3CE]/40 bg-[#84B3CE]/12 px-2.5 py-1 text-[10px] font-bold text-[#16587B]">#{tag}</span>)}</div>}
					<div className="intro-location mt-5 flex items-start gap-2.5 rounded-2xl border border-[#84B3CE]/35 bg-white/55 p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#16587B] text-white"><Icon name="pin" className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.13em] text-[#16587B]/55">LOKASI</p><p className="mt-0.5 break-words text-xs font-bold leading-5 text-[#16587B]">{location || "Lokasi akan diperbarui pengelola."}</p></div></div>
					<div className="mt-auto flex flex-wrap items-center gap-2.5 pt-4">{hasCoordinates && <a href={"https://www.google.com/maps/search/?api=1&query=" + latitude + "," + longitude} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#84B3CE]/45 bg-white/65 px-3 text-[11px] font-bold text-[#16587B] transition hover:-translate-y-0.5 hover:bg-white"><Icon name="pin" className="h-4 w-4" />Petunjuk arah</a>}{chatAiEnabled && <button type="button" onClick={() => { document.getElementById("tourism-chat-input")?.focus({ preventScroll: true }); document.getElementById("guide-chat-title")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#16587B] px-3.5 text-[11px] font-black text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#10445f] active:scale-[.98]">Tanya maskot <span aria-hidden="true">✦</span></button>}</div>
				</div>
			</section>

			{chatAiEnabled && <section id="tourism-guide" className="scroll-mt-24" aria-labelledby="guide-chat-title">
				<div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#16587B]/60">TEMAN JELAJAHMU</p><h2 id="guide-chat-title" className="mt-1 text-2xl font-black tracking-tight text-[#16587B] sm:text-3xl">Tanya, yuk! <span className="text-[#3d9bc2]">✦</span></h2><p className="mt-1 text-xs font-medium text-[#16587B]/65 sm:text-sm">Cerita destinasi, ide kegiatan, atau rencana jalan-jalan.</p></div><span className="hidden rounded-full border border-[#84B3CE]/35 bg-white/60 px-3 py-1.5 text-[10px] font-bold text-[#16587B]/65 sm:inline-flex">Jawaban mengalir langsung</span></div>
				<div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1.38fr)_minmax(250px,.72fr)]">
					<section className="tourism-glass order-2 flex min-h-[560px] min-w-0 flex-col rounded-[2rem] p-4 sm:rounded-[2.35rem] sm:p-6 lg:order-1" aria-label="Percakapan dengan TiLoc Guide">
						<div className="mb-3 flex items-center justify-between gap-3 border-b border-[#84B3CE]/30 pb-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#16587B] text-xl text-white shadow-lg shadow-[#16587B]/20">✦</span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#16587B]/55">PEMANDU AI</p><p className="mt-0.5 truncate text-base font-black text-[#16587B]">TiLoc Guide</p></div></div><div className="flex items-center gap-2"><span className="hidden items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-1 text-[9px] font-black text-emerald-800 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>SIAP MENEMANI</span><button type="button" onClick={speakLastReply} aria-label={isSpeaking ? "Sedang membacakan jawaban" : "Dengarkan jawaban terakhir"} title="Dengarkan jawaban terakhir" className={"grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition " + (isSpeaking ? "border-[#16587B] bg-[#16587B] text-white" : "border-[#84B3CE]/40 bg-white/80 text-[#16587B] hover:bg-[#84B3CE]/20")}><Icon name="sound" className="h-4 w-4" /></button></div></div>
						<details className="ai-privacy-note mb-3 rounded-xl border border-[#84B3CE]/30 bg-[#EAF6FC]/65 px-3 py-2 text-[10px] leading-4 text-[#16587B]/70"><summary className="cursor-pointer font-bold">🔒 Pertanyaan saat ini saja yang dikirim</summary><p className="mt-1.5">Riwayat chat tidak dikirim. Model gratis melalui OpenRouter dapat mencatat permintaan untuk keamanan dan peningkatan layanan; hindari data pribadi atau rahasia.</p></details>
						<div aria-live="polite" aria-relevant="additions" className="tourism-chat-scroll min-h-[240px] flex-1 space-y-4 overflow-y-auto px-0.5 py-2 pr-1">
							{chatHistory.map((item, index) => <div key={index} className={"flex min-w-0 flex-col " + (item.role === "user" ? "items-end" : "items-start")}><div className={"max-w-[92%] whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-sm font-medium leading-6 sm:max-w-[86%] " + (item.role === "user" ? "rounded-br-md bg-[#16587B] text-white shadow-lg shadow-[#16587B]/15" : "assistant-bubble rounded-bl-md border border-[#84B3CE]/30 bg-white/85 text-[#16587B] shadow-sm")}>{item.role === "model" ? renderLinkedAnswer(item.text) : item.text}</div>{item.role === "model" && item.sources?.length ? <div className="mt-2 flex max-w-[92%] flex-wrap gap-1.5 px-1">{item.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener" className="source-pill rounded-full border border-[#84B3CE]/40 bg-white/75 px-2.5 py-1 text-[10px] font-bold text-[#16587B] underline decoration-[#84B3CE] underline-offset-2">{source.title} · Wikipedia{source.language === "en" ? " EN" : ""}</a>)}</div> : null}{item.role === "model" && index === chatHistory.length - 1 && <span className="mt-1.5 px-2 text-[9px] font-bold uppercase tracking-wider text-[#16587B]/55">ⓘ Fakta pengelola · ide ramah</span>}</div>)}
							{isTyping && <div className="flex max-w-[92%] flex-col items-start gap-2"><div className="flex items-center gap-1.5 rounded-3xl rounded-bl-md border border-[#84B3CE]/30 bg-white/85 px-4 py-3"><span className="h-2 w-2 animate-bounce rounded-full bg-[#16587B]" /><span className="h-2 w-2 animate-bounce rounded-full bg-[#84B3CE] [animation-delay:120ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-[#16587B] [animation-delay:240ms]" /><span className="ml-2 text-xs text-[#16587B]/65">{streamingReply ? renderLinkedAnswer(streamingReply) : "Siap-siap, sebentar ya…"}</span></div>{aiStatus && <span className="px-2 text-[10px] text-[#16587B]/55">{aiStatus}</span>}</div>}<div ref={chatEndRef} />
						</div>
						{chatError && <p role="alert" className="chat-error mt-2 rounded-xl border border-[#84B3CE]/40 bg-[#EAF6FC] px-3 py-2 text-xs font-semibold leading-5 text-[#16587B]">{chatError}</p>}
						<div className="mt-3 border-t border-[#84B3CE]/30 pt-3"><p className="mb-2 text-center text-[9px] font-black uppercase tracking-[.14em] text-[#16587B]/55">PILIHAN CEPAT</p><div className="flex flex-wrap justify-center gap-2">{QUICK_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => void sendPrompt(prompt)} disabled={isTyping} className="chat-quick min-h-9 rounded-full border border-[#84B3CE]/45 bg-white/75 px-3 py-1.5 text-[10px] font-bold text-[#16587B] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#84B3CE]/20 active:scale-[.98] disabled:opacity-50 sm:text-[11px]">{prompt}</button>)}</div>{isTyping && <button type="button" onClick={stopChatRequest} className="mx-auto mt-2 block rounded-xl px-3 py-1.5 text-[11px] font-bold text-[#16587B]/70 transition hover:bg-[#84B3CE]/15">Berhenti menjawab</button>}
							<form onSubmit={submitChat} className="chat-input-shell mt-3 flex min-w-0 gap-2 rounded-2xl border border-[#84B3CE]/50 bg-white/80 p-1.5 shadow-inner focus-within:border-[#16587B] focus-within:ring-2 focus-within:ring-[#84B3CE]/30"><label htmlFor="tourism-chat-input" className="sr-only">Tulis pertanyaan untuk pemandu</label><input id="tourism-chat-input" value={message} onChange={(event) => setMessage(event.currentTarget.value.slice(0, 600))} maxLength={600} disabled={isTyping} placeholder="Tulis pertanyaanmu…" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#16587B] outline-none placeholder:text-[#16587B]/45 disabled:opacity-60" /><button type="submit" disabled={isTyping || !message.trim()} aria-label="Kirim pertanyaan" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#16587B] text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#10445f] active:scale-95 disabled:opacity-45"><Icon name="send" className="h-4 w-4" /></button></form>
							<p className="mt-1 text-right text-[10px] tabular-nums text-[#16587B]/45">{message.length} / 600</p>
						</div>
					</section>
					<aside className="ai-mascot-card order-1 relative flex min-h-[270px] min-w-0 flex-col overflow-hidden rounded-[2rem] border border-white/80 p-4 shadow-[0_22px_50px_-28px_rgba(22,88,123,.4)] sm:min-h-[310px] sm:p-5 lg:order-2 lg:min-h-[560px] lg:rounded-[2.35rem]" aria-label="Maskot teman perjalanan"><div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/60 blur-3xl"/><div className="relative z-10 flex items-center justify-between gap-2"><span className="rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em] text-[#16587B]/75">✨ Teman perjalanan</span><span className="text-xl" aria-hidden="true">☁️</span></div><div className="mascot-spotlight relative z-10 min-h-[175px] flex-1 sm:min-h-[220px] lg:min-h-[320px]"><div className="pointer-events-none absolute inset-x-4 bottom-0 top-5 rounded-full bg-white/55 blur-2xl"/><MascotCrew group="upper" imageUrl={destination.mascot_mode === "custom" ? destination.mascot_image_url : undefined} /></div><div className="mascot-speech relative z-10 rounded-[1.5rem] border border-white/80 bg-white/85 px-4 py-3 shadow-sm"><p className="text-lg font-black leading-tight text-[#16587B]">Halo, {visitorName}!</p><p className="mt-1 text-xs font-semibold leading-5 text-[#16587B]/70">Ke mana kita jelajah hari ini?</p></div><span aria-hidden="true" className="mascot-spark mascot-spark--one">✦</span><span aria-hidden="true" className="mascot-spark mascot-spark--two">✧</span></aside>
				</div>
			</section>}

			<MinigameHub destinationSlug={destination.slug} initialQrCode={initialQrCode} source={initialQrSource} />
			<footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#84B3CE]/25 pb-2 pt-5 text-[11px] font-semibold text-[#16587B]/55"><span>© TiLoc · Jelajah dengan nyaman, simpan kenangan indah.</span><button type="button" onClick={() => setShowGuideModal(true)} className="rounded-full px-3 py-1.5 font-bold text-[#16587B] transition hover:bg-white/60">Lihat panduan lagi ↗</button></footer>
		</main>

		{showNameModal && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#102F43]/55 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="tourism-glass relative my-auto w-full max-w-md overflow-hidden rounded-[2.5rem] border-2 border-white/80 p-7 text-center shadow-2xl sm:p-9"><div aria-hidden="true" className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#84B3CE]/30 blur-3xl" /><div className="relative mx-auto mb-3 h-36 w-52"><MascotCrew group="upper" imageUrl={destination.mascot_mode === "custom" ? destination.mascot_image_url : undefined} /></div>
			<h2 id="welcome-title" className="relative text-3xl font-black text-[#16587B]">Halo, Teman! 👋</h2><p className="relative mt-3 text-sm leading-6 text-[#16587B]/75">Sebelum jalan-jalan di <strong>{destination.name}</strong>, mau pakai nama panggilan?</p>
			<form onSubmit={startJourney} className="relative mt-6"><label htmlFor="visitor-name" className="mb-2 block text-left text-xs font-extrabold text-[#16587B]">Nama panggilan <span className="font-medium text-[#16587B]/55">(opsional)</span></label><input id="visitor-name" type="text" value={nameInput} onChange={(event) => setNameInput(event.currentTarget.value.slice(0, 32))} maxLength={32} placeholder="mis. Kelinci Ceria" autoComplete="nickname" className="mb-4 min-h-12 w-full rounded-2xl border-2 border-[#84B3CE]/40 bg-white/85 px-4 text-center font-bold text-[#16587B] outline-none transition placeholder:font-medium placeholder:text-[#16587B]/40 focus:border-[#16587B] focus:ring-4 focus:ring-[#84B3CE]/20" /><button type="submit" className="min-h-13 w-full rounded-2xl bg-[#16587B] px-5 py-3.5 text-base font-black text-white shadow-lg shadow-[#16587B]/25 transition hover:-translate-y-0.5 hover:bg-[#10445f]">Mulai Perjalanan ✨</button><button type="button" onClick={skipName} className="mt-3 min-h-11 w-full rounded-2xl px-4 text-sm font-bold text-[#16587B]/75 transition hover:bg-[#84B3CE]/15">Lewati, lanjut sebagai Teman</button></form>
		</section></div>}

		{showSessionModal && <div className="fixed inset-0 z-50 grid place-items-center bg-[#102F43]/55 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="session-title" className="tourism-glass w-full max-w-md rounded-[2.5rem] p-7 text-center shadow-2xl sm:p-9">
			<div className="mb-4 text-5xl" aria-hidden="true">{sessionLoading ? "⏳" : sessionIsActive ? "✨" : "🧭"}</div><h2 id="session-title" className="text-2xl font-black text-[#16587B]">{sessionLoading ? "Memeriksa sesi…" : sessionIsActive ? "Perjalananmu masih aktif" : "Sesi perjalanan selesai"}</h2><p className="mt-3 text-sm leading-6 text-[#16587B]/75">{sessionError || (sessionIsActive ? "Kamu bisa terus menjelajahi destinasi dan bertanya kepada pemandu." : "Mulai lagi untuk memperbarui sesi dan melanjutkan petualangan.")}</p>
			{session && <div className="mt-5 rounded-2xl border border-[#84B3CE]/35 bg-white/65 p-4 text-left text-xs text-[#16587B]"><p><strong>Status:</strong> {session.status === "active" && !sessionIsActive ? "segera berakhir" : session.status}</p><p className="mt-1"><strong>Berakhir:</strong> {new Date(session.expires_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p></div>}
			<div className="mt-6 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => setShowSessionModal(false)} className="min-h-12 flex-1 rounded-2xl border border-[#84B3CE]/45 bg-white/70 px-4 font-bold text-[#16587B] hover:bg-white">Kembali menjelajah</button><button type="button" onClick={() => { void startSession().then((success) => { if (success) setShowSessionModal(false); }); }} disabled={sessionLoading} className="min-h-12 flex-1 rounded-2xl bg-[#16587B] px-4 font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{sessionIsActive ? "Perbarui sesi" : "Lanjutkan perjalanan"}</button></div>
		</section></div>}

		{showGuideModal && <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#102F43]/60 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="guide-title" className="tourism-glass relative my-auto w-full max-w-3xl overflow-hidden rounded-[2.25rem] p-5 shadow-2xl sm:rounded-[2.5rem] sm:p-8">
			<div className="flex items-center gap-3 border-b border-[#84B3CE]/30 pb-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#16587B] text-white shadow-lg"><Icon name="book" className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.16em] text-[#16587B]/55">TIGA LANGKAH KECIL</p><h2 id="guide-title" className="text-xl font-black text-[#16587B] sm:text-2xl">Cara main TiLoc</h2></div><button type="button" onClick={() => setShowGuideModal(false)} aria-label="Tutup panduan" className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl text-[#16587B] transition hover:bg-[#84B3CE]/20">×</button></div>
			<div className="mt-5 grid gap-3 sm:grid-cols-3">{GUIDE_ITEMS.map((item, index) => <article key={item.title} className={"guide-step rounded-[1.5rem] border border-[#84B3CE]/30 p-4 transition duration-300 hover:-translate-y-1 " + ["bg-[#EAF6FC]/75", "bg-[#FFF7E5]/80", "bg-[#EDF8F1]/80"][index]}><div className="flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/80 text-xs font-black text-[#16587B] shadow-sm">0{index + 1}</span><span className="text-2xl" aria-hidden="true">{item.icon}</span></div><h3 className="mt-4 text-sm font-black leading-5 text-[#16587B]">{item.title}</h3><p className="mt-1.5 text-xs leading-5 text-[#16587B]/70">{item.text}</p></article>)}</div>
			<button type="button" onClick={() => setShowGuideModal(false)} className="mt-5 min-h-12 w-full rounded-2xl bg-[#16587B] px-5 font-black text-white shadow-lg transition hover:-translate-y-0.5 active:scale-[.99]">Siap, ayo jelajah! ✨</button>
		</section></div>}
		<NearbyCampaignPopup destinationSlug={destination.slug} active={Boolean(sessionIsActive && !showNameModal && !showGuideModal && !showSessionModal)} />
	</div>;
}
