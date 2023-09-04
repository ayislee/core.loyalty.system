'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/premium'

Route.group(()=>{
    Route.post('/send','PremiumController.PostMessage').middleware('auth').validator('message')
   
}).prefix(prefix)