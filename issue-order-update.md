# Issue — Penyempurnaan Order, QRIS, dan Daftar Transaksi

## Struktur folder / peran aplikasi

| Folder | Peran |
| --- | --- |
| `core.loyalty.system` | Backend Loyalty / proxy Marketplace Core |
| `client.loyalty.system` | Frontend Loyalty Customer |
| `cms.loyalty.system` | Frontend management Loyalty |
| `backend-mediacartz` | Backend Marketplace / `MARKETPLACE_CORE` |
| `frontend-mediacartz-react` | Frontend Marketplace untuk `backend-mediacartz` |

## Scope perubahan

Scope utama ada di **`client.loyalty.system`**. Perubahan backend tidak direncanakan selama response cart dan transaksi telah menyediakan `cart_id`, quantity, `transaction_id`, status pembayaran, serta nomor WhatsApp toko. Jika salah satu data tersebut belum tersedia pada response production, lakukan penyesuaian minimal dan kompatibel di `core.loyalty.system` sebagai proxy; jangan mengubah kontrak Marketplace Core tanpa kebutuhan yang terbukti.

Di luar scope: `cms.loyalty.system` dan `frontend-mediacartz-react`.

## Latar belakang

Halaman checkout dan daftar transaksi sudah memiliki alur cart, QRIS, serta melanjutkan pembayaran. Namun beberapa interaksi masih belum sesuai pengalaman pengguna yang diharapkan:

- quantity minimum satu membuat pengguna tidak dapat menghapus item langsung dari halaman `/order`;
- checkout kosong belum memberi arahan untuk kembali berbelanja;
- modal QRIS dari checkout tidak membawa pengguna ke daftar transaksi saat ditutup;
- daftar transaksi menampilkan nomor transaksi singkat, bukan `transaction_id` yang diperlukan sebagai referensi pelanggan;
- pelanggan yang gagal atau terkendala membayar belum mempunyai jalur bantuan WhatsApp dari kartu transaksi pending.

## Tujuan

1. Membuat pengelolaan cart pada `/order` lebih sederhana.
2. Mencegah request checkout saat tidak ada produk terpilih.
3. Menjadikan penutupan QRIS konsisten: pelanggan dapat melanjutkan pemantauan dari daftar transaksi.
4. Menampilkan referensi transaksi yang tepat dan menyediakan jalur bantuan pembayaran ke toko.

## Perencanaan implementasi

### 1. Tombol minus quantity sekaligus menghapus item cart

Halaman: `client.loyalty.system/src/pages/Order/index.jsx`

Kondisi saat ini: tombol minus dinonaktifkan ketika quantity bernilai `1`.

Perubahan:

1. Saat quantity lebih dari `1`, tombol minus tetap mengurangi quantity seperti perilaku saat ini.
2. Saat quantity sama dengan `1`, tombol minus harus tetap aktif dan menghapus item terkait dari cart berdasarkan `cart_id`.
3. Gunakan endpoint/helper cart yang sudah dipakai aplikasi untuk penghapusan; jangan hanya menghapus item dari state lokal.
4. Saat request berlangsung, gunakan state loading per `cart_id` yang sudah ada agar pengguna tidak dapat menekan tombol berulang.
5. Setelah berhasil, perbarui daftar cart, preview total, alokasi saldo, dan state item terpilih secara konsisten.
6. Jika penghapusan gagal, tampilkan pesan error dan pertahankan data UI sebelumnya.

Catatan: pastikan item terakhir dapat dihapus tanpa memaksa quantity kembali ke satu.

### 2. Empty state cart dan tombol Tambah Produk

Halaman: `client.loyalty.system/src/pages/Order/index.jsx`

Perubahan:

1. Bila tidak ada item cart yang dapat di-checkout, tampilkan empty state yang jelas pada area daftar produk.
2. Tampilkan tombol **Tambah Produk**.
3. Klik tombol tersebut harus melakukan navigasi client-side ke `/product`.
4. Jangan tampilkan ringkasan checkout atau kontrol quantity yang menyesatkan ketika cart kosong.

### 3. Tombol Bayar tidak berfungsi saat tidak ada produk

Halaman: `client.loyalty.system/src/pages/Order/index.jsx`

Perubahan:

1. Tombol Bayar harus disabled bila tidak ada cart/item yang dipilih untuk checkout.
2. Tambahkan guard pada handler pembayaran (`handlePay` atau handler checkout yang setara), sehingga request commit tidak dapat terkirim walaupun tombol dipicu melalui keyboard, state lama, atau manipulasi UI.
3. Tampilkan pesan informatif bila guard dijalankan: pelanggan perlu menambahkan produk terlebih dahulu.

### 4. Tombol Tutup pada popup QRIS menuju daftar transaksi

Halaman: `client.loyalty.system/src/pages/Order/index.jsx`

Komponen terkait: `client.loyalty.system/src/components/QrisPaymentModal/index.jsx`

Perubahan:

1. Pada QRIS yang dibuka dari `/order`, callback `onClose` harus menutup modal lalu mengarahkan pengguna ke `/transaction/list` menggunakan navigasi replace bila sesuai pola aplikasi saat ini.
2. Jangan mengubah perilaku callback sukses QRIS: sukses tetap menuju daftar transaksi/sukses sesuai flow yang telah ada.
3. Komponen `QrisPaymentModal` harus tetap reusable; perubahan navigasi sebaiknya ditentukan pemanggil di halaman `/order`, bukan di-hardcode di komponen modal.

### 5. Tampilkan `transaction_id` pada daftar transaksi

Halaman: `client.loyalty.system/src/pages/TransactionList/index.jsx`

Perubahan:

1. Ubah label ID pada kartu daftar transaksi agar menggunakan `transaction_id`, bukan `transaction_number` yang dipotong atau dinormalisasi sebagai ID.
2. Tombol Salin pada area tersebut juga menyalin `transaction_id`.
3. Bila response lama tidak mempunyai `transaction_id`, gunakan fallback `transaction_number` agar daftar transaksi tidak menampilkan nilai kosong.
4. Jangan mengubah identifier yang dipakai untuk membuka detail transaksi atau memanggil endpoint resume/complete; gunakan reference yang sudah sesuai kontrak endpoint masing-masing.

### 6. Bantuan WhatsApp untuk transaksi yang belum dibayar

Halaman: `client.loyalty.system/src/pages/TransactionList/index.jsx`

Perubahan:

1. Pada kartu transaksi yang menampilkan tombol **Lanjutkan Pembayaran**, tambahkan teks/link tepat di atas tombol:

   `Memiliki masalah dalam pembayaran? klik disini`

2. Link hanya tampil jika transaksi memang belum dibayar dan pelanggan dapat melanjutkan pembayaran. Jangan tampil pada transaksi lunas, kedaluwarsa, dibatalkan, atau selesai.
3. Saat diklik, buka WhatsApp toko pada tab/aplikasi baru dengan pesan URL-encoded berikut:

   `Hallo kak, pembayaran transaksi saya nomor #[transaction_id] mengalami kendala, mohon dibantu`

4. Nomor tujuan harus diambil dari data toko yang berelasi dengan transaksi. Normalisasi nomor Indonesia sebelum membuat URL `https://wa.me/<nomor>?text=<pesan>`:
   - hapus karakter selain angka;
   - ubah awalan `0` menjadi `62`;
   - jangan membuka URL bila nomor tidak valid/tersedia; tampilkan pesan yang jelas.
5. Klik link tidak boleh memicu event klik kartu transaksi atau membuka halaman detail. Gunakan `stopPropagation()` bila kartu memakai click handler.
6. Gunakan `transaction_id` dengan fallback `transaction_number` hanya apabila `transaction_id` tidak tersedia, agar pelanggan selalu mempunyai referensi pada pesan bantuan.

## File yang diperkirakan dimodifikasi

| Repository | File | Perubahan |
| --- | --- | --- |
| `client.loyalty.system` | `src/pages/Order/index.jsx` | Hapus item pada minus quantity 1, empty state, guard/tampilan tombol Bayar, dan redirect saat QRIS ditutup. |
| `client.loyalty.system` | `src/pages/TransactionList/index.jsx` | Tampilan/copy `transaction_id` serta link bantuan WhatsApp di atas tombol lanjutkan pembayaran. |
| `client.loyalty.system` | `src/components/QrisPaymentModal/index.jsx` | Kemungkinan tidak perlu diubah; hanya verifikasi bahwa prop `onClose` tetap dipanggil. Ubah hanya bila kontrak callback belum mendukung kebutuhan halaman. |
| `client.loyalty.system` | helper cart/API yang sudah dipakai oleh `/order` | Hanya bila belum ada fungsi delete cart yang dapat dipakai dari halaman order. |
| `core.loyalty.system` | controller/serializer transaksi terkait | Hanya bila response daftar transaksi belum membawa `transaction_id` atau nomor WhatsApp toko. Tambahkan data secara backward-compatible. |

Tidak ada file baru yang diwajibkan. Bila helper WhatsApp perlu dipakai ulang antara halaman detail dan daftar transaksi, boleh dibuat utility kecil, misalnya `client.loyalty.system/src/utils/whatsapp.js`, untuk normalisasi nomor dan pembentukan URL. Hindari duplikasi logika bila utility tersebut dibuat.

## Kriteria penerimaan

1. Di `/order`, klik minus pada item quantity satu menghapus item tersebut dari cart.
2. Ketika cart kosong, tersedia tombol Tambah Produk yang membuka `/product`.
3. Pembayaran tidak dapat diproses ketika tidak ada item checkout.
4. Menutup QRIS yang dibuka dari `/order` membawa pelanggan ke `/transaction/list`.
5. Daftar transaksi menampilkan dan menyalin `transaction_id`.
6. Transaksi belum dibayar menampilkan link bantuan tepat di atas tombol Lanjutkan Pembayaran.
7. Link bantuan membuka WhatsApp toko dengan pesan yang memuat ID transaksi dan tidak ikut membuka detail kartu.
8. Bila nomor WhatsApp toko tidak ada atau tidak valid, aplikasi tidak membuka URL yang salah dan menampilkan pemberitahuan.
9. Perilaku transaksi lunas, transaksi selesai, QRIS sukses, serta flow resume pembayaran yang sudah ada tidak regress.

## Skenario pengujian

Lakukan pengujian manual minimal untuk:

1. quantity lebih dari satu, quantity satu, dan penghapusan item terakhir;
2. cart kosong lalu navigasi Tambah Produk;
3. klik Bayar saat cart kosong dan saat cart berisi;
4. QRIS dibuka dari `/order`, kemudian ditutup, expired, dan sukses;
5. daftar transaksi dengan `transaction_id` tersedia maupun fallback data lama;
6. transaksi pending dengan nomor toko valid, nomor toko tidak tersedia, dan transaksi yang tidak boleh melanjutkan pembayaran;
7. klik link WhatsApp tanpa membuka detail transaksi;
8. build frontend setelah perubahan.

## Catatan implementasi

- Jangan menggunakan total/quantity yang dihitung hanya dari browser sebagai sumber kebenaran untuk commit checkout; server tetap authoritative.
- Pertahankan format pesan WhatsApp persis seperti requirement, termasuk penggunaan `Hallo kak` dan `#[transaction_id]`.
- Semua perubahan UI harus tetap responsif untuk layar mobile karena navigasi dan checkout berorientasi mobile.
