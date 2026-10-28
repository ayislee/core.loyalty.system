# Issue — Scheduling Pengiriman Setelah QRIS Dibayar di Luar Jam Operasional

## Ringkasan

Jika QRIS dibuat saat toko masih dapat menerima order, tetapi pelanggan baru menyelesaikan pembayarannya setelah toko melewati jam operasional/cutoff, pelanggan harus memilih jadwal pengiriman setelah pembayaran QRIS terkonfirmasi. Order kemudian menjadi `scheduled`, bukan tetap diperlakukan sebagai `payment_received` normal.

## Struktur repository

| Repository | Peran |
| --- | --- |
| `core.loyalty.system` | Backend Loyalty / proxy |
| `client.loyalty.system` | Frontend Loyalty customer |
| `cms.loyalty.system` | Frontend management Loyalty |
| `backend-mediacartz` | Backend Marketplace / `MARKETPLACE_CORE` |
| `frontend-mediacartz-react` | Dashboard Marketplace |

## Scope perubahan

1. `core.loyalty.system`
2. `client.loyalty.system`
3. `backend-mediacartz`
4. `frontend-mediacartz-react` apabila perlu menyesuaikan tampilan status/detail

`cms.loyalty.system` tidak termasuk scope, kecuali ada halaman transaksi yang memakai status atau metadata schedule yang sama.

## Latar belakang

Saat ini schedule dievaluasi saat checkout commit. Karena QRIS dapat dibayar beberapa menit kemudian, sebuah transaksi dapat dibuat saat toko masih berada dalam window operasional namun dibayar ketika toko sudah tutup atau sudah melewati cutoff operasional.

Pada kondisi tersebut, callback pembayaran saat ini mengubah status menjadi `payment_received` dan notifikasi toko dikirim sebagai order normal. Ini berisiko membuat toko menerima order yang seharusnya diproses pada jadwal berikutnya tanpa adanya kesepakatan waktu pengiriman dari pelanggan.

## Tujuan

1. Setelah pembayaran QRIS sukses, evaluasi kembali jadwal operasional toko berdasarkan **waktu pembayaran berhasil diterima**.
2. Bila pada waktu tersebut scheduling wajib, tampilkan popup pemilihan jadwal pengiriman kepada pelanggan sebelum aplikasi mengarahkan ke `/transaction/list`.
3. Simpan jadwal pilihan pelanggan secara aman dan ubah status order menjadi `scheduled`.
4. Bila pembayaran diterima saat masih berada dalam operational window, pertahankan alur normal: `payment_received` tanpa popup schedule.
5. Hindari notifikasi toko yang menyatakan order siap diproses segera sebelum jadwal pascapembayaran selesai dipilih.

## Definisi dan aturan bisnis

### Waktu yang digunakan

- Gunakan waktu ketika payment gateway dinyatakan sukses oleh Marketplace (`paid_at`, callback timestamp, atau waktu server saat callback diterima sebagai fallback).
- Gunakan timezone operasional yang sama dengan scheduler toko, saat ini `STORE_OPERATION_TIMEZONE` dengan default `Asia/Jakarta`.
- Cutoff tetap memakai `STORE_OPERATION_CUTOFF_BUFFER_MINUTES` (default 60 menit sebelum toko tutup).

### Kapan popup schedule wajib muncul

1. Transaksi berasal dari `CORE_LOYALTY` dan memakai QRIS (termasuk split saldo + QRIS).
2. Pembayaran gateway telah terkonfirmasi sukses.
3. Transaksi belum mempunyai `transaction_data.delivery_schedule.scheduled_at`.
4. Evaluasi `StoreOperationScheduleService.evaluate(store, paidAt)` menghasilkan `required: true`.

Jika seluruh kondisi terpenuhi, transaksi membutuhkan finalisasi schedule pascapembayaran.

### Status sementara setelah pembayaran

Tambahkan flag metadata, misalnya:

```json
{
  "delivery_schedule": {
    "required_after_payment": true,
    "payment_received_at": "2026-10-28T10:30:00.000Z",
    "schedule_finalized_at": null
  }
}
```

