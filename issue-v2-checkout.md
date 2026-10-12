# Issue: Checkout dan pembayaran langsung di halaman `/order`

## Ringkasan

Sederhanakan alur checkout customer loyalty dengan memindahkan proses verifikasi biaya dan pembuatan transaksi ke halaman `/order`. Customer tidak lagi diarahkan ke `/order/preorder` untuk meninjau pesanan dan memulai pembayaran.

Alur target:

`/product` → `/order` → preview transaksi → create transaksi → tampilkan pembayaran/QR code di `/order`

## Struktur aplikasi terkait

| Folder | Fungsi | Dampak issue ini |
| --- | --- | --- |
| `core.loyalty.system` | Backend loyalty/proxy | Tidak direncanakan berubah; endpoint existing dipakai oleh frontend. |
| `client.loyalty.system` | Frontend loyalty customer | **Scope utama perubahan.** |
| `cms.loyalty.system` | Frontend management loyalty | Tidak berubah. |
| `backend-mediacartz` | Backend marketplace/`MARKETPLACE_CORE` | Tidak berubah. |
| `frontend-mediacartz` | Frontend marketplace | Tidak berubah. |

## Latar belakang

Saat ini customer yang checkout dari halaman `/product` masuk ke `/order` untuk memilih alamat, metode pengiriman, jasa pengiriman, metode pembayaran, voucher, dan catatan kurir. Tombol **Tinjau Pesanan** kemudian membuat checkout quote dan mengarahkan customer ke `/order/preorder`. Di halaman kedua tersebut customer meninjau ulang rincian, mencentang persetujuan, lalu menekan **Bayar**.

Alur ini menambah satu halaman dan satu langkah konfirmasi sebelum customer dapat membayar.

## Tujuan

1. Mempersingkat checkout sehingga pengaturan dan pembayaran dilakukan pada halaman `/order`.
2. Menghilangkan `/order/preorder` dari alur checkout aktif.
3. Tetap melakukan verifikasi server sebelum transaksi dibuat.
4. Mencegah transaksi dibuat apabila nilai yang diverifikasi server berbeda dari nilai yang sedang disetujui customer.
5. Menampilkan instruksi pembayaran atau QR code tanpa meninggalkan halaman `/order` bila gateway mendukung pembayaran di dalam aplikasi.

## Kondisi kode saat issue dibuat

- `client.loyalty.system/src/pages/Order/index.jsx` saat ini menjalankan `POST checkout/quote`, menyimpan `checkout_quote_context` ke `sessionStorage`, lalu membuka `/order/preorder`.
- `client.loyalty.system/src/pages/PreOrder/index.jsx` berisi UI persetujuan, proses pembayaran, integrasi MIDTRANS, penanganan XENDIT/QRIS, dan pemakaian `QrisPaymentModal`.
- `client.loyalty.system/src/utils/api.js` sudah memiliki konfigurasi `API.TRANSACTION` untuk `POST member/transaction`.
- `client.loyalty.system/src/components/QrisPaymentModal/index.jsx` sudah menjadi modal QRIS dan melakukan polling status pembayaran.
- `core.loyalty.system/app/Controllers/Http/TransactionController.js` sudah meneruskan `preview_fee` ke `MARKETPLACE_CORE`. Nilai `true` hanya melakukan preview; nilai `false` membuat dan mencatat transaksi lalu mengembalikan data/token pembayaran.
- Kode terbaru juga mempunyai endpoint `/checkout/quote` dan `/checkout/commit`. Implementasi issue ini harus memilih satu alur secara konsisten. Sesuai requirement issue, alur `/order` menggunakan `member/transaction` dua kali dan tidak mencampurnya dengan quote/commit dalam satu kali submit.

## Scope perubahan

### Termasuk

- Perubahan UI dan state halaman `/order`.
- Mengganti tombol **Tinjau Pesanan** menjadi **Bayar**.
- Menambahkan checkbox persetujuan syarat dan ketentuan.
- Preview melalui `POST member/transaction` dengan `preview_fee: true`.
- Membandingkan hasil preview server dengan ringkasan yang tampil di `/order`.
- Create transaksi melalui endpoint yang sama dengan `preview_fee: false` setelah hasil preview cocok.
- Menampilkan pembayaran QRIS menggunakan modal pada halaman `/order`.
- Mempertahankan cabang pembayaran gateway lain yang saat ini didukung agar refactor tidak merusak MIDTRANS atau redirect gateway.
- Menghapus navigasi normal ke `/order/preorder` dan membersihkan context preorder yang tidak lagi diperlukan.

