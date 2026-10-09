# Issue: Voucher V2 — pemisahan voucher offline dan marketplace

## Status

- Jenis: perencanaan lintas aplikasi
- Prioritas: tinggi
- Target implementasi: junior programmer atau AI model berbiaya lebih rendah
- Referensi UI:
  - `docs/img/voucher.png`
  - `docs/img/voucher-2.png`
- Repository utama: `core.loyalty.system`

## Ringkasan

Voucher loyalty saat ini belum mempunyai penanda kanal penggunaan yang tegas. Voucher yang ditukar dengan poin dapat muncul di daftar voucher pengguna, ditampilkan sebagai QR untuk outlet, dan juga ditawarkan saat checkout marketplace. Akibatnya voucher offline dan voucher marketplace mudah tercampur dan aturan penggunaan hanya bergantung pada perilaku frontend.

Voucher V2 membagi voucher menjadi tepat dua kategori:

1. `offline`: dibeli menggunakan poin, dimiliki oleh member, lalu ditukar di toko/outlet dengan menunjukkan QR code kepada petugas;
2. `marketplace`: dibeli menggunakan poin, dimiliki oleh member, lalu hanya dapat digunakan sebagai potongan saat checkout marketplace di aplikasi.

Pemisahan ini wajib ditegakkan oleh backend. Menyembunyikan tombol di frontend saja tidak cukup.

## Struktur repository dan scope

| Folder | Peran | Dalam scope |
|---|---|---|
| `core.loyalty.system` | Backend loyalty dan proxy ke Marketplace Core | Ya |
| `client.loyalty.system` | Frontend loyalty customer | Ya |
| `cms.loyalty.system` | Frontend management loyalty | Ya |
| `backend-mediacartz` | Backend marketplace / `MARKETPLACE_CORE` | Ya |
| `frontend-mediacartz-react` | Frontend marketplace langsung untuk `backend-mediacartz` | Tidak |

Nama folder frontend marketplace aktual di workspace adalah `frontend-mediacartz-react`. Folder tersebut tidak perlu diubah pada issue ini karena checkout loyalty dilakukan dari `client.loyalty.system` melalui proxy.

## Latar belakang dan masalah saat ini

1. Tabel `vouchers` belum mempunyai kategori kanal penggunaan.
2. Field `type` yang sudah ada mempunyai arti jenis benefit, misalnya `amount`, `free`, atau `free_delivery`. Field tersebut tidak boleh dipakai untuk membedakan offline dan marketplace.
3. Endpoint `MemberController.vouchers()` saat ini mengembalikan seluruh voucher aktif tanpa filter kategori.
4. Endpoint pembelian voucher masih memakai istilah `redeem`, `request_redeem`, dan `verify_redeem`, padahal hasil akhirnya adalah member membeli/mengambil voucher menggunakan poin. Istilah ini mudah tertukar dengan penggunaan voucher offline di outlet.
5. Halaman `/voucher` saat ini menampilkan satu daftar campuran dan menjalankan alur OTP untuk mengambil voucher.
6. Halaman `/redeem` menampilkan seluruh voucher aktif milik member dan menyediakan tombol QR untuk semuanya.
7. Halaman `/order` mengambil seluruh voucher milik member lalu memfilter berdasarkan company/SKU, tetapi belum memfilter kategori marketplace.
8. QR code pada `/redeem` saat ini dibentuk di browser menggunakan `CryptoJS` dan `partner.server_id`. Secret yang tersedia pada frontend bukan secret yang aman. Voucher V2 tidak boleh menambah ketergantungan pada pola ini.
9. `backend-mediacartz` menerima voucher loyalty melalui `VoucherService`, tetapi belum mengenal kategori voucher. Tanpa validasi server-to-server, voucher offline tetap berpotensi dipakai pada transaksi marketplace melalui request yang dimanipulasi.
10. Data voucher pada `member_vouchers` sudah memiliki beberapa snapshot benefit. Kategori juga perlu dipertimbangkan sebagai snapshot supaya perubahan kategori voucher master tidak mengubah hak voucher yang sudah dibeli secara diam-diam.

## Tujuan

1. Setiap voucher baru mempunyai kategori `offline` atau `marketplace`.
2. CMS dapat memilih, melihat, mencari, dan mengubah kategori voucher.
3. `/voucher` menampilkan poin member dan memisahkan katalog berdasarkan tab **Marketplace** dan **Toko**.
4. Member dapat membeli voucher dengan poin melalui alur yang jelas, aman, dan idempotent.
5. Setelah pembelian berhasil, frontend menampilkan ucapan berhasil dan tombol menuju `/redeem`.
6. `/redeem` menampilkan voucher yang dimiliki member dengan tampilan serupa `/voucher`, tetapi aksi mengikuti kategori.
7. Hanya voucher offline yang mempunyai aksi **Tukar** dan QR code.
8. Voucher marketplace hanya dapat dipilih dan digunakan pada `/order`.
9. Backend loyalty dan Marketplace Core menolak penggunaan voucher pada kanal yang salah.
10. Data legacy dengan kategori `null` dapat dimigrasikan secara aman tanpa salah mengklasifikasikan voucher.