Status lifecycle transaksi dapat tetap tercatat sebagai `payment_received` untuk audit pembayaran, tetapi transaksi harus diberi penanda `schedule_pending` pada metadata dan tidak boleh dikirim sebagai order normal ke toko sampai pelanggan memilih jadwal.

Setelah pelanggan memilih jadwal valid:

1. simpan `delivery_schedule.scheduled_at`;
2. hapus/set `required_after_payment` menjadi `false`;
3. ubah status dari `payment_received` menjadi `scheduled` menggunakan helper status existing agar audit `transaction_status` tercatat;
4. buat/aktifkan row scheduler notifikasi toko;
5. antrekan notifikasi sesuai template scheduling yang sudah berlaku.

### Batasan waktu pelanggan memilih jadwal

Tentukan dan dokumentasikan kebijakan eksplisit. Rekomendasi awal:

- transaksi tetap paid, tetapi tidak dapat diproses toko selama `schedule_pending`;
- pelanggan dapat melanjutkan pemilihan schedule dari `/transaction/list` bila popup ditutup/halaman direfresh;
- jangan otomatis refund hanya karena popup ditutup;
- sediakan timeout bisnis terpisah hanya bila product owner menyetujui kebijakan pembatalan/refund.

## Perencanaan `backend-mediacartz`

### 1. Evaluasi ulang saat payment success

File yang kemungkinan diubah:

- `app/Services/MarketplaceDeliveryOrderService.js`
- `app/Services/TransactionService.js`
- `app/Controllers/Http/PaymentGatewayWebhookController.js` atau handler callback gateway yang digunakan
- `app/Services/StoreOperationScheduleService.js`

Saat handler QRIS/Xendit menyatakan pembayaran sukses:

1. ambil transaksi beserta store dalam database transaction/lock;
2. ambil `paidAt` dari provider atau waktu callback;
3. panggil `StoreOperationScheduleService.evaluate(store, paidAt)`;
4. bila schedule tidak diperlukan, lanjutkan flow `payment_received` dan post-payment action normal;
5. bila schedule diperlukan, simpan metadata `required_after_payment` dan `payment_received_at`; jangan membuat notifikasi toko normal;
6. response endpoint get/detail transaksi harus mengembalikan flag ini ke client.

Pastikan webhook duplikat idempotent: flag tidak boleh ditulis ulang secara merusak, riwayat status tidak boleh ganda, dan notifikasi tidak boleh terkirim berulang.

### 2. Endpoint finalisasi schedule pascapembayaran

Buat endpoint Marketplace khusus, contoh:

```text
PUT /transaction/:transaction_id/delivery-schedule
```

Endpoint harus:

- hanya menerima transaksi paid milik customer yang benar melalui Core proxy/signature;
- menerima `delivery_scheduled_at`;
- menolak transaksi terminal, transaksi bukan `CORE_LOYALTY`, dan transaksi yang tidak memiliki `required_after_payment`;
- memvalidasi jadwal memakai `StoreOperationScheduleService.validate(store, selectedAt, paidAt/current time)`;
- menyimpan metadata schedule dan mengubah status ke `scheduled` secara atomik;
- membuat `transaction_store_notification_schedules` pada waktu yang dipilih;
- mengembalikan transaksi terbaru dan `delivery_schedule`.

Gunakan idempotency key atau validasi schedule yang sama untuk menghadapi klik ulang/retry dari client.

### 3. Tahan notifikasi normal sampai schedule final

Audit `RetailPostPaymentService` dan Bull job `RetailPostPaymentService::handleSuccess`.

Untuk transaksi dengan `required_after_payment: true`:

- jangan kirim pesan payment-received normal ke toko;
- jangan menjalankan tindakan yang menganggap toko harus memproses order sekarang;
- notifikasi pelanggan pembayaran sukses boleh dikirim dengan pesan singkat yang menyatakan jadwal pengiriman perlu dipilih, atau ditunda sampai schedule berhasil disimpan sesuai keputusan produk;
- setelah finalisasi, gunakan template notifikasi scheduling yang telah disepakati.