### Tidak termasuk

- Perubahan bisnis di `MARKETPLACE_CORE`.
- Perubahan CMS atau frontend marketplace.
- Redesign seluruh halaman checkout.
- Menghapus endpoint backend existing.
- Mengubah proses daftar transaksi, detail transaksi, resume pembayaran, atau callback gateway, kecuali penyesuaian kecil yang benar-benar diperlukan akibat pemindahan halaman.

## Perilaku yang diharapkan

### 1. Ringkasan dan persetujuan di `/order`

- Semua pilihan checkout tetap berada di `/order`: item, voucher, metode pembayaran, metode pengiriman, jasa pengiriman, alamat, serta catatan kurir.
- Tambahkan checkbox dengan teks persetujuan yang jelas, misalnya: **Saya menyetujui detail pesanan, alamat pengiriman, biaya pengiriman, total pembayaran, serta syarat dan ketentuan yang berlaku.**
- Bila aplikasi mempunyai halaman syarat dan ketentuan, bagian teks yang relevan dibuat sebagai link. Jangan membuat URL baru tanpa memastikan route yang tersedia.
- Tombol utama berubah menjadi **Bayar**.
- Tombol **Bayar** hanya aktif bila:
  - ada item checkout;
  - alamat valid dan memiliki koordinat bila diwajibkan;
  - metode pembayaran tersedia;
  - metode pengiriman dan jasa pengiriman yang diwajibkan sudah dipilih;
  - checkbox persetujuan dicentang;
  - request pembayaran tidak sedang berjalan; dan
  - modal/instruksi pembayaran sebelumnya tidak sedang aktif.
- Perubahan item, voucher, alamat, pembayaran, pengiriman, jasa pengiriman, atau catatan setelah persetujuan harus mereset checkbox. Customer perlu menyetujui ulang data terbaru.

### 2. Penyusunan payload transaksi

Buat satu fungsi penyusun payload dan gunakan hasil yang sama untuk request preview maupun create. Perbedaan kedua request hanya pada `preview_fee` dan field teknis yang memang ditentukan backend.

Payload harus dibentuk dari state terbaru, bukan dari data tersimpan milik `/order/preorder`. Cocokkan nama field dengan kontrak aktual `POST member/transaction`, minimal mencakup data berikut bila diperlukan oleh backend:

- item dan kuantitas;
- store/company/partner yang relevan;
- voucher;
- `ms_payment_id`;
- `ms_delivery_id`;
- data alamat tujuan dan koordinat;
- `shipping_service`;
- `transaction_delivery_note` maksimal 255 karakter;
- `client_request_id`; dan
- `preview_fee`.

Gunakan satu `client_request_id` untuk satu percobaan checkout, termasuk request preview dan create pasangannya. ID baru hanya dibuat untuk percobaan checkout baru. Jangan membuat ID berbeda tepat sebelum request create karena ID tersebut diperlukan untuk idempotensi/deduplication.

> Catatan implementasi: cek kontrak backend aktual sebelum menyalin payload lama. Halaman `/order` saat ini membentuk payload khusus `/checkout/quote`, sedangkan `member/transaction` menggunakan bentuk payload transaksi yang berbeda.

### 3. Urutan saat tombol **Bayar** ditekan

1. Cegah double click dan submit paralel menggunakan state loading serta guard berbasis `ref`.
2. Validasi kembali semua field wajib dan persetujuan.
3. Ambil snapshot ringkasan yang saat itu tampil dan payload checkout terbaru.
4. Panggil `POST member/transaction` dengan `preview_fee: true`.
5. Bila preview gagal, jangan jalankan create. Tampilkan pesan backend yang aman dan pertahankan data form agar customer dapat memperbaiki pilihan.
6. Normalisasi angka sebelum dibandingkan agar string angka dan number tidak dianggap berbeda.
7. Bandingkan hasil preview server dengan ringkasan yang disetujui customer.
8. Bila cocok, panggil kembali `POST member/transaction` dengan payload yang sama dan `preview_fee: false`.
9. Bila create berhasil, tampilkan metode pembayaran sesuai response tanpa membuka `/order/preorder`.
10. Bila create gagal, lepaskan loading/guard dan tampilkan pesan. Jangan otomatis mengulang request create.

