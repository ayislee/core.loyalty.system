# Notulensi Evaluasi Aplikasi Marketplace

## Informasi Meeting

- Tanggal meeting: belum dicantumkan
- Tanggal penelusuran aplikasi: 29 September 2026
- Topik: evaluasi dan pengembangan aplikasi marketplace
- Ruang lingkup aplikasi yang ditinjau:
  - `client.loyalty.system`
  - `core.loyalty.system`
  - `cms.loyalty.system`
  - `frontend-mediacartz-react`
  - `backend-mediacartz`
- Catatan: dokumen ini dibuat dari hasil meeting dan alur aplikasi yang saat ini ada di workspace. Tidak ada kode aplikasi yang diubah.

## Ringkasan Hasil Meeting

Meeting menghasilkan sepuluh kebutuhan pengembangan. Kebutuhan tersebut mencakup tampilan produk, voucher, promo, laporan, notifikasi transaksi, pengelolaan saldo konsumen, dan pemberian poin setelah konsumen memberikan review.

Pengembangan saldo konsumen pada poin 7, 8, dan 9 harus dikerjakan sebagai satu rangkaian. Wallet konsumen merupakan fitur baru yang seluruh data dan proses saldonya berada di `core.loyalty.system`.

## Hasil Pembahasan

### 1. Tombol kembali dari halaman detail produk

Kebutuhan:

Setelah pengguna membuka detail produk, tombol kembali harus membawa pengguna ke halaman sebelumnya dengan kondisi yang sama seperti sebelum membuka detail.

Kondisi aplikasi saat ini:

- Daftar produk berada di halaman `/product` dan detail berada di `/product/:item_slug`.
- Tombol kembali pada navbar sudah memakai riwayat browser (`navigate(-1)`).
- Namun kategori aktif, kata pencarian, hasil pencarian, dan posisi scroll masih disimpan sebagai state lokal halaman produk. State tersebut dapat kembali ke kondisi awal ketika halaman produk dibuat ulang.

Alur yang disepakati:

1. Sebelum membuka detail produk, aplikasi menyimpan asal halaman, tab kategori, kata pencarian, dan posisi scroll.
2. Pengguna membuka detail produk.
3. Saat tombol kembali ditekan, pengguna kembali ke halaman asal.
4. Tab, pencarian, daftar produk, dan posisi scroll dipulihkan.
5. Jika detail produk dibuka langsung dari tautan luar dan tidak mempunyai halaman asal, tombol kembali diarahkan ke `/product`.

Hasil yang diharapkan:

Pengguna tidak perlu mencari ulang produk setelah melihat detail produk.

### 2. Tab kategori pada halaman voucher

Kebutuhan:

Halaman `/voucher` mempunyai dua tab:

- Voucher Marketplace: voucher hasil redeem poin yang hanya dapat digunakan pada transaksi marketplace, misalnya voucher gratis ongkir.
- Voucher Toko: voucher hasil redeem poin yang hanya dapat digunakan di toko fisik, misalnya voucher gratis barang.

Kondisi aplikasi saat ini:

- Seluruh voucher pada aplikasi loyalty berasal dari `core.loyalty.system`. Voucher pada `backend-mediacartz` tidak digunakan sebagai sumber daftar voucher loyalty.
- Semua voucher tetap diperoleh melalui proses redeem poin yang sama. Setelah redeem berhasil, voucher tercatat sebagai `member_vouchers` milik konsumen.
- Voucher yang digunakan pada transaksi marketplace juga tetap dicatat sebagai proses redeem/exchange voucher. Transaksi marketplace mengirim voucher loyalty ke `backend-mediacartz`, lalu `backend-mediacartz` memvalidasinya kembali ke `core.loyalty.system` dan menyimpan snapshot voucher pada transaksi.
- Voucher toko fisik digunakan melalui QR voucher milik member pada lokasi `redeem_merchant`. Token konfirmasi tetap dipakai sebelumnya saat konsumen melakukan redeem poin.
- Tipe voucher yang tersedia saat ini adalah `free`, `amount`, dan `free_delivery`.
- Data voucher saat ini belum mempunyai penanda tujuan penggunaan yang tegas antara marketplace dan toko fisik. Selain itu, validasi marketplace yang ada masih dapat memproses tipe `free`, `amount`, dan `free_delivery`. Karena itu pembatasan kanal penggunaan belum sepenuhnya diterapkan.

Alur yang disepakati:

1. Kedua tab mengambil voucher dari sumber yang sama, yaitu voucher aktif di `core.loyalty.system`.
2. Kedua tab tetap menggunakan proses redeem poin, konfirmasi, dan penerbitan `member_voucher` yang sama.
3. Tab **Voucher Marketplace** hanya menampilkan voucher yang ditandai untuk penggunaan marketplace. Contoh: voucher `free_delivery` hanya dapat dipilih saat checkout marketplace dan tidak dapat ditukar melalui QR di toko fisik.
4. Tab **Voucher Toko** hanya menampilkan voucher yang ditandai untuk penggunaan toko fisik. Contoh: voucher gratis barang hanya dapat digunakan melalui proses penukaran di `redeem_merchant` dan tidak dapat dipilih saat checkout marketplace.
5. Setelah voucher digunakan, keduanya tetap menghasilkan catatan redeem/exchange pada siklus voucher. Perbedaannya hanya kanal penggunaan: transaksi marketplace atau toko fisik.
6. API daftar voucher perlu menerima filter kanal penggunaan agar pagination setiap tab tetap benar. Pemisahan tidak cukup dilakukan pada data yang sudah diterima oleh frontend.
7. Validasi harus dilakukan kembali di backend: checkout marketplace menolak voucher khusus toko, sedangkan proses QR/toko menolak voucher khusus marketplace.
8. Jika transaksi marketplace dibatalkan, alur pengembalian voucher yang sudah ada tetap mengubah voucher agar dapat digunakan kembali dan mencatat status `returned` secara idempoten.
9. Setiap tab mempunyai keadaan loading, data kosong, pagination, dan pesan kesalahan sendiri.

