# Issue v2: Banner promo katalog dan pengelolaan promo CMS Loyalty

## Sumber dan tujuan

Issue ini menerjemahkan bagian **3. Banner promo pada tab Semua di halaman produk** dan **4. Pengaturan promo melalui CMS Loyalty** dari [NOTULENSI_EVALUASI_MARKETPLACE.md](NOTULENSI_EVALUASI_MARKETPLACE.md).

Bangun pengelolaan promo/banner yang sumber datanya berada di `core.loyalty.system`, dikelola melalui `cms.loyalty.system`, dan ditampilkan pada `client.loyalty.system`.

Perubahan hanya mencakup:

1. `core.loyalty.system`: API, database, validasi, otorisasi, dan audit promo.
2. `client.loyalty.system`: pengambilan dan tampilan banner pada katalog produk.
3. `cms.loyalty.system`: menu dan halaman pengelolaan promo.

`backend-mediacartz` dan `frontend-mediacartz` tidak menjadi sumber banner ini. Fitur iklan toko pada marketplace tidak dipakai.

## Perilaku produk yang harus dicapai

### Customer di halaman `/product`

1. Banner promo ditempatkan **sebelum field “Cari produk”**, setelah informasi toko aktif dan tombol **Ganti Toko**. Lokasi ini berlaku untuk desain desktop maupun mobile.
2. Banner tidak diletakkan di dalam tab kategori **SEMUA**, berbeda dari lokasi awal yang tertulis pada notulensi.
3. Banner tetap berada di halaman saat pengguna mengganti kategori. Banner bukan bagian dari hasil query produk atau kategori.
4. API hanya mengirim banner dengan status aktif, waktu server berada di dalam periode tayang, dan cakupan partner/perusahaan sesuai customer yang sedang membuka aplikasi.
5. Jika tidak ada banner aktif, banner gagal dimuat, atau gambar gagal dimuat, pencarian dan katalog produk tetap dapat dipakai tanpa ruang kosong besar maupun error toast berulang.
6. Banner dapat memiliki salah satu tujuan berikut:
   - **Produk**: buka `/product/:item_slug` dan bawa `item_id` bila tersedia. Produk harus relevan dengan toko aktif; jika produk tidak tersedia, tampilkan pesan yang jelas dan jangan membuka detail yang salah.
   - **URL internal**: hanya path aplikasi yang diizinkan, misalnya `/voucher`.
   - **URL eksternal**: buka URL `https` yang telah divalidasi, pada tab baru dengan pengamanan `noopener,noreferrer`.
   - **Tanpa tujuan**: banner tidak dapat ditekan.
7. Tampilkan banner sesuai `display_order` menaik. Jika desain memakai carousel, urutan tersebut adalah urutan slide; jika hanya satu banner, jangan menampilkan kontrol carousel.
8. Jangan menggunakan [src/jsons/banners.js](D:/eis/client.loyalty.system/src/jsons/banners.js) atau aset banner statis sebagai sumber banner katalog baru. Komponen [src/components/Carousel/index.jsx](D:/eis/client.loyalty.system/src/components/Carousel/index.jsx) dapat dipakai ulang hanya setelah diubah agar menerima data API dan menangani loading, kosong, klik, serta aksesibilitas.

### Admin dan partner di CMS

1. Tambah menu sidebar **Promo Banner** dengan pola navigasi, tabel, filter, dan notifikasi yang konsisten dengan menu Voucher.
2. Halaman daftar menampilkan thumbnail, judul, status, periode tayang, urutan, cakupan, tujuan, pembuat/pengubah terakhir, dan aksi lihat/ubah. Sediakan pencarian judul, filter status, cakupan partner, serta filter periode tayang.
3. Halaman tambah/ubah memakai form yang jelas dan dikelompokkan:
   - informasi utama: judul dan gambar banner;
   - jadwal: waktu mulai dan selesai, menggunakan timezone yang disepakati aplikasi;
   - penayangan: status dan urutan;
   - cakupan: semua partner/perusahaan atau partner tertentu;
   - tujuan: tipe tujuan dan input yang berubah sesuai tipe.