Jangan membatalkan transaksi atau melepaskan saldo split yang telah sukses dibayar hanya karena schedule belum dipilih.

### 4. API list/detail

Endpoint transaksi customer harus mengirim data minimal berikut:

```json
{
  "transaction_id": 123,
  "transaction_approve_status_name": "payment_received",
  "delivery_schedule": {
    "required_after_payment": true,
    "scheduled_at": null,
    "earliest_schedule_at": "...",
    "latest_schedule_at": "..."
  }
}
```

Jangan mengirim seluruh `transaction_data` bila mengandung data internal sensitif; bentuk field publik/terbatas khusus untuk client.

## Perencanaan `core.loyalty.system`

### 1. Proxy finalisasi schedule

File yang kemungkinan diubah:

- `app/Controllers/Http/TransactionController.js`
- `start/routes/member.js`
- validator baru, misalnya `FinalizeDeliverySchedule.js`

Tambahkan endpoint member, contoh:

```text
PUT /api/v1/member/transaction/delivery-schedule
```

Core wajib:

- memverifikasi transaksi milik member;
- meneruskan request ke endpoint Marketplace dengan signature `CORE_LOYALTY` existing;
- meneruskan error validation 422 apa adanya;
- tidak mengubah saldo/wallet hold karena pembayaran sudah selesai;
- menyajikan data schedule publik untuk client.

### 2. Response get/resume transaksi

Pastikan endpoint detail/status QRIS meneruskan `delivery_schedule.required_after_payment`, bounds waktu schedule, dan transaksi terbaru. Hal ini diperlukan ketika halaman direfresh di tengah flow QRIS.

## Perencanaan `client.loyalty.system`

### 1. Popup setelah QRIS sukses

File yang kemungkinan diubah:

- `src/components/QrisPaymentModal/index.jsx`
- `src/pages/Order/index.jsx`
- `src/pages/TransactionList/index.jsx`
- util/API map di `src/utils/api.js`

Setelah polling QRIS menyatakan sukses:

1. jangan langsung redirect ke `/transaction/list`;
2. ambil transaksi terbaru dari endpoint detail/status;
3. bila `delivery_schedule.required_after_payment === true`, tampilkan popup **Jadwalkan Pengiriman**;
4. input tanggal/jam hanya boleh berada dalam `earliest_schedule_at` sampai `latest_schedule_at` yang dikirim backend;
5. setelah pelanggan menekan simpan, panggil endpoint finalisasi schedule;
6. jika sukses, tampilkan konfirmasi dan arahkan ke `/transaction/list`;
7. jika popup ditutup, arahkan ke `/transaction/list` dan tampilkan tombol **Pilih Jadwal Pengiriman** pada transaksi tersebut.

Jangan percaya validasi jam dari browser saja. Client hanya membantu UX; backend tetap sumber kebenaran.

### 2. Lanjutkan dari daftar transaksi

Pada `/transaction/list`, transaksi paid dengan `required_after_payment: true` harus menampilkan aksi utama **Pilih Jadwal Pengiriman**, bukan **Lanjutkan Pembayaran**.

Klik aksi ini membuka popup schedule yang sama dan menyelesaikan endpoint finalisasi. Dengan demikian refresh, penutupan popup, atau gangguan koneksi setelah QRIS sukses tidak membuat transaksi tersangkut tanpa jalur penyelesaian.

### 3. Tampilan status

Sebelum finalisasi, tampilkan label yang jelas, misalnya **Pembayaran diterima — jadwal pengiriman perlu dipilih**. Setelah berhasil, gunakan status **Terjadwal**.

## Perencanaan `frontend-mediacartz-react`

File yang kemungkinan diubah:

- `src/dashboard/pages/Retail/modal/modal.detailTransaksi.js`
- list transaksi retail dan helper display status terkait.

Untuk transaksi `schedule_pending`:

- tampilkan bahwa pembayaran diterima namun menunggu pilihan jadwal pelanggan;
- jangan tampilkan sebagai order yang harus langsung diproses;
- setelah finalisasi schedule, tampilkan status `scheduled` dan tanggal/jam pengiriman seperti implementasi schedule yang sudah ada.

