# Issue: Cart V2 — keranjang terikat toko dan checkout langsung dari katalog

## Status

- Jenis: perencanaan lintas aplikasi
- Prioritas: tinggi
- Target implementasi: junior programmer atau AI model berbiaya lebih rendah
- Referensi UI: `docs/img/page_product.png`

## Ringkasan

Cart V2 memindahkan interaksi keranjang ke halaman katalog `/product`. Setiap item cart harus terikat pada menu dan toko yang sedang dipilih pengguna. Dengan demikian pengguna mengetahui toko tempat bertransaksi sejak memilih produk, sedangkan checkout tidak lagi mencari atau mengganti toko secara otomatis.

“Langsung checkout” pada dokumen ini berarti **tidak melakukan pemilihan toko ulang**. Backend tetap wajib memvalidasi toko, menu, harga, stok, dan layanan pengiriman sebelum membuat transaksi agar pesanan tidak menggunakan data usang atau data hasil manipulasi client.

## Struktur repository

| Folder | Peran | Dalam scope |
|---|---|---|
| `core.loyalty.system` | Backend loyalty/proxy | Ya |
| `client.loyalty.system` | Frontend loyalty customer | Ya |
| `backend-mediacartz` | Backend marketplace / `MARKETPLACE_CORE` | Jika endpoint yang tersedia belum cukup efisien |
| `cms.loyalty.system` | Frontend management loyalty | Tidak |
| `frontend-mediacartz-react` | Frontend marketplace | Tidak |

## Latar belakang dan masalah saat ini

1. `/product` sudah meminta katalog berdasarkan `store_slug`, tetapi penambahan cart saat ini terutama dilakukan dari `/product/:item_slug`.
2. Tabel `carts` mempunyai kolom lama `partner_id`, `store_slug`, dan `store_name`, serta migrasi baru `menu_id`, tetapi `CartController` belum menjadikan data toko sebagai konteks wajib.
3. `CartController.list()` dan `CartController.get()` saat ini justru menghapus `store_slug` dan `store_name` dari respons.
4. Identitas duplikat cart masih dicari hanya berdasarkan `menu_id` atau fallback `item_id`; belum mempertimbangkan toko dan partner.
5. Harga dan stok pada daftar cart dicari dari produk/item lalu memilih menu representatif. Cara ini dapat mengambil menu dari toko yang berbeda.
6. `CheckoutController.quote()` dan `commit()` memanggil `MarketplaceFulfillmentService.selectStore()`. Service tersebut mencari beberapa toko, menghitung jarak, mengecek stok, lalu memilih kandidat terdekat. Akibatnya toko saat checkout dapat berbeda dari toko yang dipahami pengguna saat melihat katalog.
7. Pengguna baru mengetahui kegagalan stok/jarak menjelang checkout, walaupun sebelumnya sudah memasukkan produk ke keranjang.

## Tujuan

1. Produk di katalog dipastikan berasal dari toko aktif yang dipilih pengguna.
2. Pengguna dapat menambah, mengurangi, atau menghapus cart langsung di `/product`.
3. Cart menyimpan identitas menu, partner, company, dan toko yang telah diverifikasi backend.
4. Ringkasan cart dan tombol checkout selalu terlihat pada bagian bawah katalog ketika cart berisi item.
5. Checkout memakai toko yang sudah terikat pada cart dan tidak memilih toko pengganti secara diam-diam.
6. Perubahan stok atau harga tetap ditangani secara transparan sebelum pembayaran.
7. Halaman cart terpisah tidak lagi ditampilkan; seluruh pengelolaan cart dilakukan dari `/product`.
8. Sesi login client tetap dikenali ketika aplikasi ditutup dan dibuka kembali pada hari berikutnya, selama sesi belum kedaluwarsa atau dicabut.

## Bukan tujuan

- Membuat transaksi yang menggabungkan beberapa toko dalam satu checkout.
- Mengubah aturan diskon offline atau harga kasir toko.
- Menghapus validasi stok, harga, alamat, atau layanan pengiriman.
- Mengubah CMS loyalty atau frontend marketplace.
- Menyimpan cart guest tanpa login, kecuali ada requirement terpisah.

## Keputusan desain wajib

### 1. Cart disimpan per toko, checkout tetap satu toko

Satu member boleh mempunyai cart tersimpan pada beberapa toko. Setiap baris harus tetap terikat pada kombinasi `partner_id`, `company_slug`, `store_id`, dan `store_slug` asalnya. Cart toko A tidak dihapus atau dipindahkan ketika pengguna beralih ke toko B.

Pada layar katalog hanya cart milik **toko aktif** yang ditampilkan dan dihitung:

- ketika pindah ke toko yang sudah mempunyai cart, quantity control dan summary menampilkan cart toko tersebut;
- ketika pindah ke toko yang belum mempunyai cart, katalog kembali ke keadaan default dan seluruh produk yang tersedia menampilkan tombol `+`;
- ketika kembali ke toko sebelumnya, cart toko tersebut muncul lagi dengan quantity terakhir dari server;
- item dari toko berbeda tidak boleh digabungkan dalam satu quote atau transaksi. Checkout multi-toko tetap tidak termasuk scope.

