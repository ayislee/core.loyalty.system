"use strict";

const Env = use("Env");
const fs = use("fs");
const nodemailer = require("nodemailer");
const inlineCss = require("nodemailer-juice");
const View = use("View");
const moment = use('moment')



const transporter = nodemailer.createTransport({
    host: Env.get("MAIL_HOST"),
    port: Env.get("MAIL_PORT"),
    secure: true, // true for 465, false for other ports
    auth: {
        user: Env.get("NOREPLY_EMAIL"), // generated ethereal user
        pass: Env.get("NOREPLY_PASSWORD"), // generated ethereal password
    },
});



class BasicEmailService {
	async init(referrer_from) {
		switch (referrer_from) {
			case "admin":
				return {
					base_url: Env.get("ADMIN_FRONTEND_URL"),
					transporter: transporter_freshlybaked,
					sender_address: Env.get("NOREPLY_FULLADDRESS"),
					sender_reply_to: Env.get("NOREPLY_REPLY_TO_EMAIL"),
					header: "Freshlybacked By Origin Bakery"
				};

			case "client":
				return {
					base_url: Env.get("CLIENT_FRONTEND_URL"),
					transporter: transporter_freshlybaked,
					sender_address: Env.get("NOREPLY_FULLADDRESS"),
					sender_reply_to: Env.get("NOREPLY_REPLY_TO_EMAIL"),
					header: "Freshlybacked By Origin Bakery"
				};


			default:
				return {
					base_url: Env.get("CLIENT_FRONTEND_URL"),
					transporter: transporter_freshlybaked,
					sender_address: Env.get("NOREPLY_FULLADDRESS"),
					sender_reply_to: Env.get("NOREPLY_REPLY_TO_EMAIL"),
					header: "Mediacartz"
				};
		}
	}

    async registerCustomer(data) {

        try {

            let info = await transporter.sendMail({
                from: Env.get("NOREPLY_FULLADDRESS"), // sender address
                to: data.recipient_email, // list of receivers
                subject: `Register For Freshlybacked By Origin Bakery Account`, // Subject line

                html: View.render("mail/register", {
					recipient_name: data.recipient_name,
					current_datetime: moment().format('MMMM Do, YYYYY hh:mm:ss'),
					link: Env.get("PUBLIC_APP_URL")+"/activate/?token=" + data.token,
				})
            });



			return {
                status: true,
                message: "Recover link has been sent via email"
            };

        } catch (error) {
            console.log('error',error)
			return {

                status: false,
                message: error.message
            };
        }
    }

    async transaction(data,trial) {
		try {

            let info = await transporter.sendMail({
                from: Env.get("NOREPLY_FULLADDRESS"), // sender address
                to: data.recipient_email, // list of receivers
				bcc: Env.get("EMAIL_BCC"),
                subject: `Confirmation Payment for ${data.package_name}`, // Subject line


                html: View.render("mail/transaction", {
					recipient_name: data.recipient_name,
					current_datetime: moment().format('MMMM Do, YYYYY hh:mm:ss'),
					data: data.transaction,
                    trial:trial
					
				}),
				attachments : data.attachments
            });



			return {
                status: true,
                message: "Transaction confirm has been sent via email"
            };

        } catch (error) {
            console.log('error',error)
			return {

                status: false,
                message: error.message
            };
        }
    }

	async ForgotPassword(data) {
		try {

            let info = await transporter.sendMail({
                from: Env.get("NOREPLY_FULLADDRESS"), // sender address
                to: data.recipient_email, // list of receivers
                subject: `Reset Password`, // Subject line


                html: View.render("mail/forget_password", {
					recipient_name: data.recipient_name,
					link: data.link,
					token: data.token,
					expired_time: data.expired_time
					
				}),
            });



			return {
                status: true,
                message: "Reset password link already send to email"
            };

        } catch (error) {
            console.log('error',error)
			return {

                status: false,
                message: error.message
            };
        }
	}

    async Referrer(to) {
        try {

            let info = await transporter.sendMail({
                from: Env.get("NOREPLY_FULLADDRESS"), // sender address
                to: to.to, // list of receivers
                subject: `Congratulations, you get new referral`, // Subject line


                html: View.render("mail/referrer", {
					recipient_name: to.recipient_name,
				}),
            });



			return {
                status: true,
                message: "success"
            };

        } catch (error) {
            console.log('error',error)
			return {

                status: false,
                message: error.message
            };
        }
    }

    async Withdraw(data) {
        try {

            let info = await transporter.sendMail({
                from: Env.get("NOREPLY_FULLADDRESS"), // sender address
                to: data.to, // list of receivers
                bcc: Env.get("EMAIL_BCC"),
                subject: `Request withdraw`, // Subject line


                html: View.render("mail/withdraw", {
					recipient_name: data.recipient_name,
                    value: data.request
				}),
            });



			return {
                status: true,
                message: "success"
            };

        } catch (error) {
            console.log('error',error)
			return {

                status: false,
                message: error.message
            };
        }
    }

    async SendMail(data){
        try {

            let info = await transporter.sendMail({
                from: data.from, // sender address
                to: data.to, // list of receivers
                bcc: data.bcc,
                cc: data.cc,
                subject: data.subject, // Subject line
                html: data.contentHTML
            });



			return {
                status: true,
                message: "success"
            };

        } catch (error) {
            console.log('error',error)
			return {

                status: false,
                message: error.message
            };
        }
    }

    async RequestDemo(data) {
        
    }


}

module.exports = new BasicEmailService();
