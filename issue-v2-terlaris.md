# Issue v2: Produk terlaris satu minggu pada katalog loyalty

## Ringkasan

Tambahkan bagian **Produk Terlaris** pada halaman customer `/product`. Data berasal dari transaksi retail di `backend-mediacartz`, mencakup penjualan marketplace/online dan penjualan offline, lalu diteruskan melalui proxy `core.loyalty.system` ke `client.loyalty.system`.

Bagian ini menampilkan maksimal 8 produk dengan jumlah unit terjual tertinggi dalam periode 7 hari yang berakhir pada transaksi retail berhasil terakhir milik perusahaan. Produk ditampilkan dalam satu baris horizontal yang dapat digeser ke kiri dan kanan. Klik kartu membuka halaman detail produk yang sama dengan alur kartu katalog biasa.

Dokumen ini menjadi panduan implementasi untuk junior programmer atau model AI dengan biaya lebih rendah. Ikuti kontrak, batas lingkup, dan acceptance criteria di bawah agar implementasi antarrepository tetap konsisten.

## Struktur repository

1. `core.loyalty.system`: backend loyalty dan proxy ke Marketplace Core.
2. `client.loyalty.system`: frontend loyalty customer.
3. `cms.loyalty.system`: frontend management loyalty.
4. `backend-mediacartz`: backend marketplace yang digunakan sebagai `MARKETPLACE_CORE`.
5. `frontend-mediacartz-react`: frontend marketplace untuk `backend-mediacartz`.

## Lingkup perubahan

Repository yang termasuk lingkup:

1. `backend-mediacartz`: menghitung produk terlaris dari transaksi retail.
2. `core.loyalty.system`: menyediakan API public proxy yang aman dan stabil.
3. `client.loyalty.system`: menampilkan baris produk terlaris pada `/product` dan menangani navigasi detail.

Repository di luar lingkup:

- `cms.loyalty.system`: tidak membutuhkan menu atau pengaturan baru.
- `frontend-mediacartz-react`: tidak membutuhkan perubahan UI.

## Latar belakang

Halaman `/product` saat ini menampilkan banner, pencarian, tab kategori, dan katalog dari toko aktif. Belum ada informasi produk yang paling banyak dibeli. Customer perlu mendapat rekomendasi berbasis penjualan nyata agar lebih mudah menemukan produk populer.

Sumber transaksi berada di `backend-mediacartz`. Tabel `transaction` menyimpan perusahaan penjual, toko, jenis transaksi, kanal pembayaran, status, dan waktu transaksi. Tabel `transaction_detail` menyimpan `transaction_detail_item_id`, nama produk, kuantitas, dan harga. Karena transaksi marketplace dan transaksi offline sama-sama masuk ke alur retail, agregasi harus mencakup kedua kanal tanpa menghitung transaksi non-retail atau transaksi yang belum berhasil.

## Tujuan

1. Menyediakan daftar maksimal 8 produk terlaris perusahaan berdasarkan jumlah unit yang benar-benar terjual selama 7 hari ke belakang dari transaksi retail berhasil terakhir.
2. Menggabungkan penjualan retail dari kanal `ONLINE` dan `OFFLINE`.
3. Menampilkan produk yang dapat dibuka dalam konteks toko aktif customer.
4. Menghindari query per produk, request berulang, dan ketergantungan langsung frontend kepada Marketplace Core.
5. Menjaga halaman katalog tetap dapat digunakan bila data terlaris kosong, lambat, atau gagal dimuat.

## Definisi bisnis

### Periode

