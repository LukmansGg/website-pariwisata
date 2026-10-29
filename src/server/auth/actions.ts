"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/src/infrastructure/supabase/server";
import { checkLoginLimit } from "@/src/server/auth/rate-limit";
import { isMinigameComponentKey, minigameComponentRegistry } from "@/src/features/minigames/registry";
import { parseCampaignFormSchema } from "@/src/features/campaigns/form-schema";

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

	if (roleError || !role || !["admin", "editor", "destination_manager"].includes(role.role)) {
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
	role: "admin" | "editor" | "destination_manager";
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
	if (error || !staff || !["admin", "editor", "destination_manager"].includes(staff.role)) return null;
	return { supabase, userId, role: staff.role as StaffContext["role"] };
}

async function requireEditor(): Promise<StaffContext | null> {
	const staff = await requireStaff();
	return staff && staff.role !== "destination_manager" ? staff : null;
}

async function requireAdmin(): Promise<StaffContext | null> {
	const staff = await requireStaff();
	return staff?.role === "admin" ? staff : null;
}

function getServiceAdminClient() {
	const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (!serviceKey || !supabaseUrl) return null;
	return createSupabaseAdminClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function value(formData: FormData, key: string, maxLength: number) {
	return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function slugPart(text: string) {
	return text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
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

function optionalCampaignUrl(raw: string) {
        if (!raw) return null;
        if (/^\/(?!\/)[^\s\\]*$/.test(raw)) return raw;
        return optionalUrl(raw);
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

function refreshWorkspace(options: { destinations?: boolean; campaigns?: boolean } = {}) {
	revalidatePath("/ruang-kelola");
	revalidatePath("/");
	revalidatePath("/scan");
	if (options.destinations) revalidateTag("public-destinations", { expire: 0 });
	if (options.campaigns) revalidateTag("public-campaigns", { expire: 0 });
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
	if (staff.role !== "admin" && wantsPublication && !imageUrl) return { error: "Tambahkan foto sampul sebelum mengajukan wisata untuk ditinjau admin." };
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
		p_is_featured: staff.role === "admin" && formData.get("is_featured") === "on",
		p_is_published: staff.role === "admin" && isPublished,
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
	if (staff.role !== "admin" && wantsPublication) {
		const { data: review, error: reviewError } = await staff.supabase.rpc("submit_destination_for_review", { p_destination_id: savedDestinationId });
		if (reviewError || review?.error) return { error: reviewError?.code === "PGRST202" ? "Migration persetujuan wisata belum tersedia di database." : review?.error === "DESTINATION_INCOMPLETE" ? "Lengkapi foto sampul, koordinat, dan QR aktif sebelum meminta persetujuan admin." : "Wisata tersimpan sebagai draft, tetapi permintaan review belum berhasil dikirim." };
	}

	refreshWorkspace({ destinations: true });
	return { success: staff.role !== "admin" && wantsPublication ? "Wisata tersimpan dan masuk antrean review admin. Halaman akan tayang setelah disetujui." : isPublished ? "Destinasi dan QR utama berhasil disimpan; wisata sudah diterbitkan." : wantsPublication ? "Destinasi dan QR utama tersimpan sebagai draft. Lengkapi foto sampul sebelum tayang." : "Destinasi dan QR utama berhasil disimpan sebagai draft." };
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
	let shouldSubmitReview = wantsPublication;
	if (staff.role !== "admin") {
		const { data: existing, error: existingError } = await staff.supabase.from("destinations").select("is_published").eq("id", id).maybeSingle();
		if (existingError || !existing) return { error: "Destinasi ini tidak ditemukan atau bukan bagian dari akses akunmu." };
		shouldSubmitReview = wantsPublication || existing.is_published;
		if (shouldSubmitReview && !imageUrl) return { error: "Tambahkan foto sampul sebelum mengajukan perubahan untuk ditinjau admin." };
	}
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
		p_is_featured: staff.role === "admin" && formData.get("is_featured") === "on",
		p_is_published: staff.role === "admin" && isPublished,
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
	if (staff.role !== "admin" && shouldSubmitReview) {
		const { data: review, error: reviewError } = await staff.supabase.rpc("submit_destination_for_review", { p_destination_id: id });
		if (reviewError || review?.error) return { error: reviewError?.code === "PGRST202" ? "Migration persetujuan wisata belum tersedia di database." : review?.error === "DESTINATION_INCOMPLETE" ? "Lengkapi foto sampul, koordinat, dan QR aktif sebelum meminta persetujuan admin." : "Perubahan tersimpan sebagai draft, tetapi permintaan review belum berhasil dikirim." };
	}
	refreshWorkspace({ destinations: true });
	return { success: staff.role !== "admin" && shouldSubmitReview ? "Perubahan tersimpan dan masuk antrean review admin. Halaman akan tayang kembali setelah disetujui." : isPublished ? "Wisata dan QR utama diperbarui; wisata sudah tayang." : wantsPublication ? "Perubahan dan QR tersimpan sebagai draft. Lengkapi foto sampul sebelum tayang." : "Perubahan wisata dan QR utama berhasil disimpan." };
}

export async function deleteDestinationAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const destinationId = value(formData, "destination_id", 64);
	if (!/^[0-9a-f-]{36}$/i.test(destinationId)) return { error: "Destinasi yang dipilih tidak valid." };
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk menghapus wisata." };
	const { data: destination, error: lookupError } = await staff.supabase
		.from("destinations")
		.select("id,created_by,is_published")
		.eq("id", destinationId)
		.maybeSingle();
	if (lookupError || !destination) return { error: "Destinasi tidak ditemukan atau berada di luar akses akun ini." };
	if (staff.role !== "admin" && (destination.created_by !== staff.userId || destination.is_published)) {
		return { error: "Petugas hanya dapat menghapus draft wisata yang dibuat oleh akunnya sendiri." };
	}
	const { data: deletedRows, error } = await staff.supabase.from("destinations").delete().eq("id", destinationId).select("id");
	if (error || !deletedRows?.length) {
		return { error: error?.code === "23503" ? "Wisata masih terhubung dengan data lain dan belum dapat dihapus." : "Wisata belum dapat dihapus. Pastikan draft ini milik akunmu dan migration akses petugas sudah diterapkan." };
	}
	refreshWorkspace({ destinations: true });
	return { success: "Draft wisata berhasil dihapus." };
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
	const businessName = value(formData, "business_name", 160);
	const slug = value(formData, "slug", 100).toLowerCase();
	const description = value(formData, "description", 5000);
	const businessCategories = [...new Set(value(formData, "business_categories", 1000).split(",").map((item) => item.trim().slice(0, 80)).filter(Boolean))].slice(0, 10);
	const contactName = value(formData, "contact_name", 120);
	const contactEmail = value(formData, "contact_email", 254).toLowerCase();
	const contactPhone = value(formData, "contact_phone", 40);
	const address = value(formData, "address", 500);
	const websiteRaw = value(formData, "website_url", 2048);
	const websiteUrl = optionalUrl(websiteRaw);
	const logoUrlRaw = value(formData, "logo_url", 2048);
	const logoUrl = optionalUrl(logoUrlRaw);
	const coordinates = parseCoordinates(formData);
	const allowMinigameIntegration = formData.get("allow_minigame_integration") === "on";
	if (!businessName || !businessCategories.length || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
		|| !description || !logoUrlRaw || !logoUrl || !coordinates
		|| (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
		|| (websiteRaw && !websiteUrl)) {
		return { error: "Lengkapi nama, minimal satu jenis usaha, ID halaman, deskripsi, dan logo/foto. Periksa juga koordinat serta tautan kontak." };
	}
	const staff = await requireAdmin();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola mitra." };
	let destination: { id: string; latitude: number | null; longitude: number | null } | null = null;
	if (destinationId) {
		const result = await staff.supabase.from("destinations").select("id, latitude, longitude").eq("id", destinationId).maybeSingle();
		destination = result.data;
		if (result.error || !destination) return { error: "Wisata yang dipilih belum dapat diperiksa." };
	}
	if (allowMinigameIntegration && (coordinates.latitude === null || coordinates.longitude === null || !destinationId || !destination || destination.latitude === null || destination.longitude === null)) {
		return { error: "Integrasi Find Our Friends memerlukan koordinat usaha dan wisata yang dipilih." };
	}
	if (allowMinigameIntegration && destination && destination.latitude !== null && destination.longitude !== null && coordinates.latitude !== null && coordinates.longitude !== null) {
		const radians = Math.PI / 180;
		const dLat = (destination.latitude - coordinates.latitude) * radians;
		const dLng = (destination.longitude - coordinates.longitude) * radians;
		const a = Math.sin(dLat / 2) ** 2 + Math.cos(coordinates.latitude * radians) * Math.cos(destination.latitude * radians) * Math.sin(dLng / 2) ** 2;
		const distance = 6371000 * 2 * Math.asin(Math.sqrt(a));
		if (distance > 500) return { error: `Lokasi usaha sekitar ${Math.round(distance)} m dari wisata terpilih. Batas integrasi mitra adalah 500 m; pilih wisata lain yang lebih dekat.` };
	}
	const { error } = await staff.supabase.from("tourism_partners").insert({
		business_name: businessName,
		slug,
		destination_id: destinationId || null,
		max_distance_meters: 500,
		business_type: businessCategories[0],
		business_categories: businessCategories,
		...coordinates,
		allow_minigame_integration: allowMinigameIntegration,
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
	const allowMinigameIntegration = formData.get("allow_minigame_integration") === "on";
	const coordinates = parseCoordinates(formData);
	if (!partnerId) {
		return { error: "Mitra belum dapat diperiksa." };
	}
	if (!coordinates) return { error: "Isi pasangan koordinat yang valid atau kosongkan kedua kolom." };
	if (allowMinigameIntegration && !destinationId) return { error: "Pilih wisata terkait sebelum mengaktifkan integrasi Find Our Friends." };
	const staff = await requireAdmin();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola mitra." };
	const { data: partner, error: partnerError } = await staff.supabase.from("tourism_partners").select("latitude,longitude").eq("id", partnerId).maybeSingle();
	if (partnerError || !partner) return { error: "Mitra tidak ditemukan." };
	if (destinationId) {
		const { data: destination, error: destinationError } = await staff.supabase.from("destinations").select("id, latitude, longitude").eq("id", destinationId).maybeSingle();
		if (destinationError || !destination) return { error: "Wisata yang dipilih belum dapat diperiksa." };
	if (allowMinigameIntegration && (coordinates.latitude === null || coordinates.longitude === null || destination.latitude === null || destination.longitude === null)) {
			return { error: "Integrasi Find Our Friends memerlukan koordinat usaha dan wisata." };
		}
		if (allowMinigameIntegration && coordinates.latitude !== null && coordinates.longitude !== null && destination.latitude !== null && destination.longitude !== null) {
			const radians = Math.PI / 180;
			const a = Math.sin((destination.latitude - coordinates.latitude) * radians / 2) ** 2 + Math.cos(coordinates.latitude * radians) * Math.cos(destination.latitude * radians) * Math.sin((destination.longitude - coordinates.longitude) * radians / 2) ** 2;
			if (6371000 * 2 * Math.asin(Math.sqrt(a)) > 500) return { error: "Lokasi mitra berada di luar batas tetap 500 m dari wisata ini." };
		}
	}
	const { error } = await staff.supabase
		.from("tourism_partners")
		.update({ destination_id: destinationId || null, max_distance_meters: 500, allow_minigame_integration: allowMinigameIntegration, ...coordinates })
		.eq("id", partnerId);
	if (error) return { error: "Wisata mitra belum tersimpan. Periksa migrasi campaign yang baru dan coba lagi." };
	refreshWorkspace();
	return { success: "Wisata terkait berhasil diperbarui. Batas jarak minigame tetap 500 m." };
}

export async function createPromotionAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const partnerId = value(formData, "partner_id", 64);
	const assignmentId = value(formData, "assignment_id", 64);
	const title = value(formData, "title", 160);
	const description = value(formData, "description", 5000);
	const placementMode = value(formData, "placement_mode", 32);
	const exposureMode = value(formData, "exposure_mode", 16);
	const ctaLabel = value(formData, "cta_label", 60);
	const ctaUrlRaw = value(formData, "cta_url", 2048);
	const ctaUrl = optionalCampaignUrl(ctaUrlRaw);
	const imageUrlRaw = value(formData, "image_url", 2048);
	const imageUrl = optionalUrl(imageUrlRaw);
	const frameUrlRaw = value(formData, "frame_url", 2048);
	const frameUrl = optionalUrl(frameUrlRaw);
	const frameLayout = value(formData, "frame_layout", 32);
	const frameRatio = value(formData, "frame_ratio", 32);
	const startsAtRaw = value(formData, "starts_at", 32);
	const endsAtRaw = value(formData, "ends_at", 32);
	const startsAt = startsAtRaw ? new Date(`${startsAtRaw}T00:00:00+07:00`) : null;
	const endsAt = endsAtRaw ? new Date(`${endsAtRaw}T23:59:59+07:00`) : null;
	let formSchema: ReturnType<typeof parseCampaignFormSchema> = [];
	try {
		const rawSchema = String(formData.get("form_schema") ?? "[]");
		if (rawSchema.length > 24000) return { error: "Form campaign terlalu besar. Kurangi jumlah teks atau pilihan." };
		formSchema = parseCampaignFormSchema(JSON.parse(rawSchema));
	} catch { return { error: "Rancangan form tidak terbaca. Periksa kembali komponen dan pilihan form." }; }
	const destinationIds = [...new Set(formData.getAll("destination_ids").map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
	const systemPages = [...new Set(formData.getAll("system_pages").map(String).filter((item) => ["home", "scan", "destination", "minigame", "photobox"].includes(item)))];
	const exposureChance = Number(value(formData, "display_chance", 4) || (placementMode === "system" ? "15" : "35"));
	const displayChance = exposureMode === "always" ? 100 : exposureChance;
	const experienceType = placementMode === "find_friends" ? "minigame" : placementMode === "photobox" ? "photobox" : "popup";
	const allowedPlacements = ["nearby", "find_friends", "photobox", "system", "destination_feedback", "website_feedback"];
	const feedbackMode = placementMode === "destination_feedback" || placementMode === "website_feedback";
	const formHasQuestions = Boolean(formSchema?.some((block) => block.type === "input" || block.type === "choice" || block.type === "dropdown"));
	const formHasRating = Boolean(formSchema?.some((block) => (block.type === "choice" || block.type === "dropdown")
		&& (/(rating|rate|penilaian|nilai)/i.test(block.id) || /(rating|rate|penilaian|nilai)/i.test(block.label))
		&& block.options.some((option) => /^[1-5](?:\s|$)/.test(option.trim()))));
	if (!title || !allowedPlacements.includes(placementMode) || !["chance", "always"].includes(exposureMode)
		|| !Number.isInteger(displayChance) || displayChance < 0 || displayChance > 100
		|| (placementMode === "nearby" && !destinationIds.length)
		|| (placementMode === "destination_feedback" && !destinationIds.length)
		|| (feedbackMode && (!formSchema || !formHasQuestions || !formHasRating))
		|| (placementMode === "find_friends" && (!partnerId || !assignmentId))
		|| (placementMode === "photobox" && (!assignmentId || !frameUrl || !["single", "strip2", "grid6", "travel_strip", "memory_triptych"].includes(frameLayout) || !["portrait", "story", "square"].includes(frameRatio)))
		|| (ctaUrlRaw && !ctaUrl) || (imageUrlRaw && !imageUrl) || (placementMode === "photobox" && !frameUrl)
		|| (startsAt && !Number.isFinite(startsAt.getTime())) || (endsAt && !Number.isFinite(endsAt.getTime())) || (startsAt && endsAt && endsAt <= startsAt)) {
		return { error: feedbackMode && !formHasRating ? "Form ulasan harus mempertahankan pertanyaan rating dengan pilihan nilai 1–5." : "Periksa tujuan campaign, target wisata/program, isi form, materi, peluang tayang, dan jadwal." };
	}
	if (placementMode === "system" && !systemPages.length) return { error: "Pilih minimal satu halaman umum untuk campaign sistem." };
	const staff = await requireEditor();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola promosi." };
	const petugasCampaign = staff.role === "editor";
	if (petugasCampaign && (placementMode !== "nearby" || partnerId || assignmentId || !destinationIds.length)) {
		return { error: "Petugas Wisata hanya dapat membuat campaign event umum untuk destinasi miliknya. Campaign akan menunggu persetujuan admin." };
	}
	const campaignStatus = petugasCampaign ? "draft" : formData.get("is_published") === "on" ? "published" : "draft";

	let partner: { id: string; business_name: string; destination_id: string | null; latitude: number | null; longitude: number | null; allow_minigame_integration: boolean; address: string | null; logo_url: string | null; status: string } | null = null;
	if (partnerId) {
		const result = await staff.supabase.from("tourism_partners").select("id,business_name,destination_id,latitude,longitude,allow_minigame_integration,address,logo_url,status").eq("id", partnerId).maybeSingle();
		partner = result.data;
		if (result.error || !partner || partner.status !== "active") return { error: "Mitra yang dipilih tidak tersedia atau belum aktif." };
	}
	let assignment: { id: string; destination_id: string; program_id: string; components: string[]; photobox_templates: unknown } | null = null;
	let generatedPointId: string | null = null;
	if (placementMode === "find_friends" || placementMode === "photobox") {
		const result = await staff.supabase.from("tourism_minigame_destinations").select("id,destination_id,program_id,components,photobox_templates,is_enabled").eq("id", assignmentId).eq("is_enabled", true).maybeSingle();
		const candidate = result.data;
		const requiredComponent = placementMode === "find_friends" ? "find_friends" : "photobox";
		if (result.error || !candidate || !candidate.components.includes(requiredComponent)) return { error: "Pilih program minigame aktif dengan komponen yang sesuai." };
		const { data: program } = await staff.supabase.from("tourism_minigame_programs").select("is_enabled").eq("id", candidate.program_id).maybeSingle();
		if (!program?.is_enabled) return { error: "Program minigame ini sedang tidak aktif." };
		assignment = candidate;
	}
	let partnerCoordinates: { latitude: number; longitude: number } | null = null;
	if (placementMode === "find_friends") {
		if (!partner || !partner.allow_minigame_integration || partner.latitude === null || partner.longitude === null) {
			return { error: "Pilih mitra yang sudah mengizinkan integrasi Find Our Friends dan memiliki koordinat usaha." };
		}
		if (partner.destination_id && partner.destination_id !== assignment?.destination_id) return { error: "Program minigame harus berada di wisata yang ditautkan ke mitra." };
		const { data: destination } = await staff.supabase.from("destinations").select("id,latitude,longitude").eq("id", assignment!.destination_id).maybeSingle();
		if (!destination || destination.latitude === null || destination.longitude === null) return { error: "Wisata minigame ini belum memiliki koordinat." };
		const radians = Math.PI / 180;
		const a = Math.sin((destination.latitude - partner.latitude) * radians / 2) ** 2 + Math.cos(partner.latitude * radians) * Math.cos(destination.latitude * radians) * Math.sin((destination.longitude - partner.longitude) * radians / 2) ** 2;
		if (6371000 * 2 * Math.asin(Math.sqrt(a)) > 500) return { error: "Lokasi usaha berada di luar batas tetap 500 m dari wisata minigame ini." };
		partnerCoordinates = { latitude: partner.latitude, longitude: partner.longitude };
	}
	if (placementMode === "photobox") {
		const templates = Array.isArray(assignment?.photobox_templates) ? assignment.photobox_templates : [];
		if (templates.length >= 12) return { error: "Program Photobox ini sudah memakai 12 frame. Nonaktifkan satu frame lama dahulu." };
	}
	if (destinationIds.length) {
		const { data: matchedDestinations, error: destinationError } = await staff.supabase.from("destinations").select("id,created_by").in("id", destinationIds);
		if (destinationError || matchedDestinations?.length !== destinationIds.length) return { error: "Satu atau beberapa wisata pilihan tidak tersedia." };
		if (petugasCampaign && matchedDestinations.some((destination) => destination.created_by !== staff.userId)) return { error: "Campaign petugas hanya boleh terhubung ke wisata yang dibuat oleh akun ini." };
	}

	const { data: campaign, error: campaignError } = await staff.supabase.from("promotion_campaigns").insert({
		partner_id: partner?.id ?? null,
		qr_point_id: null,
		title,
		description,
		image_url: imageUrl,
		experience_type: experienceType,
		placement_mode: placementMode,
		exposure_mode: exposureMode,
		system_pages: placementMode === "system" ? systemPages : placementMode === "website_feedback" ? ["home", "scan", "destination", "minigame", "photobox"] : ["destination", "minigame", "photobox"],
		frame_url: placementMode === "photobox" ? frameUrl : null,
		frame_layout: placementMode === "photobox" ? frameLayout : null,
		frame_ratio: placementMode === "photobox" ? frameRatio : null,
		cta_label: ctaLabel || null,
		cta_url: ctaUrl,
		form_schema: formSchema,
		starts_at: startsAt?.toISOString() ?? null,
		ends_at: endsAt?.toISOString() ?? null,
		display_chance: displayChance,
		status: campaignStatus,
		approval_status: petugasCampaign ? "pending" : "approved",
		approval_feedback: null,
		submitted_for_review_at: petugasCampaign ? new Date().toISOString() : null,
		created_by: staff.userId,
	}).select("id").single();
	if (campaignError || !campaign) return { error: campaignError?.code === "42703" || campaignError?.code === "PGRST204" ? "Skema campaign baru belum tersedia. Jalankan migration campaign placement redesign di Supabase." : "Campaign belum tersimpan. Periksa kembali data dan relasi yang dipilih." };

	const rollbackSupabase = staff.supabase;
	const createdCampaignId = campaign.id;
	async function rollbackCampaign() {
		await rollbackSupabase.from("promotion_campaigns").delete().eq("id", createdCampaignId);
		if (generatedPointId) await rollbackSupabase.from("qr_points").delete().eq("id", generatedPointId);
	}
	if (destinationIds.length) {
		const { error } = await staff.supabase.from("promotion_campaign_destinations").insert(destinationIds.map((destination_id) => ({ campaign_id: campaign.id, destination_id })));
		if (error) { await rollbackCampaign(); return { error: "Tautan wisata campaign belum tersimpan. Jalankan migration campaign placement redesign." }; }
	}
	if (assignment && placementMode === "find_friends" && partnerCoordinates && partner) {
		const code = `campaign-${slugPart(title).slice(0, 48) || "mitra"}-${campaign.id.replaceAll("-", "").slice(0, 8)}`;
		const { data: point, error: pointError } = await staff.supabase.from("qr_points").insert({
			destination_id: assignment.destination_id,
			name: `${partner.business_name} · ${title}`.slice(0, 120),
			code,
			address: partner.address,
			latitude: partnerCoordinates.latitude,
			longitude: partnerCoordinates.longitude,
			is_active: campaignStatus === "published",
			created_by: staff.userId,
		}).select("id").single();
		if (pointError || !point) { await rollbackCampaign(); return { error: "QR campaign belum dapat dibuat. Pastikan kode unik dan koordinat mitra valid." }; }
		generatedPointId = point.id;
		const { error: membershipError } = await staff.supabase.from("tourism_minigame_qr_points").insert({ assignment_id: assignment.id, qr_point_id: point.id, is_required: false, friend_name: partner.business_name, friend_image_url: partner.logo_url });
		if (membershipError) { await rollbackCampaign(); return { error: "QR bonus gagal ditautkan ke grup Find Our Friends." }; }
		const [{ error: targetError }, { error: campaignQrError }] = await Promise.all([
			staff.supabase.from("promotion_campaign_minigames").insert({ campaign_id: campaign.id, assignment_id: assignment.id, qr_point_id: point.id }),
			staff.supabase.from("promotion_campaigns").update({ qr_point_id: point.id }).eq("id", campaign.id),
		]);
		if (targetError || campaignQrError) { await rollbackCampaign(); return { error: "Tautan QR bonus campaign belum tersimpan sepenuhnya." }; }
	}
	if (assignment && placementMode === "photobox") {
		const { error: targetError } = await staff.supabase.from("promotion_campaign_minigames").insert({ campaign_id: campaign.id, assignment_id: assignment.id });
		if (targetError) { await rollbackCampaign(); return { error: "Tautan program Photobox belum tersimpan." }; }
		const currentTemplates = Array.isArray(assignment.photobox_templates) ? assignment.photobox_templates : [];
		const promotedFrame = { id: `campaign-${campaign.id}`, name: title, layout: frameLayout, ratio: frameRatio, frameUrl, enabled: campaignStatus === "published", source: "campaign", campaignId: campaign.id, displayChance, alwaysShow: exposureMode === "always" };
		const { error: frameError } = await staff.supabase.from("tourism_minigame_destinations").update({ photobox_templates: [...currentTemplates, promotedFrame] }).eq("id", assignment.id);
		if (frameError) { await rollbackCampaign(); return { error: "Frame belum dapat dimasukkan ke preset Photobox. Periksa ulang template aktif program." }; }
	}
	refreshWorkspace({ campaigns: true });
	return { success: petugasCampaign ? "Campaign tersimpan sebagai draft dan dikirim ke antrean persetujuan admin." : placementMode === "find_friends" ? "Campaign tersimpan. QR bonus otomatis dibuat dan tidak diwajibkan untuk menyelesaikan misi." : placementMode === "photobox" ? "Campaign dan frame mitra berhasil dimasukkan ke preset Photobox." : "Campaign promosi berhasil disimpan." };
}

export async function setPromotionCampaignStatusAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const campaignId = value(formData, "campaign_id", 64);
	const nextStatus = value(formData, "next_status", 16);
	if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !["published", "paused"].includes(nextStatus)) {
		return { error: "Status campaign tidak valid." };
	}
	const staff = await requireAdmin();
	if (!staff) return { error: "Hanya admin yang dapat mengaktifkan atau menjeda campaign." };
	const { data: campaign, error: campaignError } = await staff.supabase.from("promotion_campaigns")
		.select("id,placement_mode,qr_point_id,status,approval_status").eq("id", campaignId).maybeSingle();
	if (campaignError || !campaign) return { error: "Campaign tidak ditemukan." };
	if (campaign.approval_status !== "approved") return { error: "Campaign belum disetujui admin." };
	const { error: statusError } = await staff.supabase.from("promotion_campaigns").update({ status: nextStatus }).eq("id", campaignId);
	if (statusError) return { error: "Status campaign belum dapat diperbarui." };
	if (campaign.placement_mode === "find_friends" && campaign.qr_point_id) {
		const { error } = await staff.supabase.from("qr_points").update({ is_active: nextStatus === "published" }).eq("id", campaign.qr_point_id);
		if (error) {
			await staff.supabase.from("promotion_campaigns").update({ status: campaign.status }).eq("id", campaignId);
			return { error: "Status QR bonus belum dapat diperbarui. Status campaign dikembalikan." };
		}
	}
	if (campaign.placement_mode === "photobox") {
		const { data: links, error: linksError } = await staff.supabase.from("promotion_campaign_minigames").select("assignment_id").eq("campaign_id", campaignId);
		if (linksError) {
			await staff.supabase.from("promotion_campaigns").update({ status: campaign.status }).eq("id", campaignId);
			return { error: "Program Photobox campaign belum dapat diperiksa. Status campaign dikembalikan." };
		}
		const changedAssignments: { id: string; templates: unknown }[] = [];
		for (const link of links ?? []) {
			const { data: assignment, error: assignmentError } = await staff.supabase.from("tourism_minigame_destinations").select("photobox_templates").eq("id", link.assignment_id).maybeSingle();
			if (assignmentError || !assignment) {
				for (const changed of changedAssignments) {
					await staff.supabase.from("tourism_minigame_destinations").update({ photobox_templates: changed.templates }).eq("id", changed.id);
				}
				await staff.supabase.from("promotion_campaigns").update({ status: campaign.status }).eq("id", campaignId);
				return { error: "Program Photobox campaign belum dapat diperiksa. Status campaign dikembalikan." };
			}
			const templates = Array.isArray(assignment.photobox_templates) ? assignment.photobox_templates as Record<string, unknown>[] : [];
			const updated = templates.map((template) => template.campaignId === campaignId ? { ...template, enabled: nextStatus === "published" } : template);
			const { error } = await staff.supabase.from("tourism_minigame_destinations").update({ photobox_templates: updated }).eq("id", link.assignment_id);
			if (error) {
				for (const changed of changedAssignments) {
					await staff.supabase.from("tourism_minigame_destinations").update({ photobox_templates: changed.templates }).eq("id", changed.id);
				}
				await staff.supabase.from("promotion_campaigns").update({ status: campaign.status }).eq("id", campaignId);
				return { error: "Frame Photobox belum dapat diperbarui. Status campaign dikembalikan." };
			}
			changedAssignments.push({ id: link.assignment_id, templates: assignment.photobox_templates });
		}
	}
	refreshWorkspace({ campaigns: true });
	return { success: nextStatus === "published" ? "Campaign berhasil diaktifkan." : "Campaign dijeda." };
}

export async function reviewPetugasCampaignAction(_previousState: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
	const campaignId = value(formData, "campaign_id", 64);
	const decision = value(formData, "decision", 32);
	const feedback = value(formData, "feedback", 1200);
	if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !["approved", "changes_requested", "rejected"].includes(decision)) return { error: "Keputusan review campaign tidak valid." };
	if (decision !== "approved" && feedback.trim().length < 8) return { error: "Tulis catatan minimal 8 karakter agar petugas memahami keputusan admin." };
	const staff = await requireAdmin();
	if (!staff) return { error: "Hanya admin yang dapat meninjau campaign." };
	const { data, error } = await staff.supabase.rpc("review_petugas_campaign", { p_campaign_id: campaignId, p_decision: decision, p_feedback: feedback || null });
	if (error || data?.error) return { error: data?.error === "CAMPAIGN_NOT_PENDING" ? "Campaign ini sudah ditinjau atau tidak lagi menunggu persetujuan." : "Keputusan belum tersimpan. Pastikan migration Petugas Wisata sudah diterapkan." };
	refreshWorkspace({ campaigns: true });
	return { success: decision === "approved" ? "Campaign disetujui dan diaktifkan." : decision === "changes_requested" ? "Catatan revisi dikirim ke Petugas Wisata." : "Campaign ditolak." };
}

export async function inviteDestinationManagerAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const email = value(formData, "email", 254).toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Masukkan alamat email yang valid untuk undangan." };
	const staff = await requireStaff();
	if (!staff || staff.role !== "admin") return { error: "Hanya admin yang dapat mengundang Petugas Wisata." };
	const admin = getServiceAdminClient();
	const appOrigin = process.env.APP_ORIGIN;
	if (!admin) return { error: "Layanan undangan belum disiapkan. Konfigurasikan service key Supabase di server." };
	if (!appOrigin) return { error: "APP_ORIGIN belum disiapkan untuk tautan undangan." };
	const { error: migrationError } = await admin.from("user_destination_access").select("destination_id").limit(1);
	if (migrationError) return { error: "Migration role dan akses pengelola wisata belum diterapkan di Supabase." };
	let redirectTo: string;
	try { redirectTo = new URL("/atur-sandi", appOrigin).toString(); }
	catch { return { error: "APP_ORIGIN tidak valid. Periksa domain utama aplikasi." }; }

	const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
	if (inviteError || !invite.user?.id) {
		const message = inviteError?.message.toLowerCase() ?? "";
		return { error: message.includes("already") || message.includes("registered") ? "Email ini sudah memiliki akun. Gunakan alamat lain atau kelola role akun tersebut dari Supabase." : "Undangan belum terkirim. Periksa konfigurasi email Supabase dan URL redirect aplikasi." };
	}

	const invitedUserId = invite.user.id;
	const { error: roleError } = await admin.from("user_roles").insert({ user_id: invitedUserId, role: "editor" });
	if (roleError) {
		await admin.auth.admin.deleteUser(invitedUserId);
		return { error: "Role pengelola belum dapat disiapkan. Akun undangan dibatalkan agar tidak tertinggal tanpa akses yang benar." };
	}
	revalidatePath("/ruang-kelola");
	return { success: `Undangan Petugas Wisata dikirim ke ${email}. Setelah membuat sandi, petugas dapat mendaftarkan destinasi atas nama akunnya sendiri.` };
}

export async function revokeDestinationManagerAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const managerUserId = value(formData, "manager_user_id", 64);
	if (!/^[0-9a-f-]{36}$/i.test(managerUserId)) return { error: "Akun pengelola tidak valid." };
	const staff = await requireStaff();
	if (!staff || staff.role !== "admin") return { error: "Hanya admin yang dapat mencabut akses pengelola." };
	const { data, error } = await staff.supabase.rpc("revoke_destination_manager_access", { p_manager_user_id: managerUserId });
	if (error || data?.error) return { error: data?.error === "MANAGER_NOT_FOUND" ? "Akun ini bukan pengelola wisata aktif." : "Akses belum dapat dicabut. Pastikan migration pengelola wisata telah diterapkan." };
	revalidatePath("/ruang-kelola");
	return { success: "Akses dashboard pengelola sudah dicabut. Akun Auth tetap tersedia dan tidak dapat lagi masuk sebagai petugas." };
}

export async function reviewManagedDestinationAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const reviewId = value(formData, "review_id", 64);
	const decision = value(formData, "decision", 32);
	const feedback = value(formData, "feedback", 1200);
	if (!/^[0-9a-f-]{36}$/i.test(reviewId) || !["approved", "changes_requested", "taken_down"].includes(decision)) {
		return { error: "Permintaan review atau keputusan tidak valid." };
	}
	if (decision !== "approved" && feedback.length < 8) return { error: "Tulis alasan yang jelas agar pengelola tahu apa yang perlu diperbaiki." };
	const staff = await requireStaff();
	if (!staff || staff.role !== "admin") return { error: "Hanya admin yang dapat memutuskan review wisata." };
	const { data, error } = await staff.supabase.rpc("review_destination_submission", {
		p_request_id: reviewId,
		p_decision: decision,
		p_feedback: feedback,
	});
	if (error || data?.error) {
		const code = String(data?.error ?? error?.code ?? "");
		return { error: code === "DESTINATION_INCOMPLETE" ? "Wisata belum memiliki foto, koordinat, dan QR aktif yang diperlukan untuk tayang." : code === "REVIEW_NOT_PENDING" ? "Permintaan ini sudah ditangani. Muat ulang data review." : "Keputusan review belum tersimpan. Periksa migration persetujuan wisata." };
	}
	revalidatePath("/ruang-kelola");
	revalidatePath("/");
	return { success: decision === "approved" ? "Wisata disetujui dan diterbitkan." : decision === "taken_down" ? "Wisata diturunkan. Alasan sudah dikirim ke pengelola." : "Perbaikan diminta. Catatan sudah dikirim ke pengelola." };
}

export async function takeDownManagedDestinationAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const destinationId = value(formData, "destination_id", 64);
	const feedback = value(formData, "feedback", 1200);
	if (!/^[0-9a-f-]{36}$/i.test(destinationId) || feedback.length < 8) return { error: "Pilih wisata dan tulis alasan penurunan yang jelas." };
	const staff = await requireStaff();
	if (!staff || staff.role !== "admin") return { error: "Hanya admin yang dapat menurunkan publikasi wisata." };
	const { data, error } = await staff.supabase.rpc("take_down_managed_destination", {
		p_destination_id: destinationId,
		p_feedback: feedback,
	});
	if (error || data?.error) return { error: data?.error === "DESTINATION_NOT_PUBLISHED" ? "Wisata ini sudah tidak tayang." : "Wisata belum dapat diturunkan. Periksa status dan migration review." };
	revalidatePath("/ruang-kelola");
	revalidatePath("/");
	return { success: "Wisata diturunkan. Alasan sudah tercatat dan dikirim ke pengelola." };
}

