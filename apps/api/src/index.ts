import { buildApp } from './app'
import { ensureAdmin, ensureSettings } from './bootstrap.js'
import { env } from './config.js'
import { startMonthlyReportJob } from './jobs/monthly-report.js'

const app = await buildApp()
await ensureSettings(app.prisma)
await ensureAdmin(app.prisma, 'bootstrap')
const stopMonthlyReport = startMonthlyReportJob(app.prisma, app.log)
app.addHook('onClose', async () => {
  stopMonthlyReport()
})
await app.listen({ host: env.host, port: env.port })
