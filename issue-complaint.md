# Issue: Complaint Pesanan Kurir di Marketplace

## Ringkasan

Saat ini konsumen dapat mengirim complaint dalam waktu satu jam setelah kurir menandai pesanan telah diterima. Complaint tersebut diteruskan ke WhatsApp toko, tetapi transaksi marketplace masih terlihat sebagai proses kurir/selesai dan tidak mempunyai status operasional yang menandakan bahwa toko harus menindaklanjutinya.

Implementasi berikut membuat complaint menjadi status transaksi yang dapat dilihat dan ditangani oleh toko melalui Marketplace Dashboard.

## Struktur repository

| Repository | Peran | Termasuk scope |
| --- | --- | --- |
| `core.loyalty.system` | Backend loyalty dan proxy ke Marketplace Core | Ya |
| `client.loyalty.system` | Frontend customer loyalty | Tidak |
| `cms.loyalty.system` | Frontend manajemen loyalty | Tidak |
| `backend-mediacartz` | Backend marketplace / `MARKETPLACE_CORE` | Ya |
| `frontend-mediacartz-react` | Frontend marketplace untuk `backend-mediacartz` | Ya |

Tidak ada perubahan UI yang diperlukan pada `client.loyalty.system`: tombol/form complaint sudah mengirim request ke Core Loyalty. Tidak ada perubahan pada CMS Loyalty dalam issue ini.

## Tujuan

1. Saat konsumen membuat complaint, status utama transaksi berubah menjadi `complaint`.
2. Toko dapat mengenali complaint pada daftar transaksi retail.
3. Pada `/dashboard/retail/transaksi`, transaksi berstatus `complaint` mempunyai aksi **Complaint Terima**, **Selesaikan Transaksi**, dan **Batalkan Transaksi**.
4. Setiap aksi toko mengubah status transaksi sesuai aturan bisnis dan tercatat dalam audit/history.
5. Perubahan ke status `completed` atau `rejected` menjalankan notifikasi dan dampak bisnis existing, termasuk pemberian/pembatalan point, refund bila memang dipicu oleh alur reject, serta proses terkait lainnya.

## Kondisi saat ini

Alur yang sudah ada:

1. Client Loyalty memanggil `PUT /member/transaction/complain` di Core Loyalty.
2. Core Loyalty memvalidasi kepemilikan transaksi berdasarkan email member, lalu meneruskan request ke `PUT /transaction/number/:transaction_number/complain` di Marketplace Core.
3. Marketplace Core menjalankan `TransactionService.markRetailCourierComplain`.
4. Implementasi saat ini hanya mengisi `customer_receive_confirmation_status = complained`, waktu complaint, dan catatan complaint. Nilai `transaction_approve_status` tetap `courier_process`; akibatnya daftar operasional tidak mempunyai status complaint yang jelas.

File yang sudah terkait dengan alur tersebut:

- `core.loyalty.system/start/routes/member.js`
- `core.loyalty.system/app/Controllers/Http/TransactionController.js`
- `backend-mediacartz/start/routes/client.js`
- `backend-mediacartz/app/Controllers/Http/TransactionController.js`
- `backend-mediacartz/app/Services/TransactionService.js`
- `frontend-mediacartz-react/src/dashboard/pages/Retail/Transaksi.js`
- `frontend-mediacartz-react/src/dashboard/pages/Retail/modal/modal.detailTransaksi.js`

## Keputusan desain

### Status utama transaksi

Tambahkan nilai approval status baru: `complaint`.

- Identifier yang direkomendasikan: `11` (setelah status yang sudah ada sampai `scheduled = 10`).
- Saat complaint dibuat, isi `transaction_approve_status = 11`.
- Tetap simpan `customer_receive_confirmation_status = complained` sebagai jejak proses konfirmasi penerimaan oleh pelanggan.
- Jangan masukkan transaksi `complaint` ke proses auto-complete pengiriman.

### Aksi complaint oleh toko dan transisi status

Ketika complaint baru dibuat, status utama transaksi adalah `complaint`. Dashboard hanya menampilkan tiga aksi berikut selama status masih `complaint`.

