# Issue: Batasi Pemakaian Voucher Berdasarkan Company Penerbit

## Informasi Umum
1. `core.loyalty.system` adalah backend loyalty / proxy.
2. `client.loyalty.system` adalah frontend loyalty customer.
3. `cms.loyalty.system` adalah frontend management loyalty.
4. `backend-mediacartz` adalah backend marketplace / `MARKETPLACE_CORE`.
5. `frontend-mediacartz` adalah frontend marketplace untuk `backend-mediacartz`.

## Latar Belakang
Saat ini pada `client.loyalty.system`, halaman `/order` menampilkan voucher milik member dan memungkinkan member memilih voucher untuk transaksi. Perlu dipastikan voucher hanya bisa dipakai pada company yang menerbitkan voucher tersebut.

Contoh kondisi yang harus dicegah:
1. Member memiliki voucher dari Company A.
2. Member checkout produk dari Company B.
3. Voucher Company A tetap muncul atau tetap bisa dipilih pada halaman `/order` Company B.

Voucher harus mengikuti company penerbit, bukan hanya status kepemilikan member.

## Tujuan
1. Pada halaman `/order`, member hanya melihat atau hanya bisa memilih voucher yang diterbitkan oleh company tempat transaksi dilakukan.
2. Jika ada voucher yang tidak sesuai company, voucher tersebut tidak boleh dipakai untuk transaksi.
3. Validasi frontend hanya untuk pengalaman pengguna. Validasi final tetap harus dilakukan di backend.
4. Alur komunikasi tetap mengikuti arsitektur:

```text
client.loyalty.system -> core.loyalty.system -> backend-mediacartz
```

Frontend tidak boleh langsung memanggil `backend-mediacartz`.

## Scope Frontend `client.loyalty.system`

### 1. Halaman `/order`
File referensi:

```text
client.loyalty.system/src/pages/Order/index.jsx
client.loyalty.system/src/utils/api.js
client.loyalty.system/src/utils/voucherDiscount.js
```

Rencana:
1. Identifikasi company checkout dari data order yang sudah tersedia di halaman `/order`.
2. Prioritas sumber company dapat menggunakan:
   - `storeData.company.company_slug`
   - `storeData.company_slug`
   - data hasil lookup `store_slug`
   - fallback dari `DEFAULT_COMPANY_SLUG` hanya jika memang alur saat ini menggunakan default company.
3. Saat mengambil daftar voucher member dari endpoint existing:

```text
member/redeem/voucher
```

filter voucher yang company penerbitnya sama dengan company checkout.

4. Field voucher yang perlu dicek dari response:
   - `voucher.partner.company_slug`
   - atau field company lain yang tersedia dari partner voucher.
5. Jika field company penerbit voucher belum tersedia di response, backend `core.loyalty.system` perlu melengkapinya.
6. Pada modal pilih voucher, tampilkan hanya voucher yang cocok dengan company checkout.
7. Jika sebelumnya user sudah memilih voucher lalu company checkout berubah atau data store berubah, hapus pilihan voucher jika company-nya tidak lagi cocok.
8. Saat submit order, lakukan validasi ulang sebelum request transaksi dikirim. Jika voucher tidak cocok dengan company checkout, tampilkan error dan hentikan proses submit.
9. Jangan hanya mengandalkan voucher yang disembunyikan di UI, karena user bisa saja memanipulasi request.

## Scope Backend `core.loyalty.system`

### 1. Lengkapi Data Voucher Member
File referensi:

```text
core.loyalty.system/app/Controllers/Http/MemberController.js
core.loyalty.system/app/Models/MemberVoucher.js
core.loyalty.system/app/Models/Voucher.js
```

Rencana:
1. Pastikan endpoint daftar voucher member mengembalikan data partner/company penerbit voucher.
2. Endpoint yang perlu dicek:

```text
GET member/redeem/voucher
GET member/vouchers
```

3. Response minimal perlu membawa salah satu identifier company penerbit:
   - `voucher.partner.company_slug`
   - atau `voucher.partner_id` jika frontend dapat memetakan partner ke company checkout.
