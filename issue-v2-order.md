# Issue V2 — Penyempurnaan Checkout `/order`, QRIS, dan Notifikasi WhatsApp

## Ringkasan

Issue ini menjadi panduan implementasi lintas aplikasi untuk:

1. memungkinkan quantity produk di halaman `/order` diubah melalui kontrol `[-] [Quantity] [+]`;
2. menghitung ulang seluruh nilai checkout setelah quantity berubah;
3. hanya menyediakan layanan pengiriman `Instant`;
4. memperbaiki warna teks tombol `Tutup` pada popup QRIS;
5. mengubah masa berlaku pembayaran QRIS menjadi 60 menit;
6. menambahkan tautan bantuan WhatsApp toko pada popup QRIS; dan
7. menyesuaikan notifikasi WhatsApp pembayaran serta status pengiriman untuk pembeli dan toko.

Dokumen ini ditulis sebagai work breakdown yang dapat diteruskan kepada junior programmer atau model AI yang lebih murah. Implementer tetap wajib membaca kode aktual sebelum mengubahnya dan tidak boleh menganggap nama field dari provider sebagai kontrak tanpa verifikasi.

## Struktur sistem dan scope

| Folder | Fungsi | Dampak issue |
| --- | --- | --- |
| `client.loyalty.system` | Frontend loyalty customer | **Scope utama:** quantity di `/order`, quote ulang, hanya menampilkan Instant, perbaikan popup QRIS, dan link WhatsApp toko |
| `core.loyalty.system` | Backend loyalty/proxy | **Scope utama:** validasi cart/quantity dan enforcement layanan Instant pada quote/commit |
| `backend-mediacartz` | Backend marketplace/`MARKETPLACE_CORE` | **Scope utama:** expiry QRIS 60 menit dan template/notifikasi WhatsApp |
| `cms.loyalty.system` | Frontend management loyalty | Tidak berubah dalam issue ini |
| `frontend-mediacartz-react` | Frontend marketplace | Tidak berubah dalam issue ini |

## Latar belakang

Halaman `/order` saat ini membaca item terpilih dari cart, tetapi perubahan quantity dilakukan di halaman cart. Pengguna perlu dapat memperbaiki jumlah produk tanpa kembali ke cart. Perubahan quantity berpengaruh pada subtotal, diskon/voucher, ongkir, total pembayaran, alokasi balance, dan nilai QRIS sehingga perhitungan tidak boleh hanya dilakukan di browser.

Checkout juga masih dapat menerima lebih dari satu hasil layanan GoSend, sedangkan kebutuhan bisnis saat ini hanya mengizinkan `Instant`. Popup QRIS telah menampilkan countdown berdasarkan expiry dari backend, tetapi konfigurasi backend saat ini masih default 10 menit. Selain itu, notifikasi pembayaran dan pengiriman yang sudah tersedia belum menggunakan copywriting serta kelengkapan data yang diminta.

## Kondisi kode saat issue dibuat

### `client.loyalty.system`

- Halaman checkout berada di `src/pages/Order/index.jsx`.
- Checkout menggunakan alur quote lalu commit. Quote server disimpan dalam `serverPreview` dan dibandingkan dengan ringkasan lokal sebelum commit.
- Item checkout berasal dari `selected_cart_ids` dan data cart; quantity belum dapat diedit di halaman `/order`.
- Pola edit quantity sudah tersedia di `src/pages/Cart/index.jsx` melalui endpoint `API.EDIT_CART`.
- Popup QRIS reusable berada di `src/components/QrisPaymentModal/index.jsx` dan digunakan dari lebih dari satu halaman.
- Countdown popup sudah memakai `payment.gateway.expires_at`, sehingga sumber waktu harus tetap berasal dari backend/provider.

### `core.loyalty.system`

- `app/Controllers/Http/CartController.js` sudah memvalidasi quantity sebagai integer, kepemilikan cart, dan stok terkini.
- Endpoint edit cart menghapus item saat quantity `0`. Untuk halaman `/order`, UI harus menggunakan minimum `1` agar item terpilih tidak hilang secara tidak sengaja.
- `app/Controllers/Http/CheckoutController.js` mengambil ulang cart milik member, membuat preview ke marketplace, menandatangani isi quote, lalu memverifikasi ulang saat commit.
- Quote saat ini memilih `shipping_service` yang diminta atau jatuh ke opsi pertama; belum ada enforcement khusus bahwa opsi tersebut harus `Instant`.

### `backend-mediacartz`

- QRIS Xendit dibuat oleh `app/Services/PaymentGateway/XenditPaymentGateway.js`.
- Default `XENDIT_QRIS_EXPIRY_MINUTES` masih 10 menit di `config/custom.js`, `.env.example`, dan fallback service.
- Transaksi retail juga menjadwalkan `closingUnfinishedTransaction` selama 30 menit di `app/Controllers/Http/TransactionController.js`; jadwal ini harus diselaraskan agar transaksi tidak ditutup sebelum QRIS berakhir.
- Notifikasi setelah pembayaran diproses oleh `app/Services/Notification/RetailPostPaymentService.js`.
- Notifikasi perubahan status GoSend diproses oleh `app/Services/DeliveryMethod/GosendWebhookService.js`.
- Pengiriman pesan menggunakan `app/Services/Notification/WhatsappNotificationService.js` dan kegagalan WhatsApp tidak boleh menggagalkan pembayaran atau webhook.

