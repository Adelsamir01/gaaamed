/* اختبار بنك الحظ الشامل:
 * الجزء أ: سيناريوهات محرك engine.test.ts الثمانية منقولة حرفيًا (بدون vitest)
 * الجزء ب: تكامل WebSocket عبر الخادم الحقيقي (create → CONNECTED → CREATE_ROOM → JOIN_ROOM → START_GAME → ROLL_DICE → قفل الحركة → شراء)
 * يتطلب أن يكون الخادم يعمل على ws://localhost:8787
 */
import WebSocket from 'ws'
import {
  addPlayer,
  buildProperty,
  buyProperty,
  createGameState,
  rollDice,
  sellProperty,
  startGame,
  BOARD_TILES,
  isPropertyTile,
  ownsFullPropertyGroup,
} from './bankel7az.js'

const URL = 'ws://localhost:8787'
const log = (...a) => console.log(...a)
let failed = false
const assert = (cond, label) => {
  if (cond) log(`  ✓ ${label}`)
  else {
    failed = true
    log(`  ✗ FAILED: ${label}`)
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeout = 10000, step = 100) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = fn()
    if (v) return v
    await wait(step)
  }
  return null
}

// ---------------------------------------------------------------------------
// الجزء أ: سيناريوهات المحرك (نقل حرفي من apps/server/src/game/engine.test.ts)
// ---------------------------------------------------------------------------
function readyGame() {
  const state = createGameState('ABCDE', 'host', 'Host')
  addPlayer(state, 'rival', 'Rival')
  startGame(state, 'host')
  return state
}

function sequence(values) {
  let index = 0
  return () => values[index++] ?? 0
}

