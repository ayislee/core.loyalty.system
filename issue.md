# Issue: Pencatatan Laporan Penjualan Harian dan Balance Company/Toko

## Informasi Umum
1. `core.loyalty.system` adalah backend loyalty / proxy.
2. `client.loyalty.system` adalah frontend loyalty customer.
3. `cms.loyalty.system` adalah frontend management loyalty.
4. `backend-mediacartz` adalah backend marketplace / `MARKETPLACE_CORE`.
5. `frontend-mediacartz` adalah frontend marketplace untuk `backend-mediacartz`.

## Latar Belakang
Marketplace di `client.loyalty.system` pada dasarnya adalah penjualan toko/company di platform loyalty.

Pembayaran dari customer masuk dan ditampung dahulu oleh platform loyalty. Setelah itu, toko/company akan memiliki tagihan atau saldo klaim ke platform loyalty berdasarkan transaksi yang terjadi.

Saat ini `core.loyalty.system` sudah menyimpan snapshot transaksi pada tabel `transactions`, tetapi datanya masih berupa `request` dan `response` mentah dari `MARKETPLACE_CORE`. Data ini belum cukup rapi untuk kebutuhan:
1. laporan penjualan harian per company/platform,
2. balance tiap company/toko,
3. rekonsiliasi transaksi yang sudah dibayar, selesai, gagal, refund, atau perlu ditagihkan.

## Tujuan
1. Setiap transaksi marketplace yang dibuat lewat `client.loyalty.system` tercatat sebagai data finansial di `core.loyalty.system`.
2. Tersedia laporan penjualan harian per company dan/atau toko.
3. Tersedia balance/saldo tiap company dan toko yang menggambarkan kewajiban platform loyalty kepada company/toko.
4. Pencatatan bersifat idempotent, sehingga transaksi yang sama tidak boleh tercatat dua kali.
5. Data laporan tetap mengikuti arsitektur komunikasi:

```text
client.loyalty.system -> core.loyalty.system -> backend-mediacartz
```

Frontend tidak boleh langsung mengambil laporan finansial dari `backend-mediacartz`.

## Definisi Bisnis Awal
1. `core.loyalty.system` menjadi sumber pencatatan settlement untuk transaksi yang berasal dari platform loyalty.
2. `backend-mediacartz` tetap menjadi sumber data transaksi marketplace, produk, toko, ongkir, dan status transaksi.
3. `company balance` adalah saldo yang nanti dapat ditagihkan/dicairkan oleh company/toko kepada platform loyalty.
4. Transaksi baru boleh menambah saldo payable jika sudah memenuhi status bisnis yang disepakati.
5. Rekomendasi awal:
   - transaksi dibuat: catat sebagai `pending`;
   - pembayaran berhasil: catat sebagai `paid` atau `verified`;
   - barang diterima/transaksi `complete`: saldo masuk ke `available`;
   - transaksi gagal/refund/cancel: saldo dibatalkan atau dikoreksi.

Status final perlu mengikuti status dari `backend-mediacartz`, tetapi struktur ledger di loyalty harus siap untuk koreksi status.

## Scope Backend `core.loyalty.system`

File referensi:

```text
core.loyalty.system/app/Controllers/Http/TransactionController.js
core.loyalty.system/app/Models/Transaction.js
core.loyalty.system/app/Controllers/Http/DashboardController.js
core.loyalty.system/start/routes/member.js
core.loyalty.system/start/routes/*.js
core.loyalty.system/database/migrations
```

### 1. Tambahkan Tabel Pencatatan Transaksi Finansial

Buat tabel baru untuk menyimpan transaksi finansial yang sudah dinormalisasi dari response marketplace.

Contoh nama tabel:

```text
marketplace_sales
```

Field yang disarankan:
1. `marketplace_sale_id`
2. `transaction_number`
3. `marketplace_transaction_id`
4. `member_id`
5. `company_slug`
6. `company_id` jika tersedia dari marketplace
7. `store_id`
8. `store_slug`
9. `store_name`
10. `transaction_date`
11. `transaction_status`
12. `payment_status`
13. `shipping_status`
14. `gross_amount`
15. `discount_amount`
16. `voucher_amount`
17. `shipping_fee`
18. `administration_fee`
19. `net_sales_amount`
20. `payable_amount`
21. `platform_fee`
22. `settlement_status`
23. `source_request`
24. `source_response`
25. `created_at`
26. `updated_at`