### 2. `menu_id` adalah identitas produk transaksi

Gunakan `menu_id`, bukan `item_id`, sebagai identitas utama cart karena stok dan ketersediaan bersifat per-menu/per-toko. `item_id` tetap disimpan sebagai metadata kompatibilitas dan untuk tampilan.

Identitas logis satu baris cart:

```text
member_id + partner_id + store_slug + menu_id
```

Tambahkan unique index setelah data lama selesai dimigrasikan atau dibersihkan. Jangan membuat foreign key loyalty ke database marketplace.

### 3. Metadata client tidak boleh dipercaya

Client cukup mengirim `menu_id`, `store_slug`, dan jumlah. Core harus mengambil menu toko dari Marketplace Core, lalu mengisi sendiri `item_id`, nama, gambar, harga, stok, `partner_id`, `company_slug`, `store_id`, dan `store_name` dari sumber yang sah.

`store_name` adalah snapshot untuk tampilan. Identitas otoritatif tetap `store_id/store_slug`.

### 4. Toko tidak dipilih ulang, tetapi data tetap divalidasi

Saat quote dan commit, backend hanya memvalidasi toko yang tersimpan pada cart. Jangan memanggil algoritme yang mencari toko alternatif. Bila stok habis, harga berubah, toko tutup, atau pengiriman tidak tersedia, kembalikan error yang jelas dan minta pengguna meninjau cart; jangan memindahkan pesanan ke toko lain.

## Alur pengguna yang dituju

1. Pengguna membuka `/product` dan melihat nama toko aktif secara jelas.
2. Katalog hanya berisi menu `is_loyalty=1` dari toko aktif tersebut.
3. Produk tersedia menampilkan tombol lingkaran `+`; produk habis tetap tidak dapat ditambahkan.
4. Saat `+` ditekan, client mengirim `menu_id` dan `store_slug`. Core memverifikasi menu benar-benar ada di toko itu dan menyimpan cart.
5. Kontrol produk berubah menjadi `[-] [jumlah] [+]` serta tombol sampah. Tombol minus tidak boleh membuat nilai negatif.
6. Saat jumlah menjadi nol atau tombol sampah ditekan, baris cart dihapus dan UI kembali menjadi tombol `+`.
7. Sticky summary di bawah katalog mengikuti ilustrasi `docs/img/page_product.png`: jumlah item, total harga, dan tombol **Checkout**. Beri ruang `safe-area` dan padding bawah agar summary tidak menutupi produk terakhir/navbar.
8. Tombol Checkout membuka alur checkout yang sudah ada dengan daftar `cart_id` terpilih dan toko dari cart.
9. Checkout menampilkan nama toko dan tidak menjalankan pemilihan toko berdasarkan jarak. Perhitungan jarak hanya boleh dipakai untuk mengecek opsi pengiriman dari toko tersebut.
10. Ketika pengguna berpindah toko, client memuat cart berdasarkan toko yang baru dipilih. Jika toko tersebut tidak mempunyai cart, katalog kembali ke kondisi default dengan tombol `+`; cart toko sebelumnya tetap tersimpan dan muncul kembali saat toko itu dipilih lagi.
11. Setelah transaksi berhasil dibuat, core otomatis menghapus hanya baris cart yang termasuk dalam transaksi tersebut. Cart dari toko lain dan item yang tidak dipilih untuk checkout tidak boleh ikut terhapus.
12. Halaman dan tombol navigasi `/cart` disembunyikan. Pengguna mengelola cart dan memulai checkout langsung dari sticky summary pada `/product`.
13. Jika pengguna belum login lalu menekan tombol `+`, client menyimpan konteks katalog dan intent penambahan cart, mengarahkan pengguna ke halaman login, lalu setelah login berhasil kembali ke posisi katalog semula dan melanjutkan intent tersebut satu kali.
14. Setelah login berhasil, sesi disimpan secara persisten sehingga membuka kembali `client.loyalty` pada hari berikutnya tidak meminta login ulang selama kredensial sesi masih valid.

## Perubahan database `core.loyalty.system`

Audit kondisi migrasi di setiap environment sebelum membuat migrasi baru. Jangan mengubah migrasi lama yang sudah pernah dijalankan.

Kolom cart target:

| Kolom | Ketentuan |
|---|---|
| `menu_id` | Wajib untuk baris Cart V2; sudah ada calon migrasi `1791344000000_add_menu_id_to_carts_schema.js` |
| `item_id` | Tetap disimpan untuk kompatibilitas |
| `partner_id` | Diisi oleh core dari partner/company yang terverifikasi |
| `company_slug` | Tambahkan; snapshot company marketplace yang menangani transaksi |
| `store_id` | Tambahkan; ID toko marketplace tanpa foreign key lintas database |
| `store_slug` | Wajib untuk Cart V2; kolom sudah ada dari `1741355000000_add_store_to_cart_schema.js` |
| `store_name` | Snapshot nama toko untuk UI; kolom sudah ada |
| `quantity` | Bilangan bulat minimal 1 dan tidak melebihi stok terbaru |