function engineTests() {
  log('== الجزء أ: سيناريوهات محرك بنك الحظ ==')

  // 1) lets the current player buy an unowned property
  {
    const state = readyGame()
    const host = state.players[0]
    rollDice(state, host.id, sequence([0, 0.2]))
    buyProperty(state, host.id)
    assert(host.position === 3, 'engine#1 host.position === 3')
    assert(host.properties.includes(3), 'engine#1 host.properties contains 3')
    assert(host.cash === 870, `engine#1 host.cash === 870 (got ${host.cash})`)
    assert(state.currentPlayerId === state.players[1]?.id, 'engine#1 turn passed to rival')
    assert(state.turnPhase === 'roll', 'engine#1 turnPhase === roll')
    assert(state.actionAvailableAt > state.updatedAt, 'engine#1 actionAvailableAt > updatedAt')
  }

  // 2) auto-passes the turn after charging rent to a rival
  {
    const state = readyGame()
    const host = state.players[0]
    const rival = state.players[1]
    rollDice(state, host.id, sequence([0, 0.2]))
    buyProperty(state, host.id)
    rollDice(state, rival.id, sequence([0, 0.2]))
    assert(rival.cash === 988, `engine#2 rival.cash === 988 (got ${rival.cash})`)
    assert(host.cash === 882, `engine#2 host.cash === 882 (got ${host.cash})`)
    assert(state.currentPlayerId === host.id, 'engine#2 turn back to host')
    assert(state.turnPhase === 'roll', 'engine#2 turnPhase === roll')
    assert(state.log.some((entry) => entry.message.includes('هاتو الفلوس اللي عليكوو')), 'engine#2 rent log message')
  }

  // 3) pays the start bonus when a player passes Tahrir Start
  {
    const state = readyGame()
    const host = state.players[0]
    host.position = 37
    rollDice(state, host.id, sequence([0, 0]))
    assert(host.position === 1, `engine#3 host.position === 1 (got ${host.position})`)
    assert(host.cash === 1250, `engine#3 host.cash === 1250 (got ${host.cash})`)
    assert(state.pendingPurchase?.tileId === 1, 'engine#3 pendingPurchase.tileId === 1')
  }

  // 4) lets owners build after completing a group and raises rent
  {
    const state = readyGame()
    const host = state.players[0]
    const rival = state.players[1]
    host.properties.push(1, 2, 3)
    buildProperty(state, host.id, 3)
    state.currentPlayerId = rival.id
    rollDice(state, rival.id, sequence([0, 0.2]))
    assert(state.buildingsByTile[3] === 1, 'engine#4 buildingsByTile[3] === 1')
    assert(host.cash === 991, `engine#4 host.cash === 991 (got ${host.cash})`)
    assert(rival.cash === 959, `engine#4 rival.cash === 959 (got ${rival.cash})`)
  }

  // 5) lets owners sell a property back to the bank at a discount
  {
    const state = readyGame()
    const host = state.players[0]
    host.cash = 100
    host.properties.push(3)
    state.buildingsByTile[3] = 2
    sellProperty(state, host.id, 3)
    assert(host.cash === 230, `engine#5 host.cash === 230 (got ${host.cash})`)
    assert(!host.properties.includes(3), 'engine#5 property removed')
    assert(state.buildingsByTile[3] === undefined, 'engine#5 buildings removed')
  }

  // 6) bankrupts a player and declares the winner
  {
    const state = readyGame()
    const host = state.players[0]
    const rival = state.players[1]
    host.properties.push(3)
    rival.cash = 5
    state.currentPlayerId = rival.id
    rollDice(state, rival.id, sequence([0, 0.2]))
    assert(rival.bankrupt === true, 'engine#6 rival bankrupt')
    assert(state.status === 'finished', 'engine#6 status finished')
    assert(state.winnerId === host.id, 'engine#6 winner is host')
  }

  // 7) keeps every property group contiguous and limited to three governorates
  {
    const groups = new Map()
    for (const tile of BOARD_TILES.filter(isPropertyTile)) {
      const ids = groups.get(tile.group) ?? []
      ids.push(tile.id)
      groups.set(tile.group, ids)
    }
    assert(BOARD_TILES.filter(isPropertyTile).length === 27, 'engine#7 exactly 27 property tiles')
    assert(groups.size === 9, 'engine#7 exactly 9 groups')
    let ok = true
    for (const ids of groups.values()) {
      if (ids.length !== 3 || ids[2] - ids[0] !== 2) ok = false
    }
    assert(ok, 'engine#7 every group has 3 contiguous tiles')
  }

  // 8) only unlocks building after one player owns the complete color group
  {
    const state = readyGame()
    const host = state.players[0]
    const cairo = BOARD_TILES[1]
    if (!isPropertyTile(cairo)) {
      throw new Error('Expected Cairo to be a property')
    }
    host.properties.push(1, 2)
    assert(ownsFullPropertyGroup(cairo, host) === false, 'engine#8 group incomplete')
    let threw = ''
    try {
      buildProperty(state, host.id, 1)
    } catch (e) {
      threw = e.message
    }
    assert(threw.includes('لازم تملك المجموعة'), `engine#8 build blocked: "${threw}"`)
    host.properties.push(3)
    assert(ownsFullPropertyGroup(cairo, host) === true, 'engine#8 group complete')
    let threw2 = ''
    try {
      buildProperty(state, host.id, 1)
    } catch (e) {
      threw2 = e.message
    }
    assert(threw2 === '', 'engine#8 build allowed after completing group')
  }
}

// ---------------------------------------------------------------------------
// الجزء ب: تكامل WebSocket عبر الخادم الحقيقي
// ---------------------------------------------------------------------------
function client(name) {
  const ws = new WebSocket(URL)
  const inbox = []
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())))
  ws.name = name
  ws.inbox = inbox
  ws.send2 = (obj) => ws.send(JSON.stringify(obj))
  ws.sendBank = (msg) => ws.send(JSON.stringify({ type: 'bank', msg }))
  ws.find = (type) => inbox.find((m) => m.type === type)
  ws.last = (type) => [...inbox].reverse().find((m) => m.type === type)
  ws.bankMsgs = () => inbox.filter((m) => m.type === 'bank').map((m) => m.msg)
  ws.lastBank = (type) => [...ws.bankMsgs()].reverse().find((m) => m && m.type === type)
  return ws
}

