# Issue: Single-Store Marketplace Fulfillment Tanpa Mengubah `backend-mediacartz`

## Ringkasan

Implementasikan flow marketplace pada aplikasi loyalty agar pelanggan dapat berbelanja seperti web e-commerce tanpa perlu mengetahui toko mana yang memproses transaksi.

Aturan utama yang harus dijaga:

```text
1 cart checkout = 1 order = 1 toko internal = 1 ongkir
```

Sistem tidak boleh split order ke beberapa toko. Jika pelanggan membeli lebih dari satu item, seluruh item yang dipilih harus dapat dipenuhi oleh satu toko yang sama, dengan stok cukup dan jarak toko ke alamat pelanggan masih dalam radius maksimal yang ditentukan.

Issue ini hanya mencakup:

1. `core.loyalty.system`
2. `client.loyalty.system`

Issue ini tidak boleh mengubah:

1. `backend-mediacartz`
2. `frontend-mediacartz-react`
3. `cms.loyalty.system`
4. API lain yang tidak berkaitan

## Latar Belakang

Fitur marketplace di aplikasi loyalty adalah pengganti aplikasi mobile POS yang biasa digunakan di setiap toko. Bedanya, channel transaksi pelanggan menggunakan web e-commerce.

Toko berada di beberapa lokasi berbeda. Pelanggan harus diarahkan otomatis ke toko yang:

1. berada dalam radius maksimal dari lokasi/alamat pelanggan;
2. memiliki stok cukup untuk semua item yang dipilih;
3. bisa memproses order sebagai satu transaksi tunggal.

Contoh business rule:

```text
Jika maksimal jarak toko ke pelanggan adalah 3 km, pelanggan tidak boleh bertransaksi dengan toko yang jaraknya lebih dari 3 km.
```

Masalah existing:

1. Saat ini produk/detail/cart masih membawa informasi toko.
2. Cart dikelompokkan per toko.
3. Checkout membutuhkan `store_slug` dari frontend.
4. Jika item A tersedia di toko X tetapi item B hanya tersedia di toko Y, flow baru tidak boleh membuat dua order karena akan menghasilkan dua biaya pengiriman.

Target flow baru:

1. Pelanggan melihat produk.
2. Pelanggan menambah item ke cart tanpa memilih toko.
3. Pelanggan membuka cart tanpa melihat grouping toko.
4. Saat checkout, `core.loyalty.system` memilih toko secara internal.
5. Jika satu toko dapat memenuhi semua item dalam radius maksimal, transaksi dapat lanjut.
6. Jika tidak ada satu toko yang memenuhi, checkout ditolak dengan pesan yang jelas.

## Existing Implementation Yang Relevan

### `core.loyalty.system`

1. `core.loyalty.system` adalah backend loyalty sekaligus proxy ke marketplace.
2. Semua komunikasi dari `client.loyalty.system` ke `backend-mediacartz` harus tetap melalui `core.loyalty.system`.
3. `backend-mediacartz` adalah sumber data produk, toko, stok, ongkir, transaksi, dan status transaksi melalui env `MARKETPLACE_CORE`.
4. `CartController.list()` saat ini mengembalikan cart yang dikelompokkan per `store_slug`.
5. `CartController.create()` saat ini merge cart berdasarkan `member_id + item_id + store_slug`.
6. `TransactionController.create()` saat ini menerima `store_slug` dari request atau fallback ke `partner.store_slug`, lalu meneruskan order ke `MARKETPLACE_CORE transaction/retail/order`.
7. `ShippingController.gosendCost()` saat ini menerima origin/destination dari request lalu meneruskan ke `MARKETPLACE_CORE transaction/shipping/gosend/cost`.
8. `Address` sudah memiliki field `coordinate`, tetapi flow UI masih memperlakukannya sebagai opsional.

File existing penting:

```text
core.loyalty.system/app/Controllers/Http/CartController.js
core.loyalty.system/app/Controllers/Http/ProductController.js
core.loyalty.system/app/Controllers/Http/ShippingController.js
core.loyalty.system/app/Controllers/Http/TransactionController.js
core.loyalty.system/app/Controllers/Http/AddressController.js
core.loyalty.system/app/Models/Cart.js
core.loyalty.system/app/Models/Address.js
core.loyalty.system/app/Models/Partner.js
core.loyalty.system/start/routes/member.js
core.loyalty.system/start/routes/public.js
core.loyalty.system/database/migrations/1724899392205_cart_schema.js
core.loyalty.system/database/migrations/1741355000000_add_store_to_cart_schema.js
core.loyalty.system/database/migrations/1760000000000_add_coordinate_to_addresses_schema.js
```

### `client.loyalty.system`

1. Halaman product list memakai `GET public/product`.
2. Halaman product detail menampilkan bagian "Toko yang Menyediakan Produk Ini".
3. Product detail mengirim `store_slug` dan `store_name` saat add to cart.
4. Halaman cart memakai state `cartGroups` dan menampilkan header toko.
5. Tombol checkout di cart membawa `store_slug` ke halaman `/order`.
6. Halaman `/order` dianggap invalid jika tidak ada `store_slug`.
7. Halaman `/order/preorder` juga bergantung pada `store_slug` untuk fetch data toko.

File existing penting:

```text
client.loyalty.system/src/utils/api.js
client.loyalty.system/src/utils/apiServer.js
client.loyalty.system/src/utils/memberAddress.js
client.loyalty.system/src/pages/Product/index.jsx
client.loyalty.system/src/pages/ProductDetail/index.jsx
client.loyalty.system/src/pages/Cart/index.jsx
client.loyalty.system/src/pages/Order/index.jsx
client.loyalty.system/src/pages/PreOrder/index.jsx
client.loyalty.system/src/pages/ProfileAddressForm/index.jsx
client.loyalty.system/src/pages/Profile/index.jsx
```

## Tujuan

### MUST

1. Pelanggan tidak melihat nama toko, slug toko, alamat toko, atau daftar toko pada flow product, cart, order, dan preorder untuk delivery checkout.
2. Pelanggan dapat menambah item ke cart tanpa memilih toko.
3. Cart tampil sebagai satu daftar item, bukan grouping per toko.
4. Checkout hanya dapat lanjut jika satu toko yang sama dapat memenuhi seluruh selected cart item.
5. Toko yang dipilih harus berada dalam radius maksimal dari alamat pelanggan.
6. Core harus memilih toko secara server-side.
7. Client tidak boleh mengirim `store_id`, `store_slug`, atau `store_name` sebagai sumber kebenaran checkout.
8. Core harus re-check stok dan radius sebelum final order dikirim ke `backend-mediacartz`.
9. `backend-mediacartz` tidak boleh diubah.
10. Existing endpoint lama yang tidak berkaitan tidak boleh dihapus.

### SHOULD

1. Core mengembalikan pesan error yang bisa langsung ditampilkan di frontend.
2. Core menyembunyikan internal selected store dari response client.
3. Quote checkout menghasilkan token internal agar final commit tidak bergantung pada store dari frontend.
4. Frontend tetap mempertahankan style mobile-first yang sudah ada.
5. Frontend tetap menggunakan helper `Api` dan endpoint `core.loyalty.system`.

### OPTIONAL