## Tujuan

1. Pengguna dapat mengubah quantity setiap item di `/order` dari 1 sampai stok terkini.
2. Setiap perubahan quantity yang berhasil tersimpan menghasilkan quote server baru.
3. Semua angka checkout selalu berasal dari quote server terbaru.
4. Pengguna hanya dapat memilih layanan pengiriman Instant.
5. Pembayaran QRIS berlaku 60 menit secara konsisten di provider, database, countdown UI, dan job penutupan transaksi.
6. Pengguna mudah menghubungi nomor WhatsApp toko dari popup pembayaran.
7. Pembeli dan toko menerima pesan WhatsApp yang sesuai event, mempunyai data yang benar, dan tidak terkirim ganda.

## Di luar cakupan

- Perubahan halaman pengelolaan order pada CMS.
- Perubahan dashboard marketplace.
- Penambahan provider pengiriman atau payment gateway baru.
- Perubahan tarif, formula voucher, atau formula ongkir.
- Fitur balas pesan WhatsApp atau inbox WhatsApp.
- Pengiriman ulang otomatis semua notifikasi historis.
- Perubahan quantity setelah order berhasil di-commit atau payment request sudah dibuat.

## Keputusan implementasi wajib

### 1. Server tetap menjadi sumber kebenaran

- Frontend boleh memperbarui tampilan quantity secara responsif, tetapi nilai final wajib mengikuti response edit cart dan quote checkout.
- Jangan menghitung diskon, voucher, ongkir, balance, atau total final hanya dengan rumus frontend.
- Quote lama harus dianggap tidak berlaku setelah quantity, alamat, voucher, delivery, shipping, payment, atau balance berubah.
- Commit hanya boleh memakai `quote_token` terbaru.

### 2. Minimum quantity pada `/order` adalah 1

- Tombol minus disabled saat quantity `1`.
- Penghapusan item tetap dilakukan dari halaman cart, bukan dengan menurunkan quantity menjadi `0` di `/order`.
- Tombol plus disabled saat mencapai stok terkini.
- Input quantity hanya menerima integer. Nilai kosong/non-angka dikembalikan ke nilai valid terakhir.

### 3. Perubahan quantity disimpan ke cart

Gunakan endpoint edit cart yang sudah ada; jangan membuat state quantity khusus yang tidak disimpan. Alur satu perubahan:

1. kunci kontrol pada baris item yang sedang diproses;
2. kirim `cart_id`, `item_id`, dan quantity baru ke `API.EDIT_CART`;
3. gunakan data cart terbaru dari response atau muat ulang cart bila kontrak response tidak lengkap;
4. pastikan item masih termasuk `selected_cart_ids`;
5. invalidate quote/token lama;
6. minta quote baru menggunakan pilihan checkout saat ini;
7. perbarui seluruh ringkasan dari response quote;
8. buka kembali kontrol setelah sukses/gagal.

Untuk mencegah race condition ketika tombol diklik cepat, implementasi boleh memakai debounce singkat atau antrean per item. Response lama tidak boleh menimpa response yang lebih baru. Tombol bayar/commit harus disabled selama edit cart atau quote ulang berlangsung.

Jika backend menolak karena stok berubah, tampilkan pesan yang mudah dipahami, pulihkan quantity dari response/data cart terkini, lalu quote ulang. Jangan mempertahankan angka optimistis yang ditolak backend.

### 4. Instant ditegakkan di frontend dan backend

- Normalisasi nama service secara case-insensitive dan trim whitespace. Nilai canonical yang dikirim ke marketplace tetap nilai service asli dari response, bukan label buatan frontend.
- Frontend hanya menampilkan opsi yang secara eksplisit merupakan `Instant`.
- Backend proxy juga hanya mengizinkan service `Instant`; request untuk service lain harus ditolak, bukan diam-diam diubah saat commit.
- Jika Instant tidak tersedia/serviceable, hentikan checkout dengan error `SHIPPING_UNAVAILABLE` atau kode setara dan pesan bahwa pengiriman Instant tidak tersedia untuk alamat tersebut.
- Jangan fallback ke opsi pertama karena urutan response provider tidak merupakan kontrak.

### 5. Expiry pembayaran adalah 60 menit

Sumber expiry utama adalah timestamp `expires_at` dari payment gateway. Perubahan wajib mencakup:

- nilai default dan contoh env menjadi `60`;
- fallback invalid-config pada Xendit menjadi 60 menit;
- request pembuatan QRIS mengirim expiry 60 menit;
- `transaction_payment_expires_at` menyimpan timestamp dari provider;
- countdown frontend membaca timestamp tersebut;
- job penutupan transaksi retail tidak berjalan sebelum expiry QRIS.

Gunakan satu konstanta/config duration. Hindari literal 60 menit yang tersebar. Jika job penutupan membutuhkan grace period untuk keterlambatan webhook, jadwalkan pada `expires_at + grace period` kecil yang terdokumentasi, bukan kembali ke 30 menit.

