'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/public'

Route.group(()=>{
    Route.get('/banners','BannerController.public_get')
   
}).prefix(prefix)