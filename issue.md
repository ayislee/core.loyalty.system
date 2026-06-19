# Issue: Kembalikan Voucher Loyalty Saat Transaksi Gagal

## Informasi Umum

1. `core.loyalty.system` adalah backend loyalty sekaligus proxy ke marketplace.
2. `client.loyalty.system` adalah frontend customer loyalty.
3. `cms.loyalty.system` adalah frontend management loyalty.
4. `backend-mediacartz` adalah backend marketplace dan nilai `MARKETPLACE_CORE` pada environment `core.loyalty.system`.
5. `frontend-mediacartz` atau `frontend-mediacartz-react` adalah frontend marketplace untuk `backend-mediacartz`.
6. Komunikasi `client.loyalty.system` dengan `backend-mediacartz` harus melalui `core.loyalty.system`.

## Latar Belakang

Pada checkout loyalty, customer dapat memakai voucher miliknya melalui `member_voucher_id`. Setelah transaksi retail berhasil dibuat di `backend-mediacartz`, event `LoyaltyService::exchangeVoucher` memanggil endpoint berikut pada `core.loyalty.system`:

```text
POST /api/v1/merchant/member/voucher/exchange
```

Endpoint tersebut mengubah `member_vouchers.used` dari `0` menjadi `1` dan mencatat pemakaian pada `voucher_exchanges`.

Saat transaksi dibatalkan atau gagal, `TransactionService.processReject` saat ini hanya mengembalikan stok dan mengurangi `voucher_usage_quantity` untuk voucher marketplace yang memakai `voucher_id`. Belum ada proses untuk mengembalikan voucher loyalty yang tersimpan pada `transaction.member_voucher_id`. Akibatnya, voucher tetap berstatus sudah digunakan walaupun transaksi tidak berhasil diselesaikan.

## Definisi Bisnis

1. Voucher yang dikembalikan dalam issue ini adalah voucher loyalty milik member yang direferensikan oleh `transaction.member_voucher_id`, bukan master voucher marketplace pada `transaction.voucher_id`.
2. Voucher dikembalikan ketika transaksi retail berakhir pada status terminal `rejected` atau `failed`.
3. Kondisi tersebut mencakup pembatalan manual, MIDTRANS `cancel`, `deny`, atau `expire`, timeout transaksi, dan proses lain yang pada akhirnya menetapkan transaksi ke status terminal tersebut.
4. Status `pending`, `verified`, `progressing`, dan status pengiriman yang masih dapat diproses ulang tidak boleh mengembalikan voucher.
5. Kegagalan atau penolakan kurir saja tidak menjadi pemicu selama transaksi belum ditetapkan sebagai `rejected` atau `failed`.
6. Pengembalian hanya mengaktifkan kembali voucher yang sama. Poin yang sebelumnya digunakan member untuk membeli voucher tidak dikembalikan.
7. Masa berlaku voucher tidak diperpanjang. Voucher yang sudah melewati `expire_date` tetap tidak dapat digunakan walaupun flag `used` sudah dikembalikan ke `0`.

## Tujuan

1. Voucher loyalty dapat digunakan kembali setelah transaksi yang memakainya benar-benar gagal.
2. Pengembalian dipicu oleh backend berdasarkan status transaksi, bukan oleh halaman error pada browser.
3. Exchange dan return aman terhadap callback ganda, retry queue, restart aplikasi, dan urutan event yang terbalik.
4. Riwayat pemakaian dan pengembalian voucher dapat diaudit berdasarkan transaksi marketplace.
5. Transaksi berhasil atau transaksi yang masih berjalan tidak terpengaruh.

## Kondisi Saat Ini

### `backend-mediacartz`

File utama:

```text
app/Controllers/Http/TransactionController.js
app/Services/TransactionService.js
app/Services/LoyaltyService.js
start/events.js
start/bull.js
```

Alur saat ini:

1. `TransactionController` menyimpan `member_voucher_id` dan snapshot `member_voucher_data` pada transaksi retail.
2. Setelah transaksi dibuat, event `LoyaltyService::exchangeVoucher` dikirim tanpa referensi transaksi.
3. Worker exchange selalu menyelesaikan job walaupun service mengembalikan error, sehingga kegagalan komunikasi belum mendapatkan retry yang dapat diandalkan.
4. MIDTRANS `cancel`, `deny`, dan `expire`, penolakan manual, serta timeout memanggil `TransactionService.processReject`.
5. `processReject` belum memanggil loyalty untuk mengembalikan `member_voucher_id`.
6. `processApproval` juga dapat menetapkan status `failed` ketika proses approval gagal, tetapi belum menjalankan pengembalian voucher.

### `core.loyalty.system`

File utama:

```text
app/Controllers/Http/MemberController.js
app/Models/MemberVoucher.js
app/Models/VoucherExchange.js
app/Middleware/AuthMerchant.js
start/routes/merchant.js
database/migrations/*voucher_exchange*
```

Alur saat ini:

1. `MemberController.voucher_exchange` mencari `member_vouchers.used = 0`.
2. Voucher kemudian diubah menjadi `used = 1`.
3. Jika redeem merchant ditemukan, data pemakaian disimpan ke `voucher_exchanges`.
4. Belum ada endpoint untuk membatalkan exchange atau mengembalikan voucher.
5. `voucher_exchanges` belum menyimpan referensi transaksi marketplace dan unique key lama membatasi kombinasi member voucher dan redeem merchant. Struktur ini perlu disesuaikan agar voucher yang telah dikembalikan dapat dipakai lagi pada transaksi baru tanpa menghapus histori lama.

## Scope Implementasi

### 1. Kontrak Lifecycle Voucher

Gunakan referensi transaksi marketplace yang stabil pada setiap operasi exchange dan return. Nilai yang disarankan:

```text
transaction_id
transaction_number
```

Minimal satu nilai wajib tersedia dan harus konsisten pada exchange serta return. `transaction_id` dapat menjadi referensi internal integrasi, sedangkan `transaction_number` disimpan untuk audit dan penelusuran.

Lifecycle yang harus didukung:

```text
available -> exchanged -> returned
```

Voucher dengan lifecycle `returned` dapat kembali menjadi `exchanged` hanya melalui transaksi baru dengan referensi transaksi yang berbeda.

### 2. Perubahan `core.loyalty.system`

#### Endpoint Return

Tambahkan endpoint merchant yang dilindungi `AuthMerchant`, misalnya:

```text
POST /api/v1/merchant/member/voucher/return
```

Payload minimal:

```json
{
  "cid": "merchant-client-id",
  "sid": "merchant-server-id",
  "member_voucher_id": 123,
  "store_id": 10,
  "transaction_id": 456,
  "transaction_number": "transaction-number",
  "reason": "Transaction rejected"
}
```

Nama endpoint dan field dapat mengikuti konvensi project, tetapi kontrak exchange dan return harus memakai referensi transaksi yang sama.

#### Validasi dan Proses Return

1. Validasi `member_voucher_id`, referensi transaksi, partner dari `cid`/`sid`, dan hubungan voucher dengan partner/company yang melakukan request.
2. Cari record exchange berdasarkan `member_voucher_id` dan referensi transaksi, bukan hanya berdasarkan store.
3. Jalankan perubahan `voucher_exchanges` dan `member_vouchers` dalam satu database transaction.
4. Ubah exchange menjadi `returned`, simpan `returned_at`, alasan, dan informasi audit yang diperlukan.
5. Ubah `member_vouchers.used` menjadi `0` hanya jika tidak ada exchange aktif lain untuk voucher tersebut.
6. Jangan mengubah `expire_date`, snapshot discount, jumlah poin, atau kepemilikan voucher.
7. Request return kedua untuk transaksi yang sama harus menghasilkan response sukses idempotent tanpa membuat histori ganda.
8. Request untuk voucher yang tidak dimiliki partner terkait harus ditolak.

#### Penyesuaian Exchange dan Database

