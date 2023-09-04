'use strict'
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/admin/getpoints'

Route.group(()=>{
    Route.get('/','GetPointController.gets').validator('Pages')
    Route.post('/','GetPointController.create').middleware(['HasPartner']).validator('GetPoint').validator('PartnerID')
    Route.put('/','GetPointController.edit').middleware(['HasPartner']).validator('GetPoint').validator('GetpointID')
    
   
}).prefix(prefix).middleware(['auth:jwt'])