const MINIGAME_COMPONENTS = new Set(Object.keys(minigameComponentRegistry));
const isMinigameMission = (component: string) =>
	isMinigameComponentKey(component) && minigameComponentRegistry[component].role === "mission";

function minigameErrorMessage(code: string | undefined) {
	const messages: Record<string, string> = {
		STAFF_REQUIRED: "Akun ini tidak memiliki akses untuk mengelola minigame.",
		MANAGER_REQUIRED: "Akun ini bukan pengelola wisata yang terdaftar.",
		DESTINATION_FORBIDDEN: "Program minigame hanya dapat diterapkan pada destinasi yang ditugaskan ke akunmu.",
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
	if (staff.role !== "admin" && programId) return { error: "Petugas Wisata hanya dapat membuat program baru untuk destinasi miliknya." };
	if (staff.role !== "admin" && !destinationIds.length) return { error: "Pilih setidaknya satu destinasi milikmu untuk program minigame ini." };
	const scopedProgram = staff.role !== "admin";
	const rpcName = scopedProgram ? "create_destination_manager_minigame_program" : "save_tourism_minigame_program";
	const rpcArgs = scopedProgram ? {
		p_name: name,
		p_slug: slug,
		p_is_enabled: false,
		p_components: components,
		p_required_components: requiredComponents,
		p_destination_ids: destinationIds,
		p_default_photobox_access_mode: defaultPhotoboxAccessMode,
	} : {
		p_program_id: programId || null,
		p_name: name,
		p_slug: slug,
		p_is_enabled: formData.get("is_enabled") === "on",
		p_components: components,
		p_required_components: requiredComponents,
		p_destination_ids: destinationIds,
		p_default_photobox_access_mode: defaultPhotoboxAccessMode,
	};
	const { data, error } = await staff.supabase.rpc(rpcName, rpcArgs);
	if (error) {
		console.error("Minigame program save failed", { code: error.code, message: error.message });
		if (error.code === "PGRST202" || error.code === "42883") return { error: scopedProgram ? "Fitur Petugas Wisata belum tersedia di database. Jalankan migration 20261029000000_petugas_wisata_scoped_access.sql." : "Pengaturan minigame belum tersedia di database. Jalankan migration minigame terbaru di Supabase." };
		return { error: "Program belum tersimpan. Periksa koneksi dan pastikan ID program belum dipakai program lain." };
	}
	if (data?.error) return { error: minigameErrorMessage(String(data.error)) };
	if (!data?.programId) return { error: "Database belum mengonfirmasi penyimpanan program. Muat ulang halaman dan coba lagi." };
	revalidatePath("/ruang-kelola/minigames");
	revalidatePath("/ruang-kelola");
	revalidatePath("/");
	return { success: scopedProgram ? "Pengajuan minigame tersimpan sebagai draft. Admin akan meninjau sebelum mengaktifkannya." : "Program tersimpan. Lanjutkan dengan checklist pengaturan di setiap destinasi." };
}

type FindPointConfiguration = { qrPointId: string; isRequired: boolean; requires: string[]; friendName?: string; friendImageUrl?: string };
type PhotoboxTemplateConfiguration = { id: string; name: string; layout: "single" | "strip2" | "grid6" | "travel_strip" | "memory_triptych"; ratio: "portrait" | "story" | "square"; frameUrl: string; enabled: boolean; source?: "preset" | "custom" | "campaign"; campaignId?: string; displayChance?: number; alwaysShow?: boolean };

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
				source: item.source === "campaign" ? "campaign" : item.source === "custom" ? "custom" : "preset",
				...(item.source === "campaign" && typeof item.campaignId === "string" ? { campaignId: item.campaignId } : {}),
				...(item.source === "campaign" && Number.isInteger(item.displayChance) ? { displayChance: item.displayChance } : {}),
				...(item.source === "campaign" ? { alwaysShow: item.alwaysShow === true } : {}),
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
	if (staff.role === "destination_manager") {
		const { data: assignment, error: assignmentError } = await staff.supabase.from("tourism_minigame_destinations")
			.select("photobox_templates").eq("id", assignmentId).maybeSingle();
		if (assignmentError || !assignment) return { error: "Penerapan minigame ini bukan milik destinasi yang ditugaskan ke akunmu." };
		const currentTemplates = Array.isArray(assignment.photobox_templates) ? assignment.photobox_templates as PhotoboxTemplateConfiguration[] : [];
		const protectedCampaignTemplates = currentTemplates.filter((template) => template.source === "campaign");
		if (templates.filter((template) => template.source !== "campaign").length + protectedCampaignTemplates.length > 12) return { error: "Sisakan slot untuk frame promosi yang dikelola admin. Hapus atau nonaktifkan frame kustom dulu." };
		templates = [
			...templates.filter((template) => template.source !== "campaign").map((template) => ({ ...template, source: template.source === "custom" ? "custom" as const : "preset" as const, campaignId: undefined, displayChance: undefined, alwaysShow: undefined })),
			...protectedCampaignTemplates,
		];
	}
	if (components.includes("find_friends") && staff.role !== "destination_manager") {
		const { data: linkedCampaignPoints, error: linkedCampaignError } = await staff.supabase.from("promotion_campaign_minigames")
			.select("qr_point_id").eq("assignment_id", assignmentId).not("qr_point_id", "is", null);
		if (linkedCampaignError) return { error: "Data QR bonus campaign belum dapat dibaca. Jalankan migration campaign placement redesign." };
		const campaignPointIds = [...new Set((linkedCampaignPoints ?? []).map((item) => item.qr_point_id).filter((id): id is string => Boolean(id)))];
		const newPointIds = campaignPointIds.filter((id) => !points.some((point) => point.qrPointId === id));
		if (newPointIds.length) {
			const { data: qrPoints, error: qrError } = await staff.supabase.from("qr_points").select("id,name").in("id", newPointIds);
			if (qrError) return { error: "Titik QR bonus campaign belum dapat diperiksa." };
			for (const point of qrPoints ?? []) points.push({ qrPointId: point.id, isRequired: false, requires: [], friendName: point.name, friendImageUrl: "" });
		}
		if (points.length > 100) return { error: "Grup ini melewati batas 100 titik QR setelah QR bonus campaign ditambahkan." };
	}
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
