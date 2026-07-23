import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { PostgresDocumentDatabase } from './postgres-database.js'

const connectionString = process.env.TEST_POSTGRES_URL

test('PostgreSQL persists independently sharded document parts', {
  skip: !connectionString && 'Set TEST_POSTGRES_URL to exercise the PostgreSQL adapter.',
}, async () => {
  const database = await PostgresDocumentDatabase.open(connectionString)
  const name = `test-${randomUUID()}`
  try {
    const document = database.loadDocument(name, { version: 1, threads: {} })
    document.threads.first = { id: 'first', messages: [{ id: 'one', text: 'hello' }] }
    document.threads.second = { id: 'second', messages: [] }
    database.saveDocument(name, document)
    await database.flush()

    document.threads.first.messages.push({ id: 'two', text: 'again' })
    database.saveDocument(name, document)
    await database.flush()

    const { rows } = await database.pool.query(
      'SELECT part_key, value FROM dedos_document_parts WHERE document_name = $1 ORDER BY part_key',
      [name],
    )
    assert.ok(rows.length >= 4)
    assert.ok(rows.some(({ part_key }) => part_key === JSON.stringify(['threads', 'first'])))
    assert.equal(database.health().engine, 'postgresql')
  } finally {
    await database.pool.query('DELETE FROM dedos_document_parts WHERE document_name = $1', [name])
    await database.close()
  }
})
