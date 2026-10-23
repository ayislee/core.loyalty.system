# Issue: Balance, Refund ke Saldo, Split Payment QRIS, dan Withdrawal

## Ringkasan

Implementasikan fitur balance/saldo konsumen secara end-to-end berdasarkan `PRD_BALANCE_REFUND_WITHDRAWAL.md`.

Fitur ini mencakup:

1. Wallet dan ledger saldo konsumen di `core.loyalty.system`.
2. Refund transaksi yang sudah dibayar ke saldo konsumen.
3. Pengurangan refund dengan biaya kurir aktual yang non-refundable.
4. Pengembalian voucher setelah transaksi gagal.
5. Pembayaran marketplace menggunakan saldo penuh atau split `Balance + QRIS`.
6. Pengajuan dan pemrosesan withdrawal.
7. Email notifikasi kepada seluruh user aktif dengan `type=finance` ketika withdrawal dibuat.
8. Halaman member dan CMS untuk melihat serta memproses data terkait.

Dokumen ini sengaja dibuat cukup operasional agar dapat dikerjakan oleh junior programmer atau AI model dengan konteks terbatas. Implementor tetap wajib membaca kode aktual sebelum mengubah file karena nama field response Marketplace Core dapat berbeda antar-environment.

## Referensi

- Product requirement: `core.loyalty.system/PRD_BALANCE_REFUND_WITHDRAWAL.md`
- Checkout backend loyalty: `core.loyalty.system/app/Controllers/Http/CheckoutController.js`
- Checkout frontend customer: `client.loyalty.system/src/pages/Order/index.jsx`
- Voucher lifecycle existing: `core.loyalty.system/app/Services/MemberVoucherLifecycleService.js`
- QRIS modal existing: `client.loyalty.system/src/components/QrisPaymentModal/index.jsx`
- Marketplace transaction: `backend-mediacartz/app/Controllers/Http/TransactionController.js`
- GoSend webhook existing: `backend-mediacartz/app/Services/DeliveryMethod/GosendWebhookService.js`

## Struktur aplikasi terkait

| Folder | Fungsi | Dampak issue |
| --- | --- | --- |
| `core.loyalty.system` | Backend loyalty/proxy | Scope utama: database wallet, ledger, refund, withdrawal, API, email, dan orkestrasi pembayaran saldo |
| `client.loyalty.system` | Frontend loyalty customer | Scope utama: tampilan saldo, mutasi, penggunaan saldo saat checkout, dan withdrawal |
| `cms.loyalty.system` | Frontend management loyalty | Scope utama: monitoring refund dan pemrosesan withdrawal oleh finance |
| `backend-mediacartz` | Backend marketplace/`MARKETPLACE_CORE` | Scope kondisional: informasi transaksi authoritative, nilai ongkir, payment status, dan event kegagalan pengiriman |
| `frontend-mediacartz-react` | Frontend marketplace | Tidak berubah |

## Kondisi kode saat issue dibuat

1. `core.loyalty.system` belum memiliki tabel wallet, ledger, hold, refund, atau withdrawal.
2. Tabel `transactions` di loyalty hanya menyimpan request/response proxy dan belum menjadi ledger finansial.
3. Checkout baru sudah tersedia melalui:
   - `POST /api/v1/member/checkout/quote`
   - `POST /api/v1/member/checkout/commit`
4. `CheckoutController` membuat preview dan order ke endpoint Marketplace Core `transaction/retail/order`.
5. Checkout saat ini belum menahan atau mendebit saldo.
6. `MemberVoucherLifecycleService` sudah mempunyai `returnVoucher()` yang idempotent untuk voucher member. Service existing ini harus digunakan atau diperluas, bukan menduplikasi update status voucher di controller baru.
7. `client.loyalty.system/src/pages/Order/index.jsx` sudah mempunyai alur quote/commit, guard submit, dan integrasi `QrisPaymentModal`.
8. `backend-mediacartz` sudah mempunyai callback/status pengiriman GoSend dan status pembayaran, tetapi belum ada kontrak event refund khusus ke loyalty.
9. Kolom `users.type` pada database loyalty saat ini hanya berisi enum `partner` dan `admin`. Requirement `type=finance` memerlukan migration dan penyesuaian validator/UI user management.
10. Email existing masih dipanggil langsung melalui `app/Lib/Email.js`. Untuk withdrawal, kegagalan email tidak boleh membatalkan request finansial.

## Scope implementasi

### Termasuk

- Wallet IDR per member.
- Immutable ledger dan materialized balance.
- Hold, capture, release, dan expiry saldo.
- API member untuk saldo dan mutasi.
- Refund penuh atau parsial ke saldo.
- Potongan biaya kurir tervalidasi.
- Restore voucher member dan global voucher.
- Penggunaan saldo pada checkout quote/commit existing.
- Pembayaran saldo penuh.
- Split payment Balance + QRIS.
- Release saldo ketika QRIS gagal atau kedaluwarsa.
- Pengajuan, daftar, detail, pembatalan terbatas, dan workflow withdrawal.
- Role/type finance dan notifikasi email withdrawal.
- Halaman balance/withdrawal di frontend customer.
- Halaman refund/withdrawal di CMS.
- Audit trail, idempotency, authorization, dan data masking.

### Tidak termasuk

- Transfer saldo antar-member.
- Pemakaian saldo di luar marketplace loyalty.
- Refund otomatis ke rekening atau metode pembayaran asal.
- Integrasi bank disbursement otomatis untuk withdrawal.
- Split balance dengan gateway selain QRIS.
- Sistem dispute/komplain lengkap.
- UI manual adjustment saldo pada MVP.
- Perubahan `frontend-mediacartz-react`.

## Keputusan implementasi untuk issue ini

Gunakan keputusan berikut agar implementor tidak membuat perilaku berbeda-beda. Jika Product/Finance mengubah salah satu keputusan, update issue sebelum coding.

1. Currency MVP adalah `IDR`.
2. Semua nominal uang disimpan sebagai integer Rupiah. Jangan gunakan floating point.
3. Saldo refund tidak kedaluwarsa.
4. Refund masuk ke saldo meskipun transaksi awal dibayar penuh dengan QRIS.
5. Voucher expired yang direstore mendapat masa berlaku kompensasi 7 hari. Nilai 7 hari harus berasal dari environment/config.
6. Member boleh memilih nominal saldo yang dipakai, dari `0` sampai nilai maksimum yang dihitung server.
7. Split payment hanya menggunakan QRIS untuk sisa pembayaran.
8. Withdrawal diproses manual oleh finance; tidak ada API transfer bank pada issue ini.
9. Member boleh membatalkan withdrawal hanya ketika `pending_review`.
10. Refund dari komplain/manual masuk `pending`; refund dari event kegagalan pengiriman tepercaya juga masuk `pending` sampai aturan auto-approval disetujui terpisah.
11. `core.loyalty.system` adalah source of truth saldo dan workflow refund/withdrawal.
12. Marketplace Core tetap menjadi source of truth status order, status pembayaran, nilai transaksi, voucher yang digunakan, dan ongkir.

