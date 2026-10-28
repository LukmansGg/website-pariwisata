"use client";

import { useEffect, useState } from "react";

type AnalyticsDestination = { id: string; slug: string; name: string; views: number; visitors: number; qrScans: number; averageRating: number | null; ratings: number };
type AnalyticsFeature = { key: string; uses: number };
type AnalyticsCampaign = { id: string; title: string; status: string; experienceType: string; impressions: number; clicks: number; responses: number; clickRate: number };
type SurveySummary = { averageRating: number | null; responses: number };
type Suggestion = { scope: "website" | "destination"; destinationName: string | null; rating: number; suggestion: string; submittedAt: string };
type AnalyticsData = {
	periodDays: number;
	updatedAt: string;
	summary: { destinationViews: number; uniqueVisitors: number; qrScans: number; featureUses: number; campaignImpressions: number; campaignClicks: number; campaignResponses: number };
	destinations: AnalyticsDestination[];
	features: AnalyticsFeature[];
	campaigns: AnalyticsCampaign[];
	surveys: { website: SurveySummary; destinations: SurveySummary };
	recentSuggestions: Suggestion[];
};

type CampaignIdea = Pick<AnalyticsDestination, "id" | "slug" | "name" | "views" | "visitors">;
const featureNames: Record<string, string> = { destination_dashboard: "Halaman wisata", find_friends: "Find Our Friends", photobox: "Photobox", chat_ai: "Chat AI", qr_scan: "Scan QR", map: "Peta wisata", other: "Fitur lain" };

function NumberCard({ title, value, detail, tint }: { title: string; value: number | string; detail: string; tint: string }) {
	return <div className="glass-panel min-w-0 rounded-2xl border-b-4 p-4 shadow-sm sm:p-5" style={{ borderBottomColor: tint }}><p className="text-[9px] font-black uppercase tracking-[.16em] text-madiun-blue/60 dark:text-slate-400">{title}</p><p className="mt-2 truncate text-2xl font-black dark:text-white sm:text-3xl">{value}</p><p className="mt-1 text-[10px] leading-4 text-madiun-blue/60 dark:text-slate-400">{detail}</p></div>;
}

