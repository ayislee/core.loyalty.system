# Issue V2 — Manual Delivery Order untuk Transaksi Marketplace

## Ringkasan

Ubah alur transaksi retail marketplace yang menggunakan kurir GoSend agar pembayaran yang berhasil **tidak langsung membuat order kurir**. Setelah pembayaran berhasil, toko harus menerima atau menolak pesanan secara manual. Jika menerima, toko menyiapkan barang terlebih dahulu dan baru menekan **Cari Driver** ketika barang siap dikirim.

Perubahan hanya berlaku untuk transaksi marketplace (`transaction_source_identifier = CORE_LOYALTY`) dan tidak boleh mengubah perilaku transaksi POS/legacy/offline.

Dokumen ini adalah rencana implementasi untuk dikerjakan kemudian oleh programmer junior atau model AI yang lebih murah. Implementasi harus mengikuti aturan transisi, otorisasi, idempotensi, dan kompensasi refund yang dijelaskan di bawah.

## Struktur sistem

1. `core.loyalty.system` — backend loyalty dan proxy marketplace.
2. `client.loyalty.system` — frontend loyalty customer.
3. `cms.loyalty.system` — frontend management loyalty.
4. `backend-mediacartz` — backend marketplace / `MARKETPLACE_CORE`.
5. `frontend-mediacartz-react` — frontend operasional marketplace untuk `backend-mediacartz`.

## Latar belakang

Saat ini transaksi retail online yang berhasil dibayar menjalankan handler pascapembayaran. Untuk transaksi GoSend, handler tersebut dapat langsung memanggil `GosendBookingService.bookDelivery()`. Akibatnya pencarian kurir dimulai sebelum toko mengonfirmasi bahwa pesanan diterima dan barang sudah siap.

Toko membutuhkan tahapan operasional berikut:

1. Pembayaran pelanggan diterima.
2. Toko meninjau lalu menerima atau menolak pesanan.
3. Jika diterima, toko menyiapkan barang.
4. Setelah barang siap, toko memulai pencarian kurir secara manual.
5. Jika pesanan ditolak atau pengiriman gagal pada kondisi yang ditentukan, dana dikembalikan ke wallet pelanggan dan voucher dikembalikan.

## Tujuan

- Memisahkan keberhasilan pembayaran dari penerimaan pesanan oleh toko.
- Menghentikan auto-booking GoSend segera setelah pembayaran berhasil.
- Memberikan aksi **Terima Pesanan**, **Tolak Pesanan**, dan **Cari Driver** kepada toko sesuai status transaksi.
- Menjalankan refund wallet dan pengembalian voucher secara aman dan idempoten saat pesanan berbayar dibatalkan.
- Tetap mengirimkan notifikasi WhatsApp yang relevan kepada pelanggan dan toko.
- Menjamin transaksi POS/legacy/offline tidak mengalami perubahan alur.

## Di luar cakupan

- Mengubah alur transaksi POS, kasir, atau transaksi dengan `transaction_source_identifier = LEGACY`.
- Mengubah cara payment gateway membuat atau menyelesaikan pembayaran.
- Melakukan refund ke payment gateway atau rekening/kartu asal. Refund dalam issue ini masuk ke wallet loyalty pelanggan.
- Mendesain ulang seluruh halaman transaksi.
- Mengubah provider kurir selain GoSend, kecuali diperlukan untuk menjaga kompatibilitas kode bersama.
- Membuat detail unit test per fungsi. Dokumen ini hanya mendefinisikan skenario pengujian utama.

## Terminologi dan keputusan penamaan

Gunakan nama status `preparing_items` secara konsisten. Pada deskripsi awal terdapat variasi `preparing_item`; bentuk singular tersebut jangan digunakan di database, API, maupun frontend.

Status transaksi berbeda dari status pembayaran dan status pengiriman:

- Status transaksi: `transaction.transaction_approve_status`.
- Status pembayaran: record terbaru di `transaction_payment`.
- Status pengiriman: `transaction.ms_shipping_status_id` dan `transaction_shipping_history`.

Jangan menyimpulkan pembayaran berhasil hanya dari status transaksi. Sumber kebenaran pembayaran tetap `transaction_payment` dan hasil callback gateway yang sudah diverifikasi.

## Penambahan status transaksi

Status saat ini berasal dari `backend-mediacartz/app/Helpers/Utility.js`:

| ID | Status |
|---:|---|
| 0 | `pending` |
| 1 | `progressing` |
| 2 | `verified` |
| 3 | `approved` |
| 4 | `rejected` |
| 5 | `failed` |
| 6 | `completed` |

Tambahkan:

| ID | Status |
|---:|---|
| 7 | `payment_received` |
| 8 | `preparing_items` |
| 9 | `courier_process` |

Catatan implementasi:

- `Utility.getApprovalStatus()` dipakai oleh banyak domain selain transaksi. Penambahan nilai boleh dilakukan untuk kompatibilitas, tetapi aturan status 7–9 hanya boleh diterapkan pada transaksi marketplace retail yang memenuhi syarat.
- Pastikan kolom database yang menyimpan kode status menerima nilai 7–9. Kolom saat ini bertipe integer kecil; periksa schema aktual pada environment target sebelum deployment dan buat migration hanya bila diperlukan.
- Tambahkan label/tampilan warna status baru di helper frontend yang memformat status.
- Status lama tetap dipertahankan agar transaksi historis dan transaksi non-marketplace tetap kompatibel.

## Kriteria transaksi yang memakai alur baru

Semua syarat berikut wajib dipenuhi:

1. `transaction_source_identifier === "CORE_LOYALTY"`.
2. Tipe transaksi adalah `PURCHASE_RETAIL`.
3. Metode delivery adalah GoSend/non-pickup sesuai deteksi resmi yang sudah digunakan backend.
4. Pembayaran menggunakan gateway online yang didukung (`MIDTRANS` atau `XENDIT`) atau metode marketplace lain yang memang menghasilkan bukti pembayaran sukses yang terverifikasi.
5. Transaksi dimiliki oleh company/store yang dapat diakses user toko.

Jika salah satu syarat tidak terpenuhi, gunakan alur lama. Jangan memakai kondisi longgar seperti “source bukan LEGACY”, karena source baru di masa depan belum tentu marketplace loyalty.

Transaksi gratis dengan total nol perlu diputuskan secara eksplisit saat implementasi: rekomendasi untuk transaksi marketplace GoSend adalah memperlakukannya sebagai pembayaran terpenuhi dan masuk ke `payment_received`, tetapi tidak membuat refund dana jika kemudian ditolak karena nilai refund nol.

## State machine yang diharapkan

```text
pending
  ├─ pembayaran sukses dan transaksi eligible
  │    └─ payment_received
  │          ├─ toko memilih Terima Pesanan
  │          │    └─ preparing_items
  │          │          └─ toko memilih Cari Driver dan booking berhasil dibuat
  │          │                └─ courier_process
  │          │                      ├─ pengiriman selesai + konfirmasi pelanggan/auto complete
  │          │                      │    └─ completed
  │          │                      └─ status kurir terminal gagal
  │          │                           └─ rejected + refund wallet + voucher return
  │          └─ toko memilih Tolak Pesanan
  │               └─ rejected + refund wallet + voucher return
  └─ pembayaran gagal/expired/canceled sebelum sukses
       └─ rejected (tanpa refund wallet atas dana yang tidak pernah diterima)
```

Aturan transisi:

| Status awal | Aksi/peristiwa | Status tujuan | Efek samping utama |
|---|---|---|---|
| `pending` | Pembayaran terverifikasi sukses | `payment_received` | Notifikasi pembayaran ke pelanggan dan toko; jangan booking GoSend |
| `payment_received` | Toko menerima pesanan | `preparing_items` | Catat actor/waktu/note; notifikasi pelanggan |
| `payment_received` | Toko menolak pesanan | `rejected` | Kembalikan stok, refund wallet, kembalikan voucher, notifikasi pelanggan |
| `preparing_items` | Toko menekan Cari Driver dan booking diterima provider | `courier_process` | Simpan order number dan shipping history; notifikasi pelanggan dan toko |
| `courier_process` | Kurir/pengiriman berjalan | `courier_process` | Update status pengiriman tanpa menurunkan status transaksi |
| `courier_process` | Pesanan diterima pelanggan/auto complete | `completed` | Jalankan penyelesaian dan pemberian point sesuai aturan existing |
| `courier_process` | Ditolak/Pickup gagal/Cancelled | `rejected` | Refund wallet dan voucher return satu kali; notifikasi pelanggan dan toko |

Jangan mengubah transaksi `completed` atau transaksi yang sudah sukses final menjadi `rejected` karena callback terlambat. Semua transisi harus membaca ulang dan mengunci transaksi sebelum update.

## Rancangan backend marketplace (`backend-mediacartz`)

### 1. Pisahkan pembayaran sukses dari booking kurir

Saat callback Midtrans/Xendit menyatakan pembayaran sukses untuk transaksi eligible:

- Tetap simpan dan sinkronkan `transaction_payment` seperti sekarang.
- Ubah status transaksi menjadi `payment_received`.
- Jalankan notifikasi pembayaran ke pelanggan dan toko.
- Jangan memanggil `GosendBookingService.bookDelivery()`.
- Jangan langsung mengubah status menjadi `verified`, `progressing`, atau `approved` untuk alur baru.
- Callback sukses yang duplikat harus menghasilkan respons sukses/idempoten dan tidak mengirim notifikasi berulang.

Refactor `RetailPostPaymentService.handleRetailPaymentSuccess()` agar tugas notifikasi tidak otomatis berarti booking kurir. Pilihan yang disarankan:

- Jadikan handler hanya menangani notifikasi pembayaran; dan
- pindahkan booking ke service/handler khusus aksi **Cari Driver**.

Jika nama method lama dipertahankan, tambahkan opsi eksplisit yang aman; default untuk alur marketplace baru harus tidak melakukan auto-booking. Hindari boolean tersembunyi yang membuat caller lama tidak jelas perilakunya.

