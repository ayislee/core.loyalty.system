'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/user/auth'

Route.group(()=>{
    Route.post('/register','Auth/AuthController.user_register').validator('UserRegister')
    Route.post('/login','Auth/AuthController.user_login').validator('UserLogin')
}).prefix(prefix)

const prefix2='/api/v1/member/auth'
Route.group(()=>{
    Route.post('/request/token','Auth/AuthController.request_token').validator('Phone')
    .middleware(['ConvertPhone'])
    Route.post('/login/token','Auth/AuthController.login_token').validator('Phone').validator('Token')
    .middleware(['ConvertPhone'])
}).prefix(prefix2)