## Bukan tujuan

- Menambah kategori ketiga seperti `both`, `online_offline`, atau `all`.
- Membuat satu voucher dapat digunakan sekaligus di outlet dan marketplace.
- Mengubah rumus benefit voucher (`amount`, persentase, fixed amount, free item, atau free delivery), kecuali penyesuaian yang diperlukan agar kategori marketplace tetap bekerja.
- Mendesain ulang frontend marketplace `frontend-mediacartz-react`.
- Mengganti seluruh sistem OTP member di luar alur voucher.
- Mengubah aturan partner/company/SKU yang sudah berlaku pada voucher marketplace.

## Keputusan desain wajib

### 1. Nilai kategori canonical

Gunakan nilai database dan API berikut:

```text
offline
marketplace
```

Kata `offine` pada requirement awal dianggap salah ketik. Jangan menyimpan `offine` karena akan menjadi kontrak data yang sulit diperbaiki. Label UI bahasa Indonesia:

- `offline` → **Toko** atau **Voucher Toko**;
- `marketplace` → **Marketplace** atau **Voucher Marketplace**.

### 2. `category` berbeda dari `type`

Contoh data:

```json
{
  "name": "Gratis Ongkir Rp20.000",
  "category": "marketplace",
  "type": "free_delivery",
  "number_point": 200
}
```

- `category` menjawab: voucher dipakai di kanal mana?
- `type` dan field discount menjawab: benefit voucher berupa apa dan bagaimana menghitungnya?

Jangan mengganti, menimpa, atau menghapus `type` ketika menambahkan `category`.

### 3. `null` hanya untuk transisi data legacy

Kolom `vouchers.category` boleh `NULL` agar migrasi aman terhadap data yang sudah ada. Namun `NULL` bukan kategori ketiga dan tidak boleh dipilih saat membuat voucher baru.

Aturan rollout:

- voucher baru wajib mempunyai category;
- voucher master dengan category `NULL` diberi label **Belum dikategorikan** di CMS;
- voucher master `NULL` tidak ditawarkan untuk pembelian baru di `/voucher`;
- admin/partner harus mengklasifikasikan voucher legacy sebelum mengaktifkan atau menawarkan kembali voucher tersebut;
- member voucher legacy yang sudah dimiliki tidak boleh langsung hilang. Buat audit/backfill dan kebijakan transisi eksplisit sebelum enforcement penuh;
- jangan menebak kategori hanya dari `type`, SKU, nama voucher, atau keberadaan redeem merchant.

### 4. Snapshot kategori pada saat pembelian

Tambahkan `member_vouchers.voucher_category` nullable sebagai snapshot yang diisi saat pembelian berhasil. Sumber kategori penggunaan voucher milik member adalah:

1. `member_vouchers.voucher_category` bila tersedia;
2. `vouchers.category` hanya sebagai fallback sementara untuk record legacy.

Setelah rollout selesai, seluruh member voucher baru harus selalu mempunyai snapshot. Mengubah kategori voucher master tidak boleh mengubah kategori voucher yang sudah dibeli.

### 5. Pisahkan pembelian dari penggunaan voucher

Gunakan istilah domain berikut secara konsisten:

- **beli/ambil voucher**: member menukar poin menjadi `member_vouchers`;
- **gunakan voucher marketplace**: member memilih voucher pada `/order`, lalu voucher di-reserve/exchange mengikuti lifecycle checkout;
- **tukar voucher offline**: member menunjukkan QR di outlet dan petugas menyelesaikan redemption.

Endpoint lama boleh dipertahankan sementara untuk kompatibilitas, tetapi service dan dokumentasi baru harus memakai istilah yang tidak ambigu.

### 6. Kategori ditegakkan di backend

Aturan minimum:

- endpoint pembelian menerima voucher `offline` dan `marketplace`, tetapi menolak category `NULL`/tidak dikenal;
- endpoint QR/redemption offline hanya menerima member voucher kategori `offline`;
- endpoint daftar voucher checkout hanya mengembalikan kategori `marketplace`;
- validasi checkout di `core.loyalty.system` hanya menerima kategori `marketplace`;
- `backend-mediacartz` kembali memvalidasi bahwa snapshot loyalty voucher berkategori `marketplace` sebelum menghitung diskon atau membuat transaksi;
- request yang dimanipulasi tidak boleh dapat memakai voucher offline pada checkout.

### 7. Satu member voucher hanya boleh dipakai sekali

Pertahankan lifecycle reserve/exchange/return yang sudah ada untuk voucher marketplace. Untuk offline, QR hanya merepresentasikan satu `member_voucher_id` dan harus ditukar secara atomik agar scan/request ganda tidak membuat penggunaan ganda.

## Alur pengguna yang dituju

### A. Melihat katalog voucher di `/voucher`

1. Member membuka `/voucher`.
2. Header menampilkan teks singkat, judul **Voucher**, dan saldo poin terkini seperti `533 poin` sesuai `docs/img/voucher.png`.
3. Di bawah header terdapat dua tab: **Marketplace** dan **Toko**.
4. Tab aktif disimpan pada query string opsional, misalnya `/voucher?category=marketplace`, agar refresh/back mempertahankan kategori.
5. Deskripsi tab:
   - Marketplace: “Dipakai saat checkout online. Tidak dapat ditukar di outlet.”
   - Toko: “Ditukar dengan QR di outlet. Tidak dapat dipakai saat checkout online.”
