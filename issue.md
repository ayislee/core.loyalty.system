# Issue: Halaman Detail Transaksi Member

## Ringkasan
Tambahkan halaman baru di frontend untuk menampilkan detail lengkap transaksi saat member mengklik salah satu transaksi dari daftar transaksi. Saat ini member hanya melihat ringkasan transaksi di list, sehingga informasi detail seperti item, alamat, pembayaran, pengiriman, status, dan total biaya belum mudah dibaca dalam satu halaman khusus.

Backend `core.loyalty.system` sudah memiliki endpoint transaksi member. Fitur utama berada di frontend `client.loyalty.system`, tetapi backend perlu dipastikan menyediakan data yang cukup untuk halaman detail.

## Tujuan
1. Member bisa membuka detail transaksi dari daftar transaksi.
2. Detail transaksi ditampilkan pada halaman baru dengan URL yang jelas.
3. Halaman detail menampilkan informasi lengkap namun tetap mudah dipahami.
4. Data detail transaksi hanya bisa dilihat oleh member pemilik transaksi.
5. Halaman daftar transaksi tetap dapat digunakan seperti sebelumnya.

## Scope Backend `core.loyalty.system`
1. Review endpoint detail transaksi yang sudah ada.
   - Cek endpoint `GET /api/v1/member/transaction/get`.
   - Pastikan endpoint memakai auth member.
   - Pastikan backend tidak mengembalikan transaksi milik member lain.
   - Pastikan parameter yang dipakai frontend jelas, misalnya `transaction_id`, `transaction_number`, atau identifier lain yang sudah tersedia di list transaksi.

2. Pastikan payload detail cukup untuk frontend.
   - Informasi transaksi utama:
     - nomor transaksi
     - tanggal transaksi
     - status transaksi
     - status pembayaran
     - status pengiriman
   - Informasi item:
     - nama produk
     - gambar produk jika tersedia
     - quantity
     - harga satuan
     - subtotal item
   - Informasi pembayaran:
     - metode pembayaran
     - total pembayaran
     - biaya tambahan jika ada
   - Informasi pengiriman:
     - metode pengiriman
     - alamat pengiriman
     - ongkos kirim
     - nomor resi atau tracking jika tersedia.

3. Tambahkan atau rapikan field jika diperlukan.
   - Jika endpoint detail belum mengembalikan data yang sama dengan list, tambahkan mapping seperlunya.
   - Jangan mengubah struktur besar endpoint lain jika tidak diperlukan.
   - Jika data detail berasal dari marketplace core, pastikan error dari upstream diterjemahkan menjadi response yang mudah dipahami frontend.

4. Error handling backend.
   - Jika transaksi tidak ditemukan, return response error yang jelas.
   - Jika transaksi bukan milik member yang login, return error dan jangan tampilkan data.
   - Jika upstream marketplace gagal, return message yang bisa ditampilkan frontend.

## Scope Frontend `client.loyalty.system`
1. Tambahkan route halaman detail transaksi.
   - Contoh route: `/transaction/:transactionId` atau `/transaction/detail/:transactionId`.
   - Pilih identifier sesuai data yang tersedia dari list transaksi.
   - Route harus berada di area member yang membutuhkan login.

2. Update daftar transaksi.
   - Saat member klik salah satu transaksi, arahkan ke halaman detail.
   - Klik harus membawa identifier transaksi yang benar.
   - Jika item list sudah memiliki tombol lain, pastikan klik detail tidak mengganggu aksi tersebut.

3. Buat halaman detail transaksi.
   - Tampilkan loading state saat mengambil data.
   - Tampilkan error state jika data gagal diambil.
   - Tampilkan empty/not found state jika transaksi tidak tersedia.
   - Tampilkan tombol kembali ke daftar transaksi.

4. Informasi yang perlu ditampilkan.
   - Header transaksi:
     - nomor transaksi
     - tanggal transaksi
     - status utama
   - Ringkasan item:
     - gambar/nama produk
     - quantity
     - harga
     - subtotal
   - Ringkasan pembayaran:
     - subtotal belanja
     - ongkos kirim
     - diskon jika ada
     - total pembayaran
     - metode pembayaran
   - Ringkasan pengiriman:
     - alamat tujuan
     - metode pengiriman
     - status pengiriman
     - tracking/resi jika tersedia.

5. Integrasi API.
   - Tambahkan atau gunakan endpoint detail transaksi di `src/utils/api.js`.
   - Gunakan helper `Api` yang sudah ada.
   - Pastikan parameter request sesuai backend.
   - Hindari duplikasi mapping yang terlalu rumit; buat helper kecil jika perlu.

6. UX dan tampilan.
   - Desain mengikuti style halaman member yang sudah ada.
   - Detail harus mudah discan di mobile.
   - Gunakan format harga dan tanggal yang konsisten dengan halaman lain.
   - Jangan menampilkan JSON mentah dari backend.

## Alur User
1. Member membuka halaman daftar transaksi.
2. Member memilih salah satu transaksi.
3. Frontend mengarahkan member ke halaman detail transaksi.
4. Halaman detail mengambil data transaksi dari backend.
5. Jika data berhasil diambil, detail transaksi ditampilkan.
6. Jika gagal, member melihat pesan error dan bisa kembali ke daftar transaksi.

## Acceptance Criteria
1. Member bisa membuka halaman detail dari salah satu transaksi di list.
2. URL halaman detail transaksi dapat dibuka langsung selama member sudah login.
3. Halaman detail menampilkan informasi transaksi, item, pembayaran, dan pengiriman.
4. Halaman detail memiliki loading, error, dan not found state.
5. Member tidak bisa melihat transaksi milik member lain.
6. Tombol kembali ke daftar transaksi tersedia.
7. Format harga dan tanggal konsisten dengan halaman lain.
8. Halaman daftar transaksi tetap berjalan normal setelah perubahan.

## Out of Scope
1. Edit transaksi dari halaman detail.
2. Cancel transaksi.
3. Pembayaran ulang.
4. Tracking real-time pengiriman.
5. Cetak invoice atau download PDF.
6. Perubahan besar struktur transaksi backend.

## Skenario Test High Level
1. Klik transaksi dari daftar membuka halaman detail yang sesuai.
2. Membuka halaman detail langsung dari URL dengan transaksi valid.
3. Membuka halaman detail dengan identifier tidak valid.
4. Member mencoba membuka transaksi milik member lain.
5. Detail menampilkan item dan total pembayaran dengan benar.
6. Detail menampilkan alamat dan informasi pengiriman jika tersedia.
7. Loading dan error state tampil saat API lambat atau gagal.
8. Tombol kembali mengarahkan ke daftar transaksi.

## Definition of Done
1. Route detail transaksi frontend tersedia.
2. Daftar transaksi bisa mengarahkan ke halaman detail.
3. Halaman detail transaksi mengambil data dari backend dan menampilkannya.
4. Backend detail transaksi aman untuk transaksi milik member login.
5. Skenario test high level sudah dicek.