## Prinsip teknis yang wajib dipenuhi

1. Jangan menyimpan saldo hanya dalam satu kolom tanpa ledger.
2. Ledger entry yang sudah posted tidak boleh diedit atau dihapus.
3. Koreksi ledger dibuat sebagai entry reversal/adjustment baru.
4. Tidak boleh ada saldo atau available balance negatif.
5. Semua credit, debit, hold, capture, dan release harus idempotent.
6. Perubahan wallet dan record bisnis terkait dilakukan dalam database transaction.
7. Gunakan row lock (`forUpdate`) atau mekanisme concurrency setara ketika mengubah wallet.
8. Jangan menahan database transaction terbuka selama menunggu request HTTP ke Marketplace Core atau payment gateway.
9. Member hanya boleh membaca wallet, refund, dan withdrawal miliknya.
10. Endpoint CMS harus memvalidasi role di backend. Menyembunyikan menu frontend tidak dianggap authorization.
11. Nomor rekening tidak boleh tampil utuh pada log, email, list, atau response umum.
12. Retry request dengan idempotency key yang sama harus mengembalikan hasil existing dan tidak mengulang dampak finansial.

## Terminologi dan perhitungan

```text
available_balance = ledger_balance - held_balance

refund_net = max(0, refund_gross - courier_deduction)

maximum_balance_amount = min(available_balance, transaction_total)
qris_amount = transaction_total - balance_amount
```

`balance_amount` yang diterima dari frontend hanyalah pilihan member. Backend wajib menghitung ulang dan menolak atau meminta preview ulang bila melebihi maksimum terbaru.

## Desain database `core.loyalty.system`

Buat migration terpisah agar rollback dan review lebih mudah. Timestamp file menyesuaikan urutan migration terbaru saat implementasi.

### 1. `member_wallets`

Kolom minimum:

| Kolom | Tipe/aturan |
| --- | --- |
| `wallet_id` | PK auto increment |
| `member_id` | unsigned integer, required |
| `currency` | string(3), default `IDR` |
| `ledger_balance` | big integer, default 0 |
| `held_balance` | big integer, default 0 |
| `status` | enum/string: `active`, `suspended`, `closed` |
| `version` | unsigned integer, default 0 |
| timestamps | `created_at`, `updated_at` |

Tambahkan unique index `(member_id, currency)` dan index status. Bila database/version mendukung check constraint secara konsisten, tambahkan constraint nominal non-negatif. Tetap validasi di service karena migration existing mungkin dijalankan pada database yang berbeda.

### 2. `wallet_ledger_entries`

Kolom minimum:

| Kolom | Tipe/aturan |
| --- | --- |
| `ledger_entry_id` | PK |
| `wallet_id`, `member_id` | required dan terindeks |
| `direction` | `credit` atau `debit` |
| `type` | `refund`, `marketplace_payment`, `withdrawal`, `adjustment`, `reversal` |
| `amount` | big integer positif |
| `balance_before`, `balance_after` | big integer |
| `reference_type`, `reference_id` | referensi bisnis |
| `idempotency_key` | string, unique |
| `description` | string/text nullable |
| `metadata` | JSON/longtext nullable; jangan menyimpan rahasia |
| `created_by_type`, `created_by_id` | actor audit |
| `posted_at` | datetime required |
| timestamps | audit |

Tidak perlu menyediakan generic update/delete endpoint untuk tabel ini.

### 3. `wallet_holds`

Kolom minimum: `wallet_hold_id`, `wallet_id`, `member_id`, `purpose`, `reference_id`, `amount`, `status`, `idempotency_key`, `expires_at`, `captured_at`, `released_at`, release reason, dan timestamps.

Status: `active`, `captured`, `released`, `expired`.

Tambahkan unique `idempotency_key` dan index `(wallet_id, status)`, `(reference_id, purpose)`, serta `expires_at`.

### 4. `transaction_refunds`

Kolom minimum:

- Refund ID dan nomor refund yang aman ditampilkan.
- Member ID.
- Marketplace transaction ID dan transaction number.
- Reason code dan description.
- `refund_gross`, `courier_deduction`, `refund_net`.
- Status refund.
- Voucher reference dan voucher restore status.
- Transaction snapshot dalam JSON/longtext.
- Idempotency key/event ID.
- Requested by, approved/rejected by, dan timestamp terkait.
- Failure/warning message yang aman.

Tambahkan index member, transaction reference, status, created time, serta unique idempotency key.

### 5. `withdrawals`

Kolom minimum:

- Withdrawal ID dan withdrawal number unique.
- Member ID, wallet ID, dan hold ID.
- `amount`, `fee`, `net_amount`.
- Channel/bank code.
- Account number terenkripsi.
- Masked account number.
- Account holder name terenkripsi atau dilindungi sesuai fasilitas project.
- Status.
- Payment reference.
- Member note dan internal finance note dipisahkan.
- Idempotency key.
- Reviewer/processor IDs dan timestamps.

Status: `pending_review`, `approved`, `processing`, `completed`, `rejected`, `cancelled`.

### 6. `withdrawal_status_histories`

Simpan withdrawal ID, old status, new status, actor type/ID, reason, metadata aman, dan timestamp. History tidak boleh diedit oleh UI.

### 7. `notification_deliveries`

Simpan notification type, reference ID, recipient user/email, delivery status, attempt count, last error, sent time, dan deduplication key unique.

Status minimum: `pending`, `sent`, `failed`.

### 8. Penambahan user finance

Buat migration yang memperluas `users.type` untuk menerima `finance`. Jangan mengedit migration lama yang sudah pernah dijalankan.

Periksa juga validator create/edit user agar `finance` dapat dibuat dari CMS/API. User finance tidak otomatis mendapat akses partner data lain selain endpoint finansial yang memang diizinkan.

## Model yang perlu dibuat di `core.loyalty.system`

Buat model mengikuti pola Lucid existing:

- `app/Models/MemberWallet.js`
- `app/Models/WalletLedgerEntry.js`
- `app/Models/WalletHold.js`
- `app/Models/TransactionRefund.js`
- `app/Models/Withdrawal.js`
- `app/Models/WithdrawalStatusHistory.js`
- `app/Models/NotificationDelivery.js`

