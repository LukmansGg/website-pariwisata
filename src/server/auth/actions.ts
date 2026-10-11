"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
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

function parseCoordinates(formData: FormData) {
	const latRaw = value(formData, "latitude", 32);
	const lngRaw = value(formData, "longitude", 32);
	if (!latRaw && !lngRaw) return { latitude: null, longitude: null };
	const latitude = Number(latRaw);
	const longitude = Number(lngRaw);
	if (
		!latRaw || !lngRaw || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
		latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
	) return null;
	return { latitude, longitude };
}

function refreshWorkspace() {
	revalidatePath("/ruang-kelola");
	revalidatePath("/");
	revalidatePath("/scan");
}

export async function createDestinationAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const slug = value(formData, "slug", 100).toLowerCase();
	const name = value(formData, "name", 160);
	const description = value(formData, "description", 10000);
	const category = value(formData, "category", 80);
	const address = value(formData, "address", 500);
	const imageUrlRaw = value(formData, "image_url", 2048);
	const imageUrl = optionalUrl(imageUrlRaw);
	const coordinates = parseCoordinates(formData);
	const hasCoordinateInput = Boolean(value(formData, "latitude", 32) || value(formData, "longitude", 32));
	const hasValidCoordinates = coordinates !== null && coordinates.latitude !== null && coordinates.longitude !== null;
	const tags = value(formData, "tags", 500)
		.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 15);
	const wantsPublication = formData.get("is_published") === "on";
	const isPublished = wantsPublication && hasValidCoordinates && Boolean(imageUrl);

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		return { error: "Slug gunakan huruf kecil, angka, dan tanda hubung." };
	}
	if (!name || (hasCoordinateInput && coordinates === null) || (imageUrlRaw && !imageUrl)) {
		return { error: "Periksa nama, URL foto, serta pasangan koordinat yang dimasukkan." };
	}

	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk menginput data." };

	const { error } = await staff.supabase.from("destinations").insert({
		slug,
		name,
		description,
		category: category || null,
		address: address || null,
		...coordinates,
		image_url: imageUrl,
		tags,
		is_featured: formData.get("is_featured") === "on",
		is_published: isPublished,
		created_by: staff.userId,
		updated_by: staff.userId,
	});
	if (error) {
		return { error: error.code === "23505" ? "Slug tersebut sudah dipakai destinasi lain." : "Destinasi belum tersimpan. Periksa migrasi database dan coba lagi." };
	}

	refreshWorkspace();
	return { success: isPublished ? "Destinasi berhasil disimpan dan diterbitkan." : wantsPublication ? "Tersimpan sebagai draft. Belum tayang: lengkapi foto sampul dan koordinat yang valid." : "Destinasi berhasil disimpan sebagai draft." };
}

export async function updateDestinationAction(
	_previousState: WorkspaceActionState,
	formData: FormData,
): Promise<WorkspaceActionState> {
	const id = value(formData, "id", 64);
	const slug = value(formData, "slug", 100).toLowerCase();
	const name = value(formData, "name", 160);
	const description = value(formData, "description", 10000);
	const category = value(formData, "category", 80);
	const address = value(formData, "address", 500);
	const imageUrlRaw = value(formData, "image_url", 2048);
	const imageUrl = optionalUrl(imageUrlRaw);
	const coordinates = parseCoordinates(formData);
	const hasCoordinateInput = Boolean(value(formData, "latitude", 32) || value(formData, "longitude", 32));
	const hasValidCoordinates = coordinates !== null && coordinates.latitude !== null && coordinates.longitude !== null;
	const tags = value(formData, "tags", 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 15);
	const wantsPublication = formData.get("is_published") === "on";
	const isPublished = wantsPublication && hasValidCoordinates && Boolean(imageUrl);
	if (!id || !name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || (hasCoordinateInput && coordinates === null) || (imageUrlRaw && !imageUrl)) {
		return { error: "Periksa nama, link, URL foto, serta pasangan koordinat yang dimasukkan." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengedit data wisata." };
	const { error } = await staff.supabase.from("destinations").update({
		slug, name, description, category: category || null, address: address || null,
		latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null,
		image_url: imageUrl, tags, is_featured: formData.get("is_featured") === "on",
		is_published: isPublished, updated_by: staff.userId,
	}).eq("id", id);
	if (error) return { error: error.code === "23505" ? "Link tersebut sudah dipakai destinasi lain." : "Perubahan belum tersimpan. Periksa akses dan migrasi database." };
	refreshWorkspace();
	return { success: isPublished ? "Wisata diperbarui dan ditayangkan." : wantsPublication ? "Perubahan tersimpan sebagai draft. Belum tayang: lengkapi foto sampul dan koordinat yang valid." : "Perubahan wisata tersimpan sebagai draft." };
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
	if (!businessName || !businessType || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) || (websiteRaw && !websiteUrl) || (logoUrlRaw && !logoUrl)) {
		return { error: "Periksa nama, kategori, slug, email, dan tautan mitra." };
	}
	const staff = await requireStaff();
	if (!staff) return { error: "Akun ini tidak memiliki akses untuk mengelola mitra." };
	const { error } = await staff.supabase.from("tourism_partners").insert({
		business_name: businessName,
		slug,
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
