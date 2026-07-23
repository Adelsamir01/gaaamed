import pg from 'pg'

const { Pool } = pg
const HEALTH_INTERVAL_MS = 10_000

function serialise(value) {
  return JSON.stringify(value)
}

function clone(value) {
  return JSON.parse(serialise(value))
}

function partKey(...path) {
  return JSON.stringify(path)
}

function flattenDocument(data) {
  const parts = new Map()
  for (const [field, value] of Object.entries(data ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parts.set(partKey(field), serialise({ __object: true }))
      for (const [key, child] of Object.entries(value)) parts.set(partKey(field, key), serialise(child))
      continue
    }
    parts.set(partKey(field), serialise(value))
  }
  return parts
}

function rebuildDocument(rows) {
  const document = {}
  for (const { part_key: key, value } of rows) {
    const path = JSON.parse(key)
    if (path.length === 1) {
      document[path[0]] = value?.__object === true ? {} : value
      continue
    }
    document[path[0]] ??= {}
    document[path[0]][path[1]] = value
  }
  return document
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

export class PostgresDocumentDatabase {
  static async open(connectionString, environment = process.env) {
    const database = new PostgresDocumentDatabase(connectionString, environment)
    await database.initialize()
    return database
  }

  constructor(connectionString, environment = process.env) {
    this.pool = new Pool({
      connectionString,
      max: positiveInteger(environment.DEDOS_PG_POOL_MAX, 10, 50),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'dedos-server',
    })
    this.documents = new Map()
    this.persistedParts = new Map()
    this.pending = Promise.resolve()
    this.lastError = null
    this.closed = false
    this.healthTimer = null
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dedos_document_parts (
        document_name TEXT NOT NULL,
        part_key TEXT NOT NULL,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (document_name, part_key)
      );
      CREATE INDEX IF NOT EXISTS dedos_document_parts_updated_at
        ON dedos_document_parts(updated_at);
    `)
    const { rows } = await this.pool.query(`
      SELECT document_name, part_key, value
      FROM dedos_document_parts
      ORDER BY document_name, part_key
    `)
    const grouped = new Map()
    for (const row of rows) {
      let documentRows = grouped.get(row.document_name)
      if (!documentRows) {
        documentRows = []
        grouped.set(row.document_name, documentRows)
      }
      documentRows.push(row)
    }
    for (const [name, documentRows] of grouped) {
      const data = rebuildDocument(documentRows)
      this.documents.set(name, data)
      this.persistedParts.set(name, flattenDocument(data))
    }
    this.lastError = null
    this.healthTimer = setInterval(() => void this.checkHealth(), HEALTH_INTERVAL_MS)
    if (this.healthTimer.unref) this.healthTimer.unref()
  }

  loadDocument(name, fallback) {
    const existing = this.documents.get(name)
    if (existing) return { ...clone(fallback), ...clone(existing) }
    const initial = clone(fallback)
    this.documents.set(name, initial)
    this.saveDocument(name, initial)
    return initial
  }

  saveDocument(name, data) {
    if (this.closed) throw new Error('Database is closed')
    const snapshot = clone(data)
    this.documents.set(name, snapshot)
    const nextParts = flattenDocument(snapshot)
    const persisted = this.persistedParts.get(name) ?? new Map()
    const upserts = [...nextParts].filter(([key, value]) => persisted.get(key) !== value)
    const removals = [...persisted.keys()].filter((key) => !nextParts.has(key))
    if (upserts.length === 0 && removals.length === 0) return this.pending

    this.pending = this.pending
      .then(async () => {
        const client = await this.pool.connect()
        try {
          await client.query('BEGIN')
          for (const [key, value] of upserts) {
            await client.query(`
              INSERT INTO dedos_document_parts(document_name, part_key, value, updated_at)
              VALUES ($1, $2, $3::jsonb, NOW())
              ON CONFLICT(document_name, part_key) DO UPDATE
                SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
            `, [name, key, value])
          }
          if (removals.length > 0) {
            await client.query(
              'DELETE FROM dedos_document_parts WHERE document_name = $1 AND part_key = ANY($2::text[])',
              [name, removals],
            )
          }
          await client.query('COMMIT')
          this.persistedParts.set(name, nextParts)
          this.lastError = null
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {})
          this.lastError = error
          throw error
        } finally {
          client.release()
        }
      })
      .catch((error) => {
        this.lastError = error
        console.error('[postgres] document write failed', error)
      })
    return this.pending
  }

  async importDocuments(documents) {
    for (const { name, data } of documents) this.saveDocument(name, data)
    await this.flush()
  }

  async documentCount() {
    const { rows } = await this.pool.query('SELECT COUNT(DISTINCT document_name)::int AS count FROM dedos_document_parts')
    return Number(rows[0]?.count) || 0
  }

  async checkHealth() {
    try {
      await this.pool.query('SELECT 1')
      this.lastError = null
    } catch (error) {
      this.lastError = error
    }
  }

  health() {
    return {
      ok: !this.closed && !this.lastError,
      engine: 'postgresql',
      ...(this.lastError ? { error: this.lastError.message } : {}),
    }
  }

  async flush() {
    await this.pending
    if (this.lastError) throw this.lastError
  }

  checkpoint() {}

  backupTo() {
    throw new Error('PostgreSQL backups use pg_dump; run deploy/backup.sh on the production host.')
  }

  async close() {
    if (this.closed) return
    this.closed = true
    if (this.healthTimer) clearInterval(this.healthTimer)
    await this.flush()
    await this.pool.end()
  }
}
