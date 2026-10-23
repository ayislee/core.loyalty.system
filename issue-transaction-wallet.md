# Issue — Pembayaran Transaksi Marketplace Menggunakan Wallet

## Ringkasan

Selesaikan pembayaran checkout marketplace menggunakan saldo wallet, baik:

1. saldo penuh tanpa QRIS; maupun
2. saldo sebagian dengan QRIS untuk sisa pembayaran.

Implementasi wajib menjaga konsistensi antara `core.loyalty.system` sebagai pemilik wallet dan `backend-mediacartz` sebagai pemilik transaksi marketplace. Saldo tidak boleh terdebit dua kali, tertahan tanpa batas, atau dianggap lunas sebelum seluruh komponen pembayaran berhasil diselesaikan.

## Aplikasi yang terlibat

- `client.loyalty.system`: pilihan saldo dan presentasi hasil alokasi pembayaran.
- `core.loyalty.system`: wallet, hold, capture, release, refund, quote, dan orkestrasi checkout.
- `backend-mediacartz`: transaksi marketplace, QRIS, status pembayaran, dan callback settlement ke Core.

## Kondisi saat ini

Fondasi berikut sudah tersedia:

- UI `/order` memiliki toggle **Gunakan Saldo** dan input nominal saldo.
- `CheckoutController` sudah menghitung `balance_amount` dan `qris_amount`.
- Core sudah memiliki `WalletService.createHold()`, `captureHold()`, `releaseHold()`, dan `expireHold()`.
- Core sudah memiliki endpoint internal `POST /api/v1/internal/wallet/payment-status`.
- Checkout sudah mengirim `loyalty_balance_amount`, `gateway_charge_amount`, dan `checkout_id` pada payload order.
- Backend Marketplace sudah memiliki alur QRIS dan status `payment_received`.

Kesenjangan yang masih harus diselesaikan:

- Marketplace belum menjadikan alokasi wallet sebagai bagian resmi dari nilai pembayaran transaksi.
- QRIS belum dijamin hanya dibuat sebesar sisa pembayaran.
- Settlement wallet belum terhubung dengan callback pembayaran Marketplace.
- Pembayaran saldo penuh belum memiliki alur finalisasi transaksi yang lengkap.
- Hold saldo untuk pembayaran campuran belum dipastikan selalu di-capture atau di-release.
- Belum ada rekonsiliasi untuk kegagalan komunikasi antarservice.

## Tujuan

- Konsumen dapat membayar penuh menggunakan saldo.
- Konsumen dapat membayar sebagian menggunakan saldo dan sisanya melalui QRIS.
- Total pembayaran selalu memenuhi rumus:

```text
transaction_total_amount = loyalty_balance_amount + gateway_charge_amount
```

- QRIS hanya dibuat untuk `gateway_charge_amount`.
- Transaksi berubah menjadi `payment_received` hanya setelah seluruh pembayaran berhasil.
- Hold wallet di-capture ketika pembayaran berhasil dan di-release ketika pembayaran gagal, kedaluwarsa, atau order gagal dibuat.
- Semua operasi settlement dan refund idempoten serta dapat direkonsiliasi.

## Di luar cakupan

- Perubahan mata uang selain IDR.
- Transfer saldo antaranggota.
- Penambahan metode pembayaran selain wallet dan QRIS.
- Perubahan besar desain halaman checkout.
- Penggantian provider QRIS.

## Keputusan arsitektur wajib

### 1. Core adalah sumber kebenaran wallet

Marketplace tidak boleh mengubah ledger wallet secara langsung. Marketplace hanya boleh memanggil endpoint internal Core yang ditandatangani.

### 2. Marketplace adalah sumber kebenaran status order

Core tidak mengubah tabel transaksi Marketplace secara langsung. Setelah settlement wallet berhasil, Marketplace sendiri yang mengubah transaksi menjadi `payment_received`.

### 3. Gunakan mekanisme hold