- Cari waktu transaksi retail berhasil paling akhir untuk perusahaan yang diminta: `MAX(transaction_created_datetime)`. Gunakan hanya transaksi yang memenuhi aturan kelayakan pada bagian **Transaksi yang dihitung**, sehingga transaksi pending, gagal, atau ditolak tidak menggeser periode.
- Tetapkan waktu transaksi terakhir tersebut sebagai `period_end`, kemudian tetapkan `period_start = period_end - 7 days`.
- Agregasi produk hanya dari transaksi dengan waktu `period_start <= transaction_created_datetime <= period_end`.
- Periode tidak mengikuti waktu saat request diterima. Jika transaksi terakhir terjadi beberapa minggu lalu, periode tetap dihitung tujuh hari ke belakang dari transaksi tersebut.
- Gunakan timezone yang telah dipakai oleh transaksi Marketplace Core. Jangan menghitung batas tanggal di browser.
- API mengembalikan `period_start` dan `period_end` agar periode dapat diaudit. Bila perusahaan belum mempunyai transaksi retail berhasil, keduanya bernilai `null` dan `products` berupa array kosong.

### Transaksi yang dihitung

Transaksi harus memenuhi seluruh ketentuan berikut:

1. `seller_company_id` sama dengan perusahaan yang diminta.
2. Merupakan transaksi retail. Gunakan indikator yang sudah ada, yaitu `store_id IS NOT NULL` dan/atau relasi `ms_transaction.ms_transaction_identifier = 'PURCHASE_RETAIL'`. Pilih kondisi final yang konsisten dengan data historis; jangan memasukkan package, event, top-up, atau jenis transaksi non-retail.
3. Status menunjukkan penjualan berhasil. Minimal sertakan status `approved`. Sertakan `progressing` bila status tersebut dipakai untuk order retail online yang sudah dibayar tetapi masih dalam proses pengiriman. Kode status harus diperoleh melalui `Utility.getApprovalStatus`, bukan menulis angka status langsung.
4. Kanal merchant payment adalah `ONLINE` atau `OFFLINE`. Keduanya masuk agregasi yang sama.
5. `transaction_detail_item_id` valid dan kuantitas lebih besar dari nol.
6. Transaksi berstatus `pending`, `verified` tetapi belum dibayar, `rejected`, atau `failed` tidak boleh dihitung.

Jika ditemukan data lama yang tidak mempunyai `ms_merchant_payment_id`, dokumentasikan hasil audit sebelum menentukan fallback. Jangan otomatis menganggap kanal null sebagai penjualan valid.

### Cara menentukan peringkat

1. Kelompokkan berdasarkan `transaction_detail_item_id`.
2. Nilai utama adalah `SUM(transaction_detail_item_quantity)` sebagai `sold_quantity`.
3. Urutkan `sold_quantity DESC`.
4. Jika jumlah unit sama, urutkan `gross_sales DESC`, lalu `item_id ASC` agar hasil stabil.
5. `gross_sales` dihitung dari harga detail dikali kuantitas. Nilai ini digunakan untuk tie-break dan tidak wajib ditampilkan kepada customer.
6. Batasi hasil akhir maksimal 8 produk.

### Hubungan dengan toko aktif

Ranking penjualan dihitung pada tingkat perusahaan dan mencakup seluruh toko perusahaan. Customer tetap mempunyai toko aktif pada katalog loyalty.

- Endpoint Marketplace menerima `company_slug` dan parameter opsional `store_slug`.
- Bila `store_slug` dikirim, validasi bahwa toko tersebut milik perusahaan yang sama.
- Setelah ranking perusahaan dihitung, hanya kembalikan produk yang mempunyai menu di toko aktif. Ambil kandidat lebih dari 8 sebelum filter atau lakukan join menu toko sebelum `LIMIT`, sehingga API tetap dapat mengisi hingga 8 produk yang tersedia.
- Urutan tetap berdasarkan total penjualan perusahaan, bukan penjualan toko aktif.
- Harga, stok, `menu_slug`, dan ketersediaan yang dikirim untuk kartu harus berasal dari menu toko aktif.
- Produk tanpa detail route yang valid tidak dikirim ke client.

Aturan ini mencegah customer membuka produk populer yang tidak tersedia pada toko aktif atau masuk ke detail produk toko lain.

## Kontrak API Marketplace Core

