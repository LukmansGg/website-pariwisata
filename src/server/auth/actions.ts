"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/src/infrastructure/supabase/server";
import { checkLoginLimit } from "@/src/server/auth/rate-limit";
import { isMinigameComponentKey, minigameComponentRegistry } from "@/src/features/minigames/registry";

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
	const mascotMode = value(formData, "mascot_mode", 16) === "custom" ? "custom" : "tiloc";
	const mascotImageUrlRaw = value(formData, "mascot_image_url", 2048);
	const mascotImageUrl = optionalUrl(mascotImageUrlRaw);
	const coordinates = parseCoordinates(formData);
	const hasCoordinateInput = Boolean(value(formData, "latitude", 32) || value(formData, "longitude", 32));
	const hasValidCoordinates = coordinates !== null && coordinates.latitude !== null && coordinates.longitude !== null;
	const qrCoordinates = parseCoordinates(formData, "qr_latitude", "qr_longitude");
	const qrCode = value(formData, "qr_code", 110).toLowerCase();
	const qrName = value(formData, "qr_name_visible", 120);
	const tags = value(formData, "tags", 500)
		.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 15);
	const wantsPublication = formData.get("is_published") === "on";
	const isPublished = wantsPublication && hasValidCoordinates && Boolean(imageUrl);

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		return { error: "Slug gunakan huruf kecil, angka, dan tanda hubung." };
	}
	if (!name || !hasValidDescriptionLength(description) || (hasCoordinateInput && coordinates === null) || !hasValidCoordinates || !qrCoordinates || qrCoordinates.latitude === null || qrCoordinates.longitude === null || !qrName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(qrCode) || (imageUrlRaw && !imageUrl) || (mascotImageUrlRaw && !mascotImageUrl) || (mascotMode === "custom" && !mascotImageUrl)) {
		return { error: !hasValidDescriptionLength(description) ? "Deskripsi destinasi maksimal 300 kata." : "Lengkapi pin destinasi, nama dan kode QR, serta koordinat pemasangan QR yang valid." };
	}

	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk menginput data." };
	const { error: mascotSchemaError } = await staff.supabase.from("destinations").select("mascot_mode").limit(1);
	if (mascotSchemaError) return { error: "Pengaturan maskot belum siap. Jalankan migration 20261018000000_minigame_programs.sql sebelum menyimpan wisata." };

	const { data: saved, error } = await staff.supabase.rpc("save_destination_with_qr", {
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
		p_additional_minigames: [],
		p_qr_name: qrName,
		p_qr_code: qrCode,
		p_qr_address: value(formData, "qr_address", 500) || address || null,
		p_qr_latitude: qrCoordinates.latitude,
		p_qr_longitude: qrCoordinates.longitude,
	});
	if (error) {
		return { error: error.code === "23505" ? "Slug wisata atau kode QR sudah dipakai. Periksa kembali lalu coba lagi." : "Wisata dan titik QR belum tersimpan. Jalankan migration fitur QR utama di Supabase, lalu coba lagi." };
	}
	const savedDestinationId = Array.isArray(saved) ? saved[0]?.destination_id : saved?.destination_id;
	if (!savedDestinationId) return { error: "Wisata tersimpan, tetapi pengaturan maskot belum dapat diterapkan." };
	const { error: mascotError } = await staff.supabase.from("destinations")
		.update({ mascot_mode: mascotMode, mascot_image_url: mascotMode === "custom" ? mascotImageUrl : null }).eq("id", savedDestinationId);
	if (mascotError) return { error: "Wisata tersimpan, tetapi pengaturan maskot belum dapat diterapkan. Jalankan migration minigame programs." };

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
	const mascotMode = value(formData, "mascot_mode", 16) === "custom" ? "custom" : "tiloc";
	const mascotImageUrlRaw = value(formData, "mascot_image_url", 2048);
	const mascotImageUrl = optionalUrl(mascotImageUrlRaw);
	const coordinates = parseCoordinates(formData);
	const hasCoordinateInput = Boolean(value(formData, "latitude", 32) || value(formData, "longitude", 32));
	const hasValidCoordinates = coordinates !== null && coordinates.latitude !== null && coordinates.longitude !== null;
	const qrCoordinates = parseCoordinates(formData, "qr_latitude", "qr_longitude");
	const qrPointId = value(formData, "qr_point_id", 64);
	const qrCode = value(formData, "qr_code", 110).toLowerCase();
	const qrName = value(formData, "qr_name_visible", 120);
	const tags = value(formData, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 15);
	const wantsPublication = formData.get("is_published") === "on";
	const isPublished = wantsPublication && hasValidCoordinates && Boolean(imageUrl);
	if (!id || !name || !hasValidDescriptionLength(description) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || (hasCoordinateInput && coordinates === null) || !hasValidCoordinates || !qrCoordinates || qrCoordinates.latitude === null || qrCoordinates.longitude === null || !qrName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(qrCode) || (imageUrlRaw && !imageUrl) || (mascotImageUrlRaw && !mascotImageUrl) || (mascotMode === "custom" && !mascotImageUrl)) {
		return { error: !hasValidDescriptionLength(description) ? "Deskripsi destinasi maksimal 300 kata." : "Periksa nama, tautan, foto, serta koordinat destinasi dan QR." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengedit data wisata." };
	const { error: mascotSchemaError } = await staff.supabase.from("destinations").select("mascot_mode").limit(1);
	if (mascotSchemaError) return { error: "Pengaturan maskot belum siap. Jalankan migration 20261018000000_minigame_programs.sql sebelum menyimpan wisata." };
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
		p_additional_minigames: [],
		p_qr_name: qrName,
		p_qr_code: qrCode,
		p_qr_address: value(formData, "qr_address", 500) || address || null,
		p_qr_latitude: qrCoordinates.latitude,
		p_qr_longitude: qrCoordinates.longitude,
	});
	if (error) return { error: error.code === "23505" ? "Link wisata atau kode QR sudah digunakan." : "Perubahan wisata dan QR belum tersimpan. Periksa migration serta akses Supabase." };
	const { error: mascotError } = await staff.supabase.from("destinations")
		.update({ mascot_mode: mascotMode, mascot_image_url: mascotMode === "custom" ? mascotImageUrl : null }).eq("id", id);
	if (mascotError) return { error: "Wisata dan QR tersimpan, tetapi pengaturan maskot belum dapat diterapkan. Jalankan migration minigame programs." };
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
	if (!destinationId || !name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) || !coordinates || coordinates.latitude === null || coordinates.longitude === null) {
		return { error: "Lengkapi destinasi, nama titik, kode QR, dan pasangan koordinat yang valid." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola titik QR." };
	const { data: destination, error: destinationError } = await staff.supabase.from("destinations").select("id").eq("id", destinationId).maybeSingle();
	if (destinationError || !destination) return { error: "Destinasi belum dapat diperiksa." };
	const { error } = await staff.supabase.from("qr_points").insert({
		destination_id: destinationId,
		name,
		code,
		address: address || null,
		...coordinates,
		created_by: staff.userId,
	});
	if (error) return { error: error.code === "23505" ? "Kode QR ini sudah digunakan. Pilih kode yang berbeda." : "Titik QR belum tersimpan. Periksa pilihan destinasi dan migrasi database." };
	refreshWorkspace();
	return { success: "Titik QR berhasil disimpan. Kamu dapat menambahkannya ke grup Find Our Friends dari menu Minigames." };
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
	const displayChance = Number(value(formData, "display_chance", 4) || "35");
	const startsAt = startsAtRaw ? new Date(`${startsAtRaw}T00:00:00+07:00`) : null;
	const endsAt = endsAtRaw ? new Date(`${endsAtRaw}T23:59:59+07:00`) : null;
	if (!partnerId || !qrPointId || !title || !["popup", "minigame", "photobox"].includes(experienceType) || !Number.isInteger(displayChance) || displayChance < 0 || displayChance > 100 || (ctaUrlRaw && !ctaUrl) || (imageUrlRaw && !imageUrl) || (startsAt && !Number.isFinite(startsAt.getTime())) || (endsAt && !Number.isFinite(endsAt.getTime())) || (startsAt && endsAt && endsAt <= startsAt)) {
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
	if (experienceType === "minigame") {
		const { data: membership } = await staff.supabase.from("tourism_minigame_qr_points").select("assignment_id").eq("qr_point_id", qrPointId);
		const assignmentIds = [...new Set((membership ?? []).map((item) => item.assignment_id))];
		const assignmentQuery = assignmentIds.length ? await staff.supabase.from("tourism_minigame_destinations")
			.select("id,program_id").eq("destination_id", partner.destination_id).eq("is_enabled", true).contains("components", ["find_friends"]).in("id", assignmentIds) : null;
		const assignments = assignmentQuery?.data ?? [];
		if (!assignments.length) return { error: "Campaign tantangan perlu QR yang menjadi anggota grup Find Our Friends aktif." };
		const { data: activePrograms } = await staff.supabase.from("tourism_minigame_programs").select("id").eq("is_enabled", true).in("id", assignments.map((item) => item.program_id));
		if (!activePrograms?.length) return { error: "Program minigame pada destinasi ini belum aktif." };
	} else if (experienceType === "photobox") {
		const { data: assignments } = await staff.supabase.from("tourism_minigame_destinations")
			.select("program_id").eq("destination_id", partner.destination_id).eq("is_enabled", true).contains("components", ["photobox"]);
		const programIds = [...new Set((assignments ?? []).map((item) => item.program_id))];
		const programQuery = programIds.length ? await staff.supabase.from("tourism_minigame_programs")
			.select("id").eq("is_enabled", true).in("id", programIds) : null;
		if (!programQuery?.data?.length) return { error: "Campaign Photobox perlu program dengan komponen Photobox aktif di wisata mitra." };
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
		display_chance: displayChance,
		status: formData.get("is_published") === "on" ? "published" : "draft",
		created_by: staff.userId,
	});
	if (error) return { error: "Promosi belum tersimpan. Pastikan mitra dan titik QR masih aktif." };
	refreshWorkspace();
	return { success: "Kampanye promosi berhasil disimpan." };
}

const MINIGAME_COMPONENTS = new Set(Object.keys(minigameComponentRegistry));
const isMinigameMission = (component: string) =>
	isMinigameComponentKey(component) && minigameComponentRegistry[component].role === "mission";

function minigameErrorMessage(code: string | undefined) {
	const messages: Record<string, string> = {
		STAFF_REQUIRED: "Akun ini tidak memiliki akses untuk mengelola minigame.",
		INVALID_PROGRAM: "Periksa nama, ID, komponen, dan komponen wajib minigame.",
		SLUG_IN_USE: "ID minigame sudah digunakan. Pilih ID lain.",
		PROGRAM_NOT_FOUND: "Program minigame tidak ditemukan.",
		ASSIGNMENT_NOT_FOUND: "Penerapan minigame tidak ditemukan.",
		INVALID_ASSIGNMENT: "Periksa komponen, template foto, dan batas caption.",
		PHOTOBOX_REWARD_REQUIRES_REQUIRED_MISSION: "Pilih setidaknya satu game wajib sebelum Photobox dijadikan hadiah.",
		PHOTOBOX_REQUIRES_ENABLED_TEMPLATE: "Aktifkan setidaknya satu template Photobox.",
		FIND_FRIENDS_REQUIRES_QR_POINTS: "Pilih minimal satu titik QR untuk Find Our Friends.",
		FIND_FRIENDS_REQUIRES_REQUIRED_POINT: "Tandai setidaknya satu titik QR sebagai wajib agar misi dapat diselesaikan.",
		QR_POINT_NOT_IN_DESTINATION: "Semua titik QR harus berasal dari destinasi penerapan ini.",
		DEPENDENCY_NOT_IN_GROUP: "Titik prasyarat harus berada dalam grup misi yang sama.",
		DEPENDENCY_TOO_FAR: "Jarak antara titik dan prasyaratnya melebihi batas yang diatur.",
		DEPENDENCY_CYCLE: "Relasi prasyarat membentuk putaran. Periksa kembali hubungan antartitik.",
		INVALID_QR_DEPENDENCY: "Relasi QR tidak valid atau ada titik yang terduplikasi.",
	};
	return messages[code ?? ""] ?? "Pengaturan minigame belum tersimpan. Periksa migration minigame programs di Supabase.";
}

export async function saveTourismMinigameProgramAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const programId = value(formData, "program_id", 64);
	const name = value(formData, "program_name", 120);
	const slug = value(formData, "program_slug", 100).toLowerCase();
	const components = [...new Set(formData.getAll("components").map(String).filter((item) => MINIGAME_COMPONENTS.has(item)))];
	const requiredComponents = [...new Set(formData.getAll("required_components").map(String).filter((item) => isMinigameMission(item) && components.includes(item)))];
	const destinationIds = [...new Set(formData.getAll("destination_ids").map(String).filter((item) => /^[0-9a-f-]{36}$/i.test(item)))];
	const requestedPhotoboxMode = value(formData, "default_photobox_access_mode", 32);
	const defaultPhotoboxAccessMode = components.includes("photobox") && requestedPhotoboxMode === "mission_reward" && requiredComponents.length > 0 ? "mission_reward" : "standalone";
	if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !components.length) {
		return { error: "Isi nama dan ID program, lalu aktifkan minimal satu komponen." };
	}
	if (components.includes("photobox") && requestedPhotoboxMode === "mission_reward" && !requiredComponents.length) {
		return { error: "Pilih setidaknya satu game wajib sebelum Photobox dijadikan hadiah." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola minigame." };
	const { data, error } = await staff.supabase.rpc("save_tourism_minigame_program", {
		p_program_id: programId || null,
		p_name: name,
		p_slug: slug,
		p_is_enabled: formData.get("is_enabled") === "on",
		p_components: components,
		p_required_components: requiredComponents,
		p_destination_ids: destinationIds,
		p_default_photobox_access_mode: defaultPhotoboxAccessMode,
	});
	if (error) {
		console.error("Minigame program save failed", { code: error.code, message: error.message });
		if (error.code === "PGRST202" || error.code === "42883") return { error: "Pengaturan minigame belum tersedia di database. Jalankan migration minigame terbaru di Supabase." };
		return { error: "Program belum tersimpan. Periksa koneksi dan pastikan ID program belum dipakai program lain." };
	}
	if (data?.error) return { error: minigameErrorMessage(String(data.error)) };
	if (!data?.programId) return { error: "Database belum mengonfirmasi penyimpanan program. Muat ulang halaman dan coba lagi." };
	revalidatePath("/ruang-kelola/minigames");
	revalidatePath("/ruang-kelola");
	revalidatePath("/");
	return { success: "Program tersimpan. Lanjutkan dengan checklist pengaturan di setiap destinasi." };
}

type FindPointConfiguration = { qrPointId: string; isRequired: boolean; requires: string[]; friendName?: string; friendImageUrl?: string };
type PhotoboxTemplateConfiguration = { id: string; name: string; layout: "single" | "strip2" | "grid6" | "travel_strip" | "memory_triptych"; ratio: "portrait" | "story" | "square"; frameUrl: string; enabled: boolean; source?: "preset" | "custom" };

export async function configureTourismMinigameAssignmentAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const assignmentId = value(formData, "assignment_id", 64);
	const components = [...new Set(formData.getAll("assignment_components").map(String).filter((item) => MINIGAME_COMPONENTS.has(item)))];
	const requiredComponents = [...new Set(formData.getAll("assignment_required_components").map(String).filter((item) => isMinigameMission(item) && components.includes(item)))];
	const maxDependencyDistance = Number(value(formData, "max_dependency_distance_meters", 8) || "1000");
	const requestedPhotoboxAccessMode = value(formData, "photobox_access_mode", 32);
	const photoboxAccessMode = components.includes("photobox") && requestedPhotoboxAccessMode === "mission_reward" && requiredComponents.length > 0 ? "mission_reward" : "standalone";
	let points: FindPointConfiguration[] = [];
	let templates: PhotoboxTemplateConfiguration[] = [];
	try {
		const pointsValue: unknown = JSON.parse(value(formData, "find_points_json", 100000) || "[]");
		if (!Array.isArray(pointsValue) || pointsValue.length > 100) return { error: "Grup Find Our Friends dapat memuat maksimal 100 titik QR." };
		points = pointsValue.filter((item): item is FindPointConfiguration => Boolean(item && typeof item === "object" && typeof (item as FindPointConfiguration).qrPointId === "string"))
			.map((item) => ({
				qrPointId: item.qrPointId,
				isRequired: Boolean(item.isRequired),
				requires: Array.isArray(item.requires) ? [...new Set(item.requires.filter((id): id is string => typeof id === "string"))] : [],
				friendName: typeof item.friendName === "string" ? item.friendName.trim().slice(0, 80) : "",
				friendImageUrl: typeof item.friendImageUrl === "string" ? item.friendImageUrl.slice(0, 2048) : "",
			}));
		const templateValue: unknown = JSON.parse(value(formData, "photobox_templates_json", 20000) || "[]");
		if (!Array.isArray(templateValue) || templateValue.length > 12) return { error: "Photobox dapat memakai maksimal 12 template." };
		templates = templateValue.filter((item): item is PhotoboxTemplateConfiguration => Boolean(item && typeof item === "object" && typeof (item as PhotoboxTemplateConfiguration).id === "string"))
			.map((item) => ({
				id: item.id.slice(0, 80),
				name: typeof item.name === "string" ? item.name.trim().slice(0, 80) : "Template",
				layout: ["single", "strip2", "grid6", "travel_strip", "memory_triptych"].includes(item.layout) ? item.layout : "single",
				ratio: ["portrait", "story", "square"].includes(item.ratio) ? item.ratio : "portrait",
				frameUrl: typeof item.frameUrl === "string" ? item.frameUrl.slice(0, 2048) : "",
				enabled: item.enabled !== false,
				source: item.source === "custom" ? "custom" : "preset",
			}));
	} catch {
		return { error: "Data grup QR atau template Photobox tidak terbaca." };
	}
	if (!/^[0-9a-f-]{36}$/i.test(assignmentId) || !components.length || (components.includes("find_friends") && !points.length)) {
		return { error: "Penerapan harus memiliki komponen aktif dan titik QR bila memakai Find Our Friends." };
	}
	if (components.includes("photobox") && requestedPhotoboxAccessMode === "mission_reward" && !requiredComponents.length) {
		return { error: "Pilih setidaknya satu game wajib sebelum Photobox dijadikan hadiah." };
	}
	if (components.includes("find_friends") && !points.some((point) => point.isRequired)) return { error: "Tandai setidaknya satu titik QR sebagai wajib agar misi dapat diselesaikan." };
	if (!Number.isInteger(maxDependencyDistance) || maxDependencyDistance < 100 || maxDependencyDistance > 10000) return { error: "Batas jarak antartitik harus antara 100 dan 10.000 meter." };
	if (templates.some((item) => !item.id || !item.name || !item.frameUrl || !(item.frameUrl.startsWith("/") || optionalUrl(item.frameUrl)))) {
		return { error: "Pastikan setiap template memiliki nama dan gambar frame yang valid." };
	}
	if (components.includes("photobox") && !templates.some((item) => item.enabled)) return { error: "Aktifkan setidaknya satu template Photobox." };
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola minigame." };
	const { data, error } = await staff.supabase.rpc("configure_tourism_minigame_assignment", {
		p_assignment_id: assignmentId,
		p_is_enabled: formData.get("assignment_enabled") === "on",
		p_components: components,
		p_required_components: requiredComponents,
		p_photobox_access_mode: photoboxAccessMode,
		p_photobox_templates: templates,
		p_caption_template: value(formData, "caption_template", 500),
		p_max_caption_length: Number(value(formData, "max_caption_length", 8) || "280"),
		p_max_dependency_distance_meters: maxDependencyDistance,
		p_find_points: points,
	});
	if (error) return { error: "Pengaturan wisata belum tersimpan. Periksa migration minigame programs di Supabase." };
	if (data?.error) return { error: minigameErrorMessage(String(data.error)) };
	revalidatePath("/ruang-kelola/minigames");
	revalidatePath("/ruang-kelola");
	revalidatePath("/");
	return { success: "Grup misi, komponen, dan Photobox berhasil diperbarui." };
}
