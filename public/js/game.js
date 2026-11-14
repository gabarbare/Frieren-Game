/*
 * Frieren Tactics — logique de jeu pure (aucune dépendance au DOM).
 * Le même code tourne chez les deux joueurs : les actions sont validées
 * et appliquées de façon déterministe des deux côtés.
 */

const GAME_W = 13;
const GAME_H = 9;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function key(x, y) { return x + ',' + y; }
function cheb(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function blocksLos(t) { return t === 'R' || t === '#'; }

function losClear(st, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    if (blocksLos(st.terrain[y][x])) return false;
  }
  return true;
}

function unitAt(st, x, y) {
  for (const u of Object.values(st.units)) {
    if (u.alive && u.x === x && u.y === y) return u;
  }
  return null;
}

function log(st, msg) {
  st.log.push(msg);
  if (st.log.length > 60) st.log.splice(0, st.log.length - 60);
}

// ---------- création de l'état ----------

function pickSpawns(terrain, role) {
  const cells = [];
  for (let y = 0; y < GAME_H; y++) {
    for (let x = 0; x < GAME_W; x++) {
      if (terrain[y][x] !== '.') continue;
      if (role === 'p1' && x <= 2) cells.push({ x, y });
      if (role === 'p2' && x >= GAME_W - 3) cells.push({ x, y });
    }
  }
  const tx = role === 'p1' ? 0 : GAME_W - 1;
  cells.sort((a, b) =>
    (Math.abs(a.x - tx) + Math.abs(a.y - 4)) - (Math.abs(b.x - tx) + Math.abs(b.y - 4)) ||
    a.y - b.y || a.x - b.x
  );
  const chosen = [];
  for (const c of cells) {
    if (chosen.length >= 4) break;
    if (chosen.every(o => cheb(o, c) >= 2)) chosen.push(c);
  }
  for (const c of cells) {
    if (chosen.length >= 4) break;
    if (!chosen.some(o => o.x === c.x && o.y === c.y)) chosen.push(c);
  }
  return chosen;
}

function makeUnit(def, role, lvl, pos) {
  const m = lvl - 1;
  const maxHp = Math.round(def.hp * (1 + 0.08 * m));
  return {
    id: role + '_' + def.id,
    charId: def.id,
    name: def.name,
    cls: def.cls,
    owner: role,
    x: pos.x, y: pos.y,
    maxHp,
    hp: maxHp,
    atk: Math.round(def.atk * (1 + 0.06 * m)),
    def: Math.round(def.def * (1 + 0.05 * m)),
    vit: def.vit + Math.floor(m / 2),
    move: def.vit + Math.floor(m / 2),
    level: lvl,
    passive: def.passive ? def.passive.id : null,
    abilities: def.abilities,
    cd: def.abilities.map(a => 0),
    statuses: [],
    moved: false,
    acted: false,
    usedBlock: false,
    alive: true,
    isClone: false,
    cloneLife: 0,
    marks: {}
  };
}

function createGameState(mapId, teams, names) {
  const map = MAPS[mapId] || MAPS.plaines;
  const terrain = map.grid.map(r => r.split(''));
  const st = {
    mapId: mapId in MAPS ? mapId : 'plaines',
    mapName: map.name,
    w: GAME_W, h: GAME_H,
    terrain,
    units: {},
    current: 'p1',
    round: 1,
    winner: null,
    names: names || {},
    log: []
  };
  const spawns = { p1: pickSpawns(terrain, 'p1'), p2: pickSpawns(terrain, 'p2') };
  for (const role of ['p1', 'p2']) {
    (teams[role] || []).forEach((entry, i) => {
      const def = CHARACTERS[entry.id];
      if (!def) return;
      const lvl = Math.max(1, Math.min(LEVEL_MAX, entry.level || 1));
      const pos = spawns[role][i] || spawns[role][spawns[role].length - 1];
      st.units[role + '_' + def.id] = makeUnit(def, role, lvl, pos);
    });
  }
  log(st, 'Le combat commence sur ' + map.name + ' !');
  startTurn(st, 'p1');
  return st;
}

