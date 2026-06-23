# Issue: Tampilkan Tombol Cari Driver Manual Saat GoSend Ditolak

## Informasi Umum

1. `core.loyalty.system` adalah backend loyalty sekaligus proxy.
2. `client.loyalty.system` adalah frontend loyalty customer.
3. `cms.loyalty.system` adalah frontend management loyalty.
4. `backend-mediacartz` adalah backend marketplace atau `MARKETPLACE_CORE`.
5. `frontend-mediacartz-react` adalah frontend marketplace untuk `backend-mediacartz`.

## Latar Belakang

Pada halaman marketplace `frontend-mediacartz-react` route `/dashboard/retail/transaksi`, user dapat membuka detail transaksi melalui modal detail transaksi.

Di modal tersebut sudah ada bagian history transaksi pengiriman dan sudah ada tombol `Cari Driver Manual` yang memanggil endpoint:

```text
POST /api/v1/transaction/number/:transaction_number/shipping/gosend/retry
```

Saat ini tombol tersebut bergantung pada field response `can_manual_search_driver`. Dari pengecekan awal, eligibility manual search driver di `backend-mediacartz` masih berfokus pada status pengiriman `No Driver Found`.

Kebutuhan baru: jika status pengiriman terakhir adalah `Ditolak` dan status transaksi masih `processing` atau `progressing`, maka tombol `Cari Driver Manual` harus tampil agar user dapat melakukan pencarian driver ulang secara manual.

Catatan istilah:

1. Di kode backend, status transaksi yang setara dengan `processing` kemungkinan menggunakan nama internal `progressing`.
2. Status pengiriman `Ditolak` perlu dipastikan memakai master shipping status yang benar, saat ini terlihat sebagai internal status id `8`.

## Tujuan

1. Pada halaman `/dashboard/retail/transaksi`, modal detail transaksi menampilkan tombol `Cari Driver Manual` ketika:
   - transaksi menggunakan pengiriman GoSend,
   - status transaksi masih `processing` / `progressing`,
   - status pengiriman terakhir pada history adalah `Ditolak`.
2. Tombol tetap memakai flow manual retry GoSend yang sudah ada.
3. Perubahan tidak mengganggu flow manual retry existing untuk `No Driver Found`.

## Kondisi Implementasi Saat Ini

1. UI detail transaksi berada di:

```text
frontend-mediacartz-react/src/dashboard/pages/Retail/modal/modal.detailTransaksi.js
```

2. Tombol `Cari Driver Manual` sudah tersedia dan ditampilkan ketika:

```text
data?.can_manual_search_driver === true
```

3. Tombol tersebut memanggil:

```text
transaction/number/${data.transaction_number}/shipping/gosend/retry
```

4. Backend membentuk flag eligibility di:

```text
backend-mediacartz/app/Controllers/Http/TransactionController.js
```

khususnya helper:

```text
_buildManualSearchDriverEligibility()
```

5. Endpoint manual retry berada di method:

```text
postGosendManualRetry()
```

6. Saat ini endpoint manual retry masih membatasi retry hanya ketika `ms_shipping_status_id` adalah `12` atau `No Driver Found`.

## Rencana Implementasi

### 1. Pastikan Sumber Status Pengiriman Terakhir

1. Gunakan `transaction_shipping_history` sebagai sumber utama untuk membaca status pengiriman terakhir.
2. Jika history kosong atau tidak tersedia, gunakan fallback `transaction.ms_shipping_status_id`.
3. Ambil entry terakhir berdasarkan waktu `created_at` atau urutan data yang paling baru dari response backend.
4. Hindari hanya membaca status dari label UI karena label dapat berubah.

### 2. Perluas Eligibility Manual Search Driver di Backend

1. Di `backend-mediacartz`, sesuaikan helper `_buildManualSearchDriverEligibility()`.
2. Kondisi `can_manual_search_driver` harus tetap memastikan transaksi adalah GoSend.
3. Kondisi status transaksi harus menerima status paid/in-delivery yang masih aktif:
   - `approved` jika masih dipakai flow existing,
   - `progressing`,
   - atau nama yang di UI disebut `processing`.
4. Tambahkan kondisi baru:
   - status pengiriman terakhir adalah `Ditolak`,
   - internal status id yang perlu diverifikasi adalah `8`.