### Endpoint yang disarankan

`GET /api/v1/company/slug/:company_slug/product/best-sellers`

Endpoint ditempatkan pada grup `no-auth-required` karena dipanggil server proxy. Jika proyek mensyaratkan autentikasi antarlayanan untuk data agregat, gunakan middleware signature yang sudah tersedia dan sesuaikan pemanggilan proxy. Jangan membuka data transaksi individual.

Query parameter:

| Parameter | Wajib | Aturan |
| --- | --- | --- |
| `store_slug` | Tidak | Jika ada, harus merupakan toko milik company dan hasil harus tersedia pada toko tersebut. |
| `limit` | Tidak | Default 8, maksimum 8. Abaikan atau tolak nilai di luar batas secara konsisten. |

Periode tidak dikirim oleh client. Backend menentukan `period_end` dari transaksi retail berhasil terakhir perusahaan dan menghitung `period_start` tujuh hari ke belakang agar definisi fitur tidak dapat diubah lewat query public.

Contoh respons sukses:

```json
{
  "success": "Best-selling retail products have been fetched successfully",
  "data": {
    "company_slug": "pt-boga-origin-sejahtera",
    "store_slug": "freshly-baked-by-origin-bakery-jakarta-barat",
    "period_start": "2026-09-29 10:00:00",
    "period_end": "2026-10-06 10:00:00",
    "products": [
      {
        "rank": 1,
        "item_id": 8,
        "item_name": "Baguette",
        "item_slug": "baguette",
        "menu_slug": "baguette-freshly-baked-by-origin-bakery-jakarta-barat",
        "item_image": ["https://cdn.example.com/baguette.jpg"],
        "current_price": 27000,
        "menu_current_quantity": 12,
        "sold_quantity": 43
      }
    ]
  }
}
```

Aturan respons:

- Tidak ada transaksi adalah sukses dengan `products: []`.
- Jangan mengirim data customer, nomor transaksi, payload transaksi, metode pembayaran detail, atau data finansial internal.
- Normalisasi angka menjadi number dan gambar menjadi array dengan format yang konsisten dengan endpoint menu saat ini.
- Produk duplikat harus digabung berdasarkan `item_id`, termasuk bila terjual di beberapa toko atau kanal.
- Produk yang sudah dihapus/nonaktif boleh dikeluarkan dari hasil. Jangan membuat kartu yang tidak dapat dibuka.
- Error company atau store yang tidak valid harus jelas dan memakai status HTTP yang sesuai.

## Kontrak API proxy Loyalty Core

### Endpoint public

`GET /api/v1/public/product/best-sellers`

Query parameter:

| Parameter | Wajib | Aturan |
| --- | --- | --- |
| `store_slug` | Tidak | Gunakan toko aktif dari client; jika kosong gunakan `DEFAULT_STORE_SLUG`. |
| `company_slug` | Tidak | Gunakan `DEFAULT_COMPANY_SLUG` untuk alur loyalty yang sekarang. Jangan percaya company arbitrary tanpa validasi. |

Perilaku proxy:

1. Gunakan `MemberStoreService.resolve` untuk memvalidasi toko dan perusahaan dengan pola yang sama seperti `publicProduct`.
2. Panggil endpoint best seller Marketplace Core satu kali dengan company dan toko yang sudah tervalidasi.
3. Normalisasi respons menjadi bentuk loyalty `{ status, message, data }`.
4. Batasi field public pada kebutuhan kartu saja.
5. Tetapkan timeout upstream yang masuk akal dan tangani timeout sebagai respons gagal yang jelas.
6. Pertimbangkan cache singkat per pasangan `company_slug:store_slug`, misalnya 5 menit, karena agregasi 7 hari tidak perlu dihitung pada setiap kunjungan. Cache harus mempunyai TTL dan promise request yang sedang berjalan sebaiknya dideduplikasi.
7. Kegagalan endpoint terlaris tidak boleh memengaruhi endpoint kategori atau katalog utama.