### 4. Aturan perbandingan preview

Jangan membandingkan seluruh object response menggunakan `JSON.stringify`, karena response dapat berisi metadata yang urutannya berubah. Buat helper yang mengambil field bisnis penting dari kedua sumber.

Field minimum yang dibandingkan:

- daftar item: identifier, quantity, dan harga efektif;
- subtotal/`transaction_amount`;
- diskon voucher/`transaction_discount`;
- biaya pengiriman/`transaction_shipping_fee`;
- total akhir/`transaction_total_amount`;
- metode pengiriman dan jasa pengiriman;
- alamat/koordinat tujuan yang relevan; dan
- voucher yang dipakai.

Response server adalah sumber kebenaran. Bila ada perbedaan:

- **jangan** mengirim request `preview_fee: false`;
- perbarui ringkasan `/order` dengan nilai preview terbaru yang aman ditampilkan;
- tampilkan pemberitahuan bahwa harga, diskon, ongkir, stok, atau detail checkout berubah;
- reset checkbox persetujuan; dan
- minta customer memeriksa nilai terbaru lalu menekan **Bayar** kembali.

Jika preview menyatakan stok, voucher, radius, alamat, pengiriman, atau payment gateway tidak valid, tampilkan error spesifik dan arahkan customer memperbaiki field terkait di `/order`.

### 5. Hasil create dan tampilan pembayaran

- **QRIS/QR code:** ambil QR string dan metadata kedaluwarsa dari response gateway, lalu buka `QrisPaymentModal` di `/order`. Gunakan komponen existing agar countdown, polling status, sukses, kedaluwarsa, dan close tetap konsisten.
- **MIDTRANS:** teruskan token hasil create ke komponen Snap existing dan pertahankan handler sukses, pending, error, dan close.
- **Redirect gateway:** hanya arahkan browser ke URL yang lulus validasi URL pembayaran existing.
- Bila response create sukses tetapi tidak mengandung instruksi pembayaran yang dikenali, tampilkan error terkontrol dan sediakan arah ke daftar transaksi; jangan mengirim create lagi secara otomatis.
- Setelah pembayaran berhasil, arahkan ke halaman status/daftar transaksi mengikuti perilaku existing.
- Menutup modal QR tidak membatalkan atau membuat ulang transaksi. Customer dapat melanjutkan transaksi dari fitur resume pembayaran yang sudah ada.

## Rencana perubahan file

### File yang wajib dimodifikasi

#### `client.loyalty.system/src/pages/Order/index.jsx`

- Tambahkan state checkbox persetujuan, loading preview/create, payment token/instruction, QRIS modal, dan guard double submit.
- Ubah label tombol menjadi **Bayar** beserta kondisi enabled/disabled.
- Ganti fungsi `Calculate`/handler tombol agar menjalankan preview → compare → create di halaman yang sama.
- Hapus penyimpanan `checkout_quote_context` dan navigasi ke `/order/preorder` dari alur normal.
- Pindahkan atau gunakan ulang handler gateway yang sekarang berada di `PreOrder`.
- Render `MidT` dan/atau `QrisPaymentModal` pada halaman `/order` sesuai gateway response.
- Reset persetujuan bila input checkout berubah.

#### `client.loyalty.system/src/pages/PreOrder/index.jsx`

- Hentikan perannya sebagai langkah wajib checkout.
- Jangan biarkan halaman ini membuat transaksi baru dari context lama yang sudah tidak valid.
- Untuk kompatibilitas bookmark/session lama, arahkan akses langsung ke `/order` dengan pesan yang sesuai, atau pertahankan sementara sebagai fallback read-only selama masa transisi. Pilih salah satu dan dokumentasikan keputusan di PR.
- Setelah tidak ada caller dan masa transisi selesai, file dapat dihapus pada cleanup terpisah.

#### `client.loyalty.system/src/components/RootRouter/index.jsx`

- Sesuaikan route `/order/preorder` dengan keputusan kompatibilitas di atas.
- Route boleh tetap ada sebagai redirect sementara, tetapi tidak boleh lagi menjadi bagian dari alur checkout normal.

### File yang disarankan dibuat

Nama akhir boleh menyesuaikan konvensi project.

