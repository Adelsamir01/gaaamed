import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DocumentDatabase } from '../server/database.js'

const dataDir = path.resolve(process.env.DEDOS_DATA_DIR || path.join('server', 'data'))
const databasePath = path.resolve(process.env.DEDOS_DB_PATH || path.join(dataDir, 'dedos.sqlite'))
const backupDir = path.resolve(process.env.DEDOS_BACKUP_DIR || path.join(dataDir, 'backups'))
const retentionDays = Math.max(1, Number(process.env.DEDOS_BACKUP_RETENTION_DAYS) || 30)
const keepCount = Math.max(1, Number(process.env.DEDOS_BACKUP_KEEP) || 30)

if (!existsSync(databasePath)) throw new Error(`Database does not exist: ${databasePath}`)
mkdirSync(backupDir, { recursive: true })

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const fileName = `dedos-${timestamp}.sqlite`
const destination = path.join(backupDir, fileName)
const database = new DocumentDatabase(databasePath)

try {
  database.backupTo(destination)
} finally {
  database.close()
}

const hash = createHash('sha256').update(readFileSync(destination)).digest('hex')
const manifest = {
  createdAt: new Date().toISOString(),
  source: databasePath,
  backup: destination,
  bytes: statSync(destination).size,
  sha256: hash,
}
writeFileSync(`${destination}.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
const backupPattern = /^dedos-\d{4}-\d{2}-\d{2}T[\d-]+Z\.sqlite$/
const backups = readdirSync(backupDir)
  .filter((name) => backupPattern.test(name))
  .map((name) => ({ name, path: path.join(backupDir, name), mtimeMs: statSync(path.join(backupDir, name)).mtimeMs }))
  .sort((a, b) => b.mtimeMs - a.mtimeMs)

for (const [index, backup] of backups.entries()) {
  if (index < keepCount && backup.mtimeMs >= cutoff) continue
  unlinkSync(backup.path)
  if (existsSync(`${backup.path}.json`)) unlinkSync(`${backup.path}.json`)
}

console.log(JSON.stringify({ ok: true, ...manifest }))
