# Issue v2: Produk Terlaris sebagai tab utama katalog loyalty

## Status

Planning / siap diimplementasikan.

## Ringkasan

Ubah penyajian **Produk Terlaris** pada halaman katalog customer dari carousel terpisah menjadi tab pertama pada deretan kategori. Tab virtual **Produk Terlaris** menggantikan tab **SEMUA**, menjadi tab aktif saat halaman dibuka, dan menampilkan daftar best seller menggunakan kartu/list produk yang sama dengan kategori lain. Customer harus dapat membuka detail dan menambah, mengurangi, atau menghapus produk terlaris dari keranjang langsung dari daftar tersebut.

Route katalog yang benar pada codebase saat ini adalah `/product`, walaupun kebutuhan awal menyebut `/products`.

## Struktur repository terkait

| Repository | Peran | Keterlibatan |
| --- | --- | --- |
| `client.loyalty.system` | Frontend loyalty customer | Perubahan utama pada UI, state, dan pemilihan sumber data katalog. |
| `core.loyalty.system` | Backend loyalty / proxy | Penyesuaian kecil response best seller agar kompatibel dengan kartu katalog, terutama rating/review. |
| `backend-mediacartz` | Backend marketplace / `MARKETPLACE_CORE` | Tidak perlu diubah untuk kebutuhan saat ini; hanya diubah bila kontrak best seller harus diperluas. |
| `cms.loyalty.system` | Frontend management loyalty | Di luar lingkup. |
| `frontend-mediacartz` / `frontend-mediacartz-react` | Frontend marketplace | Di luar lingkup. |

## Latar belakang dan kondisi saat ini

Pada halaman `/product`, frontend saat ini:

1. Menambahkan tab virtual `SEMUA` dengan ID `__ALL_CATEGORY__` di depan kategori dari API.
2. Memanggil `GET /api/v1/public/product` untuk tab `SEMUA` maupun kategori nyata.
3. Memanggil `GET /api/v1/public/product/best-sellers` secara terpisah setiap toko aktif berubah.
4. Menampilkan hasil best seller melalui `src/components/ProductBestSeller/index.jsx` sebagai carousel horizontal di bawah tab kategori.
5. Carousel hanya membuka detail produk dan menampilkan jumlah terjual; carousel belum menggunakan kontrol keranjang yang dimiliki kartu katalog biasa.

Endpoint best seller sudah tersedia end-to-end:

- Loyalty Core: `GET /api/v1/public/product/best-sellers` pada `ProductController.publicBestSellers`.
- Marketplace Core: `GET /api/v1/company/slug/:company_slug/product/best-sellers` pada `ProductBestSellerController.getByCompany`.
- Marketplace Core menghitung peringkat tujuh hari, memfilter menu yang tersedia pada toko aktif, dan membatasi hasil maksimal 8 produk.

Karena data dan endpoint utamanya sudah tersedia, issue ini bukan pembuatan ulang algoritma best seller. Fokusnya adalah mengganti cara data tersebut ditempatkan dan digunakan pada katalog.

## Tujuan

1. Menghapus carousel **Produk Terlaris** dari halaman katalog.
2. Menghapus tab virtual `SEMUA` dari tampilan customer.
3. Menambahkan tab virtual **Produk Terlaris** sebagai tab pertama dan tab default.
4. Menampilkan maksimal 8 produk dari endpoint best seller dalam layout daftar yang sama dengan kategori produk.
5. Menyediakan perilaku kartu yang sama: detail produk, harga/diskon, stok, rating, serta aksi keranjang.
6. Menjaga daftar kategori nyata dan alur pencarian, perpindahan toko, login, detail produk, serta pemulihan posisi katalog tetap bekerja.

## Bukan tujuan

