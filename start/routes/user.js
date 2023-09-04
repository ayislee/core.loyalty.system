'use strict'
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/admin/users'

Route.group(()=>{
    Route.get('/','UserController.gets').validator('Pages')
    Route.get('/all','UserController.all')
    Route.post('/', 'UserController.create').validator('User')
    Route.put('/', 'UserController.edit')
    .validator('UserID').validator('UserEdit')
    .middleware(['IsUserEdit','IsEmailUsed'])
    Route.post('/partner','UserController.create_user_partner').middleware(['isAdmin','PartnerOnly']).validator('UserID').validator('PartnerID')
   
}).prefix(prefix).middleware(['auth:jwt'])