'use strict'
const PointLib = use('App/Lib/PointLib')
const Env = use('Env')

class TestController {
    async test({auth, request, response}) {
        
        const user = await PointLib.registration(auth.user)
        
        return response.json(user)
    }
}

module.exports = TestController
