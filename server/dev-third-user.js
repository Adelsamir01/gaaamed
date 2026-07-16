// مستخدمة تجريبية ثالثة (ليلى) — تصادق Sara و Ali لتفعيل اختبار الجروبات
// تبقى متصلة 10 دقائق حتى يظهر مؤشر "متصل" أثناء الاختبار
import WebSocket from 'ws'

const SARA = 'f9e900f3-46bd-46e1-896d-c3fcfe09f625'
const ALI = 'c2ce4f81-4399-4c82-83a1-2597709cc52d'
const ws = new WebSocket('ws://localhost:8787')

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'identify', deviceId: 'dev-layla-1', name: 'ليلى', avatar: '🌙', handle: 'layla' }))
})
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.type === 'identified') {
    console.log('identified:', msg.user.userId, msg.user.handle)
    ws.send(JSON.stringify({ type: 'friend_add', userId: SARA }))
    ws.send(JSON.stringify({ type: 'friend_add', userId: ALI }))
    console.log('friend_add sent for Sara + Ali')
  }
  if (msg.type === 'friends') {
    console.log('friends list:', JSON.stringify(msg.friends.map((f) => f.name)))
  }
})
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1) })
setTimeout(() => { console.log('done, closing'); ws.close(); process.exit(0) }, 10 * 60 * 1000)