6. Daftar hanya memuat voucher aktif pada kategori terpilih.
7. Setiap kartu menampilkan gambar, nama, partner, benefit/ringkasan syarat, masa berlaku setelah pembelian, dan harga poin.
8. Tombol aksi memakai label yang konsisten, rekomendasi **Beli** atau **Ambil**. Jangan memakai **Tukar** pada katalog karena istilah Tukar dikhususkan untuk menggunakan voucher offline yang sudah dimiliki.
9. Tombol nonaktif bila poin tidak cukup dan menampilkan kekurangan poin dengan bahasa yang jelas.
10. Loading, empty state, error, pagination/infinite load, dan retry harus tersedia tanpa layout bergeser berlebihan.

### B. Membeli voucher menggunakan poin

1. Member memilih voucher pada `/voucher`.
2. Tampilkan ringkasan voucher dan jumlah poin yang akan digunakan.
3. Bila OTP tetap diwajibkan oleh aturan bisnis, tampilkan modal OTP mengikuti gaya `docs/img/voucher-2.png`.
4. `voucher-2.png` adalah ilustrasi modal OTP, bukan ilustrasi QR code. Implementer tidak boleh menganggap modal tersebut sebagai layar QR.
5. Backend menahan poin ketika OTP dikirim, memverifikasi OTP, lalu dalam transaksi database membuat `member_vouchers`, menyimpan snapshot, dan mengurangi/finalisasi poin tepat satu kali.
6. Request ulang, double-click, refresh, atau callback OTP yang sama tidak boleh membeli voucher dua kali.
7. Bila OTP kedaluwarsa/dibatalkan, poin yang ditahan dilepas sesuai lifecycle yang sudah ada.
8. Setelah berhasil, tutup modal OTP dan tampilkan success dialog:
   - judul: **Selamat, voucher berhasil dibeli**;
   - nama voucher dan masa berlaku;
   - tombol utama **Lihat Voucher Saya** menuju `/redeem`;
   - tombol sekunder **Lanjut pilih voucher** kembali ke tab saat ini.
9. Saldo poin pada header langsung diperbarui dari response server, bukan dikurangi secara asumsi lokal saja.

### C. Melihat voucher milik member di `/redeem`

1. Layout mengikuti pola `/voucher`: header, saldo poin, tab Marketplace/Toko, kartu sederhana, dan empty state per kategori.
2. Isi berasal dari `member_vouchers` yang belum digunakan dan belum kedaluwarsa.
3. Kartu menampilkan snapshot benefit dan category, bukan hanya nilai master voucher yang mungkin sudah berubah.
4. Voucher offline menampilkan tombol **Tukar**.
5. Menekan **Tukar** membuka QR code dan instruksi “Tunjukkan QR ini kepada petugas toko.”
6. Voucher marketplace tidak mempunyai tombol Tukar/QR. Tampilkan informasi “Voucher ini digunakan saat checkout di aplikasi.” dan tombol opsional **Belanja sekarang** menuju katalog produk.
7. Voucher expired/used tidak masuk daftar aktif. Bila riwayat diperlukan, sediakan section/tab terpisah tanpa mencampurnya dengan voucher aktif.

### D. Menggunakan voucher marketplace di `/order`

1. Saat modal **Pilih Voucher** dibuka, frontend meminta voucher aktif milik member dengan filter `category=marketplace`.
2. Backend hanya mengembalikan voucher marketplace yang:
   - belum digunakan;
   - belum kedaluwarsa;
   - tidak sedang di-reserve oleh transaksi lain;
   - cocok dengan company/partner/SKU/item cart;
   - memenuhi syarat benefit/minimum transaksi yang berlaku.
3. Voucher offline tidak boleh muncul walaupun frontend lupa mengirim filter.
4. Kartu voucher yang tidak memenuhi syarat boleh disembunyikan atau ditampilkan disabled dengan alasan. Pilih satu perilaku dan gunakan secara konsisten.
5. Quote dan commit kembali memvalidasi kategori serta eligibility. Jangan mempercayai `member_voucher_id` atau kode terenkripsi dari client.
6. Setelah transaksi sukses, lifecycle voucher marketplace tetap exchange/used. Jika transaksi gagal atau dibatalkan sesuai aturan yang sudah ada, reservation dikembalikan dengan idempotent.

### E. Menukar voucher offline di outlet

1. Frontend meminta QR token dari backend untuk `member_voucher_id` kategori offline.
2. Backend memastikan voucher dimiliki member login, belum digunakan, belum kedaluwarsa, dan berkategori offline.
3. QR berisi token opaque/signed yang mempunyai masa berlaku singkat; jangan memasukkan secret atau data sensitif ke frontend.
4. Petugas/outlet memindai QR melalui alur merchant yang sudah ada.
5. Backend memvalidasi token, partner/redeem merchant, category, status member voucher, dan expiry.
6. Penandaan `used` serta pembuatan `voucher_exchanges` dilakukan dalam satu transaksi database dengan locking/idempotency.
7. QR yang sama setelah sukses harus ditolak sebagai sudah digunakan, bukan membuat exchange kedua.

