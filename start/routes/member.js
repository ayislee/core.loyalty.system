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
}).prefix(prefix).middleware(['auth:token'])