5. Jangan menghapus kondisi existing untuk `No Driver Found`.
6. Jika business rule existing mensyaratkan `No Driver Found` baru tampil setelah batas auto retry tertentu, aturan tersebut tetap dipertahankan hanya untuk `No Driver Found`.
7. Untuk status `Ditolak`, tombol boleh tampil langsung selama transaksi masih `processing/progressing`.

### 3. Sesuaikan Endpoint Manual Retry

1. Di method `postGosendManualRetry()`, sesuaikan validasi status pengiriman.
2. Endpoint harus menerima manual retry jika status pengiriman aktif/terakhir adalah:
   - `No Driver Found`,
   - atau `Ditolak`.
3. Pesan error jangan lagi menyebut hanya `No Driver Found`.
4. Pastikan retry dari status `Ditolak` tetap memakai booking ulang GoSend dengan `force_rebook`.
5. Jangan mengubah flow booking GoSend lain, voucher, point, stok, atau status pembayaran.

### 4. Sesuaikan Frontend Jika Response Backend Belum Cukup

1. Prioritas utama adalah menggunakan `can_manual_search_driver` dari backend.
2. Jika field backend belum tersedia pada response detail tertentu, frontend boleh memiliki fallback display logic dengan membaca:
   - `data.transaction_approve_status_name`,
   - `data.ms_shipping_status_id`,
   - `data.transaction_shipping_history`.
3. Fallback frontend tidak boleh menampilkan tombol jika transaksi bukan GoSend.
4. Tombol tetap memakai handler existing `handleManualSearchDriver()`.
5. Setelah retry manual berhasil, modal harus refresh data seperti flow existing.

### 5. Pertahankan Permission dan Scope

1. Endpoint manual retry tetap memakai middleware yang sudah ada:

```text
FindOwnCompanyIds
FindTransaction:byTransactionNumber,onlyRetailTransaction,checkCompanies
```

2. Jangan membuka akses retry manual untuk transaksi toko lain.
3. Jangan menambahkan komunikasi dari frontend marketplace ke `core.loyalty.system`; fitur ini berada di flow marketplace `frontend-mediacartz-react` ke `backend-mediacartz`.

## Acceptance Criteria

1. Pada detail transaksi GoSend, jika status transaksi `processing/progressing` dan status pengiriman terakhir `Ditolak`, tombol `Cari Driver Manual` tampil.
2. Tombol tidak tampil jika transaksi bukan GoSend.
3. Tombol tidak tampil jika status transaksi sudah final seperti `rejected`, `failed`, atau `completed`.
4. Kondisi existing untuk `No Driver Found` tetap berjalan seperti sebelumnya.
5. Saat tombol ditekan pada transaksi dengan status pengiriman terakhir `Ditolak`, endpoint manual retry tidak menolak dengan pesan `Manual retry is only available when shipping status is No Driver Found`.
6. Setelah retry manual berhasil, data detail transaksi direfresh dan history pengiriman menampilkan proses pencarian driver baru.
7. Tidak ada perubahan pada flow pembayaran, voucher, point loyalty, stok, atau approval transaksi selain kebutuhan retry pengiriman.

## Skenario Test

Detail implementasi test diserahkan kepada programmer yang mengerjakan. Skenario yang perlu dicakup:

1. Transaksi GoSend dengan status transaksi `progressing` dan status pengiriman terakhir `Ditolak` menampilkan tombol `Cari Driver Manual`.
2. Klik tombol pada kondisi tersebut berhasil memanggil endpoint manual retry.
3. Transaksi GoSend dengan status pengiriman terakhir `No Driver Found` tetap mengikuti aturan existing.
4. Transaksi GoSend dengan status transaksi final tidak menampilkan tombol.
5. Transaksi non-GoSend tidak menampilkan tombol meskipun status pengiriman terakhir `Ditolak`.
6. Jika history pengiriman kosong, fallback `ms_shipping_status_id` tetap bekerja.
7. Setelah retry berhasil, modal detail transaksi memuat ulang data terbaru.

## Di Luar Scope

1. Mengubah status utama transaksi secara manual dari frontend.
2. Mengubah auto retry webhook GoSend.
3. Mengubah flow pembayaran Midtrans.
4. Mengubah perhitungan point loyalty, voucher, stok, atau laporan penjualan.
5. Membuat halaman baru di frontend marketplace.