Saldo dialokasikan melalui hold sebelum order dikirim ke Marketplace. Hold mencegah saldo yang sama digunakan oleh checkout lain tanpa langsung membuat debit permanen.

### 4. Status `payment_received` adalah gerbang bisnis

Notifikasi pembayaran, aksi toko, dan workflow delivery hanya boleh berjalan setelah status transaksi menjadi `payment_received`.

### 5. Semua callback wajib idempoten

Callback sukses, gagal, expiry, retry, dan timeout dapat diterima lebih dari satu kali. Event yang sama tidak boleh menghasilkan capture, release, refund, atau perubahan status ganda.

## Model pembayaran

### Saldo tidak digunakan

```text
wallet amount = 0
QRIS amount   = transaction total
```

Alur QRIS berjalan seperti sekarang.

### Saldo sebagian

```text
0 < wallet amount < transaction total
QRIS amount = transaction total - wallet amount
```

Saldo dibuat hold. QRIS hanya dibuat untuk sisanya. Setelah QRIS sukses, Marketplace meminta Core melakukan capture hold. Status menjadi `payment_received` hanya jika capture berhasil.

### Saldo penuh

```text
wallet amount = transaction total
QRIS amount   = 0
```

Marketplace tidak membuat payment request QRIS. Setelah order berhasil dibuat, Marketplace meminta Core melakukan capture hold, kemudian mengubah status menjadi `payment_received`.

## State machine settlement wallet

Gunakan status bisnis berikut pada transaksi Marketplace:

```text
none
  -> pending
  -> captured
  -> released
  -> refunded
  -> failed
```

Aturan:

- `none`: transaksi tidak memakai wallet.
- `pending`: hold sudah dibuat dan menunggu hasil pembayaran.
- `captured`: hold berhasil menjadi debit wallet.
- `released`: hold dilepas karena order/QRIS tidak selesai.
- `refunded`: debit wallet telah dikembalikan.
- `failed`: settlement membutuhkan retry atau rekonsiliasi.

## Kontrak payload checkout

Payload Core ke Marketplace harus memuat:

```json
{
  "checkout_id": "checkout-uuid",
  "wallet_hold_id": 123,
  "loyalty_balance_amount": 50000,
  "gateway_charge_amount": 25000
}
```

Ketentuan validasi Marketplace:

- seluruh nominal harus integer dan tidak negatif;
- `loyalty_balance_amount + gateway_charge_amount` harus sama dengan total final Marketplace;
- `wallet_hold_id` dan `checkout_id` wajib jika saldo lebih dari nol;
- `gateway_charge_amount` wajib lebih dari nol jika QRIS akan dibuat;
- payload preview tidak boleh membuat hold atau settlement;
- nilai dari frontend tidak boleh dipercaya tanpa quote yang ditandatangani Core.

## Rancangan `core.loyalty.system`

### A. Checkout quote

Pertahankan perhitungan alokasi pada `CheckoutController.paymentAllocation()`. Quote harus menyimpan nominal saldo dan QRIS agar commit tidak dapat menggantinya secara sepihak.

File yang dimodifikasi:

- `app/Controllers/Http/CheckoutController.js`
- `app/Validators/CheckoutQuote.js`
- `app/Services/MarketplaceFulfillmentService.js`

### B. Checkout commit dan pembuatan hold

Pada commit:

1. validasi ulang saldo tersedia;
2. buat hold sebelum request order Marketplace;
3. masukkan `wallet_hold_id`, `checkout_id`, `loyalty_balance_amount`, dan `gateway_charge_amount` ke payload;
4. jika order Marketplace gagal dibuat, release hold;
5. jangan capture langsung di controller untuk saldo penuh; settlement harus mengikuti hasil resmi Marketplace agar satu jalur digunakan untuk saldo penuh maupun parsial.

File yang dimodifikasi:

- `app/Controllers/Http/CheckoutController.js`
- `app/Services/WalletService.js`
- `app/Validators/CheckoutCommit.js`

### C. Endpoint internal settlement

Perkuat endpoint yang sudah tersedia:

```text
POST /api/v1/internal/wallet/payment-status
```

Payload minimum:

```json
{
  "client_request_id": "checkout-uuid",
  "wallet_hold_id": 123,
  "marketplace_transaction_id": 155675,
  "payment_status": "paid",
  "event_id": "xendit-event-or-wallet-event"
}
```

Perilaku:

- `paid`/`settled`: capture hold;
- `failed`/`expired`/`cancelled`: release hold;
- event yang sudah diproses mengembalikan sukses idempoten;
- hold harus cocok dengan `checkout_id`, nominal, dan transaksi;
- respons mengembalikan status settlement final yang dapat disimpan Marketplace.

File yang dimodifikasi:

- `app/Controllers/Http/WalletSettlementController.js`
- `app/Services/WalletService.js`
- `start/routes/wallet_internal.js`

File yang mungkin dibuat:

- `app/Validators/InternalWalletPaymentStatus.js`
- migration tambahan untuk menyimpan `marketplace_transaction_id` atau metadata settlement pada `wallet_holds` bila kolom yang ada belum mencukupi.

### D. Rekonsiliasi hold

Scheduler tidak cukup hanya menandai hold kedaluwarsa. Tambahkan rekonsiliasi untuk hold checkout yang masih `pending` melewati batas waktu:

- cek status transaksi Marketplace;
- capture jika Marketplace sudah dibayar;
- release jika pembayaran gagal/kedaluwarsa;
- biarkan pending dan retry bila Marketplace tidak dapat dihubungi.

File yang dimodifikasi:

- `start/scheduler.js`
- `app/Services/MarketplaceTransactionService.js`
- `app/Services/WalletService.js`

File yang disarankan dibuat:

- `app/Services/WalletSettlementReconciliationService.js`

## Rancangan `backend-mediacartz`

### A. Penyimpanan alokasi pembayaran

Tambahkan data yang dapat diaudit pada transaksi Marketplace. Disarankan menggunakan kolom eksplisit, bukan hanya `transaction_data` JSON:

- `transaction_loyalty_balance_amount` bigint, default `0`;
- `transaction_gateway_charge_amount` bigint;
- `transaction_wallet_checkout_id` varchar, nullable dan terindeks;
- `transaction_wallet_hold_id` bigint, nullable;
- `transaction_wallet_settlement_status` varchar;
- `transaction_wallet_settlement_event_id` varchar, nullable;
- `transaction_wallet_settled_datetime` datetime, nullable.

File yang dibuat:

- migration baru pada `database/migrations/` untuk kolom settlement wallet.

File yang dimodifikasi:

- `app/Models/Transaction.js` bila diperlukan oleh aturan serialization/fillable.
- `app/Validators/FormTransactionRetail.js`
- `app/Controllers/Http/TransactionController.js`
- `app/Middleware/VerifyRetailPayload.js`

### B. Nilai payment request QRIS

`XenditPaymentGateway` harus menggunakan `transaction_gateway_charge_amount`, bukan selalu `transaction_total_amount`.

Jika nilai QRIS nol:

- jangan memanggil Xendit;
- jangan membuat QR code kosong;
- tandai bahwa transaksi menunggu settlement wallet penuh.

File yang dimodifikasi:

- `app/Services/PaymentGateway/XenditPaymentGateway.js`
- `app/Controllers/Http/TransactionController.js`
- service pembuat `TransactionPayment` terkait.

### C. Service komunikasi settlement ke Core

Buat service khusus untuk memanggil endpoint internal Core menggunakan signature yang sudah disepakati. Service harus mempunyai timeout, retry yang aman, idempotency event, dan log tanpa membocorkan secret.

File yang dibuat:

- `app/Services/Wallet/CoreWalletSettlementService.js`

Tanggung jawab service:

- membuat signature request;
- mengirim status `paid`, `failed`, `expired`, atau `cancelled`;
- mengembalikan hasil capture/release yang terstruktur;
- membedakan error permanen dan error yang dapat di-retry.

