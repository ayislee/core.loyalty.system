'use strict'

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

const prefix='/api/v1/public'

Route.group(()=>{
    Route.get('/banners','BannerController.public_get')
    Route.get('/store','ProductController.publicStore')
    Route.get('/category','ProductController.publicCategory')
    Route.get('/product','ProductController.publicProduct')
    Route.get('/product/detail','ProductController.publicProductDetail')
    Route.get('/product/review','ProductController.publicProductReview')
   
}).prefix(prefix)