4. Preview gambar dan preview banner dalam proporsi customer wajib tersedia sebelum simpan. Tampilkan ukuran/format file yang diterima dan kesalahan validasi di dekat field terkait.
5. Pilihan tujuan produk harus mencari data melalui API, lalu menyimpan minimal `item_id` dan `item_slug` yang dipilih. Jangan meminta admin menulis ID produk manual.
6. Admin pusat dapat mengelola promo seluruh partner. Admin/partner terbatas hanya melihat dan mengubah promo dalam cakupan partner yang dimilikinya. Aturan otorisasi mengikuti pola `HasPartner` dan otorisasi voucher yang sudah ada.
7. Halaman detail menampilkan data lengkap, preview, riwayat pembuat/perubahan, dan status efektif saat ini: draft/nonaktif, akan tayang, sedang tayang, atau berakhir.

## Model data dan aturan validasi

Gunakan satu tabel utama, misalnya `promo_banners`. Nama final boleh menyesuaikan konvensi proyek, tetapi jangan memakai tabel banner lama yang tidak ditemukan/berbeda domain.

| Kolom | Aturan |
| --- | --- |
| `promo_banner_id` | Primary key. |
| `title` | Wajib, teks pendek, dapat dicari. |
| `image_url` | Wajib; URL hasil unggah gambar tervalidasi. |
| `status` | Minimal `active` dan `inactive`; status efektif tetap memperhitungkan periode. |
| `start_at`, `end_at` | Wajib; `end_at` harus lebih besar dari `start_at`. Simpan dengan timezone/format database yang konsisten. |
| `display_order` | Bilangan bulat non-negatif; nilai lebih kecil tampil lebih dahulu. Tetapkan perilaku yang jelas untuk nilai sama, misalnya `promo_banner_id` menaik. |
| `scope_type` | Misalnya `all` atau `partner`. |
| `partner_id` | Nullable untuk `all`; wajib untuk `partner`; foreign key/index sesuai pola partner yang ada. |
| `target_type` | `none`, `product`, `internal_url`, atau `external_url`. |
| `target_item_id`, `target_item_slug` | Wajib untuk target produk; nullable untuk tipe lain. |
| `target_url` | Wajib untuk target URL; nullable untuk tipe lain. |
| audit | `created_by`, `updated_by`, timestamps. Gunakan tipe/relasi yang konsisten dengan data admin yang telah ada. |

Validasi tambahan:

- Gambar: tetapkan format raster yang didukung, batas ukuran file, dimensi/rekomendasi rasio banner, serta proses penggantian gambar lama yang aman.
- URL eksternal hanya `https`; tolak `javascript:`, `data:`, URL relatif pada tipe eksternal, dan host yang tidak sesuai kebijakan bila allowlist digunakan.
- URL internal harus diawali `/`, tanpa host/protokol, dan harus berada dalam daftar route customer yang diizinkan.
- Target produk harus diverifikasi terhadap data marketplace melalui proxy. Saat data produk tidak lagi tersedia, promo tidak boleh menghasilkan navigasi detail yang salah.
- Promo scope partner harus mempunyai `partner_id` yang valid; jangan percaya ID partner dari request CMS sebelum lolos otorisasi.

## Kontrak API yang disarankan

### API public customer

`GET /api/v1/public/promo-banners`

- Parameter opsional: konteks partner/perusahaan bila belum dapat ditentukan dari konfigurasi loyalty.
- Tidak memerlukan autentikasi.
- Mengembalikan hanya data yang siap tayang dan aman untuk browser: ID, judul, URL gambar, urutan, serta target yang sudah dinormalisasi.
- Filter di backend: `status=active`, `start_at <= now < end_at`, cakupan partner/perusahaan, dan urutan.
- Jangan mengirim data audit, status internal, atau URL unggah sementara.
- Respons kosong adalah respons sukses dengan array kosong.

Route lama `GET /api/v1/public/banners` sudah terdaftar pada `start/routes/public.js`, tetapi controller/modelnya tidak ada pada repository saat ini. Saat implementasi, pilih satu nama route publik yang konsisten. Jika tetap memakai `/banners`, implementasikan route tersebut dengan kontrak baru dan dokumentasikan penggantian perilakunya; jangan membuat dua API dengan sumber data yang berbeda.