| Aksi dashboard | Status transaksi sesudah aksi | Maksud |
| --- | --- | --- |
| **Complaint Terima** | `preparing_items` | Toko menerima complaint dan akan menyiapkan tindak lanjut pesanan. |
| **Selesaikan Transaksi** | `completed` | Toko menyatakan transaksi selesai. |
| **Batalkan Transaksi** | `rejected` | Toko membatalkan transaksi complaint. |

Simpan audit keputusan complaint agar riwayat tetap dapat ditelusuri, minimal catatan tindakan, catatan toko, waktu, dan pengguna dashboard yang melakukan aksi. Kolom yang direkomendasikan pada tabel `transaction`:

| Field | Kegunaan |
| --- | --- |
| `complaint_action` | `accepted`, `completed`, atau `cancelled` sebagai riwayat keputusan terakhir |
| `complaint_resolution_note` | Catatan toko ketika menjalankan aksi |
| `complaint_resolved_datetime` | Waktu tindakan dilakukan |
| `complaint_resolved_by_user_id` | Pengguna dashboard pelaksana tindakan |

Status `completed` dan `rejected` **wajib** diproses melalui service/handler transaksi existing, bukan sekadar update kolom status. Hal ini agar seluruh side effect existing tetap berjalan: notifikasi, pemberian atau penyesuaian point, refund bila berlaku, stok, riwayat transaksi, dan proses pembayaran terkait.

## Rencana perubahan per repository

### 1. `core.loyalty.system`

Peran Core Loyalty tetap sebagai proxy dan penjaga otorisasi member.

#### File yang dimodifikasi

| File | Perubahan |
| --- | --- |
| `app/Controllers/Http/TransactionController.js` | Pastikan method `complain` meneruskan `complain_note`, menangani respons status `complaint`, dan mengembalikan error Marketplace dalam format API Core yang konsisten. Jangan mengubah status lokal karena Core bukan pemilik data transaksi marketplace. |
| `start/routes/member.js` | Route existing `PUT /member/transaction/complain` tetap digunakan. Tambahkan validator hanya bila validasi catatan complaint belum tersedia. |
| `API_DOCUMENT.md` | Dokumentasikan respons complaint yang kini berisi status `complaint` dan data resolusi complaint. |

#### File opsional yang dibuat

| File | Kapan diperlukan |
| --- | --- |
| `app/Validators/MemberTransactionComplain.js` | Buat jika belum ada validator request khusus. Minimal validasi `transaction_number` dan batas panjang `complain_note`. |

#### Aturan otorisasi

- Member hanya boleh membuat complaint untuk transaksi yang dimilikinya; pertahankan validasi `ProductReviewEligibility.findMemberTransaction`.
- Core hanya meneruskan complaint dalam jendela satu jam yang diputuskan Marketplace Core.
- Core tidak boleh menyediakan endpoint keputusan toko; keputusan tersebut adalah wewenang Marketplace Dashboard/Marketplace Core.

### 2. `backend-mediacartz`

Marketplace Core adalah pemilik status transaksi, data complaint, serta audit keputusan toko.

#### Migration dan model

| File | Perubahan |
| --- | --- |
| **Buat** migration baru di `database/migrations/` | Tambahkan kolom audit tindakan complaint pada tabel `transaction`: `complaint_action`, `complaint_resolution_note`, `complaint_resolved_datetime`, dan `complaint_resolved_by_user_id`. Beri index yang diperlukan untuk daftar/filter complaint. Jangan mengubah migration lama. |
| `app/Models/Transaction.js` | Pastikan kolom baru dapat dibaca/disimpan sesuai pola model yang sudah ada. |
| `app/Helpers/Utility.js` | Tambahkan `{ status_id: 11, status_name: 'complaint' }` pada `getApprovalStatus`. Periksa seluruh pemakaian daftar status agar status baru tidak dianggap tidak valid. |

#### Membuat complaint

| File | Perubahan |
| --- | --- |
| `app/Services/TransactionService.js` | Ubah `markRetailCourierComplain` agar: memvalidasi transaksi memang telah delivered dan masih dalam jendela complaint; mengubah `transaction_approve_status` ke `complaint`; menetapkan `customer_receive_confirmation_status = complained`; menyimpan catatan complaint; serta menulis riwayat status transaksi/audit dengan helper yang sudah digunakan aplikasi. Operasi harus idempotent: complaint berulang tidak membuat riwayat atau notifikasi ganda. |
| `app/Controllers/Http/TransactionController.js` | Method `putCustomerComplain` mengembalikan transaksi terbaru termasuk status complaint dan metadata resolusi. |
| `start/routes/client.js` | Pertahankan route existing `PUT /transaction/number/:transaction_number/complain`. Pastikan middleware pencarian transaksi dan otorisasi yang berlaku tidak dapat dilewati. |