1. Core dapat mengembalikan `distance_km` secara agregat tanpa identitas toko, misalnya hanya untuk debugging internal jika diperlukan.
2. Core dapat menambahkan log internal untuk alasan toko tidak eligible.
3. Core dapat mempertahankan kolom `store_slug` dan `store_name` di tabel `carts` untuk backward compatibility, tetapi tidak digunakan dalam flow baru.

## Scope Guard

Jangan:

1. melakukan refactor besar yang tidak diperlukan;
2. upgrade dependency;
3. mengubah `backend-mediacartz`;
4. membuat frontend hit langsung ke `backend-mediacartz`;
5. memindahkan kalkulasi fulfillment ke frontend;
6. mengubah business rule voucher, point, Midtrans, GoSend, atau transaksi selain yang diperlukan untuk hidden store checkout;
7. menghapus endpoint lama jika masih mungkin dipakai flow lain;
8. mengubah struktur besar response marketplace existing di luar endpoint baru;
9. menambahkan detail implementasi unit test pada issue ini.

## Business Rules

### MUST

1. Selected cart items harus dipenuhi oleh satu toko yang sama.
2. Jika tidak ada satu toko yang memenuhi semua selected cart items, checkout harus gagal.
3. Jika toko terdekat tidak punya stok lengkap, core boleh memilih toko lain yang masih dalam radius maksimal.
4. Jika semua toko dalam radius maksimal gagal memenuhi stok lengkap, checkout harus gagal.
5. Jika alamat pelanggan tidak memiliki coordinate valid, checkout delivery harus gagal.
6. Jika item quantity di cart lebih besar dari stok toko terpilih, checkout harus gagal.
7. Core harus melakukan final validation ulang saat commit final order, bukan hanya saat quote.
8. Frontend tidak boleh menampilkan identitas toko pada delivery checkout.
9. Jarak toko ke pelanggan harus ditentukan memakai API GoSend yang sudah diproxy oleh `backend-mediacartz`, bukan kalkulasi jarak manual di frontend.
10. Jika pelanggan mengubah alamat pengiriman, data cart/checkout harus dihitung ulang terhadap alamat baru.
11. Quote lama harus dianggap tidak berlaku jika `address_id` atau `address.coordinate` berubah.

### SHOULD

1. Jika ada lebih dari satu toko eligible, pilih toko dengan jarak paling dekat.
2. Jika jarak sama, pilih toko dengan stok paling cukup secara total.
3. Jika masih sama, pilih toko dengan urutan stabil berdasarkan `store_id` terkecil atau `store_slug` ascending agar hasil deterministik.
4. Product list/detail boleh menampilkan status ketersediaan agregat, tetapi bukan stok per toko.
5. Cart page sebaiknya menampilkan status ketersediaan berdasarkan alamat aktif, misalnya semua item dapat dipenuhi atau ada item yang tidak tersedia untuk alamat tersebut.

### OPTIONAL

1. Jika bisnis masih mengizinkan pickup, flow pickup perlu desain terpisah karena pickup mengharuskan pelanggan tahu lokasi toko. Lihat bagian Open Questions.

## Perhitungan Jarak Dengan GoSend

### MUST

1. Core harus memakai API GoSend untuk menentukan jarak toko ke alamat pelanggan.
2. Core tidak boleh memakai perhitungan Haversine/manual sebagai sumber kebenaran radius checkout.
3. Frontend tidak boleh menghitung jarak toko ke pelanggan.
4. Core harus memanggil endpoint existing yang sudah tersedia melalui `MARKETPLACE_CORE`:

```text
GET {MARKETPLACE_CORE}transaction/shipping/gosend/cost
```

5. Request ke endpoint GoSend cost harus memakai:
   - `origin`: coordinate toko internal kandidat dalam format `lat,lng`;
   - `destination`: coordinate alamat pelanggan dalam format `lat,lng`;
   - `paymentType`: payment type yang sesuai dengan flow existing jika dibutuhkan endpoint upstream.
6. Nilai jarak yang dipakai untuk validasi radius harus diambil dari response GoSend cost.
7. Jika response GoSend cost tidak mengembalikan jarak yang bisa diparse, toko kandidat tersebut dianggap tidak eligible.
8. Jika API GoSend gagal untuk semua toko kandidat, quote harus gagal dengan error `GOSEND_DISTANCE_UNAVAILABLE` atau `MARKETPLACE_UPSTREAM_ERROR`.
9. Jika API GoSend mengembalikan service tidak aktif/tidak serviceable untuk toko dan alamat tersebut, toko kandidat dianggap tidak eligible untuk delivery GoSend.

### SHOULD

1. Core boleh cache hasil GoSend cost sementara selama satu request quote agar tidak memanggil endpoint yang sama berulang.
2. Core boleh tetap memakai coordinate validation lokal hanya untuk memastikan format `lat,lng` valid sebelum memanggil GoSend.
3. Core boleh menyimpan jarak dari GoSend di quote token untuk display/preview, tetapi commit tetap harus memanggil ulang atau memvalidasi ulang agar data tidak stale.

### MUST NOT

1. Jangan expose coordinate toko ke client.
2. Jangan expose nama toko ke client hanya karena data GoSend membutuhkan origin.
3. Jangan membuat request GoSend langsung dari `client.loyalty.system`.
4. Jangan menambahkan dependency baru untuk menghitung jarak.

## Perubahan Alamat Dan Dampaknya Ke Cart

### MUST

1. Alamat aktif adalah bagian dari fulfillment context.
2. Jika pelanggan mengganti alamat di cart/order, core harus menghitung ulang:
   - toko internal kandidat;
   - jarak GoSend dari toko kandidat ke alamat baru;
   - stok item pada satu toko eligible;
   - opsi delivery;
   - opsi shipping;
   - total biaya preview.
3. Frontend harus menganggap cart/checkout data lama sebagai stale setelah alamat berubah.
4. Frontend harus menghapus `quote_token` lama setelah alamat berubah.
5. Frontend harus menghapus selected shipping lama setelah alamat berubah karena ongkir bergantung pada origin toko internal dan destination alamat.
6. Core tidak boleh melakukan commit order memakai quote token yang dibuat dari alamat lama.
7. Jika alamat diedit di profile/address form dan user kembali ke cart/order, cart/order harus reload data alamat terbaru sebelum quote.
8. Jika alamat yang sedang dipakai checkout dihapus, checkout harus berhenti dan user diarahkan untuk memilih atau membuat alamat baru.

### SHOULD

1. Cart page boleh menampilkan status umum setelah alamat aktif dipilih:
   - `Dapat dikirim ke alamat ini`;
   - `Beberapa item tidak tersedia untuk alamat ini`;
   - `Lengkapi titik lokasi alamat untuk melanjutkan`.
2. Cart page tidak perlu menampilkan nama toko atau alasan per toko.
3. Jika quote ulang gagal setelah alamat berubah, quantity cart tidak otomatis diubah. User harus tetap melihat item cart, tetapi tombol checkout disabled sampai masalah diselesaikan.

### OPTIONAL

1. Core boleh menyediakan metadata `fulfillment_status` pada response cart atau quote untuk mempermudah UI.
2. Core boleh menyimpan cache quote terbaru di memory/request-local saja, tetapi jangan bergantung pada cache untuk commit final.

## Fulfillment Algorithm

Implementasi boleh mengikuti bentuk kode existing, tetapi behavior harus sama seperti ini.

