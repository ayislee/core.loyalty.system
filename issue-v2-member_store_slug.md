# Issue v2: katalog berdasarkan toko aktif dan preferensi toko member

## Konteks dan tujuan

Saat ini halaman `/product` sebelum login mengambil katalog tingkat perusahaan. Produk yang sama dapat mewakili beberapa toko dan stoknya diakumulasi. Ubah katalog agar selalu menampilkan produk dan stok dari **satu toko aktif**. Identitas produk tetap `item_id`; `store_slug` menentukan toko tempat item tersebut tersedia. Nama toko, bukan slug, tampil di antarmuka.

Lingkup implementasi: `core.loyalty.system` dan `client.loyalty.system`; ubah `backend-mediacartz` hanya jika endpoint toko/menu yang tersedia belum memenuhi kontrak di bawah. `cms.loyalty.system` dan `frontend-mediacartz` di luar lingkup.

## Perilaku yang harus dicapai

1. Konfigurasi `DEFAULT_STORE_SLUG` berada di `.env` **core.loyalty.system** dan dicontohkan di `.env.example`. Nilainya wajib menunjuk toko yang ada dalam daftar toko perusahaan dari `DEFAULT_COMPANY_SLUG`. Validasi konfigurasi saat dipakai; jangan diam-diam kembali ke katalog gabungan jika toko bawaan tidak valid atau layanan marketplace gagal.
2. Pengunjung tanpa login memulai dari toko bawaan. Pilihan toko pengunjung disimpan di browser agar tidak hilang saat pindah halaman atau refresh. Pilihan pengunjung dibatasi pada daftar toko yang valid; jika tidak valid lagi, kembali ke toko bawaan.
3. Di halaman `/product`, tampilkan **nama toko aktif** di kiri atas, sebelum field pencarian. Tombol **Ganti Toko** berada di kanan atas, sebelum field pencarian. Tombol membuka popup daftar toko; memilih toko menutup popup, memperbarui nama toko, dan memuat ulang katalog toko tersebut.
4. Toko aktif dikelola di state tingkat aplikasi, bukan state lokal halaman produk. Navigasi ke halaman lain dan kembali tidak mengubah pilihan toko. Saat pilihan berubah, hapus hasil katalog, saran pencarian, kategori/paginasi, dan konteks katalog tersimpan milik toko sebelumnya supaya data lama tidak muncul sesaat atau terpakai ulang.
5. Semua permintaan katalog, pencarian, saran pencarian, cek kategori berisi produk, dan detail yang relevan harus memakai toko aktif. Produk yang tidak mempunyai menu di toko tersebut tidak boleh muncul; jumlah/stok/harga berasal dari menu toko tersebut, bukan agregasi lintas toko. `item_id` tetap dipakai untuk kartu, ulasan, keranjang, dan transaksi.
6. Tambah kolom nullable `members.default_store_slug` sebagai `VARCHAR(255)` melalui migrasi baru. Pada login member: jika null/kosong, simpan `DEFAULT_STORE_SLUG`; jika berisi slug yang masih ada pada daftar toko yang diizinkan, gunakan slug itu; jika tidak ada, ubah kolom tersebut ke slug bawaan. Setelah login sukses, toko aktif di frontend mengikuti nilai hasil validasi dari backend. Pilihan toko sebelum login tidak menimpa preferensi member yang sudah tersimpan.
7. Saat member memilih toko lain, kirim ke endpoint terautentikasi untuk memvalidasi dan menyimpan `members.default_store_slug`. Ubah state frontend hanya setelah penyimpanan berhasil; tampilkan error bila gagal. Preferensi berlaku lintas sesi/perangkat setelah login ulang. Jangan menerima `default_store_slug` melalui pembaruan profil umum tanpa validasi.
8. Saat logout, lepaskan preferensi member dari state lokal dan kembali ke pilihan pengunjung yang masih valid, atau toko bawaan. Pastikan pergantian akun tidak menampilkan katalog atau preferensi akun sebelumnya.

## Kontrak backend yang disarankan