// ---------- accès pratiques ----------

function aliveUnitsOf(st, role) {
  return Object.values(st.units).filter(u => u.alive && u.owner === role);
}
function aliveMain(st, role) {
  return Object.values(st.units).filter(u => u.alive && u.owner === role && !u.isClone).length;
}
function enemiesOf(st, u) {
  return Object.values(st.units).filter(x => x.alive && x.owner !== u.owner);
}
function alliesOf(st, u) {
  return Object.values(st.units).filter(x => x.alive && x.owner === u.owner);
}
function hasStatus(u, s) { return u.statuses.some(x => x.s === s); }
function stunImmune(u) { return u.passive === 'denken' || u.passive === 'macht'; }
function deadAllies(st, u) {
  return Object.values(st.units).filter(x => !x.alive && !x.isClone && x.owner === u.owner).length;
}

// ---------- déplacements ----------

function legalMoveCells(st, u) {
  const res = new Map();
  if (!u.alive || u.moved || u.acted || st.winner || u.owner !== st.current) return res;
  res.set(key(u.x, u.y), 0);
  const q = [{ x: u.x, y: u.y, d: 0 }];
  while (q.length) {
    const c = q.shift();
    if (c.d >= u.move) continue;
    for (const [dx, dy] of DIRS4) {
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue;
      const k = key(nx, ny);
      if (res.has(k)) continue;
      if (st.terrain[ny][nx] !== '.') continue;
      if (unitAt(st, nx, ny)) continue;
      res.set(k, c.d + 1);
      q.push({ x: nx, y: ny, d: c.d + 1 });
    }
  }
  res.delete(key(u.x, u.y));
  return res;
}

// ---------- capacités ----------

function abilityRange(st, u, ab) {
  return ab.range + (u.passive === 'wirbel' ? 1 : 0);
}

function abilityTargets(st, u, idx) {
  const ab = u.abilities[idx];
  if (!ab || !u.alive || u.acted || st.winner || u.owner !== st.current) return [];
  if ((u.cd[idx] || 0) > 0) return [];
  const range = abilityRange(st, u, ab);
  const cells = [];
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const d = cheb({ x, y }, u);
      if (d > range) continue;
      if (ab.target === 'self') {
        if (x === u.x && y === u.y) cells.push({ x, y });
        continue;
      }
      if (d === 0 && ab.target !== 'ally') continue;
      if (d >= 2 && !losClear(st, u.x, u.y, x, y)) continue;
      if (ab.target === 'enemy') {
        const t = unitAt(st, x, y);
        if (t && t.owner !== u.owner && meetsCond(ab, t)) cells.push({ x, y });
      } else if (ab.target === 'ally') {
        const t = unitAt(st, x, y);
        if (t && t.owner === u.owner) cells.push({ x, y });
      } else if (ab.target === 'cell') {
        cells.push({ x, y });
      } else if (ab.target === 'free') {
        if (st.terrain[y][x] === '.' && !unitAt(st, x, y)) cells.push({ x, y });
      }
    }
  }
  return cells;
}

function meetsCond(ab, target) {
  if (!ab.cond) return true;
  if (ab.cond === 'hp60') return target.hp < target.maxHp * 0.6;
  return true;
}

// ---------- calcul des dégâts ----------