Input:

1. `member_id` dari auth.
2. `selected_cart_ids` dari client.
3. `address_id` dari client.
4. `company_slug` dari env `DEFAULT_COMPANY_SLUG`, partner default member, atau request jika sudah ada di flow existing.
5. Optional selected delivery/payment/shipping/voucher.

Langkah:

1. Ambil cart milik member berdasarkan `selected_cart_ids`.
2. Tolak jika cart kosong.
3. Ambil alamat member berdasarkan `address_id`.
4. Tolak jika alamat tidak milik member.
5. Parse `address.coordinate` dengan format `lat,lng`.
6. Tolak jika coordinate invalid.
7. Jika request membawa `quote_token` lama atau checkout context lama, pastikan alamat pada token/context sama dengan alamat aktif. Jika berbeda, abaikan quote lama dan proses ulang dari cart.
8. Ambil daftar toko dari marketplace core berdasarkan company.
9. Ambil data menu/stok semua item pada cart untuk semua toko kandidat.
10. Buat daftar kandidat toko.
11. Untuk setiap toko kandidat:
    - toko harus aktif jika field status tersedia;
    - toko harus punya coordinate valid;
    - panggil API GoSend cost dengan origin coordinate toko dan destination coordinate alamat pelanggan;
    - ambil jarak dari response GoSend;
    - jarak toko ke alamat pelanggan berdasarkan response GoSend harus `<= max_distance_km`;
    - toko harus punya menu/item untuk setiap cart item;
    - `menu_current_quantity` per item harus `>= cart.quantity`;
    - delivery method dan payment method harus eligible jika sudah dipilih.
12. Sort kandidat:
    - jarak dari GoSend ascending;
    - stok total tersisa descending;
    - `store_id` atau `store_slug` ascending.
13. Pilih kandidat pertama.
14. Build payload internal untuk `backend-mediacartz` dengan satu `store_id` dan `store_slug`.
15. Jika quote siap, panggil `MARKETPLACE_CORE transaction/retail/order` dengan `preview_fee=true`.
16. Saat commit final, ulangi validasi stok/radius lalu panggil `MARKETPLACE_CORE transaction/retail/order` dengan `preview_fee=false`.

Catatan:

1. Jangan membuat order jika core belum menemukan satu toko eligible.
2. Jangan mengirim order per item.
3. Jangan split order.
4. Jangan mempercayai `store_id/store_slug` dari client untuk final payload.
5. Jangan menggunakan quote lama setelah pelanggan memilih atau mengubah alamat.

## Konfigurasi

### MUST

Tambahkan pembacaan env di `core.loyalty.system`:

```text
MARKETPLACE_MAX_FULFILLMENT_DISTANCE_KM
```

Definisi:

1. Nilai numerik dalam kilometer.
2. Default runtime: `3`.
3. Jika env kosong atau invalid, gunakan default `3`.
4. Nilai dipakai untuk membatasi jarak toko ke alamat pelanggan berdasarkan jarak dari API GoSend.

File yang perlu disesuaikan:

```text
core.loyalty.system/.env
core.loyalty.system/.env.example atau dokumentasi env jika file contoh tersedia
```

Jika tidak ada `.env.example`, cukup dokumentasikan di issue/README internal. Jangan commit secret.

## File Yang Harus Dibuat Atau Diedit

### `core.loyalty.system`

#### MUST Create

```text
core.loyalty.system/app/Controllers/Http/CheckoutController.js
core.loyalty.system/app/Services/MarketplaceFulfillmentService.js
core.loyalty.system/app/Validators/CheckoutQuote.js
core.loyalty.system/app/Validators/CheckoutCommit.js
```

Tujuan:

1. `CheckoutController` menangani endpoint baru checkout quote dan commit.
2. `MarketplaceFulfillmentService` berisi logic pemilihan toko, cek radius, cek stok, build payload marketplace, dan signing/validasi quote token.
3. Validator menjaga bentuk request tanpa memindahkan business logic ke validator.

#### MUST Edit

```text
core.loyalty.system/start/routes/member.js
core.loyalty.system/app/Controllers/Http/CartController.js
core.loyalty.system/app/Controllers/Http/ProductController.js
core.loyalty.system/app/Controllers/Http/TransactionController.js
core.loyalty.system/app/Controllers/Http/ShippingController.js
core.loyalty.system/app/Controllers/Http/AddressController.js
core.loyalty.system/API_DOCUMENT.md
core.loyalty.system/prd.md
```

Rincian:

1. `start/routes/member.js`
   - Tambahkan endpoint baru `POST /api/v1/member/checkout/quote`.
   - Tambahkan endpoint baru `POST /api/v1/member/checkout/commit`.
   - Endpoint harus memakai auth member seperti endpoint cart/transaction.

2. `CartController.js`
   - `list()` harus mendukung response baru tanpa grouping toko.
   - `create()` tidak boleh mewajibkan `store_slug/store_name`.
   - Merge duplicate item harus berdasarkan `member_id + item_id` untuk flow baru.
   - Tetap jaga backward compatibility jika ada cart lama yang masih punya `store_slug`.
   - Jangan return `store_slug/store_name` ke client pada flow baru.

3. `ProductController.js`
   - Product list/detail untuk client harus tidak mengekspos daftar toko.
   - Jika data marketplace mengandung `menu[]` per toko, response ke client harus disanitasi.
   - Tetap sediakan field produk yang sudah dipakai UI: item id, slug, name, image, price, stock agregat, review summary.
   - Jangan ubah proxy internal ke `MARKETPLACE_CORE` selain untuk sanitasi response.

4. `TransactionController.js`
   - Endpoint existing `POST /api/v1/member/transaction` jangan dihapus.
   - Flow baru dari client harus memakai `CheckoutController`.
   - Jika tetap ada caller lama, behavior lama boleh dipertahankan.
   - Hindari refactor besar. Ambil helper kecil saja jika benar-benar diperlukan.

5. `ShippingController.js`
   - Jangan lagi dipakai frontend untuk menghitung ongkir dari origin yang dikirim client.
   - Untuk flow baru, origin harus berasal dari selected store internal di `MarketplaceFulfillmentService`.
   - Logic jarak/radius flow baru harus memakai API GoSend cost melalui core/upstream, bukan input origin dari client.
   - Endpoint existing boleh tetap ada untuk backward compatibility.

6. `AddressController.js`
   - Validasi create/edit address harus tetap menerima `coordinate`.
   - Jangan ubah struktur tabel address.
   - Untuk checkout delivery, coordinate wajib divalidasi di checkout service, bukan memaksa semua address lama langsung invalid saat create/edit.

7. `API_DOCUMENT.md` dan `prd.md`
   - Update dokumentasi bahwa cart tidak lagi dikelompokkan per toko untuk flow marketplace loyalty.
   - Dokumentasikan endpoint quote/commit dan response contract.

#### SHOULD Edit

```text
core.loyalty.system/docs/context/*.md
```

Tambahkan ringkasan keputusan baru jika repo memang memakai context docs untuk handover.

### `client.loyalty.system`

#### MUST Edit

