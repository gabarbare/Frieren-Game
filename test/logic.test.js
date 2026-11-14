/*
 * Test de la logique de jeu : combat complet simulé + cas de règles précis.
 * Exécution : node test/logic.test.js
 */
const fs = require('fs');
const path = require('path');

const src =
  fs.readFileSync(path.join(__dirname, '../public/js/data.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(__dirname, '../public/js/game.js'), 'utf8');
const G = new Function(src + '\nreturn { CHARACTERS, MAPS, createGameState, applyAction, legalMoveCells, abilityTargets, matchRewards, aliveMain };')();

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✔ ' + msg); }
  else { failures++; console.error('  ✘ ÉCHEC : ' + msg); }
}

function team(ids, lvl) {
  return ids.map(id => ({ id, level: lvl || 1 }));
}

function dist(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

// IA de test simple : avance vers l'ennemi le plus proche et attaque avec une capacité offensive.
function aiStep(st, role) {
  for (const u of Object.values(st.units)) {
    if (st.winner) return;
    if (!u.alive || u.owner !== role || u.acted) continue;
    if (!u.moved) {
      const enemies = Object.values(st.units).filter(e => e.alive && e.owner !== role);
      let best = null, bestD = Infinity;
      const cur = Math.min(...enemies.map(e => dist(e, u)));
      for (const [k] of G.legalMoveCells(st, u)) {
        const [x, y] = k.split(',').map(Number);
        const d = Math.min(...enemies.map(e => dist(e, { x, y })));
        if (d < bestD || (d === bestD && best && (y < best.y || (y === best.y && x < best.x)))) {
          best = { x, y }; bestD = d;
        }
      }
      if (best && bestD < cur) {
        const r = G.applyAction(st, role, { k: 'move', u: u.id, x: best.x, y: best.y });
        if (!r.ok) throw new Error('déplacement IA refusé : ' + r.err);
      } else {
        u.moved = true;
      }
    }
    if (!u.acted) {
      for (let i = 0; i < u.abilities.length; i++) {
        const ab = u.abilities[i];
        if (!ab.fx.some(f => String(f.k).startsWith('dmg'))) continue;
        const targets = G.abilityTargets(st, u, i);
        if (targets.length) {
          const t = targets[0];
          const r = G.applyAction(st, role, { k: 'ability', u: u.id, a: i, x: t.x, y: t.y });
          if (!r.ok) throw new Error('capacité IA refusée : ' + r.err);
          break;
        }
      }
    }
  }
  if (!st.winner) {
    const r = G.applyAction(st, role, { k: 'end', u: '' });
    if (!r.ok) throw new Error('fin de tour refusée');
  }
}

// ---------- 1. Combat complet entre deux équipes ----------
console.log('Combat complet simulé :');
{
  const teams = {
    p1: team(['frieren', 'fern', 'stark', 'heiter']),
    p2: team(['eisen', 'aura', 'lugner', 'denken'])
  };
  const st = G.createGameState('plaines', teams, { p1: 'Alice', p2: 'Bob' });
  assert(G.aliveMain(st, 'p1') === 4 && G.aliveMain(st, 'p2') === 4, '8 unités en jeu au départ');

  let rounds = 0;
  while (!st.winner && rounds < 80) {
    aiStep(st, st.current);
    rounds++;
  }
  assert(st.winner !== null, 'un vainqueur émerge (obtenu : ' + st.winner + ', tours d’actions : ' + rounds + ')');
  const deaths = Object.values(st.units).filter(u => !u.alive).length;
  assert(deaths >= 4, 'au moins 4 unités tombées (' + deaths + ')');
  const rewards = G.matchRewards(st);
  if (st.winner === 'draw') {
    assert(rewards.p1 === 40 && rewards.p2 === 40, 'récompenses de match nul');
  } else {
    const surv = G.aliveMain(st, st.winner);
    assert(rewards[st.winner] === 120 + 15 * surv, 'récompense du vainqueur = 120 + 15 × survivants (' + rewards[st.winner] + ')');
    assert(rewards[st.winner === 'p1' ? 'p2' : 'p1'] === 40, 'récompense du perdant = 40');
  }

  // Déterminisme : rejouer exactement la même partie donne le même état final
  const st2 = G.createGameState('plaines', teams, { p1: 'Alice', p2: 'Bob' });
  let rounds2 = 0;
  while (!st2.winner && rounds2 < 80) {
    aiStep(st2, st2.current);
    rounds2++;
  }
  assert(JSON.stringify(st2) === JSON.stringify(st), 'deux parties identiques → états finaux identiques');
}

// ---------- 2. Règles précises ----------
console.log('Règles de capacités et statuts :');

function setup(map, p1, p2) {
  return G.createGameState(map || 'plaines', { p1: team(p1), p2: team(p2) }, { p1: 'A', p2: 'B' });
}

// Bouclier de Frieren
{
  const st = setup('plaines', ['frieren'], ['lugner']);
  const f = st.units.p1_frieren, l = st.units.p2_lugner;
  f.x = 2; f.y = 4; l.x = 3; l.y = 4;
  let r = G.applyAction(st, 'p1', { k: 'ability', u: 'p1_frieren', a: 1, x: 2, y: 4 });
  assert(r.ok, 'Barrière runique lancée');
  assert(f.statuses.some(s => s.s === 'shield'), 'bouclier appliqué');
  const hpBefore = f.hp;
  st.current = 'p2';
  r = G.applyAction(st, 'p2', { k: 'ability', u: 'p2_lugner', a: 0, x: 2, y: 4 });
  assert(r.ok && f.hp === hpBefore, 'le bouclier absorbe les dégâts');
}

// Immunité de Denken et Land bloque la première attaque
{
  const st = setup('plaines', ['methode', 'land'], ['denken']);
  const m = st.units.p1_methode, d = st.units.p2_denken;
  m.x = 3; m.y = 4; d.x = 4; m.y = 4; d.y = 4;
  let r = G.applyAction(st, 'p1', { k: 'ability', u: 'p1_methode', a: 1, x: 4, y: 4 });
  assert(r.ok && !d.statuses.some(s => s.s === 'stun'), 'Denken résiste à l’étourdissement');

  const land = st.units.p1_land;
  land.x = 6; land.y = 6;
  st.current = 'p2';
  const hpBefore = land.hp;
  r = G.applyAction(st, 'p2', { k: 'ability', u: 'p2_denken', a: 0, x: 6, y: 6 });
  assert(r.ok && land.hp === hpBefore, 'Land annule la première attaque du tour');
  d.acted = false; // même tour : Denken réattaque, le blocage de Land est déjà consommé
  r = G.applyAction(st, 'p2', { k: 'ability', u: 'p2_denken', a: 0, x: 6, y: 6 });
  assert(r.ok && land.hp < hpBefore, 'la deuxième attaque blesse Land');
}

// Clone de Land : apparition puis dissipation
{
  const st = setup('plaines', ['land'], ['frieren']);
  const land = st.units.p1_land;
  const r = G.applyAction(st, 'p1', { k: 'ability', u: 'p1_land', a: 1, x: land.x + 1, y: land.y });
  assert(r.ok, 'Clone invoqué');
  const clone = Object.values(st.units).find(u => u.isClone && u.alive);
  assert(!!clone, 'le clone existe');
  assert(G.aliveMain(st, 'p1') === 1, 'le clone ne compte pas pour la victoire');
  G.applyAction(st, 'p1', { k: 'end', u: '' });
  G.applyAction(st, 'p2', { k: 'end', u: '' });
  G.applyAction(st, 'p1', { k: 'end', u: '' });
  G.applyAction(st, 'p2', { k: 'end', u: '' });
  G.applyAction(st, 'p1', { k: 'end', u: '' });
  G.applyAction(st, 'p2', { k: 'end', u: '' });
  assert(!clone.alive, 'le clone se dissipe après 2 tours');
}

// Ligne de vue : un mur bloque les projectiles
{
  const st = setup('ruines', ['fern'], ['frieren']);
  const fern = st.units.p1_fern, fri = st.units.p2_frieren;
  fern.x = 1; fern.y = 1; fri.x = 11; fri.y = 7;
  // Mur en (2,1) et (3,1) → pas de ligne de tir horizontale directe
  const blocked = !G.abilityTargets(st, fern, 0).some(c => c.x === 11 && c.y === 7);
  assert(blocked, 'les murs bloquent les attaques à distance');
}

// Obstacles infranchissables
{
  const st = setup('goldene', ['stark'], ['kraft']);
  const stark = st.units.p1_stark;
  const moves = G.legalMoveCells(st, stark);
  assert(![...moves.keys()].some(k => { const [x, y] = k.split(',').map(Number); return st.terrain[y][x] !== '.'; }),
    'aucun déplacement sur un obstacle');
}

// Auserlese : condition sous 60% de PV
{
  const st = setup('plaines', ['aura'], ['kraft']);
  const aura = st.units.p1_aura, kraft = st.units.p2_kraft;
  aura.x = 3; aura.y = 4; kraft.x = 5; kraft.y = 4;
  let targets = G.abilityTargets(st, aura, 1);
  assert(!targets.some(c => c.x === 5 && c.y === 4), 'Auserlese refusée sur cible pleine vie');
  kraft.hp = Math.floor(kraft.maxHp * 0.5);
  targets = G.abilityTargets(st, aura, 1);
  assert(targets.some(c => c.x === 5 && c.y === 4), 'Auserlese autorisée sous 60% de PV');
  G.applyAction(st, 'p1', { k: 'ability', u: 'p1_aura', a: 1, x: 5, y: 4 });
  assert(kraft.statuses.some(s => s.s === 'stun'), 'Auserlese étourdit la cible affaiblie');
}

// Validation des actions illégales
{
  const st = setup('plaines', ['frieren'], ['fern']);
  let r = G.applyAction(st, 'p2', { k: 'end', u: '' });
  assert(!r.ok, 'impossible de finir le tour de l’adversaire');
  r = G.applyAction(st, 'p1', { k: 'move', u: 'p1_frieren', x: 12, y: 8 });
  assert(!r.ok, 'déplacement hors de portée refusé');
  r = G.applyAction(st, 'p1', { k: 'ability', u: 'p1_frieren', a: 0, x: 12, y: 8 });
  assert(!r.ok, 'attaque hors de portée refusée');
}

console.log(failures === 0 ? '\nTous les tests de logique passent ✔' : '\n' + failures + ' test(s) en échec ✘');
process.exit(failures === 0 ? 0 : 1);