#### Aksi toko: Complaint Terima, Selesaikan Transaksi, dan Batalkan Transaksi

Tambahkan endpoint dashboard marketplace, mengikuti pola route dan middleware admin/retail yang sudah dipakai untuk aksi transaksi lain.

Rekomendasi endpoint:

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| `PUT` | `/transaction/:transaction_id/complaint/accept` | Menerima complaint dan mengubah status ke `preparing_items` |
| `PUT` | `/transaction/:transaction_id/complaint/complete` | Menyelesaikan transaksi complaint ke `completed` |
| `PUT` | `/transaction/:transaction_id/complaint/cancel` | Membatalkan transaksi complaint ke `rejected` |

Ketiga endpoint harus:

1. Memastikan pengguna dashboard memiliki akses ke toko pemilik transaksi.
2. Menerima `complaint_resolution_note`; catatan sangat dianjurkan untuk semua aksi dan wajib untuk pembatalan bila kebijakan produk menetapkannya.
3. Hanya mengizinkan status utama `complaint`.
4. Mengisi metadata tindakan complaint dan menulis audit/history.
5. Menolak request kedua setelah status tidak lagi `complaint` dengan respons konflik yang jelas.
6. Untuk **Complaint Terima**, gunakan mekanisme transisi yang sah ke `preparing_items`.
7. Untuk **Selesaikan Transaksi**, gunakan method/service existing yang menyelesaikan transaksi agar notifikasi, pemberian point, receipt, settlement, dan side effect `completed` tetap berjalan.
8. Untuk **Batalkan Transaksi**, gunakan method/service existing yang menolak transaksi agar notifikasi, refund, penyesuaian point, stok, dan side effect `rejected` tetap berjalan sesuai aturan existing.

File yang kemungkinan dimodifikasi/dibuat:

| File | Perubahan |
| --- | --- |
| `app/Controllers/Http/TransactionController.js` | Tambahkan handler keputusan complaint atau gunakan controller khusus bila pola project lebih sesuai. |
| `app/Services/TransactionService.js` | Buat method terpusat seperti `resolveRetailCourierComplaint` agar validasi status, locking, audit, dan transisi action konsisten. Method ini harus mendelegasikan alur `completed` dan `rejected` ke service existing, bukan menulis status langsung. |
| `start/routes/` (file route dashboard transaksi yang relevan) | Daftarkan endpoint accept/reject beserta middleware auth dan pembatasan akses toko. Jangan letakkan endpoint dashboard pada `start/routes/client.js`. |
| `app/Validators/` | Buat validator request resolusi complaint bila project menggunakan validator untuk route admin. |
| `app/Middleware/` | Gunakan middleware scope toko existing; buat baru hanya bila middleware existing tidak dapat membatasi transaksi ke toko pengguna. |

#### Daftar dan detail transaksi

Pastikan endpoint list/detail yang dipakai dashboard menyertakan:

- `transaction_approve_status_name = complaint`;
- `customer_receive_confirmation_status`;
- seluruh field resolusi complaint;
- catatan complaint pelanggan dan waktu complaint.

Tambahkan filter status `complaint` jika filter approval status dashboard menggunakan whitelist atau enum statis.

### 3. `frontend-mediacartz-react`

#### File yang dimodifikasi

| File | Perubahan |
| --- | --- |
| `src/dashboard/pages/Retail/Transaksi.js` | Tampilkan label/badge `Complaint` di daftar transaksi. Pada kolom aksi, tampilkan tombol **Complaint Terima**, **Selesaikan Transaksi**, dan **Batalkan Transaksi** hanya untuk transaksi berstatus `complaint`. Setelah aksi sukses, refresh data tabel. |
| `src/dashboard/pages/Retail/modal/modal.detailTransaksi.js` | Tampilkan panel complaint berisi catatan konsumen, waktu complaint, status resolusi, catatan toko, dan pengguna/waktu pengambil keputusan bila tersedia. |
| File service/API request dashboard yang dipakai halaman transaksi | Tambahkan method untuk endpoint accept, complete, dan cancel complaint, mengikuti konfigurasi base URL dan token dashboard yang sudah ada. |
| Komponen status/utility dashboard bila ada | Tambahkan mapping warna dan label `complaint`, serta gunakan label status transaksi terbaru setelah action berhasil. |

