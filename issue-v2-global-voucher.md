# Issue v2: Voucher Global untuk Checkout Marketplace

## Latar belakang dan tujuan

Voucher checkout saat ini berasal dari `member_vouchers`: customer harus menukar/memiliki voucher terlebih dahulu. Dibutuhkan voucher berkategori `global` yang tersedia bagi semua customer pada periode tertentu, misalnya gratis ongkos kirim, tanpa penukaran poin dan tanpa membuat baris `member_vouchers` untuk setiap customer. Voucher global hanya dapat digunakan pada transaksi marketplace.

Dokumen ini adalah rencana implementasi, bukan perubahan kode. Cakupan: `core.loyalty.system`, `client.loyalty.system`, `cms.loyalty.system`, serta `backend-mediacartz` karena backend marketplace menghitung diskon dan membuat transaksi. `frontend-mediacartz` tidak perlu diubah untuk alur customer ini.

## Kondisi kode saat ini

- `vouchers.category` adalah enum `offline | marketplace` (`database/migrations/1781100000000_add_category_to_vouchers_schema.js`). `type` terpisah dan sudah mendukung `free`, `amount`, `free_delivery`.
- CRUD admin ada di `app/Controllers/Http/VoucherController.js`, validator `app/Validators/Voucher.js`, route `start/routes/voucher.js`. CMS menggunakan `src/pages/Voucher/VoucherForm.tsx`, `Voucher.tsx`, dan `VoucherDetail.tsx`.
- Checkout customer di `client.loyalty.system/src/pages/Order/index.jsx` mengambil `GET member/redeem/voucher?category=marketplace`, lalu mengenkripsi `member_voucher_id` sebagai `voucher_code`.
- `core.loyalty.system/app/Controllers/Http/CheckoutController.js` meneruskan `voucher_code` dengan `voucher_type: loyalty` ke quote/commit marketplace. Ada juga jalur pembuatan order langsung dari halaman Order; kedua jalur harus konsisten.
- `backend-mediacartz/app/Services/VoucherService.js` memvalidasi voucher loyalty lewat `GET /merchant/member/getvoucher`, mengharapkan `member_voucher_id`, lalu menghitung diskon. Sesudah transaksi dibuat, `TransactionController.js` menjalankan event penukaran jika ada `member_voucher_id`.

## Perilaku yang disepakati untuk implementasi

1. `category = global` berarti **kanal marketplace dan kepemilikan publik**. `type` tetap menyatakan manfaat voucher (`amount`, `free_delivery`, atau `free`). Jangan memakai kategori `marketplace` untuk voucher global baru.
2. Admin mengisi `global_start_date` dan `global_end_date`. Keduanya wajib untuk kategori `global`, `start <= end`, dan disimpan sebagai datetime dengan zona waktu yang disepakati (anjuran: UTC di database, input/tampilan CMS dalam `Asia/Jakarta`). Batas periode inklusif: `start <= sekarang <= end`. Kategori lain menyimpan kedua kolom sebagai `NULL` dan tetap memakai mekanisme durasi voucher milik member.
3. Voucher global yang tersedia harus `status = active`, belum dihapus, dalam periode berlaku, dan terikat pada partner/company yang sama dengan keranjang. `partner_id` tetap wajib/terisi sesuai aturan otorisasi sekarang; `global` berarti semua customer **di partner tersebut**, bukan lintas semua perusahaan. SKU kosong mengikuti perilaku voucher ongkir yang berlaku untuk semua produk; SKU terisi harus cocok dengan item order.
4. Customer dapat memilih satu voucher per order: voucher milik member **atau** voucher global. Tidak ada stacking. Voucher global tidak mengurangi poin, tidak menciptakan `member_vouchers`, dan tidak melalui proses redeem/QR/exchange/return milik member.
5. Voucher global harus divalidasi ulang di server pada quote/preview **dan** commit/order final. Data harga dan tanggal dari browser tidak dipercaya. Jika status, periode, partner, SKU, atau ongkir berubah, kirim error yang jelas dan minta customer memperbarui checkout.
6. Penggunaan voucher global dicatat pada transaksi marketplace dengan referensi voucher yang dapat diaudit. Jangan mengisi `member_voucher_id` dengan ID voucher global atau memicu event `exchangeVoucher`. Tentukan format referensi permanen dan pencegahan penggunaan ganda pada retry transaksi (gunakan `client_request_id`/idempotency yang ada). Voucher boleh digunakan berkali-kali oleh customer selama periode aktif kecuali batas penggunaan menjadi fitur terpisah; issue ini tidak menambahkan kuota.

