# PRD: Balance, Refund Transaksi, Split Payment, dan Withdrawal

## 1. Ringkasan

Dokumen ini mendefinisikan kebutuhan produk dan acuan pembuatan issue untuk fitur saldo konsumen (`Balance`), pengembalian dana transaksi marketplace, pengembalian voucher, pembayaran menggunakan saldo atau gabungan saldo dan QRIS, serta penarikan saldo (`Withdrawal`).

Saldo disimpan dan dikelola oleh `core.loyalty.system` sebagai **source of truth**. Saldo hanya dapat dipakai untuk pembayaran di marketplace loyalty atau ditarik melalui proses withdrawal. Perubahan saldo wajib menggunakan ledger yang dapat diaudit dan tidak boleh hanya bergantung pada satu kolom saldo yang dapat ditimpa.

## 2. Latar Belakang

Saat ini belum ada prosedur baku apabila transaksi gagal setelah konsumen berhasil membayar, misalnya:

1. Kurir gagal mengambil atau mengirim barang.
2. Pesanan tidak dapat dipenuhi setelah pembayaran berhasil.
3. Konsumen mengajukan komplain dan hasil penyelesaian menyetujui refund.
4. Kondisi operasional lain yang mengharuskan dana dikembalikan.

Tanpa mekanisme refund yang konsisten, tim operasional berisiko melakukan pengembalian secara manual, voucher konsumen tidak otomatis kembali, dan rekonsiliasi keuangan sulit diaudit.

## 3. Tujuan Produk

1. Setiap konsumen memiliki saldo yang aman, konsisten, dan dapat diaudit.
2. Refund transaksi yang telah dibayar dapat dikreditkan ke saldo konsumen.
3. Nilai refund akibat kegagalan pengiriman dikurangi biaya kurir yang memang sudah terpakai dan tidak dapat dikembalikan.
4. Voucher yang digunakan pada transaksi gagal dikembalikan bila masih memenuhi aturan voucher.
5. Konsumen dapat mengajukan penarikan saldo.
6. Saldo hanya dapat digunakan sebagai alat pembayaran di marketplace loyalty.
7. Pembayaran marketplace mendukung saldo penuh atau split payment antara saldo dan QRIS.
8. Semua data saldo dan mutasinya berada di database `core.loyalty.system`.
9. Setiap pengajuan withdrawal mengirim email notifikasi kepada user CMS dengan `type=finance`.
10. Semua operasi finansial bersifat idempotent dan mempunyai audit trail.

## 4. Non-Goals

1. Membuat saldo menjadi uang elektronik yang dapat ditransfer antar-konsumen.
2. Menggunakan saldo untuk pembelian di luar marketplace loyalty.
3. Refund langsung ke metode pembayaran asal pada versi awal.
4. Otomatisasi transfer bank withdrawal pada versi awal; MVP menggunakan review dan penyelesaian oleh tim finance.
5. Mengubah proses klaim/komplain menjadi sistem dispute lengkap.
6. Mengubah perhitungan biaya kurir di marketplace core, selain menyediakan nilai biaya yang dapat direferensikan saat refund.

## 5. Struktur Sistem dan Dampak

| Folder | Fungsi | Dampak |
| --- | --- | --- |
| `core.loyalty.system` | Backend loyalty/proxy | **Scope utama.** Menjadi source of truth balance, ledger, refund, withdrawal, notifikasi, dan orkestrasi split payment. |
| `client.loyalty.system` | Frontend loyalty customer | **Scope utama.** Menampilkan saldo/mutasi, pemakaian saldo saat checkout, split QRIS, dan form/status withdrawal. |
| `cms.loyalty.system` | Frontend management loyalty | **Scope utama.** Review refund bila manual diperlukan serta review, approve/reject, dan penyelesaian withdrawal oleh finance. |
| `backend-mediacartz` | Backend marketplace/`MARKETPLACE_CORE` | **Kondisional.** Menyediakan status order, rincian pembayaran/voucher/ongkir, serta event/API kegagalan transaksi yang terautentikasi. |
| `frontend-mediacartz-react` | Frontend marketplace untuk backend marketplace | Di luar scope awal. |

## 6. Persona dan Hak Akses

