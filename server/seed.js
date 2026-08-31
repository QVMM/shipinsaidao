import { loadEnv } from './env.js'
import { seed, DEFAULT_BATCH_ID } from './db.js'
import { FLEET_IDS } from '../src/data-fleet.js'
import { ACCOUNTS } from './roles.js'

loadEnv()
seed()
console.log('已写入 SQLite：账号 + 焦点批次', DEFAULT_BATCH_ID, '+ 体系', FLEET_IDS.length, '批')
for (const id of FLEET_IDS) console.log('  ', id)
for (const a of ACCOUNTS) {
  console.log(`  ${a.username}  ${a.role}  ${a.displayName}  默认密码见 README`)
}
console.log('默认密码必须改（现在是演示口令）。口令本身不打印。')