Tambahkan relationship yang memang dipakai. Hindari relationship atau serialization kompleks yang belum diperlukan.

## Service backend loyalty yang perlu dibuat

### `app/Services/WalletService.js`

Jadikan service ini satu-satunya jalur perubahan saldo. Method minimum:

- `getOrCreateWallet(memberId, currency)`
- `getSummary(memberId)`
- `credit(payload, trx?)`
- `createHold(payload, trx?)`
- `captureHold(payload, trx?)`
- `releaseHold(payload, trx?)`
- `expireHold(payload, trx?)`

Setiap method mutasi wajib:

1. Memvalidasi integer positif.
2. Mengunci wallet/hold terkait.
3. Memeriksa idempotency key/reference.
4. Memvalidasi available balance.
5. Memperbarui materialized balance.
6. Membuat ledger entry ketika credit/debit posted.
7. Mengembalikan response yang sama atau ekuivalen pada retry.

### `app/Services/RefundService.js`

Tanggung jawab:

1. Mengambil dan menormalisasi detail transaksi dari Marketplace Core.
2. Memastikan transaksi milik member dan sudah paid/settled.
3. Menghitung maksimum refundable dan akumulasi refund sebelumnya.
4. Memvalidasi potongan kurir.
5. Membuat refund `pending`.
6. Approve/reject sesuai state machine.
7. Mengkredit saldo menggunakan `WalletService`.
8. Menjalankan restore voucher setelah credit dengan idempotency terpisah.
9. Menandai `completed_with_warning` bila saldo sudah masuk tetapi restore voucher gagal.

Jangan mengulangi credit saldo ketika retry hanya ditujukan untuk restore voucher.

### `app/Services/WithdrawalService.js`

Tanggung jawab:

1. Membuat withdrawal dan hold saldo.
2. Mengenkripsi serta memasking rekening.
3. Memvalidasi state transition.
4. Menulis status history.
5. Release hold pada reject/cancel.
6. Capture hold pada complete.
7. Menolak complete tanpa payment reference.
8. Menangani dua finance yang memproses request bersamaan.

### `app/Services/FinanceNotificationService.js`

Tanggung jawab:

1. Mengambil seluruh `users` aktif dengan `type=finance` dan email valid.
2. Membuat `notification_deliveries` dengan deduplication key per withdrawal dan recipient.
3. Mengirim email menggunakan fasilitas email existing.
4. Mencatat sukses/gagal dan menyediakan retry terkontrol.
5. Tidak pernah menggagalkan atau rollback withdrawal yang sudah berhasil dibuat.

Email tidak boleh memuat nomor rekening lengkap. Gunakan withdrawal number, member identifier aman, nominal, channel, masked account, waktu, dan link CMS.

### `app/Services/MarketplaceTransactionService.js`

Buat adapter kecil untuk request detail transaksi Marketplace Core dan normalisasi field yang diperlukan refund. Jangan menyebarkan parsing response marketplace ke banyak controller/service.

Data normalized minimum:

- Transaction ID dan number.
- Customer email/phone untuk ownership check.
- Payment status.
- Transaction status dan shipping status.
- Gross paid/total amount.
- Shipping fee yang dibayar konsumen.
- Courier cost actual jika tersedia.
- Voucher code/type/reference.
- Item dan nilai item untuk partial refund.

## Validator yang perlu dibuat

Di `core.loyalty.system/app/Validators/`, buat validator request minimum:

- `WalletTransactions.js`
- `WithdrawalCreate.js`
- `WithdrawalID.js`
- `WithdrawalReject.js`
- `WithdrawalComplete.js`
- `RefundCreate.js`
- `RefundID.js`
- `RefundReject.js`
- `CheckoutQuote.js` dan `CheckoutCommit.js` dimodifikasi untuk field balance.

Validator hanya memeriksa bentuk input. Validasi saldo, ownership, eligibility, dan state transition tetap harus dilakukan service.

## API member yang harus dibuat

Tambahkan route di `core.loyalty.system/start/routes/member.js` dalam group auth member.

### `GET /api/v1/member/wallet`

Response data minimum:

```json
{
  "currency": "IDR",
  "ledger_balance": 150000,
  "held_balance": 25000,
  "available_balance": 125000,
  "status": "active"
}
```

Wallet boleh dibuat lazy pada request pertama. Request paralel tidak boleh membuat dua wallet.

### `GET /api/v1/member/wallet/transactions`

Mendukung pagination, `type`, `direction`, `date_from`, dan `date_to`. Response tidak menampilkan metadata internal atau data sensitif.

### `POST /api/v1/member/withdrawals`

Request minimum:

```json
{
  "amount": 100000,
  "channel": "BANK_BCA",
  "account_number": "1234567890",
  "account_holder_name": "Nama Konsumen",
  "client_request_id": "uuid"
}
```

Backend menghitung fee dan net amount dari config. Request sukses membuat hold, withdrawal `pending_review`, status history, dan notification delivery.

### `GET /api/v1/member/withdrawals`

Daftar paginated milik member dengan nomor, nominal, fee, net, masked account, status, dan waktu.

### `GET /api/v1/member/withdrawals/:id`

Detail hanya milik member yang login. Jangan mengembalikan account number plaintext.

### `POST /api/v1/member/withdrawals/:id/cancel`

Hanya berlaku ketika `pending_review`. Cancel dan release hold harus atomic serta idempotent.

## API CMS/admin yang harus dibuat

Buat route baru agar domain terpisah dan mudah direview:

- `core.loyalty.system/start/routes/refund.js`
- `core.loyalty.system/start/routes/withdrawal.js`

Import route baru melalui `start/routes/index.js` mengikuti pola file route existing.

### Refund

- `GET /api/v1/admin/refunds`
- `GET /api/v1/admin/refunds/:id`
- `POST /api/v1/admin/refunds`
- `POST /api/v1/admin/refunds/:id/approve`
- `POST /api/v1/admin/refunds/:id/reject`
- `POST /api/v1/admin/refunds/:id/retry-voucher`

List mendukung filter status, transaction number, member, reason, dan date range.

Create refund manual menerima transaction reference, reason, description, komponen/item bila partial, serta courier deduction. Server tetap mengambil snapshot marketplace dan menghitung batas refund.

### Withdrawal

- `GET /api/v1/admin/withdrawals`
- `GET /api/v1/admin/withdrawals/:id`
- `POST /api/v1/admin/withdrawals/:id/approve`
- `POST /api/v1/admin/withdrawals/:id/reject`
- `POST /api/v1/admin/withdrawals/:id/process`
- `POST /api/v1/admin/withdrawals/:id/complete`

