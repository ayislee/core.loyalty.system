'use strict'
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/merchant'

Route.group(()=>{
    Route.post('/member/register','MemberController.register').validator('lid').middleware(['PhoneOrEmail'])
    Route.post('/member/sendpoint','MemberController.sendpoint').validator('lid').validator('Point').middleware(['PhoneOrEmail'])
    Route.get('/member/getpoint','MemberController.getpoint').validator('PhoneEmail').middleware(['ConvertPhone'])
    Route.get('/member/getvoucher','MemberController.getvoucher').validator('Code')
    Route.post('/member/voucher/exchange','MemberController.voucher_exchange')
    Route.post('/member/request/auth','MemberController.request_auth').validator('EmailExists')

   
}).prefix(prefix).middleware(['AuthMerchant'])