1. Tambahkan referensi transaksi dan status lifecycle pada `voucher_exchanges`, beserta timestamp/alasan return yang diperlukan.
2. Sesuaikan unique constraint agar satu transaksi hanya memiliki satu exchange, tetapi voucher yang sudah returned dapat dipakai pada transaksi baru.
3. Jangan menghapus record exchange lama saat voucher dikembalikan karena record tersebut merupakan histori audit.
4. Perbarui endpoint exchange agar menerima referensi transaksi dan idempotent:
   - exchange berulang untuk transaksi yang sama menghasilkan sukses tanpa record ganda;
   - exchange untuk transaksi baru hanya berhasil jika voucher tersedia dan belum kedaluwarsa;
   - exchange wajib memvalidasi partner/company pemilik voucher.
5. Antisipasi return yang diproses lebih dahulu daripada exchange. Simpan return intent untuk referensi transaksi tersebut atau gunakan mekanisme lifecycle setara, sehingga exchange yang datang terlambat tidak mengubah voucher menjadi `used = 1` kembali.
6. Migration harus mempertahankan data `voucher_exchanges` yang sudah ada. Berikan nilai status awal yang sesuai untuk record lama dan jangan menghapus histori produksi.

### 3. Perubahan `backend-mediacartz`

#### Kirim Referensi Saat Exchange

Pada pembuatan transaksi retail:

1. Sertakan `transaction_id` dan `transaction_number` ketika mengirim `LoyaltyService::exchangeVoucher`.
2. Kirim event setelah transaksi lokal berhasil disimpan/commit agar core tidak menerima referensi transaksi yang akhirnya rollback.
3. Pertahankan `member_voucher_id` dan `member_voucher_data` pada transaksi untuk kebutuhan audit dan tampilan detail.

#### Trigger Return Terpusat

Tambahkan satu method terpusat, misalnya `returnLoyaltyVoucher`, yang hanya berjalan apabila:

1. Jenis transaksi adalah `PURCHASE_RETAIL`.
2. `transaction.member_voucher_id` memiliki nilai.
3. Status akhir transaksi adalah `rejected` atau `failed`.

Panggil method tersebut setelah perubahan status lokal berhasil di-commit dari:

1. `TransactionService.processReject` untuk pembatalan manual, kegagalan MIDTRANS, dan timeout.
2. Cabang kegagalan `TransactionService.processApproval` yang menghasilkan status `failed`.
3. Jalur lain yang secara langsung menetapkan transaksi retail ke status terminal tanpa melalui kedua method tersebut, jika ditemukan saat implementasi.

Jangan memanggil return berdasarkan route frontend, redirect MIDTRANS, atau status pengiriman sementara.

#### Service dan Queue

1. Tambahkan method pada `LoyaltyService` untuk memanggil endpoint return di `core.loyalty.system`.
2. Gunakan konfigurasi loyalty company yang sama dengan exchange (`cid`, `sid`, dan `LOYALTYPOINT_API_URL`).
3. Worker harus melempar error ketika HTTP error, timeout, response `status: false`, atau response tidak valid. Jangan menandai job selesai jika return belum diterima core.
4. Atur retry dan backoff pada job exchange dan return agar gangguan sementara atau restart aplikasi tidak menghilangkan proses.
5. Pastikan retry aman karena endpoint core bersifat idempotent.
6. Log minimal harus memuat `transaction_id`, `transaction_number`, dan `member_voucher_id`, tanpa menulis credential `cid` atau `sid`.
7. Hindari decrement atau return berulang jika callback MIDTRANS atau perintah reject diterima lebih dari sekali.

### 4. Perubahan `client.loyalty.system`

Frontend bukan sumber kebenaran pengembalian voucher.

Rencana:

1. Jangan menambahkan request return voucher dari halaman error transaksi.
2. Setelah transaksi gagal dan user kembali membuka daftar voucher atau halaman `/order`, ambil ulang data voucher dari `core.loyalty.system` agar voucher yang sudah returned muncul sebagai tersedia.
3. Jangan mengaktifkan voucher hanya dengan mengubah state lokal.
4. Pertahankan payload `voucher_code` dan flow checkout yang sudah ada, kecuali ada penyesuaian kontrak internal antara core dan marketplace untuk meneruskan referensi transaksi.

