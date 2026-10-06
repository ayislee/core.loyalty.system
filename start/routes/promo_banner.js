'use strict'
const Route = use('Route')
Route.group(()=>{ Route.get('/','PromoBannerController.gets'); Route.get('/get','PromoBannerController.get'); Route.post('/','PromoBannerController.save'); Route.put('/','PromoBannerController.save') }).prefix('/api/v1/admin/promo-banners').middleware(['auth:jwt'])