Aturan transition:

```text
pending_review -> approved | rejected | cancelled
approved       -> processing | rejected
processing     -> completed | rejected
```

`completed`, `rejected`, dan `cancelled` bersifat terminal. Retry command yang sama boleh mengembalikan hasil existing, tetapi command berbeda pada status terminal harus ditolak dengan `409`.

## Controller yang perlu dibuat

Di `core.loyalty.system/app/Controllers/Http/`:

- `WalletController.js`
- `WithdrawalController.js` untuk member endpoint, atau pisahkan `MemberWithdrawalController.js` bila lebih jelas.
- `AdminWithdrawalController.js`
- `RefundController.js`

Controller bertugas membaca request, memanggil service, dan membentuk response. Jangan menaruh perhitungan saldo atau state machine utama di controller.

Gunakan format response existing:

```json
{
  "status": true,
  "message": "...",
  "data": {}
}
```

Gunakan status HTTP yang sesuai: `400/422` invalid input, `403` forbidden, `404` resource tidak ditemukan/owned resource tidak tersedia, `409` state atau idempotency conflict, dan `502` upstream marketplace gagal.

## Penyesuaian checkout balance

Jangan membuat endpoint checkout baru. Modifikasi alur quote/commit existing.

### `POST /api/v1/member/checkout/quote`

Tambahkan input:

```json
{
  "use_balance": true,
  "balance_amount": 50000
}
```

Setelah preview Marketplace Core menghasilkan total authoritative:

1. Ambil wallet summary.
2. Hitung maksimum saldo yang dapat dipakai.
3. Validasi nominal pilihan member.
4. Kembalikan payment allocation pada response quote.
5. Masukkan pilihan dan hasil allocation yang relevan ke signed quote token agar tidak dapat dimodifikasi frontend.

Response tambahan minimum:

```json
{
  "balance": {
    "available_balance": 50000,
    "requested_amount": 50000,
    "applied_amount": 50000
  },
  "payment_allocation": {
    "transaction_total": 125000,
    "balance_amount": 50000,
    "qris_amount": 75000,
    "remainder_payment_method": "QRIS"
  }
}
```

### `POST /api/v1/member/checkout/commit`

Urutan implementasi yang diharapkan:

1. Verifikasi quote token dan `client_request_id` seperti alur existing.
2. Validasi ulang cart, harga, voucher, delivery, payment gateway, dan total.
3. Validasi ulang wallet available balance.
4. Buat hold saldo dengan reference/idempotency key checkout.
5. Buat order Marketplace Core menggunakan `client_request_id` existing.
6. Untuk saldo penuh, capture hold setelah order sukses dan response menunjukkan tidak ada remainder gateway.
7. Untuk split, minta Marketplace Core/QRIS hanya menagih `qris_amount`.
8. Simpan relasi order/transaction reference pada hold.
9. Ketika QRIS sukses, capture hold satu kali.
10. Ketika pembuatan order gagal secara pasti, release hold.
11. Ketika hasil upstream ambigu/timeout, jangan langsung retry create atau release tanpa status check. Tandai perlu rekonsiliasi dan gunakan `client_request_id` untuk mengambil hasil existing.

Karena request HTTP ke Marketplace Core tidak boleh berada di dalam lock database yang panjang, implementasikan proses sebagai stateful saga sederhana:

- Hold saldo disimpan lebih dulu.
- Call Marketplace Core dilakukan setelah commit database lokal.
- Hasil sukses mengaitkan reference order.
- Hasil gagal pasti me-release hold.
- Hasil ambigu disimpan untuk reconciliation, bukan dianggap gagal otomatis.

### Payload Marketplace Core

Tambahkan informasi allocation yang server-generated, misalnya:

```json
{
  "loyalty_balance_amount": 50000,
  "gateway_charge_amount": 75000,
  "loyalty_checkout_id": "client-request-id"
}
```

Nama final field harus sama pada loyalty dan Marketplace Core. Marketplace Core tidak boleh memakai total awal sebagai nominal QRIS ketika balance dipakai.

### Callback/status pembayaran

Tambahkan endpoint internal yang terautentikasi atau perluas status-sync existing agar `core.loyalty.system` mengetahui QRIS `paid`, `failed`, atau `expired`.

Event minimum membawa event ID, transaction ID/number, `client_request_id`, payment status, paid amount, dan timestamp. Signature serta anti-replay mengikuti pola `MARKETPLACE_CORE_SIGNATURE_SECRET` existing.

Mapping:

- `paid/settled`: capture hold.
- `failed/expired/cancelled`: release hold.
- Event duplikat: response sukses idempotent tanpa mutasi baru.
- Status yang mundur atau bertentangan: jangan mengubah ledger; catat untuk rekonsiliasi.

## Refund dan pengembalian voucher

### Membuat refund

1. Ambil transaksi authoritative dari Marketplace Core.
2. Pastikan customer email/phone cocok dengan member.
3. Pastikan transaksi sudah paid/settled.
4. Pastikan status/reason memenuhi rule refund.
5. Hitung `refund_gross` berdasarkan transaksi/item yang eligible.
6. Hitung total refund yang sudah completed/processing agar tidak over-refund.
7. Validasi `courier_deduction` tidak lebih besar dari biaya kurir aktual tervalidasi dan tidak lebih besar dari bagian yang dibayar konsumen.
8. Simpan snapshot yang diperlukan untuk audit.
9. Buat status `pending`.

### Approve refund

1. Lock record refund dan periksa status masih `pending`.
2. Verifikasi ulang ceiling refund bila ada refund lain setelah request dibuat.
3. Credit `refund_net` melalui `WalletService` dengan idempotency key khusus refund.
4. Set refund `completed` bila voucher tidak digunakan atau restore berhasil.
5. Set `completed_with_warning` bila credit berhasil tetapi restore voucher gagal.

Credit saldo dan perubahan status finansial harus atomic. Pemanggilan service/global dependency voucher yang tidak dapat masuk transaction yang sama harus memiliki status dan idempotency sendiri.

### Restore voucher

1. Voucher member: gunakan/perluas `MemberVoucherLifecycleService.returnVoucher()`.
2. Global voucher: tambahkan compensation method idempotent di `GlobalVoucherService` bila belum tersedia.
3. Jangan melakukan update langsung `member_vouchers.used = 0` dari RefundController.
4. Simpan status `not_required`, `pending`, `completed`, atau `failed` pada refund.
5. Retry voucher tidak boleh mengulang credit saldo.
6. Bila expiry lama masih di masa depan, pertahankan expiry lama.
7. Bila sudah expired, set expiry kompensasi berdasarkan config 7 hari.

