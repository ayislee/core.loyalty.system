# Issue — Status Transaksi `scheduled` untuk Order Pengiriman Terjadwal

## Ringkasan

Tambahkan status transaksi baru `scheduled` dengan ID `10` di Marketplace Core. Status ini dipakai setelah pembayaran order pengiriman terjadwal diterima, sehingga toko dan dashboard dapat membedakan order yang sudah dibayar tetapi belum perlu diproses segera dari order normal yang siap ditangani langsung.

## Struktur repository

| Repository | Peran |
| --- | --- |
| `core.loyalty.system` | Backend Loyalty / proxy |
| `client.loyalty.system` | Frontend Loyalty customer |
| `cms.loyalty.system` | Frontend management Loyalty |
| `backend-mediacartz` | Backend Marketplace / `MARKETPLACE_CORE` |
| `frontend-mediacartz-react` | Frontend Marketplace untuk `backend-mediacartz` |

## Scope perubahan

1. `backend-mediacartz`
2. `frontend-mediacartz-react`

Repository lain tidak perlu diubah untuk versi ini, selama response transaksi yang telah ada sudah meneruskan nama status dari Marketplace Core.

## Latar belakang

Saat ini transaksi yang sudah menerima pembayaran menggunakan status `payment_received` (ID `7`). Dengan adanya pengiriman terjadwal, order dapat sudah dibayar tetapi baru perlu dipersiapkan pada waktu yang dipilih pelanggan. Status tersebut perlu dibedakan agar kasir tidak memperlakukan seluruh transaksi yang dibayar sebagai order yang harus segera disiapkan.

Jadwal dianggap ada bila metadata transaksi memiliki `transaction_data.delivery_schedule.scheduled_at`. Metadata tersebut hanya dibuat untuk checkout yang wajib memilih jadwal karena di luar window operasional toko.

## Tujuan

1. Menambahkan master status transaksi `10. scheduled`.
2. Mengubah transaksi dari `payment_received` menjadi `scheduled` bila transaksi memiliki delivery schedule aktif.
3. Membuat dashboard Marketplace menampilkan transaksi `scheduled` dan memberi aksi yang sama seperti `payment_received`: **Terima Pesanan** dan **Tolak Pesanan**.
4. Menjaga transaksi normal tetap memakai state machine yang berlaku saat ini.

## Definisi status

Tambahkan ke `Utility.getApprovalStatus()`:

| ID | Nama | Arti |
| ---: | --- | --- |
| 7 | `payment_received` | Pembayaran diterima; order normal dapat diproses segera. |
| 10 | `scheduled` | Pembayaran diterima dan order mempunyai jadwal pengiriman/pemrosesan yang tersimpan. |
| 8 | `preparing_items` | Toko telah menerima order dan sedang menyiapkan barang. |
| 9 | `courier_process` | Proses kurir berjalan. |

`scheduled` bukan status pembayaran baru. Status pembayaran gateway tetap dibaca dari `transaction_payment` / `payment_status_detail`; `scheduled` adalah status lifecycle order pada `transaction.transaction_approve_status`.

## Aturan bisnis dan transisi

### Kapan status diberikan

1. Marketplace menerima callback atau proses sukses pembayaran.
2. Flow pembayaran yang ada lebih dulu melakukan transisi normal ke `payment_received`.
3. Jika `transaction_data.delivery_schedule.scheduled_at` ada dan valid, lakukan transisi lanjutan ke `scheduled` dalam alur yang sama.
4. Simpan dua riwayat pada `transaction_status`: `payment_received`, lalu `scheduled`. Ini menjaga audit bahwa pembayaran memang telah diterima.
5. Jika tidak ada schedule, jangan melakukan perubahan; transaksi tetap mengikuti flow normal.

Jangan menentukan `scheduled` dari jam transaksi atau dari status row notifikasi WhatsApp saja. Sumber kebenarannya adalah metadata jadwal pada transaksi.

### Aksi kasir

Untuk transaksi dengan status `payment_received` maupun `scheduled`:

- **Terima Pesanan** memakai endpoint/service yang sama dan melakukan transisi ke `preparing_items`.
- **Tolak Pesanan** memakai endpoint/service yang sama dan melakukan transisi ke `rejected` serta proses rollback stok/refund yang telah ada.
- Validasi endpoint backend harus menerima kedua status, bukan hanya frontend yang menampilkan tombol.

Transaksi `scheduled` tidak boleh otomatis masuk ke `preparing_items` hanya karena scheduler WhatsApp berjalan. Notifikasi jadwal adalah pengingat operasional, bukan penerimaan order otomatis.

### Kondisi terminal dan kompatibilitas

