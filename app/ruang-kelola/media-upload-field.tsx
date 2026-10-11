"use client";

import { useState } from "react";
import { DRIVE_IMAGE_TYPES, MAX_DRIVE_IMAGE_BYTES } from "@/src/shared/google-drive-upload";

const inputClass = "w-full rounded-xl border border-[#84B3CE]/40 bg-white px-4 py-3 text-sm text-[#16587B] outline-none transition placeholder:text-[#16587B]/35 focus:border-[#16587B] focus:ring-4 focus:ring-[#84B3CE]/20";

export function MediaUploadField({ folder, name, label }: { folder: "destinations" | "partners" | "campaigns"; name: string; label: string }) {
	const [url, setUrl] = useState("");
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState(0);

	async function upload(file?: File) {
		if (!file) return;
		if (!DRIVE_IMAGE_TYPES.has(file.type)) {
			setStatus("Pilih gambar JPEG, PNG, WebP, atau AVIF.");
			return;
		}
		if (file.size > MAX_DRIVE_IMAGE_BYTES) {
			setStatus("Ukuran gambar maksimal 25 MB.");
			return;
		}
		setBusy(true);
		setProgress(0);
		setStatus("Menyiapkan sesi upload aman…");
		try {
			const prepared = await fetch("/api/admin/google-drive/upload", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ folder, mimeType: file.type, size: file.size }),
			});
			const session = await prepared.json();
			if (!prepared.ok) throw new Error(session.error || "Sesi upload Google Drive gagal dibuat.");

			let offset = 0;
			let imageUrl = "";
			while (offset < file.size) {
				const endExclusive = Math.min(offset + session.chunkSize, file.size);
				setStatus(`Mengunggah langsung ke Google Drive… ${Math.round((offset / file.size) * 100)}%`);
				const uploaded = await fetch("/api/admin/google-drive/upload/chunk", {
					method: "POST",
					headers: {
						"Content-Type": "application/octet-stream",
						"Content-Range": `bytes ${offset}-${endExclusive - 1}/${file.size}`,
						"X-Drive-Upload-Token": session.uploadToken,
					},
					body: file.slice(offset, endExclusive),
				});
				const result = await uploaded.json();
				if (!uploaded.ok) throw new Error(result.error || "Potongan gambar gagal diunggah.");
				if (result.complete) {
					imageUrl = result.imageUrl;
					break;
				}
				if (typeof result.nextOffset !== "number" || result.nextOffset <= offset || result.nextOffset > file.size) {
					throw new Error("Upload terhenti pada potongan yang belum terkonfirmasi. Coba pilih gambar lagi.");
				}
				offset = result.nextOffset;
				setProgress(Math.round((offset / file.size) * 100));
			}
			if (!imageUrl) throw new Error("Drive belum mengonfirmasi gambar selesai diunggah.");
			setUrl(imageUrl);
			setProgress(100);
			setStatus("Gambar tersimpan di Drive dan dapat dilihat publik. Simpan formulir untuk menautkannya ke data.");
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Upload gagal. Coba lagi.");
		} finally {
			setBusy(false);
		}
	}

	return <div>
		<label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#16587B]/75" htmlFor={`${name}-upload`}>{label}</label>
		<input type="hidden" name={name} value={url} />
		<div className="flex flex-col gap-2 sm:flex-row">
		<input className={inputClass} id={`${name}-upload`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={(event) => void upload(event.currentTarget.files?.[0])} />
			{url && <button type="button" className="shrink-0 rounded-xl border border-[#84B3CE]/50 px-4 py-2 text-sm font-semibold text-[#16587B] hover:bg-[#F5EEDD]" onClick={() => { setUrl(""); setStatus("Gambar dilepas dari formulir."); }}>Hapus pilihan</button>}
		</div>
		{status && <p role="status" className="mt-2 text-xs text-[#16587B]/75">{status}</p>}
		{busy && <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#84B3CE]/25" role="progressbar" aria-label="Progress upload gambar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-[#16587B] transition-[width] duration-200" style={{ width: `${Math.max(progress, 4)}%` }} /></div>}
		{url && <img src={url} alt="Pratinjau gambar yang diunggah" className="mt-3 h-28 w-40 rounded-xl border border-[#84B3CE]/30 object-cover" />}
		<p className="mt-1 text-xs text-[#16587B]/55">JPEG, PNG, WebP, atau AVIF; maksimal 25 MB. Gambar yang diunggah menjadi publik; URL tersimpan setelah formulir dikirim.</p>
	</div>;
}