Contoh respons proxy:

```json
{
  "status": true,
  "data": {
    "period_start": "2026-09-29 10:00:00",
    "period_end": "2026-10-06 10:00:00",
    "products": [
      {
        "rank": 1,
        "item_id": 8,
        "item_name": "Baguette",
        "item_slug": "baguette",
        "menu_slug": "baguette-freshly-baked-by-origin-bakery-jakarta-barat",
        "image_url": "https://cdn.example.com/baguette.jpg",
        "current_price": 27000,
        "stock": 12,
        "sold_quantity": 43
      }
    ]
  }
}
```

## Perilaku UI `/product`

1. Letakkan bagian **Produk Terlaris** tepat di bawah tab kategori dan sebelum grid hasil katalog.
2. Bagian tetap tampil saat customer memilih kategori. Daftar terlaris tidak ikut difilter oleh tab kategori karena ranking merupakan rekomendasi perusahaan.
3. Tampilkan kartu dalam satu baris horizontal dengan `overflow-x-auto`, dukungan swipe pada mobile, dan scroll halus.
4. Pada desktop, sediakan tombol panah kiri/kanan jika konten melebihi lebar container. Tombol harus disabled atau disembunyikan pada batas scroll.
5. Kartu tidak boleh melebar memenuhi baris. Gunakan lebar tetap responsif agar sebagian kartu berikutnya terlihat pada mobile sebagai petunjuk bahwa baris dapat digeser.
6. Isi minimal kartu: gambar, nama produk, harga toko aktif, label peringkat/terlaris, dan `Terjual {sold_quantity}`.
7. Stok habis tetap boleh tampil bila produk masih mempunyai menu aktif, tetapi gunakan badge **Stok habis** dan pertahankan aturan detail yang sudah berlaku. Jika keputusan produk mengharuskan hanya barang yang dapat dibeli, filter stok habis di backend dan dokumentasikan keputusan tersebut.
8. Klik kartu memakai alur `handleProductClick` yang sudah ada agar konteks katalog, scroll, toko aktif, `item_id`, dan slug tetap konsisten.
9. Saat toko aktif berubah, kosongkan hasil terlaris toko sebelumnya dan muat ulang dengan `store_slug` baru. Jangan menampilkan hasil request lama setelah pergantian toko.
10. Loading memakai skeleton horizontal ringan. Respons kosong atau gagal cukup menyembunyikan section; katalog utama tetap berfungsi dan jangan menampilkan toast berulang.
11. Jangan memanggil endpoint detail atau review satu kali per kartu. Semua informasi kartu harus sudah tersedia pada respons best seller.
12. Section harus dapat digunakan dengan keyboard, mempunyai nama aksesibel pada tombol panah, dan tidak menghalangi scroll vertikal halaman pada perangkat sentuh.

## Rencana perubahan per repository

### `backend-mediacartz`

| File | Perubahan |
| --- | --- |
| `start/routes/client.js` | Tambahkan route public best seller di grup `no-auth-required`, setelah route katalog/item perusahaan agar mudah ditemukan. |
| `app/Controllers/Http/ProductBestSellerController.js` **(baru, disarankan)** | Validasi parameter, panggil service, normalisasi respons, dan tangani error. Dapat ditempatkan sebagai method controller produk yang relevan jika repository sudah mempunyai pemisahan yang lebih sesuai. |
| `app/Services/ProductBestSellerService.js` **(baru, disarankan)** | Bangun query agregasi transaksi retail, filter periode/status/channel/company, tie-break ranking, validasi menu toko, dan bentuk DTO kartu. Pisahkan query bisnis dari controller. |
| `app/Models/Transaction.js`, `app/Models/TransactionDetail.js`, `app/Models/Item.js`, `app/Models/Menu.js` **(audit)** | Gunakan relasi/kolom yang sudah tersedia; jangan mengubah model bila query service dengan Query Builder sudah cukup. |
| `app/Helpers/Utility.js` **(pakai, tidak harus diubah)** | Ambil kode status `approved` dan `progressing` melalui helper. |
| `database/migrations/<timestamp>_best_seller_query_indexes.js` **(opsional setelah EXPLAIN)** | Tambah indeks hanya bila hasil `EXPLAIN` menunjukkan kebutuhan. Kandidat indeks mencakup transaksi pada company/status/waktu/store serta detail pada transaction/item. Periksa indeks yang sudah ada sebelum membuat duplikat. |