Opsional tetapi disarankan: tambahkan `unit_price_snapshot` dan `price_checked_at` untuk mendeteksi perubahan harga dan membantu audit. Nilai yang ditampilkan/ditagihkan tetap berasal dari validasi harga Marketplace Core terbaru, bukan nilai kiriman client.

Buat migrasi baru, misalnya `add_cart_v2_context_to_carts_schema.js`, untuk kolom/index yang belum ada. `down()` harus hanya menghapus kolom/index yang dibuat migrasi tersebut.

### Penanganan cart lama

- Jangan menebak toko hanya dari `item_id` jika item terdapat di banyak toko.
- Backfill hanya bila `menu_id` dapat dipetakan secara unik ke satu toko dan partner/company yang valid.
- Baris lama yang tidak dapat diverifikasi jangan ikut checkout V2. Tandai sebagai perlu dihapus/diperbarui dan tampilkan pesan agar pengguna memilih ulang produk dari katalog.
- Setelah masa transisi selesai, baru pertimbangkan constraint `NOT NULL` dan unique index Cart V2.

## Kontrak API Cart V2

Endpoint boleh mempertahankan URL lama agar perubahan client minimal, tetapi respons harus konsisten.

### `GET /member/cart?store_slug={slug}`

Mengembalikan item milik member untuk toko aktif, konteks toko, dan summary. Core sebaiknya mengambil menu toko satu kali lalu melakukan mapping berdasarkan `menu_id`; hindari satu request Marketplace Core untuk setiap baris cart.

Contoh bentuk respons target:

```json
{
  "status": true,
  "data": {
    "store": {
      "store_id": 10,
      "store_slug": "toko-jakarta-barat",
      "store_name": "Toko Jakarta Barat",
      "company_slug": "origin-bakery",
      "partner_id": 2
    },
    "items": [
      {
        "cart_id": 101,
        "menu_id": 501,
        "item_id": 77,
        "item_name": "Classic Ciabatta",
        "item_image": "https://...",
        "quantity": 2,
        "available_quantity": 8,
        "unit_price": 25000,
        "subtotal": 50000,
        "available": true
      }
    ],
    "summary": {
      "line_count": 1,
      "item_count": 2,
      "subtotal": 50000
    }
  }
}
```

Definisi summary:

- `line_count`: jumlah produk/menu berbeda;
- `item_count`: total seluruh quantity;
- `subtotal`: jumlah `unit_price * quantity` berdasarkan harga marketplace terbaru, sebelum ongkir/voucher.

### `POST /member/cart`

Request minimal:

```json
{
  "menu_id": 501,
  "store_slug": "toko-jakarta-barat",
  "quantity": 1
}
```

Perilaku:

1. Validasi login, tipe angka, dan quantity positif.
2. Resolve store, company, dan partner dari data server.
3. Ambil menu exact dari toko tersebut dan pastikan `is_loyalty=1`, aktif, serta stok cukup.
4. Cart pada toko lain boleh tetap tersimpan, tetapi tidak boleh ikut diubah atau digabungkan ke cart toko request ini.
5. Lakukan upsert atomik berdasarkan identitas logis cart; request berulang tidak boleh membuat duplikat baris.
6. Kembalikan item yang sudah dinormalisasi beserta summary khusus toko request.

### `PUT /member/cart`

Gunakan `cart_id` dan **absolute quantity**, bukan delta. Perbaiki pola saat ini yang memakai pemeriksaan truthy (`req.quantity ? ...`) karena nilai nol tidak pernah diproses.

```json
{
  "cart_id": 101,
  "quantity": 3
}
```

Untuk menghapus, client sebaiknya memakai `DELETE`. Jika diputuskan `quantity=0` juga menghapus, perilakunya harus terdokumentasi dan konsisten.

### `DELETE /member/cart`

Hapus hanya cart milik member login. Respons mengembalikan summary terbaru untuk toko baris yang dihapus supaya UI tidak perlu menghitung dari data yang mungkin usang. Berpindah toko tidak boleh memanggil endpoint delete.

## Perubahan `core.loyalty.system`

### Cart

Pada `app/Controllers/Http/CartController.js`:

- hentikan penghapusan `store_slug` dan `store_name` dari respons;
- ubah pencarian duplikat agar menyertakan member, partner, toko, dan `menu_id`;
- jangan menerima nama/gambar/harga/partner/store name sebagai nilai otoritatif dari client;
- validasi menu terhadap endpoint menu toko yang exact;
- hitung harga marketplace dengan aturan yang sama seperti katalog (`menu_discount_marketplace_price` bila valid, jika tidak `menu_regular_price`);
- tolak jumlah melebihi stok dan produk `is_loyalty != 1`;
- gunakan transaction/locking atau upsert aman untuk mencegah double-click membuat quantity/row ganda;
- kembalikan store context, item availability, dan summary.

