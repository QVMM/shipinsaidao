import { loadEnv, assertProductionSecrets } from './env.js'
import { buildApp } from './app.js'

loadEnv()
assertProductionSecrets()

const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '0.0.0.0'

const app = await buildApp()
await app.listen({ port, host })
app.log.info(`替抗蓟划 listening on http://${host}:${port}/`)