Catatan query:

- Gunakan Query Builder/binding parameter. Jangan menyusun SQL dari input string.
- Join minimal `transaction`, `transaction_detail`, `ms_transaction`, `ms_merchant_payment`, `item`, dan `menu/store` bila `store_slug` digunakan.
- Pastikan join menu tidak menggandakan `sold_quantity`. Agregasikan transaksi/detail terlebih dahulu atau join ke satu menu toko yang valid.
- Jalankan `EXPLAIN` pada data representatif. Targetnya satu query agregasi dan satu query metadata/menu bila pemisahan membuat query lebih aman; hindari N+1.

### `core.loyalty.system`

| File | Perubahan |
| --- | --- |
| `start/routes/public.js` | Tambahkan `GET /product/best-sellers`. Letakkan berdekatan dengan route `/product`. |
| `app/Controllers/Http/ProductController.js` | Tambahkan method `publicBestSellers`, atau buat controller khusus bila ProductController semakin besar. Validasi toko melalui `MemberStoreService`, panggil Marketplace Core, batasi field, dan normalisasi error/respons. |
| `app/Services/MemberStoreService.js` | Gunakan method yang sudah ada untuk resolve company/store. Jangan membuat validasi toko kedua. |
| `app/Services/ProductBestSellerService.js` **(baru, opsional/disarankan)** | Tempatkan pemanggilan upstream, mapping DTO public, cache TTL, dan deduplikasi promise agar controller tetap sederhana. |
| `.env.example` | Tambahkan TTL atau timeout hanya bila dibuat configurable, misalnya `BEST_SELLER_CACHE_TTL_SECONDS=300`. Beri default aman di kode. |
| `API_DOCUMENT.md` | Dokumentasikan endpoint, query, respons sukses/kosong, dan respons gagal. |

Jangan menghitung ulang transaksi pada `core.loyalty.system`. Core hanya memvalidasi konteks loyalty, meneruskan request, melakukan cache singkat, dan menyederhanakan respons.

### `client.loyalty.system`

| File | Perubahan |
| --- | --- |
| `src/utils/api.js` | Tambahkan konstanta `PUBLIC_PRODUCT_BEST_SELLERS` menuju `public/product/best-sellers`. |
| `src/pages/Product/index.jsx` | Muat best seller berdasarkan `activeStoreSlug`, kelola loading/empty/error, letakkan section di bawah tab kategori, dan gunakan `handleProductClick` untuk navigasi. |
| `src/components/ProductBestSeller/index.jsx` **(baru, disarankan)** | Komponen section horizontal, kartu, skeleton, tombol scroll desktop, swipe mobile, badge ranking/stok, dan aksesibilitas. Jangan menambah seluruh markup ke Product page bila membuat file tersebut semakin besar. |
| `src/utils/productCatalogContext.js` **(audit)** | Best seller tidak wajib disimpan dalam return context. Jika disimpan, sertakan `storeSlug` dan masa berlaku agar data toko lama tidak dipakai. |
| stylesheet global/Tailwind **(audit)** | Gunakan utility yang sudah tersedia. Tambahkan CSS khusus hanya untuk perilaku scroll yang tidak dapat dinyatakan dengan utility saat ini. |

## Urutan implementasi yang disarankan

