"use client";

import { useId } from "react";

export function TiLocMark({ className = "h-10 w-10" }: { className?: string }) {
	const gradientId = `tiloc-mark-${useId().replace(/:/g, "")}`;
	return <svg aria-hidden="true" viewBox="0 0 48 48" className={`shrink-0 drop-shadow-sm ${className}`}>
		<defs><linearGradient id={gradientId} x1="8" y1="7" x2="39" y2="42" gradientUnits="userSpaceOnUse"><stop stopColor="#4BB8E5"/><stop offset="1" stopColor="#16587B"/></linearGradient></defs>
		<path d="M24 44S7 29.1 7 18.7a17 17 0 1 1 34 0C41 29.1 24 44 24 44Z" fill={`url(#${gradientId})`}/>
		<circle cx="24" cy="18.5" r="9.6" fill="#F5EEDD"/>
		<path d="m24 11.8 1.85 4.75 5.1.23-3.95 3.23 1.35 4.92L24 22.15l-4.35 2.78L21 20.01l-3.95-3.23 5.1-.23L24 11.8Z" fill="#F3B94D"/>
		<path d="m38.5 4 .9 2.25 2.35.1-1.8 1.45.6 2.25-2.05-1.25-2 1.25.6-2.25-1.8-1.45 2.3-.1.9-2.25Z" fill="#F3B94D"/>
	</svg>;
}

export function TiLocBrand({
	className = "",
	markClassName = "h-10 w-10",
	wordmarkClassName = "text-xl font-black tracking-tight text-sky-950 dark:text-sky-50",
	accentClassName = "text-amber-500",
	tagline,
	taglineClassName = "mt-1 block text-[9px] font-extrabold uppercase tracking-[.15em] text-sky-900/55 dark:text-sky-100/55",
}: {
	className?: string;
	markClassName?: string;
	wordmarkClassName?: string;
	accentClassName?: string;
	tagline?: string;
	taglineClassName?: string;
}) {
	return <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
		<TiLocMark className={markClassName}/>
		<span className="min-w-0">
			<span className={`block leading-none ${wordmarkClassName}`}>TiLoc<span className={accentClassName}>!</span></span>
			{tagline && <span className={taglineClassName}>{tagline}</span>}
		</span>
	</span>;
}
