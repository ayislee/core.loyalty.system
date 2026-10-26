# Issue — Penjadwalan Pengiriman dan Notifikasi WhatsApp Berdasarkan Jam Operasional Toko

## Ringkasan

Marketplace tetap menerima checkout selama 24 jam, tetapi toko hanya wajib menangani pesanan pada jam operasionalnya. Untuk transaksi yang dibuat sebelum toko buka, setelah batas akhir pemrosesan, atau pada hari toko tutup, pelanggan harus menyetujui jadwal pemrosesan/pengiriman yang valid sebelum pembayaran dibuat. Setelah pembayaran berhasil, sistem mengirim notifikasi WhatsApp ke toko pada waktu yang telah dijadwalkan.

Implementasi harus memakai waktu server sebagai sumber kebenaran, menyimpan jadwal secara persisten di `mediacartzdb`, aman terhadap restart/multi-instance, dan idempotent agar WhatsApp tidak terkirim dua kali.

## Struktur repository

| Repository | Peran |
| --- | --- |
| `core.loyalty.system` | Backend Loyalty dan proxy ke Marketplace Core |
| `client.loyalty.system` | Frontend Loyalty Customer |
| `cms.loyalty.system` | Frontend management Loyalty |
| `backend-mediacartz` | Backend Marketplace / `MARKETPLACE_CORE`, pemilik `mediacartzdb` |
| `frontend-mediacartz-react` | Frontend Marketplace untuk `backend-mediacartz` |

## Scope perubahan

Kelima repository berada dalam scope. Pusat aturan bisnis, penyimpanan jadwal, scheduler, dan pengiriman WhatsApp berada di `backend-mediacartz`. `core.loyalty.system` hanya meneruskan kontrak secara terautentikasi dan menjaga quote checkout. Frontend tidak boleh menentukan sendiri apakah toko buka atau tutup.

## Latar belakang

Saat ini pelanggan dapat melakukan transaksi kapan saja. Jika checkout dilakukan saat toko tutup atau terlalu dekat dengan jam tutup, tidak ada jaminan pegawai masih dapat merespons dan memproses pesanan pada hari yang sama.

Jadwal operasional telah tersimpan pada `store.store_operation_time`, misalnya:

```json
["09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "", ""]
```

Indeks array menggunakan urutan:

| Indeks | Hari |
| ---: | --- |
| 0 | Senin |
| 1 | Selasa |
| 2 | Rabu |
| 3 | Kamis |
| 4 | Jumat |
| 5 | Sabtu |
| 6 | Minggu |

String kosong berarti toko tutup pada hari tersebut. Berdasarkan perilaku UI Marketplace yang sudah ada, `NULL` pada keseluruhan `store_operation_time` dianggap toko buka 24 jam. Format selain array tujuh elemen atau slot selain `HH:mm-HH:mm` harus dianggap konfigurasi invalid, bukan diam-diam dianggap buka.

## Tujuan

1. Pelanggan tetap dapat checkout 24/7 tanpa memaksa toko memproses pesanan di luar jam operasional.
2. Pelanggan memilih waktu pemrosesan/pengiriman yang valid ketika checkout berada di luar waktu pemrosesan normal.
3. Toko menerima notifikasi WhatsApp pada jadwal yang disepakati pelanggan.
4. Notifikasi tetap andal setelah restart, aman saat ada beberapa instance service, dapat diulang ketika gagal, dan tidak terkirim ganda.
5. Operasional dapat melihat status jadwal dan kegagalan pengiriman notifikasi.

## Keputusan bisnis dan definisi waktu

### Zona waktu

- Semua evaluasi jam toko menggunakan `Asia/Jakarta` secara default.
- Tambahkan environment `STORE_OPERATION_TIMEZONE=Asia/Jakarta`.
- Simpan datetime database dalam konvensi yang sudah dipakai aplikasi, tetapi setiap konversi harus eksplisit. Response API wajib menyertakan timezone dan datetime ISO-8601 ber-offset.
- Jangan memakai timezone browser untuk memutuskan toko buka atau tutup.

### Buffer batas akhir

Tambahkan environment pada `backend-mediacartz`:

```dotenv
STORE_OPERATION_CUTOFF_BUFFER_MINUTES=60
STORE_NOTIFICATION_SCHEDULE_CRON=*/5 * * * *
STORE_NOTIFICATION_SCHEDULE_MAX_ATTEMPTS=3
STORE_NOTIFICATION_SCHEDULE_LOCK_TIMEOUT_MINUTES=15
STORE_OPERATION_TIMEZONE=Asia/Jakarta
```

