import { TiLocMark } from "@/src/components/tiloc-brand";

export default function Loading() {
	return (
		<main className="grid min-h-dvh place-items-center overflow-hidden bg-[#eaf6fc] px-6 text-[#103b56] transition-colors duration-500 dark:bg-[#06172a] dark:text-sky-50" aria-busy="true" aria-live="polite">
			<div className="route-loading-panel relative flex w-full max-w-sm flex-col items-center rounded-[2rem] border border-white/70 bg-white/65 px-8 py-10 text-center shadow-[0_30px_90px_-45px_rgba(14,116,190,.55)] backdrop-blur-2xl dark:border-sky-200/15 dark:bg-slate-950/35">
				<div className="route-loading-orbit relative mb-7 grid h-24 w-24 place-items-center rounded-full border border-sky-400/35 bg-gradient-to-br from-white/90 to-sky-100/60 shadow-[inset_0_1px_0_white,0_0_45px_rgba(56,189,248,.2)] dark:from-sky-950/80 dark:to-blue-900/40">
					<TiLocMark className="h-16 w-16"/>
					<span className="route-loading-orbit__ring" />
					<span className="route-loading-orbit__spark">✦</span>
				</div>
				<p className="text-[10px] font-black uppercase tracking-[.28em] text-sky-700 dark:text-sky-300">TiLoc! · Titik Lokasi</p>
				<h1 className="mt-2 text-xl font-extrabold">Menyiapkan perjalanan</h1>
				<p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Sebentar, kami siapkan halaman untukmu.</p>
				<div className="route-loading-track mt-7 h-1 w-40 overflow-hidden rounded-full bg-sky-900/10 dark:bg-white/10"><span className="block h-full w-1/3 rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-600" /></div>
			</div>
		</main>
	);
}
