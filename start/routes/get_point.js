'use strict'
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/admin/getpoints'

Route.group(()=>{
    Route.get('/','GetPointController.gets').validator('Pages')
    Route.get('/get','GetPointController.get').validator('GetPointID')
    Route.post('/','GetPointController.create').middleware(['HasPartner']).validator('GetPoint').validator('PartnerID')
    Route.put('/','GetPointController.edit').middleware(['HasPartner']).validator('GetPoint').validator('GetPointID')
    
   
}).prefix(prefix).middleware(['auth:jwt'])