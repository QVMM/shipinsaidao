import { loadEnv } from './env.js'
import { buildApp } from './app.js'

loadEnv()

const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '0.0.0.0'

const app = await buildApp()
await app.listen({ port, host })
app.log.info(`替抗蓟化 listening on http://${host}:${port}/`)