### 2. Service workflow order manual

Buat service khusus, misalnya `MarketplaceDeliveryOrderService`, agar validasi dan efek samping tidak tersebar di controller. Minimal sediakan operasi:

- `markPaymentReceived(...)`
- `acceptOrder(...)`
- `rejectOrder(...)`
- `requestCourier(...)`
- `handleCourierTerminalFailure(...)`

Setiap operasi harus:

- Memastikan transaksi memenuhi kriteria marketplace di atas.
- Mengunci row transaksi (`FOR UPDATE`) sebelum mengecek dan mengubah status.
- Memvalidasi status asal dan hanya mengizinkan transisi yang tercantum pada state machine.
- Menulis `transaction_status` pada transaksi database yang sama dengan perubahan `transaction`.
- Menyimpan `user_id`, waktu, dan alasan/note untuk aksi manual.
- Aman saat request dikirim dua kali karena double click, retry HTTP, callback duplikat, atau worker retry.
- Mengembalikan error `409` untuk konflik/transisi status yang sudah tidak valid.

### 3. Endpoint aksi toko

Tambahkan endpoint spesifik agar frontend tidak dapat mengirim status tujuan arbitrer:

```http
PUT /transaction/:transaction_id/marketplace-order/accept
PUT /transaction/:transaction_id/marketplace-order/reject
POST /transaction/:transaction_id/marketplace-order/courier
```

Payload yang disarankan:

```json
{
  "note": "opsional untuk accept/courier, wajib atau diberi default audit untuk reject",
  "idempotency_key": "UUID atau key unik per aksi"
}
```

Respons harus mengembalikan transaksi terbaru dan capability/action terbaru, sehingga frontend dapat langsung refresh tanpa reload halaman.

Semua endpoint harus memakai middleware yang sudah ada untuk:

- autentikasi;
- pembatasan company/store;
- transaksi retail;
- permission user;
- validasi payload.

Tambahkan permission granular bila permission yang ada hanya mengizinkan melihat transaksi. Permission yang disarankan:

- `transaction_marketplace_order_accept`
- `transaction_marketplace_order_reject`
- `transaction_marketplace_courier_request`

Jika sistem permission mengharuskan satu permission untuk semua aksi, dokumentasikan keputusan tersebut dan tetap validasi aksi di backend.

### 4. Capability pada respons list/detail

Backend harus menjadi sumber keputusan aksi. Tambahkan objek seperti:

```json
{
  "marketplace_order_actions": {
    "eligible": true,
    "can_accept": true,
    "can_reject": true,
    "can_request_courier": false,
    "can_retry_courier": false,
    "reason": null
  }
}
```

Hitung capability berdasarkan source, tipe transaksi, delivery, status transaksi, status pembayaran, status attempt GoSend terakhir, akses company/store, serta permission. `can_retry_courier` hanya boleh `true` ketika attempt terakhir sudah dipastikan terminal `NO_DRIVER`. Frontend hanya merender capability; backend tetap mengulang semua validasi ketika endpoint dipanggil.

Untuk transaksi POS/offline, `eligible` harus `false` dan semua aksi harus `false`.

### 5. Aksi Terima Pesanan

Endpoint accept hanya menerima transaksi dengan status `payment_received`.

Di dalam transaksi database:

1. Kunci dan baca ulang transaksi.
2. Pastikan payment attempt sukses masih tersedia.
3. Ubah status menjadi `preparing_items` melalui helper status transaction yang sudah ada.
4. Catat user toko, timestamp, dan note.
5. Commit.

Setelah commit, kirim WhatsApp ke pelanggan bahwa pesanan diterima dan sedang disiapkan. Kegagalan notifikasi tidak boleh membatalkan perubahan status; catat kegagalan dan sediakan retry/idempotency marker.

### 6. Aksi Tolak Pesanan

Endpoint reject hanya menerima transaksi dengan status `payment_received`. Penolakan setelah toko menerima pesanan tidak termasuk scope awal kecuali bisnis mengonfirmasi kebutuhan tersebut.

Proses yang wajib dilakukan:

1. Kunci transaksi dan pastikan belum pernah direject/refund.
2. Ubah status menjadi `rejected`.
3. Kembalikan stok retail dengan mekanisme existing `TransactionService.processReject()` atau refactor yang memakai logika yang sama.
4. Kurangi kembali usage voucher lokal jika applicable tanpa membuat nilai negatif.
5. Minta `core.loyalty.system` mengembalikan dana ke wallet pelanggan.
6. Minta lifecycle voucher loyalty mengembalikan `member_voucher_id` bila digunakan.
7. Catat status kompensasi/refund dan identifier idempotensi.
8. Kirim WhatsApp kepada pelanggan bahwa pesanan ditolak dan dana dikembalikan ke wallet. Jika kompensasi masih diproses, pesan harus menyatakan sedang diproses, bukan mengklaim selesai.