| Persona | Kebutuhan | Hak utama |
| --- | --- | --- |
| Konsumen/member | Melihat, memakai, dan menarik saldo | Melihat saldo/mutasi sendiri, memakai saldo saat checkout, mengajukan withdrawal, melihat statusnya |
| Finance | Memproses withdrawal dan memantau refund | Melihat antrean, approve/reject, menandai pembayaran withdrawal, melihat audit trail |
| Customer Service/Operations | Menangani kegagalan transaksi/komplain | Mengajukan atau memicu refund sesuai kewenangan, melihat hasil refund |
| Sistem Marketplace Core | Memberi fakta status order dan komponen transaksi | Mengirim event atau melayani API verifikasi transaksi |
| System/Worker | Menjalankan proses asinkron | Retry event, rekonsiliasi, dan pengiriman email tanpa menggandakan transaksi finansial |

Role CMS final harus mengikuti skema otorisasi existing. Requirement minimum adalah user dengan `type=finance` menerima email withdrawal; akses halaman/action finance tetap wajib dilindungi authorization backend.

## 7. Prinsip Utama

1. **Ledger sebagai sumber audit.** Setiap credit, debit, hold, release, dan withdrawal dicatat sebagai mutasi immutable.
2. **Tidak boleh ada saldo negatif.** Debit hanya berhasil jika available balance mencukupi.
3. **Atomic.** Perubahan ledger, saldo materialized, dan status referensi dilakukan dalam satu database transaction.
4. **Idempotent.** Event/refund/payment/withdrawal yang sama tidak boleh memengaruhi saldo lebih dari sekali.
5. **Server authoritative.** Nominal refund, ongkir, voucher, saldo terpakai, dan sisa QRIS dihitung backend.
6. **Least privilege.** Member hanya mengakses data miliknya; action finansial CMS harus diaudit.
7. **Integer minor unit.** Nilai uang disimpan sebagai integer Rupiah, bukan floating point.

## 8. Terminologi Saldo

| Istilah | Definisi |
| --- | --- |
| Ledger balance | Jumlah bersih seluruh mutasi saldo yang sudah posted |
| Held balance | Saldo yang dicadangkan untuk checkout atau withdrawal dan belum selesai |
| Available balance | `ledger balance - held balance`; nilai yang boleh dipakai atau ditarik |
| Credit | Mutasi menambah saldo, misalnya refund |
| Debit | Mutasi mengurangi saldo, misalnya pembayaran marketplace atau withdrawal selesai |
| Hold | Reservasi saldo yang belum menjadi debit final |
| Release | Pelepasan hold karena proses batal, gagal, atau kedaluwarsa |

## 9. Scope Fungsional

### 9.1 Balance konsumen

1. Sistem membuat satu wallet aktif per member dan currency `IDR`.
2. Wallet dapat dibuat saat registrasi member atau secara lazy saat pertama kali digunakan.
3. Konsumen dapat melihat available balance dan daftar mutasi miliknya.
4. Riwayat mutasi mendukung pagination, rentang tanggal, serta tipe transaksi.
5. Saldo tidak dapat diedit langsung melalui UI atau query bisnis; koreksi manual harus menjadi ledger adjustment dengan alasan dan pelaku.
6. Nominal, identitas member, referensi transaksi, actor, timestamp, dan idempotency key tersimpan pada setiap mutasi.

### 9.2 Refund ke balance

Refund hanya dapat diproses untuk transaksi yang:

1. Dimiliki oleh member yang sesuai.
2. Telah terkonfirmasi paid/settled.
3. Berstatus eligible refund berdasarkan status marketplace dan keputusan komplain/operasional.
4. Belum pernah menerima refund penuh untuk komponen yang sama.

Alur target:

1. Marketplace Core atau petugas berwenang mengirim permintaan refund dengan transaction reference, reason, dan nilai biaya kurir yang tidak refundable.
2. `core.loyalty.system` mengambil snapshot transaksi dari Marketplace Core dan memverifikasi kepemilikan, status pembayaran, total dibayar, voucher, serta refund sebelumnya.
3. Sistem menghitung nilai maksimum refund di server.
4. Refund dibuat dengan status `pending` bila memerlukan approval, atau langsung `processing` bila berasal dari event tepercaya yang memenuhi rule auto-refund.
5. Dalam database transaction, sistem membuat ledger credit dan mengubah refund menjadi `completed`.
6. Voucher direstore secara idempotent bila eligible.
7. Konsumen dapat melihat mutasi refund dan status voucher yang dikembalikan.

Formula default untuk kegagalan pengiriman:

```text
refund_gross = nilai pembayaran yang eligible untuk dikembalikan
courier_deduction = biaya kurir aktual yang sudah terpakai dan non-refundable
refund_net = max(0, refund_gross - courier_deduction)
```

Ketentuan:

1. Potongan kurir tidak boleh melebihi biaya kurir pada transaksi atau bukti biaya aktual yang tervalidasi.
2. Jika kurir belum dibooking/tidak menimbulkan biaya, `courier_deduction = 0`.
3. Jika seluruh ongkir ditanggung voucher/subsidi dan tidak dibayar konsumen, potongan terhadap dana konsumen tidak boleh melebihi komponen yang benar-benar dibayar konsumen.
4. Rincian `refund_gross`, `courier_deduction`, `refund_net`, dan alasan harus terlihat di CMS dan detail refund konsumen.
5. Partial refund harus menyimpan komponen/item yang direfund dan akumulasi refund tidak boleh melebihi nilai eligible transaksi.

### 9.3 Pengembalian voucher

1. Voucher yang benar-benar sudah dikonsumsi oleh transaksi gagal dikembalikan satu kali.
2. Untuk voucher milik member, status penggunaan dikembalikan ke available melalui service lifecycle voucher, bukan update bebas dari controller.
3. Untuk global voucher, kuota/redemption dikompensasi melalui mekanisme yang idempotent.
4. Voucher yang dikembalikan menggunakan tanggal kedaluwarsa awal bila masih aktif.
5. Bila voucher sudah kedaluwarsa saat refund, kebijakan default MVP adalah mengembalikannya dengan masa berlaku kompensasi **7 hari sejak refund**. Nilai ini harus configurable dan memerlukan persetujuan bisnis sebelum implementasi.
6. Bila voucher dihentikan karena fraud/legal/administratif, refund dana tetap berjalan tetapi voucher tidak direstore; alasan wajib dicatat.
7. Kegagalan restore voucher tidak boleh menggandakan credit saldo. Sistem menandai refund `completed_with_warning` dan menyediakan retry voucher terpisah.

### 9.4 Pembayaran dengan balance dan split QRIS

Metode yang didukung:

1. **Balance penuh:** available balance lebih besar atau sama dengan total transaksi; QRIS tidak dibuat.
2. **Split balance + QRIS:** available balance lebih kecil dari total; seluruh available balance atau nominal yang dipilih konsumen di-hold, sisanya dibayar via QRIS.
3. **QRIS penuh:** konsumen memilih tidak memakai saldo atau saldo nol.

Rumus:

```text
balance_amount = min(nominal saldo yang dipilih, available_balance, transaction_total)
qris_amount = transaction_total - balance_amount
```

Alur split payment:

1. Checkout preview mengembalikan total server dan available balance terbaru.
2. Konsumen memilih `use_balance` dan mengonfirmasi ringkasan pembagian pembayaran.
3. Backend commit checkout membuat order dan hold saldo secara atomic/idempotent.
4. Jika `qris_amount > 0`, backend meminta QRIS hanya sebesar sisa pembayaran.
5. Jika QRIS sukses, hold saldo di-capture menjadi debit dan order ditandai paid.
6. Jika QRIS gagal/kedaluwarsa/dibatalkan, hold saldo di-release dan order tidak boleh dianggap paid.
7. Jika pembayaran saldo penuh, hold langsung di-capture setelah order berhasil dibuat.
8. Timeout komunikasi tidak boleh memicu debit/order ganda; status diperiksa menggunakan `client_request_id`/idempotency key yang sama.

Aturan tambahan:

1. Voucher dan diskon dihitung sebelum pembagian balance/QRIS.
2. Saldo bukan diskon dan tidak mengubah dasar pencatatan nilai transaksi.
3. Frontend tidak boleh mengirim available balance sebagai sumber kebenaran.
4. Hold checkout mempunyai expiry yang configurable dan direlease otomatis bila pembayaran QRIS tidak selesai.
5. Refund transaksi split dikreditkan ke balance konsumen sesuai nilai refund net, terlepas dari komposisi sumber pembayaran, sesuai tujuan produk versi awal.

### 9.5 Withdrawal

1. Konsumen dapat melihat available balance dan mengajukan withdrawal.
2. Form minimal berisi nominal, nama bank/e-wallet yang didukung, nomor rekening/akun, nama pemilik, dan konfirmasi.
3. Data tujuan withdrawal disimpan sebagai snapshot terenkripsi/masked; response UI hanya menampilkan nilai tersamarkan.
4. Backend memvalidasi saldo tersedia, minimum/maximum withdrawal, status member, dan request duplikat.
5. Saat request dibuat, nominal langsung di-hold agar tidak dapat dibelanjakan atau ditarik ulang.
6. Status withdrawal:

```text
pending_review -> approved -> processing -> completed
       |             |            |
       +----------> rejected <-----+
       +----------> cancelled (hanya sebelum processing, bila diizinkan)
```

7. `rejected` atau `cancelled` me-release hold.
8. `completed` meng-capture hold menjadi debit withdrawal.
9. Finance wajib mengisi reference pembayaran ketika menandai `completed`.
10. Setiap perubahan status menyimpan actor, waktu, alasan/catatan, dan before/after state.
11. Member tidak dapat mengubah data tujuan setelah request dibuat.
12. Biaya withdrawal, minimum, maksimum, SLA, serta daftar channel harus configurable. Default tidak boleh diasumsikan tanpa keputusan bisnis.

### 9.6 Email finance

1. Setelah withdrawal berhasil dibuat, sistem mencari seluruh user aktif CMS dengan `type=finance`.
2. Email dikirim asinkron agar kegagalan email tidak membatalkan hold/request withdrawal yang sudah sah.
3. Email minimal berisi withdrawal number, member identifier yang aman, nominal, waktu pengajuan, channel tujuan yang dimasking, dan tautan ke detail CMS.
4. Detail rekening penuh, token, password, atau credential tidak boleh dikirim melalui email.
5. Pengiriman memiliki delivery log, retry dengan batas, dan deduplication key per withdrawal/recipient/template.
6. Jika tidak ada user finance aktif atau seluruh email gagal, sistem membuat alert operasional; withdrawal tetap `pending_review`.

## 10. Status dan State Machine

### 10.1 Refund

| Status | Makna | Transisi valid |
| --- | --- | --- |
| `pending` | Menunggu validasi/approval | `processing`, `rejected` |
| `processing` | Sedang melakukan credit/restore voucher | `completed`, `completed_with_warning`, `failed` |
| `completed` | Credit dan restore voucher yang wajib berhasil | Terminal |
| `completed_with_warning` | Credit berhasil, pekerjaan non-finansial masih perlu retry | `completed` |
| `rejected` | Tidak eligible | Terminal |
| `failed` | Belum ada dampak finansial final atau perlu rekonsiliasi | `processing` melalui retry terkontrol |

### 10.2 Balance hold

| Status | Makna |
| --- | --- |
| `active` | Mengurangi available balance |
| `captured` | Sudah diubah menjadi ledger debit |
| `released` | Dikembalikan ke available balance |
| `expired` | Dilepas oleh worker karena melewati batas waktu |

### 10.3 Withdrawal

Transisi status hanya boleh melalui command backend yang eksplisit. Update status langsung dari frontend atau generic CRUD dilarang.

## 11. Data Model Usulan (`core.loyalty.system`)

Nama final menyesuaikan convention migration existing.

### `member_wallets`

| Field | Keterangan |
| --- | --- |
| `wallet_id` | PK |
| `member_id` | FK/logical FK, unique per currency |
| `currency` | Default `IDR` |
| `ledger_balance` | Materialized posted balance, integer |
| `held_balance` | Total hold aktif, integer |
| `status` | `active`, `suspended`, `closed` |
| `version` | Optimistic locking bila digunakan |
| timestamps | Audit waktu |

Constraint: unique `(member_id, currency)`, `ledger_balance >= 0`, `held_balance >= 0`, dan `held_balance <= ledger_balance`.

### `wallet_ledger_entries`

| Field | Keterangan |
| --- | --- |
| `ledger_entry_id` | PK |
| `wallet_id`, `member_id` | Pemilik |
| `direction` | `credit` atau `debit` |
| `type` | `refund`, `marketplace_payment`, `withdrawal`, `adjustment` |
| `amount` | Integer positif |
| `balance_before`, `balance_after` | Snapshot audit |
| `reference_type`, `reference_id` | Referensi refund/order/withdrawal |
| `idempotency_key` | Unique |
| `description`, `metadata` | Informasi aman/audit |
| `created_by_type`, `created_by_id` | system/member/admin |
| `posted_at` | Waktu efektif |

Ledger entry tidak boleh di-update atau dihapus. Koreksi dibuat sebagai reversal/adjustment baru.

### `wallet_holds`

Menyimpan `wallet_id`, `purpose`, `reference_id`, `amount`, `status`, `idempotency_key`, `expires_at`, `captured_at`, dan `released_at`.

### `transaction_refunds`

Menyimpan transaction reference marketplace, member, reason code, description, `refund_gross`, `courier_deduction`, `refund_net`, refund status, voucher restore status, snapshot transaksi, idempotency key, requester/approver, dan timestamps.

