# PRD: Modul Produk, Cart, dan Checkout

## 1. Ringkasan
Dokumen ini mendefinisikan kebutuhan produk untuk alur belanja pada aplikasi loyalty, khusus area:
1. Discovery produk.
2. Pengelolaan cart.
3. Checkout hingga pembuatan transaksi.

PRD ini berfokus pada API backend yang sudah ada, supaya implementasi lanjutan oleh junior programmer/AI model tetap konsisten.

## 2. Latar Belakang Masalah
Member perlu alur belanja yang sederhana dari lihat produk sampai checkout. Saat ini endpoint utama sudah tersedia, tetapi ada beberapa gap konsistensi dan kelengkapan flow yang perlu dijadikan acuan produk tunggal.

## 3. Tujuan Produk
1. Member dapat menemukan produk yang relevan dari store/partner.
2. Member dapat mengelola cart per store dengan stabil.
3. Member dapat melakukan checkout (preview ongkir/biaya, place order, resume transaksi).
4. Tim memiliki acuan requirement yang jelas untuk pengembangan iterasi berikutnya.

## 4. KPI Utama
1. `Product View -> Add to Cart Rate`.
2. `Cart -> Checkout Initiated Rate`.
3. `Checkout Initiated -> Order Success Rate`.
4. Error rate endpoint produk/cart/checkout.
5. Latensi endpoint member-facing (p95).

## 5. Persona
1. Member: pengguna akhir yang belanja produk.
2. Admin/Operasional: memantau transaksi dan isu order.
3. Sistem Marketplace Core (dependency eksternal): sumber data produk, ongkir, dan order.

## 6. Scope

### In Scope
1. List/store/product discovery untuk member.
2. Product discovery untuk public endpoint.
3. Cart CRUD (create, read, update, delete) untuk member.
4. Shipping cost estimation.
5. Checkout preview fee, place order, dan resume order.
6. Riwayat transaksi member.

### Out of Scope
1. UI/UX frontend detail.
2. Integrasi payment callback/webhook end-to-end.
3. Engine promosi kompleks di luar `voucher_code`.
4. OMS/fulfillment pasca-order.

## 7. User Flow End-to-End
1. Member membuka daftar produk dari store terkait partner default.
2. Member membuka detail produk (berdasarkan `slug`).
3. Member menambahkan produk ke cart.
4. Sistem menggabungkan quantity jika item yang sama dari store yang sama sudah ada di cart.
5. Member melihat cart yang dikelompokkan per `store_slug`.
6. Member meminta estimasi ongkir dengan `store_id` dan tujuan pengiriman.
7. Member melakukan preview checkout (`preview_fee=true`) untuk validasi biaya.
8. Member submit checkout final (`preview_fee=false`) untuk membuat order.
9. Sistem menyimpan log request/response checkout ke tabel `transactions`.
10. Jika perlu lanjut bayar/ulang proses, member melakukan `resume` transaksi.

## 8. Functional Requirements

| ID | Modul | Requirement | Prioritas | Acceptance Criteria |
| --- | --- | --- | --- | --- |
| FR-PROD-01 | Product | Member bisa melihat list produk dari default partner store | Must | `GET /api/v1/member/product` mengembalikan `status=true` dan data produk |
| FR-PROD-02 | Product | Member bisa melihat detail produk via slug | Must | `GET /api/v1/member/product/get?slug=...` mengembalikan detail |
| FR-PROD-03 | Product | Public user bisa melihat list store by company slug | Should | `GET /api/v1/public/store` mendukung `company_slug`/default slug |
| FR-PROD-04 | Product | Public user bisa melihat list produk | Should | `GET /api/v1/public/product` mendukung `store_slug` atau `company_slug` |
| FR-PROD-05 | Product | Public user bisa melihat detail produk + ringkasan review | Should | `GET /api/v1/public/product/detail` mengembalikan `review_summary` |
| FR-CART-01 | Cart | Member bisa menambah item ke cart | Must | `POST /api/v1/member/cart` sukses dengan payload valid |
| FR-CART-02 | Cart | Duplicate item dalam store yang sama akan merge quantity | Must | Item dengan `member_id + item_id + store_slug` ditambah ke baris yang sama |
| FR-CART-03 | Cart | Member bisa melihat cart terkelompok per store | Must | `GET /api/v1/member/cart` return format grouped `{store_slug, store_name, items[]}` |
| FR-CART-04 | Cart | Member bisa edit quantity/note/checked/store metadata item cart | Must | `PUT /api/v1/member/cart` sukses untuk `cart_id` valid |
| FR-CART-05 | Cart | Member bisa hapus item cart | Must | `DELETE /api/v1/member/cart` sukses untuk `cart_id` valid |
| FR-CHK-01 | Checkout | Member bisa melihat biaya pengiriman | Must | `GET /api/v1/member/shipping/cost` return `status=true` untuk parameter valid |
| FR-CHK-02 | Checkout | Member bisa preview biaya checkout sebelum order final | Must | `POST /api/v1/member/transaction` dengan `preview_fee=true` mengembalikan preview dari core |
| FR-CHK-03 | Checkout | Member bisa membuat order final | Must | `POST /api/v1/member/transaction` dengan `preview_fee=false` mengembalikan `status=true`, `data`, `token` |
| FR-CHK-04 | Checkout | Sistem wajib validasi cashier aktif sebelum order final | Must | Jika cashier tidak valid, response `status=false` dengan pesan error |
| FR-CHK-05 | Checkout | Sistem menyimpan audit request/response order | Must | Tabel `transactions` terisi saat order final sukses |
| FR-CHK-06 | Checkout | Member bisa melihat riwayat transaksi | Must | `GET /api/v1/member/transaction` mengembalikan data transaksi dari core |
| FR-CHK-07 | Checkout | Member bisa melanjutkan transaksi yang belum selesai | Must | `PUT /api/v1/member/transaction/resume` forward payload dan return status hasil core |
| FR-CHK-08 | Checkout | Detail transaksi per ID tersedia | Should | `GET /api/v1/member/transaction/get` terimplementasi dan punya response kontrak jelas |

