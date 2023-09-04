'use strict'

class VoucherID {
    get rules () {
		return {
			voucher_id: "required|exists:vouchers,voucher_id",
		}
	}

	get messages(){
		return {
			"voucher_id.required": "voucher_id is required",
            "voucher_id.number": "voucher_id must number",
            "voucher_id.exists": "voucher_id is not exists"
		}
	}

	async fails(errorMessages) {
		return this.ctx.response.json({
			status: false,
			message: errorMessages[0].message
		});
	}
}

module.exports = VoucherID