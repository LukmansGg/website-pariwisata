import { createClient } from "@supabase/supabase-js";

const REGION_ID = "madiun";
const BOUNDS = { minX: 111.18, maxX: 111.88, minY: -7.91, maxY: -7.32 };
// Stable OSM relation IDs avoid Nominatim's fuzzy text matching for admin areas.
const MADIUN_OSM_RELATIONS = { county: "9676371", city: "9676370" };
type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
type Feature = { type: "Feature"; properties?: Record<string, unknown>; geometry: Geometry };
type RegionRecord = { id: string; name: string; county_geojson: Feature | null; city_geojson: Feature | null };
type MapArea = { id: "county" | "city"; name: string; latitude: number; longitude: number };
let boundaryBootstrap: Promise<{ county: Feature; city: Feature }> | null = null;

function toSvgPath(geometry: Geometry) {
	const rings: number[][][] = [];
	const collect = (value: unknown) => {
		if (!Array.isArray(value)) return;
		if (value.length && Array.isArray(value[0]) && typeof value[0][0] === "number") { rings.push(value as number[][]); return; }
		value.forEach(collect);
	};
	collect(geometry.coordinates);
	return rings.map((ring) => `${ring.map((point, index) => {
		const x = ((point[0] - BOUNDS.minX) / (BOUNDS.maxX - BOUNDS.minX)) * 1000;
		const y = (1 - (point[1] - BOUNDS.minY) / (BOUNDS.maxY - BOUNDS.minY)) * 560;
		return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
	}).join(" ")} Z`).join(" ");
}

function supabase() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (!url || !key) throw new Error("Supabase is not configured");
	return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchMadiunBoundaries(): Promise<{ county: Feature; city: Feature }> {
	const params = new URLSearchParams({ osm_ids: `R${MADIUN_OSM_RELATIONS.county},R${MADIUN_OSM_RELATIONS.city}`, format: "geojson", polygon_geojson: "1", polygon_threshold: "0.0005" });
	const nominatimUrl = (process.env.OSM_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
	const response = await fetch(`${nominatimUrl}/lookup?${params}`, {
		cache: "no-store",
		headers: { Accept: "application/geo+json", "User-Agent": "TiLoc/1.0 (one-time map boundary cache)" },
	});
	if (!response.ok) throw new Error("OSM boundary request failed");
	const data = await response.json() as { features?: Feature[] };
	const get = (id: string) => data.features?.find((feature) => String(feature.properties?.osm_id) === id && (feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon"));
	const county = get(MADIUN_OSM_RELATIONS.county);
	const city = get(MADIUN_OSM_RELATIONS.city);
	if (!county || !city) throw new Error("OSM did not return the Madiun city and regency boundaries");
	return { county, city };
}

function getAreaCenter(geometry: Geometry) {
	let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
	const rings: number[][][] = [];
	const visit = (value: unknown) => {
		if (!Array.isArray(value)) return;
		if (value.length && Array.isArray(value[0]) && typeof value[0][0] === "number") {
			rings.push(value as number[][]);
		}
		if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
			minLon = Math.min(minLon, value[0]); maxLon = Math.max(maxLon, value[0]);
			minLat = Math.min(minLat, value[1]); maxLat = Math.max(maxLat, value[1]);
			return;
		}
		value.forEach(visit);
	};
	visit(geometry.coordinates);
	const mainRing = rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
	const center = mainRing ? ringCentroid(mainRing) : null;
	if (center && Number.isFinite(center.longitude) && Number.isFinite(center.latitude)) return center;
	return { latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2 };
}

function ringArea(ring: number[][]) {
	return ring.reduce((sum, point, index) => {
		const next = ring[(index + 1) % ring.length];
		return sum + point[0] * next[1] - next[0] * point[1];
	}, 0) / 2;
}

function ringCentroid(ring: number[][]) {
	let areaTwice = 0, longitudeSum = 0, latitudeSum = 0;
	for (let index = 0; index < ring.length; index += 1) {
		const point = ring[index], next = ring[(index + 1) % ring.length];
		const cross = point[0] * next[1] - next[0] * point[1];
		areaTwice += cross;
		longitudeSum += (point[0] + next[0]) * cross;
		latitudeSum += (point[1] + next[1]) * cross;
	}
	return Math.abs(areaTwice) < 1e-12 ? null : { longitude: longitudeSum / (3 * areaTwice), latitude: latitudeSum / (3 * areaTwice) };
}

function mapAreas(region: RegionRecord): MapArea[] {
	return [
		region.county_geojson && { id: "county" as const, name: "Kabupaten Madiun", ...getAreaCenter(region.county_geojson.geometry) },
		region.city_geojson && { id: "city" as const, name: "Kota Madiun", ...getAreaCenter(region.city_geojson.geometry) },
	].filter((area): area is MapArea => Boolean(area));
}

export async function GET() {
	try {
		const db = supabase();
		const read = () => db.from("map_regions").select("id,name,county_geojson,city_geojson").eq("id", REGION_ID).maybeSingle();
		const current = await read();
		if (current.error || !current.data) throw new Error("Default map region is missing; apply the map_regions migration");
		let region = current.data as RegionRecord;
		if (!region.county_geojson || !region.city_geojson) {
			boundaryBootstrap ??= fetchMadiunBoundaries().finally(() => { boundaryBootstrap = null; });
			const { county, city } = await boundaryBootstrap;
			const { data, error } = await db.from("map_regions").update({ county_geojson: county, city_geojson: city, source: "OpenStreetMap", updated_at: new Date().toISOString() }).eq("id", REGION_ID).is("county_geojson", null).is("city_geojson", null).select("id,name,county_geojson,city_geojson").maybeSingle();
			if (error) throw new Error("Could not cache OSM boundaries in Supabase");
			if (data) region = data as RegionRecord;
			else {
				const refreshed = await read();
				if (refreshed.error || !refreshed.data?.county_geojson || !refreshed.data?.city_geojson) throw new Error("OSM boundary cache could not be read");
				region = refreshed.data as RegionRecord;
			}
		}
		if (!region.county_geojson || !region.city_geojson) throw new Error("Cached OSM boundaries are incomplete");
		return Response.json({ id: region.id, name: region.name, countyPath: toSvgPath(region.county_geojson.geometry), cityPath: toSvgPath(region.city_geojson.geometry), areas: mapAreas(region) }, { headers: { "Cache-Control": "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=604800" } });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : "Batas wilayah belum tersedia." }, { status: 503, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
	}
}