- `GET /api/v1/public/store` sudah tersedia dan mengambil daftar toko dari `company/slug/{company_slug}/store`. Gunakan daftar ini sebagai sumber validasi serta pasangan `store_slug`/`store_name`; normalisasi bentuk respons bila perlu. Sediakan cara frontend mendapatkan toko bawaan dari backend, misalnya field `default_store_slug` pada respons daftar toko. Jangan menyalin nilai `.env` backend ke build frontend.
- `GET /api/v1/public/product`: bila `store_slug` tidak dikirim, gunakan `DEFAULT_STORE_SLUG`; bila dikirim, validasi bahwa slug ada dalam daftar toko perusahaan yang diizinkan. Panggil `store/slug/{store_slug}/menu` dengan filter yang ada (`item_id`, kategori, kata kunci, `page`, `rows`). Hapus jalur fallback `company/slug/{company_slug}/item` dari alur katalog ini. Slug tak dikenal harus menghasilkan respons gagal yang jelas, bukan katalog perusahaan. Jumlah halaman dan total harus mencerminkan hasil toko tersebut.
- `GET /api/v1/member/product`: selaraskan sumber toko dengan `members.default_store_slug` atau parameter toko aktif yang tervalidasi; endpoint ini kini memakai `partner.store_slug`, sehingga jangan biarkan dua sumber pilihan toko saling bertentangan. Pertahankan `default_partner_id` untuk identitas/otorisasi partner; jangan mengubahnya saat mengganti toko.
- Buat endpoint terautentikasi khusus, misalnya `PUT /api/v1/member/default-store`, body `{ "store_slug": "..." }`, hasil memuat `store_slug` dan `store_name`. Tolak slug kosong, tidak ada, di luar perusahaan, atau toko yang tidak layak ditampilkan. Simpan hanya pada member yang sedang login.
- Login OTP member pada `Auth/AuthController.login_token` harus memvalidasi dan menyimpan preferensi sebelum membuat respons sukses, lalu mengembalikan `default_store_slug` yang sudah benar. Cek juga jalur login/autentikasi member lain yang benar-benar dipakai; `user_login` adalah alur `User`, jangan mengubahnya seolah-olah login member.
- `GET /api/v1/member/profile` dapat mengembalikan `default_store_slug` agar state dapat dipulihkan setelah refresh. Respons toko untuk UI perlu menyediakan `store_name` yang sesuai slug aktif.
- Pertahankan sanitasi data toko internal pada respons produk yang sudah ada. Jangan menggunakan agregasi stok lintas menu setelah memanggil endpoint menu per toko; periksa fungsi `_aggregateProductAvailability` dan bentuk data upstream.

## Rencana implementasi dan file

### `core.loyalty.system`

| File | Perubahan |
| --- | --- |
| `.env.example` dan `.env` deployment | Tambah `DEFAULT_STORE_SLUG`; isi nilai nyata per lingkungan. Hindari memasukkan rahasia `.env` ke commit. |
| `database/migrations/<timestamp>_add_default_store_slug_to_members_schema.js` **(baru)** | Tambah kolom nullable string panjang 255, dengan `down()` yang membatalkannya. Jangan mengedit migrasi lama `1690430163951_member_schema.js`. |
| `app/Controllers/Http/ProductController.js` | Validasi daftar toko; default toko; katalog per menu toko; kesesuaian endpoint public/member; respons nama toko. Periksa `publicProductDetail` dan `get` untuk akses produk lintas toko. |
| `app/Controllers/Http/Auth/AuthController.js` | Resolusi preferensi toko saat login member, tanpa mengubah konsep partner. |
| `app/Controllers/Http/MemberController.js` | Tambah aksi update toko khusus dan pastikan profil memuat slug yang tersimpan. |
| `start/routes/member.js` | Daftarkan route update toko yang membutuhkan auth. |
| `app/Services/MemberStoreService.js` **(opsional, baru)** | Pusatkan pemuatan daftar toko, validasi slug, dan fallback agar login, katalog, serta update memakai aturan yang sama. |
| Validator baru di `app/Validators/` **(opsional)** | Validasi bentuk body update toko sebelum mengecek keberadaan toko di marketplace. |

### `client.loyalty.system`