```text
client.loyalty.system/src/utils/api.js
client.loyalty.system/src/pages/Product/index.jsx
client.loyalty.system/src/pages/ProductDetail/index.jsx
client.loyalty.system/src/pages/Cart/index.jsx
client.loyalty.system/src/pages/Order/index.jsx
client.loyalty.system/src/pages/PreOrder/index.jsx
client.loyalty.system/src/pages/ProfileAddressForm/index.jsx
client.loyalty.system/src/pages/Profile/index.jsx
```

Rincian:

1. `src/utils/api.js`
   - Tambahkan constant endpoint:
     - `CHECKOUT_QUOTE`
     - `CHECKOUT_COMMIT`
   - Tetap gunakan helper `Api`.

2. `Product/index.jsx`
   - Pastikan product list tidak bergantung pada store.
   - Jangan tampilkan store.
   - Jika stock dari response adalah agregat, label harus netral, misalnya `Tersedia` atau `Stok tersedia`, bukan stok toko.

3. `ProductDetail/index.jsx`
   - Hapus UI "Toko yang Menyediakan Produk Ini" dari flow customer.
   - Hapus pilihan toko per item.
   - Tombol add cart menjadi satu tombol umum.
   - Payload add cart tidak boleh mengirim `store_slug` atau `store_name`.
   - Jangan menghitung radius di frontend.

4. `Cart/index.jsx`
   - Ganti `cartGroups` menjadi list item biasa atau normalisasi response grouped lama menjadi flat list.
   - Jangan render header toko.
   - Tombol `Beli` hanya satu untuk selected items.
   - Navigation ke `/order` hanya membawa `selected_cart_ids`, bukan `store_slug`.
   - Jika user memilih atau mengubah alamat aktif sebelum checkout, refresh status cart melalui quote/availability dari core.
   - Jangan menampilkan stok lama jika alamat sudah berubah dan fulfillment belum dihitung ulang.

5. `Order/index.jsx`
   - Hapus requirement `storeSlug`.
   - Ambil selected cart ids dari route state/session storage.
   - Wajib pilih address dengan coordinate valid untuk delivery.
   - Panggil `POST /api/v1/member/checkout/quote` untuk mendapatkan preview dan token.
   - Setiap perubahan alamat harus memanggil ulang quote endpoint dan mengganti `quote_token`.
   - Saat alamat berubah, reset pilihan shipping yang bergantung pada alamat lama.
   - Jangan membentuk payload final yang berisi `store_id/store_slug`.
   - Jangan menghitung origin shipping di frontend.

6. `PreOrder/index.jsx`
   - Jangan lagi fetch `PUBLIC_STORE` berdasarkan `storeSlug`.
   - Jangan validasi `companyId` dari data toko yang dikirim client.
   - Tampilkan preview dari quote response.
   - Saat user klik bayar, panggil `POST /api/v1/member/checkout/commit` dengan `quote_token`.
   - Jika user kembali ke order dan mengganti alamat, preorder lama tidak boleh dipakai lagi.
   - Tetap jalankan Midtrans popup/token seperti flow existing jika response commit sukses.

7. `ProfileAddressForm/index.jsx`
   - Wording coordinate tidak boleh lagi dianggap opsional untuk kebutuhan delivery marketplace.
   - Untuk create/edit address, UI boleh tetap menyimpan address tanpa coordinate jika bisnis masih mengizinkan address manual, tetapi checkout harus meminta coordinate sebelum lanjut.
   - Jika implementor memilih validasi UI lebih ketat, pastikan tidak merusak address lama tanpa coordinate.

8. `Profile/index.jsx`
   - Tampilkan status coordinate address dengan jelas.
   - Address tanpa coordinate harus terlihat perlu dilengkapi sebelum checkout.

#### SHOULD Edit

```text
client.loyalty.system/src/utils/memberAddress.js
```

Tambahkan helper kecil untuk:

1. cek apakah address punya coordinate valid;
2. normalisasi format coordinate `lat,lng`.

#### OPTIONAL Edit

```text
client.loyalty.system/src/pages/TransactionDetail/index.jsx
client.loyalty.system/src/pages/TransactionList/index.jsx
```

Jika response transaksi dari `backend-mediacartz` masih mengandung data toko, UI boleh tetap memakai untuk fungsi internal seperti complain WhatsApp. Namun untuk customer delivery checkout baru, jangan jadikan store sebagai informasi utama pada order creation flow.

## API Contract Baru

Semua endpoint baru berada di `core.loyalty.system`.

Base URL frontend tetap mengikuti existing env:

```text
REACT_APP_CORE_LOYALTY_SYSTEM
```

Semua endpoint di bawah memakai auth member, sama seperti endpoint:

```text
GET /api/v1/member/cart
POST /api/v1/member/transaction
```

### 1. Quote Checkout

#### Method

```text
POST
```

#### URL

```text
/api/v1/member/checkout/quote
```

#### Query Parameter

Tidak ada query parameter.

Jika client mengirim query parameter tambahan, endpoint tidak boleh bergantung pada query tersebut. Semua input harus berasal dari request body dan auth user.

#### Request Body

```json
{
  "selected_cart_ids": [101, 102],
  "address_id": 55,
  "company_slug": "freshly-baked",
  "ms_delivery_id": 6,
  "ms_payment_id": 4,
  "shipping_service": "Instant",
  "shiping_method": "Instant",
  "voucher_code": "encrypted-voucher-code",
  "transaction_delivery_note": "Titip di security",
  "client_request_id": "checkout-1780000000000-a1b2c3"
}
```

#### Field Definition

| Field | Type | Required | Definisi |
| --- | --- | --- | --- |
| `selected_cart_ids` | array<number> | MUST | Daftar `cart_id` yang dipilih user. Semua cart harus milik auth member. |
| `address_id` | number | MUST untuk delivery | ID alamat member yang dipakai sebagai tujuan pengiriman. |
| `company_slug` | string | SHOULD | Scope company marketplace. Jika kosong, core boleh memakai `DEFAULT_COMPANY_SLUG` atau partner default existing. |
| `ms_delivery_id` | number | SHOULD | Delivery method yang dipilih user. Jika kosong, quote boleh mengembalikan delivery options tanpa shipping preview final. |
| `ms_payment_id` | number | SHOULD | Payment method yang dipilih user. Untuk flow existing loyalty seharusnya MIDTRANS. |
| `shipping_service` | string | SHOULD untuk delivery non-pickup | Service pengiriman yang dipilih, misalnya `Instant`. |
| `shiping_method` | string | OPTIONAL | Typo-compatible field existing untuk GoSend. Isi sama dengan `shipping_service` jika diperlukan upstream. |
| `voucher_code` | string | OPTIONAL | Voucher loyalty yang sudah dienkripsi dengan mekanisme existing. |
| `transaction_delivery_note` | string | OPTIONAL | Catatan kurir, maksimal 255 karakter. |
| `client_request_id` | string | SHOULD | Idempotency key dari client. Jika kosong, core boleh generate. |

Catatan:

1. Client tidak boleh mengirim `store_id`.
2. Client tidak boleh mengirim `store_slug`.
3. Client tidak boleh mengirim `store_name`.
4. Jika field tersebut tetap dikirim oleh client lama, endpoint baru harus mengabaikannya.
5. Jika pelanggan mengganti alamat, client harus memanggil endpoint quote ulang dengan `address_id` baru.
6. `quote_token` dari alamat sebelumnya tidak boleh dipakai untuk commit.