Pada `app/Models/Cart.js`, tambahkan konfigurasi/field yang diperlukan tanpa mengubah relasi partner yang masih dipakai.

Tambahkan validator khusus request create/update cart. Jangan hanya mengandalkan validasi manual di controller.

### Checkout

Pada `app/Controllers/Http/CheckoutController.js`:

- `checkoutContext()` harus memastikan semua cart terpilih berasal dari satu toko/company/partner;
- `quote()` mengambil toko dari cart, bukan dari hasil `selectStore()`;
- quote token harus memuat `store_id`, `store_slug`, `company_slug`, `partner_id`, serta snapshot `menu_id` dan quantity;
- `commit()` memvalidasi ulang toko yang sama dan menolak perubahan konteks;
- jangan pernah fallback ke toko lain;
- tampilkan identitas toko pada response quote agar UI checkout dapat menjelaskannya kepada pengguna;
- pertahankan idempotency `client_request_id` untuk mencegah transaksi ganda.
- setelah Marketplace Core mengonfirmasi transaksi berhasil, hapus cart berdasarkan `member_id` dan daftar `cart_id` yang tercantum pada quote/commit;
- jangan memakai `DELETE WHERE member_id = ...` tanpa filter cart karena member dapat mempunyai cart pada toko lain;
- lakukan penghapusan hanya setelah transaksi benar-benar berhasil, bukan setelah quote dibuat atau ketika request transaksi masih gagal/pending;
- penghapusan harus idempotent: retry commit transaksi yang sama tetap sukses walaupun cart sudah terhapus;
- jika transaksi sudah berhasil tetapi pembersihan cart gagal, jangan membatalkan atau membuat ulang transaksi. Catat error dengan transaction/client request ID dan sediakan mekanisme retry cleanup yang aman.

Pada `app/Services/MarketplaceFulfillmentService.js`:

- pertahankan `selectStore()` hanya bila masih dipakai alur legacy;
- buat method baru yang sempit, misalnya `validateSelectedStore({ carts, storeSlug, addressCoordinate, ... })`;
- method baru hanya memuat satu toko, mencocokkan `menu_id`, mengecek stok/harga/status, dan menghitung layanan pengiriman toko itu;
- jarak boleh menentukan apakah pengiriman tersedia, tetapi tidak boleh memilih toko pengganti;
- pickup (jika didukung) tidak semestinya gagal hanya karena alamat/jarak pengiriman, sehingga requirement alamat perlu disesuaikan dengan jenis delivery.

### Error contract

Gunakan kode stabil agar frontend tidak bergantung pada teks pesan:

| Kode | HTTP | Arti/tindakan UI |
|---|---:|---|
| `CART_STORE_MISMATCH` | 409 | Cart yang dipilih untuk satu checkout berasal dari toko berbeda atau tidak cocok dengan toko request |
| `CART_CONTEXT_MISSING` | 409 | Cart lama; pilih ulang produk |
| `MENU_NOT_AVAILABLE` | 422 | Menu tidak dijual di toko/loyalty |
| `INSUFFICIENT_STOCK` | 422 | Tampilkan stok terbaru dan koreksi jumlah |
| `PRICE_CHANGED` | 409 | Refresh harga/summary dan minta konfirmasi |
| `STORE_UNAVAILABLE` | 422 | Toko tutup/nonaktif; jangan pindahkan toko |
| `SHIPPING_UNAVAILABLE` | 422 | Ganti delivery/alamat tanpa mengganti toko |
| `FULFILLMENT_CHANGED` | 409 | Quote harus dibuat ulang untuk toko yang sama |

### Dokumentasi

Perbarui `API_DOCUMENT.md` dan contoh request/response setelah kontrak final. Pastikan dokumentasi menyebut bahwa store metadata dalam response berasal dari server.

## Perubahan `client.loyalty.system`

### Halaman `/product`

File utama: `src/pages/Product/index.jsx`.

- Load cart setelah sesi dan `activeStoreSlug` tersedia.
- Bentuk map `quantityByMenuId` agar kontrol setiap produk tidak melakukan pencarian berulang.
- Tombol `+` memanggil create cart; setelah sukses berubah menjadi quantity control.
- Tombol minus/update memakai absolute quantity; tombol sampah memakai delete.
- Disable kontrol per-menu ketika request berjalan untuk mencegah double-click. Boleh optimistis, tetapi wajib rollback dan menampilkan pesan bila server gagal.
- Produk stok nol tetap grayscale/berlabel habis dan tombol tambah nonaktif.
- Gunakan respons server sebagai sumber summary dan harga, bukan hasil hitung lokal semata.
- Sticky summary muncul hanya bila `item_count > 0`, berisi “N item di keranjang”, subtotal rupiah, dan tombol Checkout sesuai `docs/img/page_product.png`.
- Klik Checkout mengirim/menavigasikan daftar `cart_id` terbaru ke alur checkout yang ada.
- Saat pengguna belum login dan menekan tombol `+`, jangan memanggil endpoint cart terlebih dahulu. Simpan return context dan pending add intent, lalu arahkan ke halaman login.