### 6. Link bantuan memakai nomor toko transaksi

- Nomor berasal dari toko yang terkait dengan checkout/order (`store_phone`), bukan nomor global atau nomor internal.
- Normalisasi nomor menjadi format tautan WhatsApp tanpa `+`, spasi, tanda kurung, atau tanda hubung; nomor Indonesia berawalan `0` diubah menjadi `62`.
- URL: `https://wa.me/<nomor-normalisasi>`.
- Buka di tab baru dengan `target="_blank"` dan `rel="noopener noreferrer"`.
- Bila nomor toko kosong/tidak valid, tampilkan teks bantuan tanpa link atau sembunyikan hanya bagian link. Popup tidak boleh crash.
- Bila popup dapat dibuka dari daftar transaksi, pastikan objek transaksi/API juga menyediakan nomor toko. Jangan hanya menyelesaikan kasus langsung setelah checkout.

### 7. Notifikasi harus event-driven dan idempotent

- Payment success hanya dikirim setelah status pembayaran benar-benar sukses/settled, bukan setelah QR dibuat.
- Status driver hanya dikirim ketika transisi status yang relevan benar-benar terjadi.
- Webhook retry/duplikat tidak boleh menghasilkan pesan yang sama dua kali.
- Catat marker per penerima dan event pada `transaction_data.post_payment_action` atau mekanisme idempotensi setara.
- Kegagalan WhatsApp dicatat tanpa menggagalkan transaksi, webhook, atau perubahan status pengiriman.
- Jangan log API key, payload sensitif, atau nomor telepon utuh bila tidak diperlukan.

## Rencana implementasi per aplikasi

## A. `client.loyalty.system`

### A1. Tambahkan editor quantity di `/order`

File utama:

- `src/pages/Order/index.jsx`

Pekerjaan:

- Tambahkan kontrol `[-] [Quantity] [+]` pada setiap produk di ringkasan order.
- Gunakan pola UI dan endpoint yang sudah ada di `src/pages/Cart/index.jsx`, tetapi minimum quantity di halaman order adalah 1.
- Tambahkan state loading per `cart_id`, bukan hanya loading global, agar status baris jelas.
- Tampilkan stok tersedia dari field yang benar (`available_quantity` pada response cart baru; beri fallback hanya untuk kompatibilitas data lama).
- Setelah edit berhasil, sinkronkan `carts`, subtotal lokal sementara, voucher yang masih terpilih, dan quote server.
- Apabila voucher tidak lagi valid akibat perubahan quantity/nominal, hapus pilihan voucher berdasarkan response backend dan tampilkan pemberitahuan.
- Reset `checkoutRequestIdRef` hanya jika pola idempotensi saat ini memang membuat request ID terkait satu snapshot checkout. Pastikan commit setelah perubahan tidak membawa snapshot lama.
- Disabled tombol checkout ketika `checkoutLoading`, edit quantity, atau requote sedang berjalan.

Catatan: hindari menyalin fungsi cart panjang secara utuh. Bila aman, ekstrak helper quantity/cart request kecil agar aturan batas quantity konsisten antara halaman Cart dan Order. Refactor besar tidak wajib untuk issue ini.

### A2. Hitung ulang seluruh nilai

Setelah quantity berubah, response quote terbaru minimal harus memperbarui:

- harga dan subtotal setiap item;
- jumlah total item;
- subtotal transaksi;
- diskon/voucher;
- ongkos kirim;
- total akhir;
- balance yang dapat/dipakai;
- sisa pembayaran QRIS;
- ringkasan pembanding sebelum commit.

Pertahankan indikator loading/skeleton pada ringkasan selama requote agar pengguna tidak mengira angka lama sudah final. Jika requote gagal, blokir commit sampai quote valid berhasil diperoleh.

### A3. Hanya tampilkan Instant

File utama:

- `src/pages/Order/index.jsx`

Pekerjaan:

- Filter hasil `normalizeGoSendCosts` atau tahap normalisasi setara agar hanya `Instant` yang masuk ke state pilihan.
- Jika hanya ada satu pilihan, boleh auto-select Instant tetapi tetap tampilkan label dan biayanya.
- Jangan kirim `SameDay`, service kosong, atau opsi pertama sebagai fallback.
- Tampilkan empty/error state khusus jika Instant tidak tersedia.

### A4. Perbarui popup QRIS

File utama:

- `src/components/QrisPaymentModal/index.jsx`

Pekerjaan:

- Ubah tombol aktif berlabel `Tutup` agar teksnya putih. Pastikan state `Kembali ke daftar transaksi` tetap mempunyai kontras yang layak; style boleh dibedakan berdasarkan state.
- Tambahkan informasi berikut pada state pembayaran aktif:

  `Mengalami kendala pembayaran atau status masih pending setelah membayar? Hubungi kami di sini`

- Jadikan hanya `Hubungi kami di sini` sebagai link WhatsApp toko.
- Tambahkan prop yang jelas, misalnya `storePhone` atau `supportWhatsappUrl`; jangan membuat komponen QRIS mengambil data toko sendiri.
- Pastikan semua pemanggil `QrisPaymentModal` mengirim data tersebut, sekurang-kurangnya:
  - `src/pages/Order/index.jsx`;
  - `src/pages/PreOrder/index.jsx` bila alur ini masih aktif untuk marketplace;
  - `src/pages/TransactionList/index.jsx` untuk pembayaran yang dilanjutkan dari daftar transaksi.