## Perubahan database `core.loyalty.system`

Jangan mengubah migration lama yang sudah pernah dijalankan. Buat migration baru.

### `vouchers.category`

Tambahkan kolom nullable:

```text
category ENUM('offline', 'marketplace') NULL
```

Ketentuan:

- tambahkan index pada `category` bila query katalog/filter admin sering memakai `status + category`;
- jangan memberikan default diam-diam;
- `down()` hanya menghapus index/kolom yang dibuat migration ini;
- bila database/environment tidak aman mengubah enum, boleh gunakan string terbatas oleh validator aplikasi, tetapi kontrak nilainya tetap dua nilai di atas.

### `member_vouchers.voucher_category`

Tambahkan snapshot nullable:

```text
voucher_category ENUM('offline', 'marketplace') NULL
```

Ketentuan:

- diisi dari `vouchers.category` dalam transaksi pembelian;
- tidak diubah ketika voucher master diedit;
- sertakan dalam payload snapshot/API;
- pertimbangkan index gabungan untuk query aktif member, misalnya `member_id`, `voucher_category`, `used`, dan `expire_date`, setelah memeriksa index yang sudah ada.

### Backfill data legacy

Sebelum enforcement:

1. Buat laporan voucher master category `NULL` dan jumlah member voucher terkait.
2. Admin bisnis menentukan category setiap voucher; jangan melakukan klasifikasi otomatis berdasarkan nama.
3. Setelah master dikategorikan, backfill `member_vouchers.voucher_category` dari voucher master hanya untuk record snapshot yang masih `NULL` dan sudah disetujui hasil audit.
4. Catat jumlah record sebelum/sesudah serta record yang gagal dipetakan.
5. Jangan menghapus member voucher atau poin member karena category belum tersedia.

Script backfill boleh berupa Ace command/service terpisah agar dapat dijalankan bertahap dan dry-run. Jangan menaruh perubahan data besar langsung dalam migration schema tanpa visibilitas.

## Kontrak API yang disarankan

URL dapat disesuaikan dengan konvensi project, tetapi perilakunya wajib konsisten.

### `GET /api/v1/member/vouchers`

Query:

```text
category=offline|marketplace
page=1
rows=10
```

Response target:

```json
{
  "status": true,
  "data": {
    "member_point": 533,
    "category": "marketplace",
    "vouchers": {
      "data": [
        {
          "voucher_id": 10,
          "name": "Gratis Ongkir s.d. Rp20.000",
          "category": "marketplace",
          "type": "free_delivery",
          "number_point": 200,
          "duration": 30,
          "can_purchase": true,
          "purchase_block_reason": null
        }
      ],
      "page": 1,
      "lastPage": 1,
      "total": 1
    }
  }
}
```

Backend harus mengambil member dari sesi auth. Jangan menerima `member_id` dari client untuk katalog personal.

### Pembelian voucher

Disarankan menyediakan nama endpoint canonical:

```text
POST /api/v1/member/vouchers/purchase/request
POST /api/v1/member/vouchers/purchase/verify
```

Endpoint lama `/member/redeem/request` dan `/member/redeem/verify` dapat diarahkan ke service yang sama selama masa kompatibilitas.

Request tahap awal:

```json
{
  "voucher_id": 10,
  "client_request_id": "uuid-dari-client"
}
```

Response verifikasi sukses minimal mengembalikan:

```json
{
  "status": true,
  "message": "Voucher berhasil dibeli",
  "data": {
    "member_voucher_id": 123,
    "voucher_category": "marketplace",
    "expire_date": "2026-11-08 10:00:00",
    "member_point": 333
  }
}
```

Validasi server:

- voucher aktif dan category valid;
- poin cukup pada saat request dan finalisasi;
- voucher masih tersedia menurut aturan bisnis;
- OTP milik member/request yang benar dan belum dipakai;
- satu `client_request_id`/confirmation hanya menghasilkan satu member voucher;
- debit/finalisasi poin, snapshot, dan pembuatan member voucher bersifat atomik.

### `GET /api/v1/member/redeem/voucher`

Tambahkan query `category`. Backend wajib memfilter, bukan sekadar meneruskan semua data lalu menyerahkan filter ke frontend.

Response setiap record harus memuat `voucher_category` hasil snapshot, status lifecycle, `used`, `expire_date`, benefit snapshot, dan informasi tampilan voucher/partner yang aman.

### QR voucher offline

Disarankan:

```text
POST /api/v1/member/vouchers/{member_voucher_id}/offline-qr
```

Response:

```json
{
  "status": true,
  "data": {
    "qr_token": "opaque-signed-short-lived-token",
    "expires_at": "2026-10-09 12:05:00"
  }
}
```

Token harus dibuat dan diverifikasi backend. Hentikan pembuatan kode baru berbasis `partner.server_id` di browser. Migrasi kompatibilitas untuk scanner lama harus direncanakan bila format lama masih dipakai outlet.