- Mengubah rumus, periode tujuh hari, urutan ranking, atau status transaksi yang dihitung sebagai best seller.
- Menampilkan kembali semua produk tanpa kategori melalui tab `SEMUA`.
- Membuat konfigurasi best seller pada CMS.
- Mengubah UI marketplace.
- Menambahkan pagination best seller. Versi saat ini tetap mengikuti kontrak maksimal 8 item.
- Menampilkan jumlah terjual sebagai keharusan. `sold_quantity` tetap boleh dibawa sebagai metadata, tetapi kartu mengikuti desain kategori biasa dan tidak perlu menampilkan label "terjual" kecuali ada keputusan desain lanjutan.

## Keputusan perilaku

### 1. Tab virtual baru

Gunakan konstanta eksplisit, misalnya `BEST_SELLER_TAB_ID = '__BEST_SELLER__'`. Jangan menggunakan kembali nama `ALL_CATEGORY_ID`, karena tab tersebut tidak lagi bermakna "tanpa filter kategori".

Urutan tab:

1. `Produk Terlaris`;
2. seluruh kategori valid dari endpoint kategori, sesuai urutan response saat ini.

`Produk Terlaris` menjadi pilihan awal ketika:

- customer pertama kali membuka `/product`;
- toko aktif diganti;
- context katalog tersimpan tidak ada atau tidak lagi valid.

### 2. Sumber data berdasarkan tab

- Bila tab aktif adalah `Produk Terlaris`, panggil `PUBLIC_PRODUCT_BEST_SELLERS` dengan `store_slug` aktif.
- Bila tab aktif adalah kategori nyata, panggil `PUBLIC_PRODUCT` dengan `store_slug`, `category_display_id`, dan `category_display_name` seperti saat ini.
- Jangan memanggil endpoint best seller pada setiap kunjungan jika tab kategori biasa sedang aktif, kecuali data tersebut memang dibutuhkan ketika customer memilih tab best seller.
- Hasil request yang terlambat dari toko/tab sebelumnya tidak boleh menimpa hasil tab yang sedang aktif.

Gunakan satu state daftar yang menjadi sumber render kartu, atau buat abstraksi `displayedProducts` yang benar-benar dipakai oleh render, cart intent, pencarian, penyimpanan context, dan navigasi detail. Hindari mempertahankan dua jalur render (`products` dan carousel) karena mudah menghasilkan perilaku cart yang berbeda.

### 3. Normalisasi data produk

Normalisasikan response best seller ke bentuk kartu katalog yang sama dengan `mapItemToCard`, minimal:

- `menuId`;
- `itemId`;
- `itemSlug`;
- `itemName`;
- `imageUrl`;
- `regularPrice`;
- `discountMarketplacePrice`;
- `hasMarketplaceDiscount`;
- `currentPrice`;
- `stock` dan `isOutOfStock`;
- `rating` dan `reviewCount`;
- metadata opsional `rank` dan `soldQuantity`.

Sebaiknya ekstrak mapper best seller yang kecil atau perluas mapper yang ada agar aturan fallback gambar, harga, stok, discount, dan review tidak diduplikasi di beberapa tempat.

Urutan best seller harus mengikuti `rank` dari backend. Jangan menjalankan `sortProductsByStock` untuk tab best seller karena produk habis dapat berpindah dan merusak urutan ranking. Untuk kategori biasa, perilaku pengurutan stok yang ada dapat dipertahankan.

### 4. Tampilan dan keranjang

Tab best seller harus dirender oleh kartu/list yang sama dengan kategori biasa, bukan komponen carousel. Semua perilaku berikut harus identik:

- klik kartu/gambar membuka detail;
- harga regular dan harga diskon tampil dengan aturan yang sama;
- status stok habis dan stok menipis sama;
- tombol tambah memasukkan produk berdasarkan `menu_id` toko aktif;
- kontrol kuantitas membaca cart yang sudah ada;
- batas stok, loading per item, login redirect, pending cart intent, toast error, dan sticky checkout tetap bekerja.