## Urutan implementasi

1. Tambahkan metadata dan helper untuk evaluasi schedule berdasarkan `paidAt`.
2. Ubah flow callback payment QRIS agar menahan post-payment action normal ketika schedule pascapembayaran wajib.
3. Buat endpoint Marketplace finalisasi schedule yang atomik dan idempotent.
4. Buat proxy/member endpoint di Core Loyalty serta validator ownership.
5. Tambahkan popup schedule setelah QRIS sukses dan aksi recovery pada daftar transaksi.
6. Sesuaikan dashboard toko untuk state `schedule_pending` dan `scheduled`.
7. Tambahkan telemetry/log untuk payment success, schedule pending, finalisasi schedule, dan notifikasi scheduler.

## Kriteria penerimaan

1. QRIS dibuat dan dibayar masih dalam operational window: transaksi tetap `payment_received`; popup tidak tampil.
2. QRIS dibuat saat toko buka, lalu dibayar setelah cutoff/toko tutup: popup schedule tampil setelah payment success.
3. Split payment memiliki perilaku sama; saldo tidak dipotong dua kali dan QRIS tetap sesuai sisa alokasi.
4. Schedule yang dipilih di luar window operasional ditolak backend.
5. Finalisasi schedule berhasil mengubah transaksi menjadi `scheduled`, menyimpan metadata, dan membuat notifikasi terjadwal.
6. Toko tidak menerima notifikasi order normal sebelum schedule pending difinalisasi.
7. Menutup popup atau refresh setelah QRIS sukses memungkinkan pelanggan menyelesaikan schedule dari `/transaction/list`.
8. Callback QRIS berulang, retry client, dan klik simpan berulang tidak membuat status/history/notifikasi ganda.
9. Transaksi normal, saldo penuh, dan transaksi legacy tidak mengalami regresi.

## Skenario pengujian

Implementor tidak perlu membuat instruksi unit test yang terlalu rinci. Minimal uji skenario:

1. QRIS dan split payment dibayar sebelum cutoff, setelah cutoff, setelah toko tutup, serta pada hari toko tutup.
2. QRIS kedaluwarsa, pembayaran gagal, callback duplikat, dan callback datang terlambat.
3. Popup dipilih, ditutup, halaman direfresh, koneksi gagal saat submit, lalu dilanjutkan dari transaction list.
4. Validasi timezone Jakarta, jam buka berbeda per hari, cutoff buffer, dan batas awal/akhir schedule.
5. Notifikasi customer/toko sebelum dan setelah finalisasi schedule.
6. Dashboard toko sebelum finalisasi dan sesudah status `scheduled`.

## File yang diperkirakan dimodifikasi atau dibuat

### `backend-mediacartz`

- `app/Services/MarketplaceDeliveryOrderService.js`
- `app/Services/TransactionService.js`
- `app/Services/Notification/RetailPostPaymentService.js`
- `app/Services/StoreOperationScheduleService.js`
- `app/Controllers/Http/TransactionController.js`
- controller/handler webhook payment gateway yang aktif
- route client Marketplace dan middleware signature/ownership terkait
- migration hanya bila metadata terpisah atau tabel schedule memerlukan kolom tambahan

### `core.loyalty.system`

- `app/Controllers/Http/TransactionController.js`
- `start/routes/member.js`
- validator baru untuk finalisasi schedule
- service proxy Marketplace bila project memisahkan concern tersebut

### `client.loyalty.system`

- `src/components/QrisPaymentModal/index.jsx`
- `src/pages/Order/index.jsx`
- `src/pages/TransactionList/index.jsx`
- `src/utils/api.js`
- komponen modal schedule reusable bila diperlukan

### `frontend-mediacartz-react`

- halaman list retail transaksi
- popup detail transaksi
- helper mapping status/transaksi

## Bukan scope

- Mengubah QRIS yang sudah kedaluwarsa atau transaksi yang pembayaran gagal.
- Mengubah waktu kedaluwarsa QRIS.
- Membatalkan/refund otomatis transaksi paid yang belum memilih schedule; kebijakan tersebut perlu issue terpisah.