## 9. Aturan Bisnis
1. Checkout dilakukan per store; payload checkout menggunakan `store_id` tunggal.
2. Jika `voucher_code` dikirim pada checkout, sistem menetapkan `voucher_type=loyalty`.
3. Metode pembayaran default saat ini menggunakan `ms_payment_id=4` (perlu dijaga konsistensinya atau dibuat konfigurabel).
4. Data alamat pengiriman menggunakan `shipping_destination` dan `shipping_destination_address`; koordinat alamat memakai field `coordinate`.

## 10. Mapping Endpoint (Current API)

### Product
1. `GET /api/v1/member/company/cashier`
2. `GET /api/v1/member/store`
3. `GET /api/v1/member/store/get`
4. `GET /api/v1/member/product`
5. `GET /api/v1/member/product/get`
6. `GET /api/v1/public/store`
7. `GET /api/v1/public/category`
8. `GET /api/v1/public/product`
9. `GET /api/v1/public/product/detail`
10. `GET /api/v1/public/product/review`

### Cart
1. `GET /api/v1/member/cart`
2. `GET /api/v1/member/cart/get`
3. `POST /api/v1/member/cart`
4. `PUT /api/v1/member/cart`
5. `DELETE /api/v1/member/cart`

### Checkout
1. `GET /api/v1/member/shipping/cost`
2. `POST /api/v1/member/transaction`
3. `PUT /api/v1/member/transaction/resume`
4. `GET /api/v1/member/transaction`
5. `GET /api/v1/member/transaction/get` (target implementasi)

## 11. Data Requirements
1. `carts`: menyimpan item cart, quantity, note, checked state, dan metadata store (`store_slug`, `store_name`).
2. `transactions`: menyimpan audit request/response checkout ke marketplace core.
3. `addresses`: minimal menyimpan `address_name`, `full_address`, `coordinate` untuk keperluan pengiriman.

## 12. Non-Functional Requirements
1. Ketersediaan: endpoint inti produk/cart/checkout harus graceful saat dependency core gagal.
2. Keamanan: semua endpoint member harus validasi kepemilikan data terhadap `auth.user.member_id`.
3. Konsistensi response: gunakan pola `status + data/message` secara konsisten.
4. Observability: log error harus cukup untuk tracing kegagalan call ke marketplace core.
5. Performa: target p95 endpoint member <= 3 detik pada kondisi normal dependency.

## 13. Risiko dan Technical Debt Saat Ini
1. `GET /api/v1/member/transaction/get` belum terimplementasi.
2. `CartController.get/edit/delete` belum memverifikasi kepemilikan `member_id` pada object `cart`.
3. Beberapa endpoint belum memakai validator request yang eksplisit.
4. Ketergantungan tinggi pada availability `MARKETPLACE_CORE`.

## 14. Rencana Delivery (Disarankan)
1. Phase 1: Hardening kontrak API (validator, ownership check, error handling konsisten).
2. Phase 2: Penyempurnaan checkout (`transaction/get`, retry strategy, observability).
3. Phase 3: Optimasi performa dan metrik funnel (product-to-cart-to-checkout conversion).

## 15. Skenario UAT (High Level)
1. Member dapat melihat daftar produk dan detail produk.
2. Member dapat menambah item ke cart dan quantity merge bekerja benar.
3. Cart tampil terkelompok per store.
4. Member dapat mengubah dan menghapus item cart.
5. Shipping cost berhasil dihitung untuk tujuan valid.
6. Preview checkout mengembalikan ringkasan biaya.
7. Checkout final menghasilkan token transaksi saat sukses.
8. Resume checkout berjalan untuk transaksi yang belum selesai.
9. Riwayat transaksi bisa diakses member.
