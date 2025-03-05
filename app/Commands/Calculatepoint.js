'use strict'

const { Command } = require('@adonisjs/ace')
const Database = use('Database')

class Calculatepoint extends Command {
    static get signature() {
        return 'calculatepoint'
    }

    static get description() {
        return 'Hitung ulang pendapatan point member dari history transaksi'
    }

    async handle(args, options) {
        // Get total points per member from point_histories
        const totalPoints = await Database
            .from('point_histories')
            .select('member_id')
            .sum('point as total_point')
            .groupBy('member_id')

        // Update points table with the calculated total points
        for (let totalPoint of totalPoints) {
            const existingPoint = await Database
                .from('points')
                .where('member_id', totalPoint.member_id)
                .first()

            if (existingPoint) {
                // Update existing member's points
                await Database
                    .table('points')
                    .where('member_id', totalPoint.member_id)
                    .update({ 
                        point: totalPoint.total_point,
                        updated_at: Database.raw('CURRENT_TIMESTAMP')
                    })
            } else {
                // Insert new member's points
                await Database
                    .table('points')
                    .insert({ 
                        member_id: totalPoint.member_id, 
                        point: totalPoint.total_point,
                        created_at: Database.raw('CURRENT_TIMESTAMP'),
                        updated_at: Database.raw('CURRENT_TIMESTAMP')
                    })
            }
        }

        this.info('Point berhasil dihitung ulang')
    }
}

module.exports = Calculatepoint