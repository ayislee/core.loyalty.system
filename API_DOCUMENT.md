# API Document - Core Loyalty System

Dokumen ini disusun dari source code berikut:
- Route: `start/routes/*.js`
- Validator: `app/Validators/*.js`
- Controller: `app/Controllers/Http/**/*.js`
- Middleware custom: `app/Middleware/*.js`

## Aturan Dokumentasi (Agar Non-Asumsi)
- Semua field request diambil dari validator, middleware, atau field yang diakses langsung di controller (`request.all()` / `request.get()`).
- Semua contoh response memakai struktur JSON yang benar-benar dikembalikan kode saat ini.
- Jika response berasal dari service eksternal (`MARKETPLACE_CORE`) dan tidak di-shape ulang, ditulis sebagai `<MARKETPLACE_CORE response>`.
- Jika route ada tapi method/controller tidak ditemukan, ditandai sebagai **belum bisa didokumentasikan response faktual**.

## Format Error Umum Validator
Semua validator custom di project ini me-return pola yang sama:

```json
{
  "status": false,
  "message": "<pesan validasi pertama>"
}
```

---

## 1) System

### GET `/`
- Handler: inline function di `start/routes/index.js`
- Auth: tidak
- Payload: tidak ada
- Response sukses:

```text
welcome to Core Loyalty System
```

---

## 2) User Auth API
Prefix: `/api/v1/user/auth`

### POST `/api/v1/user/auth/register`
- Controller: `AuthController.user_register`
- Validator: `UserRegister`
- Body:
  - `firstname` (required, string)
  - `lastname` (required, string)
  - `phone` (required, msisdn)
  - `email` (required, email, unique)
  - `password` (required, string)
  - `type` (optional, in `partner|admin`)
- Contoh payload:

```json
{
  "firstname": "<string>",
  "lastname": "<string>",
  "phone": "<msisdn>",
  "email": "<email>",
  "password": "<string>",
  "type": "partner"
}
```

- Response sukses:

```json
{
  "status": true,
  "message": "User created"
}
```

- Response gagal (catch):

```json
{
  "status": false,
  "message": "Something wrong"
}
```

### POST `/api/v1/user/auth/login`
- Controller: `AuthController.user_login`
- Validator: `UserLogin`
- Body:
  - `email` (required, email, exists di `users.email`)
  - `password` (required, string)
- Contoh payload:

```json
{
  "email": "<email>",
  "password": "<string>"
}
```

- Response sukses:

```json
{
  "status": true,
  "data": "<hasil auth.attempt + field user>"
}
```

- Response gagal (HTTP 400):

```json
{
  "status": false,
  "message": "user not active"
}
```

atau

```json
{
  "status": false,
  "message": "invalid email or password"
}
```

---

## 3) Member Auth API
Prefix: `/api/v1/member/auth`

### POST `/api/v1/member/auth/request/token`
- Controller: `AuthController.request_token`
- Middleware: `PhoneOrEmail`, `ConvertPhone`
- Validator: `lid`
- Body minimal:
  - `lid` (phone/email)
- Field turunan middleware:
  - `lid_type` (`phone|email`)
  - `phone` / `email`
- Contoh payload:

```json
{
  "lid": "<phone atau email>"
}
```

- Response sukses:

```json
{
  "status": true,
  "message": "Token already send valid in <TOKEN_VALIDITY_PERIODE> minute(s)"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "You not registered"
}
```

### POST `/api/v1/member/auth/login/token`
- Controller: `AuthController.login_token`
- Middleware: `PhoneOrEmail`, `ConvertPhone`
- Validator: `lid`, `Token`
- Body minimal:
  - `lid`
  - `token` (6 digit)
- Contoh payload:

```json
{
  "lid": "<phone atau email>",
  "token": "123456"
}
```

- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<token auth + user + partner_id + partner{primary_color,primary_color_hover}>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "token expired"
}
```

atau

```json
{
  "status": false,
  "message": "invalid token"
}
```

---

## 4) Admin Users API
Prefix: `/api/v1/admin/users`
Middleware group: `auth:jwt`

### GET `/api/v1/admin/users/`
- Controller: `UserController.gets`
- Validator: `Pages`
- Query:
  - `page` (required, number)
  - `rows` (required, number)
  - `filter` (optional)
  - `order` (optional)
- Contoh query:

```json
{
  "page": "<number>",
  "rows": "<number>",
  "filter": "<optional>",
  "order": "<optional>"
}
```

- Response sukses:

```json
{
  "status": true,
  "data": "<hasil paginate users>"
}
```

### GET `/api/v1/admin/users/get`
- Controller: `UserController.get`
- Validator: `UserID`
- Query: `user_id` (required, exists)
- Contoh query:

```json
{
  "user_id": "<number>"
}
```

- Response sukses:

```json
{
  "status": true,
  "data": "<user object atau null>"
}
```

### GET `/api/v1/admin/users/all`
- Route ke `UserController.all`
- **Catatan faktual:** method `all` tidak ada di `UserController.js`.
- Response tidak dapat didokumentasikan faktual dari source saat ini.

### POST `/api/v1/admin/users/`
- Controller: `UserController.create`
- Validator: `User`
- Body:
  - `email` (required, email, unique)
  - `firstname` (required)
  - `lastname` (required)
  - `phone` (required, msisdn)
  - `password` (required)
- Contoh payload:

```json
{
  "email": "<email>",
  "firstname": "<string>",
  "lastname": "<string>",
  "phone": "<msisdn>",
  "password": "<string>"
}
```

- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<user object>"
}
```

- Response gagal (logic non-admin):

```json
{
  "status": false,
  "message": "Need create Partner first"
}
```

atau

```json
{
  "status": false,
  "message": "You not have authorize for this action"
}
```

atau

```json
{
  "status": false,
  "message": "something error"
}
```

### PUT `/api/v1/admin/users/`
- Controller: `UserController.edit`
- Middleware: `IsUserEdit`, `IsEmailUsed`
- Validator: `UserID`, `UserEdit`
- Body:
  - `user_id` (required, exists)
  - `email` (required)
  - `firstname` (required)
  - `lastname` (required)
  - `phone` (required)
  - `status` (optional, `active|not active`)
- Contoh payload:

```json
{
  "user_id": "<number>",
  "email": "<email>",
  "firstname": "<string>",
  "lastname": "<string>",
  "phone": "<msisdn>",
  "status": "active"
}
```

- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<user object>"
}
```

- Response gagal middleware:

```json
{
  "status": false,
  "message": "email already used"
}
```

atau

```json
{
  "status": false,
  "message": "You cant edit this account"
}
```

atau

```json
{
  "status": false,
  "message": "You cant edit other account"
}
```

### POST `/api/v1/admin/users/partner`
- Controller: `UserController.create_user_partner`
- Middleware: `isAdmin`, `PartnerOnly`
- Validator: `UserID`, `PartnerID`
- Body:
  - `user_id` (required)
  - `partner_id` (required)
- Contoh payload:

```json
{
  "user_id": "<number>",
  "partner_id": "<number>"
}
```

- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<user_partner object>"
}
```

- Response gagal middleware:

```json
{
  "status": false,
  "message": "you not have authorize"
}
```

atau

```json
{
  "status": false,
  "message": "Only user type partner only"
}
```

---

## 5) Admin Partner API
Prefix: `/api/v1/admin/partner`
Middleware group: `auth:jwt`

### GET `/api/v1/admin/partner/`
- Controller: `PartnerController.gets`
- Query yang dipakai: `page`, `rows`, `filter`, `order`
- Contoh query:

```json
{
  "page": "<number>",
  "rows": "<number>"
}
```

- Response:

```json
{
  "status": true,
  "data": "<paginate partners>"
}
```

### GET `/api/v1/admin/partner/get`
- Controller: `PartnerController.get`
- Validator: `PartnerID`
- Query: `partner_id`
- Response:

```json
{
  "status": true,
  "data": "<partner object atau null>"
}
```

### POST `/api/v1/admin/partner/`
- Controller: `PartnerController.create`
- Validator: `Partner`
- Body:
  - `name` (required)
  - `desc` (optional)
  - `howtogetpoint` (optional)
  - `logo` (optional)
- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<partner object>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "something error"
}
```

atau

```json
{
  "status": false,
  "message": "You cant create more partner"
}
```

atau

```json
{
  "status": false,
  "message": "You not have credential for this action"
}
```

### PUT `/api/v1/admin/partner/`
- Controller: `PartnerController.edit`
- Middleware: `HasPartner`
- Validator: `Partner`, `PartnerID`
- Body:
  - `partner_id` (required)
  - `name` (required)
  - `desc` (optional)
  - `howtogetpoint` (optional)
  - `logo` (optional)
- Response:

```json
{
  "status": true,
  "message": "success",
  "data": "<partner object>"
}
```

---

## 6) Admin Voucher API
Prefix: `/api/v1/admin/vouchers`
Middleware group: `auth:jwt`

### GET `/api/v1/admin/vouchers/`
- Controller: `VoucherController.gets`
- Validator: `Pages`
- Query: `page`, `rows`, optional `filter`, `order`
- Response:

```json
{
  "status": true,
  "data": "<paginate vouchers>"
}
```

- Response khusus partner tanpa partner_id:

```json
{
  "status": true,
  "data": {
    "total": 0,
    "perPage": "<rows>",
    "page": 1,
    "lastPage": 0
  }
}
```

### GET `/api/v1/admin/vouchers/get`
- Controller: `VoucherController.get`
- Validator: `VoucherID`
- Query: `voucher_id`
- Response:

```json
{
  "status": true,
  "data": "<voucher object atau null>"
}
```

### POST `/api/v1/admin/vouchers/`
- Controller: `VoucherController.create`
- Validator: `PartnerID`, `Voucher`
- Body:
  - `partner_id` (required validator; dapat dioverride middleware pada role non-admin)
  - `name` (required)
  - `product_image` (required)
  - `voucher_image` (required)
  - `status` (required: `active|not active`)
  - `description` (required)
  - `duration` (required, number)
  - `type` (required: `free|amount`)
  - `sku` (dipakai controller)
  - `number_point` (dipakai controller)
- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<voucher object>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "You cant create Voucher"
}
```

### PUT `/api/v1/admin/vouchers/`
- Controller: `VoucherController.edit`
- Middleware: `HasPartner`, `ValidateVoucher`
- Validator: `VoucherID`, `PartnerID`, `Voucher`
- Body minimal: `voucher_id` + field voucher yang akan diubah
- Response:

```json
{
  "status": true,
  "message": "success",
  "data": "<voucher object>"
}
```

---

## 7) Admin Get Point API
Prefix: `/api/v1/admin/getpoints`
Middleware group: `auth:jwt`

### GET `/api/v1/admin/getpoints/`
- Controller: `GetPointController.gets`
- Validator: `Pages`
- Query: `page`, `rows`, optional `filter`, `order`
- Response:

```json
{
  "status": true,
  "data": "<paginate get_points>"
}
```

### GET `/api/v1/admin/getpoints/get`
- Controller: `GetPointController.get`
- Validator: `GetPointID`
- Query: `get_point_id`
- Response:

```json
{
  "status": true,
  "data": "<get_point object atau null>"
}
```

### POST `/api/v1/admin/getpoints/`
- Controller: `GetPointController.create`
- Middleware: `HasPartner`
- Validator: `GetPoint`, `PartnerID`
- Body:
  - `partner_id`
  - `name`
  - `code` (3 karakter)
  - `point_receive` (number)
  - `desc`
- Response sukses:

```json
{
  "status": true,
  "message": "success"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "code <code> already defined"
}
```

### PUT `/api/v1/admin/getpoints/`
- Controller: `GetPointController.edit`
- Middleware: `HasPartner`
- Validator: `GetPoint`, `GetPointID`
- Body:
  - `get_point_id`
  - `partner_id` (dipakai untuk validasi role non-admin)
  - `name`
  - `code`
  - `point_receive`
  - `desc`
- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<get_point object>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "invalid command"
}
```

atau

```json
{
  "status": false,
  "message": "something wrong"
}
```

---

## 8) Admin Redeem Merchant API
Prefix: `/api/v1/admin/redeem_merchant`
Middleware group: `auth:jwt`

### GET `/api/v1/admin/redeem_merchant/`
- Controller: `RedeemMerchantController.gets`
- Middleware route-level: `FilterPartner` (no-op di source saat ini)
- Validator: `Pages`
- Query: `page`, `rows`
- Response:

```json
{
  "status": true,
  "data": "<paginate redeem_merchants>"
}
```

### GET `/api/v1/admin/redeem_merchant/get`
- Controller: `RedeemMerchantController.get`
- Middleware route-level: `FilterPartner`
- Validator: `RedeemMID`
- Query: `redeem_merchant_id`
- Response:

```json
{
  "status": true,
  "data": "<redeem_merchant object atau null>"
}
```

### POST `/api/v1/admin/redeem_merchant/`
- Controller: `RedeemMerchantController.create`
- Middleware: `HasPartner`
- Validator: `RedeemMerchant`
- Body:
  - `name` (required)
  - `address` (required)
  - `lat` (optional)
  - `long` (optional)
  - `phone` (optional, msisdn)
  - `store_id` (dipakai controller)
  - `partner_id` (diinject oleh `HasPartner` untuk non-admin)
- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<redeem_merchant object>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "<error.code>"
}
```

### PUT `/api/v1/admin/redeem_merchant/`
- Controller: `RedeemMerchantController.edit`
- Middleware: `HasPartner`
- Validator: `RedeemMID`, `RedeemMerchant`
- Body minimal:
  - `redeem_merchant_id`
  - optional: `name`, `address`, `phone`, `lat`, `long`, `store_id`
- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<redeem_merchant object>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "<error.code>"
}
```

---

## 9) Merchant API
Prefix: `/api/v1/merchant`
Middleware group: `AuthMerchant` (wajib `sid` + `cid`, dan inject `partner_id`)

### POST `/api/v1/merchant/member/register`
- Controller: `MemberController.register`
- Middleware route-level: `PhoneOrEmail`
- Validator: `lid`
- Body minimal:
  - `sid` (required oleh `AuthMerchant`)
  - `cid` (required oleh `AuthMerchant`)
  - `lid` (phone/email)
- Field turunan middleware: `lid_type`, `phone`/`email`
- Response sukses:

```json
{
  "status": true,
  "message": "success",
  "data": "<token auth token-guard + user + partner>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "something wrong"
}
```

atau middleware:

```json
{
  "status": false,
  "message": "sid is required"
}
```

```json
{
  "status": false,
  "message": "cid is required"
}
```

```json
{
  "status": false,
  "message": "invalid partner"
}
```

### POST `/api/v1/merchant/member/sendpoint`
- Controller: `MemberController.sendpoint`
- Middleware route-level: `PhoneOrEmail`
- Validator: `lid`, `Point`
- Body:
  - `sid`, `cid`
  - `lid`
  - `point` (required number)
  - `description` (required)
  - `partner_id` (diinject middleware AuthMerchant)
- Response sukses:

```json
{
  "status": true,
  "message": "has been added to the queue"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "member not found"
}
```

### GET `/api/v1/merchant/member/getpoint`
- Controller: `MemberController.getpoint`
- Middleware route-level: `ConvertPhone`
- Validator route: `PhoneEmail`
- **Catatan faktual:** validator `PhoneEmail` tidak ditemukan di `app/Validators`, dan isi method `getpoint` saat ini memiliki bug reference (`member` tidak didefinisikan).
- Response tidak stabil/belum bisa didokumentasikan faktual.

### GET `/api/v1/merchant/member/getvoucher`
- Controller: `MemberController.getvoucher`
- Validator: `Code`
- Query/Body:
  - `sid` (dipakai decrypt key)
  - `code` (required)
- Response sukses:

```json
{
  "status": true,
  "data": "<member_voucher + voucher + member>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "invalid voucher"
}
```

### POST `/api/v1/merchant/member/voucher/exchange`
- Controller: `MemberController.voucher_exchange`
- Validator: tidak ada
- Body:
  - `sid`, `cid`
  - `member_voucher_id`
  - `store_id`
  - `note` (optional)
  - `partner_id` (inject middleware)
- Response sukses:

```json
{
  "status": true,
  "message": "success"
}
```

- Response gagal:

```json
{
  "status": true,
  "message": "invalid voucher"
}
```

atau

```json
{
  "status": false,
  "message": "invalid store"
}
```

atau

```json
{
  "status": false,
  "message": "something error"
}
```

### POST `/api/v1/merchant/member/request/auth`
- Controller: `MemberController.request_auth`
- Validator: `EmailExists`
- Body:
  - `sid`, `cid`
  - `email` (must exists di members.email)
  - `partner_id` (inject middleware)
- Response sukses:

```json
{
  "status": true,
  "data": "<token auth token-guard>",
  "member": "<member object>"
}
```

---

## 10) Member API
Prefix: `/api/v1/member`
Middleware group: `auth:phone`, `auth:email`

### GET `/api/v1/member/profile`
- Controller: `MemberController.profile`
- Response:

```json
{
  "status": true,
  "data": "<member + point + member_voucher(active,not expired)>"
}
```

### PUT `/api/v1/member/profile`
- Controller: `MemberController.profile_update`
- Validator: `MemberID`
- Body:
  - `member_id` (required by validator)
  - optional: `email`, `firstname`, `lastname`, `image_profile`
- Response:

```json
{
  "status": true,
  "message": "success",
  "data": "<member object>"
}
```

### GET `/api/v1/member/points`
- Controller: `MemberController.points`
- Validator: `Pages`
- Query: `page`, `rows`, optional `filter`, `order`
- Response:

```json
{
  "status": true,
  "data": "<paginate point_histories>"
}
```

### GET `/api/v1/member/vouchers`
- Controller: `MemberController.vouchers`
- Validator: `Pages`
- Response:

```json
{
  "status": true,
  "data": "<paginate vouchers status=active>"
}
```

### POST `/api/v1/member/redeem`
- Controller: `MemberController.redeem`
- Validator: `VoucherID`
- Body: `voucher_id`
- Response sukses:

```json
{
  "status": true,
  "message": "has been added to the queue"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "Yout point not enough"
}
```

atau

```json
{
  "status": false,
  "message": "invalid voucher"
}
```

### GET `/api/v1/member/redeem/voucher`
- Controller: `MemberController.redeem_voucher`
- Validator: `Pages`
- Query: `page`, `rows`
- Response:

```json
{
  "status": true,
  "data": "<paginate member_vouchers (used=0, not expired)>"
}
```

### GET `/api/v1/member/partner`
- Controller: `PartnerController.all`
- Validator: `Pages`
- Query: `page`, `rows`, optional filter/order
- Response:

```json
{
  "status": true,
  "data": "<paginate partner summary>"
}
```

### GET `/api/v1/member/partner/detail`
- Controller: `PartnerController.detail`
- Validator: `PartnerID`
- Query: `partner_id`
- Response:

```json
{
  "status": true,
  "data": "<partner summary object>"
}
```

### GET `/api/v1/member/company/cashier`
- Controller: `ProductController.cashier`
- Query: tidak ada
- Response sukses:

```json
{
  "status": true,
  "data": "<cashier pertama atau null>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "invalid partner_id"
}
```

atau

```json
{
  "status": false,
  "message": "<error dari marketplace/error.message>"
}
```

### GET `/api/v1/member/store`
- Controller: `ProductController.store`
- Validator: `PartnerID`
- Query: `partner_id`
- Response:

```json
{
  "status": true,
  "data": "<store list dari marketplace>"
}
```

### GET `/api/v1/member/store/get`
- Controller: `ProductController.store_get`
- Query: tidak ada
- Response:

```json
{
  "status": true,
  "data": "<store detail dari marketplace>"
}
```

- Gagal:

```json
{
  "status": false,
  "message": "<res.data.error>"
}
```

atau

```json
{
  "status": false,
  "data": "<error.message>"
}
```

### GET `/api/v1/member/product`
- Controller: `ProductController.list`
- Response:

```json
{
  "status": true,
  "data": "<menu list dari marketplace>"
}
```

### GET `/api/v1/member/product/get`
- Controller: `ProductController.get`
- Query: `slug`
- Response:

```json
{
  "status": true,
  "data": "<menu detail dari marketplace>"
}
```

### GET `/api/v1/member/cart`
- Controller: `CartController.list`
- Validator: `Pages`
- Query validator: `page`, `rows` (meski controller tidak pakai paginasi)
- Response:

```json
{
  "status": true,
  "data": "<array group by store_slug: [{store_slug,store_name,items:[...]}]>"
}
```

### GET `/api/v1/member/cart/get`
- Controller: `CartController.get`
- Validator: `CartID`
- Query: `cart_id`
- Response:

```json
{
  "status": true,
  "data": "<cart object atau null>"
}
```

### POST `/api/v1/member/cart`
- Controller: `CartController.create`
- Validator: tidak ada
- Body yang dipakai:
  - `item_id`
  - `item_name`
  - `quantity`
  - `note` (optional)
  - `item_image` (optional)
  - `menu_slug` (optional)
  - `store_slug` (optional)
  - `store_name` (optional)
- Response sukses:

```json
{
  "status": true,
  "message": "success"
}
```

- Gagal:

```json
{
  "status": false,
  "message": "<error.message>"
}
```

### PUT `/api/v1/member/cart`
- Controller: `CartController.edit`
- Validator: `CartID`
- Body minimal: `cart_id`, field lain opsional
- Response:

```json
{
  "status": true,
  "message": "success"
}
```

### DELETE `/api/v1/member/cart`
- Controller: `CartController.delete`
- Validator: `CartID`
- Body/Query: `cart_id`
- Response:

```json
{
  "status": true,
  "message": "success"
}
```

### GET `/api/v1/member/transaction`
- Controller: `TransactionController.list`
- Validator: `Pages`
- Query: `page`, `rows`, dan parameter lain akan di-forward
- Response sukses:

```json
{
  "status": true,
  "data": "<MARKETPLACE_CORE response>"
}
```

- Atau passthrough langsung `res.data` saat `success=false`.

### GET `/api/v1/member/transaction/get`
- Controller: `TransactionController.get`
- **Catatan faktual:** method kosong (belum implementasi, tidak ada return response).

### POST `/api/v1/member/transaction`
- Controller: `TransactionController.create`
- Validator: tidak ada
- Body yang dipakai:
  - `item`
  - `store_id`
  - `voucher_code` (optional)
  - `ms_delivery_id`
  - `preview_fee`
  - `shipping_destination`
  - `shipping_destination_address`
  - `shipping_service`
  - `pickup_date`
- Response saat `preview_fee` true:

```json
<MARKETPLACE_CORE response>
```

- Response sukses normal:

```json
{
  "status": true,
  "data": "<res.data.data>",
  "token": "<res.data.token>"
}
```

- Response gagal:

```json
{
  "status": false,
  "message": "invalid cashier id"
}
```

atau

```json
{
  "status": false,
  "message": "<cashier.data.error atau res.data.error atau error.message>"
}
```

### PUT `/api/v1/member/transaction/resume`
- Controller: `TransactionController.resume`
- Validator: tidak ada
- Body: di-forward penuh ke marketplace
- Response sukses:

```json
{
  "status": true,
  "data": "<MARKETPLACE_CORE response>"
}
```

- Response gagal:

```json
{
  "status": false,
  "data": "<MARKETPLACE_CORE response>"
}
```

- Catatan: pada blok `catch`, controller memanggil `response.data(...)` (bukan `response.json(...)`).

### GET `/api/v1/member/master/province`
- Controller: `MasterController.province`
- Response sukses:

```json
{
  "status": true,
  "data": "<res.data.data>"
}
```

- Gagal:

```json
{
  "status": false,
  "message": "<res.data.error atau error.message>"
}
```

### GET `/api/v1/member/master/city`
- Controller: `MasterController.city`
- Query: `province_id`
- Response pola sama dengan endpoint province.

### GET `/api/v1/member/master/payment`
- Controller: `MasterController.payment`
- Response pola sama (`status`, `data` / `message`).

### GET `/api/v1/member/master/delivery`
- Controller: `MasterController.delivery`
- Response pola sama (`status`, `data` / `message`).

### GET `/api/v1/member/address`
- Controller: `AddressController.list`
- Setiap object address di response mencakup field `coordinate` (nullable).
- Response sukses:

```json
{
  "status": true,
  "data": "<address collection>"
}
```

- Gagal:

```json
{
  "status": false,
  "data": "<error.message>"
}
```

### GET `/api/v1/member/address/get`
- Controller: `AddressController.get`
- Body/Query: `address_id`
- Object address di response mencakup field `coordinate` (nullable).
- Response:

```json
{
  "status": true,
  "data": "<address object atau null>"
}
```

### POST `/api/v1/member/address`
- Controller: `AddressController.create`
- Body:
  - `address_name`
  - `full_address`
  - `coordinate` (opsional, format `latitude,longitude`)
- Catatan implementasi:
  - Endpoint belum memakai validator route khusus.
  - Error selain limit alamat belum ditangani eksplisit di method `create` (dapat mengikuti error default framework, misalnya HTTP 500).
- Response sukses:

```json
{
  "status": true,
  "message": "success"
}
```

- Gagal limit alamat:

```json
{
  "status": false,
  "message": "Kamu sudah memiliki 5 alamat"
}
```

### PUT `/api/v1/member/address`
- Controller: `AddressController.edit`
- Body/Query minimal: `address_id` + field opsional lain (`address_name`, `full_address`, `coordinate`)
- Response sukses:

```json
{
  "status": true,
  "message": "success"
}
```

- Gagal:

```json
{
  "status": false,
  "message": "<error.message>"
}
```

### DELETE `/api/v1/member/address`
- Controller: `AddressController.delete`
- Body/Query: `address_id`
- Response sukses:

```json
{
  "status": true,
  "message": "success"
}
```

- Gagal:

```json
{
  "status": false,
  "message": "<error.message>"
}
```

### GET `/api/v1/member/shipping/cost`
- Controller: `ShippingController.get`
- Query:
  - `store_id`
  - `destination`
- Response sukses:

```json
{
  "status": true,
  "data": "<res.data.data>"
}
```

- Gagal:

```json
{
  "status": false,
  "message": "<res.data.message atau error.message>"
}
```

### GET `/api/v1/member/auth`
- Controller: `MemberController.auth`
- Response:

```json
{
  "status": true,
  "data": "<auth.user + partner{primary_color,primary_color_hover}>"
}
```

### Catatan route duplicate
- `GET /api/v1/member/master/payment` dideklarasikan **2 kali** di `start/routes/member.js`.

---

## 11) Admin Member API
Prefix: `/api/v1/admin/member`
Middleware group: `auth:jwt`

### GET `/api/v1/admin/member/`
- Controller: `MemberController.gets`
- Validator: `Pages`
- Query: `page`, `rows`, optional `filter`, `order`
- Response:

```json
{
  "status": true,
  "data": "<paginate members>"
}
```

### GET `/api/v1/admin/member/get`
- Controller: `MemberController.get`
- Validator: `MemberID`
- Query: `member_id`
- Response:

```json
{
  "status": true,
  "data": "<member object atau null>"
}
```

### GET `/api/v1/admin/member/points`
- Controller: `MemberController.member_points`
- Validator: `MemberID`, `Pages`
- Query: `member_id`, `page`, `rows`
- Response:

```json
{
  "status": true,
  "data": "<paginate point_history + total_point>"
}
```

### GET `/api/v1/admin/member/vouchers`
- Controller: `MemberController.member_vouchers`
- Validator: `MemberID`, `Pages`
- Query: `member_id`, `page`, `rows`
- Response:

```json
{
  "status": true,
  "data": "<paginate member_vouchers>"
}
```

---

## 12) Admin Dashboard API
Prefix: `/api/v1/admin/dashboard`
Middleware group: `auth:jwt`

### GET `/api/v1/admin/dashboard/stats`
- Controller: `DashboardController.stats`
- Response:

```json
{
  "status": true,
  "data": {
    "total_members": "<number>",
    "total_points": "<number>",
    "total_vouchers": "<number>",
    "total_transactions": "<number>"
  }
}
```

### GET `/api/v1/admin/dashboard/recent-members`
- Controller: `DashboardController.recentMembers`
- Response:

```json
{
  "status": true,
  "data": "<5 member terbaru>"
}
```

### GET `/api/v1/admin/dashboard/point-history`
- Controller: `DashboardController.pointHistory`
- Response:

```json
{
  "status": true,
  "data": "<10 point history terbaru + relation member>"
}
```

### GET `/api/v1/admin/dashboard/voucher-usage`
- Controller: `DashboardController.voucherUsage`
- Response:

```json
{
  "status": true,
  "data": "<10 member_voucher terbaru + relation voucher/member>"
}
```

### GET `/api/v1/admin/dashboard/transactions`
- Controller: `DashboardController.transactions`
- Response:

```json
{
  "status": true,
  "data": "<10 transaction terbaru + relation member>"
}
```

---

## 13) Public API
Prefix: `/api/v1/public`

### GET `/api/v1/public/store`
- Controller: `ProductController.publicStore`
- Query:
  - `company_slug` (optional jika `DEFAULT_COMPANY_SLUG` ada)
- Response sukses:

```json
{
  "status": true,
  "data": "<store list>"
}
```

- Response gagal validasi (HTTP 400):

```json
{
  "status": false,
  "message": "company_slug is required"
}
```

### GET `/api/v1/public/product`
- Controller: `ProductController.publicProduct`
- Query:
  - `store_slug` (opsional)
  - `company_slug` (dipakai jika `store_slug` tidak ada)
- Response sukses:

```json
{
  "status": true,
  "data": "<menu list>"
}
```

- Response gagal validasi (HTTP 400):

```json
{
  "status": false,
  "message": "store_slug or company_slug is required"
}
```

- Response gagal lain:

```json
{
  "status": false,
  "message": "Store tidak ditemukan"
}
```

### GET `/api/v1/public/product/detail`
- Controller: `ProductController.publicProductDetail`
- Query/Body: `slug` (required)
- Response sukses:

```json
{
  "status": true,
  "data": "<product detail + review_summary{average,total}>"
}
```

- Response gagal validasi (HTTP 400):

```json
{
  "status": false,
  "message": "slug is required"
}
```

### GET `/api/v1/public/product/review`
- Controller: `ProductController.publicProductReview`
- Query: `item_id` (required)
- Response sukses:

```json
{
  "status": true,
  "data": {
    "reviews": "<array review>",
    "average": "<number>",
    "total": "<number>"
  }
}
```

- Response gagal validasi (HTTP 400):

```json
{
  "status": false,
  "message": "item_id is required"
}
```

### GET `/api/v1/public/banners`
- Route ke `BannerController.public_get`
- **Catatan faktual:** file controller tidak ditemukan di source saat ini.

---

## 14) Livechat API
Prefix: `/api/v1/livechat`

### POST `/api/v1/livechat/`
- Route ke `LivechatController.PostMessage`
- Middleware: `auth`
- **Catatan faktual:** controller tidak ditemukan.

### GET `/api/v1/livechat/`
- Route ke `LivechatController.GetMessages`
- **Catatan faktual:** controller tidak ditemukan.

---

## 15) Premium API
Prefix: `/api/v1/premium`

### POST `/api/v1/premium/send`
- Route ke `PremiumController.PostMessage`
- Middleware: `auth`
- Validator: `message`
- Body validator: `message` required
- **Catatan faktual:** controller tidak ditemukan.

---

## 16) Test API (Development Only)
Prefix: `/api/v1/test`
Aktif hanya saat `NODE_ENV=development`.

### GET `/api/v1/test/`
- Controller: `Test/TestController.test`
- Response di code:

```json
"<ciphertext>"
```

- Catatan: method memakai `CryptoJS` tanpa import di file tersebut, sehingga berpotensi error runtime.

---

## 17) Ringkasan Route Yang Belum Fully Implemented
1. `GET /api/v1/admin/users/all` -> `UserController.all` tidak ada.
2. `GET /api/v1/member/transaction/get` -> method controller kosong.
3. `GET /api/v1/merchant/member/getpoint` -> validator `PhoneEmail` tidak ditemukan dan method mengandung bug reference.
4. `GET /api/v1/public/banners` -> `BannerController` tidak ditemukan.
5. `POST /api/v1/premium/send` -> `PremiumController` tidak ditemukan.
6. `GET/POST /api/v1/livechat/` -> `LivechatController` tidak ditemukan.

