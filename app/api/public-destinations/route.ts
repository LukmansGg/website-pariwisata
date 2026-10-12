import { getCachedPublishedDestinations } from "@/src/server/destinations/public";
import { connection } from "next/server";

export async function GET() {
	await connection();
	try {
		const data = await getCachedPublishedDestinations();
		return Response.json(
			{ data },
			{ headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } },
		);
	} catch {
		return Response.json(
			{ error: "Destinasi belum dapat dimuat. Coba lagi sebentar." },
			{ status: 503, headers: { "Cache-Control": "no-store" } },
		);
	}
}