async function wsTests() {
  log('== الجزء ب: تكامل WebSocket (غرفة بنك الحظ عبر نفق bank) ==')

  // 1) المضيف ينشئ غرفة قييمد بلعبة بنك الحظ → created + CONNECTED عبر النفق
  const host = client('host')
  await wait(200)
  host.send2({ type: 'create', gameId: 'bank-el7az', name: 'آدم', avatar: '🏦' })
  const created = await waitFor(() => host.find('created'))
  assert(created && created.slot === 1, 'ws#1 host received created (slot=1)')
  const code = created?.code
  assert(/^\d{4}$/.test(code || ''), `ws#1 room code is 4 digits: ${code}`)
  const connected1 = await waitFor(() => host.lastBank('CONNECTED'))
  assert(connected1 && typeof connected1.payload.serverTime === 'number', 'ws#1 CONNECTED via bank tunnel')

  // 2) CREATE_ROOM → ROOM_CREATED بنفس كود قييمد ذي الـ 4 أرقام
  host.sendBank({ type: 'CREATE_ROOM', payload: { name: 'آدم' } })
  const roomCreated = await waitFor(() => host.lastBank('ROOM_CREATED'))
  assert(roomCreated && roomCreated.payload.roomCode === code, `ws#2 ROOM_CREATED with gaaamed code: ${roomCreated?.payload?.roomCode}`)
  const hostPlayerId = roomCreated?.payload?.playerId
  assert(typeof hostPlayerId === 'string' && hostPlayerId.length > 0, 'ws#2 host playerId received')
  assert(roomCreated?.payload?.state?.status === 'lobby', 'ws#2 state status lobby')
  assert(roomCreated?.payload?.state?.players?.length === 1, 'ws#2 one player in state')

  // 3) اللاعب الثاني ينضم لغرفة قييمد ثم لغرفة البنك
  const p2 = client('p2')
  await wait(200)
  p2.send2({ type: 'join', code, name: 'بدر', avatar: '🚗' })
  const joined = await waitFor(() => p2.find('joined'))
  assert(joined && joined.slot === 2 && joined.gameId === 'bank-el7az', 'ws#3 p2 joined slot=2')
  assert(joined && joined.players.length === 2, 'ws#3 joined carries 2 players')
  const connected2 = await waitFor(() => p2.lastBank('CONNECTED'))
  assert(!!connected2, 'ws#3 p2 CONNECTED via bank tunnel')
  p2.sendBank({ type: 'JOIN_ROOM', payload: { roomCode: code, name: 'بدر' } })
  const joinedRoom = await waitFor(() => p2.lastBank('JOINED_ROOM'))
  assert(joinedRoom && joinedRoom.payload.roomCode === code, 'ws#4 p2 JOINED_ROOM')
  const p2PlayerId = joinedRoom?.payload?.playerId
  assert(typeof p2PlayerId === 'string' && p2PlayerId.length > 0, 'ws#4 p2 playerId received')
  const lobbyState = await waitFor(() => host.lastBank('GAME_STATE'))
  assert(lobbyState?.payload?.state?.players?.length === 2, 'ws#4 host sees GAME_STATE with 2 players')

  // 5) START_GAME → status playing
  host.sendBank({ type: 'START_GAME' })
  const started = await waitFor(() => host.lastBank('GAME_STATE')?.payload?.state?.status === 'playing' && host.lastBank('GAME_STATE'))
  assert(!!started, 'ws#5 GAME_STATE status=playing on host')
  const started2 = await waitFor(() => p2.lastBank('GAME_STATE')?.payload?.state?.status === 'playing' && p2.lastBank('GAME_STATE'))
  assert(!!started2, 'ws#5 GAME_STATE status=playing on p2')
  assert(started?.payload?.state?.currentPlayerId === hostPlayerId, 'ws#5 current player is host')

  // 6) ROLL_DICE → lastRoll + حركة المضيف
  const posBefore = started.payload.state.players.find((p) => p.id === hostPlayerId).position
  host.sendBank({ type: 'ROLL_DICE' })
  const rolled = await waitFor(() => host.lastBank('GAME_STATE')?.payload?.state?.lastRoll && host.lastBank('GAME_STATE'))
  assert(!!rolled, 'ws#6 GAME_STATE with lastRoll')
  const st6 = rolled.payload.state
  const hostAfter = st6.players.find((p) => p.id === hostPlayerId)
  assert(hostAfter.position !== posBefore || st6.lastRoll.isDouble === false, `ws#6 host moved ${posBefore} → ${hostAfter.position}`)
  assert(st6.lastRoll.total >= 2 && st6.lastRoll.total <= 12, `ws#6 dice total 2..12: ${st6.lastRoll.total}`)
  assert(st6.actionAvailableAt > st6.updatedAt, 'ws#6 action lock set (actionAvailableAt > updatedAt)')

  // 7) قفل «استنى العربية توصل الأول»: أي إجراء قبل انقضاء القفل يُرفض
  host.sendBank({ type: 'ROLL_DICE' })
  const rejected = await waitFor(() => host.lastBank('ACTION_REJECTED'))
  assert(rejected && rejected.payload.message.includes('استنى العربية توصل الأول'), `ws#7 lock rejection: "${rejected?.payload?.message}"`)

  // 8) انتظار انقضاء القفل ثم التصرف حسب مرحلة الدور
  const lockMs = Math.max(0, st6.actionAvailableAt - Date.now()) + 150
  log(`  … انتظار انقضاء قفل الحركة (${lockMs}ms)`)
  await wait(lockMs)
  const stNow = host.lastBank('GAME_STATE').payload.state
  const phase = stNow.turnPhase
  if (phase === 'buy') {
    const tileId = stNow.pendingPurchase.tileId
    const tile = BOARD_TILES.find((t) => t.id === tileId)
    host.sendBank({ type: 'BUY_PROPERTY' })
    const bought = await waitFor(() => {
      const gs = host.lastBank('GAME_STATE')
      return gs?.payload?.state?.players?.find((p) => p.id === hostPlayerId)?.properties.includes(tileId) && gs
    })
    assert(!!bought, `ws#8 BUY_PROPERTY: host owns tile ${tileId} (${tile?.name})`)
    const st8 = bought.payload.state
    assert(st8.currentPlayerId === p2PlayerId, 'ws#8 turn passed to p2 after buy')
    assert(st8.turnPhase === 'roll', 'ws#8 turnPhase roll for p2')
  } else {
    assert(stNow.currentPlayerId === p2PlayerId && phase === 'roll', `ws#8 auto-passed turn to p2 (phase=${phase})`)
    // تمريرة شراء صريحة في دور p2 إن ظهرت مرحلة شراء
    p2.sendBank({ type: 'ROLL_DICE' })
    const rolled2 = await waitFor(() => p2.lastBank('GAME_STATE')?.payload?.state?.lastRoll && p2.lastBank('GAME_STATE')?.payload?.state?.currentPlayerId !== undefined && p2.lastBank('GAME_STATE'))
    assert(!!rolled2, 'ws#8 p2 rolled after lock expired')
    const st8 = rolled2.payload.state
    if (st8.turnPhase === 'buy' && st8.pendingPurchase?.playerId === p2PlayerId) {
      const lockMs2 = Math.max(0, st8.actionAvailableAt - Date.now()) + 150
      await wait(lockMs2)
      p2.sendBank({ type: 'PASS_PROPERTY' })
      const passed = await waitFor(() => p2.lastBank('GAME_STATE')?.payload?.state?.turnPhase === 'roll' && p2.lastBank('GAME_STATE'))
      assert(!!passed, 'ws#8 p2 PASS_PROPERTY → turn advanced')
    }
  }

  // 9) إحصائيات HTTP: /health و /api/stats
  try {
    const health = await fetch('http://localhost:8787/health').then((r) => r.json())
    assert(health && health.ok === true, 'ws#9 /health ok')
    const stats = await fetch('http://localhost:8787/api/stats').then((r) => r.json())
    assert(stats && stats.persistent && stats.live, 'ws#9 /api/stats has persistent+live')
    assert(stats.persistent.totals.roomsCreated >= 1, `ws#9 roomsCreated >= 1 (${stats.persistent.totals.roomsCreated})`)
    assert(stats.live.activeRooms >= 1, `ws#9 live.activeRooms >= 1 (${stats.live.activeRooms})`)
  } catch (e) {
    assert(false, `ws#9 HTTP endpoints failed: ${e.message}`)
  }

  host.close()
  p2.close()
  await wait(200)
}

async function main() {
  engineTests()
  await wsTests()
  log(failed ? '== BANK-EL7AZ SMOKE: SOME CHECKS FAILED ==' : '== BANK-EL7AZ SMOKE: ALL CHECKS PASSED ==')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