- Bila hanya flow `/order` yang secara bisnis aktif, pemanggil lain tetap harus kompatibel dan tidak error ketika prop tidak tersedia.

File kondisional:

- `src/utils/paymentGateway.js` — bila helper normalisasi nomor/link ingin ditempatkan bersama util pembayaran; lebih baik buat util kontak terpisah bila dipakai di luar QRIS.
- `src/utils/whatsapp.js` — **file baru opsional** untuk fungsi pure normalisasi nomor dan pembentukan URL.
- API/detail transaksi frontend dan backend terkait — hanya bila response transaksi belum memuat `store_phone`.

## B. `core.loyalty.system`

### B1. Pertahankan validasi quantity cart

File utama:

- `app/Controllers/Http/CartController.js`

Pekerjaan:

- Endpoint edit yang ada tetap menjadi jalur perubahan quantity.
- Pastikan response edit selalu mengembalikan cart terkini beserta `available_quantity`, harga terkini, availability, dan summary.
- Pertahankan validasi ownership, integer, nilai positif untuk flow `/order`, dan batas stok.
- Tidak perlu endpoint quantity baru kecuali ditemukan kontrak existing tidak dapat digunakan.

File kondisional:

- validator cart baru atau validator edit yang sudah ada, bila validasi masih hanya dilakukan inline dan tim ingin menyamakan response 422. Jangan membuat migration database untuk perubahan ini.

### B2. Enforcement Instant pada quote

File utama:

- `app/Controllers/Http/CheckoutController.js`

Pekerjaan:

- Tambahkan helper kecil untuk mengenali service Instant secara konsisten.
- Setelah `shippingOptions()` menghasilkan opsi serviceable, filter/temukan opsi Instant.
- Jika request mengirim `shipping_service`, nilai tersebut harus cocok dengan opsi Instant yang tersedia.
- Jika request tidak mengirim service dan Instant tersedia, pilih Instant.
- Jika Instant tidak tersedia, kembalikan error terstruktur dan jangan memanggil preview order dengan service lain.
- `quote_token` harus menyimpan service Instant yang dipilih.

### B3. Verifikasi ulang Instant dan snapshot cart saat commit

File utama:

- `app/Controllers/Http/CheckoutController.js`

Pekerjaan:

- Saat commit, minta ulang/validasi ketersediaan store, stok, cart, dan service Instant.
- Bandingkan isi cart terkini dengan `items` dalam quote: `cart_id`, `menu_id`/`item_id`, quantity, dan catatan yang memengaruhi order.
- Tolak commit dengan conflict yang dapat ditindaklanjuti jika quantity atau stok berubah setelah quote.
- Jangan membiarkan request commit menimpa `shipping_service`, item, atau total yang sudah ditandatangani di quote.

File yang mungkin perlu disesuaikan:

- `app/Validators/CheckoutQuote.js` — bila `shipping_service` akan divalidasi sebagai input opsional.
- `app/Validators/CheckoutCommit.js` — bila perlu memperketat field yang boleh diterima.
- `app/Services/MarketplaceFulfillmentService.js` — hanya jika helper canonical service/snapshot comparison lebih tepat diletakkan di service bersama.
- `API_DOCUMENT.md` — perbarui kontrak quote/commit, kode error, dan keterangan bahwa hanya Instant yang didukung.

## C. `backend-mediacartz`

### C1. Ubah expiry QRIS menjadi 60 menit

File utama:

- `.env.example`
- `config/custom.js`
- `app/Services/PaymentGateway/XenditPaymentGateway.js`
- `app/Controllers/Http/TransactionController.js`

Pekerjaan:

- Ubah contoh/default `XENDIT_QRIS_EXPIRY_MINUTES` dari 10 menjadi 60.
- Ubah fallback saat config invalid menjadi 60 dan sesuaikan log warning.
- Pastikan `channel_properties.expires_at` yang dikirim ke Xendit adalah sekarang + 60 menit.
- Selaraskan penjadwalan `closingUnfinishedTransaction` untuk transaksi retail dengan expiry aktual. Jangan mempertahankan delay 30 menit untuk QRIS 60 menit.
- Pastikan resume/retry pembayaran juga menolak request yang benar-benar expired berdasarkan `transaction_payment_expires_at`, bukan timer frontend.
- Dokumentasikan perubahan environment pada deployment; nilai env runtime lama tidak berubah hanya karena `.env.example` diperbarui.

### C2. Perbarui notifikasi payment success

File utama:

- `app/Services/Notification/RetailPostPaymentService.js`
- `.env.example`

Pekerjaan:

- Tambahkan relation `transaction_detail` pada query transaksi supaya template toko dapat membuat daftar produk dan total item.
- Perluas payload template dengan placeholder yang jelas, misalnya:
  - `{TRANSACTION_ID}`
  - `{ORDER_DATETIME}`
  - `{CUSTOMER_NAME}`
  - `{CUSTOMER_PHONE}`
  - `{ORDER_DETAILS}`
  - `{TOTAL_ITEMS}`
  - `{TOTAL_AMOUNT}`
  - `{SHIPPING_SERVICE}`
  - `{STORE_NAME}`
  - `{STORE_PHONE}`