Return context minimal memuat:

- path `/product` dan hanya internal path yang diizinkan sebagai `return_url` untuk mencegah open redirect;
- `activeStoreSlug`;
- kategori aktif, kata pencarian, page/pagination, dan daftar produk yang diperlukan untuk memulihkan tampilan;
- posisi scroll katalog;
- `menu_id` yang hendak ditambahkan dan quantity awal `1` sebagai pending intent.

Gunakan mekanisme yang sudah ada pada `src/utils/productCatalogContext.js` bila memungkinkan. Pending intent dapat disimpan sementara di `sessionStorage` agar tidak tertinggal lintas sesi browser dan harus mempunyai penanda/masa berlaku singkat.

Setelah login berhasil:

1. validasi return path dan pulihkan toko aktif lebih dahulu;
2. arahkan kembali ke `/product`, pulihkan filter/pagination, tunggu katalog siap, lalu kembalikan posisi scroll ke elemen/produk terkait;
3. jalankan pending add intent tepat satu kali melalui API Cart V2;
4. hapus pending intent setelah sukses, gagal final, kedaluwarsa, atau pengguna membatalkan login agar tidak terulang pada login berikutnya;
5. bila menu sudah tidak tersedia, stok habis, atau toko berubah, jangan menambah secara diam-diam; tampilkan pesan pada posisi katalog yang telah dipulihkan;
6. cegah double submit/replay. Endpoint create cart tetap harus aman terhadap request berulang.

“Kembali ke posisi semula” berarti pengguna kembali ke toko, filter/pencarian, halaman katalog, dan posisi scroll/produk yang sama—bukan hanya kembali ke URL `/product` bagian atas.

### Persistensi sesi login lintas hari

Implementasi saat ini pada `src/utils/AuthSession/index.js` menyimpan sesi menggunakan `js-cookie` tanpa atribut `expires`, sehingga cookie menjadi session cookie dan dapat hilang ketika browser ditutup. Ubah pengelolaan sesi agar dapat dipulihkan pada kunjungan hari berikutnya.

Ketentuan implementasi:

- tetapkan masa sesi persisten yang dapat dikonfigurasi, rekomendasi awal 30 hari, tetapi tidak boleh melampaui masa berlaku token/backend session;
- cookie wajib memakai `Secure` pada production, `SameSite=Lax` atau kebijakan yang lebih ketat bila alur aplikasi memungkinkan, serta `path=/`;
- jangan menganggap enkripsi JavaScript dengan secret dari environment frontend sebagai pengganti perlindungan token karena secret tersebut tetap dikirim ke browser;
- solusi yang disarankan adalah access token berumur pendek dan refresh token/session persisten dalam cookie `HttpOnly`, `Secure`, dan `SameSite` yang diterbitkan backend;
- audit dahulu token yang dibuat oleh `app/Controllers/Http/Auth/AuthController.js`. Jika token saat ini tidak mempunyai expiry/revocation yang memadai, tambahkan mekanisme refresh, revoke/logout, dan rotasi token di core sebelum memperpanjang cookie client;
- saat aplikasi dimuat, tampilkan state loading autentikasi, pulihkan/refresh sesi, lalu baru putuskan pengguna login atau guest. Hindari katalog berkedip dari state login ke guest;
- response `401/403` karena token kedaluwarsa atau dicabut harus membersihkan cookie/session lokal dan mengarahkan ke login dengan return context yang aman;
- logout manual harus menghapus sesi persisten, data store yang terkait akun bila diperlukan, pending auth intent, serta merevoke token/refresh session di backend;
- data cart tidak perlu disimpan ke cookie/local storage karena setelah sesi dipulihkan cart dimuat kembali dari backend berdasarkan toko aktif.

Jika penambahan refresh token belum dapat dilakukan pada fase pertama, implementasi minimum boleh memberi `expires` pada cookie existing **hanya jika** token server memang mempunyai expiry dan dapat dicabut. Catat sebagai technical debt dan jangan membuat token berlaku tanpa batas hanya untuk memenuhi login lintas hari.

Komponen quantity control dan sticky summary boleh diekstrak, misalnya:

- `src/components/CartQuantityControl/index.jsx`
- `src/components/CartCheckoutSummary/index.jsx`

Ekstraksi disarankan agar kontrol yang sama dapat dipakai di product detail dan best seller tanpa menduplikasi logika API.

### Store context

Pada `src/context/StoreContext.jsx`, `selectStore()` boleh langsung mengubah toko aktif tanpa menghapus cart toko lama. Setelah `activeStoreSlug` berubah:

- reset state cart yang tampil agar quantity toko sebelumnya tidak sempat terlihat pada katalog baru;
- request ulang `GET /member/cart?store_slug={activeStoreSlug}`;
- isi quantity control dan sticky summary hanya dari respons toko aktif;
- bila respons `items` kosong, gunakan state default katalog dan tampilkan tombol `+`;
- tangani response yang datang terlambat agar cart toko lama tidak menimpa state toko baru, misalnya dengan abort/cancellation atau pemeriksaan slug request.

Jika dibutuhkan badge cart global pada navbar, jumlahnya harus didefinisikan dengan jelas sebagai total semua toko atau toko aktif. Sticky summary `/product` wajib selalu khusus toko aktif.

### Product detail dan best seller

- `src/pages/ProductDetail/index.jsx` harus menambah item memakai `menu_id` dan toko aktif yang sama.
- Quantity dari detail dan katalog harus sinkron setelah kembali ke `/product`.
- Jika tombol cart ditambahkan ke `src/components/ProductBestSeller/index.jsx`, gunakan state/API yang sama; jangan membuat cart store terpisah.

### Route cart lama

Halaman cart terpisah sudah tidak diperlukan dan harus disembunyikan dari pengguna:

- hapus/sembunyikan ikon atau menu cart dari `src/jsons/topRights.js` dan `src/components/Navigation/Navbar.jsx`;
- jangan menyediakan tombol lain yang mengarahkan pengguna ke `/cart`;
- ubah route `/cart` di `src/components/RootRouter/index.jsx` menjadi redirect ke `/product` agar bookmark, history, atau link dari versi client lama tidak menghasilkan halaman kosong/404;
- ubah seluruh navigasi error/cancel dari checkout yang masih menuju `/cart` agar menuju `/product` pada toko terkait;
- `src/pages/Cart/index.jsx` tidak perlu dirender lagi. File boleh dihapus setelah dipastikan tidak memiliki import/pemakaian lain, atau dibiarkan sementara sebagai dead code selama masa rollout;
- API cart tetap dipertahankan karena dipakai quantity control dan sticky summary pada `/product`. Yang disembunyikan adalah halaman cart, bukan fungsi/backend cart.

### Checkout

File terkait: `src/pages/Order/index.jsx`, `src/pages/PreOrder/index.jsx`, dan `src/utils/api.js`.

- Jangan mengasumsikan backend akan memilih toko.
- Tampilkan nama toko dari quote/cart di ringkasan checkout.
- Tangani error contract di atas dan arahkan kembali ke `/product` untuk koreksi item.
- Navigasi lama yang mengarah ke `/cart` pada error/cancel harus diarahkan ke `/product` pada toko terkait.
- Jangan memakai subtotal client sebagai nominal pembayaran final; gunakan hasil quote backend.

## Perubahan opsional `backend-mediacartz`

Gunakan endpoint exact store menu yang sudah ada bila sudah memberi seluruh data: store/company/partner, `menu_id`, status loyalty, stok, regular price, discount marketplace price, dan status toko.

Jika pemanggilan menu penuh terlalu berat atau data kurang, buat endpoint internal batch, misalnya:

```text
POST /internal/store/{store_slug}/menus/validate
```

Request berisi daftar `{ menu_id, quantity }`; response berisi metadata toko terverifikasi dan hasil setiap menu. Endpoint harus:

- hanya dapat dipanggil core/service tepercaya;
- mencocokkan menu dengan toko exact;
- hanya menerima `is_loyalty=1` dan menu aktif;
- mengembalikan harga marketplace efektif dan stok saat ini;
- tidak memilih toko alternatif;
- dipakai ulang saat create/update cart, quote, dan commit agar aturan konsisten.

Lokasi file yang perlu diaudit bila endpoint dibuat:

- route Marketplace Core pada `start/routes`;
- controller/service store-menu yang sudah melayani katalog loyalty;
- serializer/resource menu agar field harga dan stok konsisten;
- validator transaksi retail (`VerifyRetailPayload` atau ekuivalennya) agar tetap memverifikasi `menu_id` terhadap `store_id` saat commit.

Jangan menambahkan endpoint baru apabila endpoint exact store yang ada sudah mencukupi; dokumentasikan keputusan tersebut pada pull request.

## Daftar file yang diperkirakan berubah

### `core.loyalty.system`

- `database/migrations/<timestamp>_add_cart_v2_context_to_carts_schema.js` — baru
- `app/Models/Cart.js`
- `app/Controllers/Http/CartController.js`
- `app/Controllers/Http/CheckoutController.js`
- `app/Controllers/Http/Auth/AuthController.js` bila perlu menambah refresh/revoke session
- `app/Services/MarketplaceFulfillmentService.js`
- `app/Validators/<CartV2Create>.js` — baru/nama menyesuaikan konvensi
- `app/Validators/<CartV2Update>.js` — baru/nama menyesuaikan konvensi
- `start/routes/member.js`
- `start/routes/auth.js` bila endpoint refresh/logout ditambahkan
- `API_DOCUMENT.md`