## Integrasi `backend-mediacartz`

Perubahan pada repo ini dilakukan hanya jika kontrak yang diperlukan belum tersedia.

### File yang kemungkinan dimodifikasi

- `app/Controllers/Http/TransactionController.js`
- `app/Services/TransactionService.js`
- `app/Services/DeliveryMethod/GosendWebhookService.js`
- `app/Controllers/Http/PaymentGatewayWebhookController.js`
- `start/routes/client.js`
- Model/migration transaction bila allocation belum dapat disimpan.

### Perilaku yang harus disediakan

1. Retail order menerima `loyalty_balance_amount`, `gateway_charge_amount`, dan `loyalty_checkout_id` yang sudah divalidasi signature.
2. QRIS dibuat hanya sebesar `gateway_charge_amount`.
3. Transaction response menyimpan/mengembalikan payment allocation dan reference yang cukup untuk rekonsiliasi.
4. Endpoint detail transaksi mengembalikan payment, shipping, voucher, dan item breakdown yang dibutuhkan refund.
5. Callback pembayaran mengirim status terautentikasi ke loyalty atau menyediakan endpoint status yang dapat dipoll oleh loyalty.
6. GoSend failure/cancel/no-driver yang final menyediakan event candidate refund beserta biaya kurir aktual bila ada.
7. Marketplace hanya mengirim fakta transaksi; keputusan dan posting refund tetap dilakukan `core.loyalty.system`.

Jangan menganggap setiap callback cancel/no-driver langsung refundable. Marketplace harus membedakan status retryable dan final berdasarkan logic GoSend existing.

## Scheduled task/command backend loyalty

Tambahkan command/task sesuai pola project untuk:

1. Me-release hold checkout yang benar-benar expired setelah status marketplace diverifikasi.
2. Retry notification email berstatus `pending/failed` dengan batas attempt.
3. Retry voucher restore pada `completed_with_warning` bila aman.
4. Rekonsiliasi wallet materialized balance dengan ledger.
5. Mendeteksi active hold yang terlalu lama, payment allocation mismatch, dan withdrawal melewati SLA.

Daftarkan scheduler di `start/scheduler.js`. Interval berasal dari environment/config dan jangan terlalu agresif.

## Environment/config yang perlu ditambahkan

Tambahkan contoh variable pada `.env.example` atau dokumentasi config project:

- `WALLET_FEATURE_ENABLED`
- `BALANCE_PAYMENT_ENABLED`
- `BALANCE_SPLIT_QRIS_ENABLED`
- `REFUND_FEATURE_ENABLED`
- `WITHDRAWAL_FEATURE_ENABLED`
- `WITHDRAWAL_MIN_AMOUNT`
- `WITHDRAWAL_MAX_AMOUNT`
- `WITHDRAWAL_FEE_AMOUNT`
- `WITHDRAWAL_SLA_HOURS`
- `WALLET_HOLD_TTL_SECONDS`
- `REFUND_VOUCHER_COMPENSATION_DAYS=7`
- `FINANCE_CMS_BASE_URL`
- Retry/attempt limit notification bila belum ada config global.

Semua feature flag dicek di backend. Frontend hanya menggunakan flag/capability response untuk menyembunyikan UI.

## Perubahan `client.loyalty.system`

### File baru yang disarankan

- `src/pages/Balance/index.jsx` — ringkasan saldo dan daftar mutasi.
- `src/pages/Withdrawal/index.jsx` — daftar withdrawal.
- `src/pages/WithdrawalForm/index.jsx` — form dan konfirmasi withdrawal.
- `src/pages/WithdrawalDetail/index.jsx` — detail status dan riwayat.
- `src/components/BalanceSummary/index.jsx` — card saldo yang reusable.
- `src/components/PaymentAllocation/index.jsx` — breakdown Balance/QRIS.
- `src/utils/money.js` bila formatter integer Rupiah belum tersedia secara konsisten.

Nama/struktur dapat disesuaikan dengan convention frontend, tetapi jangan menaruh seluruh fitur baru dalam `Order/index.jsx`.

### File yang harus dimodifikasi

#### `src/utils/api.js`

Tambahkan konstanta endpoint wallet dan withdrawal. Perluas request quote/commit tanpa membuat base URL baru.

#### `src/components/RootRouter/index.jsx`

Tambahkan route protected:

- `/balance`
- `/withdrawal`
- `/withdrawal/new`
- `/withdrawal/:withdrawalId`

#### `src/components/Navigation/Navbar.jsx` dan/atau menu akun existing

Tambahkan akses ke Balance dan Withdrawal. Tampilkan saldo hanya setelah auth tersedia dan berikan fallback loading/error yang tidak merusak navigasi.

#### `src/pages/Profile/index.jsx`

Tambahkan card/link ringkasan saldo bila sesuai layout existing. Detail penuh tetap berada di halaman Balance.

#### `src/pages/Order/index.jsx`

Tambahkan:

1. Fetch wallet/capability.
2. Toggle `Gunakan Saldo`.
3. Input atau pilihan nominal saldo dengan batas dari server.
4. Breakdown total, saldo yang digunakan, dan sisa QRIS.
5. Field `use_balance` serta `balance_amount` pada quote.
6. Gunakan allocation dari response server, bukan hitungan frontend, pada commit/ringkasan final.
7. Reset persetujuan checkout bila pemakaian saldo berubah.
8. Jika server mengubah allocation karena saldo/total berubah, jangan commit; tampilkan nilai baru dan minta persetujuan ulang.
9. Untuk balance penuh, jangan membuka modal QRIS.
10. Untuk split, `QrisPaymentModal` tetap menerima instruksi QRIS dari response create.
11. Double click dan refresh tidak boleh membuat hold/order baru.

#### `src/utils/checkoutTransaction.js`

Perluas normalizer/comparator preview agar membandingkan:

- Transaction total.
- Balance requested/applied.
- QRIS remainder.
- `client_request_id`/quote context yang relevan.

#### `src/pages/TransactionList/index.jsx` dan `src/pages/TransactionDetail/index.jsx`

Tampilkan payment allocation bila tersedia dan status refund terkait. Jangan mengasumsikan seluruh total dibayar QRIS.

### Perilaku UI balance

1. Tampilkan ledger, held, dan available balance secara jelas.
2. Mutasi credit menggunakan indikator positif dan debit negatif.
3. Tampilkan reference, description, tanggal, dan tipe.
4. Gunakan pagination API; jangan mengambil seluruh ledger sekaligus.