Data yang perlu ditambahkan atau ditetapkan:

- Penanda kanal penggunaan voucher, misalnya `marketplace` atau `store`, pada data voucher di `core.loyalty.system`.
- Pengaturan kanal tersebut pada form voucher di `cms.loyalty.system`.
- Aturan awal untuk data lama agar voucher yang sudah ada tidak salah kategori.

Catatan penting:

Voucher native yang ada di `backend-mediacartz` berada di luar pembagian kategori ini dan tidak boleh ditampilkan pada kedua tab voucher loyalty.

### 3. Banner promo pada tab Semua di halaman produk

Kebutuhan:

Pada halaman `/product`, baris pertama tab **SEMUA** diganti dengan banner produk promo.

Kondisi aplikasi saat ini:

- Tab **SEMUA** memakai ID kategori khusus dan menampilkan seluruh produk dalam grid.
- Daftar produk dimulai langsung dari kartu produk.
- Belum ada banner promo pada halaman produk.

Alur yang disepakati:

1. Banner hanya tampil ketika tab **SEMUA** aktif.
2. Banner menempati area baris pertama, kemudian daftar produk tetap tampil di bawahnya.
3. Banner yang ditampilkan harus berstatus aktif dan berada dalam periode tayang.
4. Banner dapat diarahkan ke detail produk atau tujuan lain yang telah diatur di CMS.
5. Jika tidak ada promo aktif atau data banner gagal dimuat, daftar produk tetap dapat digunakan seperti biasa.
6. Banner tidak ditampilkan pada tab kategori selain **SEMUA**, kecuali nantinya ada pengaturan khusus.

Hasil yang diharapkan:

Promo lebih mudah terlihat tanpa mengganggu pencarian, pemilihan kategori, dan proses membuka detail produk.

### 4. Pengaturan promo melalui CMS Loyalty

Kebutuhan:

Pengelolaan banner promo dilakukan melalui `cms.loyalty.system`.

Kondisi aplikasi saat ini:

- CMS sudah mempunyai pola halaman daftar, tambah, detail, ubah, filter, status, dan unggah/pemilihan gambar untuk voucher.
- Belum ada menu, halaman, API, maupun data promo/banner di `cms.loyalty.system` dan `core.loyalty.system`.
- `backend-mediacartz` mempunyai fitur iklan toko, tetapi fitur tersebut terpisah dari CMS Loyalty dan belum menjadi sumber banner halaman `/product`.

Data minimum promo yang dibutuhkan:

- judul promo;
- gambar banner;
- status aktif/nonaktif;
- tanggal dan jam mulai;
- tanggal dan jam selesai;
- urutan tampil;
- tujuan saat banner ditekan, misalnya produk atau URL;
- cakupan partner/perusahaan bila promo tidak berlaku untuk semua pengguna;
- pembuat dan waktu perubahan untuk kebutuhan audit.

Alur yang disepakati:

1. Admin atau partner yang berhak membuat promo dari CMS.
2. Sistem memvalidasi gambar, periode tayang, tujuan banner, dan hak akses partner.
3. Promo disimpan di layanan inti loyalty.
4. Halaman produk meminta daftar promo publik yang sedang aktif.
5. Layanan hanya mengirim promo yang sesuai waktu tayang, status, dan cakupan partner/perusahaan.

### 5. Sales Type Marketplace pada statistik retail dan file ekspor

Kebutuhan:

Tambahkan **Marketplace** sebagai Sales Type pada `/dashboard/retail/statistic`, termasuk di file ekspor.

Kondisi aplikasi saat ini:

- Filter Sales Type mengambil master pembayaran dan hanya memasukkan `MIDTRANS` serta `MERCHANT_PAYMENT`.
- Ringkasan transaksi, item, dan customer dikirim ke endpoint laporan yang memfilter berdasarkan metode pembayaran.
- Transaksi yang dibuat dari Loyalty Marketplace sudah diberi penanda `transaction_source_identifier = CORE_LOYALTY` di `backend-mediacartz`.
- Endpoint laporan statistik belum menerima filter sumber transaksi tersebut.
- Endpoint `transaction/report` untuk ekspor belum memilih kolom `transaction_source_identifier`.
- Kolom **Sales Type** pada file ekspor saat ini ditentukan dari nama/metode pembayaran. File yang dihasilkan sebenarnya berformat CSV dan dibuka menggunakan Excel.

Alur yang disepakati:

1. Pilihan Sales Type ditambah **Marketplace**.
2. Marketplace dikenali dari sumber transaksi `CORE_LOYALTY`, bukan dari metode pembayaran.
3. Saat Marketplace dipilih, laporan transaksi, item, dan customer hanya menghitung transaksi dari sumber tersebut.
4. API laporan dan API ekspor harus mengirim serta dapat memfilter sumber transaksi.
5. Pada ekspor, kolom **Sales Type** berisi `Marketplace` untuk transaksi `CORE_LOYALTY`.
6. Logika Sales Type lama tetap digunakan untuk transaksi selain Marketplace.

Hasil yang diharapkan:

Angka pada layar dan file ekspor menunjukkan data Marketplace yang sama dan tidak tercampur dengan transaksi kasir/retail biasa.

### 6. Notifikasi WhatsApp untuk toko dan customer

Kebutuhan:

Notifikasi WhatsApp tentang status transaksi dan status pengiriman dikirim kepada toko dan customer.

Kondisi aplikasi saat ini:

- Setelah pembayaran online berhasil, customer sudah dapat menerima WhatsApp melalui `customer_msisdn`.
- Notifikasi internal memakai daftar nomor dari konfigurasi `WHATSAPP_INTERNAL_RECIPIENTS`; nomor tersebut belum dipastikan sebagai nomor toko dari data `store_phone`.
- Perubahan status GoSend mengirim WhatsApp monitoring hanya kepada penerima internal.
- Perubahan status pengiriman manual hanya memperbarui status dan riwayat; belum mengirim WhatsApp kepada toko dan customer.
- Sistem sudah mempunyai layanan WhatsApp dan pencatatan sebagian notifikasi pada `transaction_data` untuk mencegah pengiriman berulang.

Alur yang disepakati:

1. Setiap perubahan status yang perlu diketahui pengguna menghasilkan satu kegiatan notifikasi.
2. Penerima customer diambil dari `customer_msisdn`.
3. Penerima toko diambil dari data toko, terutama `store_phone`, dengan nomor cadangan yang ditetapkan oleh operasional bila diperlukan.
4. Isi pesan menggunakan nomor transaksi, nama toko, status terbaru, dan informasi pengiriman yang aman untuk dibagikan.
5. Alur berlaku untuk perubahan otomatis dari webhook kurir dan perubahan manual dari dashboard.
6. Setiap penerima dan setiap status mempunyai kunci unik agar webhook yang masuk berulang tidak mengirim pesan dua kali.
7. Kegagalan WhatsApp dicatat dan dapat dicoba ulang, tetapi tidak membatalkan perubahan status transaksi.

Status minimum yang perlu mendapatkan notifikasi:

- pembayaran berhasil atau gagal;
- pesanan diproses/dikemas;
- kurir sedang dicari;
- kurir ditemukan;
- barang diambil;
- barang dalam perjalanan;
- barang diterima;
- pengiriman gagal, ditolak, dibatalkan, atau kurir tidak ditemukan;
- transaksi dibatalkan dan dana dikembalikan.

### 7. Pengembalian dana jika pengiriman gagal

Kebutuhan:

Jika transaksi batal karena pengiriman gagal oleh pihak kurir, dana dikembalikan ke balance konsumen.

Kondisi aplikasi saat ini:

- Status GoSend sudah dipetakan, termasuk `Cancelled`, `No Driver Found`, `Pickup gagal`, dan `Ditolak`.
- Untuk status `Cancelled` dan `No Driver Found`, sistem mencoba pemesanan kurir kembali secara otomatis. Batas bawaan saat ini adalah lima kali percobaan.
- Proses penolakan transaksi retail sudah dapat mengembalikan stok, mengembalikan voucher loyalty, dan menyesuaikan poin bila diperlukan.
- Proses tersebut belum mengembalikan uang pembayaran ke balance konsumen.
- Belum ada wallet dan ledger balance konsumen di `core.loyalty.system`.

Alur yang disepakati:

1. Sistem menerima status gagal dari kurir.
2. Jika status masih boleh dicoba ulang, sistem mengikuti proses retry kurir yang sudah ada.
3. Setelah batas retry habis atau status dinyatakan final oleh operasional, transaksi masuk proses pembatalan.
4. `backend-mediacartz` menyelesaikan pembatalan transaksi retail serta pengembalian stok/voucher, kemudian menyampaikan hasil transaksi final beserta referensi transaksi kepada `core.loyalty.system`.
5. `core.loyalty.system` memvalidasi referensi tersebut dan membuat kredit pada wallet konsumen.
6. Setiap refund mempunyai referensi transaksi dan kunci idempotensi agar transaksi yang sama tidak direfund dua kali.
7. Customer dan toko menerima pemberitahuan hasil pembatalan serta refund.
8. Jika salah satu proses teknis gagal, transaksi ditandai untuk rekonsiliasi dan dapat diproses ulang tanpa menggandakan saldo.

Catatan yang perlu dipastikan sebelum pengembangan:

- status kurir apa saja yang langsung dianggap gagal final;
- apakah retry manual masih diperbolehkan setelah batas otomatis habis;
- komponen dana yang dikembalikan: harga barang, ongkir, dan/atau biaya admin;
- penanganan refund jika voucher atau balance ikut digunakan dalam pembayaran.

### 8. Balance konsumen untuk withdraw atau pembayaran berikutnya

Kebutuhan:

Balance konsumen dapat ditarik (withdraw) atau digunakan untuk membayar transaksi berikutnya. Saldo balance ditampilkan pada dashboard marketplace konsumen dan pada `cms.loyalty.system` seperti tampilan poin.

Kondisi aplikasi saat ini:

- Data member di `core.loyalty.system` mempunyai poin dan voucher, tetapi belum mempunyai wallet/balance.
- Dashboard marketplace pada halaman `/home` saat ini menampilkan **Total Poin Anda** dari data profil, tetapi belum menampilkan balance.
- Daftar member di CMS saat ini menampilkan dan dapat mengurutkan saldo poin. Halaman detail member juga menampilkan kartu saldo poin serta riwayat poin melalui endpoint khusus member.
- Ada template email withdraw lama untuk dana referral, tetapi belum ada alur withdraw balance konsumen marketplace.
- Tabel `partners` dan form pengelolaan partner saat ini belum mempunyai data email financial.
- Tipe user pada tabel `users` saat ini hanya `admin` dan `partner`. Belum ada tipe user khusus untuk verifikasi withdraw.
- `core.loyalty.system` sudah mempunyai pola konfirmasi token enam digit melalui WhatsApp dan email pada proses redeem voucher. Token disimpan dalam bentuk hash dan berlaku lima menit, tetapi pola ini belum tersedia untuk withdraw.
- Checkout marketplace saat ini hanya menawarkan payment gateway default perusahaan.

