# Issue: Review Produk Setelah Transaksi Selesai

## Ringkasan
Member perlu bisa memberikan review produk berdasarkan `item_id` setelah transaksi benar-benar selesai, yaitu ketika konsumen sudah menerima barang. Review tidak boleh dibuat dari produk yang belum pernah dibeli, transaksi yang belum selesai, atau transaksi milik member lain.

Saat ini backend sudah memiliki tabel `product_reviews` dan endpoint public untuk menampilkan review produk. Fitur yang perlu ditambahkan adalah flow member untuk membuat review dari transaksi yang eligible.

## Tujuan
1. Member bisa memberi rating dan komentar untuk produk yang sudah dibeli.
2. Review hanya bisa dibuat setelah transaksi selesai atau barang diterima.
3. Review hanya bisa dibuat untuk `item_id` yang ada di detail transaksi member tersebut.
4. Review tidak boleh dibuat berulang untuk item yang sama pada transaksi yang sama.
5. Review yang berhasil dibuat ikut tampil di halaman detail produk dan ringkasan rating produk.

## Kondisi Saat Ini
1. Backend sudah memiliki tabel `product_reviews` dengan field utama `item_id`, `member_id`, `rating`, dan `comment`.
2. Backend sudah memiliki model `ProductReview`.
3. Endpoint public `GET /api/v1/public/product/review` sudah tersedia untuk membaca review berdasarkan `item_id`.
4. Halaman product detail frontend sudah menampilkan ringkasan dan daftar review.
5. Belum ada endpoint member untuk membuat review.
6. Belum ada validasi bahwa review hanya boleh dibuat dari transaksi yang selesai.
7. Belum ada UI review dari riwayat transaksi/order member.

## Scope Backend `core.loyalty.system`
1. Tentukan sumber status transaksi selesai.
   - Gunakan data status transaksi yang sudah tersedia dari response transaction list/detail.
   - Pastikan definisi transaksi selesai jelas, misalnya status pembayaran/approval sukses dan status pengiriman sudah diterima/selesai.
   - Jika nama status final berasal dari marketplace core, dokumentasikan status yang dianggap eligible.

2. Update struktur data review bila diperlukan.
   - Tabel `product_reviews` saat ini belum menyimpan referensi transaksi.
   - Tambahkan field referensi transaksi agar review bisa dikaitkan dengan pembelian yang valid.
   - Field yang disarankan:
     - `transaction_id` atau `transaction_number`, pilih yang paling stabil dari data transaksi.
     - `transaction_detail_id` jika tersedia dari payload transaksi.
   - Tambahkan constraint/index untuk mencegah duplicate review, misalnya kombinasi `member_id`, `item_id`, dan referensi transaksi.

3. Buat endpoint create review untuk member.
   - Contoh endpoint: `POST /api/v1/member/product/review`.
   - Endpoint wajib memakai auth member.
   - Input minimal:
     - `transaction_id` atau `transaction_number`
     - `item_id`
     - `rating` angka 1 sampai 5
     - `comment` opsional
   - Backend memvalidasi transaksi milik member yang sedang login.
   - Backend memvalidasi `item_id` ada di detail transaksi tersebut.
   - Backend memvalidasi transaksi sudah selesai/barang sudah diterima.
   - Backend menolak jika item tersebut sudah pernah direview untuk transaksi yang sama.
   - Backend menyimpan review jika semua validasi lolos.

4. Buat endpoint eligibility review bila diperlukan.
   - Contoh endpoint: `GET /api/v1/member/product/review/eligibility`.
   - Tujuannya membantu frontend menampilkan tombol `Review` atau label `Sudah direview`.
   - Response sebaiknya memberi informasi per item:
     - `item_id`
     - `can_review`
     - `already_reviewed`
     - alasan singkat jika tidak eligible.
   - Jika data eligibility bisa dimasukkan langsung ke endpoint list/detail transaksi, endpoint terpisah tidak wajib dibuat.

5. Pertahankan endpoint public review.
   - Endpoint public review tetap membaca dari `product_reviews`.
   - Setelah review baru dibuat, detail produk harus tetap bisa menampilkan average rating dan total review.
   - Jika perlu, tambahkan data sederhana seperti nama member yang dimasking, tetapi jangan tampilkan data pribadi berlebihan.

