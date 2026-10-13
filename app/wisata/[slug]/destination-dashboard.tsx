"use client";

import { useEffect, useState, type FormEvent } from "react";

type Destination = {
	id: string;
	slug: string;
	name: string;
	description: string;
};

type VisitorSession = {
	id: string;
	destination_id: string | null;
	expires_at: string;
	status: "active" | "expired" | "ended";
};

type ChatMessage = { role: "user" | "model"; text: string };

function TourismAiChat({ destination }: { destination: Destination }) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [message, setMessage] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	async function sendMessage(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const question = message.trim();
		if (!question || pending) return;
		setPending(true);
		setError("");
		setMessage("");
		try {
			const response = await fetch("/api/ai/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ destinationSlug: destination.slug, message: question, history: messages.slice(-6) }),
			});
			const result = await response.json();
			if (!response.ok || typeof result.reply !== "string") throw new Error(result.error || "Jawaban belum tersedia.");
			setMessages((current) => [...current, { role: "user" as const, text: question }, { role: "model" as const, text: result.reply as string }].slice(-12));
		} catch (chatError) {
			setMessage(question);
			setError(chatError instanceof Error ? chatError.message : "Chat belum dapat digunakan.");
		} finally {
			setPending(false);
		}
	}

	return <section className="mt-6 rounded-xl bg-white p-5 shadow-sm" aria-labelledby="tourism-ai-title">
		<div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="tourism-ai-title" className="text-lg font-semibold">Asisten wisata</h2><p className="mt-1 text-sm text-[#16587B]/70">Tanyakan informasi tentang {destination.name}.</p></div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-[#16587B]">AI</span></div>
		<p className="mt-3 text-xs leading-5 text-slate-500">Jawaban dibuat berdasarkan data pengelola. Informasi yang belum tercantum perlu dikonfirmasi kepada pengelola setempat.</p>
		{messages.length > 0 && <div aria-live="polite" aria-relevant="additions" className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">{messages.map((item, index) => <div key={`${index}-${item.role}`} className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-6 ${item.role === "user" ? "ml-auto bg-[#16587B] text-white" : "bg-white text-slate-800 shadow-sm"}`}><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide opacity-60">{item.role === "user" ? "Anda" : "Asisten"}</span>{item.text}</div>)}{pending && <p className="text-xs text-slate-500">Menyusun jawaban…</p>}</div>}
		{error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}
		<form onSubmit={sendMessage} className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="tourism-ai-question">Pertanyaan untuk asisten</label><input id="tourism-ai-question" value={message} onChange={(event) => setMessage(event.currentTarget.value.slice(0, 600))} maxLength={600} disabled={pending} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:opacity-70" placeholder="Tulis pertanyaan wisata…"/><button type="submit" disabled={pending || !message.trim()} className="min-h-11 rounded-lg bg-[#16587B] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#10445f] disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Memproses…" : "Kirim"}</button></form>
		<p className="mt-2 text-right text-xs tabular-nums text-slate-400">{message.length} / 600</p>
	</section>;
}

export default function DestinationDashboard({
	destination,
}: {
	destination: Destination;
}) {
	const [session, setSession] = useState<VisitorSession | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;

		async function initializeSession() {
			try {
				const response = await fetch("/api/visitor-session", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						destinationSlug: destination.slug,
					}),
				});

				const result = await response.json();

				if (!response.ok) {
					throw new Error(result.error || "Gagal membuat session pengunjung.");
				}

				if (!cancelled) {
					setSession(result.session);
				}
			} catch (err) {
				if (!cancelled) {
					setError(
						err instanceof Error
							? err.message
							: "Terjadi kesalahan saat membuat session.",
					);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		initializeSession();

		return () => {
			cancelled = true;
		};
	}, [destination.slug]);

	return (
		<main className="min-h-screen bg-[#F5EEDD] p-8 text-[#16587B]">
			<h1 className="text-3xl font-bold">{destination.name}</h1>

			<p className="mt-4">
				{destination.description || "Selamat datang di destinasi wisata ini!"}
			</p>

			<section className="mt-6 rounded-xl bg-white p-5 shadow-sm">
				<h2 className="text-lg font-semibold">Sesi Pengunjung</h2>

				{loading && <p className="mt-2">Membuat sesi pengunjung...</p>}

				{error && (
					<p className="mt-2 text-[#16587B]">Gagal membuat sesi: {error}</p>
				)}

				{session && (
					<div className="mt-2 space-y-2">
						<p className="text-sm text-[#16587B]">Session pengunjung aktif.</p>
						<p className="break-all text-sm">
							<strong>Session ID:</strong> {session.id}
						</p>
						<p className="text-sm">
							<strong>Status:</strong> {session.status}
						</p>
						<p className="text-sm">
							<strong>Kedaluwarsa:</strong>{" "}
							{new Date(session.expires_at).toLocaleString("id-ID")}
						</p>
					</div>
				)}
			</section>

			<TourismAiChat destination={destination} />
		</main>
	);
}
