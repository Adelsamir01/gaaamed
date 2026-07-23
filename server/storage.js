import { existsSync } from 'node:fs'
import { DocumentDatabase, resolveDatabasePath } from './database.js'
import { PostgresDocumentDatabase } from './postgres-database.js'

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

export async function openDatabase(dataDir, environment = process.env) {
  const connectionString = String(environment.DEDOS_DATABASE_URL ?? '').trim()
  if (!connectionString) return new DocumentDatabase(resolveDatabasePath(dataDir, environment))

  const database = await PostgresDocumentDatabase.open(connectionString, environment)
  const sqlitePath = resolveDatabasePath(dataDir, environment)
  if (
    enabled(environment.DEDOS_MIGRATE_SQLITE_ON_EMPTY)
    && existsSync(sqlitePath)
    && await database.documentCount() === 0
  ) {
    const sqlite = new DocumentDatabase(sqlitePath)
    try {
      await database.importDocuments(sqlite.listDocuments())
    } finally {
      sqlite.close()
    }
  }
  return database
}
