'use strict'

/** @type {import('@adonisjs/framework/src/Env')} */
const Env = use('Env')

module.exports = {
  /*
  |--------------------------------------------------------------------------
  | Authenticator
  |--------------------------------------------------------------------------
  |
  | Authentication is a combination of serializer and scheme with extra
  | config to define on how to authenticate a user.
  |
  | Available Schemes - basic, session, jwt, api
  | Available Serializers - lucid, database
  |
  */
  authenticator: 'jwt',

  /*
  |--------------------------------------------------------------------------
  | Session
  |--------------------------------------------------------------------------
  |
  | Session authenticator makes use of sessions to authenticate a user.
  | Session authentication is always persistent.
  |
  */
  session: {
    serializer: 'lucid',
    model: 'App/Models/User',
    scheme: 'session',
    uid: 'email',
    password: 'password'
  },

  /*
  |--------------------------------------------------------------------------
  | Basic Auth
  |--------------------------------------------------------------------------
  |
  | The basic auth authenticator uses basic auth header to authenticate a
  | user.
  |
  | NOTE:
  | This scheme is not persistent and users are supposed to pass
  | login credentials on each request.
  |
  */
  basic: {
    serializer: 'lucid',
    model: 'App/Models/User',
    scheme: 'basic',
    uid: 'email',
    password: 'password'
  },

  /*
  |--------------------------------------------------------------------------
  | Jwt
  |--------------------------------------------------------------------------
  |
  | The jwt authenticator works by passing a jwt token on each HTTP request
  | via HTTP `Authorization` header.
  |
  */
  jwt: {
    serializer: 'lucid',
    model: 'App/Models/User',
    scheme: 'jwt',
    uid: 'email',
    password: 'password',
    options: {
      secret: Env.get('APP_KEY')
    }
  },

  /*
  |--------------------------------------------------------------------------
  | Api
  |--------------------------------------------------------------------------
  |
  | The Api scheme makes use of API personal tokens to authenticate a user.
  |
  */
  api: {
    serializer: 'lucid',
    model: 'App/Models/User',
    scheme: 'api',
    uid: 'email',
    password: 'password'
  },

  token: {
    serializer: 'lucid',
    model: 'App/Models/Member',
    scheme: 'jwt',
    uid: 'lid',
    password: 'token',
    options: {
      secret: Env.get('APP_KEY')
    }
  },

  email_token: {
    serializer: 'lucid',
    model: 'App/Models/Customer',
    scheme: 'jwt',
    uid: 'email',
    password: 'token',
    options: {
      secret: Env.get('APP_KEY')
    }
  },
  login_member: {
    serializer: 'lucid',
    model: 'App/Models/Customer',
    scheme: 'jwt',
    uid: 'lid',
    password: 'password',
    options: {
      secret: Env.get('APP_KEY')
    }
  },
  easygo_user: {
    serializer: 'lucid',
    model: 'App/Models/EgUser',
    scheme: 'jwt',
    uid: 'user_email',
    password: 'user_pass',
    options: {
      secret: Env.get('APP_KEY')
    }
  }
}
