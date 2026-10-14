import { getCachedPublishedDestinations } from "@/src/server/destinations/public";
import { connection } from "next/server";

export async function GET(request: Request) {
	await connection();
	try {
		const data = await getCachedPublishedDestinations();
		const search = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80).toLocaleLowerCase("id") ?? "";
		const filteredData = search
			? data.filter((destination) => {
				const searchable = [destination.name, destination.short_description, destination.description, destination.category, ...(Array.isArray(destination.categories) ? destination.categories : []), ...(Array.isArray(destination.tags) ? destination.tags : [])]
					.filter((value): value is string => typeof value === "string")
					.join(" ")
					.toLocaleLowerCase("id");
				return searchable.includes(search);
			})
			: data;
		return Response.json(
			{ data: filteredData },
			{ headers: { "Cache-Control": search ? "no-store" : "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } },
		);
	} catch {
		return Response.json(
			{ error: "Destinasi belum dapat dimuat. Coba lagi sebentar." },
			{ status: 503, headers: { "Cache-Control": "no-store" } },
		);
	}
}