| File | Perubahan |
| --- | --- |
| `src/context/StoreContext.jsx` **(baru; nama bebas)** dan entry/provider di `src/index.js` atau `src/components/RootRouter/index.jsx` | State toko global, inisialisasi daftar toko dan default backend, persistensi pilihan guest, sinkronisasi login/logout, status loading/error. |
| `src/pages/Product/index.jsx` | Header nama toko + tombol/popup, kirim `store_slug` ke katalog dan cek kategori, reset data saat toko berubah, hindari respons request lama menimpa toko baru. |
| `src/utils/api.js` | Tambah definisi endpoint update preferensi; gunakan endpoint public store yang sudah ada. |
| `src/pages/Login/index.jsx` dan `src/utils/AuthSession/index.js` | Setelah login, gunakan `default_store_slug` hasil backend; perbarui state pada logout/pergantian akun. |
| `src/utils/productCatalogContext.js` dan `src/components/Navigation/Navbar.jsx` | Sertakan `store_slug` dalam konteks katalog atau invalidasi konteks ketika toko berbeda. |
| `src/pages/ProductDetail/index.jsx` | Pastikan detail memakai toko aktif dan pilihan stok/keranjang tidak otomatis berpindah ke toko lain. |
| `src/pages/Cart/index.jsx`, `src/pages/Order/index.jsx`, `src/pages/PreOrder/index.jsx` | Audit interaksi pilihan toko dengan keranjang dan checkout yang sudah menyimpan `store_slug`; jangan mengubah item toko lama secara diam-diam. Tampilkan penanganan jelas jika keranjang lintas toko tidak didukung. |

### `backend-mediacartz` — hanya bila diperlukan

Endpoint `company/slug/{company}/store` dan `store/slug/{store}/menu` sudah dipakai proxy. Audit `app/Controllers/Http/StoreController.js`, `app/Controllers/Http/MenuController.js`, `app/Services/MenuService.js`, dan route terkait jika filter, pagination, status toko, stok, atau harga per toko belum benar. Tambahkan perubahan di sana hanya setelah kekurangan kontrak terbukti; catat alasan pada PR.

## Urutan kerja

1. Tetapkan kontrak daftar toko dan default; verifikasi slug bawaan ada di perusahaan yang benar.
2. Buat migrasi dan logika validasi/preferensi backend; hubungkan login, profil, dan endpoint update.
3. Ubah katalog proxy agar selalu memakai menu satu toko; audit detail dan respons stok/pagination.
4. Tambah state global frontend, sinkronisasi guest/member, lalu UI popup dan pemuatan ulang katalog.
5. Audit keranjang/checkout dan lakukan pengujian skenario di bawah.

## Skenario pengujian dan kriteria penerimaan

- Guest pertama kali membuka `/product`: nama toko bawaan tampil; hanya item dan stok toko itu terlihat; total/paginasi bukan total semua toko.
- Guest mengganti toko: popup menutup, nama berubah, item/stok/kategori/pencarian mengikuti toko baru; pilihan tetap saat pindah halaman, refresh, dan kembali dari detail.
- Respons katalog toko lama yang datang terlambat tidak menimpa katalog toko baru; konteks katalog tersimpan tidak memulihkan produk toko lain.
- Member dengan `default_store_slug` null login: kolom terisi slug bawaan, respons login dan UI cocok. Member dengan slug valid memakai toko tersimpan; slug yang dihapus/tidak valid diperbaiki ke default.
- Member mengganti toko: database berubah dan pilihan bertahan setelah refresh, logout/login ulang, serta perangkat lain. Slug tidak valid ditolak tanpa mengubah database atau UI.
- Login saat guest sudah memilih toko berbeda memakai preferensi member; logout/pergantian akun tidak membocorkan pilihan akun sebelumnya.
- Detail produk, penambahan keranjang, dan checkout memakai `item_id` dan toko yang tepat; item yang tidak tersedia di toko aktif tidak ditawarkan seolah tersedia.
- Kegagalan layanan daftar toko atau konfigurasi default yang salah menampilkan kegagalan yang jelas, tanpa jatuh ke katalog gabungan.

## Catatan keputusan implementasi

Aturan toko yang layak dipilih perlu konsisten di seluruh endpoint (minimal toko dalam perusahaan default; hormati status aktif/loyalty bila tersedia). Jika toko bawaan tidak valid, perlakukan sebagai kesalahan konfigurasi sampai diperbaiki, bukan memilih toko acak. Saat mengganti toko dengan keranjang berisi item, tetapkan perilaku yang eksplisit di UI sesuai aturan checkout satu toko yang sudah ada; jangan menghapus atau memindahkan keranjang tanpa pemberitahuan.