### D. Saldo penuh

Setelah transaksi Marketplace tersimpan dan QRIS amount nol:

1. panggil Core untuk capture hold;
2. simpan hasil settlement;
3. ubah status transaksi menjadi `payment_received` melalui `MarketplaceDeliveryOrderService.markPaymentReceived()`;
4. biarkan notifikasi dan workflow order berjalan dari perubahan status tersebut;
5. jika capture gagal, transaksi tetap pending/failed-settlement dan masuk antrean rekonsiliasi.

File yang dimodifikasi:

- `app/Controllers/Http/TransactionController.js`
- `app/Services/MarketplaceDeliveryOrderService.js`

### E. Saldo sebagian + QRIS

Pada callback QRIS sukses:

1. validasi callback dan payment amount;
2. panggil Core untuk capture hold;
3. jika capture sukses, simpan settlement `captured`;
4. baru ubah transaksi menjadi `payment_received`;
5. jika capture gagal sementara, jangan menganggap order siap diproses; jadwalkan retry;
6. jika callback gagal/expired/cancelled, panggil Core untuk release hold.

File yang dimodifikasi:

- `app/Controllers/Http/PaymentGatewayWebhookController.js`
- `app/Services/MarketplaceDeliveryOrderService.js`
- `app/Services/TransactionPaymentService.js`

### F. Rekonsiliasi Marketplace

Buat job/service untuk transaksi dengan settlement `pending` atau `failed`:

- pembayaran provider sukses tetapi capture wallet belum terkonfirmasi;
- wallet captured tetapi status transaksi belum `payment_received`;
- QRIS gagal/expired tetapi hold belum released;
- callback berulang dengan event yang sama.

File yang disarankan dibuat:

- `app/Services/Wallet/MarketplaceWalletSettlementReconciliationService.js`
- command/scheduler sesuai pola scheduler aplikasi yang tersedia.

### G. Penolakan dan refund

Refund transaksi harus memisahkan sumber dana:

- bagian wallet dikembalikan melalui endpoint refund wallet Core;
- bagian QRIS mengikuti mekanisme refund gateway yang berlaku;
- total refund tidak boleh melebihi masing-masing komponen pembayaran;
- retry tidak boleh menghasilkan refund ganda.

File yang dimodifikasi:

- `app/Services/MarketplaceWalletRefundService.js`
- `app/Services/MarketplaceDeliveryOrderService.js`
- service refund payment gateway jika refund QRIS termasuk scope implementasi.

## Rancangan `client.loyalty.system`

### A. Pilihan saldo

Pertahankan toggle **Gunakan Saldo** dengan perilaku:

- toggle nonaktif jika saldo tersedia nol;
- input kosong berarti menggunakan saldo maksimum;
- nominal tidak boleh melebihi saldo tersedia;
- perubahan saldo membatalkan persetujuan checkout lama dan meminta quote baru.

### B. Ringkasan pembayaran

Tampilkan secara eksplisit:

- total transaksi;
- saldo digunakan;
- sisa QRIS;
- label `Dibayar penuh dengan saldo` jika QRIS nol.

### C. Hasil commit

- saldo penuh: jangan membuka modal QRIS; arahkan ke halaman transaksi sukses/pending order setelah Marketplace mengonfirmasi `payment_received`;
- saldo sebagian: tampilkan QRIS hanya untuk nilai sisa;
- kegagalan settlement: tampilkan pesan aman dan jangan meminta pengguna membayar ulang sebelum status direkonsiliasi.

File yang dimodifikasi:

- `src/pages/Order/index.jsx`
- `src/components/QrisPaymentModal/index.jsx` bila perlu menampilkan rincian alokasi.
- `src/utils/api.js` hanya jika kontrak endpoint berubah.

## Keamanan