### `client.loyalty.system`

- `src/pages/Product/index.jsx`
- `src/pages/ProductDetail/index.jsx`
- `src/pages/Cart/index.jsx`
- `src/components/RootRouter/index.jsx`
- `src/pages/Order/index.jsx`
- `src/pages/PreOrder/index.jsx`
- `src/context/StoreContext.jsx`
- `src/utils/api.js`
- `src/utils/apiServer.js`
- `src/utils/productCatalogContext.js`
- `src/pages/Login/index.jsx`
- `src/utils/AuthSession/index.js` bila callback login ditangani di utilitas ini
- `src/jsons/topRights.js`
- `src/components/Navigation/Navbar.jsx`
- komponen quantity/summary baru bila diekstrak

### `backend-mediacartz` bila diperlukan

- route internal/store menu
- controller/service validasi batch menu
- validator dan dokumentasi API marketplace

Nama file baru harus mengikuti konvensi repository yang ditemukan saat implementasi; jangan membuat service paralel jika fungsi yang sama sudah tersedia.

## Urutan implementasi yang disarankan

1. Audit schema production/staging dan kontrak endpoint exact store Marketplace Core.
2. Finalkan invariant cart per toko dan checkout satu toko beserta kontrak JSON/error code.
3. Tambahkan migrasi Cart V2 serta strategi cart lama.
4. Refactor validasi menu/toko/harga ke service reusable di core.
5. Implementasikan create/list/update/delete cart dan summary.
6. Ubah checkout agar memvalidasi toko cart, bukan memilih toko.
7. Implementasikan cart controls dan sticky summary pada `/product`.
8. Sinkronkan product detail dan store switching, sembunyikan navigasi cart, lalu redirect `/cart` ke `/product`.
9. Bila perlu, tambahkan endpoint batch di `backend-mediacartz` lalu gunakan dari core.
10. Jalankan skenario regresi end-to-end sebelum menghapus jalur legacy.

## Skenario pengujian

Detail unit test diserahkan kepada implementer. Minimal cakup skenario berikut:

### Cart dan katalog

- katalog toko A hanya menampilkan menu loyalty yang benar-benar tersedia di toko A;
- tambah produk membuat cart dengan `menu_id`, partner, company, dan toko A yang benar;
- metadata palsu dari client tidak tersimpan;
- klik cepat/double request tidak membuat baris duplikat;
- tambah/minus/update menampilkan quantity dan summary yang benar;
- stok nol/kurang menolak penambahan dan UI menampilkan kondisi terbaru;
- diskon marketplace menghasilkan subtotal yang benar;
- hapus baris terakhir menyembunyikan sticky summary;
- refresh halaman mengembalikan quantity dari server;
- cart lama tanpa store context tidak dapat checkout diam-diam.

### Login dan kembali ke katalog

- pengguna guest yang menekan `+` diarahkan ke login tanpa membuat cart guest;
- login sukses mengembalikan pengguna ke toko, filter/pencarian, pagination, dan posisi scroll/produk yang sama;
- pending item ditambahkan tepat satu kali setelah login dan quantity/summary diperbarui;
- login dibatalkan/gagal tidak menambahkan produk dan pending intent tidak terulang pada login berikutnya;
- pending intent kedaluwarsa atau menu menjadi habis menampilkan pesan tanpa menambahkan cart;
- `return_url` eksternal/berbahaya ditolak dan fallback aman menuju `/product`;
- reload atau tombol back selama callback tidak menggandakan quantity.

### Persistensi sesi

- login hari ini lalu tutup dan buka kembali browser pada hari berikutnya tetap memulihkan pengguna yang sama tanpa OTP ulang selama sesi valid;
- cart dimuat kembali dari backend setelah sesi dan toko aktif berhasil dipulihkan;
- token kedaluwarsa/dicabut tidak dianggap login dan pengguna diarahkan ke login secara aman;
- logout manual menghapus sesi persisten dan sesi tidak muncul kembali setelah browser dibuka ulang;
- refresh token yang dipakai ulang setelah rotasi/revoke ditolak;
- cookie production mempunyai atribut `Secure`, `SameSite`, `path`, dan expiry yang sesuai;
- state autentikasi saat startup tidak menampilkan data member sebelumnya kepada guest atau member lain.

### Pergantian toko

- cart toko A tetap tersimpan ketika pengguna pindah ke toko B;
- jika toko B belum mempunyai cart, semua produk tersedia kembali menampilkan tombol `+` dan summary tidak tampil;
- jika toko B mempunyai cart, quantity control dan summary hanya menampilkan cart toko B;
- kembali ke toko A memunculkan kembali quantity dan summary cart toko A;
- respons API toko A yang terlambat tidak boleh menimpa state setelah toko B aktif;
- cart toko A dan toko B tidak dapat dipilih bersama dalam satu checkout;
- menambah menu toko B tidak mengubah quantity cart toko A.

### Checkout

