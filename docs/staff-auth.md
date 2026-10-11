# Login petugas

## Alur

1. Pemilik membuat user di **Supabase Dashboard → Authentication → Users**. Pendaftaran dari situs publik tidak tersedia.
2. Pemilik memberi role `admin` atau `editor` di SQL Editor, menggunakan email user yang baru dibuat:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' -- ganti 'admin' menjadi 'editor' untuk editor
   from auth.users
   where lower(email) = lower('nama@instansi.go.id')
   on conflict (user_id) do update set role = excluded.role;
   ```

3. Petugas masuk lewat `/login`. Server Action membatasi percobaan, meminta Supabase memverifikasi password, lalu memastikan user memiliki role staf.
4. Session Supabase disimpan dalam cookie SSR. `src/proxy.ts` memperbarui token; Proxy hanya membantu sesi, bukan sumber otorisasi. Halaman dan query server tetap memverifikasi identitas dan role.
5. PostgreSQL RLS melindungi tabel meski ada akses langsung melalui API Supabase. Editor dapat membaca, membuat, dan mengubah destinasi. Admin mendapat hak itu dan dapat menghapus destinasi. Pengunjung hanya membaca destinasi terbit.

## Pemasangan

1. Salin `.env.example` ke `.env.local`, isi URL dan publishable key dari Supabase serta REST URL/token dari Upstash. Jangan pernah menaruh secret/service-role key di variabel `NEXT_PUBLIC_*`.
2. Jalankan migration `supabase/migrations/20261010000000_staff_auth.sql` di Supabase SQL Editor atau lewat Supabase CLI.
3. Di Supabase Authentication, matikan **Allow new users to sign up**. Buat akun staf satu per satu dari Dashboard; tetapkan role dengan SQL di atas.
4. Pastikan proxy hosting mengisi `x-real-ip` dari alamat client dan menimpa nilai yang dikirim client. Login produksi ditolak jika header ini atau Upstash belum tersedia. Supabase juga membatasi permintaan ke Auth API; tinjau Authentication → Rate Limits.
5. Deploy, lalu buka `/login` dan coba akun staf. Tetapkan URL redirect dan email pengiriman di Supabase bila nanti menambahkan alur reset password.

Rate limit aplikasi saat ini adalah 5 percobaan per email dan 20 per alamat IP dalam 15 menit menggunakan Upstash Redis. Identitas yang disimpan sebagai key limiter berupa hash. Batas email lintas IP mengurangi percobaan terdistribusi; batas IP membantu menghadapi serangan massal.

## Perubahan role

Tidak ada endpoint registrasi atau perubahan role dari browser. Hanya pemilik proyek yang mengelola akun dan tabel `user_roles` melalui Dashboard/SQL Editor. Untuk mencabut akses, hapus row role; user dapat tetap ada di Auth tetapi tidak lagi lolos pemeriksaan staf maupun kebijakan RLS. Untuk menonaktifkan akun sepenuhnya, ban/hapus user dari Supabase Auth.

Migration menyediakan `tourism_destinations` sebagai tabel konten pertama berdasarkan tipe `Destination` yang ada. Tambahkan kolom dan kebijakan RLS terpisah saat formulir input destinasi berkembang; jangan mematikan RLS.