Catatan:
1. `transaction_number` harus unique.
2. Simpan `source_response` untuk audit, tetapi laporan jangan bergantung pada parsing JSON mentah setiap kali.
3. `payable_amount` adalah nilai yang masuk ke balance company/toko. Formula awal bisa dibuat eksplisit di service agar mudah diubah.

### 2. Tambahkan Ledger Balance

Jangan hanya menyimpan saldo akhir tanpa history. Buat ledger mutasi balance agar setiap perubahan bisa diaudit.

Contoh tabel:

```text
company_store_balance_mutations
```

Field yang disarankan:
1. `balance_mutation_id`
2. `company_slug`
3. `company_id`
4. `store_id`
5. `store_slug`
6. `transaction_number`
7. `mutation_type`
8. `mutation_status`
9. `amount`
10. `balance_before`
11. `balance_after`
12. `description`
13. `reference_type`
14. `reference_id`
15. `created_at`
16. `updated_at`

Contoh `mutation_type`:
1. `sale_pending`
2. `sale_available`
3. `sale_cancelled`
4. `refund`
5. `settlement_paid`
6. `manual_adjustment`

Tambahkan juga tabel ringkasan saldo agar query dashboard cepat.

Contoh nama tabel:

```text
company_store_balances
```

Field yang disarankan:
1. `company_slug`
2. `company_id`
3. `store_id`
4. `store_slug`
5. `pending_balance`
6. `available_balance`
7. `paid_balance`
8. `cancelled_balance`
9. `last_mutation_at`

### 3. Tambahkan Rekap Penjualan Harian

Buat tabel rekap harian agar laporan tidak selalu menghitung dari semua transaksi.

Contoh nama tabel:

```text
daily_company_sales_reports
```

Field yang disarankan:
1. `report_date`
2. `company_slug`
3. `company_id`
4. `store_id`
5. `store_slug`
6. `transaction_count`
7. `gross_amount`
8. `discount_amount`
9. `voucher_amount`
10. `shipping_fee`
11. `net_sales_amount`
12. `payable_amount`
13. `cancelled_amount`
14. `refund_amount`
15. `created_at`
16. `updated_at`

Berikan unique key minimal pada:

```text
report_date + company_slug + store_id/store_slug
```

### 4. Tambahkan Service Pencatatan

Buat service khusus agar logic finansial tidak menumpuk di controller.

Contoh nama service:

```text
app/Services/MarketplaceSalesLedgerService.js
```

Tanggung jawab service:
1. menerima response transaksi dari `backend-mediacartz`,
2. menormalisasi field transaksi,
3. membuat/men-update row `marketplace_sales`,
4. membuat mutasi ledger balance,
5. meng-update saldo ringkasan,
6. meng-update rekap harian,
7. menjaga idempotency berdasarkan `transaction_number`.

Service ini perlu dipanggil dari:
1. `TransactionController.create` setelah transaksi berhasil dibuat dan bukan `preview_fee`;
2. endpoint update status transaksi jika ada di `core.loyalty.system`;
3. job rekonsiliasi status transaksi dari `backend-mediacartz`.

### 5. Integrasi dengan `TransactionController.create`

Pada flow:

```text
client.loyalty.system /order
-> core.loyalty.system member/transaction
-> backend-mediacartz transaction/retail/order
```

Saat `backend-mediacartz` mengembalikan transaksi sukses:
1. tetap simpan snapshot ke tabel `transactions` seperti saat ini;
2. panggil `MarketplaceSalesLedgerService.recordFromMarketplaceTransaction`;
3. jangan mencatat untuk request `preview_fee`;
4. gunakan `transaction_number` dari response marketplace sebagai key idempotency.

### 6. Rekonsiliasi Status

Karena status transaksi bisa berubah setelah order dibuat, perlu mekanisme rekonsiliasi.

Rencana:
1. Buat command/job terjadwal di `core.loyalty.system`.
2. Job mengambil transaksi dari `marketplace_sales` yang belum final.
3. Untuk setiap transaksi, panggil `MARKETPLACE_CORE` melalui endpoint detail transaksi.
4. Jika status berubah, update `marketplace_sales`, ledger balance, dan laporan harian.
5. Status final yang perlu diperhatikan:
   - `complete`
   - `cancelled`
   - `failed`
   - `refund`
   - status lain yang sudah ada di `backend-mediacartz`.

Catatan:
1. Hindari update saldo langsung tanpa mutasi ledger.
2. Jika ada koreksi, buat mutasi pembalik atau adjustment agar audit tetap jelas.

