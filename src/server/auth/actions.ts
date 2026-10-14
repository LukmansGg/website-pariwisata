"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import { checkLoginLimit } from "@/src/server/auth/rate-limit";

export type LoginState = {
	error?: string;
	success?: boolean;
	locked?: boolean;
	attemptsRemaining?: number;
	resetAt?: number;
};

export async function loginAction(
	_previousState: LoginState,
	formData: FormData,
): Promise<LoginState> {
	const email = String(formData.get("email") ?? "")
		.trim()
		.toLowerCase();

	const password = String(formData.get("password") ?? "");

	if (
		email.length > 254 ||
		password.length === 0 ||
		password.length > 1024 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
	) {
		return { error: "Email atau password tidak valid." };
	}

	const requestHeaders = await headers();

	// x-real-ip hanya boleh digunakan bila hosting
	// menjamin header ini ditimpa oleh proxy tepercaya.
	const trustedIp =
		requestHeaders.get("x-real-ip") ??
		(process.env.NODE_ENV !== "production" ? "127.0.0.1" : null);

	if (!trustedIp) {
		return {
			error: "Login sementara tidak tersedia. Coba lagi nanti.",
		};
	}

	let limit: Awaited<ReturnType<typeof checkLoginLimit>>;

	try {
		limit = await checkLoginLimit(email, trustedIp);
	} catch {
		return {
			error: "Login sementara tidak tersedia. Coba lagi nanti.",
		};
	}

	if (!limit.allowed) {
		return {
			error: "Terlalu banyak percobaan. Akses login dikunci sementara.",
			locked: true,
			attemptsRemaining: 0,
			resetAt: limit.resetAt,
		};
	}

	const supabase = await createClient();

	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});

	if (error || !data.user) {
		return {
			error: limit.attemptsRemaining === 0
				? "Batas tiga percobaan tercapai. Akses login dikunci sementara."
				: "Email atau password tidak valid.",
			locked: limit.attemptsRemaining === 0,
			attemptsRemaining: limit.attemptsRemaining,
			resetAt: limit.resetAt,
		};
	}

	// Jangan menganggap semua akun Supabase adalah staf.
	const { data: role, error: roleError } = await supabase
		.from("user_roles")
		.select("role")
		.eq("user_id", data.user.id)
		.maybeSingle();

	if (roleError || !role || !["admin", "editor"].includes(role.role)) {
		await supabase.auth.signOut();

		return {
			error: "Akun tidak memiliki akses staf.",
			attemptsRemaining: limit.attemptsRemaining,
			resetAt: limit.resetAt,
		};
	}

	return { success: true };
}

export async function logoutAction() {
	const supabase = await createClient();
	await supabase.auth.signOut();
	redirect("/login");
}

export type WorkspaceActionState = { error?: string; success?: string };

type StaffContext = {
	supabase: Awaited<ReturnType<typeof createClient>>;
	userId: string;
	role: "admin" | "editor";
};

async function requireStaff(): Promise<StaffContext | null> {
	const supabase = await createClient();
	const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
	const userId = claimsData?.claims.sub;
	if (claimsError || !userId) redirect("/login");

	const { data: staff, error } = await supabase
		.from("user_roles")
		.select("role")
		.eq("user_id", userId)
		.maybeSingle();
	if (error || !staff || !["admin", "editor"].includes(staff.role)) return null;
	return { supabase, userId, role: staff.role as StaffContext["role"] };
}

