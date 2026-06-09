# Issue: History Aktivitas Member dengan IP dan User Agent

## Ringkasan
Tambahkan pencatatan history aktivitas member yang menyimpan informasi teknis request seperti alamat IP dan user agent. Data ini dibutuhkan untuk audit sederhana, investigasi masalah login, dan melihat perangkat atau browser yang digunakan member.

Fitur ini melibatkan backend sebagai sumber pencatatan data, dan frontend sebagai tempat menampilkan informasi history member jika diperlukan.

## Tujuan
1. Backend mencatat aktivitas penting member beserta IP address dan user agent.
2. Data history bisa ditelusuri per member.
3. Admin atau member dapat melihat daftar history aktivitas sesuai kebutuhan UI yang tersedia.
4. Pencatatan tidak mengganggu flow utama seperti login, update profile, atau verifikasi kontak.

## Scope Backend `core.loyalty.system`
1. Buat struktur penyimpanan history member.
   - Tambahkan tabel baru, misalnya `member_activity_histories` atau nama lain yang sesuai pola project.
   - Field minimal yang disarankan:
     - `id`
     - `member_id`
     - `activity_type`
     - `ip_address`
     - `user_agent`
     - `description`
     - `metadata`
     - `created_at`
     - `updated_at`
   - `metadata` dapat dipakai untuk data tambahan sederhana dalam bentuk JSON/text jika pola database mendukung.

2. Buat model untuk history member.
   - Tambahkan model baru sesuai standar AdonisJS yang digunakan project.
   - Pastikan relasi ke member dapat dibuat jika pola model existing mendukung.

3. Buat helper/service pencatatan history.
   - Buat helper agar pencatatan history tidak tersebar sebagai duplikasi kode.
   - Helper menerima parameter minimal:
     - member id
     - jenis aktivitas
     - request object
     - deskripsi opsional
     - metadata opsional
   - Helper mengambil IP dari request dengan cara yang konsisten.
   - Helper mengambil user agent dari header request.
   - Jika penyimpanan history gagal, jangan sampai membuat proses utama gagal kecuali aktivitas tersebut memang wajib diaudit.

4. Tentukan aktivitas yang dicatat.
   - Login berhasil.
   - Request token login/OTP jika member sudah diketahui.
   - Update profile member.
   - Request verifikasi email.
   - Request verifikasi nomor telepon.
   - Verifikasi email berhasil.
   - Verifikasi nomor telepon berhasil.
   - Logout jika endpoint logout tersedia.
   - Aktivitas lain bisa ditambahkan nanti tanpa mengubah struktur utama.

5. Buat endpoint membaca history.
   - Contoh endpoint member: `GET /api/v1/member/activity-history`.
   - Endpoint wajib menggunakan auth member.
   - Response berisi daftar history milik member yang sedang login.
   - Tambahkan pagination atau limit sederhana agar response tidak terlalu besar.
   - Urutkan dari aktivitas terbaru.

6. Pertimbangkan endpoint admin jika sudah ada area admin.
   - Jika admin membutuhkan audit member, buat endpoint berdasarkan `member_id`.
   - Endpoint admin harus memakai middleware/otorisasi admin yang sudah ada.
   - Jika belum ada kebutuhan admin, cukup siapkan struktur backend agar mudah ditambahkan nanti.

7. Keamanan dan privasi.
   - Jangan simpan token OTP, password, atau data sensitif lain di `metadata`.
   - Jangan tampilkan data history member lain ke user biasa.
   - Jika aplikasi berada di balik proxy/load balancer, pastikan IP yang dicatat menggunakan sumber yang benar sesuai konfigurasi server.

## Scope Frontend `client.loyalty.system`
1. Tambahkan definisi API baru.
   - Tambahkan endpoint history member di `src/utils/api.js`.
   - Gunakan helper API yang sudah tersedia di project.

2. Tampilkan history aktivitas member.
   - Lokasi yang disarankan adalah halaman Profile atau halaman baru di area member.
   - Tampilkan informasi utama:
     - waktu aktivitas
     - jenis aktivitas
     - deskripsi
     - IP address
     - ringkasan user agent atau perangkat
   - Jika user agent terlalu panjang, tampilkan ringkasannya dan sediakan detail hanya jika diperlukan.

3. State dan UX.
   - Tampilkan loading state saat data diambil.
   - Tampilkan empty state jika belum ada history.
   - Tampilkan error message sederhana jika API gagal.
   - Gunakan pagination/load more jika backend menyediakan pagination.

4. Format tampilan.
   - Gunakan format tanggal yang konsisten dengan halaman lain.
   - Jangan membuat tampilan terlalu ramai; history harus mudah discan.
   - Jangan menampilkan metadata mentah yang sulit dibaca user.

## Alur Data
1. Member melakukan aktivitas, misalnya login berhasil atau update profile.
2. Backend mengambil `member_id`, IP address, dan user agent dari request.
3. Backend menyimpan record history dengan jenis aktivitas yang sesuai.
4. Frontend memanggil endpoint history member.
5. Backend mengembalikan daftar history milik member tersebut.
6. Frontend menampilkan daftar history aktivitas kepada user.

## Acceptance Criteria
1. Setiap login berhasil mencatat history dengan `member_id`, IP address, user agent, dan waktu aktivitas.
2. Aktivitas profile dan verifikasi kontak yang ditentukan ikut tercatat.
3. Endpoint history hanya mengembalikan data milik member yang sedang login.
4. Response history diurutkan dari yang terbaru.
5. Frontend dapat menampilkan daftar history dengan loading, empty, dan error state.
6. Kegagalan pencatatan history tidak membuat flow utama gagal.
7. Data sensitif seperti token OTP tidak tersimpan di history.

## Out of Scope
1. Analisis detail device/browser yang kompleks.
2. Geolocation berdasarkan IP.
3. Export history ke file.
4. Filter lanjutan berdasarkan tanggal atau aktivitas.
5. Notifikasi keamanan ke email/WhatsApp saat login perangkat baru.
6. Dashboard audit lengkap untuk admin, kecuali memang sudah ada kebutuhan terpisah.

## Skenario Test High Level
1. Login berhasil mencatat history member.
2. Update profile mencatat history member.
3. Request dan verifikasi email/nomor telepon mencatat history sesuai aktivitas.
4. Endpoint history tidak bisa diakses tanpa login.
5. Member hanya bisa melihat history miliknya sendiri.
6. History tetap tersimpan walaupun user agent kosong atau IP tidak tersedia.
7. Frontend menampilkan daftar history, empty state, dan error state.
8. Flow login/update profile tetap berhasil walaupun pencatatan history mengalami error.

## Definition of Done
1. Tabel dan model history member tersedia.
2. Helper/service pencatatan history tersedia dan digunakan pada aktivitas yang disepakati.
3. Endpoint history member tersedia dan aman.
4. Frontend memiliki integrasi API dan tampilan history member.
5. Skenario test high level sudah dicek.
