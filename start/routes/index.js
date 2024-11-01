'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

require('./auth')
require('./user')
require('./partner')
require('./public')
require('./voucher')
require('./merchant')
require('./get_point')
require('./redeem_merchant')
require('./member')

if(Env.get('NODE_ENV')==='development'){
    require('./test')
}

Route.get('/',()=>{
    return "welcome to Core Loyalty System"
})