- Format `{ORDER_DETAILS}` satu baris per produk: `<nama> × <quantity>`.
- `{TOTAL_ITEMS}` adalah jumlah quantity seluruh detail, bukan jumlah baris produk.
- Gunakan fallback template baru di kode dan contoh env yang sama. Template env tetap boleh mengoverride selama placeholder wajib didukung.
- Pertahankan idempotensi marker `consumer_whatsapp_sent_at` dan `store_whatsapp_sent_at`.

### C3. Perbarui notifikasi status GoSend

File utama:

- `app/Services/DeliveryMethod/GosendWebhookService.js`
- `.env.example`

Pekerjaan:

- Buat pemetaan event bisnis ke template pembeli dan toko, bukan satu template generik untuk semua status.
- Event minimal:
  - driver belum tersedia → pembeli dan toko;
  - driver menuju toko → pembeli dan toko;
  - driver mengantar pesanan → pembeli;
  - pesanan berhasil diterima → pembeli;
  - pesanan dikembalikan ke toko → toko.
- Data transaksi yang dimuat harus mencakup `transaction_detail`, toko, nama/nomor pembeli, serta data driver dari callback.
- Buat ringkasan pesanan dari detail transaksi, bukan raw payload webhook.
- Nomor driver hanya dimasukkan pada template yang memerlukannya. Ikuti kebijakan masking pada log; isi pesan kepada pihak yang berhak boleh memakai nomor aktual bila kontrak bisnis mengizinkan.
- Tambahkan marker idempotensi per event dan target, misalnya key berdasarkan `event_unique_key + audience`, agar retry webhook tidak menggandakan pesan.
- Template baru dapat dipisah per env key agar operasional dapat mengganti copy tanpa deploy, tetapi fallback di kode harus tetap lengkap.

#### Gap yang harus diselesaikan sebelum coding event “dikembalikan ke toko”

Status map yang terlihat saat ini mencakup delivered, cancelled, pickup failed, dan no driver, tetapi belum membuktikan adanya callback khusus “returned to store”. Implementer wajib memeriksa dokumentasi/contoh payload GoSend produksi dan menentukan status provider yang benar.

- Jangan menganggap `cancelled` otomatis berarti pesanan telah kembali ke toko.
- Kirim template pengembalian hanya ketika callback eksplisit menyatakan return/returned atau ketika status internal khusus telah dicatat oleh proses operasional yang sah.
- Jika provider tidak menyediakan event tersebut, catat sebagai dependensi produk/API dan tambahkan event internal/manual terautentikasi pada issue terpisah; jangan menghasilkan pesan yang tidak benar.

File kondisional:

- `app/Services/MarketplaceDeliveryOrderService.js` — bila sebagian transisi manual perlu memakai builder notifikasi yang sama.
- `app/Models/Transaction.js` — biasanya tidak perlu diubah karena relation `transaction_detail` sudah ada.
- Tidak ada migration yang direncanakan bila marker idempotensi tetap disimpan di `transaction_data`. Jika tim memilih tabel delivery khusus, buat desain dan review terpisah sebelum menambah migration.

## Template WhatsApp yang harus digunakan

Placeholder di bawah adalah nama bisnis. Implementer boleh menggunakan format `{UPPER_SNAKE_CASE}` secara internal selama hasil pesan sama dan semua fallback aman terhadap data kosong.

### 1. Pembayaran berhasil — ke pembeli

```text
Hai, Kak!
Pembayaran pesanan Kakak berhasil diterima.

🧾 No. Transaksi: #[Nomor Transaksi]
💰 Total Pembayaran: [Total Pembayaran]
🚚 Pengiriman: Instant

Pesanan Kakak sedang diproses. Terima kasih sudah berbelanja di [Nama Company/Perusahaan]!

Pesan otomatis: Mohon tidak membalas pesan ini karena WhatsApp ini hanya digunakan untuk mengirim notifikasi.
Jika membutuhkan bantuan, silakan hubungi [Nomor Toko].
```

### 2. Pembayaran berhasil — ke toko

```text
🔔 PESANAN BARU MASUK!
Mohon segera siapkan pesanan berikut.

🧾 No. Transaksi: [Nomor Transaksi]
🕒 Waktu Pesanan: [Tanggal & Jam]
👤 Nama Pembeli: [Nama Pembeli]
📱 No. HP: [Nomor HP]

DETAIL PESANAN:
[Nama Produk] × [Jumlah]
[Nama Produk] × [Jumlah]
[Nama Produk] × [Jumlah]

📦 Total Item: [Jumlah Item] pcs
💰 Total Pembayaran: Rp[Total]
💳 Status Pembayaran: Berhasil
🚚 Metode Pengiriman: Instant

📌 Tindakan Kasir:
Periksa ketersediaan produk.
Siapkan pesanan sesuai daftar.
Pastikan pesanan lengkap sebelum diserahkan kepada driver.
Mohon pantau notifikasi status driver untuk proses penjemputan.

Pesan otomatis dari sistem Freshly Baked by Origin Bakery.
```