#### Success Response: Quote Siap Preview

HTTP status:

```text
200
```

Body:

```json
{
  "status": true,
  "message": "Checkout quote berhasil dibuat",
  "data": {
    "quote_status": "ready",
    "quote_token": "signed-or-encrypted-token",
    "expires_in_seconds": 900,
    "max_distance_km": 3,
    "items": [
      {
        "cart_id": 101,
        "item_id": 501,
        "item_name": "Wholemeal Bread",
        "item_image": "https://cdn.example/item.jpg",
        "item_sku": "BRD-WHL",
        "quantity": 2,
        "current_price": 45000,
        "subtotal": 90000
      }
    ],
    "address": {
      "address_id": 55,
      "address_name": "Rumah",
      "full_address": "Jl. Contoh No. 1",
      "coordinate": "-6.200000,106.816666"
    },
    "payment_options": [
      {
        "ms_payment_id": 4,
        "ms_payment_name": "Midtrans",
        "ms_payment_identifier": "MIDTRANS"
      }
    ],
    "delivery_options": [
      {
        "ms_delivery_id": 6,
        "ms_delivery_name": "GoSend",
        "ms_delivery_identifier": "GOSEND"
      }
    ],
    "shipping_options": [
      {
        "service": "Instant",
        "description": "Instant",
        "distance": 2.4,
        "cost": [
          {
            "value": 18000,
            "etd": ""
          }
        ],
        "source": "gosend"
      }
    ],
    "selected": {
      "ms_payment_id": 4,
      "ms_delivery_id": 6,
      "shipping_service": "Instant"
    },
    "summary": {
      "transaction_amount": 90000,
      "transaction_discount": 0,
      "transaction_shipping_fee": 18000,
      "transaction_total_amount": 108000
    },
    "marketplace_preview": {
      "transaction_amount": 90000,
      "transaction_discount": 0,
      "transaction_shipping_fee": 18000,
      "transaction_total_amount": 108000,
      "current_order": []
    }
  }
}
```

#### Success Response: Butuh Pilihan Delivery/Shipping

Gunakan response ini jika core sudah menemukan toko eligible, tetapi request belum cukup untuk preview final karena user belum memilih delivery, payment, atau shipping service.

HTTP status:

```text
200
```

Body:

```json
{
  "status": true,
  "message": "Checkout dapat dilanjutkan",
  "data": {
    "quote_status": "needs_selection",
    "quote_token": "signed-or-encrypted-token",
    "expires_in_seconds": 900,
    "max_distance_km": 3,
    "items": [],
    "address": {
      "address_id": 55,
      "address_name": "Rumah",
      "full_address": "Jl. Contoh No. 1",
      "coordinate": "-6.200000,106.816666"
    },
    "payment_options": [],
    "delivery_options": [],
    "shipping_options": [],
    "selected": {
      "ms_payment_id": null,
      "ms_delivery_id": null,
      "shipping_service": null
    },
    "summary": {
      "transaction_amount": 0,
      "transaction_discount": 0,
      "transaction_shipping_fee": 0,
      "transaction_total_amount": 0
    },
    "marketplace_preview": null
  }
}
```

Field `items`, `payment_options`, `delivery_options`, dan `shipping_options` harus diisi jika data tersedia. Contoh di atas boleh kosong hanya jika data belum tersedia dari upstream atau belum dipilih.

#### Error Response: Cart Kosong

HTTP status:

```text
422
```

Body:

```json
{
  "status": false,
  "code": "EMPTY_CART_SELECTION",
  "message": "Pilih minimal satu item untuk checkout",
  "data": {
    "unavailable_items": []
  }
}
```

#### Error Response: Alamat Tidak Valid

HTTP status:

```text
422
```

Body:

```json
{
  "status": false,
  "code": "ADDRESS_COORDINATE_REQUIRED",
  "message": "Lengkapi titik lokasi alamat sebelum checkout",
  "data": {
    "address_id": 55
  }
}
```

#### Error Response: Tidak Ada Toko Dalam Radius

HTTP status:

```text
422
```

Body:

```json
{
  "status": false,
  "code": "NO_STORE_WITHIN_RADIUS",
  "message": "Belum ada toko yang dapat melayani alamat ini",
  "data": {
    "max_distance_km": 3,
    "unavailable_items": []
  }
}
```

#### Error Response: Tidak Ada Satu Toko Dengan Stok Lengkap

HTTP status:

```text
422
```

Body:

```json
{
  "status": false,
  "code": "NO_SINGLE_STORE_CAN_FULFILL_CART",
  "message": "Beberapa item tidak tersedia untuk alamat pengiriman ini",
  "data": {
    "max_distance_km": 3,
    "unavailable_items": [
      {
        "cart_id": 102,
        "item_id": 502,
        "item_name": "Sourdough",
        "requested_quantity": 3,
        "available_quantity": 0,
        "reason": "OUT_OF_STOCK_IN_ELIGIBLE_STORES"
      }
    ]
  }
}
```

#### Error Response: Upstream Marketplace Gagal

HTTP status:

```text
502
```

Body:

```json
{
  "status": false,
  "code": "MARKETPLACE_UPSTREAM_ERROR",
  "message": "Gagal memeriksa ketersediaan produk. Silakan coba lagi.",
  "data": {
    "upstream": "MARKETPLACE_CORE",
    "operation": "FETCH_STORE_OR_STOCK"
  }
}
```

#### Error Response: Jarak GoSend Tidak Tersedia

HTTP status:

```text
422
```

Body:

```json
{
  "status": false,
  "code": "GOSEND_DISTANCE_UNAVAILABLE",
  "message": "Jarak pengiriman belum dapat dihitung. Silakan coba lagi.",
  "data": {
    "max_distance_km": 3,
    "operation": "GOSEND_COST_DISTANCE"
  }
}
```

#### Definisi Field Response

| Field | Type | Definisi |
| --- | --- | --- |
| `status` | boolean | `true` jika request valid dan quote berhasil diproses. |
| `message` | string | Pesan user-facing. |
| `code` | string | Error code stabil untuk frontend. Hanya ada pada error response. |
| `data.quote_status` | string | `ready` jika preview final siap, `needs_selection` jika masih perlu pilihan payment/delivery/shipping. |
| `data.quote_token` | string | Token internal dari core. Token menyimpan selected store secara tersembunyi dan harus divalidasi ulang saat commit. |
| `data.expires_in_seconds` | number | Masa berlaku token. Rekomendasi 900 detik. |
| `data.max_distance_km` | number | Radius maksimal yang dipakai core. |
| `data.items` | array<object> | Item checkout yang sudah dinormalisasi. Tidak mengandung identitas toko. |
| `data.address` | object | Alamat tujuan pengiriman milik member. |
| `data.payment_options` | array<object> | Payment method yang eligible untuk toko internal terpilih. Jangan return payment non-eligible. |
| `data.delivery_options` | array<object> | Delivery method yang eligible untuk toko internal terpilih. |
| `data.shipping_options` | array<object> | Opsi jasa pengiriman dari API GoSend atau upstream shipping untuk origin toko internal dan destination alamat. |
| `data.selected` | object | Pilihan payment/delivery/shipping yang sedang aktif. |
| `data.summary` | object | Ringkasan biaya yang mudah dipakai UI. |
| `data.marketplace_preview` | object|null | Response preview dari `backend-mediacartz`, disanitasi jika mengandung identitas toko. |
| `data.unavailable_items` | array<object> | Item yang menyebabkan cart tidak dapat dipenuhi oleh satu toko eligible. |