### `withdrawals`

Menyimpan withdrawal number, member/wallet/hold, nominal, fee, net transfer, channel, data rekening terenkripsi, masked destination, status, payment reference, reviewer/processor, notes, idempotency key, dan timestamps.

### `withdrawal_status_histories`

Menyimpan setiap perubahan status, actor, alasan, serta snapshot before/after.

### `notification_deliveries`

Menyimpan event reference, recipient, template, status, attempt count, last error, sent time, dan deduplication key. Bila proyek sudah memiliki outbox/delivery log yang setara, gunakan fasilitas existing.

## 12. Kontrak API Target

Path final mengikuti convention route existing dan dapat disesuaikan saat technical design.

### Member API

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| `GET` | `/api/v1/member/wallet` | Ringkasan balance dan held balance |
| `GET` | `/api/v1/member/wallet/transactions` | Riwayat mutasi |
| `POST` | `/api/v1/member/withdrawals` | Membuat request withdrawal |
| `GET` | `/api/v1/member/withdrawals` | Daftar withdrawal milik member |
| `GET` | `/api/v1/member/withdrawals/:id` | Detail milik member |
| `POST` | `/api/v1/member/withdrawals/:id/cancel` | Membatalkan jika status mengizinkan |
| `POST` | endpoint preview checkout existing | Mengembalikan split balance/QRIS hasil server |
| `POST` | endpoint commit checkout existing | Membuat hold/capture dan payment QRIS secara idempotent |

Contoh input pilihan pembayaran checkout:

```json
{
  "use_balance": true,
  "balance_amount": 50000,
  "remainder_payment_method": "QRIS",
  "client_request_id": "uuid-yang-sama-untuk-satu-attempt"
}
```

Backend boleh menurunkan `balance_amount` berdasarkan saldo/total terbaru, tetapi perubahan dari preview harus meminta konfirmasi ulang konsumen sebelum commit.

### CMS API

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| `GET` | `/api/v1/admin/refunds` | Daftar dan filter refund |
| `GET` | `/api/v1/admin/refunds/:id` | Detail dan audit refund |
| `POST` | `/api/v1/admin/refunds/:id/approve` | Approve refund manual |
| `POST` | `/api/v1/admin/refunds/:id/reject` | Reject dengan alasan |
| `GET` | `/api/v1/admin/withdrawals` | Antrean withdrawal |
| `GET` | `/api/v1/admin/withdrawals/:id` | Detail dan history |
| `POST` | `/api/v1/admin/withdrawals/:id/approve` | Approve |
| `POST` | `/api/v1/admin/withdrawals/:id/reject` | Reject dan release hold |
| `POST` | `/api/v1/admin/withdrawals/:id/process` | Tandai processing |
| `POST` | `/api/v1/admin/withdrawals/:id/complete` | Selesaikan dengan payment reference |

### System Integration API/Event

1. Endpoint/event refund harus menggunakan service credential/signature dan timestamp/nonce anti-replay.
2. Payload minimum: marketplace transaction ID/number, failure type, status, courier charge actual, event ID, occurred time, dan supporting metadata.
3. `event_id` atau kombinasi source/reference/type wajib unique untuk deduplikasi.
4. Core tetap mengambil data transaksi authoritative; tidak mempercayai nominal refund dari event tanpa verifikasi.

## 13. Functional Requirements dan Acceptance Criteria

| ID | Requirement | Prioritas | Acceptance Criteria ringkas |
| --- | --- | --- | --- |
| FR-BAL-01 | Wallet per member | Must | Satu wallet IDR aktif per member; request paralel tidak membuat duplikat |
| FR-BAL-02 | Saldo dan mutasi | Must | Member hanya melihat miliknya; balance sama dengan ledger posted dikurangi hold untuk nilai available |
| FR-BAL-03 | Atomic/idempotent ledger | Must | Retry dengan key sama menghasilkan efek finansial satu kali |
| FR-REF-01 | Refund transaksi eligible | Must | Hanya transaksi paid dan owned yang dapat direfund |
| FR-REF-02 | Potongan kurir | Must | Refund net dihitung server dan breakdown tersimpan/ditampilkan |
| FR-REF-03 | Partial/full refund ceiling | Must | Total refund tidak pernah melebihi nilai eligible |
| FR-VOU-01 | Restore voucher | Must | Voucher kembali satu kali; retry aman; alasan pengecualian tercatat |
| FR-PAY-01 | Pembayaran saldo penuh | Must | Total tercukupi saldo, order paid tanpa QRIS dan ledger terdebit satu kali |
| FR-PAY-02 | Split saldo + QRIS | Must | QRIS hanya sebesar remainder; saldo di-hold sampai QRIS sukses |
| FR-PAY-03 | Release hold | Must | QRIS gagal/expired me-release hold dan tidak menghasilkan debit |
| FR-WD-01 | Request withdrawal | Must | Saldo cukup di-hold, rekening dimasking, request tampil di CMS |
| FR-WD-02 | Workflow finance | Must | Hanya role berwenang melakukan transisi valid; semua action diaudit |
| FR-WD-03 | Complete/reject withdrawal | Must | Complete menghasilkan satu debit; reject/cancel menghasilkan satu release |
| FR-NOT-01 | Email finance | Must | Setiap withdrawal baru menghasilkan delivery per user finance aktif tanpa email duplikat |
| FR-REC-01 | Rekonsiliasi | Must | Job/report mendeteksi perbedaan wallet, hold, refund, payment, dan withdrawal |