### Daftar voucher checkout

Endpoint milik member sebaiknya menerima konteks checkout seperti company slug dan item/SKU, lalu hanya mengembalikan category marketplace yang eligible. Bila endpoint tetap generik, `CheckoutController` wajib melakukan validasi final secara independen.

### Error contract

Gunakan kode stabil agar frontend tidak bergantung pada teks:

| Kode | HTTP | Arti/tindakan UI |
|---|---:|---|
| `VOUCHER_CATEGORY_REQUIRED` | 422 | Voucher belum dikategorikan |
| `VOUCHER_CATEGORY_INVALID` | 422 | Category bukan offline/marketplace |
| `VOUCHER_CHANNEL_MISMATCH` | 422 | Voucher dipakai pada kanal yang salah |
| `VOUCHER_NOT_AVAILABLE` | 404/422 | Voucher tidak aktif/tidak tersedia |
| `INSUFFICIENT_POINT` | 422 | Poin member tidak cukup |
| `VOUCHER_ALREADY_PURCHASED` | 409 | Request pembelian yang sama sudah selesai |
| `MEMBER_VOUCHER_USED` | 409 | Voucher milik member sudah digunakan |
| `MEMBER_VOUCHER_EXPIRED` | 422 | Voucher sudah kedaluwarsa |
| `VOUCHER_NOT_ELIGIBLE` | 422 | Tidak cocok dengan company/SKU/cart/minimum order |
| `OFFLINE_QR_INVALID` | 422 | Token QR salah/kedaluwarsa |

## Perubahan `core.loyalty.system`

### File yang perlu dimodifikasi

| File | Perubahan |
|---|---|
| `database/migrations/<timestamp>_add_category_to_vouchers_schema.js` (baru) | Tambah `vouchers.category`, index, dan rollback aman. |
| `database/migrations/<timestamp>_add_voucher_category_to_member_vouchers_schema.js` (baru) | Tambah snapshot kategori pada member voucher. |
| `app/Models/Voucher.js` | Pastikan category tersedia pada serialisasi/filter yang diperlukan. |
| `app/Models/MemberVoucher.js` | Dukungan snapshot category dan query scope/helper kategori bila bermanfaat. |
| `app/Controllers/Http/VoucherController.js` | Validasi/simpan category pada create/edit; filter list; cegah voucher aktif baru tanpa category. |
| `app/Validators/Voucher.js` | Tambah validasi category wajib dan enum untuk create/edit. Audit validator parsial saat edit. |
| `app/Controllers/Http/MemberController.js` | Filter katalog per category, sertakan point, pembelian aman, daftar voucher milik member per category, QR offline. |
| `app/Lib/VoucherRedeemConfirmation.js` | Ubah logika menjadi service pembelian yang category-aware; pertahankan hold/release point dan idempotency OTP. |
| `app/Helpers/VoucherSnapshot.js` | Tambahkan `voucher_category` ke snapshot member voucher. |
| `app/Services/MemberVoucherLifecycleService.js` | Tegakkan bahwa reserve/exchange untuk checkout hanya category marketplace; offline redemption memakai operasi terpisah. |
| `app/Controllers/Http/CheckoutController.js` | Filter dan validasi voucher marketplace saat quote/commit. |
| `app/Controllers/Http/TransactionController.js` | Pada validasi voucher loyalty, tolak category selain marketplace dan kirim category ke Marketplace Core. |
| `start/routes/member.js` | Route purchase canonical, list per category, dan pembuatan QR offline. |
| `start/routes/voucher.js` | Pastikan kontrak create/edit/list category tersedia pada route admin voucher. |
| `start/events.js` | Audit listener `redeem::member`; arahkan ke service idempotent atau deprecated setelah endpoint baru stabil. |
| `API_DOCUMENT.md` | Dokumentasikan field, endpoint, response, error code, dan lifecycle kategori. |

### File baru yang mungkin diperlukan

- `app/Services/VoucherPurchaseService.js`: pusat transaksi pembelian, OTP, point hold/finalization, dan snapshot;
- `app/Services/OfflineVoucherQrService.js`: membuat/verifikasi token QR singkat;
- `app/Validators/VoucherPurchase.js` dan validator QR bila pola project mendukung;
- Ace command backfill category dengan mode dry-run.

Nama file boleh mengikuti konvensi project. Jangan menduplikasi logic yang sudah aman di `VoucherRedeemConfirmation` atau `MemberVoucherLifecycleService`; ekstrak/refactor bila lebih kecil risikonya.

### Query dan keamanan

- Semua query member voucher harus membatasi `member_id` dari auth.
- Create/edit category hanya menerima whitelist dua nilai.
- Partner CMS hanya boleh mengubah voucher milik partner tersebut sesuai middleware yang ada.
- Jangan mengirim `partner.server_id` atau material signing ke client.
- Gunakan database transaction/locking ketika mengurangi poin dan membuat member voucher.
- Jangan mengandalkan filter request generik untuk field keamanan seperti `used`, `member_id`, atau category checkout.

## Perubahan `cms.loyalty.system`

### Form add/edit voucher