`STORE_OPERATION_CUTOFF_BUFFER_MINUTES` mempunyai default `60`. Untuk jadwal `09:00-17:00`, waktu pemrosesan normal berakhir pukul `16:00`. Transaksi pukul `16:00` atau setelahnya diperlakukan sebagai transaksi setelah cutoff. Tentukan batas secara konsisten sebagai interval normal `opening <= now < cutoff`.

### Aturan penentuan jadwal

Aturan hanya berlaku untuk pengiriman kurir/non-`PICKUP`. Pickup tetap mengikuti flow yang ada sampai ada requirement terpisah.

1. Jika `store_operation_time` adalah `NULL`, toko dianggap 24/7 dan tidak perlu popup jadwal.
2. Jika hari ini buka dan waktu server berada di antara jam buka sampai sebelum cutoff, checkout berjalan normal tanpa jadwal.
3. Jika transaksi dibuat sebelum jam buka, tanggal jadwal adalah hari itu dengan pilihan waktu mulai dari jam buka sampai cutoff.
4. Jika transaksi dibuat pada atau setelah cutoff, pilih hari buka berikutnya.
5. Jika transaksi dibuat pada hari tutup, cari hari buka berikutnya.
6. Pencarian hari berikutnya maksimal tujuh hari kalender. Jika seluruh hari tutup, checkout ditolak dengan kode yang jelas, misalnya `STORE_OPERATION_SCHEDULE_UNAVAILABLE`.
7. Bila `close - buffer <= open`, konfigurasi hari tersebut invalid dan tidak boleh ditawarkan sebagai slot.
8. Jadwal pelanggan hanya boleh berada pada tanggal eligible paling awal dan di dalam rentang `opening` sampai `cutoff`. Versi awal tidak perlu mendukung pemilihan beberapa hari ke depan.
9. Simpan snapshot jam operasional dan nilai buffer pada jadwal agar perubahan jam toko setelah transaksi tidak mengubah histori secara diam-diam.
10. Jika pembayaran baru berhasil setelah waktu terpilih lewat, aktivasi jadwal memakai waktu valid terdekat: kirim pada poll berikutnya bila toko masih dalam window operasional, atau geser ke pembukaan hari operasional berikutnya. Catat alasan penyesuaian pada audit schedule.

### Perilaku notifikasi pembayaran

- Order normal: WhatsApp pembayaran berhasil ke toko tetap dikirim langsung seperti sekarang.
- Order terjadwal: WhatsApp pembayaran berhasil ke pelanggan dan notifikasi internal tetap dikirim langsung, tetapi WhatsApp pembayaran berhasil ke toko **ditunda** sampai `scheduled_at`.
- Pesan terjadwal ke toko harus menggunakan builder yang sama dengan pesan toko pada `RetailPostPaymentService._buildStoreMessage()`. Jangan menyalin template ke service lain karena akan menyebabkan template berbeda.
- Email toko tidak perlu ditunda pada versi pertama, kecuali bisnis memutuskan lain. Dokumen ini hanya mewajibkan penundaan WhatsApp toko.
- Jadwal tidak boleh aktif sebelum pembayaran berhasil. Order expired, cancelled, atau rejected harus membatalkan jadwal.

## Desain data `mediacartzdb`

### Tabel baru

Nama yang disarankan: `transaction_store_notification_schedule`.

Kolom minimum:

| Kolom | Tipe/aturan | Keterangan |
| --- | --- | --- |
| `transaction_store_notification_schedule_id` | BIGINT/INT unsigned, PK | ID jadwal |
| `transaction_id` | FK ke `transaction.transaction_id`, not null | Transaksi Marketplace |
| `store_id` | FK ke `store.store_id`, not null | Toko tujuan |
| `notification_type` | VARCHAR(50), not null | Awalnya `PAYMENT_SUCCESS_STORE_WHATSAPP` |
| `recipient_msisdn` | VARCHAR(30), not null | Snapshot nomor toko setelah normalisasi |
| `customer_selected_at` | DATETIME, not null | Waktu yang dipilih pelanggan |
| `scheduled_at` | DATETIME, not null | Waktu aktual scheduler boleh mengirim |
| `timezone` | VARCHAR(50), not null | Default `Asia/Jakarta` |
| `operation_time_snapshot` | TEXT/JSON, not null | Snapshot array tujuh hari |
| `cutoff_buffer_minutes` | INT unsigned, not null | Snapshot buffer |
| `status` | VARCHAR(30), not null | `WAITING_PAYMENT`, `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `CANCELLED` |
| `attempt_count` | INT unsigned default 0 | Jumlah percobaan |
| `max_attempts` | INT unsigned default 3 | Snapshot batas percobaan |
| `locked_at` | DATETIME nullable | Lock worker |
| `lock_token` | VARCHAR(100) nullable | Identitas claim worker |
| `last_attempt_at` | DATETIME nullable | Percobaan terakhir |
| `sent_at` | DATETIME nullable | Waktu berhasil |
| `failed_at` | DATETIME nullable | Waktu gagal final |
| `cancelled_at` | DATETIME nullable | Waktu dibatalkan |
| `provider_reference` | VARCHAR(255) nullable | ID provider WhatsApp |
| `last_error` | TEXT nullable | Error terakhir tanpa credential/secret |
| `payload_snapshot` | TEXT/JSON nullable | Metadata audit, bukan credential |
| `created_at` / `updated_at` | DATETIME | Audit |

Index/constraint:

- unique `(transaction_id, notification_type)` untuk idempotency;
- index `(status, scheduled_at)` untuk polling;
- index `store_id`;
- foreign key memakai perilaku delete yang aman. Transaksi production sebaiknya tidak dihapus; jangan cascade bila berisiko menghilangkan audit.

### Model

Buat model Lucid `TransactionStoreNotificationSchedule` dengan relasi ke `Transaction` dan `Store`. Gunakan penamaan primary key eksplisit mengikuti konvensi model lama.

### Penggunaan kolom transaksi existing

Isi `transaction.transaction_delivery_expected_datetime` dengan waktu yang dipilih pelanggan. Simpan metadata tambahan di `transaction_data.delivery_schedule`, minimal:

```json
{
  "required": true,
  "reason": "AFTER_CUTOFF",
  "timezone": "Asia/Jakarta",
  "customer_selected_at": "2026-10-27T09:30:00+07:00",
  "scheduled_at": "2026-10-27T09:30:00+07:00",
  "operation_time_snapshot": ["09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "", ""],
  "cutoff_buffer_minutes": 60
}
```

Tabel schedule tetap menjadi sumber status pengiriman notifikasi. `transaction_data` hanya snapshot untuk membaca detail transaksi tanpa join tambahan.

## Kontrak API yang direncanakan

### Preview eligibility jadwal di Marketplace Core

Tambahkan endpoint internal yang dilindungi `VerifyCoreLoyaltyRequest`, misalnya:

`POST /api/v1/transaction/retail/delivery-schedule/preview`

Input minimum:

```json
{
  "store_id": 123,
  "ms_delivery_id": 2,
  "client_request_id": "checkout-uuid"
}
```

Response ketika jadwal tidak diperlukan:

```json
{
  "success": true,
  "data": {
    "required": false,
    "timezone": "Asia/Jakarta",
    "reason": "WITHIN_OPERATION_WINDOW"
  }
}
```

Response ketika jadwal diperlukan:

```json
{
  "success": true,
  "data": {
    "required": true,
    "reason": "BEFORE_OPENING",
    "timezone": "Asia/Jakarta",
    "service_date": "2026-10-27",
    "selectable_start_at": "2026-10-27T09:00:00+07:00",
    "selectable_end_at": "2026-10-27T16:00:00+07:00",
    "cutoff_buffer_minutes": 60,
    "schedule_token": "signed-or-opaque-token"
  }
}
```

Gunakan reason code eksplisit: `BEFORE_OPENING`, `AFTER_CUTOFF`, `CLOSED_DAY`, atau `WITHIN_OPERATION_WINDOW`.

### Checkout preview Loyalty

Response `POST /member/checkout/preview` pada `core.loyalty.system` ditambah:

```json
{
  "delivery_schedule": {
    "required": true,
    "reason": "AFTER_CUTOFF",
    "timezone": "Asia/Jakarta",
    "service_date": "2026-10-27",
    "selectable_start_at": "2026-10-27T09:00:00+07:00",
    "selectable_end_at": "2026-10-27T16:00:00+07:00",
    "schedule_token": "opaque"
  }
}
```

Masukkan hasil eligibility ke quote token supaya commit tidak dapat mengganti toko, delivery method, atau window tanpa preview ulang.

### Checkout commit Loyalty

Request commit ditambah field ketika `required=true`:

```json
{
  "quote_token": "...",
  "client_request_id": "checkout-uuid",
  "delivery_schedule_token": "opaque",
  "delivery_scheduled_at": "2026-10-27T09:30:00+07:00"
}
```

Backend harus menolak:

- field hilang saat schedule wajib: `DELIVERY_SCHEDULE_REQUIRED`;
- waktu di luar window: `DELIVERY_SCHEDULE_INVALID`;
- jadwal/jam toko berubah sejak preview: `DELIVERY_SCHEDULE_CHANGED`, lalu client melakukan preview ulang;
- konfigurasi toko invalid: `STORE_OPERATION_SCHEDULE_INVALID`;
- tidak ada hari buka: `STORE_OPERATION_SCHEDULE_UNAVAILABLE`.

`core.loyalty.system` meneruskan token dan datetime tersebut ke payload retail order. `backend-mediacartz` tetap menghitung/validasi ulang terhadap store dan token; data client tidak boleh dipercaya langsung.

### Endpoint monitoring operasional

Untuk `cms.loyalty.system`, tambahkan proxy admin pada `core.loyalty.system` dan endpoint sumber di `backend-mediacartz`:

- `GET /admin/notification-schedules` dengan filter status, toko, transaction ID, dan rentang tanggal;
- `GET /admin/notification-schedules/:id`;
- `POST /admin/notification-schedules/:id/retry` hanya untuk `FAILED`;
- `POST /admin/notification-schedules/:id/cancel` hanya untuk jadwal yang belum `SENT`.

Endpoint wajib mengikuti autentikasi/otorisasi admin yang sudah ada. Retry harus idempotent dan tidak boleh membuat row baru.

## Perencanaan per repository

### A. `backend-mediacartz`

Repository ini menjadi pemilik aturan bisnis dan scheduler.

#### 1. Service perhitungan jam operasional

Buat `app/Services/StoreOperationScheduleService.js` dengan tanggung jawab:

- parse `store_operation_time` dari string JSON atau array;
- validasi tujuh elemen dan format `HH:mm-HH:mm`;
- mapping Senin `[0]` sampai Minggu `[6]` tanpa memakai mapping bawaan JavaScript secara langsung;
- hitung cutoff berdasarkan environment;
- menentukan `required`, reason, tanggal eligible, dan window pilihan;
- validasi datetime pilihan pelanggan;
- menangani `NULL` sebagai toko 24/7;
- menghasilkan response serializable dan testable tanpa akses HTTP.

Gunakan library tanggal yang sudah tersedia di project. Semua fungsi inti sebaiknya menerima `now` sebagai parameter agar mudah diuji.

#### 2. Migration dan model schedule

Buat migration baru di `database/migrations/` dan model:

- `app/Models/TransactionStoreNotificationSchedule.js`;
- relasi opsional pada `app/Models/Transaction.js` dan `app/Models/Store.js`.

Migration harus mempunyai `up` dan `down`, aman terhadap urutan deployment, serta index sesuai desain data.

#### 3. Endpoint preview dan validasi retail order

Perubahan diperkirakan pada:

- `start/routes/client.js`;
- controller baru `app/Controllers/Http/DeliveryScheduleController.js`, atau method terpisah pada controller retail;
- `app/Controllers/Http/TransactionController.js` pada pembuatan retail order;
- validator retail yang sekarang menangani payload order, misalnya `app/Validators/FormTransactionRetail.js`;
- `app/Middleware/VerifyRetailPayload.js` bila perlu membawa konteks schedule.

Saat order dibuat:

1. validasi ulang schedule terhadap store dan delivery method;
2. isi `transaction_delivery_expected_datetime`;
3. simpan snapshot di `transaction_data.delivery_schedule`;
4. buat satu row notification schedule berstatus `WAITING_PAYMENT` dalam database transaction yang sama;
5. jangan membuat schedule untuk pickup atau checkout normal.

#### 4. Aktivasi dan pembatalan schedule

Tambahkan `app/Services/Notification/StoreNotificationScheduleService.js`.

Service ini menangani:

- `createWaitingPaymentSchedule()`;
- `activateForPaidTransaction()` menjadi `PENDING`;
- penyesuaian jadwal bila waktu pilihan sudah lewat;
- `cancelForFailedTransaction()`;
- claim row due secara atomic;
- retry dan recovery lock;
- pemrosesan satu row sampai `SENT`/`FAILED`.

Hubungkan aktivasi pada semua jalur pembayaran sukses:

- saldo penuh pada `TransactionController`;
- callback Xendit pada `PaymentGatewayWebhookController`;
- callback Midtrans pada `TransactionController.postHandlingNotification`;
- jalur reconciliation/replay pembayaran yang sudah ada.

Hubungkan pembatalan pada payment expired/cancelled/denied dan penolakan transaksi sebelum notifikasi terkirim.

#### 5. Reuse notifikasi pembayaran berhasil

Refactor `app/Services/Notification/RetailPostPaymentService.js`:

- ekstrak method publik terfokus, misalnya `sendStorePaymentSuccessWhatsapp(transactionId, options)`;
- method tersebut tetap memakai `_buildStoreMessage()` yang sama;
- `handleRetailPaymentSuccess()` mengecek keberadaan schedule aktif;
- bila terjadwal, lewati WhatsApp toko langsung tanpa melewati notifikasi konsumen/internal/email;
- scheduler memanggil method publik tadi dan menyimpan provider reference;
- setelah sukses, pertahankan kompatibilitas marker `transaction_data.post_payment_action.store_whatsapp_sent_at` untuk mencegah jalur lama mengirim ulang.

Kegagalan WhatsApp tidak boleh mengubah status pembayaran atau membatalkan order.

#### 6. Repeatable scheduler setiap lima menit

Gunakan pola Bull/Redis yang sudah ada di:

- `start/bull.js`;
- `start/events.js`.

Tambahkan queue khusus, misalnya:

- `queueStoreNotificationScheduleScan` untuk scan setiap lima menit;
- `queueStoreNotificationScheduleSend` untuk mengirim per-row bila pemisahan worker dibutuhkan.

Ketentuan:

- repeat cron membaca `STORE_NOTIFICATION_SCHEDULE_CRON` dengan default `*/5 * * * *`;
- gunakan job ID stabil agar beberapa instance tidak mendaftarkan repeat job ganda;
- claim database wajib atomic; queue saja tidak cukup untuk menjamin idempotency;
- row `PROCESSING` yang terkunci lebih lama dari timeout dapat direcovery;
- retry maksimal mengikuti snapshot `max_attempts`;
- log tidak boleh memuat credential provider atau full secret.

Karena `start/events.js` dimuat saat service berjalan, scheduler akan otomatis aktif bersama service/worker seperti scheduler existing. Dokumentasikan bahwa deployment production tetap membutuhkan Redis dan worker Bull aktif.

#### 7. Endpoint operasional

Buat controller, route, dan validator untuk list/detail/retry/cancel schedule. Response list harus membawa transaction ID/number, nama toko, scheduled time, status, attempt, sent time, serta error ringkas.

#### 8. Environment dan dokumentasi

Perbarui:

- `.env.example`;
- dokumentasi API bila repository mempunyai dokumen endpoint;
- deployment notes tentang timezone, Redis worker, dan migration.

### B. `core.loyalty.system`

#### 1. Proxy preview jadwal

Perubahan utama:

- `app/Controllers/Http/CheckoutController.js`;
- `app/Services/MarketplaceFulfillmentService.js` atau service baru untuk schedule;
- `start/routes/member.js` bila kontrak endpoint checkout perlu disesuaikan;
- dokumentasi API/checkout.

Pada checkout preview:

1. setelah store dan delivery method final diketahui, panggil endpoint schedule preview Marketplace Core dengan signature yang sudah digunakan integrasi Marketplace;
2. sertakan hasil schedule dalam response preview;
3. masukkan store, delivery method, schedule token/window, dan operation snapshot hash ke quote token;
4. jangan menghitung jadwal hanya dari browser.

Pada checkout commit:

1. wajibkan pilihan bila quote menyatakan `required=true`;
2. cocokkan pilihan dengan quote;
3. teruskan schedule token/datetime ke retail order;
4. propagasikan error code schedule dari upstream secara konsisten;
5. jangan membuat balance hold baru ketika commit hanya perlu diulang akibat `DELIVERY_SCHEDULE_CHANGED`.

#### 2. Proxy monitoring untuk CMS

Buat controller/service admin yang meneruskan list/detail/retry/cancel ke `backend-mediacartz`. Gunakan autentikasi admin Core Loyalty dan signature service-to-service. Jangan mengekspos endpoint internal tanpa otorisasi.

#### 3. Response transaksi

Pastikan list/detail transaksi member meneruskan:

- `transaction_delivery_expected_datetime`;
- `delivery_schedule` atau ringkasan jadwal;
- status notifikasi schedule bila memang aman ditampilkan kepada pelanggan.

### C. `client.loyalty.system`

#### 1. Popup jadwal sebelum pembayaran

Perubahan utama:

- `src/pages/Order/index.jsx`;
- komponen baru yang disarankan: `src/components/DeliveryScheduleModal/index.jsx`;
- helper opsional: `src/utils/deliverySchedule.js`;
- `src/utils/api.js` hanya bila ada endpoint client tambahan.

Flow yang harus dibentuk:

1. pengguna klik Bayar;
2. client meminta checkout preview seperti sekarang;
3. bila `delivery_schedule.required=false`, lanjut commit seperti sekarang;
4. bila `required=true`, hentikan sebelum checkout commit dan sebelum token/QRIS/redirect gateway ditampilkan;
5. tampilkan alasan bahwa toko sedang di luar waktu pemrosesan normal;
6. tampilkan tanggal eligible dan input waktu yang dibatasi `selectable_start_at` sampai `selectable_end_at`;
7. setelah pelanggan menyetujui, kirim `delivery_schedule_token` dan `delivery_scheduled_at` pada commit;
8. setelah commit sukses, baru tampilkan QRIS, Midtrans, Xendit redirect, atau hasil saldo penuh;
9. gunakan `client_request_id` yang sama ketika flow dijeda oleh popup agar idempotency checkout tidak rusak.

Popup harus menampilkan timezone/jam lokal secara jelas, misalnya:

> Toko sedang tidak menerima pemrosesan langsung. Pilih waktu pengiriman pada Selasa, 27 Oktober 2026 antara 09.00–16.00 WIB.

Jangan menyediakan tanggal atau jam di luar window server. Jika server mengembalikan `DELIVERY_SCHEDULE_CHANGED`, tutup loading, lakukan preview ulang, dan minta pelanggan memilih kembali.

#### 2. Ringkasan dan detail transaksi

Tampilkan jadwal yang dipilih pada ringkasan sebelum konfirmasi dan pada detail/daftar transaksi jika field tersedia. Label yang disarankan: **Jadwal pengiriman**. Jangan menjanjikan waktu kurir tiba; jelaskan bahwa waktu tersebut adalah jadwal toko mulai menangani pengiriman.

### D. `cms.loyalty.system`

Tambahkan halaman monitoring read-only dengan aksi terbatas untuk tim operasional Loyalty.

File yang disarankan:

- `src/pages/NotificationSchedule/NotificationSchedule.tsx`;
- `src/pages/NotificationSchedule/NotificationScheduleDetail.tsx` bila detail tidak memakai modal;
- konfigurasi route/sidebar yang saat ini dipakai aplikasi;
- service request existing di `src/services/Request`.

Fitur minimum:

- tabel schedule dengan transaction ID/number, toko, nomor tujuan yang dimasking, jadwal, status, attempt, dan error terakhir;
- filter status, toko, dan rentang tanggal;
- detail audit;
- retry untuk `FAILED` dan cancel untuk jadwal belum terkirim, dilindungi konfirmasi;
- tidak boleh mengedit manual `scheduled_at` pada versi pertama.

Jika akses operasional schedule diputuskan hanya berada di Marketplace Dashboard, halaman CMS dapat dibuat read-only atau disembunyikan dengan feature flag. API proxy tetap harus memiliki authorization.

### E. `frontend-mediacartz-react`

#### 1. Validasi jadwal toko

Perbarui form toko yang sudah menangani `store_operation_time`:

- `src/dashboard/pages/Retail/modal/modal.TambahToko.js`;
- `src/dashboard/pages/Retail/modal/modal.detailToko.js`.

Ketentuan:

- selalu kirim array tujuh elemen Senin–Minggu ketika jadwal diaktifkan;
- validasi `open < close`;
- hari tutup dikirim sebagai string kosong;
- tampilkan cutoff efektif berdasarkan buffer backend, atau minimal keterangan bahwa pesanan mendekati jam tutup dijadwalkan ke hari berikutnya;
- jangan mengubah `NULL` menjadi array kosong secara tidak sengaja karena `NULL` berarti 24/7.

#### 2. Tampilan order terjadwal

Perbarui:

- `src/dashboard/pages/Retail/Transaksi.js`;
- `src/dashboard/pages/Retail/modal/modal.detailTransaksi.js`;
- komponen fulfillment/action bila jadwal perlu ditampilkan di sana.

Tampilkan badge **Terjadwal**, waktu pemrosesan/pengiriman, dan status notifikasi. Aksi **Terima Pesanan** tetap mengikuti state machine Marketplace; jadwal hanya mengatur waktu notifikasi, bukan otomatis menerima atau mencari driver.

#### 3. Monitoring schedule Marketplace

Jika dashboard Marketplace menjadi UI operasional utama, tambahkan tab/filter schedule pada halaman transaksi atau halaman khusus. Gunakan endpoint backend langsung sesuai autentikasi dashboard. Hindari dua implementasi aturan retry yang berbeda antara CMS dan Marketplace frontend.

## Urutan implementasi yang disarankan

1. Tetapkan environment, timezone, format schedule, dan error code.
2. Buat migration/model schedule di `backend-mediacartz`.
3. Buat dan uji service perhitungan jam operasional sebagai fungsi terpisah.
4. Tambahkan endpoint preview dan validasi retail order.
5. Buat lifecycle schedule `WAITING_PAYMENT` → `PENDING`/`CANCELLED`.
6. Refactor reuse pesan toko dan implementasikan worker/scheduler Bull.
7. Tambahkan contract proxy pada `core.loyalty.system`.
8. Implementasikan popup dan flow pause/resume checkout pada `client.loyalty.system`.
9. Tambahkan tampilan order terjadwal dan validasi store pada `frontend-mediacartz-react`.
10. Tambahkan monitoring pada `cms.loyalty.system` dan/atau Marketplace Dashboard.
11. Jalankan migration staging, aktifkan feature flag, lalu lakukan end-to-end test sebelum production.

## Feature flag dan rollout

Tambahkan feature flag agar rollout dapat dihentikan tanpa rollback code:

```dotenv
STORE_DELIVERY_SCHEDULE_ENABLED=false
```

Ketentuan:

- ketika false, checkout dan notifikasi berjalan seperti saat ini;
- migration boleh tetap terpasang;
- aktifkan pertama di staging untuk satu/dua toko dengan jadwal valid;
- pastikan repeat worker hanya memproses schedule ketika flag aktif, tetapi row yang sudah `PENDING` tidak boleh terlupakan saat flag dinyalakan kembali;
- tentukan prosedur operasional untuk row due selama flag nonaktif.

## Observability dan keamanan

- Log minimum: schedule ID, transaction ID, store ID, status lama/baru, attempt, scheduled time, dan provider reference.
- Mask nomor WhatsApp pada log dan UI management.
- Jangan simpan API key/provider credential pada payload snapshot atau error.
- Sediakan metric/jumlah untuk `PENDING overdue`, `SENT`, `FAILED`, dan retry.
- Alert bila ada schedule `PENDING` melewati jadwal lebih dari dua interval polling atau jumlah `FAILED` meningkat.
- Semua endpoint retry/cancel harus tercatat pada audit log beserta admin pelaku.

## Kriteria penerimaan

1. Checkout dalam window normal berjalan tanpa popup jadwal dan notifikasi toko tetap langsung.
2. Checkout sebelum toko buka meminta jadwal pada hari yang sama.
3. Checkout setelah cutoff meminta jadwal pada hari buka berikutnya.
4. Checkout pada hari tutup mencari hari buka berikutnya.
5. Client tidak dapat mengirim jadwal di luar window server.
6. QRIS/metode pembayaran baru muncul setelah pelanggan menyetujui jadwal ketika jadwal wajib.
7. Order terjadwal membuat satu row schedule dan tidak membuat duplikat pada retry checkout/webhook.
8. Schedule belum aktif sebelum pembayaran berhasil.
9. Pembayaran sukses tetap mengirim notifikasi konsumen, tetapi WhatsApp toko ditunda untuk order terjadwal.
10. Pada waktunya, toko menerima isi pesan yang sama dengan notifikasi pembayaran berhasil yang sekarang.
11. Scheduler berjalan otomatis setiap lima menit setelah service/worker aktif.
12. Beberapa instance service tidak menyebabkan WhatsApp ganda.
13. Restart service tidak menghilangkan jadwal.
14. Order expired/cancelled/rejected tidak mengirim WhatsApp terjadwal.
15. Kegagalan provider dicatat, di-retry sampai batas, lalu berstatus `FAILED`.
16. Tim operasional dapat melihat status schedule serta menjalankan retry/cancel sesuai izin.
17. Jam toko pada frontend Marketplace tetap tersimpan sebagai array Senin–Minggu yang valid.

## Skenario pengujian

Tidak perlu menuliskan implementasi unit test secara rinci. Implementor minimal menguji:

1. Senin–Minggu, termasuk perpindahan Minggu ke Senin.
2. Sebelum buka, tepat saat buka, sebelum cutoff, tepat cutoff, setelah cutoff, dan setelah tutup.
3. Hari tutup berurutan dan toko tutup tujuh hari.
4. `store_operation_time` `NULL`, string JSON valid, array valid, dan format rusak.
5. Buffer default dan buffer environment yang berbeda.
6. Checkout pickup versus pengiriman kurir.
7. Flow QRIS, Midtrans/Xendit lain, saldo penuh, dan split payment.
8. Pembayaran berhasil sebelum jadwal, setelah jadwal lewat, expired, cancelled, dan webhook duplikat.
9. Scheduler dua worker/instance, restart saat `PROCESSING`, retry provider, serta recovery stale lock.
10. Nomor toko invalid/tidak tersedia.
11. Perubahan jam operasional antara preview dan commit.
12. Monitoring CMS/Marketplace, authorization, retry, cancel, masking nomor, dan filter.
13. Regression order normal, notifikasi konsumen, email/internal notification, acceptance toko, dan pencarian driver.

## File yang diperkirakan dibuat atau dimodifikasi

### `backend-mediacartz`

- `database/migrations/<timestamp>_transaction_store_notification_schedule_schema.js` — create/drop tabel dan index.
- `app/Models/TransactionStoreNotificationSchedule.js` — model schedule.
- `app/Models/Transaction.js` — relasi schedule bila diperlukan.
- `app/Models/Store.js` — relasi dan konsistensi parsing jam toko bila diperlukan.
- `app/Services/StoreOperationScheduleService.js` — aturan window/cutoff.
- `app/Services/Notification/StoreNotificationScheduleService.js` — lifecycle, claim, retry, send.
- `app/Services/Notification/RetailPostPaymentService.js` — reuse pesan dan penundaan WhatsApp toko.
- `app/Controllers/Http/DeliveryScheduleController.js` — preview schedule.
- `app/Controllers/Http/NotificationScheduleController.js` — monitoring/retry/cancel.
- `app/Controllers/Http/TransactionController.js` — validasi order, penyimpanan schedule, payment lifecycle.
- `app/Controllers/Http/PaymentGatewayWebhookController.js` — aktivasi/cancel schedule pada Xendit.
- validator/middleware retail terkait — field dan validasi awal.
- `start/routes/client.js` serta route admin terkait — endpoint baru.
- `start/bull.js` — queue schedule.
- `start/events.js` — repeat job dan processor.
- `.env.example` — buffer, cron, timezone, attempt, lock timeout, feature flag.

### `core.loyalty.system`

- `app/Controllers/Http/CheckoutController.js` — preview/commit schedule.
- `app/Services/MarketplaceFulfillmentService.js` atau service schedule baru — signed upstream call.
- controller/service admin notification schedule baru — proxy CMS.
- `start/routes/member.js` dan `start/routes/admin.js` — route bila diperlukan.
- `.env.example` — feature flag/konfigurasi proxy bila diperlukan.
- dokumentasi kontrak API checkout.

### `client.loyalty.system`

- `src/pages/Order/index.jsx` — flow preview, popup, resume commit, ringkasan schedule.
- `src/components/DeliveryScheduleModal/index.jsx` — komponen popup baru.
- `src/utils/deliverySchedule.js` — formatting/validasi presentasi opsional.
- `src/pages/TransactionDetail/index.jsx` dan/atau `src/pages/TransactionList/index.jsx` — tampilkan jadwal.

### `cms.loyalty.system`

- `src/pages/NotificationSchedule/NotificationSchedule.tsx` — list/filter/action.
- `src/pages/NotificationSchedule/NotificationScheduleDetail.tsx` — opsional untuk detail.
- file router/sidebar aplikasi — menu baru.
- service/type terkait response schedule.

### `frontend-mediacartz-react`

- `src/dashboard/pages/Retail/modal/modal.TambahToko.js` — validasi jadwal tujuh hari.
- `src/dashboard/pages/Retail/modal/modal.detailToko.js` — tampilan jadwal/cutoff.
- `src/dashboard/pages/Retail/Transaksi.js` — badge dan filter order terjadwal.
- `src/dashboard/pages/Retail/modal/modal.detailTransaksi.js` — detail schedule/status notification.
- halaman/tab monitoring schedule bila diputuskan berada di dashboard Marketplace.

## Bukan bagian versi pertama

- pemesanan beberapa hari ke depan selain hari eligible paling awal;
- lebih dari satu interval buka dalam satu hari;
- pengiriman otomatis atau pemesanan driver otomatis berdasarkan schedule;
- perubahan jadwal oleh pelanggan setelah pembayaran;
- penundaan email/internal notification;
- hari libur nasional atau tanggal pengecualian khusus. Ini dapat ditambahkan kemudian melalui tabel kalender toko tanpa mengubah kontrak dasar schedule.