function calcDamage(st, caster, target, power, ab) {
  let mult = 1;
  for (const s of caster.statuses) {
    if (s.s === 'atkUp') mult += s.v / 100;
    if (s.s === 'atkDown') mult -= s.v / 100;
  }
  const himmel = Object.values(st.units).find(u =>
    u.alive && u.owner === caster.owner && u.charId === 'himmel' && u.id !== caster.id && cheb(u, caster) === 1
  );
  if (himmel) mult += 0.15;
  if (caster.passive === 'fern' && !caster.moved) mult += 0.20;
  if (caster.passive === 'aura' && target.hp < target.maxHp * 0.6) mult += 0.25;
  if (caster.passive === 'ubel' && target.marks.ubel) mult += 0.30;
  if (caster.passive === 'methode' && hasStatus(target, 'stun')) mult += 0.20;
  if (caster.passive === 'solitar') mult += 0.10 * deadAllies(st, caster);

  const raw = caster.atk * power * mult;
  let def = target.def;
  let ignore = 0;
  if (caster.passive === 'lugner') ignore = Math.max(ignore, 0.5);
  if (caster.passive === 'flamme') ignore = Math.max(ignore, 0.25);
  def = def * (1 - ignore);
  let dmg = raw * (1 - def / (def + 50));

  if (target.passive === 'eisen') dmg *= 0.8;
  if (target.passive === 'macht') dmg *= 0.9;
  if (target.passive === 'sense' && ab && ab.range === 1) dmg *= 0.75;
  if (target.passive === 'stark' && !target.usedBlock) {
    dmg *= 0.75;
    target.usedBlock = true;
  }
  if (target.passive === 'land' && !target.usedBlock) {
    return { dmg: 0, blocked: true };
  }
  return { dmg: Math.max(1, Math.round(dmg)), blocked: false };
}

function dealDamage(st, caster, target, power, ab) {
  if (!target.alive) return;
  const r = calcDamage(st, caster, target, power, ab);
  if (r.blocked) {
    target.usedBlock = true;
    log(st, 'Prudence ! ' + target.name + ' annule l’attaque.');
    return;
  }
  let dmg = r.dmg;
  const sh = target.statuses.find(s => s.s === 'shield' && s.v > 0);
  if (sh) {
    const abs = Math.min(sh.v, dmg);
    sh.v -= abs;
    dmg -= abs;
    if (abs > 0) log(st, 'Le bouclier de ' + target.name + ' absorbe ' + abs + ' dégâts.');
    if (sh.v <= 0) target.statuses.splice(target.statuses.indexOf(sh), 1);
  }
  if (dmg <= 0) return;
  if (caster.passive === 'ubel') target.marks.ubel = true;
  target.hp -= dmg;
  log(st, caster.name + ' inflige ' + dmg + ' dégâts à ' + target.name + '.');
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    log(st, target.name + ' est vaincu !');
    checkVictory(st);
  }
}

function healFlat(st, target, amount, caster) {
  if (!target.alive || amount <= 0) return;
  if (hasStatus(target, 'noHeal')) {
    log(st, target.name + ' ne peut pas être soigné (Diagoldze).');
    return;
  }
  const amt = caster && caster.passive === 'heiter' ? Math.round(amount * 1.3) : amount;
  const real = Math.min(target.maxHp - target.hp, amt);
  if (real <= 0) return;
  target.hp += real;
  log(st, target.name + ' récupère ' + real + ' PV.');
}

function addStatus(target, s) {
  const ex = target.statuses.find(x => x.s === s.s);
  if (ex) {
    ex.t = Math.max(ex.t, s.t);
    if (s.v !== undefined) ex.v = Math.max(ex.v, s.v);
  } else {
    target.statuses.push(Object.assign({}, s));
  }
}

function pullUnit(st, caster, target, cells) {
  for (let i = 0; i < cells; i++) {
    const dx = caster.x - target.x, dy = caster.y - target.y;
    let nx = target.x, ny = target.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx !== 0) nx = target.x + Math.sign(dx);
      else if (dy !== 0) ny = target.y + Math.sign(dy);
    } else {
      if (dy !== 0) ny = target.y + Math.sign(dy);
    }
    if (nx === target.x && ny === target.y) break;
    if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) break;
    if (st.terrain[ny][nx] !== '.') break;
    if (unitAt(st, nx, ny)) break;
    target.x = nx; target.y = ny;
  }
  log(st, target.name + ' est attiré vers ' + caster.name + '.');
}