File utama: `src/pages/Voucher/VoucherForm.tsx`.

- Tambahkan field wajib **Kategori Voucher**.
- Pilihan hanya:
  - **Voucher Toko (Offline)** → `offline`;
  - **Voucher Marketplace** → `marketplace`.
- Tambahkan helper text singkat yang menjelaskan kanal penggunaan.
- Saat edit voucher legacy category `NULL`, tampilkan placeholder **Pilih kategori** dan wajibkan pilihan sebelum voucher dapat disimpan aktif.
- Sertakan category pada payload create/edit.
- Tampilkan error backend per field bila category invalid/missing.
- Jangan mengubah field `type`; category dan type tampil sebagai dua input berbeda.

### List dan detail voucher

| File | Perubahan |
|---|---|
| `src/pages/Voucher/Voucher.tsx` | Tambah kolom/badge category dan filter Semua/Toko/Marketplace/Belum dikategorikan. |
| `src/pages/Voucher/VoucherDetail.tsx` | Tampilkan category serta deskripsi kanal penggunaan. |
| `src/pages/Voucher/VoucherForm.tsx` | Tambah type/interface, state, validasi, payload, dan kontrol select category. |

Gunakan badge yang berbeda tetapi tetap memiliki teks, bukan warna saja. List harus dapat membantu admin menemukan voucher legacy `NULL` untuk proses klasifikasi.

## Perubahan `client.loyalty.system`

### Halaman `/voucher`

File utama: `src/pages/Voucher/index.jsx`.

- Refactor tampilan mengikuti `docs/img/voucher.png`, tetap menyesuaikan komponen/style project.
- Header menampilkan saldo poin dari backend/profile yang mutakhir.
- Tambahkan tab Marketplace dan Toko.
- Kirim category ke API; jangan hanya filter array hasil response di browser.
- Pertahankan category aktif saat pagination dan setelah modal ditutup.
- Kartu dibuat ringkas, mudah dipindai, dan touch target minimal layak mobile.
- Detail voucher harus menjelaskan tempat penggunaan, benefit, partner, masa berlaku, dan poin.
- Tombol beli disabled saat poin tidak cukup atau request berjalan.
- Alur OTP mengikuti ilustrasi `voucher-2.png` jika OTP tetap diwajibkan.
- Setelah sukses tampilkan modal ucapan selamat dan link `/redeem`.
- Refresh saldo poin dan katalog setelah pembelian.

Komponen opsional yang dapat diekstrak agar `/voucher` dan `/redeem` konsisten:

- `src/components/Voucher/VoucherCategoryTabs.jsx`;
- `src/components/Voucher/VoucherCard.jsx`;
- `src/components/Voucher/PointBalance.jsx`;
- `src/components/Voucher/VoucherPurchaseModal.jsx`;
- `src/components/Voucher/VoucherPurchaseSuccessModal.jsx`.

### Halaman `/redeem`

File utama: `src/pages/Redeem/index.jsx`.

- Gunakan header/card/tab yang sama dengan katalog voucher.
- Fetch berdasarkan category aktif.
- Offline: tampilkan tombol Tukar dan QR.
- Marketplace: hilangkan tombol Tukar dan QR; tampilkan instruksi hanya dapat digunakan saat checkout.
- QR token diperoleh dari backend saat modal dibuka dan diperbarui jika kedaluwarsa.
- Jangan lagi membentuk QR baru di browser dengan `CryptoJS.AES.encrypt(..., partner.server_id)`.
- Hapus QR dari state saat modal ditutup/logout agar token tidak tertinggal.
- Tampilkan expiry voucher dan expiry QR sebagai dua konsep berbeda.

### Halaman `/order`

File utama: `src/pages/Order/index.jsx`.

- `FnMyVoucher()` meminta hanya category marketplace.
- Tambahkan defense filter frontend `voucher_category === 'marketplace'`, tetapi jangan menjadikannya satu-satunya validasi.
- Modal pilih voucher menampilkan hanya voucher eligible atau alasan disabled.
- `handleSelectVoucher()` memastikan category marketplace sebelum company/SKU checks.
- Jika voucher yang dipilih menjadi tidak valid setelah cart/store berubah, hapus selection dan tampilkan alasan.
- Quote server adalah sumber nilai diskon final.

### Utilitas dan route

| File | Perubahan |
|---|---|
| `src/utils/api.js` | Tambah/ubah endpoint list category, purchase, owned vouchers, dan offline QR. |
| `src/utils/voucherDiscount.js` | Tambah helper category/snapshot dan pastikan eligibility marketplace category-aware. |
| `src/components/RootRouter/index.jsx` | Route `/voucher` dan `/redeem` sudah ada; audit saja, tidak perlu route `/vouchers` baru. |
| `src/pages/Home/index.jsx` | Badge/instruksi category pada ringkasan voucher milik member. |
| `src/pages/Profile/index.jsx` | Badge/instruksi category dan jangan tampilkan aksi offline untuk marketplace. |

Requirement menyebut `/vouchers`, tetapi route yang tersedia adalah `/voucher`. Gunakan `/voucher` sebagai route canonical. Jangan membuat route plural baru kecuali diperlukan redirect kompatibilitas.

