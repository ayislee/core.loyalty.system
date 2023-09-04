'use strict'

/** @type {import('@adonisjs/framework/src/Server')} */
const Server = use('Server')

/*
|--------------------------------------------------------------------------
| Global Middleware
|--------------------------------------------------------------------------
|
| Global middleware are executed on each http request only when the routes
| match.
|
*/
const globalMiddleware = [
  'Adonis/Middleware/BodyParser',
  'Adonis/Middleware/Session',
  'Adonis/Middleware/Shield',
  'Adonis/Middleware/AuthInit',
  'App/Middleware/ConvertEmptyStringsToNull',
]

/*
|--------------------------------------------------------------------------
| Named Middleware
|--------------------------------------------------------------------------
|
| Named middleware is key/value object to conditionally add middleware on
| specific routes or group of routes.
|
| // define
| {
|   auth: 'Adonis/Middleware/Auth'
| }
|
| // use
| Route.get().middleware('auth')
|
*/
const namedMiddleware = {
  auth: 'Adonis/Middleware/Auth',
  guest: 'Adonis/Middleware/AllowGuestOnly',
  CustomerOnly: 'App/Middleware/CustomerOnly',
  VerifyGoogleSSOToken: "App/Middleware/VerifyGoogleSSOToken",
  UserType: 'App/Middleware/UserType',
  isAdmin: 'App/Middleware/IsAdmin',
  IsUserEdit: 'App/Middleware/IsUserEdit',
  IsEmailUsed: 'App/Middleware/IsEmailUsed',
  PartnerOnly: 'App/Middleware/PartnerOnly',
  HasPartner : 'App/Middleware/HasPartner',
  ValidateVoucher: 'App/Middleware/ValidateVoucher',
  ValidatePartner: 'App/Middleware/ValidatePartner',
  FilterPartner: 'App/Middleware/FilterPartner',
  AuthMerchant :'App/Middleware/AuthMerchant',
}

/*
|--------------------------------------------------------------------------
| Server Middleware
|--------------------------------------------------------------------------
|
| Server level middleware are executed even when route for a given URL is
| not registered. Features like `static assets` and `cors` needs better
| control over request lifecycle.
|
*/
const serverMiddleware = [
  'Adonis/Middleware/Static',
  'Adonis/Middleware/Cors'
]

Server
  .registerGlobal(globalMiddleware)
  .registerNamed(namedMiddleware)
  .use(serverMiddleware)

/*
|--------------------------------------------------------------------------
| Run Scheduler
|--------------------------------------------------------------------------
|
| Run the scheduler on boot of the web sever.
|
*/

const Scheduler = use('Adonis/Addons/Scheduler')
Scheduler.run()
