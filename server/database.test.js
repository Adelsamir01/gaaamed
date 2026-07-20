import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { DocumentDatabase } from './database.js'

const testRoot = path.resolve('server', '.tmp-database-tests')

test.beforeEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
  mkdirSync(testRoot, { recursive: true })
})

test.after(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

test('persists documents atomically and imports legacy JSON once', () => {
  const databasePath = path.join(testRoot, 'dedos.sqlite')
  const legacyPath = path.join(testRoot, 'users.json')
  writeFileSync(legacyPath, JSON.stringify({ version: 1, users: { u1: { name: 'Adel' } } }))

  const first = new DocumentDatabase(databasePath)
  const imported = first.loadDocument('users', { version: 1, users: {} }, legacyPath)
  assert.equal(imported.users.u1.name, 'Adel')
  first.saveDocument('users', { version: 1, users: { u2: { name: 'Mona' } } })
  first.close()

  writeFileSync(legacyPath, JSON.stringify({ version: 1, users: { ignored: {} } }))
  const second = new DocumentDatabase(databasePath)
  const persisted = second.loadDocument('users', { version: 1, users: {} }, legacyPath)
  assert.equal(persisted.users.u2.name, 'Mona')
  assert.equal(persisted.users.ignored, undefined)
  assert.equal(second.health().ok, true)
  second.close()
})

test('creates a standalone verified SQLite backup', () => {
  const databasePath = path.join(testRoot, 'dedos.sqlite')
  const backupPath = path.join(testRoot, 'backups', 'dedos-test.sqlite')
  const database = new DocumentDatabase(databasePath)
  database.saveDocument('users', { version: 1, users: { u1: { name: 'Adel' } } })
  database.backupTo(backupPath)
  database.close()

  assert.equal(existsSync(backupPath), true)
  const backup = new DatabaseSync(backupPath, { readOnly: true })
  try {
    assert.equal(backup.prepare('PRAGMA quick_check').get().quick_check, 'ok')
    const row = backup.prepare('SELECT json FROM documents WHERE name = ?').get('users')
    assert.equal(JSON.parse(row.json).users.u1.name, 'Adel')
  } finally {
    backup.close()
  }
})