Alur balance yang disepakati:

1. Setiap konsumen mempunyai satu wallet dengan saldo tersedia dan saldo tertahan.
2. Semua perubahan saldo dicatat sebagai mutasi yang tidak boleh dihapus: refund, pembayaran, pembatalan pembayaran, withdraw, dan pengembalian withdraw.
3. Dashboard marketplace menampilkan kartu **Balance Anda** bersama informasi poin. Nilai yang ditampilkan adalah saldo tersedia yang dapat dipakai atau ditarik.
4. Dari dashboard, konsumen dapat membuka riwayat mutasi balance dan proses withdraw.
5. Setelah refund, pembayaran, pembatalan, atau perubahan status withdraw berhasil, nilai balance pada dashboard harus ikut diperbarui.
6. Daftar member di `cms.loyalty.system` menampilkan kolom saldo balance di samping saldo poin dan dapat diurutkan berdasarkan balance.
7. Halaman detail member di CMS menampilkan kartu **Saldo Balance Saat Ini** dan riwayat mutasi secara terpisah dari poin, mengikuti pola komponen saldo dan riwayat poin yang sudah ada.
8. Informasi mutasi di CMS sekurang-kurangnya memuat tanggal, jenis mutasi, debit/kredit, nilai saldo setelah mutasi, status, dan referensi transaksi atau withdraw.
9. Tampilan balance di CMS bersifat informasi/audit. Penambahan atau pengurangan saldo secara manual tidak termasuk keputusan meeting ini dan memerlukan hak akses serta prosedur terpisah jika nantinya dibutuhkan.
10. Saat checkout, konsumen dapat memilih menggunakan balance.
11. Konsumen mengisi jumlah withdraw dan tujuan pencairan, lalu meminta token konfirmasi. Pada tahap ini request withdraw belum dibuat dan balance belum ditahan.
12. Sistem memeriksa ketersediaan balance, kelengkapan tujuan pencairan, serta nomor WhatsApp atau email yang sudah terdaftar pada akun konsumen.
13. `core.loyalty.system` membuat token enam digit dan mengirimkannya ke nomor WhatsApp dan/atau email terdaftar. Polanya mengikuti konfirmasi redeem voucher yang sudah ada: token hanya disimpan dalam bentuk hash dan berlaku lima menit.
14. Konsumen memasukkan token tersebut untuk mengonfirmasi bahwa withdraw benar dilakukan oleh pemilik akun.
15. Sistem hanya menerima token yang sesuai dengan member, proses withdraw, jumlah dan tujuan pencairan yang sedang dikonfirmasi, masih berlaku, belum pernah digunakan, serta belum melewati batas percobaan.
16. Token hanya dapat digunakan satu kali. Permintaan kirim ulang membuat token sebelumnya tidak berlaku, sedangkan percobaan salah dan pengiriman ulang dibatasi serta dicatat untuk mencegah penyalahgunaan.
17. Jika token salah atau kedaluwarsa, request withdraw tidak dibuat, balance tidak ditahan, dan konsumen dapat meminta token baru sesuai batas waktu pengiriman ulang.
18. Setelah token valid, sistem memeriksa ulang balance dan data withdraw di dalam transaksi database. Barulah request withdraw dibuat, dihubungkan dengan `partner_id` yang sesuai dengan wallet/member, dan dana dipindahkan dari saldo tersedia ke saldo tertahan secara atomik.
19. Token yang sudah berhasil diverifikasi ditandai telah digunakan dan tidak dapat dipakai untuk membuat request withdraw lain.
20. `core.loyalty.system` mengambil email financial dari data partner di tabel `partners`.
21. Setelah request tersimpan, sistem mengirim email notifikasi ke email financial partner. Email berisi identitas member, nomor request, jumlah withdraw, tujuan pencairan, waktu pengajuan, dan tautan aman untuk membuka detail request di CMS.
22. Pihak financial partner masuk ke `cms.loyalty.system` menggunakan akun dengan tipe `financial_partner`, membuka daftar request withdraw, kemudian memilih **Approve** atau **Reject**.
23. Hanya user aktif dengan `users.type = financial_partner` yang boleh melakukan approve atau reject withdraw. User bertipe `admin` maupun `partner` tidak boleh menjalankan tindakan verifikasi tersebut.
24. User `financial_partner` wajib terhubung ke partner melalui relasi `user_partners` dan hanya dapat melihat serta memproses request milik partner tersebut.
25. Jika di-approve, status menjadi `approved` dan dana tetap tertahan sampai proses pencairan dinyatakan `paid`.
26. Jika di-reject, alasan penolakan wajib diisi dan seluruh dana tertahan dikembalikan ke saldo tersedia konsumen.
27. Setelah withdraw berhasil dibayar, dana tertahan diselesaikan. Jika proses pencairan gagal setelah approval, status menjadi `failed` dan penanganan saldo mengikuti hasil rekonsiliasi yang tercatat.
28. Konsumen menerima pemberitahuan ketika request dibuat, di-approve, di-reject, gagal, atau berhasil dibayar.
29. Setiap keputusan mencatat waktu, `user_id` financial partner yang memproses, alasan/catatan, dan nilai saldo sebelum serta sesudah proses.
30. Perubahan saldo harus memakai transaksi database, penguncian saldo, dan kunci idempotensi.

Hak akses user `financial_partner`:

- Nilai enum `financial_partner` ditambahkan pada kolom `users.type` di `core.loyalty.system`.
- Setiap akun `financial_partner` harus berstatus aktif dan mempunyai satu relasi partner yang valid pada `user_partners`.
- Endpoint daftar/detail withdraw memfilter data berdasarkan partner milik user yang sedang login.
- Endpoint approve dan reject dilindungi middleware/otorisasi khusus yang memeriksa tipe `financial_partner`, status user, relasi partner, kepemilikan request, dan status request yang masih dapat diproses.
- Pemeriksaan dilakukan di `core.loyalty.system`; menyembunyikan tombol di CMS saja tidak dianggap cukup.
- User `financial_partner` tidak mendapatkan akses otomatis ke pengelolaan voucher, poin, member, partner, user, promo, atau laporan lain.
- CMS menampilkan menu withdraw khusus untuk `financial_partner`. Tautan dari email tetap meminta login sebelum detail request dapat dibuka.
- Percobaan approve/reject oleh user `admin`, `partner`, financial dari partner lain, user nonaktif, atau request yang sudah final harus ditolak dan dicatat pada audit keamanan.

Batas sistem yang disepakati:

- Wallet, saldo tersedia, saldo tertahan, dan seluruh ledger konsumen hanya disimpan serta dikelola oleh `core.loyalty.system`.
- Dashboard marketplace dan `cms.loyalty.system` membaca balance dari API `core.loyalty.system`.
- `backend-mediacartz` tidak membaca, menyimpan, menghitung, menahan, menambah, atau mengurangi balance konsumen.
- Hubungan dengan `backend-mediacartz` hanya berupa pertukaran status dan referensi transaksi yang diperlukan oleh `core.loyalty.system` untuk memutuskan proses refund atau penyelesaian pembayaran.

Data balance yang ditampilkan:

- saldo tersedia;
- saldo tertahan;
- total saldo, bila diperlukan untuk rekonsiliasi;
- waktu pembaruan terakhir;
- riwayat mutasi dengan pagination.

Data minimum withdraw:

- member pemilik saldo;
- partner pemilik proses withdraw;
- referensi konfirmasi token dan waktu token berhasil diverifikasi;
- snapshot email financial partner saat request dibuat;
- jumlah penarikan;
- tujuan pencairan yang telah diverifikasi;
- status `requested`, `approved`, `processing`, `paid`, `rejected`, atau `failed`;
- waktu dan pengguna yang memproses;
- alasan penolakan/kegagalan;
- referensi pembayaran dan bukti pencairan.

Data minimum konfirmasi token withdraw:

- member pemilik akun;
- nilai withdraw dan snapshot tujuan pencairan yang dikonfirmasi;
- kanal pengiriman, yaitu WhatsApp dan/atau email;
- tujuan pengiriman yang disamarkan pada respons aplikasi;
- hash token, bukan token asli;
- waktu kedaluwarsa, waktu verifikasi, dan waktu token digunakan;
- jumlah percobaan, jumlah pengiriman ulang, status, serta catatan kegagalan pengiriman.

Pengaturan email financial partner:

- Email financial disimpan pada tabel `partners`, misalnya dalam kolom `financial_email`.
- Email dapat diisi dan diperbarui dari form Partner di `cms.loyalty.system` oleh pengguna yang mempunyai hak pengelolaan partner.
- Format email wajib divalidasi.
- Partner harus mempunyai setidaknya satu akun `financial_partner` aktif yang terhubung melalui `user_partners` sebelum withdraw dapat digunakan.
- Request withdraw tidak boleh diajukan jika partner belum mempunyai email financial yang valid. Aplikasi menampilkan pesan agar data partner dilengkapi terlebih dahulu.
- Perubahan email partner tidak mengubah snapshot email pada request lama sehingga riwayat audit tetap jelas.
- Kegagalan pengiriman email dicatat dan dapat dicoba ulang tanpa membuat request withdraw atau menahan saldo untuk kedua kalinya.

Catatan yang perlu diputuskan oleh bisnis dan finance:

- nilai minimum/maksimum withdraw;
- biaya withdraw;
- tujuan pencairan yang didukung, misalnya rekening bank atau e-wallet;
- kebutuhan verifikasi identitas dan kepemilikan rekening;
- apakah token selalu dikirim ke seluruh kanal yang tersedia atau konsumen boleh memilih WhatsApp maupun email;
- batas percobaan token dan jeda pengiriman ulang;
- waktu proses dan prosedur pencairan setelah disetujui financial;
- perlakuan akuntansi serta rekonsiliasi dana.

### 9. Split bill antara balance dan payment gateway

Kebutuhan:

Jika nilai transaksi lebih besar daripada balance konsumen, pembayaran dibagi antara balance dan metode pembayaran lain.

Kondisi aplikasi saat ini:

- Checkout memilih satu payment gateway perusahaan dan mengirim satu `ms_payment_id`.
- Ringkasan checkout belum mempunyai komponen pembayaran dari balance.
- Tabel riwayat pembayaran dapat menyimpan beberapa percobaan pembayaran, tetapi belum membagi nilai satu transaksi menjadi pembayaran balance dan pembayaran eksternal.

Alur yang disepakati:

1. Sistem menghitung total akhir setelah voucher dan ongkir.
2. Jika balance nol, seluruh nilai dibayar melalui payment gateway seperti alur sekarang.
3. Jika balance cukup, seluruh nilai dibayar dari balance.
4. Jika balance lebih kecil dari total, balance dipakai sesuai jumlah yang tersedia dan sisanya dibayar melalui payment gateway.
5. Bagian balance ditahan sebelum permintaan pembayaran eksternal dibuat.
6. Transaksi dinyatakan lunas hanya jika jumlah balance dan pembayaran eksternal sama dengan total transaksi.
7. Jika pembayaran eksternal gagal, kedaluwarsa, atau dibatalkan, saldo yang ditahan harus dilepas kembali.
8. Proses callback yang berulang tidak boleh memotong balance atau menyelesaikan transaksi lebih dari satu kali.
9. Detail transaksi dan laporan menampilkan nilai dari balance serta nilai dari payment gateway secara terpisah.
10. Seluruh perhitungan, penahanan, pemotongan, dan pelepasan balance dilakukan oleh `core.loyalty.system`. `backend-mediacartz` hanya memproses bagian pembayaran eksternal dan mengembalikan statusnya.

Contoh sederhana:

- Total transaksi: Rp150.000
- Balance konsumen: Rp40.000
- Balance yang dipakai: Rp40.000
- Sisa yang dibayar melalui payment gateway: Rp110.000

### 10. Pemberian poin setelah konsumen memberikan review

Kebutuhan:

Setiap konsumen yang memberikan review setelah transaksi selesai mendapatkan poin. Jumlah poin reward review diatur melalui `cms.loyalty.system`.

Kondisi aplikasi saat ini:

- Review produk sudah tersedia di `core.loyalty.system` dan ditampilkan pada `client.loyalty.system`.
- Review hanya dapat dikirim oleh member pemilik transaksi ketika status transaksi sudah `completed` atau `complete`.
- Review dilakukan per produk pada detail transaksi. Kombinasi member, produk, dan referensi transaksi sudah dibatasi agar tidak dapat direview lebih dari satu kali.
- Proses penyimpanan review saat ini hanya membuat data `product_reviews` dan belum memberikan poin.
- `cms.loyalty.system` sudah mempunyai menu **Get Point** untuk mengatur nama aktivitas, kode tiga karakter, jumlah `point_receive`, deskripsi, dan partner. Pengaturan ini disimpan pada tabel `get_points` di `core.loyalty.system`.
- Penambahan poin konsumen dicatat melalui `point_histories`, kemudian saldo poin member diperbarui.

Alur yang disepakati:

1. Setelah transaksi berstatus selesai, aplikasi menampilkan tombol review pada setiap produk yang belum direview.
2. Konsumen mengisi rating 1–5 dan komentar bila diperlukan, lalu mengirim review.
3. `core.loyalty.system` memeriksa ulang bahwa transaksi milik konsumen, transaksi sudah selesai, produk terdapat pada transaksi, dan produk tersebut belum pernah direview untuk transaksi yang sama.
4. Sistem menentukan partner dari transaksi, kemudian mengambil pengaturan reward review milik partner tersebut dari `get_points`. Aktivitas review menggunakan kode khusus tiga karakter, misalnya `REV`.
5. Nilai poin yang diberikan mengikuti nilai `point_receive` yang aktif ketika review berhasil dikirim. Perubahan nilai di CMS hanya berlaku untuk review berikutnya dan tidak mengubah poin yang sudah diberikan.
6. Review dan pemberian poin diproses dalam satu transaksi database. Sistem menyimpan review, membuat `point_history` dengan sumber `product_review`, lalu memperbarui saldo poin konsumen.
7. Setiap reward mempunyai referensi unik yang terhubung ke review, member, produk, dan transaksi. Permintaan yang dikirim berulang tidak boleh membuat review atau poin kedua.
8. Setelah berhasil, aplikasi menampilkan bahwa review sudah tersimpan, jumlah poin yang diperoleh, dan saldo poin terbaru.
9. Riwayat poin pada aplikasi konsumen dan CMS menampilkan keterangan bahwa poin berasal dari review produk beserta referensi transaksinya.
10. Jika transaksi belum selesai, bukan milik konsumen, produk tidak ada dalam transaksi, atau sudah pernah direview, review dan pemberian poin ditolak.

Pengaturan reward review di CMS:

- Pengaturan dilakukan melalui menu **Get Point** di `cms.loyalty.system` dan disimpan per partner pada `core.loyalty.system`.
- Setiap partner hanya mempunyai satu konfigurasi reward review dengan kode `REV`.
- Pengaturan sekurang-kurangnya memuat nama aktivitas, kode, jumlah poin, deskripsi, status aktif, dan waktu perubahan.
- Hanya admin atau user partner yang berhak mengelola pengaturan poin sesuai partner yang terhubung. User `financial_partner` tidak mempunyai akses ke pengaturan ini.
- Nilai poin harus lebih besar dari nol. Perubahan konfigurasi harus mencatat pengguna dan waktu perubahan untuk kebutuhan audit.
- Jika konfigurasi reward review tidak tersedia atau tidak aktif, aplikasi tidak boleh menjanjikan reward poin dan harus menampilkan informasi yang jelas kepada konsumen.

Catatan penerapan:

Alur review yang ada saat ini bekerja per produk dalam transaksi. Karena itu notulensi ini menetapkan satu reward untuk setiap review produk yang valid. Jika bisnis menginginkan hanya satu reward untuk seluruh transaksi, aturan tersebut perlu diputuskan secara khusus sebelum pengembangan.

## Ketergantungan Antarpekerjaan

Urutan yang disarankan:

1. Perbaikan navigasi detail produk.
2. Banner produk dan pengelolaan promo CMS, karena keduanya saling bergantung.
3. Tab voucher setelah penanda kanal penggunaan dan aturan migrasi voucher lama ditetapkan.
4. Sales Type Marketplace pada API laporan, layar statistik, dan ekspor.
5. Pengaturan reward review di CMS dan pemberian poin pada alur review yang sudah ada.
6. Notifikasi WhatsApp untuk seluruh perubahan status.
7. Desain dan pembuatan wallet konsumen beserta ledger.
8. Refund gagal kirim ke wallet konsumen.
9. Pembayaran menggunakan balance.
10. Withdraw dan split bill setelah dasar wallet serta rekonsiliasi stabil.

