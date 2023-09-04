"use strict";

class AuthSocket {
	//for HTTP
	async handle({ request, response }, next) {
		// if (request.ip() !== "127.0.0.1") return response.json({ error: "Localhost allowed only" });
		await next();
	}

	//for WebSocket
	async wsHandle({ request, response }, next) {
		// if (request.ip() !== "127.0.0.1") return response.json({ error: "Localhost allowed only" });
		await next();
	}
}

module.exports = AuthSocket;