- Endpoint internal harus menggunakan signature, timestamp, dan batas toleransi waktu.
- Jangan menerima nominal settlement langsung dari callback tanpa mencocokkannya dengan transaksi tersimpan.
- Jangan mencetak API key, signature, QR payload, atau nomor telepon penuh di log.
- Gunakan integer untuk seluruh nilai uang; jangan memakai floating point.
- Lock wallet/hold ketika capture atau release.
- Setiap debit, release, dan refund harus mempunyai idempotency key unik dan stabil.

## Observability

Log terstruktur minimum:

- `checkout_id`;
- `transaction_id`;
- `wallet_hold_id`;
- `wallet_amount` dan `gateway_amount`;
- status sebelumnya dan status berikutnya;
- `event_id` dan hasil idempotensi;
- penyebab retry/gagal tanpa data rahasia.

Tambahkan marker atau metric untuk:

- hold pending melewati TTL;
- QRIS sukses tetapi wallet belum captured;
- wallet captured tetapi transaksi belum `payment_received`;
- release/refund gagal;
- perbedaan total alokasi dengan total transaksi.

## Urutan implementasi yang disarankan

1. Finalisasi kontrak payload dan migration Marketplace.
2. Perkuat endpoint settlement Core beserta idempotensinya.
3. Buat `CoreWalletSettlementService` di Marketplace.
4. Implementasikan saldo penuh tanpa QRIS.
5. Implementasikan saldo sebagian dan settlement pada callback QRIS.
6. Implementasikan release pada gagal/expiry/cancel.
7. Hubungkan refund sesuai sumber dana.
8. Tambahkan rekonsiliasi di kedua aplikasi.
9. Sesuaikan frontend berdasarkan respons final backend.
10. Aktifkan `BALANCE_PAYMENT_ENABLED=true` di staging setelah seluruh alur di atas tersedia.

## Skenario pengujian

Detail implementasi unit/integration test diserahkan kepada programmer yang mengerjakan. Minimal cakupan skenario:

- checkout tanpa saldo;
- saldo penuh berhasil;
- saldo sebagian dan QRIS berhasil;
- saldo tidak cukup atau berubah sebelum commit;
- pembuatan order Marketplace gagal setelah hold dibuat;
- QRIS gagal, expired, dan cancelled;
- callback sukses dikirim berulang;
- callback gagal datang setelah pembayaran sudah sukses;
- Core timeout ketika Marketplace meminta capture;
- capture berhasil tetapi respons ke Marketplace timeout;
- transaksi dibaca/retry setelah settlement parsial gagal;
- dua checkout bersamaan mencoba memakai saldo yang sama;
- penolakan toko dan refund dana campuran;
- hold melewati TTL;
- nominal alokasi tidak sama dengan total transaksi;
- frontend tidak membuka QRIS untuk pembayaran saldo penuh;
- frontend menampilkan QRIS hanya sebesar sisa pembayaran.

## Acceptance criteria

- Saldo penuh menyelesaikan pembayaran tanpa membuat QRIS.
- Saldo sebagian membuat QRIS hanya sebesar sisa tagihan.
- Status `payment_received` hanya tercapai setelah pembayaran wallet dan QRIS yang diperlukan sama-sama berhasil.
- Callback/retry berulang tidak mendebit atau mengembalikan saldo dua kali.
- Semua jalur gagal melepaskan hold atau meninggalkan data yang dapat direkonsiliasi.
- Refund mengembalikan dana sesuai sumber pembayaran.
- Notifikasi pembayaran tetap dipicu oleh perubahan status transaksi menjadi `payment_received`.
- Tidak ada secret atau data pribadi lengkap pada log.
- Fitur dapat dimatikan melalui feature flag hingga dinyatakan siap di staging.

## Definition of done

- Migration dan kontrak payload tersedia.
- Saldo penuh dan saldo sebagian berfungsi di staging.
- Hold/capture/release/refund idempoten.
- Rekonsiliasi dapat memperbaiki transaksi yang tertinggal.
- UI menampilkan alokasi pembayaran yang benar.
- Skenario pengujian minimum telah dijalankan.
- Dokumentasi konfigurasi dan prosedur troubleshooting diperbarui.