function spawnClone(st, land, tx, ty) {
  const id = land.id + '_c' + Object.keys(st.units).length;
  const maxHp = Math.round(land.maxHp * 0.45);
  st.units[id] = {
    id,
    charId: 'clone',
    name: 'Clone de ' + land.name,
    cls: 'Clone',
    owner: land.owner,
    x: tx, y: ty,
    maxHp, hp: maxHp,
    atk: land.atk, def: land.def,
    vit: 3, move: 3,
    level: land.level,
    passive: null,
    abilities: CLONE_DEF.abilities,
    cd: [0],
    statuses: [],
    moved: false, acted: false, usedBlock: false,
    alive: true,
    isClone: true,
    cloneLife: 2,
    marks: {}
  };
  log(st, land.name + ' crée un clone.');
}

// ---------- utilisation d'une capacité ----------

function useAbility(st, u, ab, idx, tx, ty) {
  u.cd[idx] = ab.cd > 0 ? (u.passive === 'frieren' ? Math.max(1, ab.cd - 1) : ab.cd) : 0;
  log(st, u.name + ' utilise ' + ab.name + '.');
  for (const f of ab.fx) {
    if (f.k === 'dmg') {
      const t = unitAt(st, tx, ty);
      if (t && t.owner !== u.owner) dealDamage(st, u, t, f.v, ab);
    } else if (f.k === 'dmgAdj') {
      for (const e of enemiesOf(st, u).filter(e => cheb(e, u) === 1)) dealDamage(st, u, e, f.v, ab);
    } else if (f.k === 'dmgRad') {
      for (const e of enemiesOf(st, u).filter(e => cheb(e, { x: tx, y: ty }) <= f.r)) dealDamage(st, u, e, f.v, ab);
    } else if (f.k === 'heal') {
      const t = unitAt(st, tx, ty);
      if (t && t.owner === u.owner) healFlat(st, t, f.v, u);
    } else if (f.k === 'healRad') {
      for (const a of alliesOf(st, u).filter(a => cheb(a, { x: tx, y: ty }) <= f.r)) healFlat(st, a, f.v, u);
    } else if (f.k === 'shield') {
      const t = unitAt(st, tx, ty);
      if (t && t.owner === u.owner) { addStatus(t, { s: 'shield', v: f.v, t: f.t }); log(st, t.name + ' gagne un bouclier de ' + f.v + '.'); }
    } else if (f.k === 'shieldRad') {
      for (const a of alliesOf(st, u).filter(a => cheb(a, { x: tx, y: ty }) <= f.r)) {
        addStatus(a, { s: 'shield', v: f.v, t: f.t });
        log(st, a.name + ' gagne un bouclier de ' + f.v + '.');
      }
    } else if (f.k === 'stun') {
      const t = unitAt(st, tx, ty);
      if (t && t.owner !== u.owner) {
        if (stunImmune(t)) log(st, t.name + ' résiste à l’étourdissement !');
        else { addStatus(t, { s: 'stun', t: f.t }); log(st, t.name + ' est étourdi !'); }
      }
    } else if (f.k === 'status') {
      const t = unitAt(st, tx, ty);
      if (t && t.owner !== u.owner) {
        addStatus(t, { s: f.s, v: f.v, t: f.t });
        const labels = { atkUp: '+%v% ATQ', atkDown: '-%v% ATQ', noHeal: 'soins bloqués' };
        log(st, t.name + ' : ' + (labels[f.s] || f.s).replace('%v', f.v) + ' (' + f.t + ' tours).');
      }
    } else if (f.k === 'pull') {
      const t = unitAt(st, tx, ty);
      if (t && t.owner !== u.owner) pullUnit(st, u, t, f.v);
    } else if (f.k === 'clone') {
      spawnClone(st, u, tx, ty);
    }
  }
}

// ---------- tours ----------

