/*
 * Test réseau : démarre le serveur, connecte deux clients simulés,
 * joue quelques actions et vérifie que les deux états restent identiques.
 * Exécution : node test/net.test.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3199;
const ROOT = path.join(__dirname, '..');

const src =
  fs.readFileSync(path.join(ROOT, 'public/js/data.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'public/js/game.js'), 'utf8');
const G = new Function(src + '\nreturn { createGameState, applyAction, legalMoveCells, abilityTargets };')();

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

class Client {
  constructor() {
    this.ws = new WebSocket('ws://localhost:' + PORT);
    this.queue = [];
    this.waiters = [];
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      const w = this.waiters.find(x => x.type === m.t);
      if (w) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(m);
      } else {
        this.queue.push(m);
      }
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  waitFor(type, timeout = 5000) {
    const i = this.queue.findIndex(m => m.t === type);
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      this.waiters.push({ type, resolve });
      setTimeout(() => reject(new Error('timeout en attendant ' + type)), timeout);
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { failures++; console.error('  ✘ ÉCHEC : ' + msg); }
}

(async () => {
  console.log('Test réseau :');
  const server = spawn('node', [path.join(ROOT, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'pipe'
  });
  server.stderr.on('data', d => console.error('[serveur] ' + d));
  await wait(600);

  try {
    const c1 = new Client();
    const c2 = new Client();
    await wait(300);

    c1.send({ t: 'create', name: 'Alice' });
    const created = await c1.waitFor('created');
    assert(/^[A-Z2-9]{4}$/.test(created.code), 'code de partie généré (' + created.code + ')');

    c2.send({ t: 'join', name: 'Bob', code: created.code });
    await c2.waitFor('joined');
    const lobby1 = await c1.waitFor('lobby');
    const lobby2 = await c2.waitFor('lobby');
    assert(lobby1.youAre === 'p1' && lobby2.youAre === 'p2', 'rôles attribués');

    c2.send({ t: 'join', name: 'Charlie', code: created.code });
    const err = await c2.waitFor('error');
    assert(!!err.msg, 'troisième joueur refusé (salle complète)');

    const teamA = [{ id: 'stark', level: 1 }, { id: 'fern', level: 2 }, { id: 'heiter', level: 1 }, { id: 'frieren', level: 1 }];
    const teamB = [{ id: 'eisen', level: 1 }, { id: 'lugner', level: 1 }, { id: 'denken', level: 3 }, { id: 'aura', level: 1 }];
    c1.send({ t: 'ready', chars: teamA });
    c2.send({ t: 'ready', chars: teamB });
    const s1 = await c1.waitFor('start');
    const s2 = await c2.waitFor('start');
    assert(s1.youAre === 'p1' && s2.youAre === 'p2', 'départ de partie annoncé aux deux joueurs');
    assert(s1.mapId === s2.mapId && JSON.stringify(s1.teams) === JSON.stringify(s2.teams), 'carte et équipes identiques des deux côtés');

    // Chaque client reconstruit l'état localement
    const st1 = G.createGameState(s1.mapId, s1.teams, s1.names);
    const st2 = G.createGameState(s2.mapId, s2.teams, s2.names);

    // Déroulement : quelques actions relayées
    async function play(actor, stActor, stOther, action) {
      const res = G.applyAction(stActor, actor === c1 ? 'p1' : 'p2', action);
      if (!res.ok) throw new Error('action refusée côté émetteur : ' + res.err);
      actor.send({ t: 'action', action });
      const relayed = await (actor === c1 ? c2 : c1).waitFor('action');
      const resOther = G.applyAction(stOther, actor === c1 ? 'p1' : 'p2', relayed.action);
      if (!resOther.ok) throw new Error('action refusée côté destinataire : ' + resOther.err);
    }

    // Tour de p1 : déplacement de Stark
    const stark = st1.units.p1_stark;
    const firstMove = [...G.legalMoveCells(st1, stark).keys()][0];
    const [mx, my] = firstMove.split(',').map(Number);
    await play(c1, st1, st2, { k: 'move', u: 'p1_stark', x: mx, y: my });
    assert(JSON.stringify(st1) === JSON.stringify(st2), 'états identiques après un déplacement');

    await play(c1, st1, st2, { k: 'end', u: '' });
    await play(c2, st2, st1, { k: 'end', u: '' });
    assert(JSON.stringify(st1) === JSON.stringify(st2), 'états identiques après un tour complet');

    // Le client 2 ne peut pas jouer pendant le tour du client 1
    const refused = G.applyAction(st2, 'p2', { k: 'end', u: '' });
    assert(!refused.ok, 'action hors tour refusée');

    // Revanche
    c1.send({ t: 'rematch' });
    await c2.waitFor('opponentRematch');
    c2.send({ t: 'rematch' });
    await c1.waitFor('lobby');
    await c2.waitFor('lobby');
    assert(true, 'revanche : retour au lobby pour les deux joueurs');

    // Déconnexion
    c2.close();
    const left = await c1.waitFor('opponentLeft');
    assert(!!left, 'déconnexion signalée à l’adversaire');

    c1.close();
  } catch (e) {
    failures++;
    console.error('  ✘ ÉCHEC : ' + e.message);
  } finally {
    server.kill();
  }

  console.log(failures === 0 ? '\nTous les tests réseau passent ✔' : '\n' + failures + ' test(s) en échec ✘');
  process.exit(failures === 0 ? 0 : 1);
})();