### API admin CMS

Gunakan pola route voucher (`/api/v1/admin/vouchers`) sebagai acuan, misalnya:

- `GET /api/v1/admin/promo-banners` — daftar terfilter dan terpaginate.
- `GET /api/v1/admin/promo-banners/get?promo_banner_id=...` — detail.
- `POST /api/v1/admin/promo-banners` — buat.
- `PUT /api/v1/admin/promo-banners?promo_banner_id=...` — ubah.
- `POST /api/v1/admin/promo-banners/image` — unggah gambar, bila unggah dipisahkan dari form.

Gunakan respons `{ status, message, data }` yang sama dengan endpoint CMS yang ada. Jangan membuat endpoint publish terpisah jika `status`, periode, dan validasi form sudah cukup untuk mengendalikan tayang.

## Rencana perubahan per repository

### `core.loyalty.system`

| File | Perubahan |
| --- | --- |
| `database/migrations/<timestamp>_promo_banner_schema.js` **(baru)** | Buat tabel `promo_banners`, indeks untuk status/periode/scope/partner/urutan, foreign key bila sesuai pola database, dan `down()` yang membatalkan migrasi. |
| `app/Models/PromoBanner.js` **(baru)** | Model, primary key, fillable/hidden yang diperlukan, dan relasi partner atau pengguna pembuat/pengubah. |
| `app/Controllers/Http/PromoBannerController.js` **(baru)** | CRUD admin, upload gambar bila diperlukan, filter/pagination, validasi otorisasi, dan audit. |
| `app/Controllers/Http/PromoBannerPublicController.js` **(baru)** atau aksi public pada controller yang sama | Query banner aktif berdasarkan waktu dan scope, lalu normalisasi target untuk frontend. |
| `app/Validators/PromoBanner.js` **(baru)** | Validasi create/update termasuk aturan kondisional target dan jadwal. Tambah validator upload terpisah bila diperlukan. |
| `app/Services/PromoBannerService.js` **(baru, disarankan)** | Pusatkan perhitungan status efektif, scope, sorting, validasi target produk, dan pemetaan respons public agar aturan admin/public tidak terduplikasi. |
| `start/routes/public.js` | Implementasi/penyesuaian route banner publik yang sudah terdaftar. |
| `start/routes/promo_banner.js` **(baru)** dan `start/routes/index.js` | Daftarkan CRUD admin dengan `auth:jwt`, validator, dan middleware hak partner. Alternatif: tambah route ke `start/routes/voucher.js` hanya jika konsisten dan file tidak menjadi terlalu luas. |
| layanan/file upload yang sudah ada | Audit mekanisme upload voucher/gambar dan pakai kembali penyimpanan yang sama bila sesuai. Jangan menyimpan base64 gambar dalam tabel. |

### `client.loyalty.system`

| File | Perubahan |
| --- | --- |
| `src/utils/api.js` | Tambah definisi endpoint promo banner public. |
| `src/pages/Product/index.jsx` | Muat banner secara independen dari katalog, tampilkan sebelum search, tangani loading/kosong/error, klik target, dan bersihkan request lama saat konteks partner/toko berubah. Jangan mengikat banner pada `activeCategoryId`. |
| `src/components/PromoBannerCarousel/index.jsx` **(baru, disarankan)** | Carousel responsif dan aksesibel yang menerima data API; tombol next/previous, indikator, autoplay yang dapat dihentikan, fallback gambar, serta satu-banner mode. Alternatif: refactor `src/components/Carousel/index.jsx` secara aman. |
| `src/utils/promoBannerTarget.js` **(baru, disarankan)** | Normalisasi dan validasi ringan target browser agar logika klik tidak tercampur dalam UI. Validasi keamanan utama tetap di backend. |
| `src/jsons/banners.js` dan `src/components/Carousel/index.jsx` | Hapus dari alur katalog atau refactor. Jangan menampilkan banner hardcoded bersamaan dengan promo API. |
| `src/context/StoreContext.jsx` **(audit)** | Bila scope promo bergantung pada partner atau toko aktif, sediakan konteks yang diperlukan dan lakukan reload banner dengan aman tanpa menampilkan hasil request lama. |