### Perilaku UI withdrawal

1. Tampilkan minimum, maksimum, fee, dan net transfer dari capability/config response backend.
2. Validasi frontend untuk kenyamanan, tetapi selalu tampilkan error backend jika nilai berubah.
3. Setelah submit sukses, arahkan ke detail request.
4. Jangan simpan nomor rekening plaintext ke localStorage/sessionStorage.
5. Detail/list hanya menampilkan rekening masked.
6. Tombol cancel hanya tampil untuk `pending_review` dan harus memakai confirmation.

## Perubahan `cms.loyalty.system`

### File baru yang disarankan

- `src/pages/Refund/Refund.tsx`
- `src/pages/Refund/RefundDetail.tsx`
- `src/pages/Refund/RefundForm.tsx` untuk manual request.
- `src/pages/Withdrawal/Withdrawal.tsx`
- `src/pages/Withdrawal/WithdrawalDetail.tsx`
- `src/types/refund.ts`
- `src/types/withdrawal.ts`

### File yang harus dimodifikasi

- `src/routes/index.ts` — route refund dan withdrawal.
- `src/layout/DefaultLayout.tsx` atau file menu/sidebar yang digunakan — menu Finance.
- `src/services/Request.tsx` hanya bila helper error/idempotency header perlu ditambahkan secara generik.
- Halaman user management terkait agar `type=finance` dapat dibuat/diedit apabila fitur itu tersedia.

### Halaman Refund

List minimum:

- Refund number.
- Transaction number.
- Member.
- Gross, courier deduction, dan net.
- Refund status dan voucher restore status.
- Created time.

Detail minimum:

- Snapshot/ringkasan transaksi.
- Ownership/payment validation result.
- Alasan refund.
- Breakdown perhitungan.
- Voucher.
- Ledger reference.
- Actor dan timestamps.
- Action approve/reject/retry voucher sesuai status dan permission.

### Halaman Withdrawal

List mendukung filter status, withdrawal number, member, date range, dan nominal.

Detail minimum:

- Withdrawal number dan member.
- Amount, fee, dan net.
- Channel serta masked destination.
- Current status dan history.
- Hold/ledger reference.
- Action approve, reject, process, complete sesuai status.

Complete wajib meminta payment reference. Reject wajib meminta alasan. Semua action mempunyai confirmation dan state loading agar tidak ter-submit dua kali.

## Authorization

### Backend member

- Gunakan `auth.user.member_id`, bukan `member_id` dari body/query.
- Detail resource yang bukan milik member harus menghasilkan `404` atau response aman yang konsisten.

### Backend CMS

1. Tambahkan middleware/guard finance, misalnya perluasan `UserType` atau middleware baru `FinanceOnly`.
2. User `finance` dapat membaca dan memproses withdrawal/refund sesuai permission.
3. User non-finance tidak boleh melakukan action finansial walaupun mengetahui endpoint.
4. Jika admin tetap perlu read-only atau full access, putuskan secara eksplisit dalam mapping middleware; jangan memberi akses secara tidak sengaja.

### Marketplace integration

- Gunakan signature secret existing atau secret khusus yang setara.
- Verifikasi timestamp tolerance.
- Deduplicate event ID.
- Jangan percaya nominal dari event tanpa mencocokkan transaksi authoritative.

## Data sensitif

1. Enkripsi account number sebelum disimpan menggunakan primitive crypto yang sudah disetujui project.
2. Simpan masked value terpisah untuk list dan email, contoh `******7890`.
3. Jangan log request withdrawal mentah.
4. Jangan memasukkan account number plaintext ke ledger metadata atau notification delivery.
5. Jangan expose decryption endpoint generik.
6. Bila finance perlu melihat nomor penuh untuk transfer manual, buat action khusus, permission khusus, dan audit akses. Bila belum disetujui, tetap masked dan proses operasional ditentukan terpisah.

## Error code yang disarankan

Gunakan code stabil agar frontend tidak bergantung pada teks pesan:

- `WALLET_SUSPENDED`
- `INSUFFICIENT_BALANCE`
- `BALANCE_ALLOCATION_CHANGED`
- `WALLET_HOLD_NOT_ACTIVE`
- `WALLET_OPERATION_CONFLICT`
- `REFUND_NOT_ELIGIBLE`
- `REFUND_AMOUNT_EXCEEDED`
- `COURIER_DEDUCTION_INVALID`
- `REFUND_STATE_INVALID`
- `VOUCHER_RESTORE_FAILED`
- `WITHDRAWAL_AMOUNT_INVALID`
- `WITHDRAWAL_STATE_INVALID`
- `WITHDRAWAL_DESTINATION_INVALID`
- `FINANCE_PERMISSION_REQUIRED`
- `MARKETPLACE_STATUS_UNKNOWN`
- `PAYMENT_RECONCILIATION_REQUIRED`

Pesan untuk member harus aman dan dapat dimengerti. Detail upstream/internal hanya masuk log terstruktur.

## Observability dan rekonsiliasi

Log minimum pada setiap operasi:

- Correlation ID/client request ID.
- Member ID internal.
- Wallet/refund/withdrawal/order reference.
- Operation dan hasil status.
- Idempotent duplicate flag bila ada.

Jangan log data rekening penuh, token, signature, atau credential.

Rekonsiliasi minimum harus dapat menemukan:

1. `member_wallets.ledger_balance` yang berbeda dengan jumlah ledger.
2. `held_balance` yang berbeda dengan total hold aktif.
3. Hold checkout aktif tetapi payment/order sudah terminal.
4. Payment split sukses tetapi hold belum captured.
5. Payment gagal/expired tetapi hold belum released.
6. Refund completed tanpa ledger credit.
7. Withdrawal completed tanpa ledger debit.
8. Withdrawal rejected/cancelled dengan hold masih aktif.

## Rencana perubahan file

Daftar berikut adalah estimasi. Implementor boleh menyesuaikan nama file, tetapi tanggung jawabnya harus tetap terpisah.

### `core.loyalty.system` — file baru