#### Perilaku UI

1. Klik **Complaint Terima** meminta konfirmasi dan catatan toko, kemudian memanggil endpoint accept dan menampilkan status `preparing_items` setelah berhasil.
2. Klik **Selesaikan Transaksi** meminta konfirmasi, kemudian memanggil endpoint complete dan menampilkan status `completed` setelah berhasil.
3. Klik **Batalkan Transaksi** meminta konfirmasi dan catatan alasan toko, kemudian memanggil endpoint cancel dan menampilkan status `rejected` setelah berhasil.
4. Selama request berjalan, seluruh tombol aksi pada transaksi tersebut dinonaktifkan untuk mencegah tindakan ganda.
5. Sesudah berhasil, modal/tabel menampilkan status terbaru dan tidak lagi menampilkan aksi complaint.
6. Jika backend menolak aksi karena sudah diproses pengguna lain, tampilkan pesan lalu refresh transaksi.

## Data dan alur target

```text
Konsumen complaint
  -> Client Loyalty: PUT /member/transaction/complain
  -> Core Loyalty: validasi kepemilikan + proxy
  -> Marketplace Core: status transaksi = complaint, audit tercatat
  -> Marketplace Dashboard: tampilkan Complaint + tiga aksi penanganan
  -> Complaint Terima: status = preparing_items
  -> Selesaikan Transaksi: status = completed + side effect existing
  -> Batalkan Transaksi: status = rejected + side effect existing
```

## Skenario yang harus diuji

Pengimplementasi cukup menyiapkan pengujian sesuai pola repository masing-masing. Minimal verifikasi skenario berikut:

1. Konsumen dapat membuat complaint untuk transaksi kurir yang sudah delivered dan masih berada dalam jendela satu jam.
2. Complaint di luar jendela waktu, transaksi bukan milik member, transaksi belum delivered, dan transaksi yang sudah final ditolak dengan pesan yang tepat.
3. Complaint berhasil mengubah status utama transaksi menjadi `complaint`, mengisi metadata complaint, dan membuat audit/history satu kali.
4. Request complaint ulang tidak menduplikasi history atau mengubah keputusan complaint yang sudah ada.
5. Transaksi `complaint` tidak di-auto-complete oleh worker pengiriman.
6. Pengguna dashboard toko yang berhak melihat transaksi complaint dan dapat menjalankan tiga aksi complaint.
7. Pengguna dari toko lain tidak dapat melihat atau memutuskan complaint tersebut.
8. Complaint Terima mengubah status menjadi `preparing_items` dan menyimpan audit/catatan/pengguna/waktu.
9. Selesaikan Transaksi menjalankan alur `completed` existing, termasuk notifikasi dan pemberian point/side effect terkait yang memang berlaku.
10. Batalkan Transaksi menjalankan alur `rejected` existing, termasuk notifikasi, refund, penyesuaian point, stok, dan side effect terkait yang memang berlaku.
11. Aksi kedua setelah transaksi tidak lagi `complaint` ditolak.
12. Daftar dan detail `/dashboard/retail/transaksi` menampilkan status terbaru dengan benar setelah refresh.

## Kriteria selesai

- Complaint customer terlihat sebagai status `complaint` pada transaksi Marketplace.
- Toko dapat menjalankan Complaint Terima, Selesaikan Transaksi, atau Batalkan Transaksi dari dashboard retail saat status masih `complaint`.
- Tindakan dapat ditelusuri melalui data transaksi/audit.
- Scope toko dan kepemilikan member tetap terproteksi di backend.
- Complaint tidak lagi tersamarkan sebagai `courier_process` dan tidak otomatis diselesaikan oleh worker delivery.
- Transisi ke `completed` dan `rejected` menjalankan notifikasi serta side effect bisnis existing.