Ekstraksi markup kartu menjadi komponen reusable diperbolehkan dan disarankan bila membuat `src/pages/Product/index.jsx` lebih mudah dipahami, tetapi bukan syarat bila implementer dapat memakai satu jalur render tanpa duplikasi.

### 5. Pencarian

Search tetap tersedia pada seluruh tab:

- Pada kategori nyata, pertahankan pencarian server-side yang ada.
- Pada tab best seller, filter nama produk dari maksimal 8 hasil best seller yang sudah diterima. Suggestion dan empty state hanya boleh berasal dari daftar best seller aktif, bukan dari semua produk.
- Bila keyword dibersihkan, tampilkan kembali seluruh hasil best seller dalam urutan ranking semula.
- Perubahan keyword tidak boleh memicu endpoint katalog umum ketika tab best seller aktif.

Keputusan client-side ini cukup untuk kontrak maksimal 8 produk dan menghindari perubahan API hanya untuk pencarian daftar kecil.

### 6. Pagination dan jumlah produk

- Tab best seller tidak memiliki tombol **Tampilkan Lebih Banyak**.
- `totalProducts` pada tab best seller adalah jumlah item valid yang diterima setelah normalisasi, atau jumlah setelah filter ketika pencarian aktif.
- Kategori nyata tetap menggunakan `page`, `last_page`, `total`, dan tombol load more seperti saat ini.
- Saat berpindah tab, reset state pagination agar nilai kategori sebelumnya tidak bocor ke tab best seller atau sebaliknya.
- Copy akhir halaman untuk best seller jangan menyatakan semua katalog sudah dimuat; bila ingin dipertahankan, gunakan teks yang netral seperti `Semua produk terlaris sudah dimuat`.

### 7. Empty state dan kegagalan

- Response best seller sukses tetapi kosong: tampilkan empty state `Belum ada produk terlaris`.
- Search best seller tidak cocok: tampilkan `Produk tidak ditemukan`.
- Request best seller gagal/timeout: jangan mengganti diam-diam dengan semua produk karena makna tab menjadi salah; tampilkan pesan gagal dan berikan mekanisme retry yang konsisten dengan halaman.
- Kegagalan best seller tidak boleh menghilangkan tab kategori nyata atau membuat customer tidak dapat memilih kategori.
- Pergantian toko harus membersihkan daftar toko sebelumnya sebelum request baru selesai.

### 8. Context katalog dan navigasi kembali

`productCatalogContext` harus menyimpan ID tab virtual baru dan daftar produk yang sedang aktif. Saat kembali dari detail atau login:

- tab best seller tetap aktif bila sebelumnya aktif;
- posisi scroll dipulihkan;
- produk dan state cart intent dapat ditemukan dari daftar best seller;
- context lama yang masih menyimpan `__ALL_CATEGORY__` tidak boleh membuat halaman kosong. Perlakukan nilai tersebut sebagai context lama dan fallback ke `BEST_SELLER_TAB_ID`.

## Perubahan per repository

### `client.loyalty.system` — wajib

#### File yang dimodifikasi

| File | Rencana perubahan |
| --- | --- |
| `src/pages/Product/index.jsx` | Ganti tab `SEMUA` dengan tab virtual `Produk Terlaris`; jadikan sebagai default; pilih endpoint berdasarkan tab; satukan normalisasi dan render kartu; hilangkan render carousel; jaga ranking; bedakan pagination, pencarian, loading, total, empty/error state, store switch, cart intent, dan catalog context. |
| `src/utils/productCatalogContext.js` | Kemungkinan perlu penyesuaian hanya bila ada validasi/normalisasi ID tab atau versi context. Tambahkan migrasi ringan dari `__ALL_CATEGORY__` ke ID best seller bila validasi berada di utility ini. |
| `src/App.test.js` atau test UI baru di dekat halaman Product | Tambahkan coverage perilaku utama sesuai skenario pengujian, mengikuti pola test project yang dipilih implementer. |