#### Behavior Jika Data Tidak Tersedia

1. Jika tidak ada selected cart item, return `422 EMPTY_CART_SELECTION`.
2. Jika alamat tidak ditemukan atau bukan milik member, return `404 ADDRESS_NOT_FOUND`.
3. Jika alamat ada tetapi coordinate kosong/invalid, return `422 ADDRESS_COORDINATE_REQUIRED`.
4. Jika daftar toko marketplace kosong, return `422 NO_STORE_WITHIN_RADIUS` atau `502 MARKETPLACE_UPSTREAM_ERROR` jika upstream error.
5. Jika produk tidak ditemukan di marketplace, return `422 NO_SINGLE_STORE_CAN_FULFILL_CART` dan isi `unavailable_items`.
6. Jika shipping options tidak tersedia untuk delivery yang dipilih, return `422 SHIPPING_UNAVAILABLE`.
7. Jika API GoSend tidak bisa menghitung jarak untuk semua kandidat toko, return `422 GOSEND_DISTANCE_UNAVAILABLE` jika request berhasil tetapi data jarak tidak tersedia, atau `502 MARKETPLACE_UPSTREAM_ERROR` jika upstream error.
8. Tidak ada konsep periode tanggal pada endpoint ini. Jika ada parameter periode seperti `from_date`, `until_date`, atau `period`, implementor tidak boleh menambahkan behavior baru tanpa keputusan bisnis. Abaikan atau tolak sebagai invalid sesuai pola validator yang dipilih, tetapi jangan membuat kalkulasi berdasarkan periode.
9. Jika alamat berubah setelah quote berhasil, endpoint quote harus menghasilkan `quote_token` baru, `shipping_options` baru, dan `summary` baru berdasarkan alamat terbaru.

### 2. Commit Checkout

#### Method

```text
POST
```

#### URL

```text
/api/v1/member/checkout/commit
```

#### Query Parameter

Tidak ada query parameter.

#### Request Body

```json
{
  "quote_token": "signed-or-encrypted-token",
  "client_request_id": "checkout-1780000000000-a1b2c3"
}
```

#### Field Definition

| Field | Type | Required | Definisi |
| --- | --- | --- | --- |
| `quote_token` | string | MUST | Token dari response quote. |
| `client_request_id` | string | SHOULD | Idempotency key. Harus sama dengan quote jika sudah ada. |

#### Success Response

HTTP status:

```text
200
```

Body:

```json
{
  "status": true,
  "message": "Checkout berhasil diproses",
  "data": {
    "transaction": {
      "transaction_id": 9001,
      "transaction_number": "TRX-20260904-0001",
      "transaction_amount": 90000,
      "transaction_discount": 0,
      "transaction_shipping_fee": 18000,
      "transaction_total_amount": 108000
    }
  },
  "token": "midtrans-snap-token"
}
```

#### Error Response: Token Invalid

HTTP status:

```text
422
```

Body:

```json
{
  "status": false,
  "code": "INVALID_QUOTE_TOKEN",
  "message": "Data checkout tidak valid. Silakan ulangi checkout dari keranjang.",
  "data": null
}
```

#### Error Response: Token Expired

HTTP status:

```text
422
```

Body:

```json
{
  "status": false,
  "code": "QUOTE_EXPIRED",
  "message": "Sesi checkout sudah kedaluwarsa. Silakan tinjau ulang pesanan.",
  "data": {
    "expired": true
  }
}
```

#### Error Response: Stok Berubah Saat Commit

HTTP status:

```text
409
```

Body:

```json
{
  "status": false,
  "code": "FULFILLMENT_CHANGED",
  "message": "Stok atau ketersediaan toko berubah. Silakan tinjau ulang pesanan.",
  "data": {
    "unavailable_items": [
      {
        "cart_id": 102,
        "item_id": 502,
        "item_name": "Sourdough",
        "requested_quantity": 3,
        "available_quantity": 1,
        "reason": "INSUFFICIENT_STOCK"
      }
    ]
  }
}
```

#### Error Response: Upstream Order Gagal

HTTP status:

```text
502
```

Body:

```json
{
  "status": false,
  "code": "MARKETPLACE_ORDER_FAILED",
  "message": "Gagal membuat pesanan. Silakan coba lagi.",
  "data": {
    "upstream_message": "invalid stock"
  }
}
```

#### Definisi Field Response

| Field | Type | Definisi |
| --- | --- | --- |
| `status` | boolean | `true` jika order final berhasil dibuat. |
| `message` | string | Pesan user-facing. |
| `token` | string|null | Midtrans Snap token dari marketplace jika tersedia. |
| `data.transaction` | object | Ringkasan transaksi final yang aman ditampilkan. |
| `code` | string | Error code stabil pada error response. |
| `data.unavailable_items` | array<object> | Item yang gagal dipenuhi pada re-check commit. |

#### Behavior Jika Data Tidak Tersedia

1. Jika `quote_token` kosong, return `422 INVALID_QUOTE_TOKEN`.
2. Jika token tidak bisa didecode/diverifikasi, return `422 INVALID_QUOTE_TOKEN`.
3. Jika token expired, return `422 QUOTE_EXPIRED`.
4. Jika cart item sudah dihapus setelah quote, return `409 FULFILLMENT_CHANGED`.
5. Jika alamat pada token tidak sama dengan alamat/cart context terbaru yang divalidasi core, return `409 FULFILLMENT_CHANGED`.
6. Jika stok berubah setelah quote, return `409 FULFILLMENT_CHANGED`.
7. Jika toko tidak lagi eligible karena radius/config berubah, return `409 FULFILLMENT_CHANGED`.
8. Jika `backend-mediacartz` gagal membuat order, return `502 MARKETPLACE_ORDER_FAILED`.
9. Tidak ada konsep periode tanggal pada endpoint commit.

## Perubahan Endpoint Existing

### `GET /api/v1/member/cart`

#### MUST

Response baru untuk flow customer marketplace harus berbentuk flat list.

Contoh response:

```json
{
  "status": true,
  "data": [
    {
      "cart_id": 101,
      "item_id": 501,
      "item_name": "Wholemeal Bread",
      "quantity": 2,
      "note": "",
      "item_image": "https://cdn.example/item.jpg",
      "menu_slug": "wholemeal-bread",
      "checked": "1",
      "current_price": 45000,
      "menu_current_quantity": 10,
      "item_sku": "BRD-WHL"
    }
  ]
}
```

Field definition:

| Field | Type | Definisi |
| --- | --- | --- |
| `cart_id` | number | ID cart di core. |
| `item_id` | number | ID item marketplace. |
| `item_name` | string | Nama produk. |
| `quantity` | number | Quantity di cart. |
| `note` | string|null | Catatan item. |
| `item_image` | string|null | Gambar produk. |
| `menu_slug` | string|null | Slug/menu reference jika masih tersedia. |
| `checked` | string | `1` jika item dipilih, `0` jika tidak. |
| `current_price` | number|null | Harga display dari marketplace, boleh null jika upstream gagal. |
| `menu_current_quantity` | number|null | Stok agregat atau stok display. Tidak boleh dianggap final fulfillment. |
| `item_sku` | string|null | SKU item jika tersedia. |

