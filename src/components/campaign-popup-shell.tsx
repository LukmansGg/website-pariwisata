"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTheme } from "@/src/components/theme-provider";
import { campaignTitleClass, resolveCampaignAppearance, type CampaignAppearance } from "@/src/features/campaigns/appearance";

type CampaignPopupShellProps = {
	title: string;
	description: string;
	imageUrl: string | null;
	eyebrow: string;
	appearance?: CampaignAppearance | null;
	titleId: string;
	onDismiss: () => void;
	children: ReactNode;
};

export function CampaignPopupShell({ title, description, imageUrl, eyebrow, appearance: rawAppearance, titleId, onDismiss, children }: CampaignPopupShellProps) {
	const { isDark } = useTheme();
	const appearance = resolveCampaignAppearance(rawAppearance, "promo");
	const onDismissRef = useRef(onDismiss);
	useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);
	const surface = isDark
		? "border-sky-100/15 bg-gradient-to-br from-[#102f4b] via-[#0a2036] to-[#07182a] text-sky-50 shadow-[0_32px_90px_rgba(1,10,24,.62),inset_0_1px_0_rgba(255,255,255,.08)]"
		: "border-white/85 bg-gradient-to-br from-white via-[#f1f9ff] to-[#e7f5ff] text-[#16587B] shadow-[0_30px_85px_rgba(15,66,99,.24),inset_0_1px_0_white]";
	const textMuted = isDark ? "text-sky-100/70" : "text-[#16587B]/70";
	const compactRating = appearance.preset === "rating" && !imageUrl;

	useEffect(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onDismissRef.current(); };
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	return <div className="campaign-popup-backdrop fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-[#06182b]/65 p-3 backdrop-blur-md sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onDismiss(); }}>
		<section role="dialog" aria-modal="true" aria-labelledby={titleId} className={`campaign-popup-panel relative my-auto max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-[1.8rem] border ${imageUrl ? "max-w-4xl" : appearance.preset === "rating" ? "max-w-xl" : "max-w-lg"} ${surface}`}>
			<div aria-hidden="true" className={`pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full blur-3xl ${isDark ? "bg-sky-500/10" : "bg-sky-300/30"}`} />
			<button type="button" onClick={onDismiss} aria-label="Tutup campaign" className={`absolute right-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full border text-2xl leading-none shadow-sm transition hover:rotate-90 hover:scale-105 focus-visible:outline-none focus-visible:ring-4 ${isDark ? "border-sky-200/15 bg-[#071a2c]/85 text-sky-50 hover:bg-sky-900/70 focus-visible:ring-sky-300/30" : "border-white/90 bg-white/90 text-[#16587B] hover:bg-white focus-visible:ring-sky-300/45"}`}>×</button>
			<div className={imageUrl ? "grid md:grid-cols-[.88fr_1.12fr]" : "relative"}>
				{imageUrl && <div className="relative min-h-48 overflow-hidden bg-sky-100 md:min-h-[34rem] dark:bg-slate-900"><img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover"/><div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#07182a]/40 via-transparent to-white/5" /></div>}
				<div className={`relative min-w-0 ${imageUrl ? "p-5 pt-16 sm:p-7 sm:pt-16" : compactRating ? "p-6 pt-16 sm:px-12 sm:pb-9 sm:pt-16" : "p-6 pt-16 sm:p-8 sm:pt-16"}`}>
					{!imageUrl && <div aria-hidden="true" className={`absolute right-16 top-6 grid h-12 w-12 place-items-center rounded-2xl border text-xl shadow-sm ${isDark ? "border-sky-200/15 bg-sky-400/10 text-sky-200" : "border-white bg-white/80 text-sky-600"}`}>{appearance.preset === "rating" ? "★" : appearance.preset === "event" ? "✦" : "✧"}</div>}
					<p className={`text-[9px] font-black uppercase tracking-[.19em] ${compactRating ? "text-center" : ""} ${isDark ? "text-sky-200/70" : "text-sky-700/80"}`}>{eyebrow}</p>
					<h2 id={titleId} className={`mt-2 ${compactRating ? "mx-auto max-w-[22ch] px-3 text-center" : "max-w-[17ch] pr-10"} ${campaignTitleClass(appearance.titleStyle, isDark)}`}>{title}</h2>
					{description && <p className={`mt-3 whitespace-pre-line text-sm leading-6 ${compactRating ? "mx-auto max-w-[38ch] text-center" : ""} ${textMuted}`}>{description}</p>}
					<div className={`mt-5 border-t pt-4 ${isDark ? "border-sky-100/10" : "border-sky-900/10"}`}>{children}</div>
				</div>
			</div>
		</section>
	</div>;
}