## 14. Business Rules yang Harus Dikunci

1. Mata uang MVP adalah IDR.
2. Refund selalu masuk balance, bukan ke sumber pembayaran asal.
3. Refund akibat kegagalan pengiriman dikurangi biaya kurir aktual non-refundable.
4. Saldo dapat dipakai hanya pada checkout marketplace loyalty.
5. Split payment versi awal hanya `Balance + QRIS`; kombinasi dengan gateway lain di luar scope.
6. Withdrawal hanya dari available balance.
7. Nominal uang tidak menerima pecahan desimal untuk IDR.
8. Semua limit dan expiry disimpan sebagai konfigurasi server, bukan hardcoded frontend.
9. Manual adjustment memerlukan role khusus, reason, bukti/reference, dan audit trail; fitur UI adjustment dapat dipisah dari MVP.

## 15. Non-Functional Requirements

### Security

1. Authorization diperiksa pada setiap resource, bukan hanya autentikasi route.
2. Data rekening dienkripsi at rest dan dimasking pada log/response/email.
3. Webhook/event Marketplace Core memakai signature, timestamp tolerance, dan replay protection.
4. Endpoint finance memakai permission spesifik dan tidak cukup hanya mengandalkan tampilan menu CMS.
5. Rate limit diterapkan untuk checkout commit dan withdrawal.

### Reliability dan Consistency

1. Gunakan database transaction dan row locking/optimistic concurrency untuk perubahan wallet.
2. External call tidak boleh membuat database transaction lock menggantung lama; gunakan state machine/outbox/saga yang terukur.
3. Worker retry menggunakan exponential backoff dan idempotency key.
4. Tersedia rekonsiliasi harian dan endpoint/tool operasional untuk item `failed`/`completed_with_warning`.

### Observability

1. Log terstruktur memuat correlation ID, member ID internal, transaction/refund/withdrawal reference, dan status; tidak memuat data rekening penuh.
2. Metric minimum: refund count/value, courier deduction, voucher restore failure, held balance aging, QRIS split success rate, withdrawal aging, email failure, dan reconciliation mismatch.
3. Alert untuk ledger mismatch, saldo negatif, hold kedaluwarsa yang tidak terlepas, dan withdrawal melewati SLA.

### Performance

1. `GET wallet` p95 <= 1 detik pada kondisi normal.
2. Preview checkout p95 mengikuti target checkout existing dan tidak menambah lebih dari satu round trip yang tidak perlu.
3. Riwayat menggunakan pagination dan index pada member, waktu, status, serta reference.

## 16. UX Requirements

### Client loyalty

1. Balance tampil pada area akun dan checkout dengan format Rupiah.
2. Detail balance membedakan saldo tersedia dan saldo tertahan.
3. Mutasi menampilkan tipe, tanggal, reference, nominal credit/debit, dan status yang mudah dipahami.
4. Checkout menampilkan toggle pemakaian saldo, nominal saldo, nilai QRIS tersisa, dan perubahan total sebelum persetujuan.
5. Jika saldo berubah antara preview dan commit, frontend memperbarui breakdown dan meminta persetujuan ulang.
6. Withdrawal menampilkan limit/fee/net transfer/SLA sebelum konfirmasi.
7. Status withdrawal dan alasan reject terlihat oleh member tanpa mengekspos catatan internal.

### CMS loyalty

