# Issue: Fleksibilitas List Transaksi Member Berdasarkan Email atau Nomor Telepon

## Ringkasan
Halaman frontend `/transaction/list` saat ini memanggil endpoint backend `core.loyalty.system`:

```http
GET /api/v1/member/transaction
```

Di backend, request tersebut diteruskan ke `MARKETPLACE_CORE` menggunakan email member:

```http
GET {MARKETPLACE_CORE}/transaction/email/{email_member}?page=1&rows=10&order_by=transaction_created_datetime&sort_by=desc
```

Masalahnya, member dapat login menggunakan email atau nomor telepon berdasarkan field `members.lid` di database `loyalty.system`. Jika member login menggunakan nomor telepon dan belum memiliki email, list transaksi tidak bisa ditemukan karena backend tetap mencari transaksi berdasarkan email.

## Informasi Project
1. `core.loyalty.system` adalah backend loyalty.
2. `client.loyalty.system` adalah frontend.
3. `backend-mediacartz` adalah service `MARKETPLACE_CORE` yang dikonfigurasi pada `.env` di `core.loyalty.system`.

## Tujuan
1. Endpoint `GET /api/v1/member/transaction` tetap dipakai frontend tanpa perubahan URL.
2. Backend `core.loyalty.system` menentukan cara lookup transaksi berdasarkan identitas login member.
3. Jika member memiliki email valid, backend dapat menggunakan endpoint marketplace berbasis email.
4. Jika member tidak memiliki email tetapi memiliki nomor telepon, backend menggunakan endpoint marketplace berbasis msisdn.
5. Member yang login menggunakan nomor telepon tetap bisa melihat transaksi miliknya di `/transaction/list`.

## Endpoint Marketplace Yang Tersedia
Di `backend-mediacartz`, endpoint yang relevan:

```http
GET {MARKETPLACE_CORE}/transaction/email/{email_member}
GET {MARKETPLACE_CORE}/transaction/msisdn/{nomor_telepon}
```

Keduanya mengarah ke controller yang sama:

```js
TransactionController.getIndex
```

## Scope Backend `core.loyalty.system`
1. Update logic pada `TransactionController.list`.
2. Jangan mengubah kontrak frontend untuk endpoint `member/transaction`.
3. Tentukan identifier transaksi dari data member login:
   - Prioritas email jika `auth.user.email` tersedia dan valid.
   - Fallback ke nomor telepon jika email kosong/tidak tersedia.
4. Saat memakai nomor telepon, panggil:

```http
GET {MARKETPLACE_CORE}/transaction/msisdn/{nomor_telepon}
```

5. Tetap teruskan query pagination dan sorting yang dikirim frontend:

```js
page
rows
order_by
sort_by
```

6. Pastikan response ke frontend tetap menggunakan format yang sekarang:

```js
{
  status: true,
  data: ...
}
```

7. Jika email dan nomor telepon sama-sama tidak tersedia, return error yang jelas, misalnya:

```js
{
  status: false,
  message: "Email atau nomor telepon member tidak tersedia"
}
```

## Scope Frontend `client.loyalty.system`
1. Tidak perlu mengganti endpoint `/transaction/list`.
2. Tidak perlu mengganti API constant `TRANSACTION_LIST`, kecuali ada kebutuhan teknis saat implementasi.
3. Jika backend mengembalikan error karena identitas member tidak lengkap, tampilkan pesan error yang sudah tersedia dari response backend.

## Scope `backend-mediacartz`
1. Pastikan endpoint berikut masih tersedia dan berjalan:

```http
GET /api/v1/transaction/email/:customer_email
GET /api/v1/transaction/msisdn/:customer_msisdn
```

2. Tidak perlu membuat endpoint baru jika endpoint msisdn sudah berjalan normal.
3. Perubahan di `backend-mediacartz` hanya dilakukan jika ditemukan bug pada endpoint `transaction/msisdn`.

## Alur Yang Diharapkan
1. Member membuka `/transaction/list`.
2. Frontend memanggil `GET /api/v1/member/transaction`.
3. Backend `core.loyalty.system` membaca data member login.
4. Jika email tersedia, backend memanggil marketplace via endpoint email.
5. Jika email tidak tersedia dan nomor telepon tersedia, backend memanggil marketplace via endpoint msisdn.
6. Marketplace mengembalikan list transaksi.
7. Backend mengembalikan response ke frontend dengan format yang sama seperti sebelumnya.

## Acceptance Criteria
1. Member yang memiliki email tetap bisa melihat list transaksi.
2. Member yang tidak memiliki email tetapi memiliki nomor telepon tetap bisa melihat list transaksi.
3. Frontend `/transaction/list` tidak perlu mengganti endpoint.
4. Pagination dan sorting tetap berjalan seperti sebelumnya.
5. Response frontend tidak berubah secara struktur.
6. Jika email dan nomor telepon tidak tersedia, frontend menerima pesan error yang jelas.

## Skenario Test High Level
1. Login sebagai member yang memiliki email, lalu buka `/transaction/list`.
2. Login sebagai member yang tidak memiliki email tetapi memiliki nomor telepon, lalu buka `/transaction/list`.
3. Login sebagai member yang memiliki email dan nomor telepon, pastikan lookup tetap berhasil.
4. Test pagination pada member email dan member nomor telepon.
5. Test kondisi member tanpa email dan tanpa nomor telepon.
6. Test ketika `MARKETPLACE_CORE` mengembalikan error.

## Out of Scope
1. Redesign halaman `/transaction/list`.
2. Perubahan struktur response besar dari backend ke frontend.
3. Pembuatan endpoint marketplace baru.
4. Perubahan flow login member.
5. Perubahan data transaksi di database marketplace.

## Definition of Done
1. `GET /api/v1/member/transaction` bisa lookup transaksi lewat email atau nomor telepon.
2. Frontend `/transaction/list` tetap berjalan tanpa perubahan endpoint.
3. Skenario test high level sudah dicek.
4. Tidak ada regresi pada member yang sudah memiliki email.