## Perubahan `backend-mediacartz`

Marketplace Core tidak mengelola katalog voucher loyalty, tetapi melakukan validasi dan penerapan voucher saat transaksi. Tambahkan defense-in-depth.

| File | Perubahan |
|---|---|
| `app/Services/VoucherService.js` | Saat `voucher_type === "loyalty"`, wajibkan category/snapshot `marketplace`; tolak offline/null sebelum hitung diskon. |
| `app/Controllers/Http/TransactionController.js` | Teruskan/simpan category pada snapshot `member_voucher_data`; validasi hasil service sebelum transaksi dibuat. |
| `app/Services/TransactionService.js` | Audit exchange/return voucher agar category marketplace dan lifecycle idempotent. |
| `app/Services/LoyaltyService.js` | Sertakan category saat exchange/return server-to-server bila kontrak core membutuhkannya. |
| dokumentasi API internal terkait transaksi | Jelaskan field `voucher_category` dan error channel mismatch. |

Marketplace Core harus menerima category dari payload voucher tervalidasi core atau response lookup server-to-server, bukan dari nilai bebas client. Jika contract lama tidak membawa category, ubah response validasi loyalty di core terlebih dahulu.

## Perubahan kontrak server-to-server

Payload voucher loyalty yang dikirim ke Marketplace Core minimal memuat:

```json
{
  "member_voucher_id": 123,
  "voucher_category": "marketplace",
  "voucher_type": "free_delivery",
  "discount_calculation_type": "fixed_amount",
  "discount_value": 20000,
  "redeemed_point": 200,
  "voucher": {
    "voucher_id": 10,
    "name": "Gratis Ongkir s.d. Rp20.000",
    "category": "marketplace"
  }
}
```

Marketplace Core menyimpan snapshot ini pada `member_voucher_data` transaksi untuk audit. Jangan hanya menyimpan ID lalu membaca master voucher yang bisa berubah.

## State dan invariant penting

| Kondisi | Offline | Marketplace |
|---|---:|---:|
| Tampil di katalog `/voucher` | Ya, tab Toko | Ya, tab Marketplace |
| Dibeli dengan poin | Ya | Ya |
| Tampil di `/redeem` | Ya | Ya |
| Mempunyai tombol Tukar/QR | Ya | Tidak |
| Tampil pada pilihan voucher `/order` | Tidak | Ya |
| Dapat diterapkan pada checkout | Tidak | Ya |
| Dapat dipindai outlet | Ya | Tidak |

Invariant backend:

- category master wajib untuk pembelian baru;
- category snapshot wajib untuk member voucher baru;
- offline tidak pernah masuk quote/transaction marketplace;
- marketplace tidak pernah menghasilkan offline QR;
- satu member voucher tidak dapat digunakan dua kali;
- perubahan master tidak mengubah snapshot voucher yang sudah dibeli.

## Urutan implementasi yang disarankan

1. Audit data voucher dan member voucher pada staging/production; hasilkan daftar category `NULL`.
2. Finalkan nilai canonical `offline` dan `marketplace` serta kontrak snapshot.
3. Tambahkan migration category dan snapshot tanpa langsung memblokir alur legacy.
4. Ubah model, validator, admin controller, dan CMS agar voucher baru selalu berkategori.
5. Refactor service pembelian voucher agar menyimpan snapshot category dan idempotent.
6. Tambahkan filter category pada katalog/member voucher API.
7. Implementasikan UI `/voucher` dan `/redeem`, termasuk success dialog dan QR offline server-generated.
8. Batasi `/order` dan validasi checkout core hanya untuk marketplace.
9. Tambahkan validasi category di `backend-mediacartz` dan snapshot transaksi.
10. Jalankan backfill yang telah disetujui, lalu aktifkan enforcement category `NULL` secara bertahap.
11. Perbarui dokumentasi API dan hapus/deprecate jalur frontend yang membentuk QR menggunakan secret partner.

## Skenario pengujian

Detail unit/integration test diserahkan kepada implementer. Minimal cakup skenario berikut.

### CMS dan data

- admin/partner dapat membuat voucher offline dan marketplace;
- create voucher tanpa category atau category tidak dikenal ditolak;
- edit benefit tidak mengubah category tanpa input yang sah;
- list/detail menampilkan badge/filter category yang benar;
- voucher legacy `NULL` terlihat sebagai belum dikategorikan dan tidak ditawarkan untuk pembelian baru;
- partner tidak dapat mengubah voucher partner lain;
- backfill dry-run dan real run menghasilkan jumlah record yang dapat diaudit.

### Katalog dan pembelian voucher

- `/voucher` menampilkan saldo poin dan dua tab sesuai category;
- pindah tab tidak mencampur data/pagination;
- member dengan poin cukup dapat membeli voucher masing-masing category;
- poin tidak cukup menolak pembelian tanpa membuat member voucher;
- double-click/retry OTP tidak membuat voucher atau debit poin ganda;
- OTP kedaluwarsa membatalkan proses dan melepaskan hold poin;
- pembelian sukses memperbarui saldo dan menampilkan tombol menuju `/redeem`;
- category snapshot tersimpan sesuai kondisi saat pembelian.

