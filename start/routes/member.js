'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')
const prefix='/api/v1/member'
Route.group(()=>{
    Route.get('/profile','MemberController.profile')
    Route.put('/profile','MemberController.profile_update').validator('MemberID')
    Route.get('/points','MemberController.points').validator('Pages')
    Route.get('/vouchers','MemberController.vouchers').validator('Pages')
    Route.post('/redeem','MemberController.redeem').validator('VoucherID')
    Route.get('/redeem/voucher','MemberController.redeem_voucher').validator('Pages')
    Route.get('/partner','PartnerController.all').validator('Pages')
    Route.get('/partner/detail','PartnerController.detail').validator('PartnerID')

    Route.get('/company/cashier','ProductController.cashier')
    Route.get('/store','ProductController.store').validator('PartnerID')
    Route.get('/store/get','ProductController.store_get')
    Route.get('/product','ProductController.list')
    Route.get('/product/get','ProductController.get')
    
    Route.get('/cart','CartController.list').validator('Pages')
    Route.get('/cart/get','CartController.get').validator('CartID')
    Route.post('/cart','CartController.create')
    Route.put('/cart','CartController.edit').validator('CartID')
    Route.delete('/cart','CartController.delete').validator('CartID')
    
    Route.get('/transaction','TransactionController.list').validator('Pages')
    Route.get('/transaction/get','TransactionController.get')
    Route.post('/transaction','TransactionController.create')
    Route.put('/transaction/resume','TransactionController.resume')


    // master
    Route.get('/master/province','MasterController.province')
    Route.get('/master/city','MasterController.city')
    Route.get('/master/payment','MasterController.payment')
    Route.get('/master/delivery','MasterController.delivery')
    
    Route.get('/address','AddressController.list')
    Route.get('/address/get','AddressController.get')
    Route.post('/address','AddressController.create')
    Route.put('/address','AddressController.edit')
    Route.delete('/address','AddressController.delete')

    Route.get('/shipping/cost','ShippingController.get')

    Route.get('/master/payment','MasterController.payment')
    
    Route.get('/auth','MemberController.auth')
    
}).prefix(prefix).middleware(['auth:phone','auth:email'])


const prefix2='/api/v1/admin/member'
Route.group(()=>{
    Route.get('/','MemberController.gets').validator('Pages')
    Route.get('/get','MemberController.get').validator('MemberID')
    Route.get('/points','MemberController.member_points').validator('MemberID').validator('Pages')
    Route.get('/vouchers','MemberController.member_vouchers').validator('MemberID').validator('Pages')
}).prefix(prefix2).middleware(['auth:jwt'])