Jangan hanya memanggil `processReject()` lalu menganggap refund wallet selesai. Saat ini `processReject()` sudah menangani stok dan pengembalian voucher tertentu, tetapi refund wallet lintas sistem perlu kontrak eksplisit serta rekonsiliasi.

### 7. Aksi Cari Driver

Endpoint courier hanya menerima transaksi dengan status `preparing_items` dan delivery GoSend.

Proses:

1. Kunci transaksi dan reservasi aksi booking agar dua request tidak membuat dua order GoSend.
2. Panggil `GosendBookingService.bookDelivery()` menggunakan detail shipping yang tersimpan pada transaksi.
3. Jika provider menerima booking dan order number tersimpan, ubah status transaksi menjadi `courier_process` dan tulis history.
4. Booking awal hanya dilakukan setelah toko menekan **Cari Driver**. Sistem tidak boleh menjalankan auto-retry ketika booking gagal atau menghasilkan `NO_DRIVER`.
5. Jika provider mengembalikan `NO_DRIVER`, pertahankan transaksi pada `courier_process` dan tampilkan aksi **Cari Driver Ulang** kepada toko. Retry hanya boleh dipicu manual oleh user yang berwenang.
6. Setiap manual retry harus memakai lock dan idempotency key per attempt agar double click tidak membuat dua order. Pastikan attempt/order sebelumnya sudah terminal `NO_DRIVER` sebelum membuat order baru.
7. Jika hasil provider ambigu/timeout, jangan langsung melakukan retry. Rekonsiliasi terlebih dahulu terhadap provider. Jika order ternyata terbentuk, simpan referensinya; jika dipastikan tidak terbentuk, barulah backend boleh mengaktifkan aksi manual retry.
8. Kirim notifikasi WhatsApp ke pelanggan dan toko setelah booking berhasil.

Gunakan lock/idempotency yang sudah ada di `GosendBookingService`; jangan menggantinya dengan pengecekan frontend.

### 8. Kegagalan kurir dan kompensasi

Perluas pemrosesan webhook GoSend. Status provider/mapping yang termasuk kompensasi minimal:

- `Ditolak` / shipping status rejected.
- `Pickup gagal` sesuai status provider resmi yang dipetakan backend.
- `Cancelled`.

Hapus mekanisme **auto-retry** order GoSend. Status `NO_DRIVER` bukan kegagalan terminal dan tidak langsung memicu refund. Toko dapat menjalankan **manual retry** melalui aksi **Cari Driver Ulang** setelah backend memastikan attempt sebelumnya sudah berakhir dengan `NO_DRIVER`.

Status `Ditolak`, `Pickup gagal`, dan `Cancelled` tetap dianggap terminal dan langsung menjalankan alur `rejected`, refund wallet, serta voucher return. Manual retry tidak boleh tersedia untuk ketiga status terminal tersebut.

Saat status terminal gagal diterima:

1. Abaikan callback duplikat secara idempoten.
2. Jangan mereject/refund transaksi yang sudah `completed`.
3. Ubah transaksi `courier_process` menjadi `rejected`.
4. Kembalikan stok hanya jika aturan stok menyatakan barang kembali tersedia. Untuk pickup gagal setelah barang keluar dari toko, keputusan stok harus dikonfirmasi; jangan otomatis menambah stok bila barang tidak berada di toko.
5. Jalankan refund wallet dan voucher return satu kali.
6. Kirim notifikasi pelanggan dan toko.

Karena refund melintasi dua database/service, gunakan pola state/outbox atau record kompensasi yang dapat di-retry. Jangan mengandalkan satu transaksi database lintas aplikasi.

### 9. Audit dan idempotensi kompensasi

Buat penyimpanan audit bila field JSON yang ada tidak cukup. Rekomendasi membuat tabel khusus, misalnya `transaction_compensation`, dengan field minimal:

- `transaction_compensation_id`
- `transaction_id`
- `type` (`WALLET_REFUND`, `LOYALTY_VOUCHER_RETURN`, `LOCAL_VOUCHER_RETURN`, `STOCK_RETURN`)
- `idempotency_key` (unique)
- `status` (`PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`)
- `amount`
- `external_reference`
- `request_payload` yang sudah disanitasi
- `response_payload` yang sudah disanitasi
- `attempt_count`
- `last_error`
- created/updated/completed datetime

Jangan simpan secret, token gateway, atau data sensitif pembayaran dalam audit.

Refund dan voucher return tidak boleh terjadi dua kali walaupun:

- endpoint reject diklik berulang;
- webhook GoSend dikirim berulang;
- worker retry;
- request ke core timeout setelah core sebenarnya berhasil;
- operator membuka ulang halaman dan mencoba aksi lagi.

## Rancangan backend loyalty/proxy (`core.loyalty.system`)

`core.loyalty.system` diperlukan untuk refund wallet dan lifecycle voucher milik pelanggan.

### 1. Endpoint internal kompensasi marketplace

Sediakan endpoint internal yang ditandatangani, atau perluas endpoint internal yang sudah ada, misalnya:

```http
POST /api/v1/internal/marketplace/transactions/:transaction_id/refund-wallet
POST /api/v1/internal/marketplace/transactions/:transaction_id/return-voucher
```

Endpoint hanya boleh dipanggil oleh `backend-mediacartz` menggunakan signature/timestamp yang konsisten dengan integrasi internal marketplace saat ini. Jangan mengekspos endpoint ini sebagai endpoint pelanggan.

Refund wallet harus:

- Memverifikasi transaksi marketplace dan kepemilikan member.
- Memverifikasi jumlah refund terhadap snapshot transaksi, bukan mempercayai amount dari caller secara buta.
- Menggunakan idempotency key stabil, misalnya `marketplace-order-refund:{transaction_id}`.
- Menolak total refund yang melebihi dana yang pernah dibayar/ditangkap.
- Membuat ledger wallet bertipe refund dengan referensi transaksi marketplace.
- Mengembalikan hasil yang sama ketika idempotency key diulang.

Jika checkout wallet menggunakan hold yang belum di-capture, lakukan `releaseHold`; jika sudah di-capture, lakukan credit/refund ledger. Jangan membuat credit baru tanpa memeriksa lifecycle hold/payment.

Voucher return harus menggunakan `MemberVoucherLifecycleService.returnVoucher()` yang sudah ada dan idempoten. Gunakan `transaction_id`/`member_voucher_id` sebagai referensi lifecycle.

### 2. Hubungan dengan modul refund yang sudah ada

`core.loyalty.system` sudah mempunyai `RefundService` dan alur refund operasional. Implementer harus mengevaluasi apakah alur itu dapat dipakai langsung untuk refund otomatis ini.

- Jika `RefundService` memerlukan approval manual, jangan mem-bypass aturan tersebut diam-diam. Buat mode/system actor khusus yang jelas atau endpoint kompensasi terpisah.
- Bila refund otomatis memang keputusan produk pada issue ini, status refund harus dapat dilihat dan direkonsiliasi oleh operator.
- Gunakan tabel/ledger yang sama agar tidak ada dua sumber saldo.

### 3. Rekonsiliasi

Tambahkan job atau mekanisme retry untuk refund/voucher return berstatus `PENDING` atau `FAILED`. Backend marketplace harus dapat mengetahui `pending`, `success`, atau `failed` dan tidak mengirim pesan “dana telah dikembalikan” sebelum core mengonfirmasi sukses.

## Rancangan frontend marketplace (`frontend-mediacartz-react`)

Halaman target: `/dashboard/retail/transaksi`.

### 1. Menu aksi per baris

Bangun `data_more` per transaksi, bukan array statis global.

- Selalu tampilkan **Lihat Detail** sesuai akses saat ini.
- Tampilkan **Terima Pesanan** dan **Tolak Pesanan** hanya bila backend memberi `can_accept`/`can_reject`.
- Tampilkan **Cari Driver** hanya bila backend memberi `can_request_courier`.
- Jangan menentukan eligibility hanya dari nama status di frontend.
- Disable aksi pada row yang sedang diproses untuk mencegah double click.

### 2. Terima Pesanan

- Tampilkan popup konfirmasi bahwa toko menerima pesanan dan akan menyiapkan barang.
- Setelah user klik OK, panggil endpoint accept.
- Saat sukses, tutup loading, tampilkan feedback, lalu panggil `getData()` tanpa reload browser.
- Jika modal detail sedang terbuka, refresh detail juga.
- Bila backend mengembalikan `409`, tampilkan bahwa transaksi sudah berubah dan refresh data.

### 3. Tolak Pesanan

- Tampilkan popup peringatan bahwa pesanan akan ditolak, stok/benefit dikompensasi, dana dikembalikan ke wallet, dan tindakan tidak dapat dibatalkan.
- Minta alasan penolakan agar audit dan notifikasi lebih jelas.
- Setelah konfirmasi, panggil endpoint reject satu kali dengan idempotency key.
- Tampilkan status kompensasi dari backend. Jangan menampilkan refund selesai jika backend masih `PENDING`.
- Refresh tabel dan detail tanpa reload page.

### 4. Cari Driver

- Tampilkan popup bahwa barang harus sudah siap sebelum pencarian driver dimulai.
- Panggil endpoint courier baru.
- Setelah sukses, refresh data dan tampilkan order number/status pengiriman.
- Jika request timeout atau hasil ambigu, jangan langsung mengaktifkan tombol ulang; refresh detail terlebih dahulu untuk melihat apakah booking sudah terbentuk.

### 5. Detail transaksi dan label status

- Tampilkan status `payment_received`, `preparing_items`, dan `courier_process` dengan label Indonesia yang jelas.
- Tampilkan timeline transaction status agar operator mengetahui siapa dan kapan pesanan diterima/ditolak/dipesankan ke kurir.
- Perbarui teks pada fitur update payment manual: status `SUCCESS` untuk transaksi GoSend marketplace hanya menuju `payment_received`, bukan langsung memesan kurir.
- Aksi awal **Cari Driver** hanya muncul pada status `preparing_items`.
- Aksi **Cari Driver Ulang** hanya muncul ketika backend memberi capability manual retry karena attempt sebelumnya berakhir `NO_DRIVER`.
- Jangan menjalankan retry berdasarkan timer atau otomatis setelah halaman di-refresh. User toko harus mengonfirmasi setiap manual retry.

