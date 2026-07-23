/**
 * Durable single-process storage for Dedos.
 *
 * SQLite WAL is a better fit than the previous collection of JSON files for the
 * current one-server architecture: atomic commits, crash recovery, one backup
 * artifact, and no native npm dependency on Node 24 (`node:sqlite`). Documents
 * keep the existing in-memory data model stable while allowing a later
 * relational/PostgreSQL migration without changing the game protocol.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 1

export function resolveDatabasePath(dataDir, environment = process.env) {
  const configured = environment.DEDOS_DB_PATH
  if (configured && configured.trim()) return resolve(configured.trim())
  return join(dataDir, 'dedos.sqlite')
}

export class DocumentDatabase {
  constructor(filePath) {
    this.filePath = resolve(filePath)
    this.closed = false
    mkdirSync(dirname(this.filePath), { recursive: true })
    this.db = new DatabaseSync(this.filePath)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS documents (
        name TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    this.db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION, Date.now())
    this.readStatement = this.db.prepare('SELECT json FROM documents WHERE name = ?')
    this.writeStatement = this.db.prepare(`
      INSERT INTO documents(name, json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
    `)
  }

  loadDocument(name, fallback, legacyJsonPath = null) {
    const row = this.readStatement.get(name)
    if (row?.json) {
      try {
        return { ...fallback, ...JSON.parse(row.json) }
      } catch (error) {
        throw new Error(`Database document "${name}" is corrupt: ${error.message}`)
      }
    }

    let initial = fallback
    if (legacyJsonPath && existsSync(legacyJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(legacyJsonPath, 'utf8'))
        if (parsed && typeof parsed === 'object') initial = { ...fallback, ...parsed }
      } catch (error) {
        console.error(`[database] Could not import legacy file ${legacyJsonPath}`, error)
      }
    }
    this.saveDocument(name, initial)
    return initial
  }

  saveDocument(name, data) {
    if (this.closed) throw new Error('Database is closed')
    this.writeStatement.run(name, JSON.stringify(data), Date.now())
  }

  listDocuments() {
    if (this.closed) throw new Error('Database is closed')
    return this.db
      .prepare('SELECT name, json FROM documents ORDER BY name')
      .all()
      .map(({ name, json }) => ({ name, data: JSON.parse(json) }))
  }

  flush() {}

  health() {
    try {
      const row = this.db.prepare('SELECT 1 AS ok').get()
      return { ok: row?.ok === 1, engine: 'sqlite' }
    } catch (error) {
      return { ok: false, engine: 'sqlite', error: error.message }
    }
  }

  checkpoint() {
    if (!this.closed) this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  }

  backupTo(destinationPath) {
    if (this.closed) throw new Error('Database is closed')
    const destination = resolve(destinationPath)
    mkdirSync(dirname(destination), { recursive: true })
    this.checkpoint()
    const escaped = destination.replaceAll("'", "''")
    this.db.exec(`VACUUM INTO '${escaped}'`)
    return destination
  }

  close() {
    if (this.closed) return
    this.checkpoint()
    this.db.close()
    this.closed = true
  }
}