- `rejected`, `failed`, dan `completed` tidak boleh ditimpa menjadi `scheduled` oleh webhook pembayaran duplikat.
- Webhook pembayaran yang diulang harus idempotent: jangan membuat riwayat `scheduled` ganda.
- Jalur saldo penuh, split payment, Xendit, Midtrans, reconciliation, dan replay callback harus memakai helper transisi yang sama.
- Order lama tanpa `delivery_schedule` tidak boleh berubah status saat deployment.

## Perencanaan `backend-mediacartz`

### 1. Tambahkan master status

File utama: `app/Helpers/Utility.js`.

Tambahkan `{ status_id: 10, status_name: "scheduled" }` pada array `getApprovalStatus()`. Pertahankan seluruh ID yang sudah ada; jangan melakukan renumbering status lama karena nilainya tersimpan di database.

Periksa semua pemakaian status yang berupa daftar eksplisit (`whereIn`, filter UI, switch, dan middleware) agar `scheduled` masuk pada kelompok yang tepat, khususnya kelompok order retail yang sudah dibayar namun belum final.

### 2. Buat helper pendeteksi schedule

File yang disarankan: `app/Services/TransactionScheduleService.js`, atau method private yang teruji pada `TransactionService` bila perubahan sangat kecil.

Tanggung jawab helper:

- parse `transaction.transaction_data` secara aman;
- mengembalikan `true` hanya bila `delivery_schedule.scheduled_at` dapat diparse sebagai datetime valid;
- tidak error bila JSON kosong/rusak;
- opsional memeriksa row `transaction_store_notification_schedules` bila desain scheduler membutuhkan schedule aktif, tetapi metadata transaksi tetap menjadi fallback untuk histori.

### 3. Sentralisasi transisi setelah pembayaran berhasil

File yang kemungkinan diubah:

- `app/Services/TransactionService.js`;
- `app/Services/MarketplaceDeliveryOrderService.js`;
- `app/Controllers/Http/PaymentGatewayWebhookController.js`;
- `app/Controllers/Http/TransactionController.js`;
- service settlement saldo/Core Wallet yang memicu payment received.

Buat satu method eksplisit, misalnya `markRetailPaymentReceived({ transaction_id, transaction_object, ... })`, dengan urutan:

1. lock row transaksi dalam database transaction;
2. berhenti bila status terminal atau transaksi sudah pada `scheduled`;
3. update ke `payment_received` menggunakan `updateTransactionAndTransactionStatus()` agar histori tercatat;
4. bila helper mendeteksi schedule, update lagi ke `scheduled` menggunakan helper yang sama;
5. commit;
6. baru jalankan post-payment action/notifikasi setelah commit.

Jangan update kolom `transaction_approve_status` secara langsung karena akan melewati audit `transaction_status` dan hook aplikasi.

### 4. Sesuaikan flow lanjutan transaksi retail

Audit seluruh predicate yang saat ini hanya menerima `payment_received`, `progressing`, atau `verified`.

Contoh area yang perlu diperiksa:

- penerimaan/penolakan order retail;
- persiapan barang dan pencarian driver;
- konfirmasi kurir dan komplain;
- automatic timeout yang hanya boleh membatalkan transaksi benar-benar belum dibayar;
- query list/detail dan filter status transaksi;
- notification scheduler dan post-payment action.

Untuk action **Terima Pesanan** dan **Tolak Pesanan**, izinkan status `scheduled` sebagai sibling `payment_received`. Setelah diterima, status menjadi `preparing_items`; setelah ditolak, status menjadi `rejected` seperti transaksi normal.

### 5. API response dan filter

Pastikan endpoint transaksi dashboard mengirim:

```json
{
  "transaction_approve_status": 10,
  "transaction_approve_status_name": "scheduled"
}
```

Jika endpoint memakai filter status eksplisit, tambahkan ID `10` ke filter default yang menampilkan order aktif/pasca-pembayaran. Jangan memasukkannya ke filter transaksi selesai atau gagal.

### 6. Migration

Tidak diperlukan migration tabel transaksi karena `transaction_approve_status` sudah berupa integer/tinyint yang dapat menyimpan nilai `10`.

Migration hanya diperlukan bila ada constraint database/enum/check constraint khusus yang membatasi nilai status. Verifikasi schema production sebelum memutuskan tidak membuat migration.

## Perencanaan `frontend-mediacartz-react`

### 1. Status label dan badge

File yang diperkirakan diubah:

- `src/dashboard/pages/Retail/Transaksi.js`;
- `src/dashboard/pages/Retail/modal/modal.detailTransaksi.js`;
- helper status seperti `displayStatus` atau konstanta status terkait bila ada.

Tambahkan label/badge yang jelas untuk `scheduled`, misalnya **Terjadwal**. Tetap tampilkan informasi tanggal dan jam jadwal pada popup detail transaksi yang telah tersedia.

### 2. Aksi transaksi

Temukan penentuan action menu/dropdown pada `Transaksi.js` atau helper action-nya. Ubah kondisi agar status `scheduled` mendapat action yang sama seperti `payment_received`:

