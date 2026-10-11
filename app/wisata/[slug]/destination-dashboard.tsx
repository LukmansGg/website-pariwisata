"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
		</main>
	);
}