## `client.loyalty.system`

Perubahan tidak wajib untuk menyelesaikan aksi toko. Namun perubahan diperlukan bila halaman riwayat/detail pesanan pelanggan menampilkan status mentah dari marketplace.

Jika diperlukan:

- Tambahkan label untuk `payment_received`, `preparing_items`, dan `courier_process`.
- Refresh/poll detail pesanan agar status baru terlihat tanpa checkout ulang.
- Tampilkan pesan yang ramah pelanggan, misalnya “Pembayaran diterima”, “Pesanan sedang disiapkan”, dan “Kurir sedang diproses”.
- Jangan memberi tombol operasional toko pada aplikasi pelanggan.

## `cms.loyalty.system`

Tidak ada perubahan wajib dalam scope ini. Bila CMS memiliki laporan/filter status transaksi marketplace, tambahkan label/filter status baru agar laporan tidak menampilkan status kosong atau “unknown”.

## Notifikasi WhatsApp

Notifikasi harus dipisah berdasarkan event dan memiliki idempotency marker masing-masing, bukan satu marker umum:

| Event | Penerima | Inti pesan |
|---|---|---|
| Payment received | Pelanggan | Pembayaran diterima; menunggu konfirmasi toko |
| Payment received | Toko | Ada pesanan telah dibayar dan perlu diterima/ditolak |
| Order accepted | Pelanggan | Pesanan diterima toko dan sedang disiapkan |
| Courier requested | Pelanggan | Barang siap dan kurir sedang dicari/diproses |
| Courier requested | Toko/internal | Booking GoSend dibuat beserta referensi |
| Order rejected | Pelanggan | Pesanan ditolak; status refund wallet disebutkan secara akurat |
| Courier terminal failure | Pelanggan dan toko | Pengiriman gagal/dibatalkan; status refund disebutkan secara akurat |

Kegagalan WhatsApp tidak boleh rollback transaksi, booking, atau refund. Simpan hasil kirim dan retry melalui mekanisme queue yang sudah ada.

## Isolasi transaksi POS

Ini adalah acceptance criterion utama:

- Semua service baru wajib memiliki guard `transaction_source_identifier === CORE_LOYALTY` dan tipe `PURCHASE_RETAIL`.
- Endpoint baru menolak transaksi POS/legacy dengan `403` atau `422` sesuai konvensi aplikasi.
- Callback pembayaran POS tetap mengikuti alur lama.
- Auto-approval/fulfillment transaksi kasir tidak berubah.
- Jangan menentukan marketplace berdasarkan gateway saja karena POS juga dapat memakai metode pembayaran yang sama.
- Jangan menambahkan tombol aksi manual delivery pada transaksi tanpa capability dari backend.

## Kompatibilitas laporan dan query

Audit semua query yang saat ini menganggap transaksi berhasil hanya memiliki status `approved` atau `completed`.

- `payment_received`, `preparing_items`, dan `courier_process` adalah transaksi yang sudah dibayar tetapi belum selesai.
- Tentukan apakah omzet/report mengakui pendapatan saat pembayaran diterima atau saat completed; jangan memasukkan status baru secara otomatis tanpa keputusan bisnis.
- Stock reservation tetap aktif sampai completed atau rejected.
- Loyalty point untuk transaksi kurir tetap ditunda sampai completion seperti perilaku existing.
- Filter list status harus menampilkan status baru.
- Job `closingUnfinishedTransaction()` jangan otomatis menolak `payment_received`, `preparing_items`, atau `courier_process` dengan timeout lama untuk transaksi pending. Jika diperlukan SLA toko, buat timeout dan kebijakan terpisah.

## File yang diperkirakan dimodifikasi atau dibuat

Daftar ini merupakan panduan awal. Implementer tetap harus menelusuri caller sebelum mengubah method bersama.

### `backend-mediacartz`