- quote dan commit selalu menggunakan toko yang tersimpan di cart;
- tidak ada fallback ke toko yang lebih dekat atau stoknya lebih banyak;
- perubahan stok/harga setelah add-to-cart menghasilkan error yang dapat ditindaklanjuti;
- shipping tidak tersedia tidak mengganti toko;
- transaksi sukses mengirim `menu_id`, store, company, dan partner yang benar ke Marketplace Core;
- transaksi berhasil menghapus hanya cart yang menjadi bagian transaksi tersebut;
- cart toko lain dan item yang tidak dipilih tetap tersedia setelah transaksi berhasil;
- transaksi gagal atau belum berhasil tidak menghapus cart;
- retry commit setelah cart sudah dibersihkan tidak membuat transaksi baru dan tetap mengembalikan hasil transaksi sebelumnya;
- kegagalan cleanup setelah transaksi berhasil tercatat dan dapat di-retry tanpa mengulangi transaksi;
- retry commit dengan `client_request_id` yang sama tidak membuat transaksi ganda.

### Regresi

- harga diskon marketplace dan harga reguler tetap konsisten di katalog, cart, checkout, dan transaksi;
- alur offline tidak berubah;
- promo/voucher, ongkir, pickup/delivery, login redirect, dan riwayat transaksi tetap bekerja;
- tampilan mobile tidak tertutup sticky summary atau navbar bawah.
- ikon/menu menuju halaman cart tidak lagi tampil;
- akses langsung, bookmark, dan browser history ke `/cart` diarahkan ke `/product` tanpa loop;
- error/cancel checkout kembali ke `/product` pada toko yang benar, bukan ke halaman cart lama.

## Acceptance criteria

- [ ] Pengguna selalu dapat melihat toko aktif sebelum memilih produk.
- [ ] Setiap cart baru mempunyai `menu_id`, `partner_id`, `company_slug`, `store_id`, `store_slug`, dan `store_name` yang berasal dari validasi server.
- [ ] Member dapat menyimpan cart terpisah pada beberapa toko, tetapi setiap checkout hanya memproses satu toko.
- [ ] Perpindahan toko memuat cart toko tujuan; bila kosong, katalog kembali menampilkan tombol `+` tanpa menghapus cart toko sebelumnya.
- [ ] Kontrol `+`, minus, quantity, plus, dan sampah berfungsi langsung di `/product`.
- [ ] Summary bawah menampilkan total quantity dan subtotal terbaru serta membuka checkout.
- [ ] Checkout tidak lagi menjalankan auto-selection toko.
- [ ] Quote dan commit tetap memvalidasi menu, stok, harga, toko, serta delivery tanpa fallback toko.
- [ ] Transaksi berhasil otomatis menghapus cart yang ditransaksikan tanpa menghapus cart toko lain atau item yang tidak dipilih.
- [ ] Transaksi gagal tidak menghapus cart, dan retry commit bersifat idempotent meskipun cart sudah dibersihkan.
- [ ] Produk habis/tidak dijual di toko aktif tidak dapat dimasukkan ke cart.
- [ ] Halaman dan navigasi cart disembunyikan; akses langsung `/cart` diarahkan ke `/product`.
- [ ] Pengguna yang belum login diarahkan ke login saat menekan `+`, kemudian kembali ke posisi katalog semula dan item ditambahkan tepat satu kali setelah login berhasil.
- [ ] Sesi login yang masih valid dipertahankan ketika client ditutup dan dibuka kembali pada hari berikutnya; sesi kedaluwarsa, dicabut, atau logout tidak dipulihkan.
- [ ] API documentation, migration note, dan error contract telah diperbarui.

## Definition of done

1. Migrasi aman dijalankan dan di-rollback pada staging.
2. Kontrak API Cart V2 terdokumentasi dan dipakai client.
3. Seluruh acceptance criteria terpenuhi pada mobile dan desktop yang didukung.
4. Tidak ada request per-item berlebihan ketika memuat cart; data menu divalidasi secara batch/per-toko.
5. Logging mencatat member, store, menu, dan error code tanpa membocorkan token/data pembayaran.
6. Alur legacy `/cart` sudah disembunyikan dan mempunyai redirect kompatibilitas ke `/product` selama rollout.
7. Skenario pengujian utama lulus dan hasilnya dicatat pada pull request.

## Catatan rollout

- Disarankan memakai feature flag Cart V2 karena perubahan menyentuh schema, API, UI, dan checkout sekaligus.
- Deploy migrasi dan backend yang backward-compatible lebih dahulu, kemudian client, lalu aktifkan flag bertahap.
- Pantau `CART_STORE_MISMATCH`, `CART_CONTEXT_MISSING`, `INSUFFICIENT_STOCK`, kegagalan quote, dan conversion checkout.
- Setelah versi client lama tidak lagi dominan dan cart lama selesai ditangani, hapus logika auto-select toko dari jalur loyalty serta constraint-kan field Cart V2 yang masih nullable.
