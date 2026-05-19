# Issue: Hapus Field Lokasi Lama dari Address Member

## Latar Belakang
Struktur tabel `addresses` masih menyimpan field lokasi lama yang sudah tidak dibutuhkan:
- `province_id`
- `province_name`
- `city_id`
- `city_type`
- `city_name`
- `postal_code`

Perubahan ini diperlukan agar struktur data address lebih sederhana dan konsisten dengan kebutuhan terbaru.

## Tujuan
1. Menghapus field lokasi lama dari tabel `addresses`.
2. Menyesuaikan endpoint address member agar tidak lagi membaca/menulis field yang dihapus.

## Scope Implementasi
1. Database
   - Hapus kolom `province_id`, `province_name`, `city_id`, `city_type`, `city_name`, dan `postal_code` dari tabel `addresses` via migration baru.

2. API Endpoint
   - Update `POST /api/v1/member/address` agar tidak menyimpan field yang dihapus.
   - Update `PUT /api/v1/member/address` agar tidak mengupdate field yang dihapus.
   - Verifikasi `GET /api/v1/member/address` dan `GET /api/v1/member/address/get` tidak lagi mengembalikan field yang dihapus.

3. Dokumentasi
   - Update `API_DOCUMENT.md` pada body request dan response endpoint address.
   - Update `ERD.md` pada section tabel `addresses`.

## Lokasi Perubahan (Referensi File)
1. Migration baru di folder `database/migrations`.
2. Controller: `app/Controllers/Http/AddressController.js`.
3. Dokumentasi API: `API_DOCUMENT.md`.
4. ERD: `ERD.md`.

## Out of Scope
1. Perubahan endpoint selain address member.
2. Perubahan UI frontend.
3. Migrasi/normalisasi data historis di luar tabel `addresses`.

## Rencana Implementasi
1. Buat migration alter table untuk drop 6 kolom target dari `addresses`.
2. Refactor `AddressController.create` dengan menghapus assignment field yang di-drop.
3. Refactor `AddressController.edit` dengan menghapus logic update field yang di-drop.
4. Cek endpoint `list` dan `get` untuk memastikan response sudah bersih dari field yang dihapus.
5. Sinkronkan perubahan pada `API_DOCUMENT.md` dan `ERD.md`.

## Acceptance Criteria
1. Keenam kolom target sudah tidak ada di tabel `addresses`.
2. `POST /api/v1/member/address` tetap sukses untuk payload yang valid tanpa field yang dihapus.
3. `PUT /api/v1/member/address` tetap sukses untuk update data address tanpa field yang dihapus.
4. `GET /api/v1/member/address` dan `GET /api/v1/member/address/get` tidak lagi menampilkan keenam field yang dihapus.
5. Endpoint address tetap berfungsi normal untuk field yang masih dipakai.

## Skenario Test (High Level)
1. Migration berhasil dijalankan dan kolom target benar-benar terhapus.
2. Create address berhasil tanpa `province_id`, `province_name`, `city_id`, `city_type`, `city_name`, dan `postal_code`.
3. Edit address berhasil tanpa logic update ke kolom yang sudah dihapus.
4. GET address list tidak mengandung field yang sudah dihapus.
5. GET address detail tidak mengandung field yang sudah dihapus.
6. Regression: proses create/edit/get address tetap berjalan untuk field lain yang masih aktif.