### Voucher milik member dan offline QR

- `/redeem` memisahkan voucher offline dan marketplace;
- hanya voucher offline mempunyai tombol Tukar dan QR;
- voucher marketplace menampilkan instruksi checkout tanpa QR;
- QR hanya dapat dibuat oleh pemilik voucher yang aktif;
- QR offline yang kedaluwarsa, sudah dipakai, atau milik member lain ditolak;
- scan/request bersamaan hanya menghasilkan satu exchange;
- voucher expired/used tidak muncul pada daftar aktif.

### Checkout marketplace

- hanya voucher marketplace tampil pada modal `/order`;
- voucher offline yang dikirim manual ke quote/commit ditolak oleh core;
- voucher offline yang lolos request manipulasi tetap ditolak oleh `backend-mediacartz`;
- voucher marketplace tetap divalidasi terhadap company, SKU/item, expiry, used, dan reservation;
- transaksi sukses menandai/exchange voucher tepat satu kali;
- transaksi gagal/cancel mengembalikan reservation sesuai lifecycle;
- snapshot category tersimpan pada data transaksi dan terlihat pada audit/detail yang relevan.

### Regresi

- voucher `amount`, `free`, dan `free_delivery` tetap menghitung benefit dengan benar;
- harga, ongkir, total checkout, dan transaction detail tetap konsisten;
- dashboard/report voucher tidak rusak dan bila perlu dapat difilter category;
- Home/Profile tetap menampilkan voucher milik member tanpa membuka aksi channel yang salah;
- login/logout dan refresh tidak menampilkan saldo atau voucher member sebelumnya.

## Acceptance criteria

- [ ] `vouchers.category` hanya menerima `offline`, `marketplace`, atau `NULL` untuk legacy.
- [ ] Voucher baru tidak dapat dibuat/diaktifkan tanpa category.
- [ ] `member_vouchers.voucher_category` tersimpan sebagai snapshot pada pembelian baru.
- [ ] CMS add/edit/list/detail mendukung category dan menandai legacy `NULL`.
- [ ] `/voucher` menampilkan saldo poin, tab Marketplace/Toko, dan data sesuai kategori.
- [ ] Pembelian voucher aman terhadap double-click/retry dan menampilkan dialog sukses menuju `/redeem`.
- [ ] `/redeem` hanya menyediakan tombol Tukar/QR untuk offline.
- [ ] Voucher marketplace di `/redeem` diberi instruksi hanya digunakan saat checkout.
- [ ] `/order` hanya menampilkan dan menerima voucher marketplace yang eligible.
- [ ] Core dan Marketplace Core sama-sama menolak voucher pada kanal yang salah.
- [ ] QR offline dibuat backend dengan token aman; frontend tidak memakai `partner.server_id` sebagai secret.
- [ ] Voucher legacy ditangani melalui audit/backfill tanpa kehilangan poin atau voucher member.
- [ ] API documentation dan error contract diperbarui.

## Definition of done

1. Migration schema dapat dijalankan dan di-rollback pada staging.
2. Data legacy telah diaudit; hasil klasifikasi/backfill tercatat.
3. Backend core, CMS, dan client memakai nilai category yang sama.
4. Marketplace Core mempunyai validasi defense-in-depth untuk category marketplace.
5. Seluruh acceptance criteria lulus pada viewport mobile utama dan desktop CMS.
6. Tidak ada jalur baru yang mengirim secret/signing material ke browser.
7. Pembelian, redemption offline, dan exchange marketplace idempotent pada retry.
8. Dokumentasi endpoint, payload snapshot, rollout, dan hasil pengujian dicatat pada pull request.

## Catatan rollout

- Deploy migration dan backend backward-compatible terlebih dahulu.
- Deploy CMS agar data dapat dikategorikan sebelum katalog client mulai memblokir `NULL`.
- Jalankan audit/backfill dengan dry-run dan persetujuan bisnis.
- Deploy `backend-mediacartz` sebelum atau bersamaan dengan client enforcement agar request manipulasi sudah ditolak.
- Deploy client setelah response API category tersedia.
- Pantau error `VOUCHER_CATEGORY_REQUIRED`, `VOUCHER_CHANNEL_MISMATCH`, kegagalan OTP, point hold yang tidak dilepas, exchange ganda, dan voucher checkout yang ditolak.
- Setelah seluruh voucher aktif dan member voucher relevan mempunyai category, hapus fallback master category untuk snapshot yang `NULL` pada release terpisah.

## Catatan untuk implementer

- Baca implementasi yang ada sebelum membuat service baru; sebagian lifecycle voucher sudah tersedia.
- Jangan mengubah migration lama.
- Jangan mengandalkan frontend untuk aturan channel.
- Jangan menyelesaikan masalah category dengan menambah nilai `both`; requirement hanya dua category.
- Jangan mencampur `category` dengan `type` benefit voucher.
- Jika ditemukan kontrak upstream yang berbeda dari dokumen ini, catat perbedaan dan pilih perubahan paling kecil yang tetap memenuhi invariant serta acceptance criteria.