#### File yang dihapus

| File | Alasan |
| --- | --- |
| `src/components/ProductBestSeller/index.jsx` | Carousel tidak lagi digunakan. Hapus setelah memastikan tidak ada import lain. |

#### File yang kemungkinan tidak perlu diubah

| File | Catatan |
| --- | --- |
| `src/utils/api.js` | `PUBLIC_PRODUCT_BEST_SELLERS` sudah tersedia dan tetap dipakai. |
| `src/components/RootRouter/index.jsx` | Route `/product` tidak berubah. |

#### File baru opsional

| File | Kapan dibuat |
| --- | --- |
| `src/components/ProductCatalogItem/index.jsx` | Jika markup kartu katalog diekstrak agar kategori dan best seller memakai komponen yang sama. Nama/lokasi boleh disesuaikan dengan konvensi project. |
| `src/pages/Product/index.test.jsx` | Jika test halaman dipisah dari `src/App.test.js`. |

### `core.loyalty.system` — wajib untuk parity kartu

#### File yang dimodifikasi

| File | Rencana perubahan |
| --- | --- |
| `app/Controllers/Http/ProductController.js` | Pada `publicBestSellers`, setelah mapping/filter produk upstream, panggil `_appendReviewSummaries` sekali untuk seluruh daftar dan sertakan `review_summary` pada response. Jangan melakukan query per produk. Pertahankan cache upstream, timeout, filter `menu_id`/slug, harga, stok, ranking, dan `sold_quantity`. |
| `API_DOCUMENT.md` | Perbarui contoh/field response best seller dengan `review_summary.average` dan `review_summary.total`; tegaskan maksimum 8 produk dan urutan ranking. |

Route `start/routes/public.js` tidak perlu diubah karena endpoint sudah ada.

Catatan implementasi: mapping sebaiknya diselesaikan dahulu ke variabel daftar, difilter, lalu diproses oleh `_appendReviewSummaries`. Jangan memanggil helper asynchronous langsung di dalam object literal response tanpa memastikan hasilnya sudah di-`await`.

### `backend-mediacartz` — verifikasi, tidak ada perubahan yang direncanakan

File yang perlu dipahami saat implementasi/verifikasi:

| File | Fungsi saat ini |
| --- | --- |
| `app/Services/ProductBestSellerService.js` | Menghitung ranking tujuh hari, memilih menu toko, harga, diskon, stok, dan membatasi maksimal 8 produk. |
| `app/Controllers/Http/ProductBestSellerController.js` | Validasi company/store dan meneruskan `limit`. |
| `start/routes/client.js` | Mendefinisikan route best seller Marketplace Core. |

Jangan mengubah file tersebut hanya karena UI berubah. Perubahan Marketplace Core baru diperlukan bila saat implementasi ditemukan bahwa response tidak membawa `menu_id`, slug, harga aktif, diskon, atau stok yang valid untuk aksi cart. Jika kontrak perlu diperbaiki, pertahankan backward compatibility untuk consumer yang sudah ada.

## Urutan implementasi yang disarankan

1. Perbarui response Loyalty Core agar best seller memiliki `review_summary`, lalu dokumentasikan kontraknya.
2. Tambahkan konstanta tab best seller dan fallback context lama di frontend.
3. Satukan bentuk data best seller dan katalog ke model kartu frontend.
4. Ubah loader agar endpoint dipilih berdasarkan tab aktif dan request lama tidak menyebabkan race condition.
5. Render best seller melalui daftar/kartu katalog dan aktifkan seluruh kontrol cart.
6. Terapkan aturan search, pagination, total, loading, empty/error state, dan pergantian toko.
7. Hapus import/render carousel, kemudian hapus komponen `ProductBestSeller`.
8. Jalankan pengujian dan cek manual pada viewport mobile yang menjadi target utama UI sekarang.

## Skenario pengujian

