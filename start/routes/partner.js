'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/admin/partner'

Route.group(()=>{
    Route.get('/','PartnerController.gets')
    Route.get('/get','PartnerController.get').validator('PartnerID')
    Route.post('/','PartnerController.create').validator('Partner')
    Route.put('/','PartnerController.edit')
    .middleware(['HasPartner'])
    .validator('Partner').validator('PartnerID')
}).prefix(prefix).middleware(['auth:jwt'])