#### `client.loyalty.system/src/utils/checkoutTransaction.js`

Pisahkan logika murni agar halaman tidak semakin besar:

- membentuk payload `member/transaction`;
- menormalisasi preview dan ringkasan halaman;
- membandingkan field bisnis penting; dan
- menghasilkan daftar perbedaan yang dapat dipakai untuk pesan/log.

#### `client.loyalty.system/src/hooks/useCheckoutPayment.js` (opsional)

Gunakan hook bila pemindahan state dan handler pembayaran dari `PreOrder` membuat `Order/index.jsx` terlalu kompleks. Hook dapat menangani submit guard, preview/create, pemilihan cabang gateway, dan cleanup state. Jangan membuat abstraksi baru bila hanya menjadi wrapper tipis.

### File yang mungkin dimodifikasi bila diperlukan

#### `client.loyalty.system/src/utils/api.js`

`API.TRANSACTION` sudah tersedia. Ubah hanya bila perlu memperjelas alias/nama API; jangan menambahkan endpoint duplikat dengan URL yang sama tanpa alasan.

#### `client.loyalty.system/src/components/QrisPaymentModal/index.jsx`

Komponen seharusnya dapat digunakan ulang tanpa perubahan. Modifikasi hanya bila bentuk response create dari `member/transaction` perlu dinormalisasi atau callback modal masih bergantung pada halaman `PreOrder`.

#### `client.loyalty.system/src/utils/paymentGateway.js`

Gunakan helper provider existing. Tambahkan normalizer hanya bila response legacy `member/transaction` berbeda dari response `/checkout/commit`.

#### File test frontend existing atau file test baru di dekat modul terkait

Tambahkan pengujian pada helper perbandingan dan alur utama halaman sesuai pola test project.

### File yang tidak direncanakan berubah

- `core.loyalty.system/app/Controllers/Http/TransactionController.js`
- `core.loyalty.system/start/routes.js`
- file di `backend-mediacartz`, `cms.loyalty.system`, dan frontend marketplace.

Jika implementor menemukan kontrak `member/transaction` belum mengembalikan informasi payment gateway/QR yang dibutuhkan, hentikan perluasan scope dan catat gap kontraknya. Perubahan backend harus dibuat sebagai sub-issue atau perubahan terpisah yang menjelaskan response sebelum dan sesudah.

## Detail UX dan error handling

- Gunakan satu indikator **Memproses...** untuk rangkaian preview dan create agar customer tidak perlu memahami dua request internal.
- Semua selector checkout dikunci sementara rangkaian request berjalan agar payload tidak berubah di tengah proses.
- Jangan mengosongkan keranjang atau state checkout sebelum create berhasil.
- Jangan menaruh payload, token pembayaran, QR string, atau data pribadi lengkap dalam log browser produksi.
- Error jaringan saat preview aman untuk dicoba ulang.
- Error jaringan setelah request create dikirim bersifat ambigu. Jangan langsung retry otomatis; arahkan customer mengecek daftar transaksi atau menggunakan resume pembayaran agar tidak terbentuk order ganda.
- Pastikan state loading dan guard selalu dilepas pada seluruh jalur gagal yang memang boleh dicoba ulang.
- Bila halaman di-refresh setelah transaksi berhasil dibuat, jangan create ulang dari state lama.

## Urutan implementasi yang disarankan

1. Catat contoh response aktual `member/transaction` untuk `preview_fee=true` dan `false`, termasuk perbedaan MIDTRANS, XENDIT, dan QRIS yang aktif di environment pengembangan.
2. Buat builder payload serta normalizer/comparator sebagai fungsi murni.
3. Tambahkan checkbox dan aturan reset persetujuan di `/order`.
4. Implementasikan preview dan penanganan mismatch tanpa menjalankan create terlebih dahulu.
5. Tambahkan request create dengan guard idempotensi/double click.
6. Pindahkan integrasi modal QRIS, MIDTRANS Snap, dan redirect gateway ke `/order`.
7. Hapus navigasi dan penyimpanan session preorder dari alur aktif.
8. Ubah `/order/preorder` menjadi redirect/fallback sesuai keputusan kompatibilitas.
9. Jalankan regression checkout dan pembayaran pada seluruh gateway yang didukung.

## Acceptance criteria

