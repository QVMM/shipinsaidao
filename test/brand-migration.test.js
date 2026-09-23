import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

function runModule(source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

test('旧名称数据库会在启动时完整迁移到蓟划且外键保持有效', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tihua-brand-migration-'))
  const database = join(directory, 'legacy.db')
  const quotedDatabase = JSON.stringify(database)
  try {
    runModule(`
      process.env.DATABASE_PATH = ${quotedDatabase}
      const { getDb, seed } = await import('./server/db.js')
      seed()
      getDb().close()
    `)

    runModule(`
      let Database
      try {
        Database = (await import('better-sqlite3')).default
      } catch {
        Database = (await import('./server/sqlite.js')).default
      }
      const d = new Database(${quotedDatabase})
      const legacy = String.fromCodePoint(0x84df, 0x5316)
      const current = '蓟划'
      d.pragma('foreign_keys = OFF')
      for (const table of ['batches', 'farm_records', 'med_logs', 'screen_records', 'eval_records', 'reports', 'traces', 'reviews', 'seal_events', 'audit_logs']) {
        const columns = d.prepare(\`PRAGMA table_info(\${table})\`).all()
          .filter((column) => String(column.type || '').toUpperCase().includes('TEXT'))
        for (const column of columns) {
          d.prepare(\`UPDATE \${table} SET "\${column.name}" = replace("\${column.name}", ?, ?)\`)
            .run(current, legacy)
        }
      }
      d.close()
    `)

    const output = runModule(`
      process.env.DATABASE_PATH = ${quotedDatabase}
      const { getDb, ensureSeeded } = await import('./server/db.js')
      ensureSeeded()
      const d = getDb()
      const legacy = String.fromCodePoint(0x84df, 0x5316)
      let remaining = 0
      for (const table of ['batches', 'farm_records', 'med_logs', 'screen_records', 'eval_records', 'reports', 'traces', 'reviews', 'seal_events', 'audit_logs']) {
        const columns = d.prepare(\`PRAGMA table_info(\${table})\`).all()
          .filter((column) => String(column.type || '').toUpperCase().includes('TEXT'))
        for (const column of columns) {
          remaining += d.prepare(\`SELECT COUNT(*) AS n FROM \${table} WHERE instr("\${column.name}", ?) > 0\`)
            .get(legacy).n
        }
      }
      const ids = d.prepare('SELECT batch_id FROM batches ORDER BY id').all().map((row) => row.batch_id)
      const foreignKeyErrors = d.prepare('PRAGMA foreign_key_check').all()
      console.log(JSON.stringify({ remaining, ids, foreignKeyErrors }))
      d.close()
    `)

    const result = JSON.parse(output.split('\n').at(-1))
    assert.equal(result.remaining, 0)
    assert.ok(result.ids.length > 0)
    assert.ok(result.ids.every((id) => id.includes('蓟划')))
    assert.deepEqual(result.foreignKeyErrors, [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
