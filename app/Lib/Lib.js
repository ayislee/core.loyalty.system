'use strict'
const Database = use('Database')
const Env = use('Env')
const Mail = use('App/Lib/BasicEmailService')
const sortArray = use('sort-array')
const  bannedwords = use('App/Json/bannedwords')



module.exports = {
    toSlug(Text) {
        let x  = Text.toLowerCase().replace(/ /g,"-")
        let regex = /\?/g;
        let out = x.replace(regex, "");

        console.log('text',Text)
        console.log('out',out)
        return out
    },

    async SystemSetting(key) {
        const setting = await Setting.query()
            .where('key',key)
            .first()
        if(setting){
            return setting.value
        }else{
            return null
        }
    },
    async GenerateSchedules(subscription_id){
        const subscription = await Subscription.query()
            .innerJoin('subscription_schedules','subscription_schedules.subscription_id','subscriptions.subscription_id')
            .where('subscription_id',subscription_id)
            .fetch()

        if(subscription.rows > 0) {
            return false
        }else{
            return true
        }
    },

    async GetDateOfMonth(year,month) {
        // return new Date(`${year}-${month<10?"0"+month:month}-03`)
        let week = 0;
        const  dates = new Date(year, month, 0).getDate();

        const ms_schedule = await MsSchedule.query().fetch()


        let d;
        let mingguan;
        let amingguan = []
        for (const iterator of ms_schedule.rows) {
            switch (iterator.day_of_week) {
                case "Sunday":
                    week = 0;
                    break;
                case "Monday":
                    week = 1;
                    break;
                case "Tuesday":
                    week = 2;
                    break;
                case "Wednesday":
                    week = 3;
                    break;
                case "Thursday":
                    week = 4;
                    break;
                case "Friday":
                    week = 5;
                    break;
                case "Saturday":
                    week = 6;
                    break;
                default:
                    break;
            }
            amingguan.push({
                day: week,
                week_name: iterator.day_of_week,
                hours: iterator.start_hours
            })
        }

        // return amingguan


        let array = []
        for (let date = 1;date<=dates;date++) {
            d = new Date(`${year}-${month<10?"0"+month:month}-${date<10?"0"+date:date}`)
            mingguan = d.getDay()

            for (const iterator of amingguan) {
                if(iterator.day == mingguan){
                    array.push({
                        date: d.toISOString().slice(0, 10),
                        day: iterator.week_name,
                        hours: iterator.hours
                    })
                }
            }
        }

        return array
    },
    async GetSetting(key){

    },
    async GroupPlanSchedule(auth,request) {

    },
    async getCardType( number ) {
        if (number !== '' || number !== null) {
            const amexReg   = new RegExp('^3[47]');
            const jbcReg    = new RegExp('^35(2[89]|[3-8][0-9])');
            const masterReg = new RegExp('^5[1-5][0-9]');
            const visaReg   = new RegExp('^4');

            if (number.toString().match(amexReg)) {
                return 'amex';
            } else if (number.toString().match(jbcReg)) {
                return 'jcb';
            } else if (number.toString().match(masterReg)) {
                return 'mastercard';
            } else if (number.toString().match(visaReg)) {
                return 'visa';
            } else {
                return 'invalid';
            }
        }
    },
    async EmailSender() {

    },
    isEmail( text ) {
        var validRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
        if(text.match(validRegex)){
            return true
        } else {
            return false
        }
    },
    isPhone( text ) {
        var validRegex = /^(^08)(\d{3,4}){2}\d{3,4}$/;
        if(text.match(validRegex)){
            return true
        } else {
            return false
        }
    },
    
    BannedWords( text ) {
        const regexPattern = new RegExp(bannedwords.join('|'), 'gi');
        const filteredMessage = text.replace(regexPattern, '***');
        return filteredMessage;
    }





}