## Rancangan API dan kontrak data

### Admin CRUD

- `POST/PUT /api/v1/admin/vouchers`: terima `category: global`, `global_start_date`, `global_end_date`; validasi rentang serta timezone dan kirim pesan validasi yang bisa ditampilkan CMS. Saat mengubah kategori global menjadi kategori lain, kosongkan dua tanggal tersebut. Jika mengubah voucher yang sudah digunakan, histori transaksi yang ada tidak boleh hilang.
- `GET /api/v1/admin/vouchers` dan `/get`: kembalikan kategori dan kedua tanggal; filter kategori `global` harus bekerja. Jaga otorisasi partner yang sudah ada; akun partner tidak dapat membuat/mengubah voucher perusahaan lain.
- `number_point` dan `duration` saat global: tidak dipakai untuk kelayakan. Pilihan implementasi yang disarankan: izinkan `NULL`/nilai default yang aman pada global, lalu sesuaikan validasi dan UI agar tidak meminta poin atau durasi. Jangan mengandalkan angka dummy untuk menentukan masa berlaku.

### Daftar pilihan checkout

- Tambah endpoint terautentikasi khusus, misalnya `GET /api/v1/member/checkout/global-vouchers?partner_id=...` (ikuti prefix route yang sebenarnya). Ambil company/partner dari konteks keranjang/member yang diverifikasi server, bukan percaya `partner_id` mentah. Kembalikan hanya global voucher yang aktif dan masih dalam periode. Sertakan `voucher_id`, nama, tipe/manfaat, SKU, partner/company, serta tanggal mulai/akhir. Jangan menghasilkan `member_voucher_id` palsu.
- Daftar member voucher yang sudah ada tetap dikembalikan lewat endpoint lama; jangan memasukkan voucher global ke `GET member/redeem/voucher`, karena endpoint tersebut merepresentasikan voucher yang dimiliki customer.
- Untuk pilihan voucher global, kirim referensi eksplisit seperti `voucher_type: loyalty_global` dan `voucher_code: <voucher_id atau token global yang didefinisikan server>`. Pertahankan kontrak `voucher_type: loyalty` dan kode terenkripsi untuk voucher member. Nama tipe/format final harus sama di client, core, dan marketplace; jangan menyimpulkan tipe dari string kode saja.

### Validasi antarlayanan dan transaksi

- Tambahkan endpoint internal core untuk memvalidasi voucher global berdasarkan ID/referensi, company/partner, kanal `marketplace`, dan waktu server. Gunakan autentikasi/identitas integrasi merchant yang sudah berlaku (`cid`/`sid`) dan pola route `start/routes/merchant.js`; jangan membuka validasi internal tanpa pembatasan. Response harus memuat data voucher yang cukup untuk kalkulasi serta `category: global`, bukan struktur `member_voucher` tiruan.
- `backend-mediacartz` menambah cabang `loyalty_global` pada `VoucherService.calculateDiscountAmount`. Validasi partner/company, SKU, jenis manfaat, status/periode lewat core, lalu hitung diskon di backend marketplace. `free_delivery` hanya untuk ongkir berbayar dan diskon maksimal sebesar ongkir; `amount` mengikuti aturan nominal/persentase yang ada; semua diskon tidak boleh melebihi dasar perhitungan atau membuat total negatif.
- Pada quote dan commit di core, sertakan pilihan voucher di token quote yang ditandatangani. Saat commit, gunakan pilihan dari quote, bukan `voucher_code`/`voucher_type` yang boleh diganti di body request. Marketplace tetap melakukan validasi periode di order final; token quote tidak memperpanjang masa berlaku voucher.
- Simpan `voucher_id`/snapshot global di transaksi marketplace dengan cara yang kompatibel dengan schema yang ada. Periksa apakah `transaction.voucher_id` menunjuk tabel voucher marketplace lokal; jika demikian, jangan memasukkan ID dari database core ke kolom itu. Gunakan kolom/referensi/snapshot terpisah atau field JSON yang terdokumentasi, termasuk kategori, nominal diskon, dan ID voucher core. Tidak boleh menembakkan event penukaran member untuk global.
- Evaluasi alur refund/cancel yang sekarang mengembalikan voucher member: global tidak membutuhkan pengembalian kepemilikan, tetapi histori diskon transaksi tetap ada. Pastikan preview dan transaksi final memakai hasil kalkulasi yang sama.

