'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/livechat'

Route.group(()=>{
    Route.post('/','LivechatController.PostMessage').middleware('auth')
    Route.get('/','LivechatController.GetMessages')
   
}).prefix(prefix)