### 3. Driver belum tersedia — ke pembeli

```text
Hai, Kak! 👋
Pesanan Kakak sedang menunggu ketersediaan driver untuk pengiriman.
Kami akan menginformasikan pembaruan status pesanan melalui WhatsApp ini.

Pesan otomatis, mohon tidak membalas. WhatsApp ini tidak menerima balasan pesan.
Butuh bantuan? Hubungi [Nomor Toko].
```

### 4. Driver menuju toko — ke pembeli

```text
Hai, Kak! 👋
Driver sedang menuju toko untuk mengambil pesanan Kakak.

🧾 No. Transaksi: [Nomor Transaksi]
🚚 Pengiriman: Instant
👤 Driver: [Nama Driver]

Mohon tunggu, ya! Kami akan menginformasikan pembaruan status selanjutnya.

Pesan otomatis, mohon tidak membalas. WhatsApp ini tidak menerima balasan pesan.
Butuh bantuan? Hubungi [Nomor Toko].
```

### 5. Driver mengantar pesanan — ke pembeli

```text
Hai, Kak!
Pesanan Kakak sedang dalam perjalanan menuju alamat tujuan. 🛵

🧾 No. Transaksi: [Nomor Transaksi]
👤 Driver: [Nama Driver] [Nomor Driver]

Mohon bersiap menerima pesanan, ya. Terima kasih sudah memilih Freshly Baked by Origin Bakery!

Pesan otomatis, mohon tidak membalas. WhatsApp ini tidak menerima balasan pesan.
Butuh bantuan? Hubungi [Nomor Toko].
```

### 6. Pesanan berhasil diterima — ke pembeli

```text
Hai, Kak! 🥖
Pesanan Freshly Baked by Origin Bakery sudah selesai dikirim.
Terima kasih sudah berbelanja bersama kami. Semoga rotinya bikin hari Kakak makin menyenangkan! ❤️

Pesan otomatis, mohon tidak membalas. WhatsApp ini tidak menerima balasan pesan.
Ada kendala? Hubungi [Nomor Toko].
```

### 7. Driver menuju toko — ke toko

```text
🛵 UPDATE DRIVER
Driver sedang menuju toko untuk mengambil pesanan.

🧾 No. Transaksi: [Nomor Transaksi]
👤 Nama Pembeli: [Nama Pembeli]
📦 Pesanan: [Ringkasan Pesanan]
🚴 Nama Driver: [Nama Driver]
📱 No. HP Driver: [Nomor HP Driver]

Mohon pastikan pesanan sudah siap dan lengkap sebelum diserahkan kepada driver.
```

### 8. Driver belum tersedia — ke toko

```text
DRIVER BELUM TERSEDIA

🧾 No. Transaksi: [Nomor Transaksi]
👤 Nama Pembeli: [Nama Pembeli]
📦 Pesanan: [Ringkasan Pesanan]

Saat ini driver belum tersedia. Mohon siapkan pesanan terlebih dahulu dan pantau pembaruan status pengiriman.

Jika terdapat kendala stok atau persiapan, segera koordinasikan dengan tim terkait.
```

### 9. Pesanan dikembalikan ke toko — ke toko

```text
Driver gagal menemukan alamat tujuan, sehingga pesanan dikembalikan ke kasir.

🧾 No. Transaksi: [Nomor Transaksi]
👤 Nama Pembeli: [Nama Pembeli]
📱 No. HP Pembeli: [Nomor HP]
📦 Pesanan: [Ringkasan Pesanan]
🚴 Nama Driver: [Nama Driver]
📌 Alasan: [Alasan dari driver]

Mohon segera:
Terima kembali pesanan dari driver dan berikan kode OTP ke driver.
Periksa kondisi dan kelengkapan produk.
Koordinasikan tindak lanjut dengan tim terkait untuk konfirmasi kepada pembeli.

Pesan otomatis dari sistem Freshly Baked by Origin Bakery.
```

## Pemetaan event GoSend yang diharapkan

Pemetaan akhir harus disesuaikan dengan payload provider yang benar. Tabel ini adalah target bisnis, bukan izin untuk menebak status.

| Event bisnis | Kandidat status provider yang sudah dikenali kode | Penerima | Template |
| --- | --- | --- | --- |
| Driver belum tersedia | `driver_not_found`, `no_driver`, `dnf` / shipping status 12 | Pembeli, toko | Template 3 dan 8 |
| Driver menuju toko | `driver_allocated`, `allocated`, `enroute_pickup`, `out_for_pickup` | Pembeli, toko | Template 4 dan 7 |
| Driver mengantar pesanan | `picked`, `enroute_drop`, `out_for_delivery` | Pembeli | Template 5 |
| Pesanan diterima | `completed`, `delivered` | Pembeli | Template 6 |
| Dikembalikan ke toko | Belum terkonfirmasi | Toko | Template 9 setelah status eksplisit tersedia |

## Kontrak error yang disarankan

