import { existsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const requested = process.argv[2]
if (!requested) throw new Error('Usage: node tools/verify-backup.mjs <backup.sqlite>')
const backupPath = path.resolve(requested)
if (!existsSync(backupPath)) throw new Error(`Backup does not exist: ${backupPath}`)

const database = new DatabaseSync(backupPath, { readOnly: true })
try {
  const check = database.prepare('PRAGMA quick_check').all()
  const documents = database.prepare('SELECT name, updated_at FROM documents ORDER BY name').all()
  const versions = database.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all()
  const ok = check.length === 1 && check[0].quick_check === 'ok'
  console.log(JSON.stringify({ ok, backupPath, check, documents, schemaMigrations: versions }))
  if (!ok) process.exitCode = 1
} finally {
  database.close()
}
