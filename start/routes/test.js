'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/test'
Route.group(()=>{
    Route.get('/','Test/TestController.test').middleware('auth')
}).prefix(prefix)