export function VisitorAnalyticsSection({ onCreateCampaign }: { onCreateCampaign: (idea: CampaignIdea) => void }) {
	const [days, setDays] = useState(30);
	const [refreshKey, setRefreshKey] = useState(0);
	const [data, setData] = useState<AnalyticsData | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let stopped = false;
		const controller = new AbortController();
		setLoading(true);
		void fetch("/api/admin/visitor-analytics?days=" + days, { cache: "no-store", signal: controller.signal })
			.then(async (response) => {
				const result = await response.json() as AnalyticsData & { error?: string };
				if (!response.ok) throw new Error(result.error || "Analitik belum dapat dimuat.");
				if (!stopped) { setData(result); setError(""); }
			})
			.catch((caught) => { if (!stopped && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Analitik belum dapat dimuat."); })
			.finally(() => { if (!stopped) setLoading(false); });
		return () => { stopped = true; controller.abort(); };
	}, [days, refreshKey]);

	const summary = data?.summary;
	const peakVisitors = Math.max(1, ...(data?.destinations.map((item) => item.visitors) ?? []));
	const peakFeature = Math.max(1, ...(data?.features.map((item) => item.uses) ?? []));
	const updatedLabel = data?.updatedAt ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.updatedAt)) : "";

	return <div className="space-y-6 sm:space-y-8">
		<section className="glass-panel rounded-3xl p-5 sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-sky-700 dark:text-sky-300">DASAR PROMO YANG LEBIH TEPAT</p><h2 className="mt-1 text-xl font-black dark:text-white sm:text-2xl">Insight pengunjung</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-madiun-blue/70 dark:text-slate-300">Lihat destinasi, fitur, dan campaign yang paling menarik perhatian. Data memakai identitas pengunjung anonim.</p></div><div className="flex items-center gap-2"><label htmlFor="analytics-days" className="sr-only">Rentang waktu analitik</label><select id="analytics-days" value={days} onChange={(event) => setDays(Number(event.currentTarget.value))} className="min-h-11 rounded-xl border border-madiun-light/40 bg-white/75 px-3 text-xs font-bold text-madiun-blue dark:border-white/10 dark:bg-slate-900 dark:text-white"><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option></select><button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="min-h-11 rounded-xl border border-madiun-light/40 bg-white/75 px-3 text-xs font-bold text-madiun-blue hover:bg-white dark:border-white/10 dark:bg-slate-900 dark:text-white">Segarkan</button></div></div>
			<div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-madiun-blue/55 dark:text-slate-400"><span>{loading ? "Memuat data…" : "Periode " + (data?.periodDays ?? days) + " hari"}</span>{updatedLabel && <span>· diperbarui {updatedLabel} WIB</span>}<span>· pengunjung sebelum analytics aktif tidak dihitung</span></div>
			{error && <div role="alert" className="mt-5 rounded-2xl border border-amber-300/60 bg-amber-50/80 p-4 text-sm font-semibold text-amber-900 dark:border-amber-300/15 dark:bg-amber-950/25 dark:text-amber-100">{error}</div>}
		</section>

		<div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"><NumberCard title="Halaman wisata" value={summary?.destinationViews ?? (loading ? "…" : 0)} detail="Jumlah tampilan destinasi" tint="#38BDF8"/><NumberCard title="Pengunjung unik" value={summary?.uniqueVisitors ?? (loading ? "…" : 0)} detail="ID anonim pada periode ini" tint="#8B5CF6"/><NumberCard title="Scan QR" value={summary?.qrScans ?? (loading ? "…" : 0)} detail="Scan pertama per QR / pengguna" tint="#34D399"/><NumberCard title="Campaign" value={(summary?.campaignClicks ?? 0) + " klik"} detail={(summary?.campaignImpressions ?? 0) + " tayangan · " + (summary?.campaignResponses ?? 0) + " respons"} tint="#FB7185"/></div>

		<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
			<section className="glass-panel rounded-3xl p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-black dark:text-white">Destinasi paling ramai</h3><p className="mt-1 text-xs text-madiun-blue/60 dark:text-slate-400">Diurutkan berdasarkan pengunjung unik selama {days} hari.</p></div></div>
				{data?.destinations.length ? <div className="mt-5 space-y-4">{data.destinations.map((destination, index) => <article key={destination.id} className="rounded-2xl border border-madiun-light/20 bg-white/50 p-4 dark:border-white/10 dark:bg-slate-900/35"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-100 text-xs font-black text-sky-900 dark:bg-sky-950 dark:text-sky-200">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate text-sm font-black dark:text-white">{destination.name}</h4><p className="mt-1 text-[10px] text-madiun-blue/60 dark:text-slate-400">{destination.visitors} pengunjung · {destination.views} tampilan · {destination.qrScans} scan QR</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">{destination.averageRating ? "★ " + destination.averageRating + " · " + destination.ratings : "Belum ada rating"}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-700 transition-all" style={{ width: Math.max(5, Math.round(destination.visitors / peakVisitors * 100)) + "%" }}/></div><button type="button" onClick={() => onCreateCampaign(destination)} className="mt-3 min-h-10 rounded-xl bg-madiun-blue px-3 text-[10px] font-black text-white transition hover:-translate-y-0.5 dark:bg-indigo-600">Buat campaign untuk lokasi ini →</button></div></div></article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-madiun-light/40 p-6 text-center text-sm text-madiun-blue/65 dark:border-white/10 dark:text-slate-400">Belum ada data destinasi pada periode ini. Buka halaman wisata sebagai pengunjung atau scan QR untuk mulai mengumpulkan data.</div>}
			</section>

			<section className="glass-panel rounded-3xl p-5 sm:p-6"><h3 className="text-lg font-black dark:text-white">Fitur yang digunakan</h3><p className="mt-1 text-xs text-madiun-blue/60 dark:text-slate-400">Pilih yang paling menarik untuk jadi fokus campaign.</p>{data?.features.length ? <div className="mt-5 space-y-4">{data.features.map((feature) => <div key={feature.key}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold dark:text-white">{featureNames[feature.key] ?? feature.key}</span><span className="font-black tabular-nums text-madiun-blue dark:text-sky-300">{feature.uses}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-500" style={{ width: Math.max(5, Math.round(feature.uses / peakFeature * 100)) + "%" }}/></div></div>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-madiun-light/40 p-5 text-center text-xs text-madiun-blue/65 dark:border-white/10 dark:text-slate-400">Belum ada pemakaian fitur tercatat.</div>}</section>
		</div>

		<section className="glass-panel rounded-3xl p-5 sm:p-6"><div><h3 className="text-lg font-black dark:text-white">Performa campaign</h3><p className="mt-1 text-xs leading-5 text-madiun-blue/60 dark:text-slate-400">Tayangan, klik tombol, dan respons form menunjukkan seberapa jauh promosi membawa pengunjung.</p></div>{data?.campaigns.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr className="border-b border-madiun-blue/10 text-[9px] font-black uppercase tracking-widest text-madiun-blue/55 dark:border-white/10 dark:text-slate-400"><th className="py-3 pr-4">Campaign</th><th className="py-3 pr-4">Tayang</th><th className="py-3 pr-4">Klik</th><th className="py-3 pr-4">Respons</th><th className="py-3">CTR</th></tr></thead><tbody>{data.campaigns.map((campaign) => <tr key={campaign.id} className="border-b border-madiun-blue/5 last:border-0 dark:border-white/5"><td className="py-4 pr-4"><p className="font-bold dark:text-white">{campaign.title}</p><p className="mt-1 text-[10px] text-madiun-blue/55 dark:text-slate-400">{campaign.experienceType} · {campaign.status}</p></td><td className="py-4 pr-4 tabular-nums">{campaign.impressions}</td><td className="py-4 pr-4 tabular-nums">{campaign.clicks}</td><td className="py-4 pr-4 tabular-nums">{campaign.responses}</td><td className="py-4 font-black tabular-nums">{campaign.clickRate}%</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-2xl border border-dashed border-madiun-light/40 p-5 text-center text-xs text-madiun-blue/65 dark:border-white/10 dark:text-slate-400">Campaign belum memiliki tayangan pada rentang ini. Buka campaign yang aktif melalui halaman pengunjung untuk mencoba alurnya.</p>}</section>

		<section className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><div className="glass-panel rounded-3xl p-5 sm:p-6"><h3 className="text-lg font-black dark:text-white">Rating dipisah per sasaran</h3><p className="mt-1 text-xs text-madiun-blue/60 dark:text-slate-400">Penilaian website dan setiap objek wisata tidak dicampur.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{[{ label: "Website TiLoc", item: data?.surveys.website }, { label: "Objek wisata", item: data?.surveys.destinations }].map(({ label, item }) => <div key={label} className="rounded-2xl border border-madiun-light/20 bg-white/50 p-4 dark:border-white/10 dark:bg-slate-900/35"><p className="text-xs font-bold dark:text-white">{label}</p><p className="mt-2 text-2xl font-black text-amber-500">{item?.averageRating ? "★ " + item.averageRating : "—"}</p><p className="mt-1 text-[10px] text-madiun-blue/60 dark:text-slate-400">{item?.responses ?? 0} jawaban</p></div>)}</div></div>
			<div className="glass-panel rounded-3xl p-5 sm:p-6"><h3 className="text-lg font-black dark:text-white">Saran terbaru</h3><p className="mt-1 text-xs text-madiun-blue/60 dark:text-slate-400">Nama pengunjung tidak ditampilkan.</p>{data?.recentSuggestions.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.recentSuggestions.map((suggestion, index) => <article key={suggestion.submittedAt + index} className="rounded-2xl border border-madiun-light/20 bg-white/50 p-4 dark:border-white/10 dark:bg-slate-900/35"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-sky-100 px-2.5 py-1 text-[9px] font-black text-sky-900 dark:bg-sky-950 dark:text-sky-200">{suggestion.scope === "website" ? "Website TiLoc" : suggestion.destinationName || "Objek wisata"}</span><span className="text-xs font-black text-amber-500">{"★".repeat(suggestion.rating)}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-madiun-blue/80 dark:text-slate-200">{suggestion.suggestion}</p><time className="mt-3 block text-[9px] text-madiun-blue/50 dark:text-slate-500">{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium" }).format(new Date(suggestion.submittedAt))}</time></article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-madiun-light/40 p-5 text-center text-xs text-madiun-blue/65 dark:border-white/10 dark:text-slate-400">Belum ada saran tertulis pada periode ini.</div>}</div></section>
	</div>;
}