1. Dashboard/list withdrawal mendukung filter status, tanggal, nominal, withdrawal number, serta member.
2. Detail menampilkan data tujuan yang dimasking secara default, audit status, saldo/hold terkait, dan payment reference.
3. Action berisiko memerlukan confirmation modal dan alasan/reference wajib sesuai status.
4. Refund detail menampilkan komponen gross, potongan kurir, net refund, voucher restore, ledger reference, dan snapshot marketplace.
5. UI mencegah action ganda, tetapi backend tetap menjadi pelindung utama.

## 17. Skenario UAT Minimum

1. Member baru memperoleh wallet tunggal dengan saldo nol.
2. Refund kegagalan pengiriman tanpa biaya kurir mengkredit nilai eligible penuh.
3. Refund dengan biaya kurir mengkredit `gross - courier deduction` dan menampilkan breakdown.
4. Event refund yang dikirim dua kali hanya menghasilkan satu credit dan satu restore voucher.
5. Partial refund berulang tidak melampaui maksimum transaksi.
6. Voucher aktif kembali setelah transaksi gagal.
7. Voucher kedaluwarsa mengikuti kebijakan kompensasi yang sudah disetujui.
8. Saldo cukup membayar order penuh tanpa membuat QRIS.
9. Saldo kurang menghasilkan QRIS tepat sebesar sisa total.
10. QRIS split sukses meng-capture hold sekali dan order menjadi paid.
11. QRIS split expired/gagal me-release hold dan tidak mendebit saldo.
12. Dua checkout paralel tidak dapat membelanjakan saldo yang sama.
13. Withdrawal valid membuat hold dan mengirim notifikasi ke seluruh finance aktif.
14. Kegagalan email tidak membatalkan withdrawal; retry tidak menggandakan email sukses.
15. Withdrawal rejected/cancelled mengembalikan available balance.
16. Withdrawal completed mendebit saldo sekali meski action/API di-retry.
17. Member lain tidak dapat membaca wallet/refund/withdrawal yang bukan miliknya.
18. User CMS tanpa permission finance tidak dapat memproses withdrawal.
19. Rekonsiliasi mendeteksi data yang sengaja dibuat tidak konsisten pada environment test.
20. Data rekening tidak muncul utuh pada log, email, list, atau response yang tidak berwenang.

## 18. Edge Cases

1. Refund diterima ketika member/wallet suspended.
2. Refund dan withdrawal/checkout terjadi bersamaan.
3. Marketplace menyatakan gagal setelah QRIS sukses tetapi sebelum capture saldo terkonfirmasi.
4. QRIS sukses datang setelah hold dianggap expired.
5. Transaksi memakai voucher gratis ongkir dan kurir sudah menimbulkan biaya.
6. Voucher dihentikan atau partner tidak aktif saat refund.
7. Member mengganti email setelah withdrawal dibuat.
8. User finance tidak tersedia atau emailnya invalid.
9. Finance menekan complete dua kali atau dua finance memproses request bersamaan.
10. Nominal payment marketplace berubah setelah preview.

Setiap edge case harus mempunyai hasil deterministik dan dapat direkonsiliasi; implementasi tidak boleh memilih hasil berdasarkan urutan response frontend.

## 19. Analytics dan KPI

1. Persentase refund selesai tanpa intervensi manual.
2. Waktu rata-rata dari kegagalan transaksi ke saldo dikreditkan.
3. Persentase voucher restore berhasil.
4. Split payment initiation dan success rate.
5. Nilai saldo held dan aging hold.
6. Waktu rata-rata withdrawal dari request ke completed/rejected.
7. Jumlah reconciliation mismatch dan waktu penyelesaiannya.
8. Rasio retry/duplicate event yang berhasil dideduplikasi.

## 20. Rollout dan Migrasi

1. Tambahkan schema, service ledger, permission, dan feature flag tanpa mengaktifkan UI.
2. Backfill wallet saldo nol untuk member existing atau gunakan lazy creation yang terukur.
3. Aktifkan refund internal pada environment staging dan lakukan rekonsiliasi.
4. Aktifkan tampilan saldo dan riwayat secara read-only.
5. Aktifkan pembayaran balance penuh, lalu split QRIS setelah callback/expiry lulus pengujian.
6. Aktifkan withdrawal untuk kelompok internal/pilot, lalu rollout bertahap.
7. Sediakan kill switch untuk penggunaan saldo, split payment, auto-refund, dan withdrawal secara terpisah. Kill switch tidak boleh menghilangkan akses finance untuk menyelesaikan transaksi yang sudah berjalan.

## 21. Rencana Pemecahan Issue

Urutan berikut disarankan agar setiap issue dapat diuji dan tidak membuat fitur finansial setengah aktif.