| Kode | HTTP | Kondisi | Tindakan frontend |
| --- | ---: | --- | --- |
| `INVALID_QUANTITY` | 422 | Quantity bukan integer atau kurang dari batas | Pulihkan nilai valid dan tampilkan pesan |
| `INSUFFICIENT_STOCK` | 422/409 | Quantity melebihi stok terkini | Muat cart terbaru, tampilkan stok, requote |
| `CART_NOT_FOUND` | 404/409 | Item telah dihapus/tidak dimiliki member | Keluarkan item dan kembali ke cart bila tidak ada item |
| `SHIPPING_UNAVAILABLE` | 422/409 | Instant tidak tersedia | Blok checkout dan minta pengguna mengganti alamat |
| `FULFILLMENT_CHANGED` | 409 | Snapshot cart/store/shipping berubah | Muat ulang data dan buat quote baru |
| `INVALID_QUOTE_TOKEN` | 422/409 | Quote lama/tidak cocok | Buat quote baru; jangan retry commit dengan token lama |

## Urutan implementasi yang disarankan

1. `backend-mediacartz`: ubah expiry QRIS dan selaraskan job penutupan transaksi.
2. `core.loyalty.system`: enforce Instant dan perkuat verifikasi snapshot quote/commit.
3. `client.loyalty.system`: editor quantity, lock/race handling, requote, serta tampilan Instant.
4. `client.loyalty.system`: perbaikan popup QRIS dan link WhatsApp toko di semua entry point.
5. `backend-mediacartz`: lengkapi data/template payment success.
6. `backend-mediacartz`: pisahkan template status GoSend, tambah idempotensi per event/audience, lalu implementasikan hanya event provider yang sudah terkonfirmasi.
7. Perbarui dokumentasi env/API dan jalankan regression test lintas repo.

## Daftar file yang diperkirakan berubah

### Pasti/utama

`client.loyalty.system`:

- `src/pages/Order/index.jsx`
- `src/components/QrisPaymentModal/index.jsx`

`core.loyalty.system`:

- `app/Controllers/Http/CheckoutController.js`
- `API_DOCUMENT.md`

`backend-mediacartz`:

- `.env.example`
- `config/custom.js`
- `app/Services/PaymentGateway/XenditPaymentGateway.js`
- `app/Controllers/Http/TransactionController.js`
- `app/Services/Notification/RetailPostPaymentService.js`
- `app/Services/DeliveryMethod/GosendWebhookService.js`

### Kondisional

`client.loyalty.system`:

- `src/pages/PreOrder/index.jsx`
- `src/pages/TransactionList/index.jsx`
- `src/utils/paymentGateway.js`
- `src/utils/whatsapp.js` — file baru opsional
- test file yang mengikuti struktur test project

`core.loyalty.system`:

- `app/Controllers/Http/CartController.js`
- `app/Validators/CheckoutQuote.js`
- `app/Validators/CheckoutCommit.js`
- `app/Services/MarketplaceFulfillmentService.js`
- test file yang mengikuti struktur test project

`backend-mediacartz`:

- `app/Services/MarketplaceDeliveryOrderService.js`
- endpoint/serializer detail transaksi bila `store_phone` belum tersedia ke frontend
- test file yang mengikuti struktur test project

Tidak ada file migration yang direncanakan pada scope awal.

## Acceptance criteria

- [ ] Setiap item di `/order` memiliki kontrol minus, nilai quantity, dan plus.
- [ ] Quantity tidak dapat kurang dari 1 atau lebih dari stok server terbaru.
- [ ] Perubahan quantity tersimpan ke cart dan tetap terlihat setelah reload.
- [ ] Klik cepat tidak menyebabkan response lama menimpa quantity/quote terbaru.
- [ ] Tombol bayar disabled selama quantity atau quote sedang diperbarui.
- [ ] Subtotal, voucher, diskon, ongkir, total, balance, dan sisa QRIS diperbarui dari quote server terbaru.
- [ ] Commit tidak dapat memakai quote sebelum perubahan quantity.
- [ ] Frontend hanya menampilkan Instant.
- [ ] Backend menolak shipping selain Instant dan tidak fallback ke opsi pertama.
- [ ] Checkout diblokir dengan pesan jelas saat Instant tidak tersedia.
- [ ] Tombol `Tutup` pada popup QRIS menggunakan teks putih dengan kontras yang layak.
- [ ] Popup QRIS menampilkan kalimat bantuan dan link WhatsApp nomor toko yang valid.
- [ ] Link bantuan tetap aman ketika nomor toko kosong/tidak valid.
- [ ] QRIS yang baru dibuat mempunyai expiry 60 menit dari backend/provider.
- [ ] Countdown frontend sesuai `expires_at` dan tetap benar setelah reload/resume.
- [ ] Job penutupan transaksi tidak menutup transaksi sebelum QRIS expired.
- [ ] Payment success hanya mengirim satu pesan ke pembeli dan satu ke toko per transaksi.
- [ ] Pesan toko memuat daftar produk dan total quantity yang benar.
- [ ] Setiap transisi GoSend yang relevan mengirim template kepada audience yang tepat satu kali.
- [ ] Retry webhook tidak menggandakan notifikasi.
- [ ] Event pengembalian ke toko tidak dikirim tanpa status provider/internal yang eksplisit.
- [ ] Kegagalan WhatsApp tidak menggagalkan pembayaran atau update status pengiriman.

