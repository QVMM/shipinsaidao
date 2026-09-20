import { DatabaseSync } from 'node:sqlite'

/**
 * Minimal better-sqlite3-compatible facade backed by Node's built-in SQLite.
 * Keeping this adapter local removes a platform-specific native dependency,
 * which is important for a Windows package that must run fully offline.
 */
export default class Database {
  constructor(file) {
    this.db = new DatabaseSync(file)
  }

  exec(sql) {
    return this.db.exec(sql)
  }

  prepare(sql) {
    return this.db.prepare(sql)
  }

  pragma(statement) {
    return this.db.exec(`PRAGMA ${statement}`)
  }

  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        const result = fn(...args)
        this.db.exec('COMMIT')
        return result
      } catch (error) {
        try {
          this.db.exec('ROLLBACK')
        } catch {
          // Preserve the original error if rollback itself cannot be completed.
        }
        throw error
      }
    }
  }

  close() {
    return this.db.close()
  }
}
