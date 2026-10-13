import Link from "next/link";

export function NotFoundView({ kind = "page" }: { kind?: "page" | "qr" }) {
	const isQr = kind === "qr";
	return <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[radial-gradient(circle_at_20%_15%,#dff5ff_0,transparent_36%),linear-gradient(145deg,#f8fcff_0%,#eaf7ff_55%,#f8fbff_100%)] px-5 py-12 text-[#16587B]">
		<div aria-hidden="true" className="pointer-events-none absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-sky-200/45 blur-3xl" />
		<div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-indigo-100/70 blur-3xl" />
		<section className="relative w-full max-w-xl rounded-[2rem] border border-white/80 bg-white/75 p-7 text-center shadow-[0_24px_90px_-42px_rgba(22,88,123,.35)] backdrop-blur-xl sm:p-10">
			<div className="mx-auto grid h-32 w-32 place-items-center rounded-[2rem] bg-gradient-to-br from-sky-100 to-white shadow-inner sm:h-36 sm:w-36">
				<svg viewBox="0 0 120 120" className="h-28 w-28" role="img" aria-label="Maskot penunjuk arah yang kebingungan">
					<path d="M27 96c4-18 16-29 33-29s29 11 33 29" fill="#d9f0fb" />
					<path d="M60 13c-18 0-31 14-31 31 0 24 31 51 31 51s31-27 31-51c0-17-13-31-31-31Z" fill="#fff" stroke="#2b8bb5" strokeWidth="4" />
					<path d="m62 25 4 9 10 1-7.5 6.5 2 10L62 46l-8.5 5 2-10L48 35l10-1 4-9Z" fill="#73c7ed" />
					<circle cx="52" cy="61" r="2.5" fill="#16587B" /><circle cx="69" cy="61" r="2.5" fill="#16587B" />
					<path d="M55 69c3 3 8 3 11 0" fill="none" stroke="#16587B" strokeLinecap="round" strokeWidth="2.5" />
					<path d="m22 34 4 2m66 7 5-1M36 15l3 4m45 65 5 3" stroke="#58acd3" strokeLinecap="round" strokeWidth="3" />
				</svg>
			</div>
			<p className="mt-6 text-xs font-extrabold uppercase tracking-[.2em] text-sky-700">MadiunTrip · {isQr ? "Pemindai QR" : "Jelajah wisata"}</p>
			<p className="mt-2 text-6xl font-black tracking-tight text-[#16587B] sm:text-7xl">{isQr ? "QR?" : "404"}</p>
			<h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{isQr ? "QR-nya belum ketemu" : "Halaman tersesat sebentar"}</h1>
			<p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#16587B]/70 sm:text-base">
				{isQr
					? "Kode ini belum dapat membuka destinasi. Pastikan QR yang dipindai benar dan masih berlaku."
					: "Halaman yang kamu cari tidak tersedia. Yuk kembali dan lanjutkan perjalanan wisata."}
			</p>
			<div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
				{isQr && <Link href="/scan" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#16587B] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-900/15 transition hover:-translate-y-0.5 hover:bg-[#10445f] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200">Pindai ulang <span aria-hidden="true">↻</span></Link>}
				<Link href="/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-5 py-3 text-sm font-bold text-[#16587B] transition hover:-translate-y-0.5 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100">Kembali ke beranda <span aria-hidden="true">⌂</span></Link>
			</div>
		</section>
	</main>;
}