### Epic A — Wallet foundation (`core.loyalty.system`)

1. Schema wallet, ledger, hold, constraint, dan index.
2. Wallet domain service: credit, hold, capture, release, reversal, idempotency, concurrency test.
3. Member API balance dan ledger history.
4. Audit log, metric, serta job rekonsiliasi wallet.

### Epic B — Refund dan voucher recovery

1. Schema/state machine refund dan reason code.
2. Marketplace transaction snapshot/verification adapter.
3. Refund calculation termasuk courier deduction dan partial refund ceiling.
4. Integrasi wallet credit secara atomic/idempotent.
5. Restore member voucher dan global voucher dengan retry terpisah.
6. CMS list/detail/approve/reject refund bila approval manual digunakan.
7. System event/API dari `backend-mediacartz` bila sumber kejadian belum tersedia.

### Epic C — Balance UI (`client.loyalty.system`)

1. Ringkasan saldo pada akun.
2. Halaman mutasi dengan pagination/filter.
3. Detail mutasi refund dan breakdown potongan kurir.

### Epic D — Marketplace payment dengan balance

1. Perluasan preview checkout untuk payment allocation.
2. Commit checkout dengan hold/capture/release serta idempotency.
3. Integrasi QRIS remainder dan callback/status mapping.
4. UI toggle balance dan breakdown split payment.
5. Worker expiry hold dan skenario late callback.
6. Rekonsiliasi order Marketplace Core vs ledger/payment.

### Epic E — Withdrawal

1. Schema withdrawal, encrypted destination, history, dan konfigurasi limit/fee.
2. Member API create/list/detail/cancel dan hold integration.
3. Email/outbox kepada user aktif `type=finance`.
4. CMS queue/detail serta action approve/reject/process/complete.
5. Client form, confirmation, list, dan status detail.
6. SLA metric, alert, dan reconciliation.

### Epic F — Security, QA, dan rollout

1. Permission matrix serta negative authorization tests.
2. Load/concurrency/idempotency tests.
3. Security review data rekening dan signed event.
4. Feature flags, migration/backfill, dashboard, runbook, serta rollback plan.

Setiap issue implementasi minimal harus memuat: repository terdampak, endpoint/schema yang berubah, rule idempotency, permission, acceptance criteria, test otomatis, observability, migration/rollback, dan dependency issue lain.

## 22. Dependency dan Keputusan Terbuka

Keputusan berikut wajib disetujui Product/Finance/Operations sebelum issue terkait masuk development:

1. Status marketplace apa saja yang otomatis eligible refund?
2. Siapa yang berhak memicu dan menyetujui refund, serta apakah four-eyes approval diperlukan?
3. Definisi biaya kurir non-refundable: quote, booking fee, atau biaya aktual dari provider?
4. Bagaimana kebijakan voucher yang kedaluwarsa pada saat refund? Usulan awal: kompensasi 7 hari.
5. Minimum, maksimum, biaya, SLA, dan channel withdrawal.
6. Apakah member boleh membatalkan withdrawal `pending_review`?
7. Apakah saldo refund mempunyai masa berlaku atau tidak? Usulan: tidak kedaluwarsa.
8. Apakah konsumen boleh memilih nominal saldo parsial meskipun saldo mencukupi? Usulan: boleh, dengan minimum remainder QRIS mengikuti gateway.
9. Apakah refund komplain barang dapat partial per item dan siapa yang menentukan nominalnya?
10. Apakah detail rekening dapat dibuka oleh finance tertentu atau selalu masked dengan proses terpisah?
11. Event/API apa yang sudah tersedia di `backend-mediacartz` untuk delivery failure, payment settled, dan voucher consumption?
12. Apakah regulasi, pajak, dan kebutuhan KYC membatasi fitur withdraw pada tipe saldo tertentu?

## 23. Definition of Done Produk

Fitur dinyatakan selesai apabila:

1. Seluruh requirement Must dan UAT minimum lulus.
2. Tidak ada jalur yang dapat membuat saldo negatif, double credit, double debit, atau double withdrawal.
3. Refund, voucher recovery, split payment, dan withdrawal dapat direkonsiliasi end-to-end.
4. Data sensitif terlindungi dan authorization telah diuji negatif.
5. Dashboard/alert dan runbook penanganan kegagalan tersedia.
6. Migration, feature flag, rollback, dan proses penyelesaian transaksi in-flight sudah diuji.
7. Keputusan bisnis pada bagian 22 yang memengaruhi implementasi telah terdokumentasi.