```text
database/migrations/<timestamp>_member_wallet_schema.js
database/migrations/<timestamp>_wallet_ledger_entry_schema.js
database/migrations/<timestamp>_wallet_hold_schema.js
database/migrations/<timestamp>_transaction_refund_schema.js
database/migrations/<timestamp>_withdrawal_schema.js
database/migrations/<timestamp>_withdrawal_status_history_schema.js
database/migrations/<timestamp>_notification_delivery_schema.js
database/migrations/<timestamp>_add_finance_user_type.js

app/Models/MemberWallet.js
app/Models/WalletLedgerEntry.js
app/Models/WalletHold.js
app/Models/TransactionRefund.js
app/Models/Withdrawal.js
app/Models/WithdrawalStatusHistory.js
app/Models/NotificationDelivery.js

app/Services/WalletService.js
app/Services/RefundService.js
app/Services/WithdrawalService.js
app/Services/FinanceNotificationService.js
app/Services/MarketplaceTransactionService.js

app/Controllers/Http/WalletController.js
app/Controllers/Http/WithdrawalController.js
app/Controllers/Http/AdminWithdrawalController.js
app/Controllers/Http/RefundController.js

app/Validators/WalletTransactions.js
app/Validators/WithdrawalCreate.js
app/Validators/WithdrawalID.js
app/Validators/WithdrawalReject.js
app/Validators/WithdrawalComplete.js
app/Validators/RefundCreate.js
app/Validators/RefundID.js
app/Validators/RefundReject.js

app/Middleware/FinanceOnly.js
app/Commands/Reconcilewallet.js
app/Commands/Expirewalletholds.js
app/Commands/Retryfinancenotifications.js

start/routes/refund.js
start/routes/withdrawal.js
resources/views/mail/withdrawal.edge
```

Sesuaikan lokasi template email dengan convention view yang benar pada project; email existing memakai `View.render('mail/token')`.

### `core.loyalty.system` — file dimodifikasi

```text
start/routes/member.js
start/routes/index.js
start/kernel.js
start/scheduler.js
app/Controllers/Http/CheckoutController.js
app/Validators/CheckoutQuote.js
app/Validators/CheckoutCommit.js
app/Services/MemberVoucherLifecycleService.js
app/Services/GlobalVoucherService.js
app/Controllers/Http/UserController.js
app/Validators/User.js
app/Validators/UserEdit.js
app/Models/User.js
app/Lib/Email.js atau wrapper baru yang tetap memakai email transport existing
.env.example atau dokumentasi environment setara
```

Jika callback payment dibuat pada controller khusus, tambahkan controller dan route internal terpisah daripada memperbesar `CheckoutController`.

### `client.loyalty.system` — file baru

```text
src/pages/Balance/index.jsx
src/pages/Withdrawal/index.jsx
src/pages/WithdrawalForm/index.jsx
src/pages/WithdrawalDetail/index.jsx
src/components/BalanceSummary/index.jsx
src/components/PaymentAllocation/index.jsx
src/utils/money.js (bila belum ada helper setara)
```

### `client.loyalty.system` — file dimodifikasi

```text
src/utils/api.js
src/utils/checkoutTransaction.js
src/components/RootRouter/index.jsx
src/components/Navigation/Navbar.jsx
src/pages/Profile/index.jsx
src/pages/Order/index.jsx
src/pages/TransactionList/index.jsx
src/pages/TransactionDetail/index.jsx
```

### `cms.loyalty.system` — file baru

```text
src/pages/Refund/Refund.tsx
src/pages/Refund/RefundDetail.tsx
src/pages/Refund/RefundForm.tsx
src/pages/Withdrawal/Withdrawal.tsx
src/pages/Withdrawal/WithdrawalDetail.tsx
src/types/refund.ts
src/types/withdrawal.ts
```

### `cms.loyalty.system` — file dimodifikasi

```text
src/routes/index.ts
src/layout/DefaultLayout.tsx atau komponen sidebar/menu aktual
src/services/Request.tsx (hanya bila diperlukan)
halaman user management yang membuat/mengubah users.type
```

### `backend-mediacartz` — file kondisional

```text
app/Controllers/Http/TransactionController.js
app/Controllers/Http/PaymentGatewayWebhookController.js
app/Services/TransactionService.js
app/Services/DeliveryMethod/GosendWebhookService.js
start/routes/client.js
app/Models/Transaction.js dan migration baru bila payment allocation perlu kolom baru
```

Jangan mengubah file Marketplace Core bila response/status yang dibutuhkan ternyata sudah tersedia. Dokumentasikan kontrak existing yang dipakai.

## Urutan implementasi yang disarankan

1. Kunci keputusan config, finance access, dan kontrak Marketplace Core.
2. Buat migration serta model wallet/ledger/hold.
3. Implementasikan dan verifikasi `WalletService` termasuk idempotency/concurrency.
4. Buat API read-only wallet dan riwayat.
5. Buat refund schema/service/API dan restore voucher.
6. Buat withdrawal schema/service/API, role finance, dan notification delivery.
7. Buat CMS refund/withdrawal.
8. Buat halaman member Balance dan Withdrawal.
9. Perluas checkout quote dengan payment allocation.
10. Perluas checkout commit dengan hold dan full balance payment.
11. Tambahkan split QRIS, callback, expiry, dan reconciliation.
12. Tambahkan event kegagalan pengiriman Marketplace Core bila diperlukan.
13. Aktifkan feature flag bertahap setelah migration dan verifikasi staging.

Jangan mengaktifkan UI split payment sebelum callback/reconciliation dapat memastikan hold pasti captured atau released.

## Acceptance criteria

### Wallet

1. Setiap member mempunyai maksimal satu wallet IDR aktif.
2. Member dapat melihat ledger, held, dan available balance miliknya.
3. Member tidak dapat melihat wallet atau ledger member lain.
4. Request paralel dan retry tidak membuat wallet atau ledger entry duplikat.
5. Saldo tidak pernah negatif.

### Refund

6. Hanya transaksi paid/settled milik member yang dapat direfund.
7. Refund gross, courier deduction, dan refund net dihitung/divalidasi server dan tersimpan dalam audit.
8. Refund net dikreditkan ke balance tepat satu kali.
9. Total partial refund tidak dapat melebihi nilai eligible transaksi.
10. Voucher dikembalikan tepat satu kali sesuai aturan expiry.
11. Kegagalan voucher restore tidak menggandakan credit saldo dan dapat di-retry terpisah.
12. CMS dapat melihat breakdown dan memproses approve/reject sesuai permission.

### Pembayaran balance

13. Checkout quote mengembalikan available balance dan allocation authoritative.
14. Saldo penuh dapat membayar transaksi tanpa QRIS.
15. Saldo tidak cukup menghasilkan QRIS hanya sebesar remainder.
16. QRIS sukses meng-capture hold menjadi satu ledger debit.
17. QRIS gagal/expired/cancelled me-release hold tanpa ledger debit.
18. Dua checkout paralel tidak dapat memakai saldo yang sama.
19. Perubahan total atau saldo setelah quote meminta preview/persetujuan ulang.
20. Timeout atau retry tidak membuat order, hold, atau debit ganda.

