const WebSocket = require('ws');
const BASE = 'https://shakhbata.adelsamir.com';

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error || 'HTTP error'} (${res.status})`);
  return data;
}

function connectWS(code, playerId, name = 'player') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://shakhbata.adelsamir.com/ws?room=${code}&player=${playerId}`);
    const messages = [];
    let gotState = false;
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', room: code, player: playerId })));
    ws.on('message', d => { const m = JSON.parse(d); messages.push(m); if (m.type === 'state') gotState = true; });
    ws.on('error', e => reject(new Error(`${name} WS error: ${e.message}`)));
    ws.on('close', (c, r) => { if (!gotState) reject(new Error(`${name} WS closed before state: ${c} ${r}`)); });
    setTimeout(() => reject(new Error(`${name} WS timeout`)), 10000);
    ws.waitForState = () => new Promise(r => {
      const check = () => {
        const msg = messages.slice(-1).find(m => m.type === 'state');
        if (msg) r(msg.room); else setTimeout(check, 100);
      };
      check();
    });
    ws.getMessages = () => messages;
    ws.sendJSON = obj => ws.send(JSON.stringify(obj));
    resolve(ws);
  });
}

function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

(async () => {
  const dev = 'dev-' + Date.now();

  console.log('TEST 1: Create private room');
  const create = await api('/api/create', { name: 'Host', settings: { rounds: 2, drawTime: 30, maxPlayers: 6 }, deviceId: dev + '-host' });
  assert(create.room.hostId === create.playerId, 'host should be creator');
  assert(create.room.status === 'lobby', 'room in lobby');
  console.log('  OK', create.room.code);

  console.log('TEST 2: Host WebSocket');
  const hostWs = await connectWS(create.room.code, create.playerId, 'host');
  let state = await hostWs.waitForState();
  assert(state.players.length === 1, 'host is only player');
  console.log('  OK');

  console.log('TEST 3: Guest joins private room');
  const join = await api('/api/join', { name: 'Guest', code: create.room.code, deviceId: dev + '-guest' });
  assert(join.playerId !== create.playerId, 'guest gets new id');
  console.log('  OK', join.playerId);

  console.log('TEST 4: Guest WebSocket');
  const guestWs = await connectWS(create.room.code, join.playerId, 'guest');
  state = await guestWs.waitForState();
  assert(state.players.length === 2, 'two players');
  console.log('  OK');

  console.log('TEST 5: Room settings');
  hostWs.sendJSON({ type: 'room-settings', rounds: 2, drawTime: 45, maxPlayers: 8 });
  await new Promise(r => setTimeout(r, 300));
  state = await hostWs.waitForState();
  assert(state.totalRounds === 2, 'rounds updated');
  assert(state.drawTime === 45, 'draw time updated');
  assert(state.maxPlayers === 8, 'max players updated');
  console.log('  OK');

  console.log('TEST 6: Start game');
  hostWs.sendJSON({ type: 'start' });
  await new Promise(r => setTimeout(r, 500));
  state = await hostWs.waitForState();
  assert(state.status === 'choosing', 'game in choosing');
  assert(state.drawerId === create.playerId, 'host is drawer');
  assert(state.wordOptions.length === 3, 'word options shown');
  console.log('  OK', state.status);

  console.log('TEST 7: Choose word');
  const word = state.wordOptions[1];
  hostWs.sendJSON({ type: 'choose-word', word });
  await new Promise(r => setTimeout(r, 500));
  state = await hostWs.waitForState();
  assert(state.status === 'playing', 'game playing');
  assert(state.wordLength > 0, 'word length set');
  console.log('  OK word length', state.wordLength);

  console.log('TEST 8: Draw stroke');
  hostWs.sendJSON({ type: 'draw', event: { type: 'stroke', strokeId: 's1', points: [{x:0.1,y:0.1},{x:0.2,y:0.2}], color: '#111827', size: 5, tool: 'pen' } });
  await new Promise(r => setTimeout(r, 500));
  const guestDraws = guestWs.getMessages().filter(m => m.type === 'draw');
  assert(guestDraws.length === 1, 'guest received draw');
  assert(guestDraws[0].seq === 1, 'draw seq 1');
  console.log('  OK');

  console.log('TEST 9: Correct guess');
  guestWs.sendJSON({ type: 'guess', text: word });
  await new Promise(r => setTimeout(r, 500));
  state = await guestWs.waitForState();
  assert(state.status === 'reveal', 'round revealed');
  const guestScore = state.players.find(p => p.id === join.playerId)?.score;
  const hostScore = state.players.find(p => p.id === create.playerId)?.score;
  assert(guestScore > 0, 'guest scored');
  assert(hostScore > 0, 'drawer scored');
  console.log('  OK guest', guestScore, 'host', hostScore);

  console.log('TEST 10: Next round starts');
  await new Promise(r => setTimeout(r, 5500));
  state = await guestWs.waitForState();
  assert(state.status === 'choosing', 'next round choosing');
  assert(state.round === 2, 'round 2');
  console.log('  OK round', state.round);

  console.log('TEST 11: Guest drawer chooses');
  const word2 = state.wordOptions[0];
  guestWs.sendJSON({ type: 'choose-word', word: word2 });
  await new Promise(r => setTimeout(r, 500));
  state = await guestWs.waitForState();
  assert(state.status === 'playing', 'playing');
  assert(state.drawerId === join.playerId, 'guest is drawer');
  console.log('  OK');

  console.log('TEST 12: Non-drawer draw ignored');
  hostWs.sendJSON({ type: 'draw', event: { type: 'stroke', strokeId: 's2', points: [{x:0.3,y:0.3}], color: '#111827', size: 5, tool: 'pen' } });
  await new Promise(r => setTimeout(r, 300));
  const hostDraws = hostWs.getMessages().filter(m => m.type === 'draw' && m.event.strokeId === 's2');
  assert(hostDraws.length === 0, 'non-drawer stroke not broadcast');
  console.log('  OK');

  console.log('TEST 13: Round 2 guess');
  guestWs.sendJSON({ type: 'draw', event: { type: 'stroke', strokeId: 's3', points: [{x:0.4,y:0.4},{x:0.5,y:0.5}], color: '#111827', size: 5, tool: 'pen' } });
  await new Promise(r => setTimeout(r, 300));
  hostWs.sendJSON({ type: 'guess', text: word2 });
  await new Promise(r => setTimeout(r, 500));
  state = await hostWs.waitForState();
  assert(state.status === 'reveal', 'round 2 reveal');
  console.log('  OK');

  console.log('TEST 14: Game ends');
  await new Promise(r => setTimeout(r, 5500));
  state = await hostWs.waitForState();
  assert(state.status === 'ended', 'game ended');
  console.log('  OK');

  console.log('TEST 15: Reconnect');
  hostWs.close();
  await new Promise(r => setTimeout(r, 500));
  const hostWs2 = await connectWS(create.room.code, create.playerId, 'host2');
  state = await hostWs2.waitForState();
  assert(state.status === 'ended', 'still ended after reconnect');
  console.log('  OK');

  console.log('TEST 16: Leave and rejoin');
  hostWs2.close();
  await new Promise(r => setTimeout(r, 500));
  const rejoin = await api('/api/join', { name: 'HostRejoin', code: create.room.code, deviceId: dev + '-host' });
  assert(rejoin.playerId === create.playerId, 'same player on rejoin');
  console.log('  OK');

  console.log('TEST 17: Quick-play');
  const q1 = await api('/api/quick-play', { name: 'QP1', deviceId: dev + '-qp1' });
  assert(q1.room.isPublic === true, 'public room');
  const qws1 = await connectWS(q1.room.code, q1.playerId, 'qp1');
  state = await qws1.waitForState();
  assert(state.players.length >= 1, 'public has players');
  assert(state.maxPlayers === 4, 'public max players is 4');
  console.log('  OK', q1.room.code, 'players', state.players.length);

  const q2 = await api('/api/quick-play', { name: 'QP2', deviceId: dev + '-qp2' });
  const qws2 = await connectWS(q2.room.code, q2.playerId, 'qp2');
  state = await qws2.waitForState();
  assert(state.players.length >= 1, 'public has players');
  console.log('  OK players', state.players.length);
  qws1.close();
  qws2.close();

  console.log('TEST 18: Invite link join');
  const invite = await api('/api/create', { name: 'Inviter', settings: { rounds: 2, drawTime: 30, maxPlayers: 6 }, deviceId: dev + '-inviter' });
  const inviteJoin = await api('/api/join', { name: 'Invitee', code: invite.room.code, deviceId: dev + '-invitee' });
  assert(inviteJoin.room.code === invite.room.code, 'joined invite room');
  assert(inviteJoin.playerId !== invite.playerId, 'invitee gets new id');
  const inviteeWs = await connectWS(invite.room.code, inviteJoin.playerId, 'invitee');
  state = await inviteeWs.waitForState();
  assert(state.players.length === 2, 'inviter + invitee in room');
  console.log('  OK', invite.room.code);

  console.log('TEST 19: Three players in room');
  const r3 = await api('/api/create', { name: 'Host3', settings: { rounds: 2, drawTime: 30, maxPlayers: 6 }, deviceId: dev + '-host3' });
  const j3a = await api('/api/join', { name: 'Player3A', code: r3.room.code, deviceId: dev + '-p3a' });
  const j3b = await api('/api/join', { name: 'Player3B', code: r3.room.code, deviceId: dev + '-p3b' });
  const r3Ws = await connectWS(r3.room.code, r3.playerId, 'r3');
  const j3aWs = await connectWS(j3a.room.code, j3a.playerId, 'j3a');
  const j3bWs = await connectWS(j3b.room.code, j3b.playerId, 'j3b');
  state = await r3Ws.waitForState();
  assert(state.players.length === 3, 'three players present');
  console.log('  OK');

  console.log('TEST 20: Drawer disconnect during choosing');
  const d1 = await api('/api/create', { name: 'Drawer1', settings: { rounds: 2, drawTime: 30, maxPlayers: 6 }, deviceId: dev + '-d1' });
  const g1 = await api('/api/join', { name: 'Guesser1', code: d1.room.code, deviceId: dev + '-g1' });
  const d1Ws = await connectWS(d1.room.code, d1.playerId, 'd1');
  const g1Ws = await connectWS(g1.room.code, g1.playerId, 'g1');
  await d1Ws.waitForState();
  await g1Ws.waitForState();
  d1Ws.sendJSON({ type: 'start' });
  await new Promise(r => setTimeout(r, 500));
  state = await d1Ws.waitForState();
  assert(state.status === 'choosing', 'choosing');
  assert(state.drawerId === d1.playerId, 'd1 is drawer');
  d1Ws.close();
  await new Promise(r => setTimeout(r, 500));
  state = await g1Ws.waitForState();
  assert(state.drawerId === g1.playerId, 'g1 became drawer after d1 left');
  console.log('  OK');

  console.log('TEST 21: Drawer disconnect during playing');
  const d2 = await api('/api/create', { name: 'Drawer2', settings: { rounds: 2, drawTime: 30, maxPlayers: 6 }, deviceId: dev + '-d2' });
  const g2 = await api('/api/join', { name: 'Guesser2', code: d2.room.code, deviceId: dev + '-g2' });
  const d2Ws = await connectWS(d2.room.code, d2.playerId, 'd2');
  const g2Ws = await connectWS(g2.room.code, g2.playerId, 'g2');
  await d2Ws.waitForState();
  await g2Ws.waitForState();
  d2Ws.sendJSON({ type: 'start' });
  await new Promise(r => setTimeout(r, 500));
  state = await d2Ws.waitForState();
  const word3 = state.wordOptions[0];
  d2Ws.sendJSON({ type: 'choose-word', word: word3 });
  await new Promise(r => setTimeout(r, 500));
  state = await g2Ws.waitForState();
  assert(state.status === 'playing', 'playing');
  d2Ws.close();
  await new Promise(r => setTimeout(r, 500));
  state = await g2Ws.waitForState();
  assert(state.status === 'reveal' || state.status === 'ended', 'round ended after drawer left');
  console.log('  OK', state.status);

  console.log('TEST 22: Auto word choice on timeout');
  const d3 = await api('/api/create', { name: 'Drawer3', settings: { rounds: 2, drawTime: 30, maxPlayers: 6 }, deviceId: dev + '-d3' });
  const g3 = await api('/api/join', { name: 'Guesser3', code: d3.room.code, deviceId: dev + '-g3' });
  const d3Ws = await connectWS(d3.room.code, d3.playerId, 'd3');
  const g3Ws = await connectWS(g3.room.code, g3.playerId, 'g3');
  await d3Ws.waitForState();
  await g3Ws.waitForState();
  d3Ws.sendJSON({ type: 'start' });
  await new Promise(r => setTimeout(r, 500));
  state = await d3Ws.waitForState();
  assert(state.status === 'choosing', 'choosing');
  await new Promise(r => setTimeout(r, 12500));
  state = await g3Ws.waitForState();
  assert(state.status === 'playing', 'auto selected word after timeout');
  console.log('  OK');

  console.log('TEST 23: Round timeout reveal');
  const d4 = await api('/api/create', { name: 'Drawer4', settings: { rounds: 2, drawTime: 35, maxPlayers: 6 }, deviceId: dev + '-d4' });
  const g4 = await api('/api/join', { name: 'Guesser4', code: d4.room.code, deviceId: dev + '-g4' });
  const d4Ws = await connectWS(d4.room.code, d4.playerId, 'd4');
  const g4Ws = await connectWS(g4.room.code, g4.playerId, 'g4');
  await d4Ws.waitForState();
  await g4Ws.waitForState();
  d4Ws.sendJSON({ type: 'start' });
  await new Promise(r => setTimeout(r, 500));
  state = await d4Ws.waitForState();
  d4Ws.sendJSON({ type: 'choose-word', word: state.wordOptions[0] });
  await new Promise(r => setTimeout(r, 500));
  state = await g4Ws.waitForState();
  assert(state.status === 'playing', 'playing');
  await new Promise(r => setTimeout(r, 38000));
  state = await g4Ws.waitForState();
  assert(state.status === 'reveal' || state.status === 'choosing', 'revealed or next round after time expired: ' + state.status);
  console.log('  OK', state.status);

  console.log('TEST 24: Close guess hint');
  const d5 = await api('/api/create', { name: 'Drawer5', settings: { rounds: 2, drawTime: 30, maxPlayers: 6 }, deviceId: dev + '-d5' });
  const g5 = await api('/api/join', { name: 'Guesser5', code: d5.room.code, deviceId: dev + '-g5' });
  const d5Ws = await connectWS(d5.room.code, d5.playerId, 'd5');
  const g5Ws = await connectWS(g5.room.code, g5.playerId, 'g5');
  await d5Ws.waitForState();
  await g5Ws.waitForState();
  d5Ws.sendJSON({ type: 'start' });
  await new Promise(r => setTimeout(r, 500));
  state = await d5Ws.waitForState();
  const word5 = state.wordOptions[0];
  d5Ws.sendJSON({ type: 'choose-word', word: word5 });
  await new Promise(r => setTimeout(r, 500));
  const closeGuess = word5.slice(0, -1) + (word5.slice(-1) === 'ا' ? 'ب' : 'ا');
  g5Ws.sendJSON({ type: 'guess', text: closeGuess });
  await new Promise(r => setTimeout(r, 500));
  const hints = g5Ws.getMessages().filter(m => m.type === 'state' && m.room?.chat?.some(c => c.kind === 'hint' && c.toPlayerId === g5.playerId));
  assert(hints.length >= 1, 'received close guess hint');
  console.log('  OK');

  console.log('TEST 25: Room max 4 players');
  const max4 = await api('/api/create', { name: 'Max4Host', settings: { rounds: 2, drawTime: 35, maxPlayers: 4 }, deviceId: `${dev}-max4-host` });
  for (let i = 0; i < 3; i++) {
    await api('/api/join', { name: `Max4P${i}`, code: max4.room.code, deviceId: `${dev}-max4-${i}` });
  }
  const max4Ws = await connectWS(max4.room.code, max4.playerId, 'max4-host');
  state = await max4Ws.waitForState();
  assert(state.players.length === 4, 'room has 4 players');
  try {
    await api('/api/join', { name: 'Max4P5', code: max4.room.code, deviceId: `${dev}-max4-5` });
    assert(false, 'fifth player should be rejected');
  } catch (e) {
    assert(e.message.includes('409') || e.message.includes('ممتلئة'), 'room full error');
  }
  console.log('  OK');
  max4Ws.close();

  console.log('TEST 26: Public game auto loop');
  const pub1 = await api('/api/quick-play', { name: 'Loop1', deviceId: `${dev}-loop1` });
  const pub2 = await api('/api/join', { name: 'Loop2', code: pub1.room.code, deviceId: `${dev}-loop2` });
  assert(pub2.room.code === pub1.room.code, 'both players in same public room');
  const loop1Ws = await connectWS(pub1.room.code, pub1.playerId, 'loop1');
  const loop2Ws = await connectWS(pub2.room.code, pub2.playerId, 'loop2');
  await loop1Ws.waitForState();
  await loop2Ws.waitForState();
  await new Promise(r => setTimeout(r, 6000));
  state = await loop1Ws.waitForState();
  assert(state.status === 'choosing', 'public game auto started');
  console.log('  OK');
  loop1Ws.close();
  loop2Ws.close();

  console.log('TEST 27: Duplicate device public rejoin');
  const dup1 = await api('/api/quick-play', { name: 'Dup', deviceId: `${dev}-dup` });
  const dup1Ws = await connectWS(dup1.room.code, dup1.playerId, 'dup1');
  await dup1Ws.waitForState();
  dup1Ws.close();
  await new Promise(r => setTimeout(r, 500));
  const dup2 = await api('/api/quick-play', { name: 'DupAgain', deviceId: `${dev}-dup` });
  const dup2Ws = await connectWS(dup2.room.code, dup2.playerId, 'dup2');
  await dup2Ws.waitForState();
  assert(dup2.playerId === dup1.playerId, 'same player on device rejoin');
  console.log('  OK');
  dup2Ws.close();

  console.log('TEST 28: Non-host cannot start');
  const nh = await api('/api/create', { name: 'HostNH', settings: { rounds: 2, drawTime: 30, maxPlayers: 6 }, deviceId: dev + '-nh-host' });
  const nj = await api('/api/join', { name: 'GuestNH', code: nh.room.code, deviceId: dev + '-nh-guest' });
  const nhWs = await connectWS(nh.room.code, nh.playerId, 'nh-host');
  const njWs = await connectWS(nj.room.code, nj.playerId, 'nj-guest');
  await nhWs.waitForState();
  await njWs.waitForState();
  njWs.sendJSON({ type: 'start' });
  await new Promise(r => setTimeout(r, 500));
  state = await njWs.waitForState();
  assert(state.status === 'lobby', 'guest start ignored');
  console.log('  OK');

  console.log('TEST 29: Non-host cannot change settings');
  njWs.sendJSON({ type: 'room-settings', rounds: 10, drawTime: 120, maxPlayers: 12 });
  await new Promise(r => setTimeout(r, 500));
  state = await njWs.waitForState();
  assert(state.totalRounds !== 10, 'guest settings ignored');
  console.log('  OK');

  console.log('TEST 30: Stats endpoint works');
  const stats = await fetch(BASE + '/api/stats').then(r => r.json());
  assert(stats.totals.roomsCreated > 0, 'stats has rooms created');
  assert(stats.totals.playerJoins > 0, 'stats has player joins');
  console.log('  OK');

  guestWs.close();
  inviteeWs.close();
  r3Ws.close();
  j3aWs.close();
  j3bWs.close();
  g1Ws.close();
  g2Ws.close();
  g3Ws.close();
  g4Ws.close();
  g5Ws.close();
  nhWs.close();
  njWs.close();

  console.log('\nALL TESTS PASSED');
  process.exit(0);
})().catch(e => {
  console.error('\nTEST FAILED:', e.message);
  process.exit(1);
});