## Scope CMS `cms.loyalty.system`

Tambahkan halaman management untuk melihat laporan dan balance.

Rencana halaman:
1. Laporan penjualan harian.
2. Detail laporan per company.
3. Detail laporan per toko.
4. Balance company/toko.
5. Riwayat mutasi balance.

Filter minimal:
1. tanggal mulai dan tanggal akhir,
2. company,
3. toko,
4. status settlement,
5. status transaksi.

Data yang ditampilkan minimal:
1. jumlah transaksi,
2. gross sales,
3. diskon/voucher,
4. ongkir,
5. net sales,
6. payable amount,
7. pending balance,
8. available balance,
9. paid balance.

## Scope API Backend untuk CMS

Tambahkan endpoint di `core.loyalty.system` untuk CMS.

Contoh endpoint:

```text
GET /api/v1/admin/marketplace-sales/daily-report
GET /api/v1/admin/marketplace-sales/balance
GET /api/v1/admin/marketplace-sales/balance-mutations
GET /api/v1/admin/marketplace-sales/transactions
```

Hak akses:
1. Admin platform bisa melihat semua company/toko.
2. User partner/company hanya boleh melihat data company miliknya.
3. Jangan expose raw `source_request` dan `source_response` ke user biasa, kecuali role admin/debug.

## Scope `backend-mediacartz`

Perubahan di `backend-mediacartz` dibuat minimal.

Yang perlu dipastikan:
1. Endpoint detail transaksi mengembalikan data yang cukup untuk rekonsiliasi:
   - `transaction_number`,
   - status transaksi,
   - status payment,
   - status shipping,
   - company/store,
   - total amount,
   - discount,
   - shipping fee,
   - voucher/member voucher jika ada.
2. Jika field company/store belum konsisten, tambahkan field yang dibutuhkan tanpa merusak response lama.
3. Jangan membuat `client.loyalty.system` langsung memanggil `backend-mediacartz` untuk laporan.

## Formula Awal yang Perlu Disepakati

Sebelum implementasi final, pastikan formula ini disetujui:

```text
gross_amount = total harga produk sebelum diskon
net_sales_amount = gross_amount - discount_amount - voucher_amount
payable_amount = net_sales_amount + shipping_fee - platform_fee
```

Hal yang perlu diputuskan:
1. Apakah ongkir masuk balance toko atau dipisah sebagai biaya kurir/platform.
2. Apakah voucher loyalty ditanggung platform loyalty atau company.
3. Apakah platform fee/komisi sudah ada sekarang atau disiapkan field-nya dulu dengan default `0`.
4. Kapan saldo menjadi `available`: saat pembayaran sukses atau saat transaksi `complete`.

Rekomendasi awal:
1. Saldo masuk `pending_balance` saat pembayaran sukses.
2. Saldo pindah ke `available_balance` saat transaksi `complete`.
3. Jika transaksi gagal sebelum complete, saldo pending dibatalkan.

## Acceptance Criteria
1. Setiap transaksi marketplace yang dibuat dari `client.loyalty.system` tercatat di tabel transaksi finansial loyalty.
2. Transaksi yang sama tidak tercatat dua kali walaupun request diproses ulang.
3. Laporan harian bisa menampilkan total transaksi per company/toko.
4. Balance company/toko bisa menampilkan pending, available, paid, dan cancelled balance.
5. Perubahan status transaksi menghasilkan mutasi ledger yang bisa diaudit.
6. CMS bisa mengambil data laporan dan balance melalui API `core.loyalty.system`.
7. Akses data laporan mengikuti role user.
8. Raw response marketplace tetap tersimpan untuk audit, tetapi laporan menggunakan field yang sudah dinormalisasi.

## Skenario Test
Tidak perlu membuat instruksi unit test terlalu detail. Cukup pastikan skenario berikut tercakup:

1. Order sukses dari `/order` membuat row transaksi finansial dan mutasi balance.
2. Request transaksi yang sama diproses ulang tidak membuat double pencatatan.
3. Transaksi dengan voucher/diskon menghasilkan nilai laporan yang benar.
4. Transaksi gagal/cancel membuat koreksi balance.
5. Transaksi berubah menjadi `complete` memindahkan saldo dari pending ke available.
6. Rekap harian menampilkan angka sesuai transaksi pada tanggal tersebut.
7. User partner hanya bisa melihat laporan company miliknya.
8. Admin platform bisa melihat semua laporan company/toko.
