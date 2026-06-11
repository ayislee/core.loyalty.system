# Issue: Konfirmasi Barang Diterima Untuk Menunda Loyalty Point Pada Pengiriman Kurir

## Informasi Umum
1. `core.loyalty.system` adalah backend loyalty.
2. `client.loyalty.system` adalah frontend.
3. `backend-mediacartz` adalah service `MARKETPLACE_CORE` yang dikonfigurasi pada `.env` di `core.loyalty.system`.
4. Referensi API GoSend ada di `backend-mediacartz/docs/gosend.md`.

Catatan nama folder: prompt menyebut `backend_mediacartz`, tetapi nama folder aktual di workspace adalah `backend-mediacartz`.

## Aturan Arsitektur Integrasi
Semua komunikasi dari frontend ke marketplace wajib melalui backend loyalty.

```text
client.loyalty.system -> core.loyalty.system -> backend-mediacartz
```

Aturan implementasi:
1. `client.loyalty.system` hanya boleh memanggil endpoint milik `core.loyalty.system`.
2. `client.loyalty.system` tidak boleh memanggil endpoint `backend-mediacartz` / `MARKETPLACE_CORE` secara langsung.
3. `core.loyalty.system` bertanggung jawab melakukan validasi member login, validasi kepemilikan transaksi, lalu meneruskan request ke `MARKETPLACE_CORE`.
4. Endpoint baru untuk `Selesai` dan `Complain` harus dibuat sebagai endpoint member di `core.loyalty.system`, lalu di-forward ke endpoint internal yang sesuai di `backend-mediacartz`.
5. Jika frontend membutuhkan data tambahan dari marketplace, data tersebut harus diteruskan melalui response `core.loyalty.system`.

## Latar Belakang
Saat ini transaksi retail dengan pembayaran online/MIDTRANS akan otomatis berubah menjadi `approved` ketika pembayaran berhasil diterima. Pada transaksi `PURCHASE_RETAIL`, status `approved` saat ini juga menjadi titik pemicu pemberian loyalty point.

Masalahnya, untuk transaksi yang memakai kurir, pembayaran berhasil belum berarti pesanan sudah selesai. Barang masih dalam proses pengiriman. Jika pengiriman gagal setelah point sudah dikirim, data loyalty menjadi tidak valid karena point sudah terlanjur masuk ke konsumen.

Informasi bahwa barang sudah sampai saat ini hanya datang dari webhook GoSend. Informasi ini tetap perlu dikonfirmasi oleh konsumen, karena status provider belum tentu cukup untuk menyatakan transaksi benar-benar selesai dari sisi customer.

## Catatan Status Transaksi
Status transaksi memakai field:

```text
transaction.transaction_approve_status
```

Mapping status ada di `Utility.getApprovalStatus()`:

```text
0 = pending
1 = progressing
2 = verified
3 = approved
4 = rejected
5 = failed
6 = completed
```

Gunakan status aktual di kode:
1. `verified` untuk pembayaran online yang sudah berhasil diverifikasi.
2. `progressing` untuk pesanan yang sedang diproses/dikirim kurir.
3. `completed` untuk pesanan yang sudah selesai dan boleh diberi loyalty point.

Jangan membuat status baru bernama `processing` atau `complete`. Jika perlu label UI, tampilkan `progressing` sebagai "Dalam Pengiriman" dan `completed` sebagai "Selesai".

## Tujuan
1. Pembayaran online/MIDTRANS yang memakai kurir tidak langsung menjadi `approved`.
2. Setelah pembayaran berhasil, transaksi kurir berubah ke `verified`, lalu ke `progressing`, dan keduanya tercatat di `transaction_status`.
3. Loyalty point untuk transaksi kurir baru dikirim setelah transaksi berubah menjadi `completed`.
4. Konsumen bisa menekan tombol `Selesai` jika barang sudah diterima.
5. Konsumen bisa menekan tombol `Complain` untuk diarahkan ke WhatsApp toko dengan pesan awal berisi `transaction_number`.
6. Jika konsumen tidak menekan `Selesai` atau `Complain` dalam 24 jam setelah barang terindikasi sampai, sistem otomatis mengubah transaksi menjadi `completed` dan mengirim point.

## Scope Backend `backend-mediacartz`

### 1. Ubah Flow MIDTRANS Untuk Retail Kurir
File yang perlu dicek:

```text
backend-mediacartz/app/Controllers/Http/TransactionController.js
backend-mediacartz/app/Services/TransactionService.js
backend-mediacartz/app/Services/Notification/RetailPostPaymentService.js
backend-mediacartz/app/Services/DeliveryMethod/GosendWebhookService.js
```