Detail teknis test diserahkan kepada implementer. Minimal cakup skenario berikut:

### Tab dan data

- Halaman baru membuka tab `Produk Terlaris`, tanpa tab `SEMUA` dan tanpa carousel.
- Tab best seller menampilkan maksimal 8 produk dalam urutan ranking backend.
- Memilih kategori memuat produk kategori; kembali ke best seller memuat/menampilkan data best seller.
- Daftar best seller kosong, gagal, dan timeout menghasilkan state yang tepat tanpa merusak tab kategori.
- Response yang selesai terlambat setelah perpindahan tab/toko tidak menimpa daftar aktif.

### Tampilan produk

- Produk best seller menampilkan gambar/fallback, nama, harga normal/diskon, rating, dan stok seperti kategori biasa.
- Produk habis tidak dapat ditambahkan; stok rendah dan batas maksimum kuantitas tetap benar.
- Ranking tidak berubah karena pengurutan berdasarkan stok.

### Keranjang dan autentikasi

- Customer login dapat menambah, mengurangi, dan menghapus best seller dari katalog.
- Kuantitas pada kartu sinkron dengan cart dan sticky checkout.
- Guest yang menambah produk diarahkan login, lalu pending cart intent diteruskan setelah kembali.
- Klik best seller membuka detail yang benar berdasarkan slug/menu ID.

### Pencarian, pagination, dan context

- Search pada best seller hanya memfilter daftar best seller dan mengembalikan urutan semula setelah keyword dibersihkan.
- Search kategori dan suggestion tetap bekerja seperti sebelumnya.
- Best seller tidak menampilkan load more; kategori tetap dapat load more.
- Kembali dari detail memulihkan tab, produk, dan scroll.
- Context lama dengan `__ALL_CATEGORY__` fallback ke tab best seller tanpa error.

### Multi-store dan regresi

- Ganti toko mengosongkan data lama, mengaktifkan tab best seller, dan mengambil ranking untuk toko baru.
- Produk kategori, promo banner, detail produk, cart kategori, serta checkout tidak mengalami regresi.
- API best seller tetap mengembalikan maksimal 8 item beserta harga, stok, ranking, jumlah terjual, dan ringkasan review.

## Acceptance criteria

- [ ] Tab `SEMUA` tidak lagi tampil pada `/product`.
- [ ] Tab pertama dan default bernama `Produk Terlaris`.
- [ ] Carousel/section best seller lama sudah tidak dirender dan komponen yang tidak terpakai sudah dihapus.
- [ ] Tab best seller menggunakan data endpoint best seller yang ada, bukan data semua produk.
- [ ] Best seller tampil dengan kartu/list dan aksi cart yang sama dengan kategori lain.
- [ ] Urutan ranking backend dipertahankan dan jumlah item maksimal 8.
- [ ] Harga, diskon, stok, rating/review, detail navigation, dan cart menggunakan identitas `menu_id` yang benar.
- [ ] Search, empty/error/loading state, pergantian toko, pending cart intent, dan catalog context bekerja pada tab best seller.
- [ ] Tab kategori nyata, pencarian kategori, dan load more tetap berfungsi.
- [ ] Carousel tidak menyisakan import, state, effect, atau request ganda yang tidak diperlukan.
- [ ] Dokumentasi API diperbarui bila response `review_summary` ditambahkan.
- [ ] Tidak ada perubahan pada CMS atau frontend marketplace.

## Catatan untuk implementer

Sebelum menambah endpoint atau mengubah query Marketplace Core, verifikasi kembali response aktual dari ketiga lapisan. Implementasi yang diharapkan cukup memakai endpoint best seller yang sudah ada, memperkaya review summary di proxy, dan merapikan orchestration di frontend. Hindari membuat jalur cart khusus best seller; tujuan utama issue ini justru memastikan satu kartu dan satu alur interaksi dipakai oleh semua tab.
