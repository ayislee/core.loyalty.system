"use strict";

const Env = use("Env");
const Utility = use("Utility");
const { OAuth2Client } = require("google-auth-library");

class VerifyGoogleSSOToken {
	async handle({ response, request }, next) {
		try {
			const formData = request.only("id_token");
            
			// //register all client ids
			const ids = [Env.get("MIC_STREAMING_WEB_GOOGLE_CLIENT_ID"), Env.get("EVENTORIES_WEB_GOOGLE_CLIENT_ID"), Env.get("MEDIACARTZ_APP_GOOGLE_CLIENT_ID")];
			const client = new OAuth2Client(ids);

			// //verify token untuk mendapatkan info account Google
			const info = await client.verifyIdToken({
				idToken: formData.id_token,
				audience: ids //bisa berupa array jika ada multiple client
			});
			const payload = info.getPayload();
            
            
			// //validasi iss value
			if (["accounts.google.com", "https://accounts.google.com"].includes(payload.iss) === false) return response.json({ error: "Invalid iss info" });

			// //validasi aud sama dengan client id
			if (ids.includes(payload.aud) === false) return response.json({ error: "Invalid client id" });

			// //validasi token expired dengan timestamp saat ini
			if (Utility.isAfterDatetime(parseInt(payload.exp), parseInt(Utility.formatDatetime({ format: "X" })))) return response.json({ error: "Id token has expired" });

			// //set data ini sebagai request untuk acuan file berikutnya
			request.sso_payload = payload;
            console.log('info%%%%%%%%%%%%%%%%',payload)
			// //call next to advance the request
			await next();
		} catch (error) {
            console.log(error)
            return response.json({
                status: false,
                message: error.message
            })
			
		}
	}
}

module.exports = VerifyGoogleSSOToken;
