/**
 * Local cron runner — execute with: npm run cron
 * Reads the schedule from the DB config and runs the bot accordingly.
 * On Vercel, use vercel.json crons instead.
 */
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })
dotenvConfig({ path: '.env' })

import cron from 'node-cron'
import { getDb } from './src/db'
import { config as configTable } from './src/db/schema'
import { runBot } from './src/lib/bot'

async function getSchedule(): Promise<string> {
  try {
    const db = getDb()
    const [cfg] = await db.select().from(configTable).limit(1)
    return cfg?.scheduleCron ?? '0 10 * * *'
  } catch {
    return '0 10 * * *'
  }
}

async function main() {
  const schedule = await getSchedule()
  console.log(`[cron] Iniciando con schedule: ${schedule} (UTC)`)
  console.log(`[cron] Próximo run programado según cron`)

  cron.schedule(schedule, async () => {
    console.log(`[cron] ${new Date().toISOString()} — Ejecutando bot...`)
    try {
      const result = await runBot()
      console.log(`[cron] Resultado: ${result.postsFound} posts nuevos, email enviado: ${result.emailSent}`)
      if (result.error) console.error(`[cron] Error en email: ${result.error}`)
    } catch (e) {
      console.error(`[cron] Error fatal: ${e}`)
    }
  })

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('[cron] Detenido por el usuario')
    process.exit(0)
  })
}

main()
