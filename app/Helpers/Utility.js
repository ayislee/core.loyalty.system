"use strict";

//day.js
const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const localizedFormat = require("dayjs/plugin/localizedFormat");
const isBetween = require("dayjs/plugin/isBetween");
dayjs.extend(customParseFormat); //plugin untuk support custom format dari input string
dayjs.extend(localizedFormat); //plugin untuk display local format seperti "LLL", dsb
dayjs.extend(isBetween); //plugin untuk cek date ada di range tertentu

//sanitizing HTML function
const SanitizeHTML = require("./SanitizeHTML");

//native function
const util = require("util");
const exec = util.promisify(require("child_process").exec);

//basic library
const Env = use("Env");
const Logger = use("Logger");
const Config = use("Config");
const bcrypt = require("bcryptjs");
const juice = require("juice");

//encryption
const crypto = require("crypto");
const algorithm = "aes-256-cbc";
const key = Env.get("CRYPTO_KEY");
const iv = Env.get("CRYPTO_IV");

//telegram
const { bot } = use("CustomTelegram");

module.exports = {
	convertRegexToString(string) {
		const obj = { flags: string.flags, source: string.source };
		return JSON.stringify(obj);
	},

	convertStringToRegex(string) {
		const parsed = JSON.parse(string);
		return new RegExp(parsed.source, parsed.flags);
	},

	hashing(string) {
		return bcrypt.hashSync(string, bcrypt.genSaltSync(Config.get("custom.salt_rounds")));
	},

	encrypt(text) {
		const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
		let encrypted = cipher.update(text);
		encrypted = Buffer.concat([encrypted, cipher.final()]);
		return encrypted.toString("hex");
	},

	decrypt(text) {
		const encryptedText = Buffer.from(text, "hex");
		const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
		let decrypted = decipher.update(encryptedText);
		decrypted = Buffer.concat([decrypted, decipher.final()]);
		return decrypted.toString();
	},

	//timpa duplicate value berdasarkan key yang dikehendaki
	// const arr = [
	// 	{ id: 1, name: "test1" },
	// 	{ id: 2, name: "test2" },
	// 	{ id: 2, name: "test3" },
	// ]
	// menjadi :
	// [
	// 	{ id: 1, name: 'test1' },
	// 	{ id: 2, name: 'test3' },
	// ]
	overwriteDuplicateBasedOnValueInArray(arr, key) {
		if (!key) return { error: "Please specify key name of this object" };

		let new_array = [];
		let current_object = {};

		for (let i in arr) {
			current_object[arr[i][key]] = arr[i];
		}

		for (let i in current_object) {
			new_array = [...new_array, current_object[i]];
		}
		return new_array;
	},

	// Accepts the array and key
	groupBy(array, key) {
		// Return the end result
		return array.reduce((result, currentValue) => {
			// If an array already present for key, push it to the array. Else create an array and push the object
			(result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
			// Return the current iteration `result` value, this will be taken as next iteration `result` value and accumulate

			return result;
		}, []); // empty object is the initial value for result object
	},

	//hapus duplicate value berdasarkan key yang dikehendaki
	// const arr = [
	// 	{ id: 1, name: "test1" },
	// 	{ id: 2, name: "test2" },
	// 	{ id: 2, name: "test3" },
	// ]
	// menjadi :
	// [
	// 	{ id: 1, name: 'test1' },
	// 	{ id: 2, name: 'test2' },
	// ]
	removeDuplicateBasedOnValueInArray(arr, key) {
		if (!key) return { error: "Please specify key name of this object" };

		return arr.reduce((acc, current) => {
			const x = acc.find(item => item[key] === current[key]);
			if (!x) {
				return acc.concat([current]);
			} else {
				return acc;
			}
		}, []);
	},

	//mengkonversi nomor telpon ke format E.164 : +62817283973 (tambah + dan hapus 0 jika ada)
	convertPhoneNumberE164Pattern(str) {
		let new_string = String(str).match(/[0-9]{0,14}/g);
		if (new_string === null) return { error: "Phone number only" };

		//join parts returned from RegEx match
		new_string = new_string.join("");

		//start number with "+" and limit length to 15 characters
		new_string = `+${new_string.substring(0, 15)}`;

		return new_string;
	},

	//give delay before executing next process
	sleep(ms) {
		return new Promise(resolve => {
			setTimeout(resolve, ms);
		});
	},

	slugify(text, limit) {
		const from = "ãàáäâẽèéëêìíïîõòóöôùúüûñç·/_,:;";
		const to = "aaaaaeeeeeiiiiooooouuuunc------";

		const replaced = text ? text.split("").map((letter, i) => letter.replace(new RegExp(from.charAt(i), "g"), to.charAt(i))) : "";

		const slugify = replaced
			.toString() //cast to string
			.toLowerCase() //convert to lowercase letters
			.trim() //remove whitespace
			.replace(/\s+/g, "-") //replace spaces with -
			.replace(/&/g, "-y-") //replace & with 'and'
			.replace(/[^\w\-]+/g, "") //remove all non-word chars
			.replace(/\-\-+/g, "-"); //replace multiple - with single -

		return limit && typeof limit === "number" ? this.truncateString(slugify, limit) : slugify;
	},

	randomFromArray(arr) {
		return arr[Math.floor(Math.random() * arr.length)];
	},

	createArrayOfNumbers(n) {
		return [...Array(n)].map((_, i) => i + 1); //contoh n = 10 maka hasilnya [1,2,3,4,...,10]
	},

	checkMemoryUsage() {
		const used = process.memoryUsage().heapUsed / 1024 / 1024;
		return `The script uses approximately ${Math.round(used * 100) / 100} MB`;
	},

	checkisObject(obj) {
		return typeof obj === "object" && Object.prototype.toString.call(obj) === "[object Object]" ? true : false;
	},

	checkObjectLength(obj) {
		//{} => return 0
		//{test:'a', demo: 'b'} => return 2
		return Object.entries(obj).length;
	},

	execShellCommand(command) {
		const exec = require("child_process").exec;
		return new Promise((resolve, reject) => {
			exec(command, (error, stdout, stderr) => {
				if (stderr) reject(Error(stderr));
				resolve({ success: stdout });
			});
		});
	},

	async countLinesInFile(file) {
		const { stdout } = await exec(`cat ${file} | wc -l`);
		return parseInt(stdout);
	},

	truncateString(string, length) {
		const text = string ? string.toString() : "";
		return text && text.length > length ? text.substring(0, length) : text;
	},

	truncateWithEllipsis(string, length) {
		const suffix = "...";
		const allowed_length = length - suffix.length;

		if (string && string.length > allowed_length) return this.truncateString(string, allowed_length) + suffix;

		return string;
	},

	//escape string agar bisa dipakai di regex pattern
	escapeStringForRegexFriendly(str) {
		return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
	},

	//cek apakah semua value didlm sebuah array valuenya sama semua
	checkAllEqualValueInArray(arr) {
		return arr.every(x => x === arr[0]); //true or false
	},

	joinArrayWithWordOnLastItem(arr, word) {
		return arr.join(", ").replace(/, ([^,]*)$/, " " + word + " $1");
	},

	convertToCurrency(amount, currency = true) {
		if (currency) {
			const formatter = new Intl.NumberFormat("id-ID", {
				style: "currency",
				currency: "IDR"
			});
			if (amount === null) return "-";
			return formatter.format(amount).replace(/.00$/, "").replace(/,/g, ".");
		}

		return amount ? amount.toLocaleString("id-ID") : amount;
	},

	findDuplicates(arr) {
		return arr.filter((item, index) => arr.indexOf(item) != index);
	},

	convertContentAccordingToProduct(content, product) {
		//buang script dan inline kan css
		if (product === "EMAIL") return juice(SanitizeHTML(content));
		//if (product === "WHATSAPP")  return JSON.stringify(content);
		//if (product === "SMS") return this.replaceSingleToDoubleQuotes(content);

		return content;
	},

	replaceSingleToDoubleQuotes(string) {
		return string.replace(/'/g, '"');
	},

	//contoh : this is the way ==> This Is The Way
	convertToPascalCase(string) {
		return string.replace(/\w+/g, function (w) {
			return w[0].toUpperCase() + w.slice(1).toLowerCase();
		});
	},

	//contoh : this is the way ==> THISISTHEWAY
	convertToFilenameFormat(string) {
		return string
			.replace(/[^\w]/g, "") //hapus semua special character dan whitespace
			.toUpperCase();
	},

	//print semua object tanpa terkecuali
	console(data) {
		console.log(util.inspect(data, false, null, true /* enable colors */));
	},

	//setting parameter untuk filter di query
	filterQuery(request, primary_key) {
		return {
			query: request,
			page: request.page || 1,
			limit: request.limit || Config.get("custom.rows_per_page"),
			order_by: request.order_by || primary_key,
			sort_by: request.sort_by || "desc"
		};
	},

	convertArrayToCsv(array, delimiter = ",") {
		return array.join(delimiter) + "\n";
	},

	removeRedundantFromArrayOfObjectByValue(arr, prop) {
		let obj = {};
		return Object.keys(
			arr.reduce((prev, next) => {
				if (!obj[next[prop]]) obj[next[prop]] = next;
				return obj;
			}, obj)
		).map(i => obj[i]);
	},

	validateSenderName(string) {
		const rule = /^[a-zA-Z0-9 -]{1,11}$/;
		return rule.test(String(string));
	},

	validateIPAddress(ip) {
		return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
	},

	validateEmail(email) {
		const rule = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
		return rule.test(String(email).toLowerCase());
	},

	validateMSISDN(msisdn) {
		//format MSISDN 62xxxxxxxxxxx, dengan total jumlah digit 11-14
		const rule = /^62\d.{8,11}$/;
		return rule.test(String(msisdn));
	},

	convertMSISDN(msisdn) {
		return msisdn
			? msisdn
					.replace(/[^\w]/g, "") //hapus semua special character dan whitespace
					.replace(/[a-z]/gi, "") //hapus semua alfabet dengan case insensitive
					.replace(/^8/, "628") //replace awalan 8 menjadi 628
					.replace(/^08/, "628") //replace awalan 08 menjadi 628
					.replace(/^6208/, "628") //replace awalan 6208 menjadi 628
			: null;
	},

	getOperatorFromMSISDN(msisdn) {
		const operator_list = Config.get("custom.operator");

		//convert format
		const converted = this.convertMSISDN(msisdn);
		if (!converted) return null;

		//baca prefix dari nomor MSISDN recipient
		const current_prefix = converted.substring(0, 5);

		//cari operator yang sesuai dengan prefix yang dicek dari list operator
		const operator = operator_list.find(x => x.prefix.includes(current_prefix));

		return operator && operator.name ? operator.name : null;
	},

	//==========================================================================================
	// 	customer CRM
	//==========================================================================================
	getDevice() {
		return ["ios", "android", "feature"];
	},

	categorizeDevice(string) {
		const device = String(string).toLowerCase();

		const rule_ios = /^.*(iphone|apple).*$/gm; //containing word
		const rule_feature = /^.*(nokia|sony ericsson|bb|blackberry).*$/gm; //containing word

		//test regex
		if (rule_ios.test(device)) return this.getDevice()[0];
		else if (rule_feature.test(device)) return this.getDevice()[2];
		else return this.getDevice()[1];
	},

	getGender() {
		return ["m", "f"];
	},

	categorizeGender(string) {
		const gender = String(string).toLowerCase();

		const rule_male = /^(\bm\b|\bp\b|\bco\b)|.*(pria|cowo|cowok|male|laki|boy|man|men).*$/gm; //exact "m", exact "p", exact "co" atau mengandung "pria, cowo, dst"
		const rule_female = /^(\bf\b|\bw\b|\bce\b)|.*(wanita|cewe|cewek|lady|girl|perempuan|woman|women|gadis).*$/gm; //exact "f", exact "w", exact "ce" atau mengandung "wanita, cewe, dst"

		//test regex
		if (rule_male.test(gender)) return this.getGender()[0];
		else if (rule_female.test(gender)) return this.getGender()[1];
		else return null;
	},

	getReligion() {
		return ["islam", "kristen", "katolik", "buddha", "hindu", "konghucu", "other"];
	},

	categorizeReligion(string) {
		const religion = String(string).toLowerCase();

		const rule_islam = /^.*(islam).*$/gm;
		const rule_kristen = /^.*(kristen|christian|prostestan|protestan).*$/gm;
		const rule_katolik = /^.*(katolic|chatolic|catholic|catolic|katolik).*$/gm;
		const rule_buddha = /^.*(buddha|budha).*$/gm;
		const rule_hindu = /^.*(hindu).*$/gm;
		const rule_konghucu = /^.*(konghucu|kong hu cu|kong hucu|khonghucu).*$/gm;

		//test regex
		if (rule_islam.test(religion)) return this.getReligion()[0];
		else if (rule_kristen.test(religion)) return this.getReligion()[1];
		else if (rule_katolik.test(religion)) return this.getReligion()[2];
		else if (rule_buddha.test(religion)) return this.getReligion()[3];
		else if (rule_hindu.test(religion)) return this.getReligion()[4];
		else if (rule_konghucu.test(religion)) return this.getReligion()[5];
		else return this.getReligion()[6];
	},

	catchError(request, response, error, return_back = true) {
		const message = error.message ? error.message : error.error;
		this.logging(`Query failed on ${request.method()} ${request.url()}`, message, "error");

		//response back jika ada permintaan
		if (return_back) return response.json({ 
            status: false, message: error.code ? `Unexpected error (${error.errno || "N/A"} : ${error.code})` : message });
	},

	logging(subject, content, type = "info") {
		Logger[type](`-------- ${new Date().toLocaleString()} : ${subject} --------`);
		if (content !== null) Logger[type](content);

		//send via telegram
		bot.notifyToDeveloperGroup(`[${Env.get("MAIN_DOMAIN")}] ${subject} : ${content}`);
	},

	getAxiosError(error) {
		// The request was made and the server responded with a status code
		if (error.response) return error.response.data && error.response.data.error ? error.response.data.error : error.response.data;

		return error.message;
	},

	sendNotification(subject, content) {
		bot.notifyToMonitoringGroup(`[${Env.get("MAIN_DOMAIN")}] ${subject} : ${content}`);
	},

	generateRandomNumber(min, max) {
		return Math.floor(Math.random() * (max - min) + min);
	},

	generateRandomString(length) {
		let text = "";
		const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

		for (let i = 0; i < length; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	},

	extractNumberFromString(string) {
		if (string && typeof string === "number") return string;
		return string ? +string.replace(/\D/g, "") : null;
	},

	extractUniqueNumberFromArray(arr) {
		return [...new Set(arr)].filter(Number);
	},

	//=========================================================================================
	// 	Statuses
	//=========================================================================================
	//untuk : campaign@campaign_status
	getCampaignStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "pending" },
			{ status_id: 1, status_name: "approved" },
			{ status_id: 2, status_name: "progressing" },
			{ status_id: 3, status_name: "completed" },
			{ status_id: 4, status_name: "rejected" },
			{ status_id: 5, status_name: "requestcancel" },
			{ status_id: 6, status_name: "draft" },
			{ status_id: 7, status_name: "needaction" },
			{ status_id: 8, status_name: "verifying" },
			{ status_id: 9, status_name: "revised" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//untuk : campaign_date@campaign_date_status, production@production_status
	getCampaignDateStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "pending" },
			{ status_id: 1, status_name: "scheduled" },
			{ status_id: 2, status_name: "progressing" },
			{ status_id: 3, status_name: "completed" }
			// { status_id: 4, status_name: "failed" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//untuk : ticket
	getTicketStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "pending" },
			{ status_id: 1, status_name: "issued" },
			{ status_id: 2, status_name: "failed" },
			{ status_id: 3, status_name: "void" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//untuk : token_recover_password, customer_upload, etc
	getGeneralStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "pending" },
			{ status_id: 1, status_name: "processed" },
			{ status_id: 2, status_name: "success" },
			{ status_id: 3, status_name: "canceled" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//untuk : api, webhook, etc
	getApiStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "pending" },
			{ status_id: 1, status_name: "processed" },
			{ status_id: 2, status_name: "completed" },
			{ status_id: 3, status_name: "failed" },
			{ status_id: 4, status_name: "rejected" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//untuk : sender, template, transaction, event, microsite, newsletter
	getApprovalStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "pending" },
			{ status_id: 1, status_name: "progressing" },
			{ status_id: 2, status_name: "verified" },
			{ status_id: 3, status_name: "approved" },
			{ status_id: 4, status_name: "rejected" },
			{ status_id: 5, status_name: "failed" },
			{ status_id: 6, status_name: "completed" } //untuk newsletter
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//untuk : user@verified_status, company, organizer, recipient_upload, customer_upload
	getVerificationStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "unverified" },
			{ status_id: 1, status_name: "pending" },
			{ status_id: 2, status_name: "verified" },
			{ status_id: 3, status_name: "rejected" },
			{ status_id: 4, status_name: "progressing" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//untuk : user@active_admin_status, active_user_status, menu@menu_custom_price_status
	getActivationStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "inactive" },
			{ status_id: 1, status_name: "active" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//untuk campaign@campaign_draftable_status, campaign_updatable_status, user@subscribed_status, user_subscription@user_subscription_status, voucher@voucher_public_status
	getBooleanStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "false" },
			{ status_id: 1, status_name: "true" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	//alternatif dari true false diatas
	getBooleanHumanStatus(passingKey, passingValue) {
		const list = [
			{ status_id: 0, status_name: "no" },
			{ status_id: 1, status_name: "yes" }
		];

		//return status sesuai yang mau dibaca
		return this._processStatus(passingKey, passingValue, list);
	},

	_processStatus(passingKey, passingValue, list) {
		try {
			//jika tidak diisi apa-apa parameternya, maka return status
			if (passingKey == null && passingValue == null) {
				return list;
			} else {
				//jika diisi, proses mau baca apa
				//search according to passingKey, and will return the opposite key
				if (passingKey == "status_id") {
					const filtered = list.find(x => x.status_id === parseInt(passingValue));
					return filtered.status_name;
				} else {
					const filtered = list.find(x => x.status_name === passingValue);
					return filtered.status_id;
				}
			}
		} catch (error) {
			return error;
		}
	},

	//untuk keperluan chart
	displayStatusColor(status_name) {
		if (["rejected", "canceled", "void", "unverified", "inactive", "expired", "failed"].includes(status_name)) return `#B71A1F`;
		else if (["approved", "completed", "active", "verified", "valid", "issued"].includes(status_name)) return `#44AA76`;
		else if (["needaction"].includes(status_name)) return `#FF7F00`;
		else return `#CCC`;
	},

	//penyeragaman status untuk tipe boolean
	convertBooleanStatus(status) {
		return ["true", true, 1, "1"].includes(status) ? 1 : 0;
	},

	//======================================================================================
	// 	List
	//======================================================================================
	getApiProduct() {
		return Config.get("custom.api_product");
	},

	//======================================================================================
	//	Permissions
	//======================================================================================
	getAdminPermission() {
		return Config.get("adminPermission.all_list");
	},

	getUserPermission() {
		return Config.get("userPermission.all_list");
	},

	getAllRetailPermission() {
		return Config.get("retailPermission");
	},

	//==================================================================================
	//	Date and time
	//==================================================================================

	//✅
	getListOfDates(startDate, endDate, interval = 1) {
		//validasi
		if (!startDate) return { error: "Start date is required" };
		if (!endDate) return { error: "End date is required" };
		if (startDate === endDate) return [startDate];
		if (this.isAfterDatetime(startDate, endDate) === false) return { error: "Start date must be earlier than end date" };

		//init format
		let start = this.formatDatetime({ content: startDate, format: "YYYY-MM-DD" });
		const end = this.formatDatetime({ content: endDate, format: "YYYY-MM-DD" });

		const dates = new Set();

		//generate tanggal berdasarkan interval
		do {
			dates.add(start);
			start = this.formatDatetime({ content: start, mode: "add", amount: interval, unit: "days", format: "YYYY-MM-DD" });
		} while (this.isAfterDatetime(start, end));

		//masukkan tanggal berakhir dan convert sebagai array
		dates.add(end);
		return [...dates];
	},

	//✅
	isBetweenTimeRange(check_time, start_time, end_time) {
		return check_time >= start_time && check_time <= end_time;
	},

	//✅
	// return boolean : true or false
	// Parameter 3 is a unit to compare : 'year', 'month', 'date', 'hour', 'minute', 'second' (default is 'milliseconds' if leave blank)
	// Parameter 4 is a string with two characters; '[' means inclusive, '(' exclusive
	// '()' excludes start and end date (default)
	// '[]' includes start and end date
	// '[)' includes the start date but excludes the end
	isBetweenDatetimeRange(check_datetime, start_datetime, end_datetime, unit = null) {
		if (!start_datetime) return { error: "Start datetime is required" };
		if (!end_datetime) return { error: "End datetime is required" };

		//samakan format datetime
		const start = this.formatDatetime({ content: start_datetime, format: "YYYY-MM-DD HH:mm:ss" });
		const end = this.formatDatetime({ content: end_datetime, format: "YYYY-MM-DD HH:mm:ss" });

		return check_datetime ? dayjs(this.formatDatetime({ content: check_datetime, format: "YYYY-MM-DD HH:mm:ss" })).isBetween(start, end, unit, "[]") : dayjs().isBetween(start, end, unit, "[]");
	},

	//✅
	getDifferenceInUnit(check_datetime, compared_datetime = null, unit = null) {
		//jika "compared_datetime" kosong, maka defaultnya adalah datetime saat ini
		//jika "unit" kosong, maka defaultnya adalah milliseconds
		return compared_datetime ? dayjs(compared_datetime).diff(dayjs(check_datetime), unit) : dayjs().diff(dayjs(check_datetime), unit);
	},

	//✅
	getDifferenceTimeBetweenTwoDatetime(datetime1, datetime2) {
		return {
			data: this.getDifferenceInUnit(datetime1, datetime2) //return dalam milliseconds
		};
	},

	//✅ return boolean : true or false
	isAfterDatetime(before_datetime, after_datetime) {
		return dayjs(after_datetime).isAfter(before_datetime);
	},

	//✅ return boolean : true of false
	isValidDatetimeFormat(datetime, format = "YYYY-MM-DD HH:mm:ss") {
		return dayjs(datetime, format, true).isValid();
	},

	//✅
	returnGreaterDatetime(datetime1 = null, datetime2 = null) {
		let result;
		if (datetime1 && datetime2) result = this.isAfterDatetime(datetime1, datetime2) ? datetime2 : datetime1;
		else result = datetime1 ? datetime1 : datetime2;

		return dayjs(result).format("YYYY-MM-DD HH:mm:ss");
	},

	//✅
	renewDatetimeOnlyIfExpiredWithIntervalTime(datetime, amount, unit = "seconds") {
		//jika sudah expired atau melewati waktu yang ditentukan, maka update dengan waktu saat ini ditambahkan interval waktu yang ditentukan
		if (this.isAfterDatetime(this.formatDatetime(), datetime) === false) return this.formatDatetime({ mode: "add", unit, amount });
		//jika belum expired, return datetime original
		else return datetime;
	},

	getCurrentWeekDayNumber() {
		return dayjs().day(); // gets day of current week
	},

	//✅
	formatDatetime(data) {
		const passing = {
			content: data && data.content ? data.content : null, //optional
			format: data && data.format ? data.format : "YYYY-MM-DD HH:mm:ss",
			mode: data && data.mode ? data.mode : null, //optional, terdiri dari : add, subtract
			amount: data && data.amount ? data.amount : null, //optional, jumlah satuan
			unit: data && data.unit ? data.unit : null //optional, satuan
		};

		try {
			switch (passing.mode) {
				case "add":
					return passing.content ? dayjs(new Date(passing.content).toISOString()).add(passing.amount, passing.unit).format(passing.format) : dayjs().add(passing.amount, passing.unit).format(passing.format);
				case "subtract":
					return passing.content ? dayjs(new Date(passing.content).toISOString()).subtract(passing.amount, passing.unit).format(passing.format) : dayjs().subtract(passing.amount, passing.unit).format(passing.format);
				default:
					return passing.content ? dayjs(new Date(passing.content).toISOString()).format(passing.format) : dayjs().format(passing.format);
			}
		} catch (error) {
			return;
		}
	},

	//✅
	getNativeDatetime(format = "YYYY-MM-DD HH:mm:ss") {
		const date = new Date();
		const yyyy = date.getFullYear();
		let dd = date.getDate();
		let mm = date.getMonth() + 1;
		let hours = date.getHours();
		let minutes = date.getMinutes();
		let seconds = date.getSeconds();

		if (dd < 10) dd = `0${dd}`;
		if (mm < 10) mm = `0${mm}`;
		if (hours < 10) hours = `0${hours}`;
		if (minutes < 10) minutes = `0${minutes}`;
		if (seconds < 10) seconds = `0${seconds}`;

		const today = `${yyyy}-${mm}-${dd}`;

		//supported format
		switch (format) {
			case "YYYY-MM-DD":
				return `${today}`;

			default:
				return `${today} ${hours}:${minutes}:${seconds}`;
		}
	},

	convertSecondsToDays(duration) {
		let remaining = duration;
		const days = parseInt(remaining / (24 * 3600));

		remaining = remaining % (24 * 3600);
		const hours = parseInt(remaining / 3600);

		remaining %= 3600;
		const minutes = parseInt(remaining / 60).toFixed();

		remaining %= 60;
		const seconds = remaining.toFixed();

		return `${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`;
	},

	getWeekdays() {
		return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
	},

	getIndexOfWeekday(weekday) {
		const list = this.getWeekdays();
		return list.indexOf(weekday);
	}
};
