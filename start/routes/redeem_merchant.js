'use strict'
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/admin/redeem_merchant'

Route.group(()=>{
    Route.get('/','RedeemMerchantController.gets').middleware(['FilterPartner']).validator('Pages')
    Route.get('/get','RedeemMerchantController.get').middleware(['FilterPartner']).validator('RedeemMID')
    Route.post('/','RedeemMerchantController.create').middleware(['HasPartner']).validator('RedeemMerchant')
    Route.put('/','RedeemMerchantController.edit')
    .middleware(['HasPartner'])
    .validator('RedeemMID')
    .validator('RedeemMerchant')

   
}).prefix(prefix).middleware(['auth:jwt'])