| File | Aksi | Tujuan |
|---|---|---|
| `app/Helpers/Utility.js` | Modifikasi | Tambah status ID 7–9 |
| `app/Services/TransactionService.js` | Modifikasi/refactor | Transisi status, reject, stock/voucher compensation, dan completion |
| `app/Services/TransactionPaymentService.js` | Modifikasi | Payment manual `SUCCESS` menuju `payment_received` untuk marketplace GoSend |
| `app/Services/Notification/RetailPostPaymentService.js` | Modifikasi/refactor | Pisahkan notifikasi pembayaran dari auto-booking GoSend |
| `app/Services/DeliveryMethod/GosendBookingService.js` | Modifikasi terbatas | Validasi initial manual booking dan idempotensi |
| `app/Services/DeliveryMethod/GosendWebhookService.js` | Modifikasi | Tangani terminal failure dan trigger kompensasi idempoten |
| `app/Controllers/Http/TransactionController.js` | Modifikasi | Capability list/detail serta endpoint accept/reject/courier |
| `app/Controllers/Http/PaymentGatewayWebhookController.js` | Modifikasi | Xendit sukses menuju `payment_received` |
| `app/Services/MarketplaceDeliveryOrderService.js` | Buat | State machine dan orkestrasi aksi toko |
| `app/Services/MarketplaceCompensationService.js` | Buat | Refund wallet, voucher return, retry kompensasi, dan audit |
| `app/Validators/MarketplaceOrderAccept.js` | Buat | Validasi accept |
| `app/Validators/MarketplaceOrderReject.js` | Buat | Validasi reject/reason/idempotency |
| `app/Validators/MarketplaceCourierRequest.js` | Buat | Validasi courier request/idempotency |
| `app/Models/TransactionCompensation.js` | Buat jika tabel audit dipakai | Model kompensasi |
| `database/migrations/*transaction_compensation*_schema.js` | Buat jika tabel audit dipakai | Audit/idempotensi kompensasi |
| `start/routes/client.js` | Modifikasi | Daftarkan endpoint baru dan middleware |
| `config/userPermission.js` | Modifikasi | Permission endpoint baru |
| `config/adminPermission.js` | Modifikasi bila admin memakai endpoint yang sama | Permission admin |
| `start/events.js` dan `start/bull.js` | Modifikasi bila memakai queue baru | Retry refund/notifikasi/kompensasi |

Periksa juga helper/report yang membandingkan ID status secara hard-coded, khususnya `ReportService`, `ProductBestSellerService`, middleware transaksi, dan statistik.

### `frontend-mediacartz-react`

| File | Aksi | Tujuan |
|---|---|---|
| `src/dashboard/pages/Retail/Transaksi.js` | Modifikasi | Menu aksi dinamis, accept/reject/courier, refresh tanpa reload |
| `src/dashboard/pages/Retail/modal/modal.detailTransaksi.js` | Modifikasi | Capability, timeline/status baru, dan sinkronisasi aksi |
| `src/service/api/transaksi/index.js` atau service API transaksi aktual | Modifikasi | Wrapper endpoint baru |
| Helper status/display yang digunakan aplikasi | Modifikasi | Label dan warna status baru |
| Komponen modal aksi terpisah | Buat opsional | Pisahkan konfirmasi/reason bila file utama terlalu besar |

### `core.loyalty.system`

| File | Aksi | Tujuan |
|---|---|---|
| `app/Services/RefundService.js` | Modifikasi/refactor bila reusable | Refund otomatis dengan system actor/idempotency |
| `app/Services/WalletService.js` | Modifikasi bila belum ada operasi yang tepat | Release hold atau credit refund ledger |
| `app/Services/MemberVoucherLifecycleService.js` | Modifikasi terbatas bila diperlukan | Pastikan return voucher marketplace idempoten |
| `app/Controllers/Http/WalletSettlementController.js` | Modifikasi atau referensi pola | Signature internal dan lifecycle hold |
| `app/Controllers/Http/MarketplaceCompensationController.js` | Buat | Endpoint internal refund/voucher return |
| `app/Validators/MarketplaceCompensation.js` | Buat | Validasi payload internal |
| `start/routes.js` atau file route aktual | Modifikasi | Route internal bertanda tangan |
| Model/migration refund atau idempotency | Modifikasi/buat bila data existing belum cukup | Audit dan deduplikasi refund |

### `client.loyalty.system` — bila diperlukan

| Area | Aksi | Tujuan |
|---|---|---|
| Halaman daftar/detail transaksi marketplace | Modifikasi | Label status dan refresh status baru |
| Helper pemetaan status | Modifikasi | Pesan ramah pelanggan |

### `cms.loyalty.system` — bila diperlukan

| Area | Aksi | Tujuan |
|---|---|---|
| Filter/report transaksi marketplace | Modifikasi | Mengenali status ID 7–9 |

## Urutan implementasi yang disarankan

1. Tambahkan status dan state machine backend beserta guard marketplace/POS.
2. Pisahkan notifikasi pembayaran dari auto-booking GoSend.
3. Implementasikan endpoint internal refund wallet/voucher pada core beserta idempotensi.
4. Implementasikan service kompensasi dan endpoint accept/reject/courier pada backend marketplace.
5. Implementasikan terminal failure GoSend, hapus auto-retry, pertahankan manual retry khusus `NO_DRIVER`, dan tambahkan rekonsiliasi hasil ambigu.
6. Tambahkan capability pada API list/detail.
7. Implementasikan menu aksi frontend dan refresh tanpa reload.
8. Perbarui label/status pada frontend customer/CMS bila diperlukan.
9. Audit report, timeout job, permission, dan observability.
10. Jalankan skenario pengujian dan rollout bertahap.

## Skenario pengujian utama

Tidak perlu membuat instruksi unit test yang terlalu rinci. Minimal pastikan skenario berikut tercakup:

### Pembayaran dan penerimaan toko

