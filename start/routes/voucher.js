'use strict'
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/admin/vouchers'

Route.group(()=>{
    Route.get('/','VoucherController.gets').validator('Pages')
    Route.post('/','VoucherController.create').validator('PartnerID').validator('Voucher')
    Route.put('/','VoucherController.edit')
    .middleware(['HasPartner','ValidateVoucher'])
    .validator('VoucherID').validator('PartnerID').validator('Voucher')
   
}).prefix(prefix).middleware(['auth:jwt'])