## Skenario pengujian

Detail langkah/unit test diserahkan kepada implementer. Minimal cakupan skenario:

### Frontend `/order`

- Naikkan dan turunkan quantity satu item.
- Ubah beberapa item secara cepat dan pastikan hasil terakhir yang menang.
- Coba quantity 0, negatif, desimal, teks, dan melebihi stok.
- Stok berubah di server ketika pengguna sedang berada di checkout.
- Voucher tetap valid dan menjadi tidak valid setelah quantity berubah.
- Perhitungan tanpa balance, dengan balance sebagian, dan balance penuh.
- Requote gagal karena jaringan; commit harus tetap terblokir.
- Reload halaman setelah quantity berhasil disimpan.

### Shipping

- Response provider berisi Instant dan SameDay; hanya Instant terlihat/dipilih.
- Urutan opsi dibalik; hasil tetap Instant.
- Hanya SameDay tersedia; checkout gagal dengan pesan yang benar.
- Request quote/commit dimanipulasi untuk mengirim service non-Instant; backend menolak.

### QRIS

- Payment baru menampilkan countdown mendekati 60:00.
- Reload/resume menggunakan sisa waktu dari timestamp yang sama, bukan mengulang 60 menit.
- Status sukses, pending, failed, dan expired.
- Job closure sebelum menit ke-60 tidak menutup transaksi pending yang masih valid.
- Nomor toko format `08`, `628`, `+62`, berisi spasi/tanda hubung, kosong, dan invalid.
- Tombol Tutup dan link bantuan bekerja di mobile serta desktop.

### WhatsApp payment success

- Pembayaran sukses memicu pesan pembeli dan toko dengan placeholder lengkap.
- Detail order satu item dan banyak item; total item adalah penjumlahan quantity.
- Nama/nomor toko atau field opsional kosong menggunakan fallback aman.
- Event payment success yang diproses ulang tidak mengirim duplikat.
- Provider WhatsApp gagal/timeout; status pembayaran tetap sukses dan error tercatat.

### WhatsApp delivery status

- No driver, driver menuju toko, driver membawa pesanan, dan delivered mengirim ke audience yang benar.
- Event yang sama dikirim ulang oleh GoSend tidak menghasilkan pesan ganda.
- Perubahan driver/rebooking memakai data booking aktif, bukan callback stale.
- Callback stale dari order GoSend lama tidak mengirim notifikasi untuk booking aktif.
- Return-to-store hanya terkirim pada event eksplisit dan memuat alasan yang benar.
- Nomor pembeli/toko invalid menyebabkan skip terkontrol tanpa menggagalkan webhook.

## Risiko dan mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Race condition edit quantity dan quote | Lock/debounce per item, sequence/request ID, abaikan response stale |
| Total UI berbeda dari backend | Seluruh nilai final memakai quote server; blok commit bila mismatch |
| Quote lama dipakai setelah cart berubah | Invalidate token dan bandingkan snapshot cart saat commit |
| SameDay lolos lewat request manual | Enforcement service Instant pada quote dan commit backend |
| Transaksi ditutup pada menit ke-30 | Selaraskan scheduler dengan expiry provider 60 menit |
| Link WhatsApp mengarah ke nomor salah | Ambil dari toko transaksi dan gunakan helper normalisasi teruji |
| Notifikasi duplikat karena webhook retry | Marker idempotensi per event dan audience |
| Salah menafsirkan cancelled sebagai returned | Wajib event eksplisit; verifikasi dokumentasi/payload GoSend |
| Template env lama tidak mempunyai placeholder baru | Sediakan fallback baru, validasi placeholder wajib, dan dokumentasikan perubahan env deployment |

## Definition of done

- Seluruh acceptance criteria terpenuhi.
- Tidak ada perubahan di luar tiga aplikasi dalam scope tanpa alasan yang didokumentasikan.
- Kontrak API dan environment example diperbarui.
- Runtime environment staging telah menggunakan expiry 60 menit dan template baru.
- Skenario pengujian utama lulus pada staging dengan sandbox payment gateway dan payload GoSend representatif.
- Tidak ada regression pada checkout cart, resume payment, status transaksi, serta webhook payment/delivery.
- Log cukup untuk menelusuri kegagalan tanpa membocorkan secret atau data pribadi berlebihan.

## Pertanyaan/dependensi yang harus dikonfirmasi saat implementasi

1. Apa status/payload GoSend resmi yang menandakan pesanan benar-benar dikembalikan ke toko?
2. Apakah brand pada template harus selalu `Freshly Baked by Origin Bakery` atau menggunakan nama company/store secara dinamis? Rekomendasi: dinamis dengan fallback brand tersebut.
3. Berapa grace period setelah QRIS expired sebelum job closure dijalankan? Rekomendasi awal: 1–5 menit untuk toleransi webhook, setelah disetujui tim backend.
4. Apakah nomor driver boleh dikirim utuh kepada pembeli/toko sesuai kebijakan privasi yang berlaku?
5. Pastikan response daftar/detail transaksi yang dipakai untuk resume QRIS memuat `store_phone`; bila belum, kontrak API perlu ditambah.