## Scope Frontend `client.loyalty.system`
1. Update halaman riwayat transaksi/order.
   - Area utama yang kemungkinan perlu diubah adalah halaman daftar transaksi member.
   - Tampilkan tombol `Review` pada item transaksi yang sudah selesai dan belum direview.
   - Jika item sudah direview, tampilkan status `Sudah direview`.
   - Jika transaksi belum selesai, jangan tampilkan tombol review atau tampilkan disabled state yang jelas.

2. Buat modal/form review.
   - Form menampilkan produk yang akan direview, minimal nama produk dan gambar jika tersedia.
   - Input rating 1 sampai 5 bintang.
   - Input komentar opsional.
   - Tombol submit memiliki loading state.
   - Jika submit berhasil, modal ditutup dan status item berubah menjadi `Sudah direview`.
   - Jika backend menolak karena transaksi belum selesai atau review duplikat, tampilkan pesan error yang mudah dipahami.

3. Integrasi API frontend.
   - Tambahkan endpoint baru di `src/utils/api.js`.
   - Gunakan helper `Api` yang sudah ada.
   - Setelah review berhasil, refresh data transaksi atau update state lokal agar tombol tidak bisa diklik ulang.

4. Dampak ke halaman produk.
   - Halaman product detail sudah menampilkan review.
   - Pastikan setelah review dibuat, data review terbaru bisa muncul saat halaman produk dibuka ulang.
   - Tidak perlu membuat perubahan besar pada desain halaman product detail kecuali diperlukan untuk konsistensi data.

## Alur User
1. Member membuka halaman riwayat transaksi.
2. Sistem menampilkan daftar transaksi dan item yang pernah dibeli.
3. Untuk transaksi yang sudah selesai/barang diterima, item yang belum direview memiliki tombol `Review`.
4. Member klik `Review`.
5. Frontend menampilkan modal rating dan komentar.
6. Member mengisi rating dan komentar, lalu submit.
7. Backend memvalidasi transaksi, item, status selesai, dan duplikasi review.
8. Jika valid, backend menyimpan review.
9. Frontend menampilkan pesan sukses dan menandai item sebagai sudah direview.
10. Review ikut tampil pada halaman detail produk.

## Acceptance Criteria
1. Member hanya bisa membuat review untuk produk yang ada di transaksi miliknya.
2. Review hanya bisa dibuat jika transaksi sudah selesai atau barang sudah diterima.
3. Rating wajib diisi dengan nilai 1 sampai 5.
4. Komentar boleh kosong.
5. Member tidak bisa membuat review duplikat untuk item yang sama pada transaksi yang sama.
6. Review yang berhasil dibuat tersimpan dengan `member_id` dan `item_id` yang benar.
7. Halaman riwayat transaksi menampilkan tombol review hanya pada item yang eligible.
8. Item yang sudah direview tidak menampilkan tombol review aktif lagi.
9. Review baru ikut dihitung pada average rating dan total review produk.

## Out of Scope
1. Edit review setelah dikirim.
2. Hapus review oleh member.
3. Upload foto/video review.
4. Moderasi review oleh admin.
5. Balasan review dari merchant.
6. Reward poin untuk review.

## Skenario Test High Level
1. Member membuat review untuk item dari transaksi yang sudah selesai.
2. Member mencoba review item dari transaksi yang belum selesai.
3. Member mencoba review item yang tidak ada di transaksi tersebut.
4. Member mencoba review transaksi milik member lain.
5. Member mencoba membuat review kedua untuk item dan transaksi yang sama.
6. Submit review dengan rating kosong atau di luar 1 sampai 5.
7. Review berhasil tampil di daftar review product detail.
8. Average rating dan total review produk berubah setelah review baru dibuat.
9. Tombol review di frontend berubah menjadi `Sudah direview` setelah submit berhasil.

## Definition of Done
1. Endpoint create review member tersedia dan tervalidasi.
2. Backend memastikan review hanya bisa dibuat dari transaksi selesai milik member.
3. Frontend menyediakan tombol dan modal review pada transaksi yang eligible.
4. Review baru tampil di product detail dan ringkasan rating produk.
5. Skenario test high level sudah dicek.