## Pembagian Dampak per Aplikasi

| Aplikasi | Dampak utama |
| --- | --- |
| `client.loyalty.system` | Pemulihan kondisi halaman produk, tab voucher, banner promo, kartu balance pada dashboard `/home`, riwayat mutasi, form withdraw dan konfirmasi token pemilik akun, pilihan pembayaran balance/split bill, serta informasi poin yang diperoleh setelah review. |
| `core.loyalty.system` | API promo publik, kategori kanal penggunaan voucher, filter daftar voucher, validasi redeem/exchange per kanal, wallet konsumen, ledger, API saldo/riwayat untuk dashboard dan CMS, pengiriman dan verifikasi token withdraw, tipe user dan otorisasi `financial_partner`, penyimpanan email financial pada partner, notifikasi email dan approval/reject withdraw, pengaturan pemakaian balance, orkestrasi refund, serta pemberian poin review yang idempoten. |
| `cms.loyalty.system` | Menu dan halaman pengelolaan promo/banner, pengaturan kanal penggunaan voucher loyalty, pengaturan jumlah poin reward review per partner, email financial pada form Partner, pengelolaan akun `financial_partner`, kolom balance pada daftar member, saldo dan riwayat balance pada detail member, serta menu daftar/detail withdraw khusus financial partner. |
| `backend-mediacartz` | Filter sumber transaksi untuk laporan, data ekspor Sales Type, validasi bahwa voucher loyalty boleh digunakan di marketplace, notifikasi toko/customer, penetapan gagal kirim final, pembatalan retail, serta penyampaian status transaksi/pembayaran kepada `core.loyalty.system`. Tidak mengelola balance konsumen. |
| `frontend-mediacartz-react` | Pilihan Sales Type Marketplace pada statistik dan nilai Marketplace pada file ekspor. |
| `admin-mediacartz` | Belum ditemukan kebutuhan langsung dari sepuluh hasil meeting ini. |

## Kriteria Selesai Bersama

- Angka transaksi pada statistik sama dengan file ekspor untuk filter yang sama.
- Tidak ada notifikasi WhatsApp ganda untuk penerima dan status yang sama.
- Tidak ada refund, pemotongan balance, atau pelepasan balance yang terjadi dua kali.
- Riwayat saldo dapat ditelusuri sampai ke transaksi atau withdraw asalnya.
- Saldo tersedia pada dashboard marketplace sama dengan saldo member yang ditampilkan di CMS.
- CMS menampilkan saldo dan riwayat balance secara terpisah dari saldo dan riwayat poin.
- Setiap request withdraw mengirim notifikasi ke email financial dari partner yang benar.
- Request withdraw dan penahanan balance hanya dibuat setelah token pemilik akun berhasil diverifikasi.
- Token withdraw terikat pada member dan data penarikan, mempunyai masa berlaku, hanya dapat digunakan satu kali, serta tidak disimpan sebagai teks asli.
- Token salah, kedaluwarsa, atau sudah digunakan tidak dapat membuat request withdraw maupun menahan balance.
- Financial partner tidak dapat melihat atau memproses request withdraw milik partner lain.
- Approve/reject hanya berhasil untuk user aktif bertipe `financial_partner`; user `admin` dan `partner` ditolak oleh API.
- Akun `financial_partner` tidak dapat mengakses modul CMS lain di luar kebutuhan withdraw, kecuali kemudian diberikan izin baru secara khusus.
- Reject withdraw mengembalikan seluruh dana tertahan dan mencatat alasan penolakan.
- Approve/reject yang dikirim berulang tidak mengubah saldo lebih dari satu kali.
- Pembatalan transaksi mengembalikan stok dan voucher sesuai kondisi transaksi.
- Kegagalan layanan WhatsApp tidak menggagalkan transaksi atau perubahan status.
- Banner yang tidak aktif atau di luar jadwal tidak muncul di aplikasi.
- Tombol kembali dari detail produk mengembalikan pengguna ke kondisi daftar sebelumnya.
- Voucher khusus marketplace tidak dapat digunakan melalui QR/toko fisik.
- Voucher khusus toko fisik tidak dapat digunakan pada checkout marketplace.
- Penggunaan voucher pada kedua kanal tetap tercatat sebagai redeem/exchange voucher.
- Poin hanya diberikan setelah review produk pada transaksi yang sudah selesai berhasil tersimpan.
- Satu produk dalam satu transaksi hanya dapat menghasilkan satu review dan satu reward poin untuk member yang sama.
- Nilai reward sesuai konfigurasi partner di CMS pada saat review dibuat dan tercatat pada riwayat poin dengan referensi review/transaksi.
- Pengiriman ulang request review tidak menambah poin dua kali.
- User `financial_partner` tidak dapat melihat atau mengubah pengaturan poin reward review.

## Keputusan yang Masih Memerlukan Konfirmasi

1. Aturan kategori untuk voucher lama yang belum mempunyai penanda kanal penggunaan.
2. Apakah voucher tipe `amount` selalu khusus marketplace atau dapat ditetapkan per voucher.
3. Daftar status kurir yang dianggap gagal final dan batas retry yang berlaku.
4. Komponen nilai refund, khususnya ongkir dan biaya admin.
5. Kebijakan withdraw: kanal pencairan, biaya, batas nilai, verifikasi, dan persetujuan.
6. Pihak yang boleh membuat, mengubah, menonaktifkan, dan menghubungkan akun `financial_partner` ke partner: hanya admin atau juga pemilik partner.
7. Apakah email login akun `financial_partner` wajib sama dengan email financial pada tabel `partners`, atau email financial boleh berupa alamat bersama untuk menerima notifikasi.
8. Aturan pemakaian balance: otomatis memakai seluruh saldo atau jumlahnya dapat dipilih konsumen.
9. Urutan refund untuk transaksi split bill: bagian payment gateway dikembalikan ke sumber awal atau seluruhnya masuk ke balance konsumen.
10. Konfirmasi akhir apakah reward review diberikan per produk seperti alur review saat ini, atau hanya satu kali setelah seluruh produk dalam transaksi selesai direview.

