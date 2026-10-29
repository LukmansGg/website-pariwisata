import { createClient } from "@/src/infrastructure/supabase/server";
import { connection, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ code: string }> };

const unavailablePage = `<!doctype html>
<html lang="id">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="robots" content="noindex,nofollow" />
	<title>QR belum tersedia · TiLoc!</title>
	<style>
		*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 15%,#dff5ff 0,transparent 36%),linear-gradient(145deg,#f8fcff,#eaf7ff 55%,#f8fbff);color:#16587b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.card{width:min(100%,560px);padding:38px 28px;text-align:center;border:1px solid rgba(255,255,255,.9);border-radius:32px;background:rgba(255,255,255,.82);box-shadow:0 24px 90px -42px rgba(22,88,123,.35);backdrop-filter:blur(18px)}.mascot{width:132px;height:132px;margin:auto;display:grid;place-items:center;border-radius:30px;background:linear-gradient(135deg,#e0f5ff,#fff);box-shadow:inset 0 2px 12px rgba(22,88,123,.08)}.mascot svg{width:112px;height:112px}.eyebrow{margin:24px 0 8px;color:#0369a1;font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}.mark{margin:0;font-size:56px;font-weight:900;letter-spacing:-.06em}.title{margin:8px 0;font-size:clamp(22px,5vw,30px);font-weight:850;letter-spacing:-.03em}.copy{max-width:390px;margin:12px auto 26px;color:rgba(22,88,123,.72);font-size:15px;line-height:1.65}.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}.button{min-height:48px;display:inline-flex;align-items:center;justify-content:center;padding:12px 20px;border:1px solid #c7e5f4;border-radius:13px;background:white;color:#16587b;font-size:14px;font-weight:750;text-decoration:none}.button.primary{border-color:#16587b;background:#16587b;color:white;box-shadow:0 8px 20px rgba(22,88,123,.16)}.button:focus-visible{outline:3px solid #93d5f3;outline-offset:3px}@media(max-width:420px){.card{padding:30px 20px}.actions{flex-direction:column}.button{width:100%}}
	</style>
</head>
<body>
	<main class="card">
		<div class="mascot" aria-hidden="true"><svg viewBox="0 0 48 48"><defs><linearGradient id="tiloc-mark-gradient" x1="8" y1="7" x2="39" y2="42"><stop stop-color="#4BB8E5"/><stop offset="1" stop-color="#16587B"/></linearGradient></defs><path d="M24 44S7 29.1 7 18.7a17 17 0 1 1 34 0C41 29.1 24 44 24 44Z" fill="url(#tiloc-mark-gradient)"/><circle cx="24" cy="18.5" r="9.6" fill="#F5EEDD"/><path d="m24 11.8 1.85 4.75 5.1.23-3.95 3.23 1.35 4.92L24 22.15l-4.35 2.78L21 20.01l-3.95-3.23 5.1-.23L24 11.8Z" fill="#F3B94D"/><path d="m38.5 4 .9 2.25 2.35.1-1.8 1.45.6 2.25-2.05-1.25-2 1.25.6-2.25-1.8-1.45 2.3-.1.9-2.25Z" fill="#F3B94D"/></svg></div>
		<p class="eyebrow">TiLoc! · Pemindai QR</p>
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
