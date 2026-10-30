"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTheme } from "@/src/components/theme-provider";
import { TiLocBrand } from "@/src/components/tiloc-brand";
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

function renderInlineAnswer(text: string): ReactNode[] {
	const parts = text.split(/(\*\*[^*]+?\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
	return parts.map((part, index) => {
		if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-black">{part.slice(2, -2)}</strong>;
		const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
		if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer noopener" className="font-bold text-[#16587B] underline decoration-[#84B3CE] underline-offset-2">{link[1]}</a>;
		return part.replace(/\*\*/g, "");
	});
}

function renderLinkedAnswer(text: string): ReactNode {
	const nodes: ReactNode[] = [];
	let list: { kind: "bullet" | "numbered"; key: number; items: string[] } | null = null;
	const flushList = () => {
		if (!list) return;
		const current = list;
		const items = current.items.map((item, index) => <li key={`${current.key}-${index}`}>{renderInlineAnswer(item)}</li>);
		nodes.push(current.kind === "numbered"
			? <ol key={`ordered-${current.key}`} className="my-1.5 list-decimal space-y-1 pl-5">{items}</ol>
			: <ul key={`bullets-${current.key}`} className="my-1.5 list-disc space-y-1 pl-5">{items}</ul>);
		list = null;
	};

	text.replace(/\r\n?/g, "\n").split("\n").forEach((rawLine, index, lines) => {
		const line = rawLine.trim();
		if (!line) {
			flushList();
			if (index < lines.length - 1) nodes.push(<span key={`space-${index}`} className="block h-2" aria-hidden="true" />);
			return;
		}
		const heading = line.match(/^#{1,3}\s+(.+)$/);
		if (heading) {
			flushList();
			nodes.push(<span key={`heading-${index}`} className="mb-1 block font-black">{renderInlineAnswer(heading[1])}</span>);
			return;
		}
		const bullet = line.match(/^[-*•]\s+(.+)$/);
		const numbered = line.match(/^\d+[.)]\s+(.+)$/);
		if (bullet || numbered) {
			const kind = numbered ? "numbered" : "bullet";
			if (list?.kind !== kind) {
				flushList();
				list = { kind, key: index, items: [] };
			}
			list.items.push((numbered ?? bullet)![1]);
			return;
		}
		flushList();
		nodes.push(<span key={`line-${index}`} className="block">{renderInlineAnswer(line)}</span>);
	});
	flushList();
	return nodes;
}

function prepareSpeechText(text: string) {
	return text
		.replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, "$1")
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/^#{1,3}\s+/gm, "")
		.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
		.replace(/\n+/g, ", ")
		.trim();
}

function personalizeGreeting(text: string, name: string) {
	const prefix = text.match(/^(?:Hai|Halo|Selamat datang),\s*/)?.[0];
	if (!prefix) return text;
	const greetingEnd = text.indexOf("!", prefix.length);
	if (greetingEnd < 0) return text;
	return prefix + name + text.slice(greetingEnd);
}

const MASCOT_FRAMES = Array.from({ length: 6 }, (_, index) => `/maskot/frame_${index}.png`);
const QUICK_PROMPTS = ["Ceritakan daya tarik tempat ini", "Beri ide aktivitas di sini", "Bantu susun rencana kunjungan"];
const GREETINGS = [
	"Hai, {name}! Senang kamu mampir ke {destination}. Mau mulai dengan melihat daya tariknya?",
	"Halo, {name}! Selamat datang di {destination}. Aku siap menemani kamu menjelajah.",
	"Hai, {name}! Petualangan di {destination} dimulai. Ada yang ingin kamu ketahui?",
	"Selamat datang, {name}! Semoga betah di {destination}. Yuk, tanya apa saja tentang tempat ini.",
];
const VISITOR_NICKNAMES = ["Bintang Ceria", "Kancil Jelajah", "Awan Kecil", "Pipit Petualang", "Kompas Mini"];
const DEFAULT_VISITOR_NICKNAME = "Bintang Ceria";
const GUIDE_ITEMS = [
	{ icon: "💬", title: "Tanya TiLoc! Guide", text: "Minta cerita singkat, ide kegiatan, atau tips berkunjung." },
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
	return <div role="img" aria-label="Maskot pemandu TiLoc!" className={`mascot-crew ${group}`}><Image key={src} src={src} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 208px, 256px" unoptimized className="object-contain" onError={(event) => { if (imageUrl) event.currentTarget.src = MASCOT_FRAMES[firstFrame]; }} /></div>;
}

function MagicBackground({ dark }: { dark: boolean }) {
	const stars = Array.from({ length: 24 }, (_, index) => {
		const random = (seed: number) => { const value = Math.sin((index + seed) * 127.1) * 43758.5453; return value - Math.floor(value); };
		const column = index % 6;
		const row = Math.floor(index / 6);
		return { left: ((column + .12 + random(7) * .76) / 6) * 100, top: ((row + .1 + random(23) * .8) / 4) * 100, size: index % 12 === 0 ? 13 : 8 + Math.round(random(41) * 5), delay: (index % 9) * .52 };
	});
	return <div aria-hidden="true" className={"tourism-sky " + (dark ? "is-night" : "is-day")}>
		<div className="sky-pattern" /><div className="sky-glow sky-glow--one" /><div className="sky-glow sky-glow--two" />
		{stars.map((star, index) => <span key={index} className={`sky-star${index % 12 === 0 ? " is-flare" : ""}`} style={{ top: `${star.top}%`, left: `${star.left}%`, fontSize: `${star.size}px`, animationDelay: `${star.delay}s` }}>✦</span>)}
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

export default function DestinationDashboard({ destination, initialQrCode, initialQrSource = "qr_link", chatAiEnabled = true }: { destination: Destination; initialQrCode?: string; initialQrSource?: "qr_link" | "camera"; chatAiEnabled?: boolean }) {
	const { isDark: dark, toggleTheme } = useTheme();
	const [visitorName, setVisitorName] = useState(DEFAULT_VISITOR_NICKNAME);
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
	const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const chatEndRef = useRef<HTMLDivElement>(null);
	const chatAbortRef = useRef<AbortController | null>(null);
	const chatAbortReasonRef = useRef<"manual" | "timeout" | null>(null);
	const speechSequenceRef = useRef(0);
	const lastSpeechTapRef = useRef<{ index: number; time: number } | null>(null);
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
		const storedName = sessionStorage.getItem("mt_visitor_name");
		const journeyStarted = sessionStorage.getItem("mt_visitor_started") === "1";
		let savedName = storedName;
		if (!savedName || savedName === "Teman") {
			if (journeyStarted) {
				savedName = VISITOR_NICKNAMES[Math.floor(Math.random() * VISITOR_NICKNAMES.length)];
				sessionStorage.setItem("mt_visitor_name", savedName);
			} else {
				savedName = DEFAULT_VISITOR_NICKNAME;
			}
		}
		setVisitorName(savedName);
		if (!journeyStarted) setShowNameModal(true);
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
			const synchronizedChat = restored.map((item, index) => index === 0 && item.local
				? { ...item, text: personalizeGreeting(item.text, savedName!) }
				: item);
			setChatHistory(synchronizedChat);
			if (synchronizedChat[0]?.text !== restored[0]?.text) sessionStorage.setItem(chatStorageKey, JSON.stringify(synchronizedChat));
		} else {
			const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
				.replace("{name}", savedName)
				.replace("{destination}", destination.name);
			const initialChat: ChatMessage[] = [{ role: "model", text: greeting, local: true }];
			setChatHistory(initialChat);
			sessionStorage.setItem(chatStorageKey, JSON.stringify(initialChat));
		}
		void startSession();
		}, 0);
		return () => window.clearTimeout(hydrationTimer);
	}, [chatStorageKey, destination.name, startSession]);

	useEffect(() => () => {
		speechSequenceRef.current += 1;
		window.speechSynthesis?.cancel();
	}, []);

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
		const nickname = cleanName || VISITOR_NICKNAMES[Math.floor(Math.random() * VISITOR_NICKNAMES.length)];
		setVisitorName(nickname);
		sessionStorage.setItem("mt_visitor_name", nickname);
		const updatedChat = chatHistory.map((item, index) => index === 0 && item.local
			? { ...item, text: personalizeGreeting(item.text, nickname) }
			: item);
		if (updatedChat.some((item, index) => item !== chatHistory[index])) {
			setChatHistory(updatedChat);
			sessionStorage.setItem(chatStorageKey, JSON.stringify(updatedChat));
		}
		sessionStorage.setItem("mt_visitor_started", "1");
		setShowNameModal(false);
	}
	function startJourney(event: FormEvent<HTMLFormElement>) { event.preventDefault(); commitJourney(nameInput); }
	function skipName() { setNameInput(""); commitJourney(""); }
	function speakMessages(messages: Array<{ index: number; text: string }>) {
		if (!("speechSynthesis" in window)) return;
		const spokenMessages = messages.map((item) => ({ ...item, text: prepareSpeechText(item.text) })).filter((item) => item.text);
		if (!spokenMessages.length) return;
		const sequence = speechSequenceRef.current + 1;
		speechSequenceRef.current = sequence;
		window.speechSynthesis.cancel();
		setSpeakingMessageIndex(null);
		spokenMessages.forEach((item, index) => {
			const utterance = new SpeechSynthesisUtterance(item.text);
			utterance.lang = "id-ID";
			utterance.rate = 1.02;
			utterance.pitch = 1.08;
			utterance.onstart = () => {
				if (speechSequenceRef.current === sequence) setSpeakingMessageIndex(item.index);
			};
			utterance.onend = () => {
				if (speechSequenceRef.current === sequence && index === spokenMessages.length - 1) setSpeakingMessageIndex(null);
			};
			utterance.onerror = () => {
				if (speechSequenceRef.current === sequence) setSpeakingMessageIndex(null);
			};
			window.speechSynthesis.speak(utterance);
		});
	}
	function speakChatMessage(index: number) {
		const messageToRead = chatHistory[index];
		if (!messageToRead) return;
		const now = Date.now();
		const previousTap = lastSpeechTapRef.current;
		if (previousTap?.index === index && now - previousTap.time <= 480) {
			lastSpeechTapRef.current = null;
			speakMessages(chatHistory.map((item, messageIndex) => ({ index: messageIndex, text: item.text })));
			return;
		}
		lastSpeechTapRef.current = { index, time: now };
		speakMessages([{ index, text: messageToRead.text }]);
	}

	return <div className={"destination-shell " + (dark ? "destination-shell--night" : "")}>
		<style>{`
			.destination-shell{--ink:#16587B;--soft:rgba(22,88,123,.72);--accent:#66bde8;--paper:#EAF6FC;min-height:100vh;position:relative;isolation:isolate;overflow:hidden;background:var(--paper);color:var(--ink);transition:background .5s,color .5s}
			.destination-shell--night{--ink:#EAF6FF;--soft:rgba(234,246,255,.74);--accent:#8bd9ff;--paper:#06172A}
			.destination-shell--night [class*="text-[#16587B]"]{color:#EAF6FF!important}
			.destination-shell--night header{background:rgba(6,23,42,.9);border-color:rgba(132,202,235,.25)}
			.brand-link{transition:transform .24s ease}.brand-link:hover{transform:translateY(-1px)}.brand-link svg{animation:brand-bob 4.2s ease-in-out infinite}
			.destination-shell--night header .back-link,.destination-shell--night header .session-toggle,.destination-shell--night header .guide-toggle,.destination-shell--night header .theme-toggle{background:linear-gradient(145deg,rgba(17,57,87,.96),rgba(8,32,54,.96));color:#d9f3ff!important;border-color:rgba(139,217,255,.28);box-shadow:inset 0 1px rgba(234,246,255,.08),0 6px 16px rgba(0,0,0,.22)}
			.destination-shell--night header .back-link:hover,.destination-shell--night header .session-toggle:hover,.destination-shell--night header .guide-toggle:hover,.destination-shell--night header .theme-toggle:hover{background:linear-gradient(145deg,rgba(26,76,111,.98),rgba(11,44,72,.98));border-color:rgba(139,217,255,.48);box-shadow:inset 0 1px rgba(234,246,255,.12),0 8px 20px rgba(0,0,0,.28)}
			.destination-shell--night .destination-category{color:#16587B!important}
			.destination-shell--night .intro-location{background:rgba(6,23,42,.62);border-color:rgba(132,202,235,.24)}
			.tourism-sky{position:absolute;inset:0;z-index:-2;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse at 12% 0%,rgba(102,189,232,.42),transparent 43%),radial-gradient(ellipse at 88% 35%,rgba(255,255,255,.72),transparent 42%),linear-gradient(145deg,#EAF6FC,#DDF1FA 56%,#C6E7F6)}
			.destination-shell--night .tourism-sky{background:radial-gradient(ellipse at 15% 15%,rgba(56,153,204,.22),transparent 40%),linear-gradient(145deg,#06172A,#0A2945 55%,#0D3D63)}
			.sky-pattern{position:absolute;inset:0;opacity:.4;background-image:radial-gradient(rgba(22,88,123,.13) 1px,transparent 1px);background-size:30px 30px;mask-image:linear-gradient(to bottom,black,transparent 85%)}
			.destination-shell--night .sky-pattern{opacity:.28;background-image:radial-gradient(rgba(194,232,250,.3) 1px,transparent 1px)}
			.sky-glow{position:absolute;width:25rem;height:25rem;border-radius:50%;filter:blur(72px);background:rgba(132,179,206,.33);animation:sky-drift 18s ease-in-out infinite alternate}
			.sky-glow--one{top:11%;left:-12rem}.sky-glow--two{right:-12rem;top:47%;animation-delay:-8s;background:rgba(132,179,206,.25)}
			.sky-star{position:absolute;color:#58a9d2;opacity:.72;animation:twinkle 4.8s ease-in-out infinite;text-shadow:0 0 4px rgba(255,255,255,.72),0 0 9px rgba(56,189,248,.42);filter:drop-shadow(0 0 2px rgba(56,189,248,.3))}
			.destination-shell--night .sky-star{color:#dff5ff;opacity:.68}
			.sky-star.is-flare{z-index:1;text-shadow:0 0 5px rgba(255,255,255,.82),0 0 13px rgba(56,189,248,.58)}
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
			.destination-shell--night .minigame-hub-shell .game-program-card{background:radial-gradient(ellipse at 100% 0%,rgba(66,160,204,.14),transparent 42%),linear-gradient(145deg,rgba(13,53,82,.94),rgba(7,34,57,.97));border-color:rgba(139,217,255,.24);box-shadow:0 18px 38px -25px rgba(0,0,0,.72),inset 0 1px rgba(226,247,255,.1)}
			.destination-shell--night .minigame-hub-shell .game-program-card:hover{border-color:rgba(139,217,255,.48);box-shadow:0 26px 48px -24px rgba(0,0,0,.72),0 0 28px rgba(56,189,248,.12),inset 0 1px rgba(226,247,255,.14)}
			.destination-shell--night .minigame-hub-shell .game-program-card .bg-sky-100{background:rgba(56,152,196,.2);color:#d9f5ff}
			.destination-shell--night .minigame-hub-shell .game-program-card [class*="bg-[#fff4d7]"]{background:rgba(123,89,30,.24);border-color:rgba(250,211,117,.2);color:#ffe7a8}
			.destination-shell--night .minigame-hub-shell .game-program-card [class*="text-[#8c671d]"]{color:#ffe7a8!important}
			.destination-shell--night .minigame-hub-shell .game-program-card [class*="bg-[#EAF6FC]"]{background:rgba(76,168,208,.14);border-color:rgba(139,217,255,.2);color:#d9f5ff}
			.destination-shell--night .minigame-hub-shell .game-program-card [class*="bg-emerald-"]{background:rgba(22,101,75,.28);color:#a7f3d0}
			.destination-shell--night .minigame-hub-shell .game-program-card .game-secondary-action{background:rgba(11,42,67,.88);border-color:rgba(139,217,255,.3);color:#e6f7ff}
			.destination-shell--night .minigame-hub-shell .game-program-card [class*="bg-amber-50"]{background:rgba(123,89,30,.24);color:#ffe7a8}
			.destination-shell--night .minigame-hub-shell [class*="text-[#16587B]/55"],.destination-shell--night .minigame-hub-shell [class*="text-[#16587B]/60"],.destination-shell--night .minigame-hub-shell [class*="text-[#16587B]/50"],.destination-shell--night .minigame-hub-shell [class*="text-[#16587B]/45"],.destination-shell--night .minigame-hub-shell [class*="text-[#16587B]/70"]{color:rgba(224,244,255,.66)!important}
			.destination-shell--night .minigame-hub-shell [class*="bg-white/"]{background:rgba(214,241,255,.1)}
			.destination-shell--night .minigame-hub-shell .game-program-card [class*="bg-[#16587B]/10"]{background:rgba(224,244,255,.14)}
			.destination-shell--night .minigame-hub-shell [role="dialog"]{background:linear-gradient(145deg,#102f49,#071b30);border-color:rgba(139,217,255,.24);color:#eaf6ff}
			.destination-shell--night .minigame-hub-shell [role="dialog"] button[class*="bg-white"]{background:rgba(234,246,255,.1);border-color:rgba(139,217,255,.24);color:#eaf6ff}
			.destination-shell--night .minigame-hub-shell [role="dialog"] [class*="text-[#16587B]"]{color:#eaf6ff!important}
			.destination-shell--night .minigame-hub-shell .animate-pulse{background:rgba(119,190,221,.1)}
			.mascot-spark{position:absolute;z-index:20;color:#e7a939;text-shadow:0 0 12px rgba(255,255,255,.9);animation:spark-dance 3.4s ease-in-out infinite}.mascot-spark--one{right:16%;top:28%;font-size:1.6rem}.mascot-spark--two{left:12%;top:52%;font-size:1.2rem;animation-delay:-1.4s}
			.mascot-crew{position:absolute;inset:0;pointer-events:none;animation:mascot-float 4.2s ease-in-out infinite}.mascot-crew img{object-fit:contain;filter:drop-shadow(0 14px 18px rgba(22,88,123,.25));animation:mascot-pose-in .58s cubic-bezier(.2,.8,.2,1) both}.mascot-crew.lower img{transform:scaleX(-1)}
			.tourism-chat-scroll::-webkit-scrollbar{width:6px}.tourism-chat-scroll::-webkit-scrollbar-thumb{background:rgba(132,179,206,.65);border-radius:99px}
			.game-quest-card-container{container-type:inline-size;container-name:gameQuest;isolation:isolate}
			.game-quest-layout{display:grid;grid-template-columns:minmax(0,1fr);min-height:23rem;gap:1rem;align-items:stretch}
			@container gameQuest (min-width:640px){.game-quest-layout{grid-template-columns:minmax(0,1.03fr) minmax(17rem,.97fr);min-height:24rem;gap:1.25rem}}
			.game-card-dots{background-image:radial-gradient(rgba(32,119,175,.13) 1px,transparent 1px);background-size:18px 18px;mask-image:linear-gradient(135deg,black,transparent 75%)}
			.game-card-orb{border-radius:50%;filter:blur(30px);opacity:.62;animation:game-orb-drift 9s ease-in-out infinite alternate}
			.game-card-orb--one{background:radial-gradient(circle,#91e7ff 0%,rgba(97,187,244,.32) 48%,transparent 73%)}.game-card-orb--two{background:radial-gradient(circle,#bcf5df 0%,rgba(130,225,203,.25) 48%,transparent 73%);animation-delay:-4s}
			.game-quest-spark{z-index:1;color:#4daed8;font-size:1.3rem;text-shadow:0 0 8px rgba(255,255,255,.95),0 0 18px rgba(56,189,248,.35);animation:game-spark-idle 3.7s ease-in-out infinite}.game-quest-spark--two{animation-delay:-1.8s;color:#f0b948;font-size:1.05rem}
			.game-quest-label{position:relative;overflow:hidden;border-color:rgba(105,187,226,.5);background:linear-gradient(135deg,#e2f6ff,#f7fcff);color:#12608b}
			.game-quest-label:after{content:"";position:absolute;inset:0 auto 0 -60%;width:38%;transform:skewX(-24deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);animation:game-label-shine 6.4s ease-in-out infinite}
			.game-label-fire{display:grid;place-items:center;animation:game-spark-idle 2.2s ease-in-out infinite}
			.game-quest-mascot{background:linear-gradient(145deg,#9ce6ff,#d8f8ff 55%,#e8f3ff);transform-origin:50% 75%;animation:game-mascot-bob 4.1s ease-in-out infinite}
			.game-quest-copy .game-xp-chip{position:relative;overflow:hidden}.game-xp-star{display:inline-block;filter:drop-shadow(0 1px 3px rgba(183,127,16,.25));animation:game-xp-twinkle 2.8s ease-in-out infinite}
			.game-progress-panel{overflow:visible}
			.game-panel-spark{color:#168bb6;animation:game-spark-idle 2.8s ease-in-out infinite}
			.game-progress-track{isolation:isolate}
			.game-progress-fill{background:linear-gradient(90deg,#25a9dc 0%,#40bfd0 45%,#69cead 100%);box-shadow:inset 0 -3px 0 rgba(20,93,127,.16),0 0 12px rgba(56,189,248,.25);transition:width .95s cubic-bezier(.2,.8,.2,1)}
			.game-progress-fill:after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.42) 48%,transparent 72%);transform:translateX(-110%);animation:game-progress-shine 3.8s ease-in-out infinite}
			.game-progress-stripes{opacity:.2;background-image:repeating-linear-gradient(135deg,transparent 0 9px,rgba(255,255,255,.8) 9px 14px)}
			.game-progress-star{z-index:2;color:#fff;font-size:1rem;line-height:1;text-shadow:0 1px 3px rgba(8,63,111,.55),0 0 9px rgba(255,255,255,.95);filter:drop-shadow(0 0 5px rgba(37,155,218,.8));transition:left .95s cubic-bezier(.2,.8,.2,1);animation:game-progress-star-glow 1.9s ease-in-out infinite}
			.game-mission-status{display:flex;align-items:center}
			.game-primary-action{position:relative;isolation:isolate;overflow:hidden;transform:translateZ(0)}
			.game-primary-action:after{content:"";position:absolute;z-index:-1;inset:-20% auto -20% -48%;width:28%;transform:skewX(-24deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);animation:game-button-shine 6s ease-in-out infinite}
			.game-cta-idle{animation:game-cta-idle 5.4s ease-in-out infinite}
			.game-cta-arrow{display:inline-block;transition:transform .2s ease}.game-primary-action:hover .game-cta-arrow{transform:translateX(4px)}
			.game-quest-cta{--quest-cta-edge:#4f46e5;position:relative;z-index:20;isolation:isolate;display:flex;width:100%;min-height:4.5rem;align-items:center;justify-content:center;gap:.75rem;overflow:hidden;border:2px solid #3730a3;border-radius:1.5rem;background-image:linear-gradient(to bottom,#a855f7,#4f46e5);padding:1.5rem 1rem;color:#fff;font-size:clamp(1.125rem,2vw,1.5rem);font-weight:900;line-height:1.2;text-align:center;text-transform:uppercase;letter-spacing:.035em;box-shadow:0 6px 0 var(--quest-cta-edge),0 10px 20px rgba(0,0,0,.2);transform-origin:bottom center;animation:game-quest-cta-wiggle 3s ease-in-out infinite;transition:background-image .35s ease,border-color .35s ease,box-shadow .15s ease,transform .15s ease,filter .2s ease}
			.game-quest-cta:before{content:"";position:absolute;z-index:1;top:0;left:-100%;width:50%;height:100%;pointer-events:none;transform:skewX(-25deg);background:linear-gradient(to right,transparent,rgba(255,255,255,.8),transparent);animation:game-quest-cta-shine 5s ease-in-out 3s infinite}
			.game-quest-cta>*{position:relative;z-index:2}.game-quest-cta__icon{width:2rem;height:2rem;flex:none;transition:transform .25s ease}.game-quest-cta:hover{background-image:linear-gradient(to bottom,#c084fc,#6366f1);filter:saturate(1.08);transform:translateY(-2px)}.game-quest-cta:hover .game-quest-cta__icon{transform:scale(1.25) rotate(12deg)}
			.game-quest-cta:active{animation-play-state:paused;transform:translateY(6px);box-shadow:0 0 0 var(--quest-cta-edge),0 2px 5px rgba(0,0,0,.2)}.game-quest-cta:focus-visible{outline:3px solid #7dd3fc;outline-offset:4px}
			.game-quest-cta--progress-one{background-image:linear-gradient(to bottom,#06b6d4,#3b82f6);animation:game-quest-cta-progress .46s cubic-bezier(.175,.885,.32,1.275) both,game-quest-cta-wiggle 3s ease-in-out infinite}.game-quest-cta--progress-two{background-image:linear-gradient(to bottom,#10b981,#14b8a6);animation:game-quest-cta-progress .46s cubic-bezier(.175,.885,.32,1.275) both,game-quest-cta-wiggle 3s ease-in-out infinite}.game-quest-cta--complete{background-image:linear-gradient(to bottom,#f59e0b,#f97316);animation:game-quest-cta-complete .55s cubic-bezier(.175,.885,.32,1.275) both}
			.game-quest-cta--progress-one:hover{background-image:linear-gradient(to bottom,#22d3ee,#60a5fa)}.game-quest-cta--progress-two:hover{background-image:linear-gradient(to bottom,#34d399,#2dd4bf)}.game-quest-cta--complete:hover{background-image:linear-gradient(to bottom,#fbbf24,#fb923c)}
			.game-complete-check{display:inline-grid;place-items:center;width:1rem;height:1rem;border-radius:50%;background:#45b987;color:white;font-size:.68rem;animation:game-check-pop .55s cubic-bezier(.2,.9,.25,1.3) both}
			.game-quest-label--complete{border-color:#9bdcc1;background:linear-gradient(135deg,#e5fff2,#f4fffa);color:#08744e}
			.game-card--complete{border-color:#9bdcc1;box-shadow:8px 9px 0 rgba(16,125,83,.07),0 20px 42px -28px rgba(19,142,102,.35)}
			.game-card--complete .game-quest-mascot{background:linear-gradient(145deg,#c6ffe5,#eafff4 60%,#d6f9ff);animation:game-trophy-pop .8s cubic-bezier(.2,.85,.25,1.25) both}
			.game-card--complete .game-cta-idle{animation:none}
			.game-card--complete .game-progress-panel{border-color:#9bdcc1;background:linear-gradient(150deg,#e8fff4,#f5fffb 70%,#eafaff)}
			.game-card--complete .game-progress-fill{background:linear-gradient(90deg,#18a978,#63d6a6)}
			.game-card--complete .game-progress-count{color:#08744e}
			.game-card--complete .game-mission-status{border-color:#79c9a3;background:transparent;color:#08744e}
			.game-card--complete .game-unlocked-ribbon{border-color:#bcebd2;background:linear-gradient(90deg,#e6fff0,#f1fff8);color:#08744e}
			.game-reward-hint{box-shadow:0 3px 0 rgba(183,134,31,.08)}
			.game-completion-burst .game-burst-particle{position:absolute;top:75%;color:#17a5d5;font-size:1.2rem;text-shadow:0 0 8px rgba(255,255,255,.9);animation:game-confetti-pop 1.6s cubic-bezier(.16,.7,.3,1) both}
			.game-completion-burst .game-burst-particle:nth-child(3n){color:#f2b847}.game-completion-burst .game-burst-particle:nth-child(3n + 1){color:#40bd91}
			.game-card--photobox .game-card-dots,.game-card--photobox .game-card-orb,.game-card--photobox .game-quest-spark{display:none}
			.game-photobox-layout{display:grid;grid-template-columns:minmax(0,1fr);min-height:23rem;gap:.75rem;align-items:center;animation:game-photobox-reveal .8s cubic-bezier(.2,.85,.25,1.12) both}
			@container gameQuest (min-width:640px){.game-photobox-layout{grid-template-columns:minmax(0,.92fr) minmax(18rem,1.08fr);min-height:24rem;gap:1rem}}
			.game-photobox-dots{z-index:-1;opacity:.45;background-image:radial-gradient(rgba(79,140,190,.19) 1.3px,transparent 1.3px);background-size:20px 20px;mask-image:linear-gradient(145deg,black,transparent 86%)}
			.game-photobox-orb{z-index:-1;border-radius:50%;filter:blur(35px);opacity:.48;animation:game-orb-drift 11s ease-in-out infinite alternate}.game-photobox-orb--one{background:radial-gradient(circle,#ffc6df 0%,rgba(180,157,255,.25) 48%,transparent 73%)}.game-photobox-orb--two{background:radial-gradient(circle,#9de9ff 0%,rgba(115,198,255,.2) 48%,transparent 73%);animation-delay:-5s}
			.game-photobox-ticket{border-color:rgba(89,155,207,.42);background:linear-gradient(120deg,#dff5ff,#eef0ff);color:#225d91;transform:rotate(-2deg)}.game-photobox-ticket--reward{border-color:rgba(104,179,224,.48);background:linear-gradient(120deg,#e2f8ff,#e9e6ff);color:#315ca0}
			.game-photobox-title-accent{background:linear-gradient(100deg,#1d9ece,#4f7be8 55%,#8c66dc);background-clip:text;-webkit-background-clip:text;color:transparent;animation:game-title-glow 3.2s ease-in-out infinite alternate}
			.game-photobox-description{border-color:rgba(255,255,255,.92);background:rgba(255,255,255,.58);backdrop-filter:blur(9px)}
			.game-camera-ready{justify-content:center}.game-camera-ready-dot{background:#49c28f;box-shadow:0 0 0 3px rgba(73,194,143,.14),0 0 12px rgba(73,194,143,.4);animation:game-ready-pulse 2.3s ease-in-out infinite}
			.game-camera-icon{display:inline-block;animation:game-camera-bob 3s ease-in-out infinite}
			.game-photobox-gallery{isolation:isolate}.game-gallery-glow{z-index:-1;background:radial-gradient(circle,rgba(251,210,130,.52),rgba(121,205,243,.3) 52%,transparent 75%);animation:game-gallery-breathe 4.8s ease-in-out infinite alternate}
			.game-polaroid{padding:.58rem .58rem 2.45rem;border:1px solid rgba(29,78,116,.12);border-radius:.7rem;background:linear-gradient(145deg,#fff,#f9fcff);box-shadow:0 13px 24px rgba(28,58,89,.2),inset 0 1px rgba(255,255,255,.98);transform-origin:50% 80%;transition:filter .25s,box-shadow .25s}
			.game-polaroid--back{animation:game-photo-float-reverse 5.4s ease-in-out infinite}.game-polaroid--front{animation:game-photo-float 4.4s ease-in-out infinite}
			.game-polaroid:hover{z-index:30;filter:saturate(1.08);box-shadow:0 18px 32px rgba(28,58,89,.28)}
			.game-polaroid-shot{aspect-ratio:4/3;border-radius:.35rem;background:linear-gradient(140deg,#8bd9f3,#5388e6 55%,#aa8be9)}.game-polaroid-shot--front{background:linear-gradient(135deg,#b3b2ff,#6cc8ed 58%,#ffb9d1)}
			.game-photo-placeholder{font-size:3.3rem;filter:drop-shadow(0 7px 6px rgba(14,42,72,.2));animation:game-photo-pose 4.1s ease-in-out infinite}.game-polaroid-shot--front .game-photo-placeholder{animation-delay:-1.3s}
			.game-polaroid-caption{position:absolute;right:.5rem;bottom:.58rem;left:.5rem;color:#294861;text-align:center;font-family:cursive;font-size:.77rem;font-weight:800;letter-spacing:.015em}
			.game-photo-tape{border:1px solid rgba(255,255,255,.65);background:linear-gradient(100deg,rgba(174,229,255,.84),rgba(220,211,255,.82));box-shadow:0 2px 5px rgba(22,63,91,.12)}
			.game-photo-star{z-index:3;color:#fff;font-size:.85rem;text-shadow:0 0 6px rgba(255,255,255,.9),0 0 12px rgba(40,113,203,.6);animation:game-spark-idle 2.5s ease-in-out infinite}
			.game-photo-star--two{animation-delay:-1.1s;font-size:1.1rem}
			.game-social-bubble{z-index:5;animation:game-social-float 4.7s ease-in-out infinite;transform-origin:center}
			.game-social-bubble--heart{background:linear-gradient(145deg,#ff8eae,#f65e91);color:#fff;box-shadow:0 5px 0 #c93d72,0 9px 16px rgba(132,41,88,.18);animation-delay:-.5s}
			.game-social-bubble--music{background:linear-gradient(145deg,#173b68,#0e2c52);color:#b8edff;box-shadow:0 5px 0 #0a1e38,0 9px 16px rgba(12,41,75,.2);animation-delay:-1.8s}
			.game-social-bubble--chat{background:linear-gradient(145deg,#63cff0,#3d90de);color:#fff;box-shadow:0 5px 0 #2675b9,0 9px 16px rgba(21,91,150,.18);animation-delay:-2.6s}
			.game-social-bubble--spark{background:linear-gradient(145deg,#ffe99c,#ffc957);color:#95631d;box-shadow:0 5px 0 #d99b38,0 9px 16px rgba(142,104,35,.15);animation-delay:-1.2s}
			.game-photo-confetti span{position:absolute;top:80%;color:#398dd0;font-size:1.25rem;text-shadow:0 0 8px rgba(255,255,255,.95);animation:game-confetti-pop 1.7s cubic-bezier(.16,.7,.3,1) both}.game-photo-confetti span:nth-child(2n){color:#f0b847}
			.game-camera-flash{background:radial-gradient(circle at 50% 48%,rgba(255,255,255,.9),rgba(197,239,255,.78) 38%,rgba(112,183,238,.34) 100%);mix-blend-mode:screen;animation:game-camera-flash .26s ease-out both}
			.game-card--switching .game-quest-layout--switching{transform-style:preserve-3d;perspective:900px;animation:game-reward-swap-out .72s cubic-bezier(.55,.05,.8,.3) .72s both}
			@keyframes game-photobox-reveal{0%{opacity:0;transform:perspective(900px) rotateY(-24deg) scale(.93);filter:blur(3px)}72%{opacity:1;transform:perspective(900px) rotateY(4deg) scale(1.015);filter:blur(0)}100%{opacity:1;transform:perspective(900px) rotateY(0) scale(1);filter:blur(0)}}
			@keyframes game-reward-swap-out{0%{opacity:1;transform:rotateY(0) scale(1)}100%{opacity:0;transform:rotateY(68deg) scale(.94)}}
			@keyframes game-title-glow{from{filter:drop-shadow(0 1px 0 rgba(255,255,255,.2))}to{filter:drop-shadow(0 4px 12px rgba(72,131,217,.22))}}
			@keyframes game-ready-pulse{0%,100%{transform:scale(.92);opacity:.75}50%{transform:scale(1.12);opacity:1}}
			@keyframes game-camera-bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-3px) rotate(4deg)}}
			@keyframes game-gallery-breathe{from{transform:scale(.92);opacity:.62}to{transform:scale(1.08);opacity:1}}
			@keyframes game-photo-float{0%,100%{transform:translateY(0) rotate(7deg)}50%{transform:translateY(-7px) rotate(9deg)}}
			@keyframes game-photo-float-reverse{0%,100%{transform:translateY(0) rotate(-11deg)}50%{transform:translateY(6px) rotate(-13deg)}}
			@keyframes game-photo-pose{0%,100%{transform:translateY(0) rotate(-2deg) scale(1)}50%{transform:translateY(-3px) rotate(2deg) scale(1.06)}}
			@keyframes game-social-float{0%,100%{translate:0 0;rotate:-4deg}50%{translate:0 -6px;rotate:5deg}}
			@keyframes game-camera-flash{0%{opacity:0}24%{opacity:.88}100%{opacity:0}}
			.destination-shell--night .minigame-hub-shell .game-program-card{background:radial-gradient(ellipse at 94% 0%,rgba(56,189,248,.15),transparent 42%),linear-gradient(145deg,#0c3452,#082640 62%,#0b304a);border-color:rgba(139,217,255,.28);box-shadow:7px 8px 0 rgba(0,0,0,.16),0 24px 50px -32px rgba(0,0,0,.76),inset 0 1px rgba(226,247,255,.12)}
			.destination-shell--night .minigame-hub-shell .game-program-card:hover{border-color:rgba(139,217,255,.5);box-shadow:8px 11px 0 rgba(0,0,0,.18),0 28px 52px -28px rgba(0,0,0,.8),0 0 25px rgba(56,189,248,.12),inset 0 1px rgba(226,247,255,.14)}
			.destination-shell--night .minigame-hub-shell .game-card--complete{border-color:rgba(111,223,174,.55);background:radial-gradient(ellipse at 94% 0%,rgba(68,211,155,.14),transparent 44%),linear-gradient(145deg,#0b3a43,#082f3c 65%,#0b3548)}
			.destination-shell--night .minigame-hub-shell .game-card-dots{background-image:radial-gradient(rgba(153,221,255,.13) 1px,transparent 1px)}
			.destination-shell--night .minigame-hub-shell .game-card-orb{opacity:.22}
			.destination-shell--night .minigame-hub-shell .game-quest-spark{color:#9de6ff;text-shadow:0 0 9px rgba(115,211,255,.5),0 0 18px rgba(56,189,248,.3)}
			.destination-shell--night .minigame-hub-shell .game-quest-spark--two{color:#ffd477}
			.destination-shell--night .minigame-hub-shell .game-quest-label{border-color:rgba(139,217,255,.25);background:linear-gradient(135deg,rgba(26,93,132,.7),rgba(13,58,91,.85));color:#bdeeff}
			.destination-shell--night .minigame-hub-shell .game-quest-label--complete{border-color:rgba(111,223,174,.38);background:linear-gradient(135deg,rgba(20,105,82,.52),rgba(8,67,67,.7));color:#aaf2cd}
			.destination-shell--night .minigame-hub-shell .game-quest-mascot{border-color:rgba(205,241,255,.18);background:linear-gradient(145deg,#16527a,#123c61 65%,#0c3452);box-shadow:0 8px 22px rgba(0,0,0,.24)}
			.destination-shell--night .minigame-hub-shell .game-quest-mascot--complete{background:linear-gradient(145deg,#17624e,#0d494a 65%,#123c61)}
			.destination-shell--night .minigame-hub-shell .game-xp-chip{border-color:rgba(246,207,104,.28);background:linear-gradient(135deg,rgba(123,89,30,.48),rgba(92,65,29,.42));color:#ffe7a8}
			.destination-shell--night .minigame-hub-shell .game-free-chip{border-color:rgba(111,223,174,.25);background:rgba(22,101,75,.28);color:#a7f3d0}
			.destination-shell--night .minigame-hub-shell .game-component-chip{border-color:rgba(139,217,255,.2);background:rgba(22,83,119,.55);color:#c8edff}
			.destination-shell--night .minigame-hub-shell .game-progress-panel{border-color:rgba(139,217,255,.24);background:linear-gradient(155deg,rgba(11,54,82,.96),rgba(8,37,62,.96));box-shadow:inset 0 1px rgba(225,246,255,.09),0 8px 18px rgba(0,0,0,.18)}
			.destination-shell--night .minigame-hub-shell .game-card--complete .game-progress-panel{border-color:rgba(111,223,174,.34);background:linear-gradient(150deg,rgba(10,76,65,.76),rgba(8,48,62,.94))}
			.destination-shell--night .minigame-hub-shell .game-panel-spark{border-color:rgba(139,217,255,.18);background:rgba(23,91,129,.72);color:#c7f1ff}
			.destination-shell--night .minigame-hub-shell .game-progress-track{border-color:rgba(205,241,255,.13);background:rgba(2,17,32,.68);box-shadow:inset 0 2px 5px rgba(0,0,0,.3)}
			.destination-shell--night .minigame-hub-shell .game-progress-count{color:#9fe7ff}
			.destination-shell--night .minigame-hub-shell .game-card--complete .game-progress-count{color:#aaf2cd}
			.destination-shell--night .minigame-hub-shell .game-bonus-chip{background:rgba(123,89,30,.28);color:#ffe7a8}
			.destination-shell--night .minigame-hub-shell .game-progress-fill{background:linear-gradient(90deg,#159bd0,#28afc8 48%,#48c398);box-shadow:inset 0 -3px 0 rgba(1,32,48,.25),0 0 14px rgba(56,189,248,.19)}
			.destination-shell--night .minigame-hub-shell .game-card--complete .game-progress-fill{background:linear-gradient(90deg,#17976e,#52c995)}
			.destination-shell--night .minigame-hub-shell .game-mission-status{border-color:rgba(139,217,255,.5);background:transparent;color:rgba(224,244,255,.75)}
			.destination-shell--night .minigame-hub-shell .game-card--complete .game-mission-status,.destination-shell--night .minigame-hub-shell .game-unlocked-ribbon{border-color:rgba(111,223,174,.5);background:transparent;color:#b7f6d3}
			.destination-shell--night .minigame-hub-shell .game-reward-hint{border-color:rgba(250,211,117,.2);background:rgba(123,89,30,.25);color:#ffe7a8}
			.destination-shell--night .minigame-hub-shell .game-secondary-action{background:rgba(11,42,67,.88);border-color:rgba(139,217,255,.3);color:#e6f7ff}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-photobox-dots{opacity:.22;background-image:radial-gradient(rgba(182,226,255,.3) 1.2px,transparent 1.2px)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-photobox-orb{opacity:.22}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-photobox-ticket{border-color:rgba(139,217,255,.25);background:linear-gradient(120deg,rgba(28,94,132,.75),rgba(47,65,122,.72));color:#c8f1ff}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-photobox-description{border-color:rgba(190,226,255,.13);background:rgba(4,25,46,.62);color:rgba(230,245,255,.8)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-photobox-title-accent{background-image:linear-gradient(100deg,#74dcff,#a5b9ff 55%,#ddb4ff)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-camera-ready{color:rgba(210,236,255,.68)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-gallery-glow{background:radial-gradient(circle,rgba(236,194,112,.28),rgba(47,144,206,.2) 52%,transparent 75%)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-social-bubble--heart{background:linear-gradient(145deg,#bd5d83,#933b67);box-shadow:0 5px 0 #6c2e52,0 9px 16px rgba(0,0,0,.25)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-social-bubble--music{background:linear-gradient(145deg,#1c4d76,#14395f);box-shadow:0 5px 0 #0a2744,0 9px 16px rgba(0,0,0,.25)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-social-bubble--chat{background:linear-gradient(145deg,#397da8,#28699b);box-shadow:0 5px 0 #174d7b,0 9px 16px rgba(0,0,0,.25)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-social-bubble--spark{background:linear-gradient(145deg,#c8a354,#a87c36);color:#fff1c7;box-shadow:0 5px 0 #765828,0 9px 16px rgba(0,0,0,.25)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-polaroid{border-color:rgba(226,240,255,.2);background:linear-gradient(145deg,#f4f8ff,#dfeafa);box-shadow:0 15px 28px rgba(0,0,0,.36),inset 0 1px rgba(255,255,255,.96)}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-polaroid-caption{color:#203c57}
			.destination-shell--night .minigame-hub-shell .game-card--photobox .game-photo-tape{background:linear-gradient(100deg,rgba(123,204,238,.78),rgba(178,164,240,.76))}
			@keyframes game-quest-cta-wiggle{0%,7%{rotate:0deg}15%{rotate:-5deg}20%{rotate:3deg}25%{rotate:-5deg}30%{rotate:2deg}35%,100%{rotate:0deg}}
			@keyframes game-quest-cta-shine{0%{left:-100%;opacity:0}10%{opacity:1}20%{left:100%;opacity:0}100%{left:100%;opacity:0}}
			@keyframes game-quest-cta-progress{0%{scale:.94}68%{scale:1.06}100%{scale:1}}
			@keyframes game-quest-cta-complete{0%{scale:.94}72%{scale:1.07}100%{scale:1}}
			@media(prefers-reduced-motion:reduce){.game-quest-cta,.game-quest-cta:before,.game-quest-cta--complete{animation:none}.game-quest-cta,.game-quest-cta__icon{transition-duration:.01ms}}
			@keyframes game-orb-drift{0%{transform:translate3d(0,0,0) scale(.94)}100%{transform:translate3d(-10px,10px,0) scale(1.08)}}
			@keyframes game-spark-idle{0%,100%{transform:translateY(0) rotate(-5deg) scale(.95);opacity:.74}50%{transform:translateY(-4px) rotate(8deg) scale(1.08);opacity:1}}
			@keyframes game-mascot-bob{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-4px) rotate(2deg)}}
			@keyframes game-xp-twinkle{0%,100%{transform:rotate(-8deg) scale(.94)}50%{transform:rotate(9deg) scale(1.13)}}
			@keyframes game-label-shine{0%,68%,100%{left:-60%;opacity:0}74%{opacity:.85}86%{left:130%;opacity:0}}
			@keyframes game-progress-shine{0%,55%,100%{transform:translateX(-110%)}78%{transform:translateX(110%)}}
			@keyframes game-progress-star-glow{0%,100%{transform:translate(-50%,-50%) scale(.94) rotate(0);filter:drop-shadow(0 0 4px rgba(37,155,218,.5))}50%{transform:translate(-50%,-50%) scale(1.16) rotate(25deg);filter:drop-shadow(0 0 8px rgba(255,255,255,.95))}}
			@keyframes game-button-shine{0%,70%,100%{left:-48%;opacity:0}76%{opacity:1}90%{left:130%;opacity:0}}
			@keyframes game-cta-idle{0%,82%,100%{transform:translateY(0)}87%{transform:translateY(-2px)}91%{transform:translateY(1px)}}
			@keyframes game-check-pop{0%{transform:scale(.2) rotate(-35deg);opacity:0}70%{transform:scale(1.25) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0)}}
			@keyframes game-trophy-pop{0%{transform:scale(.76) rotate(-12deg)}70%{transform:scale(1.12) rotate(5deg)}100%{transform:scale(1) rotate(0)}}
			@keyframes game-confetti-pop{0%{transform:translateY(0) scale(.4) rotate(0);opacity:0}18%{opacity:1}100%{transform:translateY(-110px) scale(.3) rotate(130deg);opacity:0}}
			@keyframes brand-bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-2px) rotate(2deg)}}@keyframes mascot-float{0%,100%{translate:0 0}50%{translate:0 -9px}}@keyframes mascot-pose-in{from{opacity:.4}to{opacity:1}}@keyframes spark-dance{0%,100%{transform:translateY(0) rotate(0) scale(.92);opacity:.78}50%{transform:translateY(-7px) rotate(16deg) scale(1.12);opacity:1}}@keyframes twinkle{0%,100%{opacity:.58;transform:scale(.86) rotate(0);filter:brightness(.9)}50%{opacity:1;transform:scale(1.18) rotate(45deg);filter:brightness(1.35)}}@keyframes sky-drift{to{transform:translate(42px,28px) scale(1.1)}}@keyframes aurora{to{transform:rotate(6deg) translateX(5%);opacity:.65}}
			@media(prefers-reduced-motion:reduce){.destination-shell *, .destination-shell *::before,.destination-shell *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
		`}</style>
		<MagicBackground dark={dark} />
		<header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-2xl sm:px-6"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
			<div className="flex min-w-0 items-center gap-2.5 sm:gap-3"><Link href="/" aria-label="Kembali ke beranda" className="back-link grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#84B3CE]/40 bg-white/85 text-[#16587B] shadow-sm transition hover:-translate-x-0.5 hover:bg-white"><Icon name="back" className="h-5 w-5" /></Link><Link href="/" aria-label="TiLoc! · Titik Lokasi" className="brand-link min-w-0"><TiLocBrand markClassName="h-10 w-10" wordmarkClassName="text-[19px] font-black tracking-tight text-[#16587B]" accentClassName="text-[#F3B94D]" tagline="Jelajah lokal, seru!" taglineClassName="mt-1 hidden text-[9px] font-extrabold uppercase tracking-[.15em] text-[#16587B]/55 sm:block" /></Link></div>
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
					<section className="tourism-glass order-2 flex h-[min(72dvh,760px)] min-h-[min(64dvh,480px)] min-w-0 flex-col rounded-[2rem] p-4 sm:rounded-[2.35rem] sm:p-6 lg:order-1" aria-label="Percakapan dengan TiLoc! Guide">
						<div className="mb-3 flex items-center justify-between gap-3 border-b border-[#84B3CE]/30 pb-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#16587B] text-xl text-white shadow-lg shadow-[#16587B]/20">✦</span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#16587B]/55">PEMANDU AI</p><p className="mt-0.5 truncate text-base font-black text-[#16587B]">TiLoc! Guide</p></div></div><span className="hidden items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-1 text-[9px] font-black text-emerald-800 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>SIAP MENEMANI</span></div>
						<p className="ai-privacy-note mb-2 rounded-xl border border-[#84B3CE]/30 bg-[#EAF6FC]/65 px-3 py-2 text-[10px] font-semibold leading-4 text-[#16587B]/70">🔒 Hindari data pribadi atau rahasia.</p>
						<p className="mb-1 text-[9px] font-semibold text-[#16587B]/50">🔊 Ketuk sekali untuk satu pesan · dua kali cepat untuk semua chat</p>
						<div aria-live="polite" aria-relevant="additions" className="tourism-chat-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-0.5 py-2 pr-1">
							{chatHistory.map((item, index) => <div key={index} className={"flex min-w-0 flex-col " + (item.role === "user" ? "items-end" : "items-start")}>
								<div className={"flex max-w-[96%] min-w-0 items-end gap-1.5 " + (item.role === "user" ? "flex-row-reverse" : "")}>
									<div className={"max-w-[calc(100%-2.75rem)] whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-sm font-medium leading-6 " + (item.role === "user" ? "rounded-br-md bg-[#16587B] text-white shadow-lg shadow-[#16587B]/15" : "assistant-bubble rounded-bl-md border border-[#84B3CE]/30 bg-white/85 text-[#16587B] shadow-sm")}>{item.role === "model" ? renderLinkedAnswer(item.text) : item.text}</div>
									<button type="button" onClick={() => speakChatMessage(index)} aria-label={`Baca pesan ${index + 1}; ketuk dua kali cepat untuk membaca seluruh chat`} title="Sekali: baca pesan ini · dua kali cepat: baca seluruh chat" className={"grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition active:scale-90 " + (speakingMessageIndex === index ? "border-[#16587B] bg-[#16587B] text-white shadow-md shadow-[#16587B]/20" : "border-[#84B3CE]/35 bg-white/70 text-[#16587B]/65 hover:-translate-y-0.5 hover:bg-white hover:text-[#16587B]")}><Icon name="sound" className="h-4 w-4" /></button>
								</div>
								{item.role === "model" && item.sources?.length ? <div className="mt-2 flex max-w-[92%] flex-wrap gap-1.5 px-1">{item.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener" className="source-pill rounded-full border border-[#84B3CE]/40 bg-white/75 px-2.5 py-1 text-[10px] font-bold text-[#16587B] underline decoration-[#84B3CE] underline-offset-2">{source.title} · Wikipedia{source.language === "en" ? " EN" : ""}</a>)}</div> : null}
								{item.role === "model" && index === chatHistory.length - 1 && <span className="mt-1.5 px-2 text-[9px] font-bold uppercase tracking-wider text-[#16587B]/55">ⓘ Fakta pengelola · ide ramah</span>}
							</div>)}
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
			<footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#84B3CE]/25 pb-2 pt-5 text-[11px] font-semibold text-[#16587B]/55"><span>© TiLoc! · Jelajah dengan nyaman, simpan kenangan indah.</span><button type="button" onClick={() => setShowGuideModal(true)} className="rounded-full px-3 py-1.5 font-bold text-[#16587B] transition hover:bg-white/60">Lihat panduan lagi ↗</button></footer>
		</main>

		{showNameModal && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#102F43]/55 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="tourism-glass relative my-auto w-full max-w-md overflow-hidden rounded-[2.5rem] border-2 border-white/80 p-7 text-center shadow-2xl sm:p-9"><div aria-hidden="true" className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#84B3CE]/30 blur-3xl" /><div className="relative mx-auto mb-3 h-36 w-52"><MascotCrew group="upper" imageUrl={destination.mascot_mode === "custom" ? destination.mascot_image_url : undefined} /></div>
			<h2 id="welcome-title" className="relative text-3xl font-black text-[#16587B]">Halo, {nameInput.trim() || visitorName}! 👋</h2><p className="relative mt-3 text-sm leading-6 text-[#16587B]/75">Sebelum jalan-jalan di <strong>{destination.name}</strong>, mau pakai nama panggilan?</p>
			<form onSubmit={startJourney} className="relative mt-6"><label htmlFor="visitor-name" className="mb-2 block text-left text-xs font-extrabold text-[#16587B]">Nama panggilan <span className="font-medium text-[#16587B]/55">(opsional)</span></label><input id="visitor-name" type="text" value={nameInput} onChange={(event) => setNameInput(event.currentTarget.value.slice(0, 32))} maxLength={32} placeholder="mis. Kelinci Ceria" autoComplete="nickname" className="mb-4 min-h-12 w-full rounded-2xl border-2 border-[#84B3CE]/40 bg-white/85 px-4 text-center font-bold text-[#16587B] outline-none transition placeholder:font-medium placeholder:text-[#16587B]/40 focus:border-[#16587B] focus:ring-4 focus:ring-[#84B3CE]/20" /><button type="submit" className="min-h-13 w-full rounded-2xl bg-[#16587B] px-5 py-3.5 text-base font-black text-white shadow-lg shadow-[#16587B]/25 transition hover:-translate-y-0.5 hover:bg-[#10445f]">Mulai Perjalanan ✨</button><button type="button" onClick={skipName} className="mt-3 min-h-11 w-full rounded-2xl px-4 text-sm font-bold text-[#16587B]/75 transition hover:bg-[#84B3CE]/15">Pilihkan nama lucu untukku ✨</button></form>
		</section></div>}

		{showSessionModal && <div className="fixed inset-0 z-50 grid place-items-center bg-[#102F43]/55 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="session-title" className="tourism-glass w-full max-w-md rounded-[2.5rem] p-7 text-center shadow-2xl sm:p-9">
			<div className="mb-4 text-5xl" aria-hidden="true">{sessionLoading ? "⏳" : sessionIsActive ? "✨" : "🧭"}</div><p className="mb-1 text-xs font-black uppercase tracking-[.16em] text-[#16587B]/55">Hai, {visitorName}!</p><h2 id="session-title" className="text-2xl font-black text-[#16587B]">{sessionLoading ? "Memeriksa sesi…" : sessionIsActive ? "Perjalananmu masih aktif" : "Sesi perjalanan selesai"}</h2><p className="mt-3 text-sm leading-6 text-[#16587B]/75">{sessionError || (sessionIsActive ? "Kamu bisa terus menjelajahi destinasi dan bertanya kepada pemandu." : "Mulai lagi untuk memperbarui sesi dan melanjutkan petualangan.")}</p>
			{session && <div className="mt-5 rounded-2xl border border-[#84B3CE]/35 bg-white/65 p-4 text-left text-xs text-[#16587B]"><p><strong>Status:</strong> {session.status === "active" && !sessionIsActive ? "segera berakhir" : session.status}</p><p className="mt-1"><strong>Berakhir:</strong> {new Date(session.expires_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p></div>}
			<div className="mt-6 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => setShowSessionModal(false)} className="min-h-12 flex-1 rounded-2xl border border-[#84B3CE]/45 bg-white/70 px-4 font-bold text-[#16587B] hover:bg-white">Kembali menjelajah</button><button type="button" onClick={() => { void startSession().then((success) => { if (success) setShowSessionModal(false); }); }} disabled={sessionLoading} className="min-h-12 flex-1 rounded-2xl bg-[#16587B] px-4 font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{sessionIsActive ? "Perbarui sesi" : "Lanjutkan perjalanan"}</button></div>
		</section></div>}

		{showGuideModal && <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#102F43]/60 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="guide-title" className="tourism-glass relative my-auto w-full max-w-3xl overflow-hidden rounded-[2.25rem] p-5 shadow-2xl sm:rounded-[2.5rem] sm:p-8">
			<div className="flex items-center gap-3 border-b border-[#84B3CE]/30 pb-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#16587B] text-white shadow-lg"><Icon name="book" className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.16em] text-[#16587B]/55">TIGA LANGKAH KECIL</p><h2 id="guide-title" className="text-xl font-black text-[#16587B] sm:text-2xl">Cara main TiLoc!</h2></div><button type="button" onClick={() => setShowGuideModal(false)} aria-label="Tutup panduan" className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-full text-2xl text-[#16587B] transition hover:bg-[#84B3CE]/20">×</button></div>
			<div className="mt-5 grid gap-3 sm:grid-cols-3">{GUIDE_ITEMS.map((item, index) => <article key={item.title} className={"guide-step rounded-[1.5rem] border border-[#84B3CE]/30 p-4 transition duration-300 hover:-translate-y-1 " + ["bg-[#EAF6FC]/75", "bg-[#FFF7E5]/80", "bg-[#EDF8F1]/80"][index]}><div className="flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/80 text-xs font-black text-[#16587B] shadow-sm">0{index + 1}</span><span className="text-2xl" aria-hidden="true">{item.icon}</span></div><h3 className="mt-4 text-sm font-black leading-5 text-[#16587B]">{item.title}</h3><p className="mt-1.5 text-xs leading-5 text-[#16587B]/70">{item.text}</p></article>)}</div>
			<button type="button" onClick={() => setShowGuideModal(false)} className="mt-5 min-h-12 w-full rounded-2xl bg-[#16587B] px-5 font-black text-white shadow-lg transition hover:-translate-y-0.5 active:scale-[.99]">Siap, ayo jelajah! ✨</button>
		</section></div>}
		<NearbyCampaignPopup destinationSlug={destination.slug} active={Boolean(sessionIsActive && !showNameModal && !showGuideModal && !showSessionModal)} dark={dark}/>
	</div>;
}
