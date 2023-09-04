"use strict";

const { ServiceProvider } = require("@adonisjs/fold");
const TeleBot = require("telebot");

class MyTelegramProvider extends ServiceProvider {
	register() {
		this.app.singleton("CustomTelegram", app => {
			const activate = app.use("Adonis/Src/Env").get("TELEGRAM_ACTIVATE");
			const token = app.use("Adonis/Src/Env").get("TELEGRAM_TOKEN");
			const group_developer = app.use("Adonis/Src/Env").get("TELEGRAM_DEVELOPER_GROUP_ID");
			const group_monitoring = app.use("Adonis/Src/Env").get("TELEGRAM_MONITORING_GROUP_ID");

			//init hanya jika status aktif
			const init = activate ? new TeleBot({ token }) : {};

			//interface kan lagi agar tidak terlalu banyak define, untuk handling juga jika mode sedang non-aktif
			const bot = {
				//main function send message ke group id tertentu
				notifyToDeveloperGroup(content) {
					if (init && init.sendMessage && group_developer)
						init.sendMessage(group_developer, content, {
							disable_web_page_preview: true
						});
				},

				//main function send message ke group id tertentu
				notifyToMonitoringGroup(content) {
					if (init && init.sendMessage && group_monitoring)
						init.sendMessage(group_monitoring, content, {
							disable_web_page_preview: true
						});
				}
			};

			return { bot };
		});
	}
}

module.exports = MyTelegramProvider;