- Midtrans sukses mengubah marketplace GoSend dari `pending` ke `payment_received`, mengirim notifikasi, dan tidak membuat booking GoSend.
- Xendit sukses menghasilkan perilaku yang sama.
- Callback pembayaran sukses duplikat tidak mengirim notifikasi atau mengubah status berulang.
- Payment manual menjadi `SUCCESS` menghasilkan `payment_received`, bukan auto-booking.
- Toko menerima pesanan: `payment_received → preparing_items`, WhatsApp pelanggan terkirim, daftar refresh tanpa reload.
- Toko menolak pesanan: `payment_received → rejected`, stok dan voucher dikembalikan, refund wallet hanya satu kali.

### Booking dan pengiriman

- Tombol Cari Driver hanya tersedia pada `preparing_items`.
- Booking sukses mengubah status ke `courier_process` dan menyimpan order number/history.
- Double click/dua request paralel hanya membuat satu booking.
- `NO_DRIVER` tidak memicu auto-retry dan tidak langsung memicu refund.
- Setelah `NO_DRIVER`, toko dapat menekan **Cari Driver Ulang** untuk membuat attempt baru secara manual.
- Double click pada manual retry hanya membuat satu attempt/order baru.
- Timeout ambigu direkonsiliasi sebelum tombol manual retry diaktifkan.
- Delivery selesai mengikuti alur konfirmasi pelanggan/auto-complete hingga `completed`.

### Kegagalan dan refund

- GoSend rejected, pickup failed, dan cancelled memicu `rejected` serta refund/voucher return satu kali.
- GoSend `NO_DRIVER` mempertahankan transaksi untuk manual retry dan tidak memicu refund.
- Webhook kegagalan duplikat tidak menggandakan saldo atau voucher.
- Callback gagal yang terlambat tidak menurunkan transaksi `completed`.
- Kegagalan komunikasi ke core menghasilkan kompensasi pending/failed yang dapat di-retry.
- Pesan pelanggan membedakan refund selesai dan refund masih diproses.

### Isolasi dan keamanan

- Transaksi POS/legacy tetap menggunakan alur lama dan endpoint baru menolaknya.
- User dari company/store lain tidak dapat menerima, menolak, atau memesan kurir.
- User tanpa permission tidak melihat aksi dan tetap ditolak backend bila memanggil endpoint langsung.
- Payload status arbitrer tidak dapat digunakan untuk melompati state machine.
- Transaksi gratis tidak menghasilkan credit wallet palsu saat ditolak.

### Kompatibilitas

- List, detail, filter, report, dan formatter tidak error ketika menerima status ID 7–9.
- Transaksi historis berstatus lama tetap terbaca.
- Job timeout tidak membatalkan pesanan yang telah dibayar atau sedang dikirim.
- Auto-retry GoSend tidak tersedia; retry GoSend hanya dapat dijalankan secara manual setelah status `NO_DRIVER`.

## Acceptance criteria

- Pembayaran sukses pada transaksi marketplace GoSend menghasilkan `payment_received`, bukan booking GoSend otomatis.
- Toko dapat menerima atau menolak transaksi `payment_received` dari halaman transaksi.
- Pesanan yang diterima berubah menjadi `preparing_items`.
- Hanya toko yang telah menyiapkan barang dapat memulai **Cari Driver**.
- Booking berhasil mengubah status menjadi `courier_process`.
- Penolakan toko dan terminal failure kurir yang disepakati menghasilkan `rejected`, refund wallet, serta voucher return secara idempoten.
- Notifikasi WhatsApp tetap dikirim sesuai event tanpa menggagalkan transaksi utama saat kanal notifikasi bermasalah.
- UI memperbarui data tanpa full page reload.
- Tidak ada perubahan perilaku pada transaksi POS/legacy/offline.
- Semua perubahan status dan kompensasi memiliki audit trail yang dapat direkonsiliasi.

## Risiko dan hal yang perlu dikonfirmasi sebelum coding

1. Definisi resmi provider untuk “Pickup gagal” dan mapping `ms_shipping_status_id` yang harus dianggap terminal.
2. Apakah manual retry `NO_DRIVER` diberi batas attempt atau tetap tersedia sampai toko membatalkan melalui prosedur operasional.
3. Apakah penolakan diperbolehkan setelah status `preparing_items`.
4. Apakah stok harus dikembalikan pada pickup gagal setelah barang sempat keluar dari toko.
5. Apakah refund wallet otomatis boleh memakai `RefundService` existing tanpa approval manual.
6. Nilai refund: total pembayaran penuh termasuk ongkir, atau ada komponen yang tidak dikembalikan. Default requirement ini mengarah ke dana yang dibayar pelanggan, tetapi rumus final harus disetujui produk/finance.
7. Kapan loyalty point diberikan. Rekomendasi: tetap setelah transaksi selesai agar tidak perlu reversal saat delivery gagal.
8. Perlakuan transaksi marketplace GoSend bernilai nol.

Keputusan untuk poin-poin tersebut harus dicatat di issue/PR sebelum implementasi final agar programmer tidak membuat asumsi finansial sendiri.
