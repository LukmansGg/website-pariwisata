type PhotonFeature = {
	geometry?: { coordinates?: [number, number] };
	properties?: {
		name?: string;
		street?: string;
		district?: string;
		city?: string;
		county?: string;
		state?: string;
		country?: string;
		countrycode?: string;
	};
};

export async function GET(request: Request) {
	const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
	if (query.length < 3 || query.length > 120) return Response.json({ features: [] });

	const params = new URLSearchParams({ q: query, limit: "6", lang: "id", countrycode: "id", lat: "-7.6298", lon: "111.5239", location_bias_scale: "0.15" });
	try {
		const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
			headers: { Accept: "application/geo+json", "User-Agent": "TiLoc tourism location picker" },
			next: { revalidate: 1800 },
		});
		if (!response.ok) return Response.json({ features: [], message: "Pencarian lokasi sedang sibuk." }, { status: 502 });
		const result = await response.json() as { features?: PhotonFeature[] };
		const features = (result.features ?? []).filter((feature) => {
			const [longitude, latitude] = feature.geometry?.coordinates ?? [];
			return Number.isFinite(latitude) && Number.isFinite(longitude);
		}).slice(0, 6);
		return Response.json({ features }, { headers: { "Cache-Control": "private, max-age=30" } });
	} catch {
		return Response.json({ features: [], message: "Pencarian lokasi belum tersambung. Kamu tetap bisa memakai lokasi perangkat atau mengisi koordinat." }, { status: 502 });
	}
}