## Dasar Penelusuran Alur Aplikasi

Dokumen dan kode utama yang menjadi dasar notulen:

- Navigasi dan daftar produk: `client.loyalty.system/src/components/Navigation/Navbar.jsx`, `client.loyalty.system/src/pages/Product/index.jsx`, dan `client.loyalty.system/src/pages/ProductDetail/index.jsx`.
- Halaman voucher konsumen dan redeem poin: `client.loyalty.system/src/pages/Voucher/index.jsx` dan `core.loyalty.system/app/Controllers/Http/MemberController.js`.
- Voucher milik member dan penggunaan di toko fisik: `client.loyalty.system/src/pages/Redeem/index.jsx`, `core.loyalty.system/app/Models/MemberVoucher.js`, serta `core.loyalty.system/app/Models/RedeemMerchant.js`.
- Pengelolaan voucher loyalty: `cms.loyalty.system/src/pages/Voucher` dan `core.loyalty.system/app/Controllers/Http/VoucherController.js`.
- Siklus exchange/return voucher: `core.loyalty.system/app/Services/MemberVoucherLifecycleService.js`.
- Validasi voucher loyalty pada transaksi marketplace: `backend-mediacartz/app/Services/VoucherService.js` dan `core.loyalty.system/app/Controllers/Http/CheckoutController.js`.
- Tampilan poin pada dashboard marketplace yang menjadi acuan balance: `client.loyalty.system/src/pages/Home/index.jsx` dan endpoint profil pada `core.loyalty.system/app/Controllers/Http/MemberController.js`.
- Tampilan poin member yang menjadi acuan balance di CMS: `cms.loyalty.system/src/pages/Member/Member.tsx`, `MemberDetail.tsx`, komponen `MemberPoint`, serta endpoint `admin/member/points` di `core.loyalty.system`.
- Data dan pengelolaan partner: `core.loyalty.system/app/Models/Partner.js`, `PartnerController.js`, serta `cms.loyalty.system/src/pages/Partner/PartnerForm.tsx`.
- Tipe user dan relasi partner yang menjadi dasar otorisasi financial: `core.loyalty.system/database/migrations/1503248427885_user.js`, `app/Models/User.js`, `app/Models/UserPartner.js`, `app/Controllers/Http/UserController.js`, dan middleware otorisasi di `app/Middleware`.
- Tampilan serta navigasi berdasarkan tipe user di CMS: `cms.loyalty.system/src/pages/User`, `src/components/Sidebar.tsx`, dan data login pada `src/pages/Authentication/SignIn.tsx`.
- Layanan/template email withdraw yang sudah ada sebagai referensi awal: `core.loyalty.system/app/Lib/BasicEmailService.js` dan `resources/views/mail/withdraw.edge`.
- Pola token enam digit melalui WhatsApp/email yang menjadi acuan konfirmasi withdraw: `core.loyalty.system/app/Lib/VoucherRedeemConfirmation.js`, `app/Models/VoucherRedeemConfirmation.js`, `database/migrations/1780640000000_voucher_redeem_confirmation_schema.js`, `app/Lib/WhatsappAPI.js`, dan `app/Lib/BasicEmailService.js`.
- Statistik dan ekspor: `frontend-mediacartz-react/src/dashboard/pages/Retail/Statistic.js`, `backend-mediacartz/app/Controllers/Http/ReportController.js`, dan `backend-mediacartz/app/Controllers/Http/TransactionController.js`.
- Penanda transaksi Marketplace: `backend-mediacartz/database/migrations/1782000000200_transaction_payment_gateway_schema.js` dan `backend-mediacartz/app/Controllers/Http/TransactionController.js`.
- Notifikasi pembayaran: `backend-mediacartz/app/Services/Notification/RetailPostPaymentService.js` dan `WhatsappNotificationService.js`.
- Status pengiriman dan retry kurir: `backend-mediacartz/app/Services/DeliveryMethod/GosendWebhookService.js`.
- Penolakan transaksi dan pengembalian stok/voucher: `backend-mediacartz/app/Services/TransactionService.js`.
- Checkout marketplace: `core.loyalty.system/app/Controllers/Http/CheckoutController.js` dan `client.loyalty.system/src/pages/Order/index.jsx`.
- Review transaksi dan validasi status selesai: `core.loyalty.system/app/Controllers/Http/ProductController.js`, `app/Helpers/ProductReviewEligibility.js`, `app/Models/ProductReview.js`, `database/migrations/1741350000000_product_review_schema.js`, `database/migrations/1780660000000_add_transaction_reference_to_product_reviews_schema.js`, serta `client.loyalty.system/src/pages/TransactionDetail/index.jsx` dan `TransactionList/index.jsx`.
- Pengaturan reward poin yang menjadi acuan: `core.loyalty.system/app/Controllers/Http/GetPointController.js`, `app/Models/GetPoint.js`, `database/migrations/1690450137146_get_point_schema.js`, `app/Models/PointHistory.js`, serta `cms.loyalty.system/src/pages/Point/Point.tsx` dan `PointForm.tsx`.
