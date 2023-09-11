'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')
const prefix='/api/v1/member'
Route.group(()=>{
    Route.get('/profile','MemberController.profile')
    Route.get('/points','MemberController.points').validator('Pages')
    Route.get('/vouchers','MemberController.vouchers').validator('Pages')
    Route.post('/redeem','MemberController.redeem').validator('VoucherID')
    Route.get('/redeem/voucher','MemberController.redeem_voucher').validator('Pages')
    Route.get('/partner','PartnerController.all').validator('Pages')
}).prefix(prefix).middleware(['auth:token'])


const prefix2='/api/v1/admin/member'
Route.group(()=>{
    Route.get('/','MemberController.gets').validator('Pages')
    Route.get('/get','MemberController.get').validator('MemberID')
    Route.get('/points','MemberController.member_points').validator('MemberID').validator('Pages')
    Route.get('/vouchers','MemberController.member_vouchers').validator('MemberID').validator('Pages')
}).prefix(prefix2).middleware(['auth:jwt'])