1. Audit sampel transaksi retail online dan offline pada database Marketplace untuk memastikan nilai `ms_transaction_identifier`, status final, tipe merchant payment, dan timezone.
2. Implementasikan service agregasi serta endpoint `backend-mediacartz`.
3. Verifikasi ranking dengan perhitungan manual pada sampel periode kecil dan pastikan join menu tidak menggandakan kuantitas.
4. Implementasikan endpoint proxy dan mapping public pada `core.loyalty.system`.
5. Tambahkan definisi API dan komponen Produk Terlaris pada `client.loyalty.system`.
6. Verifikasi pergantian toko, klik detail, respons kosong, timeout, layout mobile, dan layout desktop.
7. Jalankan `EXPLAIN`, tambah indeks hanya jika diperlukan, lalu dokumentasikan kontrak final di `API_DOCUMENT.md`.

## Skenario pengujian

- Transaksi retail berhasil terakhir menjadi `period_end`; transaksi pada tujuh hari ke belakang dari waktu tersebut dijumlahkan untuk produk yang sama.
- Transaksi pending, gagal, atau ditolak yang waktunya lebih baru tidak menggeser `period_end`.
- Jika transaksi terakhir sudah lama, hasil tetap memakai periode historis tujuh hari yang berakhir pada transaksi tersebut, bukan tujuh hari dari waktu request.
- Transaksi di luar periode, non-retail, pending, rejected, failed, serta kuantitas nol tidak masuk ranking.
- Penjualan produk yang sama dari beberapa toko perusahaan tergabung berdasarkan `item_id`.
- Urutan menggunakan jumlah unit, lalu gross sales dan `item_id` sebagai tie-break yang stabil.
- Hasil maksimal 8, tidak duplikat, dan respons kosong tetap sukses.
- `store_slug` milik company menampilkan produk yang tersedia pada toko tersebut; slug asing atau tidak valid ditolak.
- Harga, stok, gambar, dan slug sesuai menu toko aktif tanpa query per produk.
- Proxy meneruskan company/store yang benar, memetakan respons, menangani timeout, serta tidak membocorkan detail transaksi.
- Cache proxy terpisah per company/store dan kedaluwarsa sesuai TTL.
- `/product` menampilkan section di bawah tab kategori dalam satu baris horizontal pada mobile dan desktop.
- Swipe, tombol kiri/kanan, keyboard, loading skeleton, empty state, dan gambar fallback bekerja.
- Klik kartu membuka detail produk yang benar serta mempertahankan toko aktif dan konteks kembali katalog.
- Pergantian toko tidak menampilkan data terlaris dari toko sebelumnya.
- Gangguan API best seller tidak menghambat banner, pencarian, kategori, maupun katalog utama.

## Acceptance criteria

1. Marketplace Core menyediakan maksimal 8 produk terlaris retail perusahaan untuk periode 7 hari yang berakhir pada transaksi retail berhasil terakhir, dengan gabungan kanal online dan offline.
2. Hanya transaksi retail yang berhasil yang memengaruhi ranking.
3. Produk pada respons untuk `store_slug` mempunyai menu yang valid di toko tersebut dan dapat dibuka dari loyalty.
4. Loyalty Core menyediakan endpoint proxy public yang tervalidasi, aman, dan tidak melakukan query per produk.
5. Halaman `/product` menampilkan **Produk Terlaris** tepat di bawah tab kategori sebagai baris horizontal yang dapat digeser.
6. Klik produk terlaris membuka detail produk yang tepat.
7. Empty/error/timeout best seller tidak membuat katalog utama gagal atau tidak dapat digunakan.
8. Implementasi tidak mengubah `cms.loyalty.system` atau `frontend-mediacartz-react`.

## Di luar lingkup

- Pengaturan manual produk terlaris dari CMS.
- Bobot ranking berdasarkan margin, rating, click, atau nilai transaksi selain tie-break.
- Periode yang dapat dipilih customer.
- Personalisasi per member.
- Perubahan pada proses checkout, stok, atau pencatatan transaksi.
- Dashboard laporan produk terlaris untuk admin.