### 5. Observability dan Rekonsiliasi

1. Sediakan log yang dapat menelusuri exchange dan return berdasarkan nomor transaksi.
2. Status queue yang gagal harus tetap dapat dilihat dan dijalankan ulang.
3. Pertimbangkan command/job rekonsiliasi untuk mencari transaksi terminal dengan `member_voucher_id` yang exchange-nya belum returned. Command ini menjadi perlindungan untuk data lama atau kegagalan queue berkepanjangan.
4. Rekonsiliasi harus memanggil kontrak return yang sama dan tetap idempotent.

## Batasan dan Di Luar Scope

1. Mengembalikan poin yang dipakai untuk membeli voucher.
2. Memperpanjang tanggal kedaluwarsa voucher.
3. Mengubah aturan diskon, free delivery, SKU, atau company voucher.
4. Mengubah mekanisme voucher marketplace yang memakai `transaction.voucher_id`, kecuali perbaikan idempotensi yang benar-benar diperlukan agar tidak terjadi decrement ganda.
5. Mengembalikan voucher ketika transaksi masih dapat dilanjutkan atau pengiriman masih dapat di-retry.
6. Membuat frontend berkomunikasi langsung dengan `backend-mediacartz`.

## Acceptance Criteria

1. Transaksi retail dengan `member_voucher_id` yang berakhir `rejected` membuat voucher tersebut tersedia kembali.
2. Transaksi retail dengan `member_voucher_id` yang berakhir `failed` membuat voucher tersebut tersedia kembali.
3. MIDTRANS `cancel`, `deny`, dan `expire` menghasilkan pengembalian voucher setelah transaksi menjadi terminal.
4. Pembatalan manual dan timeout transaksi menghasilkan perilaku yang sama.
5. Transaksi `pending`, `verified`, `progressing`, `approved`, atau `completed` tidak mengembalikan voucher.
6. Return tidak mengubah poin member, nilai voucher, snapshot voucher, atau `expire_date`.
7. Voucher kedaluwarsa tidak dapat dipakai walaupun status pemakaiannya telah dikembalikan.
8. Callback/reject/return yang dikirim berulang tidak membuat histori ganda dan tidak menghasilkan perubahan state berulang.
9. Jika return diproses sebelum exchange, exchange yang terlambat tidak membuat voucher kembali berstatus used.
10. Jika core sementara tidak dapat diakses, job gagal tersimpan dan dapat di-retry sampai return berhasil.
11. Histori exchange dan return dapat ditelusuri menggunakan `transaction_id` atau `transaction_number`.
12. Voucher yang sudah returned dapat dipakai pada transaksi baru yang valid.
13. Voucher milik partner/company lain tidak dapat di-return melalui credential merchant yang berbeda.
14. Frontend menampilkan voucher sebagai tersedia setelah mengambil ulang data dari core.

## Skenario Test

Detail implementasi test diserahkan kepada programmer yang mengerjakan. Skenario yang perlu dicakup:

1. Transaksi MIDTRANS memakai voucher lalu menerima status `expire`.
2. Transaksi memakai voucher lalu dibatalkan manual.
3. Transaksi memakai voucher lalu gagal pada proses approval.
4. Transaksi timeout dan diproses oleh penutupan otomatis.
5. Transaksi berhasil sampai selesai dan voucher tetap used.
6. Status pengiriman gagal sementara tetapi transaksi belum terminal, sehingga voucher belum dikembalikan.
7. Return yang sama dipanggil dua kali.
8. Exchange yang sama dipanggil dua kali.
9. Return diproses sebelum job exchange.
10. Core tidak dapat diakses pada percobaan pertama lalu queue berhasil pada retry.
11. Voucher returned yang belum kedaluwarsa digunakan pada transaksi baru.
12. Voucher returned yang sudah kedaluwarsa tetap tidak dapat digunakan.
13. Merchant mencoba mengembalikan voucher milik company lain.
14. Transaksi tanpa `member_voucher_id` tidak memanggil endpoint return.
15. Daftar voucher pada frontend diperbarui setelah transaksi gagal.