### Withdrawal

21. Withdrawal valid membuat hold dan status `pending_review`.
22. Withdrawal tidak dapat dibuat bila available balance tidak cukup atau limit tidak terpenuhi.
23. Reject/cancel me-release hold satu kali.
24. Complete memerlukan payment reference dan meng-capture hold satu kali.
25. Status transition yang tidak valid ditolak.
26. Nomor rekening selalu masked pada response/list/email/log umum.
27. Seluruh perubahan status tercatat pada history.

### Finance dan email

28. `users.type=finance` didukung oleh database, API user, dan CMS yang relevan.
29. Setiap withdrawal baru membuat notifikasi kepada seluruh user finance aktif dengan email valid.
30. Retry notifikasi tidak mengirim ulang email yang sudah berstatus sent.
31. Kegagalan email tidak membatalkan withdrawal atau release hold.
32. User tanpa permission finance tidak dapat menjalankan action refund/withdrawal.

### Operasional

33. Feature flag dapat mematikan refund, penggunaan balance, split QRIS, dan withdrawal secara terpisah.
34. Rekonsiliasi dapat mendeteksi wallet/ledger/hold/payment/refund/withdrawal yang tidak konsisten.
35. Log dan error tidak membocorkan data rekening, token, signature, atau credential.

## Skenario pengujian

Detail implementasi test diserahkan kepada implementor. Minimal cakup skenario berikut.

### Wallet dan concurrency

1. Wallet pertama kali dibuat untuk member lama dan member baru.
2. Dua request pembuatan wallet bersamaan.
3. Credit, hold, capture, release, dan retry dengan idempotency key sama.
4. Percobaan debit/hold melebihi available balance.
5. Credit refund bersamaan dengan checkout atau withdrawal.
6. Ledger materialized balance dan hasil rekonsiliasi.

### Refund

7. Full refund tanpa biaya kurir.
8. Full refund dengan biaya kurir aktual.
9. Courier deduction nol, sama dengan gross, melebihi gross, dan melebihi ongkir tervalidasi.
10. Partial refund satu atau beberapa item.
11. Beberapa partial refund yang mendekati atau melewati ceiling.
12. Transaksi unpaid, milik member lain, atau status tidak eligible.
13. Request/event refund duplikat.
14. Voucher member aktif, expired, sudah returned, dan restore gagal.
15. Global voucher restore/compensation.
16. Credit berhasil tetapi voucher restore gagal, lalu retry voucher.

### Checkout balance dan QRIS

17. QRIS penuh tanpa saldo.
18. Saldo penuh dengan nilai tepat sama dengan total.
19. Saldo lebih besar dari total.
20. Split menggunakan seluruh available balance.
21. Split menggunakan sebagian saldo pilihan member.
22. Total, voucher, ongkir, atau saldo berubah antara quote dan commit.
23. QRIS split sukses, gagal, expired, cancelled, dan callback duplikat.
24. Callback sukses terlambat setelah hold expiry candidate.
25. Order upstream gagal pasti dan timeout/hasil ambigu.
26. Double click checkout dan retry dengan `client_request_id` sama.
27. Dua checkout paralel dengan saldo yang hanya cukup untuk satu transaksi.

### Withdrawal

28. Withdrawal valid pada batas minimum dan maksimum.
29. Nominal di bawah/di atas limit dan saldo tidak cukup.
30. Request withdrawal duplikat.
31. Approve, process, dan complete happy path.
32. Reject dari `pending_review` dan `approved` sesuai transition yang diizinkan.
33. Cancel oleh member saat `pending_review` dan setelah status berubah.
34. Complete tanpa payment reference.
35. Dua finance memproses withdrawal yang sama bersamaan.
36. Retry complete/reject/cancel.
37. Masking dan perlindungan data rekening pada seluruh response dan log.

### Email dan authorization

38. Satu dan beberapa user finance aktif.
39. User finance nonaktif, email invalid, tidak ada finance, dan email transport gagal.
40. Retry email sent dan failed.
41. Member mencoba mengakses resource member lain.
42. User admin/partner/non-finance mencoba endpoint action finance.
43. Event Marketplace Core dengan signature invalid, timestamp lama, dan event ID duplikat.

### Regression

44. Checkout QRIS existing tanpa balance tetap berjalan.
45. Voucher marketplace existing tetap dapat dipakai dan diredeem.
46. Daftar/detail/resume transaksi existing tidak rusak.
47. Cart hanya dihapus setelah order berhasil seperti perilaku existing.
48. User management partner/admin existing tidak rusak setelah penambahan type finance.

## Risiko utama

1. **Double spend:** cegah dengan wallet lock dan hold atomic.
2. **Double credit/debit:** cegah dengan unique idempotency key dan state machine.
3. **Distributed transaction:** loyalty DB dan Marketplace Core tidak atomic; gunakan saga, status ambigu, dan rekonsiliasi.
4. **Late payment callback:** jangan release/capture tanpa memeriksa status akhir dan state hold.
5. **Over-refund:** hitung ceiling dari transaksi dan seluruh refund existing di dalam lock/transaction yang sesuai.
6. **Voucher terduplikasi:** gunakan lifecycle service dan reference transaksi.
7. **Data rekening bocor:** encryption, masking, redacted logging, dan permission khusus.
8. **Role finance:** perubahan enum dapat berbeda antar-database; migration harus diuji pada engine yang dipakai environment.
9. **Issue terlalu besar:** implementasikan mengikuti urutan dan feature flag; jangan mengaktifkan fitur sebelum dependency selesai.

## Definition of done

1. Seluruh acceptance criteria terpenuhi.
2. Migration up/down dapat dijalankan pada staging tanpa mengubah migration lama.
3. Skenario pengujian utama lulus dan hasilnya dicatat pada PR.
4. Tidak ada saldo negatif, double credit, double debit, atau double withdrawal pada pengujian concurrency/retry.
5. Checkout QRIS existing tetap berjalan ketika balance feature flag mati.
6. Refund, voucher restore, split payment, dan withdrawal mempunyai audit trail yang dapat ditelusuri.
7. Data rekening tidak muncul plaintext pada log, email, list, atau browser storage.
8. Scheduler/reconciliation dan retry notification dapat dijalankan secara aman lebih dari sekali.
9. Dokumentasi PR mencatat kontrak Marketplace Core aktual dan file kondisional yang akhirnya diubah.
10. Feature flag dan environment variable telah didokumentasikan.
11. Perubahan UI diverifikasi pada ukuran mobile utama untuk client dan desktop untuk CMS.
12. Tidak ada error console/server pada happy path utama.

