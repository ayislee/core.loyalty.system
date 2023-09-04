'use strict'
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/merchant'

Route.group(()=>{
    Route.post('/member/register','MemberController.register').validator('Phone')
    Route.post('/member/sendpoint','MemberController.sendpoint').validator('Phone')
    Route.get('/member/getpoint','MemberController.getpoint').validator('Phone')
    Route.post('/member/voucher/exchange','MemberController.voucher_exchange')
   
}).prefix(prefix).middleware(['AuthMerchant'])