1. Customer dari `/product` dapat menyelesaikan pengaturan checkout dan memulai pembayaran di `/order` tanpa membuka `/order/preorder`.
2. Tombol **Tinjau Pesanan** sudah berubah menjadi **Bayar**.
3. Tombol **Bayar** nonaktif sebelum checkbox persetujuan dicentang atau ketika data wajib belum lengkap.
4. Satu klik **Bayar** melakukan `member/transaction` dengan `preview_fee=true` terlebih dahulu.
5. Request `preview_fee=false` hanya dijalankan bila preview sukses dan nilai bisnisnya cocok dengan ringkasan yang disetujui.
6. Preview yang berbeda tidak membuat transaksi, memperbarui/menjelaskan perbedaan, dan meminta persetujuan ulang.
7. Double click tidak menghasilkan request create ganda.
8. QR code hasil create tampil sebagai modal di `/order` dan status pembayaran tetap dapat diperbarui.
9. MIDTRANS/redirect gateway yang didukung sebelumnya tidak rusak akibat pemindahan logic.
10. Error preview/create tidak menghapus pilihan checkout customer.
11. Tidak ada navigasi normal atau penulisan baru ke `checkout_quote_context` untuk membuka `/order/preorder`.
12. Refresh/back setelah transaksi dibuat tidak membuat transaksi kedua secara otomatis.
13. Perubahan hanya menyentuh `client.loyalty.system`, kecuali ditemukan dan didokumentasikan gap kontrak backend yang disetujui terpisah.

## Skenario pengujian

Detail implementasi test diserahkan kepada implementor. Minimal cakup skenario berikut:

1. Happy path checkout dengan QRIS: preview cocok, create sukses, modal QR tampil, dan status sukses terdeteksi.
2. Checkbox belum dicentang, data wajib belum lengkap, serta checkbox ter-reset setelah pilihan checkout berubah.
3. Preview gagal karena stok, voucher, alamat/radius, pengiriman, atau payment gateway.
4. Nominal preview berbeda dari ringkasan `/order`; create tidak dipanggil dan customer diminta menyetujui ulang.
5. Preview dan ringkasan mempunyai nilai sama tetapi tipe data berbeda (`"10000"` dan `10000`).
6. Double click/tap cepat pada **Bayar** hanya menghasilkan satu rangkaian checkout.
7. Create gagal biasa dan kegagalan jaringan ambigu setelah request terkirim.
8. MIDTRANS, QRIS, dan redirect gateway mengikuti cabangnya masing-masing.
9. Modal QR ditutup, kedaluwarsa, atau pembayaran berhasil.
10. Pickup tanpa ongkir dan delivery dengan ongkir/jasa pengiriman.
11. Checkout dengan dan tanpa voucher serta dengan catatan kurir maksimum 255 karakter.
12. Akses langsung atau bookmark lama ke `/order/preorder` mengikuti fallback/redirect yang dipilih.
13. Refresh dan navigasi back tidak mengulangi create transaksi.
14. Regression daftar transaksi dan resume pembayaran setelah transaksi dibuat dari `/order`.

## Risiko dan perhatian khusus

- **Dua kontrak checkout tersedia:** kode sekarang memakai quote/commit, sedangkan requirement meminta `member/transaction`. Jangan menjalankan keduanya untuk checkout yang sama.
- **Order ganda:** gunakan `client_request_id`, guard submit, dan larangan retry create otomatis.
- **Harga berubah di tengah checkout:** server tetap menjadi sumber kebenaran dan perubahan harus disetujui ulang customer.
- **Perbedaan response gateway:** normalisasi response sebelum menentukan QRIS, Snap token, atau redirect URL.
- **Komponen `/order` membesar:** ekstrak fungsi murni/helper seperlunya, tetapi hindari refactor di luar scope.
- **Session lama:** bersihkan `checkout_quote_context` secara aman setelah alur baru aktif agar data lama tidak memicu checkout yang tidak disengaja.

## Definition of done

- Seluruh acceptance criteria terpenuhi.
- Alur checkout baru dapat diverifikasi manual pada ukuran mobile yang menjadi target utama UI.
- Skenario pengujian utama lulus.
- Tidak ada error console yang terkait checkout pada happy path.
- Dokumentasi/PR menyebut keputusan kompatibilitas route `/order/preorder` dan bentuk response gateway yang benar-benar ditemukan saat implementasi.
