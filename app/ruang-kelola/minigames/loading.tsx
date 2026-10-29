export default function MinigamesRouteLoading() {
	return <main aria-busy="true" aria-label="Memuat studio minigame" className="relative isolate min-h-dvh overflow-hidden bg-[#eaf7ff] px-4 py-8 text-sky-950 dark:bg-[#06172a] dark:text-sky-50 sm:px-8 sm:py-12">
		<div aria-hidden="true" className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl dark:bg-blue-500/15" />
		<div aria-hidden="true" className="pointer-events-none absolute -right-24 top-64 h-80 w-80 rounded-full bg-cyan-200/50 blur-3xl dark:bg-indigo-500/15" />
		<div className="relative mx-auto max-w-7xl">
			<div className="flex items-center gap-3"><span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-700 text-xl text-white shadow-lg"><span aria-hidden="true" className="motion-safe:animate-bounce">🕹️</span><span aria-hidden="true" className="absolute -inset-1 rounded-[1.2rem] border-2 border-sky-400/50 motion-safe:animate-ping" /></span><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-sky-700 dark:text-sky-300">GAME DESIGN STUDIO</p><p className="mt-1 text-sm font-bold">Menyiapkan arena minigame…</p></div></div>
			<div className="mt-8 h-32 animate-pulse rounded-[2rem] border border-white/70 bg-white/60 shadow-xl backdrop-blur-xl dark:border-sky-200/10 dark:bg-slate-900/55" />
			<div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]"><div className="h-72 animate-pulse rounded-[2rem] border border-white/70 bg-white/60 dark:border-sky-200/10 dark:bg-slate-900/55" /><div className="h-72 animate-pulse rounded-[2rem] border border-white/70 bg-white/60 dark:border-sky-200/10 dark:bg-slate-900/55" /></div>
		</div>
	</main>;
}
