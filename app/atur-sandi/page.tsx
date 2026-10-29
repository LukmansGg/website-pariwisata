"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { TiLocBrand } from "@/src/components/tiloc-brand";
import { createClient } from "@/src/infrastructure/supabase/client";

export default function SetPasswordPage() {
	const supabase = useMemo(() => createClient(), []);
	const router = useRouter();
	const [ready, setReady] = useState(false);
	const [isManager, setIsManager] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		const checkSession = async (session?: Session | null) => {
			const currentSession = session === undefined
				? (await supabase.auth.getSession()).data.session
				: session;
			if (!active) return;
			if (!currentSession) { setEmail(""); setIsManager(false); setReady(true); return; }
			const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", currentSession.user.id).maybeSingle();
			if (!active) return;
			setEmail(currentSession.user.email ?? "");
			setIsManager(role?.role === "destination_manager");
			setReady(true);
		};
		void checkSession();
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			// Leave Supabase's auth callback lock before making authenticated DB requests.
			window.setTimeout(() => { void checkSession(session); }, 0);
		});
		return () => { active = false; subscription.unsubscribe(); };
	}, [supabase]);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		if (password.length < 12) { setError("Gunakan sandi minimal 12 karakter."); return; }
		if (password !== confirmation) { setError("Konfirmasi sandi belum sama."); return; }
		setBusy(true);
		const { error: updateError } = await supabase.auth.updateUser({ password });
		setBusy(false);
		if (updateError) { setError("Sandi belum tersimpan. Pastikan tautan undangan masih berlaku, lalu coba lagi."); return; }
		router.replace("/ruang-kelola");
		router.refresh();
	}

	return <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_15%_0%,#e0f2fe_0,#f5fbff_42%,#dbeafe_100%)] p-4 text-[#123b56] dark:bg-[radial-gradient(circle_at_15%_0%,#152640_0,#08111f_55%,#030713_100%)] dark:text-sky-50 sm:p-8">
		<section className="w-full max-w-xl rounded-[2rem] border border-white/75 bg-white/80 p-6 shadow-[0_32px_90px_-48px_rgba(2,132,199,.5)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/65 sm:p-9">
			<TiLocBrand markClassName="h-14 w-14" wordmarkClassName="text-xl font-black tracking-tight text-sky-950 dark:text-sky-50" accentClassName="text-amber-500" tagline="Titik Lokasi"/>
			<p className="mt-6 text-[10px] font-black uppercase tracking-[.22em] text-sky-700 dark:text-sky-300">AKSES PENGELOLA WISATA</p>
			<h1 className="mt-2 text-3xl font-black tracking-tight">Buat sandi akun</h1>
			{!ready ? <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Memeriksa undangan…</p> : isManager ? <>
				<p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{email ? `Undangan untuk ${email}. ` : "Undangan sudah terverifikasi. "}Buat sandi pribadi untuk masuk ke ruang pengelola.</p>
				<form onSubmit={submit} className="mt-7 space-y-4">
					<label className="block text-sm font-bold">Sandi baru<input required minLength={12} autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} className="mt-2 min-h-12 w-full rounded-xl border border-sky-200 bg-white px-4 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-white/10 dark:bg-slate-900 dark:focus:ring-sky-950" placeholder="Minimal 12 karakter" /></label>
					<label className="block text-sm font-bold">Ulangi sandi<input required minLength={12} autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} className="mt-2 min-h-12 w-full rounded-xl border border-sky-200 bg-white px-4 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 dark:border-white/10 dark:bg-slate-900 dark:focus:ring-sky-950" placeholder="Ketik ulang sandi" /></label>
					{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-400/20 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
					<button disabled={busy} className="min-h-12 w-full rounded-xl bg-gradient-to-r from-sky-700 to-blue-800 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60">{busy ? "Menyimpan sandi…" : "Simpan sandi & masuk"}</button>
				</form>
				<p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">Akses dashboard ditentukan admin dan hanya mencakup wisata yang ditugaskan ke akun ini.</p>
			</> : <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-300/15 dark:bg-amber-950/25 dark:text-amber-100">{ready ? "Tautan undangan tidak valid atau sudah kedaluwarsa. Minta admin mengirim ulang undangan pengelola." : ""}<a href="/login" className="ml-1 font-black underline underline-offset-2">Kembali ke login</a></div>}
		</section>
	</main>;
}