## Rencana pekerjaan per repository dan file

### `core.loyalty.system`

| File | Pekerjaan |
| --- | --- |
| `database/migrations/<timestamp>_add_global_voucher_period_schema.js` (baru) | Tambahkan opsi `global` ke enum `vouchers.category` dengan migration baru yang aman untuk data lama; tambah `global_start_date` dan `global_end_date` nullable datetime serta index yang sesuai. Jangan mengedit migration lama yang telah berjalan. Siapkan `down()` yang mempertimbangkan adanya data kategori global. |
| `app/Validators/Voucher.js` | Izinkan kategori global dan validasi tanggal kondisional, urutan tanggal, format, serta kewajiban partner. |
| `app/Controllers/Http/VoucherController.js` | Simpan/perbarui dua tanggal dan bersihkan saat kategori diganti; pastikan respons list/detail memuatnya. |
| `app/Services/GlobalVoucherService.js` (baru) | Pusatkan aturan kelayakan, batas periode, partner/company, status, kanal, serta pembentukan data aman bagi checkout dan marketplace. |
| `app/Controllers/Http/MemberController.js` atau controller checkout voucher baru | Implementasi daftar voucher global checkout; cegah redeem global di `vouchers`, `redeem`, `request_redeem`, dan alur verifikasi pembelian. Kategori global tidak boleh masuk daftar voucher yang bisa dibeli dengan poin. |
| `app/Controllers/Http/CheckoutController.js` | Bawa tipe/referensi global ke quote dan commit; kunci pilihan pada token quote; validasi konteks checkout sebelum proxy ke marketplace. |
| `app/Controllers/Http/MemberController.js` atau controller integrasi baru; `start/routes/merchant.js` | Endpoint validasi global internal. Endpoint `getvoucher` untuk member voucher tetap kompatibel. |
| `start/routes/member.js` | Route daftar global checkout yang terautentikasi. |
| `app/Validators/CheckoutQuote.js`, `app/Validators/CheckoutCommit.js` | Sesuaikan kontrak pilihan voucher bila request baru dibutuhkan. |
| `app/Lib/VoucherRedeemConfirmation.js`, `app/Services/MemberVoucherLifecycleService.js` | Audit dan tolak kategori global dari penukaran poin/exchange/return. Ubah hanya jika pemeriksaan di controller belum cukup. |

### `cms.loyalty.system`

| File | Pekerjaan |
| --- | --- |
| `src/pages/Voucher/VoucherForm.tsx` | Tambahkan opsi kategori Global, input tanggal mulai/akhir, validasi dan konversi timezone; tampilkan hanya untuk global. Sembunyikan/nonaktifkan poin dan durasi yang tidak berlaku, serta jaga nilai saat edit. |
| `src/pages/Voucher/Voucher.tsx` | Filter dan label kategori global, tampilkan periode/status masa berlaku agar admin mudah melihat voucher aktif/terjadwal/kedaluwarsa. |
| `src/pages/Voucher/VoucherDetail.tsx` | Tampilkan periode global dan penjelasan bahwa voucher tersedia otomatis di checkout marketplace. |

### `client.loyalty.system`

| File | Pekerjaan |
| --- | --- |
| `src/utils/api.js` | Tambahkan endpoint daftar global checkout. |
| `src/pages/Order/index.jsx` | Gabungkan pilihan voucher member dan global pada popup pilih voucher, beri label jenisnya, tampilkan masa berlaku, batasi ke partner/company dan item yang sesuai, serta sesuaikan `buildTransactionPayload`, quote, commit, penghapusan pilihan, dan refresh saat toko/ongkir berubah. Jangan akses `member_voucher_id` pada voucher global. |
| `src/utils/voucherDiscount.js` | Normalisasi bentuk voucher global untuk tampilan diskon, pencocokan company/SKU, dan estimasi lokal; total final tetap dari server. |
| Komponen voucher terpisah (baru, bila diperlukan) | Pisahkan item/label voucher agar dua bentuk data tidak menghasilkan banyak kondisi di `Order/index.jsx`. |