#### SHOULD

Untuk backward compatibility, controller boleh menerima response lama internal grouped, tetapi client baru harus menormalisasi menjadi flat list.

#### MUST NOT

Jangan return `store_slug` dan `store_name` pada response customer baru.

### `POST /api/v1/member/cart`

#### Request Baru

```json
{
  "item_id": 501,
  "item_name": "Wholemeal Bread",
  "quantity": 1,
  "note": "",
  "item_image": "https://cdn.example/item.jpg",
  "menu_slug": "wholemeal-bread"
}
```

#### MUST

1. `store_slug` dan `store_name` tidak required.
2. Jika request lama masih mengirim `store_slug/store_name`, flow baru boleh menyimpan untuk backward compatibility, tetapi tidak boleh menjadi sumber kebenaran checkout.
3. Duplicate item pada flow baru merge berdasarkan `member_id + item_id`.

### `PUT /api/v1/member/cart`

#### MUST

1. Tetap bisa update `quantity`, `checked`, `note`.
2. Jangan menerima update `store_slug/store_name` sebagai bagian dari flow baru.
3. Jika client lama mengirim store metadata, boleh diabaikan.

### `GET /api/v1/public/product`

#### MUST

1. Response tidak boleh mengekspos daftar toko.
2. Jika marketplace response punya `menu[]` per toko, core harus sanitasi sebelum dikirim ke client.
3. Product list tetap mendukung search/category existing.

Contoh item response yang aman:

```json
{
  "item_id": 501,
  "item_slug": "wholemeal-bread",
  "item_name": "Wholemeal Bread",
  "item_image": ["https://cdn.example/item.jpg"],
  "item_regular_price": 50000,
  "item_discount_price": 45000,
  "current_price": 45000,
  "available": true,
  "stock_status": "available",
  "review_summary": {
    "average": 4.8,
    "total": 12
  }
}
```

### `GET /api/v1/public/product/detail`

#### MUST

1. Response detail produk tidak boleh menampilkan `store_slug`, `store_name`, `store_address`, `store_coordinate`, atau daftar toko.
2. Response boleh menampilkan availability agregat.
3. Add-to-cart dari detail produk tidak boleh butuh store.

## Client Flow Baru

### Product List

MUST:

1. Tampilkan produk tanpa toko.
2. Jangan tampilkan stok per toko.
3. Jika produk unavailable secara agregat, tombol detail tetap boleh aktif, tetapi add cart dapat disabled jika response menyatakan unavailable.

### Product Detail

MUST:

1. Hapus section toko.
2. Hapus kalkulasi jarak toko di frontend.
3. Satu tombol add cart.
4. Payload add cart tanpa store.

### Cart

MUST:

1. Tampilkan satu list item.
2. Checkbox tetap boleh ada.
3. Quantity tetap bisa diubah.
4. Tombol `Beli` membawa `selected_cart_ids`.
5. Jika belum ada address, arahkan ke profile/address seperti existing.
6. Jangan menulis `store_slug` ke `sessionStorage`.
7. Jika user mengganti alamat aktif dari cart, refresh status cart/checkout melalui quote ulang sebelum lanjut.
8. Jika alamat berubah, hapus `quote_token`, selected shipping, dan checkout preview lama dari state/session storage.

### Order

MUST:

1. Tidak memerlukan `storeSlug`.
2. Load cart selected berdasarkan `selected_cart_ids`.
3. Load address member.
4. Jika address belum punya coordinate, tampilkan pesan untuk melengkapi titik lokasi.
5. Panggil quote endpoint.
6. Tampilkan item, address, payment, delivery, shipping, voucher, total.
7. Saat user klik `Tinjau Pesanan`, quote harus menghasilkan `quote_status=ready`.
8. Navigate ke `/order/preorder` dengan payload yang berisi `quote_token` dan preview aman, bukan store.
9. Setiap perubahan address harus langsung memicu quote ulang.
10. Setelah address berubah, selected shipping lama harus direset karena ongkir bergantung pada alamat baru dan toko internal yang mungkin berubah.

### PreOrder

MUST:

1. Tidak memerlukan `storeSlug`.
2. Tidak fetch `PUBLIC_STORE`.
3. Menampilkan preview dari quote.
4. Klik bayar memanggil commit endpoint.
5. Jika commit sukses dan ada `token`, buka Midtrans seperti existing.
6. Jika commit gagal karena `FULFILLMENT_CHANGED`, arahkan user kembali ke order/cart untuk quote ulang.
7. Jika user kembali ke order lalu mengganti alamat, payload preorder lama tidak boleh dipakai lagi.

## Quote Token

### MUST

1. Token dibuat oleh `core.loyalty.system`.
2. Token tidak boleh dibuat oleh frontend.
3. Token harus menyimpan selected store secara tersembunyi.
4. Token harus punya expiry.
5. Token harus diverifikasi saat commit.
6. Commit tetap re-check stok dan radius walaupun token valid.

### SHOULD

1. Gunakan Node built-in `crypto` untuk signed token atau encrypted token.
2. Jangan tambah dependency baru.
3. Token payload minimal:
   - `member_id`
   - `selected_cart_ids`
   - `address_id`
   - normalized `address_coordinate`
   - selected internal `store_id`
   - selected internal `store_slug`
   - normalized item payload
   - selected `ms_payment_id`
   - selected `ms_delivery_id`
   - selected `shipping_service`
   - `client_request_id`
   - `expires_at`

### MUST NOT

1. Jangan return decoded token payload ke client.
2. Jangan return selected store identity di quote response.
3. Jangan menerima commit jika token dibuat dari alamat berbeda dari alamat checkout terbaru.

## Error Code Registry

Gunakan code berikut agar frontend tidak perlu parse message.

| Code | HTTP | Arti |
| --- | --- | --- |
| `EMPTY_CART_SELECTION` | 422 | Tidak ada cart item yang dipilih. |
| `ADDRESS_NOT_FOUND` | 404 | Address tidak ditemukan atau bukan milik member. |
| `ADDRESS_COORDINATE_REQUIRED` | 422 | Address tidak punya coordinate valid. |
| `NO_STORE_WITHIN_RADIUS` | 422 | Tidak ada toko dalam radius maksimal. |
| `NO_SINGLE_STORE_CAN_FULFILL_CART` | 422 | Tidak ada satu toko yang stoknya cukup untuk semua item. |
| `GOSEND_DISTANCE_UNAVAILABLE` | 422 | API GoSend tidak mengembalikan jarak yang bisa dipakai untuk validasi radius. |
| `SHIPPING_UNAVAILABLE` | 422 | Tidak ada opsi shipping untuk toko/alamat/delivery yang dipilih. |
| `PAYMENT_UNAVAILABLE` | 422 | Payment method tidak eligible. |
| `MARKETPLACE_UPSTREAM_ERROR` | 502 | Gagal membaca data marketplace. |
| `INVALID_QUOTE_TOKEN` | 422 | Token quote kosong/invalid. |
| `QUOTE_EXPIRED` | 422 | Token quote sudah expired. |
| `FULFILLMENT_CHANGED` | 409 | Stok/radius/cart berubah antara quote dan commit. |
| `MARKETPLACE_ORDER_FAILED` | 502 | Upstream gagal membuat order final. |