function value(formData: FormData, key: string, maxLength: number) {
	return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function optionalUrl(raw: string) {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

function parseCoordinates(formData: FormData, latitudeKey = "latitude", longitudeKey = "longitude") {
	const latRaw = value(formData, latitudeKey, 32);
	const lngRaw = value(formData, longitudeKey, 32);
	if (!latRaw && !lngRaw) return { latitude: null, longitude: null };
	const latitude = Number(latRaw);
	const longitude = Number(lngRaw);
	if (
		!latRaw || !lngRaw || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
		latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
	) return null;
	return { latitude, longitude };
}

function refreshWorkspace(options: { destinations?: boolean } = {}) {
	revalidatePath("/ruang-kelola");
	revalidatePath("/");
	revalidatePath("/scan");
	if (options.destinations) revalidateTag("public-destinations", { expire: 0 });
}

function hasValidDescriptionLength(description: string) {
	return description.trim() === "" || description.trim().split(/\s+/).length <= 300;
}

export async function createDestinationAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const slug = value(formData, "slug", 100).toLowerCase();
	const name = value(formData, "name", 160);
	const description = value(formData, "description", 10000);
	const categories = [...new Set(formData.getAll("categories").map((item) => String(item).trim()).filter((item) => ["Alam", "Kuliner", "Spot Foto", "Sejarah & Budaya", "Petualangan & Aktivitas", "Rekreasi", "Religi", "Lainnya"].includes(item)))];
	const shortDescription = value(formData, "short_description", 180);
	const address = value(formData, "address", 500);
	const imageUrlRaw = value(formData, "image_url", 2048);
	const imageUrl = optionalUrl(imageUrlRaw);
	const coordinates = parseCoordinates(formData);
	const hasCoordinateInput = Boolean(value(formData, "latitude", 32) || value(formData, "longitude", 32));
	const hasValidCoordinates = coordinates !== null && coordinates.latitude !== null && coordinates.longitude !== null;
	const qrCoordinates = parseCoordinates(formData, "qr_latitude", "qr_longitude");
	const qrCode = value(formData, "qr_code", 110).toLowerCase();
	const qrName = value(formData, "qr_name_visible", 120);
	const tags = value(formData, "tags", 500)
		.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 15);
	const allowedMinigames = new Set(["find_friends", "photobox"]);
	const additionalMinigames = [...new Set(formData.getAll("additional_minigames").map(String).filter((game) => allowedMinigames.has(game)))];
	const wantsPublication = formData.get("is_published") === "on";
	const isPublished = wantsPublication && hasValidCoordinates && Boolean(imageUrl);

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		return { error: "Slug gunakan huruf kecil, angka, dan tanda hubung." };
	}
	if (!name || !hasValidDescriptionLength(description) || (hasCoordinateInput && coordinates === null) || !hasValidCoordinates || !qrCoordinates || qrCoordinates.latitude === null || qrCoordinates.longitude === null || !qrName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(qrCode) || (imageUrlRaw && !imageUrl)) {
		return { error: !hasValidDescriptionLength(description) ? "Deskripsi destinasi maksimal 300 kata." : "Lengkapi pin destinasi, nama dan kode QR, serta koordinat pemasangan QR yang valid." };
	}

	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk menginput data." };

	const { error } = await staff.supabase.rpc("save_destination_with_qr", {
		p_destination_id: null,
		p_qr_point_id: null,
		p_slug: slug,
		p_name: name,
		p_description: description,
		p_categories: categories,
		p_short_description: shortDescription,
		p_address: address || null,
		p_latitude: coordinates.latitude,
		p_longitude: coordinates.longitude,
		p_image_url: imageUrl,
		p_tags: tags,
		p_is_featured: formData.get("is_featured") === "on",
		p_is_published: isPublished,
		p_additional_minigames: additionalMinigames,
		p_qr_name: qrName,
		p_qr_code: qrCode,
		p_qr_address: value(formData, "qr_address", 500) || address || null,
		p_qr_latitude: qrCoordinates.latitude,
		p_qr_longitude: qrCoordinates.longitude,
	});
	if (error) {
		return { error: error.code === "23505" ? "Slug wisata atau kode QR sudah dipakai. Periksa kembali lalu coba lagi." : "Wisata dan titik QR belum tersimpan. Jalankan migration fitur QR utama di Supabase, lalu coba lagi." };
	}

	refreshWorkspace({ destinations: true });
	return { success: isPublished ? "Destinasi dan QR utama berhasil disimpan; wisata sudah diterbitkan." : wantsPublication ? "Destinasi dan QR utama tersimpan sebagai draft. Lengkapi foto sampul sebelum tayang." : "Destinasi dan QR utama berhasil disimpan sebagai draft." };
}