4. Disarankan memakai `company_slug` karena halaman order saat ini banyak memakai `store_slug` dan `company_slug`.
5. Jangan mengubah kontrak response secara merusak. Tambahkan field yang dibutuhkan tanpa menghapus field lama.

### 2. Validasi Voucher Saat Transaksi
File referensi:

```text
core.loyalty.system/app/Controllers/Http/TransactionController.js
backend-mediacartz/app/Services/VoucherService.js
```

Rencana:
1. Saat transaksi membawa `voucher_code`, pastikan company checkout ikut dikirim ke proses validasi voucher.
2. Company checkout dapat berasal dari:
   - `company_slug` request order,
   - company dari `store_slug`,
   - atau company yang sudah diselesaikan oleh flow transaksi existing.
3. Sebelum meneruskan transaksi ke `backend-mediacartz`, core harus menjaga agar voucher loyalty yang dikirim sesuai dengan company checkout.
4. Jika validasi company lebih tepat dilakukan di `backend-mediacartz`, core tetap harus meneruskan data company yang cukup agar marketplace dapat memvalidasi.
5. Error yang diharapkan jika voucher tidak sesuai company:

```text
voucher not available for this company
```

atau pesan setara yang mudah dipahami frontend.

## Scope `backend-mediacartz`

File referensi:

```text
backend-mediacartz/app/Services/VoucherService.js
backend-mediacartz/app/Controllers/Http/TransactionController.js
```

Rencana:
1. Pastikan perhitungan voucher loyalty tidak hanya mengecek voucher valid dan store, tetapi juga company penerbit voucher.
2. Saat memanggil core loyalty endpoint:

```text
merchant/member/getvoucher
```

pastikan response voucher membawa company penerbit voucher.
3. Cocokkan company penerbit voucher dengan company transaksi.
4. Jika voucher diterbitkan company lain, return error dan jangan berikan diskon.
5. Validasi ini tetap diperlukan walaupun frontend sudah memfilter voucher, karena backend adalah sumber kebenaran final.

## Catatan Integrasi
1. Jangan buat komunikasi langsung dari `client.loyalty.system` ke `backend-mediacartz`.
2. Jika perlu data company dari marketplace, panggil melalui endpoint proxy di `core.loyalty.system`.
3. Gunakan identifier yang konsisten. Prioritaskan `company_slug` untuk pencocokan lintas sistem.
4. Normalisasi perbandingan string dengan trim dan lowercase agar tidak gagal karena perbedaan kapital atau spasi.
5. Pastikan behavior voucher lain tetap berjalan:
   - `free`
   - `amount`
   - `free_delivery`

## Acceptance Criteria
1. Pada halaman `/order`, modal pilih voucher hanya menampilkan voucher dari company checkout.
2. Voucher dari company lain tidak bisa dipilih untuk order company yang berbeda.
3. Jika voucher sudah terpilih lalu company checkout berubah, voucher terpilih dibersihkan.
4. Submit order dengan voucher beda company ditolak sebelum transaksi diproses.
5. Backend tetap menolak voucher beda company walaupun request dimanipulasi dari frontend.
6. Response daftar voucher member memiliki data company penerbit yang cukup untuk filter frontend.
7. Voucher existing dengan tipe `free`, `amount`, dan `free_delivery` tetap berjalan sesuai aturan sebelumnya.

## Skenario Test
Tidak perlu membuat instruksi unit test terlalu detail. Cukup pastikan skenario berikut tercakup:

1. Order Company A hanya menampilkan voucher Company A.
2. Order Company B tidak menampilkan voucher Company A.
3. Voucher beda company tidak bisa dipakai walaupun dipilih melalui manipulasi state/request.
4. Voucher company yang sama tetap bisa dipakai.
5. Voucher `free_delivery` tetap mengikuti validasi company dan validasi ongkir/SKU yang sudah ada.
6. Response `member/redeem/voucher` membawa data company penerbit voucher.
7. Data lama voucher member tetap bisa ditampilkan tanpa error.