## Open Questions / Assumptions

1. Radius maksimal:
   - Assumption: gunakan `MARKETPLACE_MAX_FULFILLMENT_DISTANCE_KM` dengan default `3`.
   - Assumption: jarak aktual toko ke pelanggan diambil dari API GoSend cost.
   - Open question: apakah radius berbeda per company, per store, atau per delivery method?

2. Pickup:
   - Assumption: issue ini fokus delivery checkout.
   - Open question: apakah pickup masih ditawarkan di flow customer? Jika iya, pelanggan harus mengetahui lokasi toko, sehingga bertentangan dengan tujuan hidden store.

3. Source of store coordinate:
   - Assumption: coordinate toko tersedia dari response marketplace store/menu.
   - Open question: field coordinate toko mana yang paling resmi dari `backend-mediacartz`?

4. Source of distance:
   - Assumption: API GoSend cost dari `backend-mediacartz` mengembalikan field jarak yang bisa diparse oleh core.
   - Open question: field response GoSend mana yang paling stabil untuk jarak, misalnya `distance_km.Instant`, `data.Instant.distance`, atau field lain?

5. Product availability display:
   - Assumption: product list/detail boleh menampilkan availability agregat.
   - Open question: apakah bisnis ingin menyembunyikan angka stok dan hanya menampilkan `Tersedia/Habis`?

6. Stock reservation:
   - Assumption: karena `backend-mediacartz` tidak boleh diubah, core hanya bisa re-check sebelum commit.
   - Open question: apakah risiko race condition stok diterima sampai nanti ada reservation di marketplace backend?

7. Existing cart rows with store metadata:
   - Assumption: cart lama tetap bisa dibaca dan diflatten.
   - Open question: apakah perlu migration untuk menghapus store metadata dari cart? Issue ini menyarankan tidak perlu agar scope tetap kecil.

8. Voucher company:
   - Assumption: voucher validation tetap mengikuti logic existing berdasarkan company selected store internal.
   - Open question: jika customer tidak tahu company/store, apakah voucher yang tidak eligible disembunyikan atau ditampilkan disabled?

9. Periode:
   - Assumption: tidak ada period/date-range behavior pada checkout fulfillment.
   - Open question: jika bisnis nantinya membutuhkan stok berdasarkan periode/jam operasional, buat issue terpisah.

## Acceptance Criteria

### Core MUST

1. Endpoint `POST /api/v1/member/checkout/quote` tersedia dan memakai auth member.
2. Endpoint `POST /api/v1/member/checkout/commit` tersedia dan memakai auth member.
3. Quote memilih satu toko internal yang memenuhi semua item.
4. Quote gagal jika tidak ada toko dalam radius maksimal.
5. Quote gagal jika tidak ada satu toko dengan stok lengkap.
6. Quote tidak mengembalikan identitas toko.
7. Commit memvalidasi ulang token, cart, stok, radius berdasarkan API GoSend, payment, delivery, dan shipping.
8. Commit mengirim satu order ke `backend-mediacartz`.
9. Commit tidak pernah membuat lebih dari satu order untuk satu checkout.
10. Existing `POST /api/v1/member/transaction` tidak dihapus.
11. Commit menolak quote token yang dibuat dari alamat lama setelah alamat checkout berubah.

### Client MUST

1. Product detail tidak menampilkan daftar toko.
2. Add cart tidak mengirim store.
3. Cart tidak dikelompokkan per toko.
4. Cart tidak menampilkan nama toko.
5. Order tidak butuh `storeSlug`.
6. Order memakai quote endpoint.
7. PreOrder memakai commit endpoint.
8. Frontend tidak menghitung radius atau memilih toko.
9. Semua request marketplace tetap melalui `core.loyalty.system`.
10. Cart/order menghapus checkout preview, selected shipping, dan quote token lama saat alamat berubah.
11. Cart/order memuat ulang alamat terbaru setelah user edit alamat di profile/address form.

## Skenario Yang Perlu Diuji

Jangan tulis detail implementasi unit test. Cukup pastikan skenario berikut dicek manual atau otomatis sesuai pola project.

1. User menambah satu produk ke cart dari product detail tanpa memilih toko.
2. User menambah dua produk berbeda ke cart tanpa memilih toko.
3. Cart menampilkan item sebagai satu list tanpa header toko.
4. User checkout dengan alamat yang punya coordinate valid.
5. Core memilih toko internal dan quote berhasil saat satu toko punya semua stok.
6. Core memilih toko lain dalam radius jika toko terdekat stoknya tidak lengkap.
7. Quote gagal jika semua toko dalam radius tidak punya stok lengkap.
8. Quote gagal jika semua toko dengan stok lengkap berada di luar radius.
9. Quote gagal jika address tidak punya coordinate.
10. Quote gagal jika selected cart id bukan milik member login.
11. Quote tidak mengembalikan `store_id`, `store_slug`, `store_name`, alamat toko, atau coordinate toko.
12. Core memakai response API GoSend untuk menentukan jarak toko ke pelanggan.
13. Quote gagal dengan `GOSEND_DISTANCE_UNAVAILABLE` jika jarak tidak tersedia dari GoSend untuk semua kandidat toko.
14. Order page menampilkan shipping options setelah quote.
15. Saat user mengganti alamat di order page, frontend menghapus quote/shipping lama dan memanggil quote ulang.
16. Saat user mengedit coordinate alamat di profile lalu kembali ke cart/order, cart/order memuat alamat terbaru sebelum quote.
17. Commit gagal dengan `FULFILLMENT_CHANGED` jika memakai quote token dari alamat lama.
18. Jika alamat aktif checkout dihapus, checkout berhenti dan user diminta memilih/membuat alamat baru.
19. Voucher tetap divalidasi terhadap company internal selected store.
20. PreOrder menampilkan preview tanpa fetch store.
21. Commit berhasil membuat satu order dan mengembalikan Midtrans token.
22. Commit gagal dengan `FULFILLMENT_CHANGED` jika stok berubah setelah quote.
23. Commit gagal dengan `QUOTE_EXPIRED` jika token expired.
24. Existing transaction list/detail tetap berjalan.
25. Existing profile address create/edit tetap berjalan.
26. Frontend tidak melakukan request langsung ke `backend-mediacartz`.

## Di Luar Scope

1. Mengubah `backend-mediacartz`.
2. Membuat stock reservation di marketplace backend.
3. Mengubah GoSend booking logic di marketplace backend.
4. Mengubah payment gateway.
5. Mengubah point calculation.
6. Mengubah settlement/reporting.
7. Menghapus kolom `store_slug/store_name` dari cart.
8. Mengubah CMS/admin flow.
9. Mengubah POS/mobile behavior.
10. Menambahkan unit test detail di issue ini.

## Catatan Untuk Implementor

1. Mulai dari `core.loyalty.system` endpoint quote.
2. Pastikan response quote tidak expose toko.
3. Baru ubah client agar berhenti membawa `storeSlug`.
4. Setelah client memakai quote/commit, baru rapikan tampilan product detail dan cart.
5. Jangan sentuh `backend-mediacartz`.
6. Jika menemukan field marketplace yang ambigu, catat di PR/commit note dan jangan membuat business rule baru diam-diam.
