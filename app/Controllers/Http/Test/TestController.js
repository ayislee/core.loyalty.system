'use strict'
// const PointLib = use('App/Lib/PointLib')
const jwt = require('jsonwebtoken');
const Env = use('Env')

class TestController {
    async test({auth, request, response}) {
        
        // Encrypt
        var ciphertext = CryptoJS.AES.encrypt('my message', 'secret key 123').toString();

        // Decrypt
        var bytes  = CryptoJS.AES.decrypt(ciphertext, 'secret key 123');
        var originalText = bytes.toString(CryptoJS.enc.Utf8);
        return response.json(ciphertext)
    }
}

module.exports = TestController