export async function updateDestinationAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const id = value(formData, "id", 64);
	const slug = value(formData, "slug", 100).toLowerCase();
	const name = value(formData, "name", 160);
	const description = value(formData, "description", 10000);
	const categories = [...new Set(formData.getAll("categories").map((item) => String(item).trim()).filter((item) => ["Alam", "Kuliner", "Spot Foto", "Sejarah & Budaya", "Petualangan & Aktivitas", "Rekreasi", "Religi", "Lainnya"].includes(item)))];
	const shortDescription = value(formData, "short_description", 180);
	const address = value(formData, "address", 500);
	const imageUrlRaw = value(formData, "image_url", 2048);
	const imageUrl = optionalUrl(imageUrlRaw);
	const coordinates = parseCoordinates(formData);
	const hasCoordinateInput = Boolean(value(formData, "latitude", 32) || value(formData, "longitude", 32));
	const hasValidCoordinates = coordinates !== null && coordinates.latitude !== null && coordinates.longitude !== null;
	const qrCoordinates = parseCoordinates(formData, "qr_latitude", "qr_longitude");
	const qrPointId = value(formData, "qr_point_id", 64);
	const qrCode = value(formData, "qr_code", 110).toLowerCase();
	const qrName = value(formData, "qr_name_visible", 120);
	const tags = value(formData, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 15);
	const allowedMinigames = new Set(["find_friends", "photobox"]);
	const additionalMinigames = [...new Set(formData.getAll("additional_minigames").map(String).filter((game) => allowedMinigames.has(game)))];
	const wantsPublication = formData.get("is_published") === "on";
	const isPublished = wantsPublication && hasValidCoordinates && Boolean(imageUrl);
	if (!id || !name || !hasValidDescriptionLength(description) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || (hasCoordinateInput && coordinates === null) || !hasValidCoordinates || !qrCoordinates || qrCoordinates.latitude === null || qrCoordinates.longitude === null || !qrName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(qrCode) || (imageUrlRaw && !imageUrl)) {
		return { error: !hasValidDescriptionLength(description) ? "Deskripsi destinasi maksimal 300 kata." : "Periksa nama, tautan, foto, serta koordinat destinasi dan QR." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengedit data wisata." };
	const { error } = await staff.supabase.rpc("save_destination_with_qr", {
		p_destination_id: id,
		p_qr_point_id: qrPointId || null,
		p_slug: slug,
		p_name: name,
		p_description: description,
		p_categories: categories,
		p_short_description: shortDescription,
		p_address: address || null,
		p_latitude: coordinates.latitude,
		p_longitude: coordinates.longitude,
		p_image_url: imageUrl,
		p_tags: tags,
		p_is_featured: formData.get("is_featured") === "on",
		p_is_published: isPublished,
		p_additional_minigames: additionalMinigames,
		p_qr_name: qrName,
		p_qr_code: qrCode,
		p_qr_address: value(formData, "qr_address", 500) || address || null,
		p_qr_latitude: qrCoordinates.latitude,
		p_qr_longitude: qrCoordinates.longitude,
	});
	if (error) return { error: error.code === "23505" ? "Link wisata atau kode QR sudah digunakan." : "Perubahan wisata dan QR belum tersimpan. Periksa migration serta akses Supabase." };
	refreshWorkspace({ destinations: true });
	return { success: isPublished ? "Wisata dan QR utama diperbarui; wisata sudah tayang." : wantsPublication ? "Perubahan dan QR tersimpan sebagai draft. Lengkapi foto sampul sebelum tayang." : "Perubahan wisata dan QR utama berhasil disimpan." };
}

export async function createQrPointAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const destinationId = value(formData, "destination_id", 64);
	const code = value(formData, "code", 100).toLowerCase();
	const name = value(formData, "name", 120);
	const address = value(formData, "address", 500);
	const coordinates = parseCoordinates(formData);
	if (!destinationId || !name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) || !coordinates) {
		return { error: "Lengkapi destinasi, nama titik, kode QR, dan pasangan koordinat yang valid." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola titik QR." };
	const { error } = await staff.supabase.from("qr_points").insert({
		destination_id: destinationId,
		name,
		code,
		address: address || null,
		...coordinates,
		created_by: staff.userId,
	});
	if (error) return { error: error.code === "23505" ? "Kode QR sudah digunakan." : "Titik QR belum tersimpan. Periksa pilihan destinasi dan migrasi database." };
	refreshWorkspace();
	return { success: "Titik QR berhasil disimpan." };
}

export async function createPartnerAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const destinationId = value(formData, "destination_id", 64);
	const maxDistanceRaw = value(formData, "max_distance_meters", 8);
	const maxDistanceMeters = Number(maxDistanceRaw || "500");
	const businessName = value(formData, "business_name", 160);
	const slug = value(formData, "slug", 100).toLowerCase();
	const businessType = value(formData, "business_type", 80);
	const description = value(formData, "description", 5000);
	const contactName = value(formData, "contact_name", 120);
	const contactEmail = value(formData, "contact_email", 254).toLowerCase();
	const contactPhone = value(formData, "contact_phone", 40);
	const address = value(formData, "address", 500);
	const websiteRaw = value(formData, "website_url", 2048);
	const websiteUrl = optionalUrl(websiteRaw);
	const logoUrlRaw = value(formData, "logo_url", 2048);
	const logoUrl = optionalUrl(logoUrlRaw);
	if (!destinationId || !Number.isInteger(maxDistanceMeters) || maxDistanceMeters < 50 || maxDistanceMeters > 2000 || maxDistanceMeters % 50 !== 0 || !businessName || !businessType || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) || (websiteRaw && !websiteUrl) || (logoUrlRaw && !logoUrl)) {
		return { error: "Periksa nama, jenis usaha, slug, destinasi wisata, dan batas jarak 50–2.000 meter. Pastikan email dan tautan valid." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola mitra." };
	const { data: destination, error: destinationError } = await staff.supabase
		.from("destinations")
		.select("id, latitude, longitude")
		.eq("id", destinationId)
		.maybeSingle();
	if (destinationError || !destination || destination.latitude === null || destination.longitude === null) {
		return { error: "Pilih wisata lokal yang memiliki koordinat valid agar batas jarak QR bisa digunakan." };
	}
	const { error } = await staff.supabase.from("tourism_partners").insert({
		business_name: businessName,
		slug,
		destination_id: destinationId,
		max_distance_meters: maxDistanceMeters,
		business_type: businessType,
		description,
		contact_name: contactName || null,
		contact_email: contactEmail || null,
		contact_phone: contactPhone || null,
		address: address || null,
		website_url: websiteUrl,
		logo_url: logoUrl,
		created_by: staff.userId,
	});
	if (error) return { error: error.code === "23505" ? "Slug mitra sudah digunakan." : "Data mitra belum tersimpan. Periksa migrasi database dan coba lagi." };
	refreshWorkspace();
	return { success: "Mitra lokal berhasil disimpan." };
}

export async function updatePartnerProximityAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const partnerId = value(formData, "partner_id", 64);
	const destinationId = value(formData, "destination_id", 64);
	const maxDistanceMeters = Number(value(formData, "max_distance_meters", 8));
	if (!partnerId || !destinationId || !Number.isInteger(maxDistanceMeters) || maxDistanceMeters < 50 || maxDistanceMeters > 2000 || maxDistanceMeters % 50 !== 0) {
		return { error: "Pilih wisata lokal dan batas jarak 50–2.000 meter dengan kelipatan 50 meter." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola mitra." };
	const { data: destination, error: destinationError } = await staff.supabase
		.from("destinations")
		.select("id, latitude, longitude")
		.eq("id", destinationId)
		.maybeSingle();
	if (destinationError || !destination || destination.latitude === null || destination.longitude === null) {
		return { error: "Pilih wisata lokal yang memiliki koordinat valid." };
	}
	const { error } = await staff.supabase
		.from("tourism_partners")
		.update({ destination_id: destinationId, max_distance_meters: maxDistanceMeters })
		.eq("id", partnerId);
	if (error) return { error: "Keterkaitan wisata mitra belum tersimpan. Periksa migrasi database dan coba lagi." };
	refreshWorkspace();
	return { success: "Wisata lokal dan radius minigame berhasil diperbarui." };
}

export async function createPromotionAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const partnerId = value(formData, "partner_id", 64);
	const qrPointId = value(formData, "qr_point_id", 64);
	const title = value(formData, "title", 160);
	const description = value(formData, "description", 5000);
	const experienceType = value(formData, "experience_type", 20);
	const ctaLabel = value(formData, "cta_label", 60);
	const ctaUrlRaw = value(formData, "cta_url", 2048);
	const ctaUrl = optionalUrl(ctaUrlRaw);
	const imageUrlRaw = value(formData, "image_url", 2048);
	const imageUrl = optionalUrl(imageUrlRaw);
	const startsAtRaw = value(formData, "starts_at", 32);
	const endsAtRaw = value(formData, "ends_at", 32);
	const startsAt = startsAtRaw ? new Date(`${startsAtRaw}T00:00:00+07:00`) : null;
	const endsAt = endsAtRaw ? new Date(`${endsAtRaw}T23:59:59+07:00`) : null;
	if (!partnerId || !qrPointId || !title || !["popup", "minigame", "photobox"].includes(experienceType) || (ctaUrlRaw && !ctaUrl) || (imageUrlRaw && !imageUrl) || (startsAt && !Number.isFinite(startsAt.getTime())) || (endsAt && !Number.isFinite(endsAt.getTime())) || (startsAt && endsAt && endsAt <= startsAt)) {
		return { error: "Periksa mitra, titik QR, metode aktivasi, tautan, dan jadwal promosi." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola promosi." };
	const [{ data: partner }, { data: qrPoint }] = await Promise.all([
		staff.supabase.from("tourism_partners").select("destination_id").eq("id", partnerId).maybeSingle(),
		staff.supabase.from("qr_points").select("destination_id").eq("id", qrPointId).maybeSingle(),
	]);
	if (!partner?.destination_id) {
		return { error: "Mitra ini belum ditautkan ke wisata lokal. Lengkapi data keterkaitan mitra terlebih dahulu." };
	}
	if (!qrPoint || qrPoint.destination_id !== partner.destination_id) {
		return { error: "Pilih titik QR yang berada di wisata lokal yang ditautkan ke mitra ini." };
	}
	const { error } = await staff.supabase.from("promotion_campaigns").insert({
		partner_id: partnerId,
		qr_point_id: qrPointId,
		title,
		description,
		image_url: imageUrl,
		experience_type: experienceType,
		cta_label: ctaLabel || null,
		cta_url: ctaUrl,
		starts_at: startsAt?.toISOString() ?? null,
		ends_at: endsAt?.toISOString() ?? null,
		status: formData.get("is_published") === "on" ? "published" : "draft",
		created_by: staff.userId,
	});
	if (error) return { error: "Promosi belum tersimpan. Pastikan mitra dan titik QR masih aktif." };
	refreshWorkspace();
	return { success: "Kampanye promosi berhasil disimpan." };
}
