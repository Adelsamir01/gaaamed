import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { PushNotificationService, createFirebaseMessaging } from './push-notifications.js'
import { UserStore } from './users.js'

const TOKEN_A = `token_a:${'a'.repeat(90)}`
const TOKEN_B = `token_b:${'b'.repeat(90)}`
const TOKEN_C = `token_c:${'c'.repeat(90)}`

function createStore() {
  const directory = mkdtempSync(join(tmpdir(), 'dedos-push-test-'))
  const store = new UserStore(directory)
  return {
    store,
    close() {
      store.close()
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

test('push registrations persist per user, move between owners, and delete with the account', () => {
  const fixture = createStore()
  try {
    const first = fixture.store.identify({ deviceId: 'push-device-a', name: 'Adam', avatar: '😎' }).user
    const second = fixture.store.identify({ deviceId: 'push-device-b', name: 'Badr', avatar: '🦊' }).user

    fixture.store.registerPushToken(first.userId, TOKEN_A)
    fixture.store.registerPushToken(first.userId, TOKEN_B)
    fixture.store.registerPushToken(second.userId, TOKEN_A)

    assert.deepEqual(fixture.store.registrationsForUsers([first.userId]).map(({ token }) => token), [TOKEN_B])
    assert.deepEqual(fixture.store.registrationsForUsers([second.userId]).map(({ token }) => token), [TOKEN_A])
    assert.equal(fixture.store.pushRegistrationCount(), 2)
    assert.equal(fixture.store.deletePushTokensForUser(second.userId), 1)
    assert.equal(fixture.store.pushRegistrationCount(), 1)
    assert.throws(() => fixture.store.registerPushToken(first.userId, 'bad token'), /غير صالح/)
  } finally {
    fixture.close()
  }
})

test('chat pushes target recipients only, carry deep-link data, and prune invalid tokens', async () => {
  const fixture = createStore()
  try {
    const sender = fixture.store.identify({ deviceId: 'sender-device', name: 'نور', avatar: '🌟' }).user
    const firstRecipient = fixture.store.identify({ deviceId: 'recipient-one', name: 'سارة', avatar: '🎮' }).user
    const secondRecipient = fixture.store.identify({ deviceId: 'recipient-two', name: 'عمر', avatar: '🐍' }).user
    fixture.store.registerPushToken(sender.userId, TOKEN_A)
    fixture.store.registerPushToken(firstRecipient.userId, TOKEN_B)
    fixture.store.registerPushToken(secondRecipient.userId, TOKEN_C)

    let payload = null
    const messaging = {
      async sendEachForMulticast(message) {
        payload = message
        return {
          successCount: 1,
          failureCount: 1,
          responses: [
            { success: true },
            { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          ],
        }
      },
    }
    const service = new PushNotificationService({ tokenStore: fixture.store, messaging })
    const result = await service.sendChatNotification({
      thread: { id: 'thread_exact_chat', memberIds: [sender.userId, firstRecipient.userId, secondRecipient.userId] },
      message: {
        id: 'message_123',
        senderName: 'نور',
        text: 'أهلًا! نلعب؟',
        kind: 'text',
      },
      senderId: sender.userId,
    })

    assert.deepEqual(payload.tokens, [TOKEN_B, TOKEN_C])
    assert.equal(payload.notification.title, 'نور')
    assert.equal(payload.notification.body, 'أهلًا! نلعب؟')
    assert.equal(payload.data.threadId, 'thread_exact_chat')
    assert.equal(payload.android.priority, 'high')
    assert.equal(payload.android.notification.channelId, 'dedos-social')
    assert.deepEqual(result, { sent: 1, failed: 1 })
    assert.equal(fixture.store.registrationsForUsers([secondRecipient.userId]).length, 0)
    assert.equal(fixture.store.registrationsForUsers([sender.userId]).length, 1)
  } finally {
    fixture.close()
  }
})

test('game invitations use a clean game-specific notification without exposing the room code', async () => {
  const fixture = createStore()
  try {
    const sender = fixture.store.identify({ deviceId: 'invite-sender', name: 'ليلى', avatar: '🎨' }).user
    const recipient = fixture.store.identify({ deviceId: 'invite-recipient', name: 'منى', avatar: '🍬' }).user
    fixture.store.registerPushToken(recipient.userId, TOKEN_B)
    let payload = null
    const messaging = {
      async sendEachForMulticast(message) {
        payload = message
        return { successCount: 1, failureCount: 0, responses: [{ success: true }] }
      },
    }
    const service = new PushNotificationService({ tokenStore: fixture.store, messaging })

    await service.sendChatNotification({
      thread: { id: 'invite_thread', memberIds: [sender.userId, recipient.userId] },
      message: {
        id: 'invite_message',
        senderName: 'ليلى',
        text: 'دعوة للعب حلاوة',
        kind: 'game_invite',
        invite: { gameName: 'حلاوة', gameEmoji: '🍬', roomCode: '1234' },
      },
      senderId: sender.userId,
    })

    assert.equal(payload.notification.body, '🍬 عازمك تلعب حلاوة')
    assert.equal(payload.data.messageKind, 'game_invite')
    assert.ok(!JSON.stringify(payload).includes('1234'))
  } finally {
    fixture.close()
  }
})

test('Firebase remains an explicit optional server capability until credentials are installed', () => {
  assert.equal(createFirebaseMessaging({
    FIREBASE_SERVICE_ACCOUNT_FILE: join(tmpdir(), `dedos-missing-firebase-key-${Date.now()}.json`),
  }), null)
})