function startTurn(st, role) {
  for (const u of Object.values(st.units)) {
    if (u.owner !== role) continue;
    if (u.isClone) {
      u.cloneLife--;
      if (u.cloneLife <= 0) {
        u.alive = false;
        log(st, u.name + ' se dissipe.');
        continue;
      }
    }
    if (!u.alive) continue;
    u.moved = false;
    u.acted = false;
    u.usedBlock = false;
    u.cd = u.cd.map(c => Math.max(0, c - 1));
    u.statuses = u.statuses.filter(s => { s.t--; return s.t > 0; });
    if (u.passive === 'kraft') healFlat(st, u, 8);
  }
  for (const s of aliveUnitsOf(st, role).filter(x => x.passive === 'sein')) {
    for (const a of aliveUnitsOf(st, role).filter(x => x.id !== s.id && cheb(x, s) === 1)) {
      healFlat(st, a, 5);
    }
  }
  for (const u of aliveUnitsOf(st, role)) {
    if (hasStatus(u, 'stun')) {
      u.moved = true;
      u.acted = true;
      log(st, u.name + ' est étourdi et perd son action.');
    }
  }
}

function endTurn(st, role) {
  if (st.winner || st.current !== role) return;
  st.current = role === 'p1' ? 'p2' : 'p1';
  if (st.current === 'p1') st.round++;
  log(st, '— Tour ' + st.round + ' : au tour de ' + (st.names[st.current] || st.current) + ' —');
  startTurn(st, st.current);
  checkVictory(st);
}

function checkVictory(st) {
  if (st.winner) return;
  const p1 = aliveMain(st, 'p1');
  const p2 = aliveMain(st, 'p2');
  if (p1 === 0 && p2 === 0) st.winner = 'draw';
  else if (p2 === 0) st.winner = 'p1';
  else if (p1 === 0) st.winner = 'p2';
  if (st.winner === 'draw') log(st, 'Double KO ! Match nul.');
  else if (st.winner) log(st, (st.names[st.winner] || st.winner) + ' remporte la victoire !');
}

// ---------- actions ----------

function applyAction(st, role, a) {
  if (!a || st.winner) return { ok: false, err: 'Partie terminée.' };
  if (st.current !== role) return { ok: false, err: 'Ce n’est pas ton tour.' };

  if (a.k === 'end') {
    endTurn(st, role);
    return { ok: true };
  }

  const u = st.units[a.u];
  if (!u || !u.alive || u.owner !== role) return { ok: false, err: 'Unité invalide.' };

  if (a.k === 'move') {
    if (u.moved || u.acted) return { ok: false, err: 'Cette unité a déjà agi.' };
    const cells = legalMoveCells(st, u);
    if (!cells.has(key(a.x, a.y))) return { ok: false, err: 'Déplacement impossible.' };
    u.x = a.x;
    u.y = a.y;
    u.moved = true;
    log(st, u.name + ' se déplace.');
    return { ok: true };
  }

  if (a.k === 'ability') {
    if (u.acted) return { ok: false, err: 'Cette unité a déjà agi.' };
    const ab = u.abilities[a.a];
    if (!ab) return { ok: false, err: 'Capacité inconnue.' };
    if ((u.cd[a.a] || 0) > 0) return { ok: false, err: 'Capacité en recharge.' };
    const targets = abilityTargets(st, u, a.a);
    if (!targets.some(c => c.x === a.x && c.y === a.y)) return { ok: false, err: 'Cible invalide.' };
    useAbility(st, u, ab, a.a, a.x, a.y);
    u.acted = true;
    return { ok: true };
  }

  return { ok: false, err: 'Action inconnue.' };
}

// ---------- récompenses ----------

function matchRewards(st) {
  const survivors = { p1: aliveMain(st, 'p1'), p2: aliveMain(st, 'p2') };
  if (st.winner === 'draw') return { p1: LOSE_COINS, p2: LOSE_COINS };
  const r = {};
  for (const role of ['p1', 'p2']) {
    r[role] = st.winner === role
      ? WIN_COINS + SURVIVOR_COINS * survivors[role]
      : LOSE_COINS;
  }
  return r;
}