### `cms.loyalty.system`

| File | Perubahan |
| --- | --- |
| `src/pages/PromoBanner/PromoBanner.tsx` **(baru)** | Halaman daftar profesional: header, tombol tambah, filter, tabel/kartu responsif, status efektif, pagination, empty/loading/error state. Gunakan `Voucher.tsx` sebagai pola. |
| `src/pages/PromoBanner/PromoBannerForm.tsx` **(baru)** | Form tambah/ubah dengan preview gambar, picker tanggal-waktu, partner selector, target selector, validasi field, dan submit state. Gunakan `VoucherForm.tsx` sebagai pola. |
| `src/pages/PromoBanner/PromoBannerDetail.tsx` **(baru)** | Detail readonly, preview, metadata audit, dan aksi edit sesuai izin. Gunakan `VoucherDetail.tsx` sebagai pola. |
| `src/routes/index.ts` | Lazy import dan route daftar/tambah/detail/ubah untuk menu promo. |
| `src/layout/DefaultLayout.tsx` atau sumber data sidebar yang dipakai | Tambah menu **Promo Banner**, ikon yang relevan, dan pemeriksaan izin. |
| `src/services/Request.tsx` | Audit konfigurasi request upload `multipart/form-data` agar dapat digunakan form promo. Tambah helper hanya jika belum tersedia. |
| tipe baru di `src/types/` **(disarankan)** | Definisikan `PromoBanner`, target, scope, dan bentuk pagination agar halaman tidak menggunakan `any`. |

## Urutan implementasi

1. Sepakati nama route public dan admin, tipe scope, aturan target URL, rasio gambar, serta timezone.
2. Implementasi migrasi, model, service, validator, dan CRUD admin pada core loyalty.
3. Implementasi query public yang hanya memberi promo efektif; uji dengan waktu server dan scope partner.
4. Buat route dan UI CMS daftar, form, detail, upload/preview gambar, serta kontrol izin.
5. Tambahkan komponen banner API di `/product` sebelum search; integrasikan klik target produk berbasis `item_id` dan URL slug.
6. Audit responsif, gambar gagal, promo kedaluwarsa, partner terbatas, dan data lama sebelum rilis.

## Skenario pengujian

- Admin berwenang dapat membuat, mengubah, melihat, memfilter, dan menonaktifkan promo; partner terbatas tidak dapat mengakses atau mengubah promo partner lain.
- Form menolak periode terbalik, gambar tidak valid, `partner_id` yang tidak diizinkan, URL berbahaya, dan target produk yang tidak ditemukan.
- Banner aktif dalam periode tampil sesuai urutan; banner nonaktif, belum mulai, berakhir, atau di luar scope tidak dikirim oleh API public.
- `/product` menampilkan banner sebelum search pada desktop dan mobile; katalog, pencarian, kategori, dan pilihan toko tetap berfungsi saat banner ada maupun kosong.
- Banner produk membuka item yang tepat dalam konteks toko aktif; URL internal dan eksternal mengikuti aturan target; banner tanpa target tidak dapat diklik.
- Kegagalan API banner, gambar gagal dimuat, serta respons lambat tidak menghambat pemuatan katalog produk.
- Pergantian partner/toko tidak menampilkan banner dari request lama atau scope yang salah.
- Data audit mencatat pembuat dan perubahan promo; status efektif yang tampil di CMS sesuai waktu server.

## Kriteria penerimaan

- Admin/partner yang berhak dapat mengelola promo dari menu CMS baru.
- Customer melihat hanya promo yang berlaku dan banner berada di `/product` sebelum pencarian.
- Banner tidak lagi bergantung pada file statis frontend atau iklan native marketplace.
- Tidak adanya promo atau kegagalan banner tidak membuat katalog produk gagal digunakan.
- Validasi scope, periode, target, dan hak akses dilakukan di backend, bukan hanya pada UI CMS.