Rencana:
1. Pada callback/payment success MIDTRANS, deteksi transaksi:
   - `ms_transaction.ms_transaction_identifier === "PURCHASE_RETAIL"`
   - pembayaran online/MIDTRANS
   - metode pengiriman memakai kurir, minimal bukan `PICKUP`
2. Untuk transaksi retail kurir, jangan langsung panggil flow yang membuat status `approved` dan langsung mengirim point.
3. Buat helper/service khusus, misalnya:

```js
TransactionService.processRetailCourierPaymentSuccess(...)
```

4. Helper tersebut harus:
   - update status ke `verified`
   - insert history ke `transaction_status`
   - update status lagi ke `progressing`
   - insert history ke `transaction_status`
   - menjalankan post-payment handler yang dibutuhkan untuk booking GoSend
5. Pastikan kedua perubahan status memakai helper existing `updateTransactionAndTransactionStatus` atau pola yang setara, supaya history transaksi selalu tercatat.

Catatan: `RetailPostPaymentService` saat ini perlu dicek karena kemungkinan hanya berjalan jika transaksi sudah `approved`. Untuk flow baru, service ini harus bisa berjalan pada transaksi retail kurir yang sudah `progressing` setelah payment verified.

### 2. Tunda Loyalty Point Untuk Transaksi Kurir
File utama:

```text
backend-mediacartz/app/Services/TransactionService.js
backend-mediacartz/app/Services/LoyaltyService.js
```

Rencana:
1. Untuk transaksi retail non-kurir atau pickup, behavior lama boleh tetap: point dapat dikirim saat transaksi selesai sesuai flow lama.
2. Untuk transaksi retail kurir, jangan panggil:

```js
EventEmitter.fire("LoyaltyService::sendPointTransaction", ...)
```

pada tahap payment success atau `progressing`.

3. Panggil event loyalty hanya saat transaksi kurir berubah ke `completed`.
4. Tetap pertahankan guard existing di `LoyaltyService.sendPointTransaction`:

```js
if (conf.status && !data.member_point)
```

agar point tidak dobel jika endpoint/scheduler terpanggil lebih dari sekali.

### 3. Endpoint Selesai
Buat atau sesuaikan endpoint marketplace untuk konfirmasi selesai dari customer. Rekomendasi endpoint:

```http
PUT /api/v1/transaction/number/:transaction_number/complete
```

Behavior:
1. Cari transaksi berdasarkan `transaction_number`.
2. Pastikan transaksi adalah `PURCHASE_RETAIL`.
3. Pastikan transaksi memakai kurir.
4. Pastikan status transaksi saat ini masih `progressing` atau status lain yang valid untuk menunggu konfirmasi.
5. Update status transaksi menjadi `completed`.
6. Insert history ke `transaction_status` dengan note, misalnya `Customer confirmed item received`.
7. Trigger `LoyaltyService::sendPointTransaction`.
8. Return data transaksi terbaru.

Endpoint existing `transaction/number/:transaction_number/shipping/receive` boleh dicek dan dipakai ulang hanya jika kontraknya cocok. Jika endpoint itu hanya mengubah status pengiriman, buat endpoint baru agar maknanya jelas: transaksi selesai dan point dikirim.

### 4. Endpoint Complain
Buat endpoint untuk mencatat bahwa customer menekan complain sebelum diarahkan ke WhatsApp. Rekomendasi endpoint:

```http
PUT /api/v1/transaction/number/:transaction_number/complain
```

Behavior:
1. Cari transaksi berdasarkan `transaction_number`.
2. Pastikan transaksi adalah retail kurir.
3. Catat bahwa customer sudah complain.
4. Jangan ubah transaksi menjadi `completed`.
5. Jangan kirim loyalty point.
6. Return informasi toko yang dibutuhkan frontend untuk membuka WhatsApp, atau pastikan data toko sudah tersedia dari detail transaksi.

Kenapa perlu endpoint complain: jika frontend hanya membuka WhatsApp tanpa mencatat ke backend, scheduler 24 jam tidak akan tahu bahwa customer sudah memilih complain.

### 5. Data Untuk Menunggu Konfirmasi Customer
Tambahkan data yang cukup untuk membedakan transaksi yang menunggu konfirmasi, selesai, atau complain. Pilih salah satu pendekatan berikut.

Rekomendasi dengan kolom eksplisit:

```text
transaction.customer_receive_confirmation_status
transaction.customer_receive_confirmation_due_datetime
transaction.customer_receive_confirmed_datetime
transaction.customer_receive_complained_datetime
```

Contoh value status:

```text
waiting
completed
complained
auto_completed
```

Alternatif jika ingin minim migration: simpan di `transaction.transaction_data` sebagai JSON. Namun untuk scheduler 24 jam, kolom eksplisit lebih mudah dan lebih aman untuk query.

### 6. Mulai Timer 24 Jam Dari Webhook GoSend
File yang perlu dicek:

```text
backend-mediacartz/app/Services/DeliveryMethod/GosendWebhookService.js
backend-mediacartz/app/Controllers/Http/TransactionController.js
```

Rencana:
1. Saat webhook GoSend menunjukkan barang sudah `delivered` atau status internal pengiriman setara "sampai", jangan langsung complete transaksi.
2. Set transaksi ke kondisi menunggu konfirmasi customer:

```text
customer_receive_confirmation_status = waiting
customer_receive_confirmation_due_datetime = now + 24 jam
```

3. Pastikan informasi ini ikut dikirim pada endpoint detail transaksi agar frontend tahu kapan tombol `Selesai` dan `Complain` perlu ditampilkan.

### 7. Auto Complete 24 Jam
Buat scheduler/job di `backend-mediacartz` yang berjalan berkala.

Rencana:
1. Cari transaksi retail kurir dengan:
   - status transaksi masih `progressing`
   - `customer_receive_confirmation_status = waiting`
   - `customer_receive_confirmation_due_datetime <= now`
2. Ubah status transaksi menjadi `completed`.
3. Insert history ke `transaction_status` dengan note, misalnya `Auto completed after 24 hours without customer response`.
4. Trigger `LoyaltyService::sendPointTransaction`.
5. Jangan auto-complete transaksi yang sudah `complained`.

## Scope Backend `core.loyalty.system`
File yang perlu dicek:

```text
core.loyalty.system/app/Controllers/Http/TransactionController.js
core.loyalty.system/start/routes.js atau route terkait member transaction
```

Rencana:
1. Tambahkan endpoint member untuk tombol `Selesai`, misalnya:

```http
PUT /api/v1/member/transaction/complete
```

Request body:

```js
{
  transaction_number: "..."
}
```

2. Validasi transaksi milik member login sebelum meneruskan request ke `MARKETPLACE_CORE`.
3. Forward ke endpoint marketplace:

```http
PUT {MARKETPLACE_CORE}transaction/number/:transaction_number/complete
```

4. Tambahkan endpoint member untuk tombol `Complain`, misalnya:

```http
PUT /api/v1/member/transaction/complain
```

5. Validasi transaksi milik member login, lalu forward ke:

```http
PUT {MARKETPLACE_CORE}transaction/number/:transaction_number/complain
```

6. Jangan expose langsung endpoint marketplace ke frontend.
7. Jaga format response frontend tetap konsisten:

```js
{
  status: true,
  message: "...",
  data: ...
}
```

## Scope Frontend `client.loyalty.system`
File utama:

```text
client.loyalty.system/src/pages/TransactionDetail/index.jsx
client.loyalty.system/src/utils/api.js
```

Rencana:
1. Pada halaman detail transaksi, tampilkan tombol `Selesai` dan `Complain`.
2. Tombol tampil hanya jika:
   - transaksi retail kurir
   - transaksi sedang `progressing`
   - webhook/status pengiriman menunjukkan barang sudah sampai atau backend mengirim flag `customer_receive_confirmation_status = waiting`
3. Tombol `Selesai`:
   - panggil endpoint `core.loyalty.system` `member/transaction/complete`
   - jangan panggil endpoint `backend-mediacartz` langsung
   - tampilkan loading saat request berjalan
   - setelah sukses, refresh detail transaksi
   - status menjadi `completed`
4. Tombol `Complain`:
   - panggil endpoint `core.loyalty.system` `member/transaction/complain`
   - jangan panggil endpoint `backend-mediacartz` langsung
   - setelah sukses, arahkan ke WhatsApp toko
   - pesan pertama wajib menyertakan `transaction_number`

Contoh pesan WhatsApp:

```text
Halo, saya ingin komplain pesanan dengan nomor transaksi: {transaction_number}
```

5. Nomor WhatsApp toko bisa diambil dari data store yang sudah ada di detail transaksi. Jika belum ada, tambahkan field store phone pada response detail transaksi dari marketplace sampai frontend.
6. Jangan tampilkan tombol jika transaksi sudah `completed`, `rejected`, atau `failed`.

