/*
 * Test de rendu : charge le client avec un DOM et un canvas simulés,
 * puis dessine chaque personnage et chaque carte pour détecter toute erreur.
 * Exécution : node test/render.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- stubs de navigateur ----

const ctxStub = new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 60 });
    if (p === 'canvas') return { width: 728, height: 504 };
    if (!(p in t)) t[p] = (...args) => ctxStub;
    return t[p];
  },
  set(t, p, v) { t[p] = v; return true; }
});

function makeEl(tag) {
  const target = {
    tag,
    classList: { add() {}, remove() {}, contains() { return false; } },
    style: {},
    width: 728,
    height: 504,
    addEventListener() {},
    appendChild() {},
    scrollTop: 0,
    scrollHeight: 0
  };
  return new Proxy(target, {
    get(t, p) {
      if (p === 'getContext') return () => ctxStub;
      if (p === 'querySelector') return () => makeEl('button');
      if (p === 'querySelectorAll') return () => [];
      if (p in t) return t[p];
      return undefined;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

global.document = {
  getElementById: () => makeEl('div'),
  createElement: (tag) => makeEl(tag),
  querySelectorAll: () => []
};
global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] !== undefined ? this._s[k] : null; },
  setItem(k, v) { this._s[k] = String(v); }
};
global.location = { protocol: 'http:', host: 'localhost:3000' };
global.WebSocket = class {
  constructor() { this.readyState = 1; }
  send() {}
  close() {}
};
global.alert = () => {};

// ---- chargement du code du jeu ----

const src =
  read('public/js/data.js') + '\n' +
  read('public/js/game.js') + '\n' +
  read('public/js/main.js') + '\n' +
  'return { CHARACTERS, CHAR_ART, MAPS, createGameState, applyAction, legalMoveCells, abilityTargets,\n' +
  '  drawUnit, drawBoard,\n' +
  '  setState: s => { state = s; }, setRole: r => { myRole = r; }, setSel: s => { sel = s; },\n' +
  '  setMode: m => { mode = m; }, setHover: h => { hoverCell = h; },\n' +
  '  setTarget: (cells, i) => { targetCells = cells; targetAbility = i; } };';

let G;
try {
  G = new Function(src)();
} catch (e) {
  console.error('  ✘ ÉCHEC : chargement du client impossible : ' + e.message);
  process.exit(1);
}

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { failures++; console.error('  ✘ ÉCHEC : ' + msg); }
}

function team(ids, lvl) { return ids.map(id => ({ id, level: lvl || 1 })); }

console.log('Rendu des personnages :');

// Chaque personnage a une apparence définie
const ids = Object.keys(G.CHARACTERS).concat('clone');
assert(ids.every(id => G.CHAR_ART[id]), 'une apparence est définie pour les ' + ids.length + ' personnages (+ clone)');
assert(ids.every(id => G.CHAR_ART[id].hair && G.CHAR_ART[id].style && G.CHAR_ART[id].outfit),
  'apparences complètes (cheveux, coupe, tenue)');

// Dessin de chaque personnage dans tous ses états
let drew = 0;
try {
  const st = G.createGameState('plaines', {
    p1: team(Object.keys(G.CHARACTERS).slice(0, 4)),
    p2: team(Object.keys(G.CHARACTERS).slice(4, 8))
  }, { p1: 'A', p2: 'B' });
  G.setState(st);
  G.setRole('p1');
  for (const id of ids) {
    for (const owner of ['p1', 'p2']) {
      const fake = {
        id: 'u_' + id + owner, charId: id, name: G.CHARACTERS[id] ? G.CHARACTERS[id].name : 'Clone',
        owner, x: 3, y: 4, hp: 50, maxHp: 100, acted: false, moved: false, isClone: id === 'clone',
        statuses: [{ s: 'shield', v: 20, t: 2 }, { s: 'stun', t: 1 }]
      };
      G.setSel(fake.id);
      G.drawUnit(ctxStub, fake);
      G.setSel(null);
      fake.acted = true;
      G.drawUnit(ctxStub, fake);
      fake.acted = false;
      drew += 2;
    }
  }
  assert(true, drew + ' dessins de personnages exécutés sans erreur');
} catch (e) {
  failures++;
  console.error('  ✘ ÉCHEC : erreur de dessin : ' + e.stack.split('\n').slice(0, 3).join(' | '));
}

console.log('Rendu des cartes :');

let boards = 0;
try {
  for (const mapId of Object.keys(G.MAPS)) {
    const st = G.createGameState(mapId, {
      p1: team(['frieren', 'stark', 'heiter', 'land']),
      p2: team(['aura', 'lugner', 'denken', 'macht'])
    }, { p1: 'A', p2: 'B' });
    G.setState(st);
    G.setRole('p1');
    const u = Object.values(st.units)[0];
    G.setSel(u.id);
    G.setMode('move');
    G.setHover({ x: u.x, y: u.y });
    G.drawBoard(ctxStub);
    G.setMode('target');
    G.setTarget([{ x: 5, y: 4 }], 0);
    G.drawBoard(ctxStub);
    G.setMode('idle');
    G.setHover(null);
    G.drawBoard(ctxStub);
    boards += 3;
  }
  assert(true, boards + ' rendus de plateau exécutés sans erreur (4 cartes × 3 modes)');
} catch (e) {
  failures++;
  console.error('  ✘ ÉCHEC : erreur de rendu de carte : ' + e.stack.split('\n').slice(0, 3).join(' | '));
}

console.log(failures === 0 ? '\nTous les tests de rendu passent ✔' : '\n' + failures + ' test(s) en échec ✘');
process.exit(failures === 0 ? 0 : 1);
