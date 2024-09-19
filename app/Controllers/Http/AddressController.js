'use strict'
const Address = use('App/Models/Address')
const Env = use('Env')
const axios = use('axios')

class AddressController {
    async list({request, response, auth}) {
        try {
            const address = await Address.query().where('member_id',auth.user.member_id).fetch()
            return response.json({
                status: true,
                data: address
            })    
        } catch (error) {
            return response.json({
                status: false,
                data: error.message
            })
        }
        
    }

    async create({request, response, auth}) {
        const req = request.all()
        let address = await Address.query().where('member_id',auth.user.member_id).fetch()
        if(address.rows.length > 5){
            return response.json({
                status: false,
                message: "Kamu sudah memiliki 5 alamat"
            })
        }

        address = new Address()
        address.address_name = req.address_name
        address.member_id = auth.user.member_id
        address.province_id = req.province_id
        address.province_name = req.province_name
        address.city_id = req.city_id
        address.city_name = req.city_name
        address.city_type = req.city_type
        address.full_address = req.full_address
        address.postal_code = req.postal_code

        await address.save()
        return response.json({
            status: true,
            message: 'success'
        })
    }

    async get({request, response, auth}) {
        const req = request.all()
        const address = await Address.query().where('member_id',auth.user.member_id).where('address_id',req.address_id).first()

        return response.json({
            status: true,
            data: address
        })
    }

    async edit({request, response, auth}) {
        const req = request.all()
        try {
            const address = await Address.query()
            .where('address_id',req.address_id)
            .where('member_id', auth.user.member_id)
            .first()
    
            address.address_name = req.address_name ? req.address_name : address.address_name
            address.province_id = req.province_id ? req.province_id : address.province_id
            address.province_name = req.province_name ? req.province_name : address.province_name
            address.city_id = req.city_id ? req.city_id : address.city_id
            address.city_type = req.city_type ? req.city_type : address.city_type
            address.city_name = req.city_name ? req.city_name : address.city_name
            address.full_address = req.full_address ? req.full_address : address.full_address
            address.postal_code = req.postal_code ? req.postal_code : address.postal_code
            await address.save()
            return response.json({
                status: true,
                message: 'success'
            })    
        } catch (error) {
            return response.json({
                status: false,
                message: error.message
            })            
        }



    }
}

module.exports = AddressController