### Review Produk
Aturan review produk harus mengikuti status selesai transaksi:
1. Review produk hanya boleh dilakukan jika transaksi sudah `completed`.
2. Jangan izinkan review produk saat transaksi masih `verified`, `progressing`, `approved`, `failed`, atau `rejected`.
3. Jika UI saat ini memakai status pengiriman sebagai syarat review, sesuaikan agar status transaksi `completed` menjadi syarat utama.
4. Endpoint backend yang menentukan kelayakan review juga harus memakai aturan yang sama supaya validasi tidak hanya bergantung pada frontend.

## Alur Yang Diharapkan
1. Customer melakukan checkout retail dengan pembayaran MIDTRANS dan pengiriman kurir.
2. Payment MIDTRANS sukses.
3. Backend mencatat status:
   - `verified`
   - `progressing`
4. Point belum dikirim.
5. GoSend melakukan proses pengiriman.
6. Webhook GoSend memberi info barang sudah sampai.
7. Backend mulai timer 24 jam untuk konfirmasi customer.
8. Frontend detail transaksi menampilkan tombol `Selesai` dan `Complain`.
9. Jika customer menekan `Selesai`, transaksi menjadi `completed` dan point dikirim.
10. Jika customer menekan `Complain`, customer diarahkan ke WhatsApp toko dan transaksi tidak auto-complete.
11. Jika customer diam selama 24 jam, scheduler mengubah transaksi menjadi `completed` dan point dikirim.

## Acceptance Criteria
1. Retail courier order dengan payment MIDTRANS sukses tidak langsung menjadi `approved`.
2. Status `verified` dan `progressing` tercatat di table `transaction_status`.
3. Loyalty point tidak dikirim saat transaksi retail kurir baru `verified` atau `progressing`.
4. Tombol `Selesai` dan `Complain` tampil pada detail transaksi yang sudah menunggu konfirmasi barang diterima.
5. Klik `Selesai` mengubah transaksi menjadi `completed`, mencatat history status, dan mengirim point.
6. Klik `Complain` mencatat complain dan membuka WhatsApp toko dengan pesan berisi `transaction_number`.
7. Transaksi yang sudah complain tidak di-auto-complete oleh scheduler.
8. Transaksi yang tidak direspons customer selama 24 jam berubah menjadi `completed`, mencatat history status, dan mengirim point.
9. Guard `member_point` tetap mencegah point dikirim dobel.
10. Flow pickup/non-kurir tidak rusak.
11. Review produk baru tersedia setelah transaksi berstatus `completed`.

## Skenario Test High Level
1. Checkout retail dengan MIDTRANS dan GoSend sampai pembayaran sukses.
2. Pastikan status berubah menjadi `verified` lalu `progressing` dan dua history tercatat.
3. Pastikan point belum dikirim saat status masih `progressing`.
4. Simulasikan webhook GoSend `delivered`, lalu cek tombol `Selesai` dan `Complain` muncul di frontend.
5. Klik `Selesai`, pastikan transaksi menjadi `completed` dan point dikirim satu kali.
6. Klik `Complain`, pastikan WhatsApp toko terbuka dengan pesan berisi `transaction_number` dan transaksi tidak auto-complete.
7. Simulasikan transaksi menunggu lebih dari 24 jam tanpa aksi customer, pastikan scheduler auto-complete dan point dikirim.
8. Test transaksi pickup/non-kurir agar flow existing tetap berjalan.
9. Test transaksi gagal/rejected agar tidak mengirim point.
10. Test retry endpoint/scheduler agar point tidak dobel.
11. Test tombol/fitur review produk hanya muncul dan bisa dipakai saat transaksi `completed`.

## Out of Scope
1. Redesign besar halaman detail transaksi.
2. Perubahan aturan perhitungan point loyalty.
3. Perubahan kontrak API GoSend.
4. Sistem ticketing complain penuh di dalam aplikasi.
5. Perubahan flow voucher loyalty selain memastikan point tidak dobel.

## Definition of Done
1. Flow MIDTRANS + kurir menunda loyalty point sampai transaksi `completed`.
2. Status transaksi dan history `transaction_status` sesuai alur baru.
3. Customer dapat menekan `Selesai` atau `Complain` di detail transaksi.
4. Auto-complete 24 jam berjalan untuk transaksi yang tidak direspons customer.
5. Point loyalty hanya dikirim setelah transaksi retail kurir benar-benar selesai.