### `backend-mediacartz` (diperlukan untuk diskon final)

| File | Pekerjaan |
| --- | --- |
| `app/Services/VoucherService.js` | Cabang `loyalty_global`, panggil validasi internal core, hitung diskon dan kembalikan snapshot/referensi tanpa `member_voucher_id`. |
| `app/Controllers/Http/TransactionController.js` | Teruskan tipe dan kode ke service, simpan referensi/snapshot global, dan pastikan event `LoyaltyService::exchangeVoucher` hanya untuk voucher member. Audit preview, commit, refund/cancel. |
| `app/Validators/...` / middleware order retail terkait | Izinkan tipe baru dan validasi format payload jika saat ini ada allowlist. |
| Migration baru jika dibutuhkan | Hanya bila kolom transaksi yang ada tidak cukup untuk referensi/snapshot voucher global; jangan menyalahgunakan foreign key voucher lokal. |

Nama migration dan file baru boleh disesuaikan dengan konvensi repo, tetapi tanggung jawab di atas wajib tercakup.

## Urutan implementasi

1. Migration dan aturan kategori/periode di core, dilanjutkan CRUD admin dan CMS.
2. Endpoint daftar serta validasi global di core; pastikan redeem dan kanal offline menolak global.
3. Dukungan `loyalty_global` di marketplace, termasuk snapshot transaksi dan perhitungan preview/final.
4. Integrasi quote/commit core dan pemilihan voucher di client. Uji alur lintas layanan end-to-end sebelum rilis.

## Skenario pengujian dan kriteria selesai

- Admin membuat, mengedit, memfilter, dan melihat detail voucher global dengan rentang tanggal; rentang tidak valid dan partner tidak sah ditolak. Voucher `offline`/`marketplace` lama tetap bekerja.
- Customer yang tidak memiliki voucher melihat global yang aktif untuk company tokonya di checkout; voucher terjadwal, kedaluwarsa, nonaktif, dan company lain tidak muncul.
- Voucher global gratis ongkir mengurangi ongkir berbayar sampai nol tanpa mengurangi harga barang; pickup/ongkir nol tidak memperoleh diskon ongkir. Voucher nominal/persentase sesuai aturan dan tidak membuat total negatif.
- Pilihan member voucher dan global saling menggantikan. Melepas voucher mengembalikan harga semula. Pergantian toko, item, alamat, atau metode kirim membatalkan voucher yang tidak cocok dan memperbarui quote.
- Periode atau status yang berubah setelah daftar/quote menyebabkan preview atau commit ditolak dengan pesan jelas; manipulasi ID/tanggal/partner di browser tidak memberikan diskon.
- Transaksi berhasil mencatat referensi serta jumlah diskon global, tanpa `member_voucher_id`, tanpa debit poin atau event penukaran. Retry order tidak menggandakan transaksi/penggunaan.
- Voucher global tidak tersedia di pembelian voucher dengan poin, daftar voucher milik member, QR/offline, serta transaksi toko offline. Jalur voucher member yang lama tetap berhasil, termasuk refund/cancel.
- Verifikasi lintas repo: migration up/down pada database uji, API CRUD dan eligibility, checkout quote/commit, serta build frontend. Detail unit test diserahkan kepada implementer.

## Catatan keputusan sebelum mulai coding

- Tetapkan format pasti `voucher_type`/`voucher_code` global dan skema snapshot transaksi dalam satu perubahan kontrak lintas tiga backend; dokumentasikan contoh payloadnya.
- Pastikan zona waktu pada penyimpanan dan tampilan tidak membuat voucher aktif/kedaluwarsa satu hari lebih cepat atau lambat.
- MySQL enum pada migration lama tidak otomatis menerima `global`; migration baru harus mengubah definisi enum secara aman tanpa menghapus nilai lama.
