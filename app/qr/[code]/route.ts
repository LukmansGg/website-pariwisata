import { createClient } from "@/src/infrastructure/supabase/server";
import { connection, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ code: string }> };

const unavailablePage = `<!doctype html>
<html lang="id">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="robots" content="noindex,nofollow" />
	<title>QR belum tersedia · MadiunTrip</title>
	<style>
		*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 15%,#dff5ff 0,transparent 36%),linear-gradient(145deg,#f8fcff,#eaf7ff 55%,#f8fbff);color:#16587b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.card{width:min(100%,560px);padding:38px 28px;text-align:center;border:1px solid rgba(255,255,255,.9);border-radius:32px;background:rgba(255,255,255,.82);box-shadow:0 24px 90px -42px rgba(22,88,123,.35);backdrop-filter:blur(18px)}.mascot{width:132px;height:132px;margin:auto;display:grid;place-items:center;border-radius:30px;background:linear-gradient(135deg,#e0f5ff,#fff);box-shadow:inset 0 2px 12px rgba(22,88,123,.08)}.mascot svg{width:112px;height:112px}.eyebrow{margin:24px 0 8px;color:#0369a1;font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}.mark{margin:0;font-size:56px;font-weight:900;letter-spacing:-.06em}.title{margin:8px 0;font-size:clamp(22px,5vw,30px);font-weight:850;letter-spacing:-.03em}.copy{max-width:390px;margin:12px auto 26px;color:rgba(22,88,123,.72);font-size:15px;line-height:1.65}.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}.button{min-height:48px;display:inline-flex;align-items:center;justify-content:center;padding:12px 20px;border:1px solid #c7e5f4;border-radius:13px;background:white;color:#16587b;font-size:14px;font-weight:750;text-decoration:none}.button.primary{border-color:#16587b;background:#16587b;color:white;box-shadow:0 8px 20px rgba(22,88,123,.16)}.button:focus-visible{outline:3px solid #93d5f3;outline-offset:3px}@media(max-width:420px){.card{padding:30px 20px}.actions{flex-direction:column}.button{width:100%}}
	</style>
</head>
<body>
	<main class="card">
		<div class="mascot" aria-hidden="true"><svg viewBox="0 0 120 120" fill="none"><path d="M27 96c4-18 16-29 33-29s29 11 33 29" fill="#d9f0fb"/><path d="M60 13c-18 0-31 14-31 31 0 24 31 51 31 51s31-27 31-51c0-17-13-31-31-31Z" fill="#fff" stroke="#2b8bb5" stroke-width="4"/><path d="m62 25 4 9 10 1-7.5 6.5 2 10L62 46l-8.5 5 2-10L48 35l10-1 4-9Z" fill="#73c7ed"/><circle cx="52" cy="61" r="2.5" fill="#16587b"/><circle cx="69" cy="61" r="2.5" fill="#16587b"/><path d="M55 69c3 3 8 3 11 0" stroke="#16587b" stroke-linecap="round" stroke-width="2.5"/></svg></div>
		<p class="eyebrow">MadiunTrip · Pemindai QR</p>
		<p class="mark">QR?</p>
		<h1 class="title">QR-nya belum ketemu</h1>
		<p class="copy">Kode ini belum dapat membuka destinasi. Pastikan QR yang dipindai benar dan masih berlaku.</p>
		<nav class="actions" aria-label="Navigasi"><a class="button primary" href="/scan">Pindai ulang ↻</a><a class="button" href="/">Kembali ke beranda ⌂</a></nav>
	</main>
</body>
</html>`;

function notFoundResponse() {
	return new Response(unavailablePage, {
		status: 404,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Robots-Tag": "noindex, nofollow",
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "no-referrer",
		},
	});
}

export async function GET(request: Request, { params }: RouteContext) {
	await connection();
	const { code } = await params;
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) return notFoundResponse();

	try {
		const supabase = await createClient();
		const { data, error } = await supabase.rpc("resolve_public_qr", { p_code: code });
		const destination = Array.isArray(data) ? data[0] : data;
		if (
			error || !destination || typeof destination !== "object" ||
			!("slug" in destination) || typeof destination.slug !== "string" ||
			!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destination.slug)
		) return notFoundResponse();

		const target = new URL(`/wisata/${encodeURIComponent(destination.slug)}`, request.url);
		target.searchParams.set("qr", code);
		return NextResponse.redirect(target);
	} catch {
		return notFoundResponse();
	}
}