- Terima Pesanan;
- Tolak Pesanan.

Gunakan endpoint dan payload existing. Jangan membuat endpoint frontend-only atau mengubah status secara lokal; setelah aksi berhasil, reload list/detail dari backend.

### 3. Detail transaksi

Pada popup Detail Transaksi:

- tampilkan badge **Terjadwal**;
- pertahankan tanggal/jam schedule dari `transaction_data.delivery_schedule.scheduled_at`;
- tampilkan aksi Terima/Tolak bila user mempunyai permission yang sama dengan transaksi `payment_received`.

Jika metadata schedule tidak dapat diparse, tetap tampilkan status dari backend tanpa membuat modal error. Tanggal/jam dapat ditampilkan `-` dan dicatat sebagai data legacy yang perlu diperiksa.

## Urutan implementasi

1. Tambahkan ID `10` pada `Utility.getApprovalStatus()`.
2. Identifikasi seluruh jalur payment success retail dan buat helper transisi terpusat/idempotent.
3. Tambahkan transisi `payment_received` → `scheduled` ketika metadata schedule valid.
4. Perluas validasi action Terima/Tolak di backend untuk menerima `scheduled`.
5. Perbarui list/detail/filter API jika masih mengecualikan ID `10`.
6. Perbarui badge dan action dropdown pada Marketplace Dashboard.
7. Uji seluruh gateway dan jalur transaksi sebelum deploy.

## Kriteria penerimaan

1. `Utility.getApprovalStatus("status_name", "scheduled")` menghasilkan ID `10` dan lookup ID `10` menghasilkan `scheduled`.
2. Pembayaran sukses order normal berhenti di state normal yang sudah berlaku; tidak menjadi `scheduled`.
3. Pembayaran sukses order dengan `delivery_schedule.scheduled_at` valid mencatat status `payment_received`, lalu `scheduled`.
4. Tidak ada duplikasi riwayat status pada callback/webhook pembayaran ulang.
5. Transaksi scheduled dapat diterima dan ditolak dari dashboard maupun endpoint backend sesuai permission.
6. Terima Pesanan memindahkan scheduled ke `preparing_items`; Tolak Pesanan memindahkan scheduled ke `rejected` dan menjalankan rollback existing.
7. UI `/dashboard/retail/transaksi` menampilkan badge Terjadwal dan action yang sama dengan `payment_received`.
8. Status terminal tidak dapat berubah menjadi scheduled akibat callback terlambat.
9. Transaksi lama dan transaksi tanpa scheduling tidak mengalami regresi.

## Skenario pengujian

Implementor tidak perlu menulis detail unit test pada issue ini. Minimal verifikasi skenario berikut:

1. Checkout normal, scheduling sebelum toko buka, setelah cutoff, dan hari toko tutup.
2. Pembayaran sukses melalui QRIS/Xendit, Midtrans bila masih aktif, saldo penuh, dan split payment.
3. Callback pembayaran ganda dan callback yang datang setelah transaksi rejected/failed.
4. Terima Pesanan dan Tolak Pesanan dari status `payment_received` serta `scheduled`.
5. Permission kasir/retail yang boleh dan tidak boleh melakukan aksi.
6. Tampilan daftar, filter, badge, popup detail, dan refresh setelah aksi dashboard.
7. Schedule metadata valid, kosong, dan JSON rusak/legacy.

## File yang diperkirakan dimodifikasi atau dibuat

### `backend-mediacartz`

- `app/Helpers/Utility.js` — definisi ID/status `scheduled`.
- `app/Services/TransactionService.js` — helper transisi status, acceptance/rejection, audit history.
- `app/Services/MarketplaceDeliveryOrderService.js` — gunakan helper payment-success terpusat bila flow ini yang menangani callback marketplace.
- `app/Controllers/Http/PaymentGatewayWebhookController.js` — pastikan payment callback memakai flow status baru.
- `app/Controllers/Http/TransactionController.js` — jalur saldo/retail dan action transaksi yang masih membatasi status lama.
- `app/Services/TransactionScheduleService.js` — file baru yang disarankan untuk deteksi metadata scheduling.
- test/service test yang sudah ada di repository — tambah cakupan state machine secukupnya.

### `frontend-mediacartz-react`

- `src/dashboard/pages/Retail/Transaksi.js` — badge, filter, dan action dropdown scheduled.
- `src/dashboard/pages/Retail/modal/modal.detailTransaksi.js` — badge/detail dan action scheduled.
- helper/konstanta status retail yang sudah dipakai project — mapping label/warna jika ada.

## Bukan scope versi ini

- Mengubah jadwal setelah pembayaran.
- Mengubah status notifikasi WhatsApp (`WAITING_PAYMENT`, `PENDING`, `SENT`) menjadi status transaksi utama.
- Membuat status delivery/kurir baru.
- Mengubah frontend Loyalty customer atau CMS Loyalty.
