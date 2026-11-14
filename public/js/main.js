/*
 * Frieren Tactics — client : réseau, écrans, rendu du plateau, interactions.
 */

// ---------- état global du client ----------

let ws = null;
let myRole = null;      // 'p1' ou 'p2'
let myName = '';
let roomCode = '';
let state = null;        // état de la partie (recréé à chaque match)
let sel = null;          // unité sélectionnée (id)
let mode = 'idle';       // 'idle' | 'move' | 'target'
let targetAbility = null;
let moveCells = new Map();
let targetCells = [];
let hoverCell = null;
let picked = [];         // équipe choisie dans le lobby [{id, level}]
let iAmReady = false;
let save = { coins: 0, levels: {} };

const canvas = document.getElementById('board');
const CELL = 56;

// ---------- utilitaires ----------

function $(id) { return document.getElementById(id); }
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  $(id).classList.remove('hidden');
}
function loadSave() {
  try {
    const raw = localStorage.getItem('ft_save_' + myName);
    if (raw) {
      const parsed = JSON.parse(raw);
      save = { coins: parsed.coins || 0, levels: parsed.levels || {} };
    } else {
      save = { coins: 0, levels: {} };
    }
  } catch { save = { coins: 0, levels: {} }; }
}
function persistSave() {
  try { localStorage.setItem('ft_save_' + myName, JSON.stringify(save)); } catch {}
}
function levelOf(charId) { return Math.max(1, Math.min(LEVEL_MAX, save.levels[charId] || 1)); }
function otherRole() { return myRole === 'p1' ? 'p2' : 'p1'; }

function overlay(title, text, btnLabel, onClick) {
  $('overlay-title').textContent = title;
  $('overlay-text').textContent = text;
  $('overlay-btn').textContent = btnLabel;
  $('overlay').classList.remove('hidden');
  $('overlay-btn').onclick = () => {
    $('overlay').classList.add('hidden');
    if (onClick) onClick();
  };
}

// ---------- connexion ----------

function connect(onOpen) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);
  ws.onopen = onOpen;
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    handleMessage(m);
  };
  ws.onclose = () => {
    if (!$('screen-home').classList.contains('hidden')) return;
    overlay('Connexion perdue', 'Le serveur est injoignable. Reviens à l’accueil pour te reconnecter.', 'Retour à l’accueil', goHome);
  };
}

function sendMsg(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

function goHome() {
  if (ws) { try { ws.close(); } catch {} ws = null; }
  myRole = null;
  roomCode = '';
  state = null;
  picked = [];
  iAmReady = false;
  showScreen('screen-home');
}

function handleMessage(m) {
  switch (m.t) {
    case 'created':
      roomCode = m.code;
      $('lobby-code').textContent = m.code;
      $('lobby-players').innerHTML = '<div class="you">👤 ' + escapeHtml(myName) + ' (toi)</div><div>⏳ En attente d’un adversaire…</div>';
      renderMapSelect();
      renderTeamBuilder();
      showScreen('screen-lobby');
      break;

    case 'joined':
      roomCode = m.code;
      break;

    case 'error':
      if (!$('screen-home').classList.contains('hidden')) {
        $('home-error').textContent = m.msg;
      } else {
        overlay('Erreur', m.msg, 'OK', null);
      }
      break;

    case 'lobby':
      myRole = m.youAre;
      iAmReady = false;
      $('lobby-code').textContent = roomCode;
      $('lobby-players').innerHTML =
        '<div class="you">👤 ' + escapeHtml(m.names.p1) + (myRole === 'p1' ? ' (toi)' : '') + '</div>' +
        '<div>👤 ' + escapeHtml(m.names.p2) + (myRole === 'p2' ? ' (toi)' : '') + '</div>';
      renderMapSelect(m.mapId);
      renderTeamBuilder();
      $('lobby-status').textContent = '';
      $('btn-ready').disabled = picked.length !== 4;
      showScreen('screen-lobby');
      break;

    case 'map':
      renderMapSelect(m.mapId);
      break;

    case 'opponentReady':
      $('lobby-status').textContent = 'Ton adversaire est prêt !';
      break;

    case 'start':
      myRole = m.youAre;
      state = createGameState(m.mapId, m.teams, m.names);
      sel = null;
      mode = 'idle';
      showScreen('screen-game');
      renderGame();
      break;

    case 'action': {
      if (!state) break;
      const res = applyAction(state, otherRole(), m.action);
      if (res.ok) {
        renderGame();
        maybeShowResult();
      }
      break;
    }

    case 'opponentLeft':
      overlay('Adversaire parti', 'Ton adversaire a quitté la partie. Tu peux attendre un nouveau joueur avec le même code, ou revenir à l’accueil.', 'Retour à l’accueil', goHome);
      break;

    case 'opponentRematch':
      $('shop-status').textContent = 'Ton adversaire attend ta revanche…';
      break;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- accueil ----------

function initHome() {
  const savedName = localStorage.getItem('ft_name') || '';
  $('name-input').value = savedName;
  $('btn-create').onclick = () => startGame(true);
  $('btn-join').onclick = () => startGame(false);
  $('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') startGame(true); });
  $('code-input').addEventListener('keydown', e => { if (e.key === 'Enter') startGame(false); });
}

function startGame(create) {
  const name = $('name-input').value.trim();
  if (!name) { $('home-error').textContent = 'Choisis un nom de joueur.'; return; }
  if (create === false && $('code-input').value.trim().length !== 4) {
    $('home-error').textContent = 'Entre le code de partie à 4 lettres.';
    return;
  }
  $('home-error').textContent = '';
  myName = name;
  localStorage.setItem('ft_name', name);
  loadSave();
  updateHomeCoins();
  connect(() => {
    if (create) {
      sendMsg({ t: 'create', name: myName });
    } else {
      sendMsg({ t: 'join', name: myName, code: $('code-input').value.trim().toUpperCase() });
    }
  });
}

function updateHomeCoins() {
  loadSave();
  $('home-coins').textContent = save.coins > 0 ? '🪙 ' + save.coins + ' pièces accumulées' : '';
}

// ---------- lobby ----------

let selectedMap = 'plaines';

function renderMapSelect(current) {
  if (current) selectedMap = current;
  const box = $('map-select');
  if (myRole !== 'p1') {
    box.innerHTML = '<p class="hint">Carte choisie par l’hôte : <b>' + escapeHtml((MAPS[selectedMap] || MAPS.plaines).name) + '</b></p>';
    return;
  }
  box.innerHTML = '<h2>Carte de combat</h2>';
  for (const [id, map] of Object.entries(MAPS)) {
    const b = document.createElement('button');
    b.className = 'btn map-btn' + (id === selectedMap ? ' selected' : '');
    b.innerHTML = escapeHtml(map.name) + '<small>' + escapeHtml(map.desc) + '</small>';
    b.onclick = () => {
      selectedMap = id;
      sendMsg({ t: 'map', mapId: id });
      renderMapSelect(id);
    };
    box.appendChild(b);
  }
}

function renderTeamBuilder() {
  const grid = $('char-grid');
  grid.innerHTML = '';
  for (const def of Object.values(CHARACTERS)) {
    const card = document.createElement('div');
    card.className = 'char-card' + (picked.some(p => p.id === def.id) ? ' selected' : '');
    const lvl = levelOf(def.id);
    card.innerHTML =
      '<span class="lvl">Niv. ' + lvl + '</span>' +
      '<h3>' + escapeHtml(def.name) + '</h3>' +
      '<div class="cls">' + escapeHtml(def.cls) + ' — ' + escapeHtml(def.title) + '</div>' +
      '<div class="stats">' +
      '<span>PV <b>' + statAt(def.hp, lvl, 0.08) + '</b></span>' +
      '<span>ATQ <b>' + statAt(def.atk, lvl, 0.06) + '</b></span>' +
      '<span>DÉF <b>' + statAt(def.def, lvl, 0.05) + '</b></span>' +
      '<span>VIT <b>' + (def.vit + Math.floor((lvl - 1) / 2)) + '</b></span>' +
      '</div>' +
      def.abilities.map(a => '<div class="ab"><b>' + escapeHtml(a.name) + '</b> <small>(portée ' + (a.range + (def.passive.id === 'wirbel' ? 1 : 0)) + (a.cd ? ', recharge ' + a.cd : '') + ')</small><br>' + escapeHtml(a.desc) + '</div>').join('') +
      '<div class="pas">✦ ' + escapeHtml(def.passive.name) + ' : ' + escapeHtml(def.passive.desc) + '</div>';
    card.onclick = () => togglePick(def.id);
    grid.appendChild(card);
  }
  renderPicked();
}

function statAt(base, lvl, rate) { return Math.round(base * (1 + rate * (lvl - 1))); }

function togglePick(id) {
  if (iAmReady) return;
  const i = picked.findIndex(p => p.id === id);
  if (i >= 0) picked.splice(i, 1);
  else if (picked.length < 4) picked.push({ id, level: levelOf(id) });
  renderTeamBuilder();
  const btn = $('btn-ready');
  btn.disabled = picked.length !== 4;
  btn.textContent = picked.length === 4 ? 'Prêt !' : 'Prêt ! (' + picked.length + '/4)';
}

function renderPicked() {
  const box = $('team-picked');
  box.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = picked[i];
    const slot = document.createElement('div');
    slot.className = 'slot' + (p ? ' filled' : '');
    slot.textContent = p ? CHARACTERS[p.id].name : 'Emplacement ' + (i + 1);
    box.appendChild(slot);
  }
}

function initLobby() {
  $('btn-ready').onclick = () => {
    if (picked.length !== 4 || iAmReady) return;
    iAmReady = true;
    sendMsg({ t: 'ready', chars: picked });
    $('btn-ready').disabled = true;
    $('btn-ready').textContent = 'En attente de l’adversaire…';
    $('lobby-status').textContent = 'Équipe verrouillée.';
  };
}

// ---------- jeu ----------

function myTurn() { return state && !state.winner && state.current === myRole; }

function renderGame() {
  renderTop();
  drawBoard();
  renderUnitPanel();
  renderAbilities();
  renderLog();
}

function renderTop() {
  $('top-round').textContent = state.mapName + ' — Tour ' + state.round;
  const turnEl = $('top-turn');
  if (state.winner) {
    turnEl.textContent = 'Combat terminé';
    turnEl.className = '';
  } else if (myTurn()) {
    turnEl.textContent = 'À toi de jouer !';
    turnEl.className = 'mine';
  } else {
    turnEl.textContent = 'Tour de l’adversaire…';
    turnEl.className = 'theirs';
  }
  const me = myRole === 'p1' ? state.names.p1 : state.names.p2;
  const them = myRole === 'p1' ? state.names.p2 : state.names.p1;
  $('top-players').textContent = '🔵 ' + me + '  ⚔️  🔴 ' + them;
}

function renderUnitPanel() {
  const panel = $('unit-panel');
  const u = sel ? state.units[sel] : null;
  if (!u) {
    panel.innerHTML = '<p class="hint">Sélectionne une de tes unités sur le plateau pour voir ses détails et utiliser ses capacités.</p>';
    return;
  }
  const def = CHARACTERS[u.charId];
  const pct = Math.round(100 * u.hp / u.maxHp);
  const statuses = u.statuses.map(s => {
    if (s.s === 'stun') return '💤 Étourdi (' + s.t + ')';
    if (s.s === 'shield') return '🛡 Bouclier ' + s.v;
    if (s.s === 'atkUp') return '⬆ ATQ +' + s.v + '%';
    if (s.s === 'atkDown') return '⬇ ATQ -' + s.v + '%';
    if (s.s === 'noHeal') return '🚫 Soins bloqués';
    return s.s;
  }).join(' · ');
  panel.innerHTML =
    '<h3>' + escapeHtml(u.name) + ' <small style="color:var(--muted)">Niv. ' + u.level + (u.isClone ? ' (clone)' : '') + '</small></h3>' +
    '<div class="hpbar"><div style="width:' + pct + '%"></div></div>' +
    '<div class="statline"><span>PV</span><b>' + u.hp + ' / ' + u.maxHp + '</b></div>' +
    '<div class="statline"><span>ATQ</span><b>' + u.atk + '</b></div>' +
    '<div class="statline"><span>DÉF</span><b>' + u.def + '</b></div>' +
    '<div class="statline"><span>VIT (déplacement)</span><b>' + u.move + '</b></div>' +
    (statuses ? '<div class="statuses">' + escapeHtml(statuses) + '</div>' : '') +
    (def && def.passive ? '<div class="pas">✦ ' + escapeHtml(def.passive.name) + ' : ' + escapeHtml(def.passive.desc) + '</div>' : '');
}

function renderAbilities() {
  const box = $('abilities');
  box.innerHTML = '';
  const u = sel ? state.units[sel] : null;
  if (!u || u.owner !== myRole) return;
  u.abilities.forEach((ab, i) => {
    const b = document.createElement('button');
    b.className = 'btn ability-btn';
    const cd = u.cd[i] || 0;
    const range = abilityRange(state, u, ab);
    const disabled = !myTurn() || u.acted || cd > 0;
    b.disabled = disabled;
    b.innerHTML = escapeHtml(ab.name) + (cd > 0 ? ' <span class="cd">⏳ ' + cd + '</span>' : '') +
      '<small>Portée ' + range + (ab.cd ? ' · recharge ' + ab.cd : '') + ' — ' + escapeHtml(ab.desc) + '</small>';
    b.onclick = () => {
      if (mode === 'target' && targetAbility === i) { cancelTargeting(); return; }
      mode = 'target';
      targetAbility = i;
      targetCells = abilityTargets(state, u, i);
      renderGame();
    };
    box.appendChild(b);
  });
}

function renderLog() {
  const box = $('log');
  box.innerHTML = '';
  for (const line of state.log.slice(-30)) {
    const d = document.createElement('div');
    d.textContent = line;
    box.appendChild(d);
  }
  box.scrollTop = box.scrollHeight;
}

function cancelTargeting() {
  mode = sel ? 'move' : 'idle';
  targetAbility = null;
  targetCells = [];
  renderGame();
}

function maybeShowResult() {
  if (!state || !state.winner || !$('overlay').classList.contains('hidden')) return;
  const rewards = matchRewards(state);
  const myCoins = rewards[myRole];
  save.coins += myCoins;
  persistSave();
  const won = state.winner === myRole;
  const title = state.winner === 'draw' ? 'Match nul !' : (won ? '🏆 Victoire !' : '💀 Défaite…');
  const text = won
    ? 'Tu remportes ' + myCoins + ' pièces (' + WIN_COINS + ' + ' + SURVIVOR_COINS + ' par survivant). Dépense-les pour améliorer ton équipe.'
    : 'Tu obtiens ' + myCoins + ' pièces de consolation. Améliore ton équipe et prends ta revanche !';
  overlay(title, text, 'Améliorer l’équipe', () => {
    showShop();
  });
}

// ---------- boutique ----------

function showShop() {
  renderShop();
  showScreen('screen-shop');
}

function renderShop() {
  $('shop-coins').textContent = '🪙 ' + save.coins + ' pièces';
  const grid = $('shop-grid');
  grid.innerHTML = '';
  for (const def of Object.values(CHARACTERS)) {
    const lvl = levelOf(def.id);
    const card = document.createElement('div');
    card.className = 'char-card';
    const maxed = lvl >= LEVEL_MAX;
    const cost = maxed ? 0 : LEVEL_COST[lvl];
    card.innerHTML =
      '<span class="lvl">' + '★'.repeat(lvl) + '</span>' +
      '<h3>' + escapeHtml(def.name) + '</h3>' +
      '<div class="cls">' + escapeHtml(def.cls) + '</div>' +
      '<div class="stats">' +
      '<span>PV <b>' + statAt(def.hp, lvl, 0.08) + '</b></span>' +
      '<span>ATQ <b>' + statAt(def.atk, lvl, 0.06) + '</b></span>' +
      '<span>DÉF <b>' + statAt(def.def, lvl, 0.05) + '</b></span>' +
      '<span>VIT <b>' + (def.vit + Math.floor((lvl - 1) / 2)) + '</b></span>' +
      '</div>' +
      '<div class="upgrade-row">' +
      (maxed
        ? '<span class="pas">Niveau maximum</span>'
        : '<button class="btn" ' + (save.coins < cost ? 'disabled' : '') + '>Niv. ' + (lvl + 1) + ' — 🪙 ' + cost + '</button>') +
      '</div>';
    if (!maxed) {
      card.querySelector('button').onclick = () => {
        if (save.coins < cost) return;
        save.coins -= cost;
        save.levels[def.id] = lvl + 1;
        persistSave();
        renderShop();
      };
    }
    grid.appendChild(card);
  }
}

function initShop() {
  $('btn-rematch').onclick = () => {
    sendMsg({ t: 'rematch' });
    $('btn-rematch').disabled = true;
    $('shop-status').textContent = 'En attente de l’adversaire…';
  };
}

// ---------- rendu du plateau ----------

const TERRAIN_COLORS = {
  '.': ['#b9a77c', '#c1af83'],
  'R': ['#b9a77c', '#c1af83'],
  'W': ['#4a7fb5', '#5288bd'],
  'T': ['#8fa06a', '#97a872'],
  '#': ['#8a7a68', '#92826f']
};

function drawBoard() {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const t = state.terrain[y][x];
      const px = x * CELL, py = y * CELL;
      const colors = TERRAIN_COLORS[t] || TERRAIN_COLORS['.'];
      ctx.fillStyle = colors[(x + y) % 2];
      ctx.fillRect(px, py, CELL, CELL);

      if (t === 'W') {
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath();
        ctx.moveTo(px + 10, py + 22);
        ctx.quadraticCurveTo(px + 20, py + 16, px + 30, py + 22);
        ctx.quadraticCurveTo(px + 40, py + 28, px + 48, py + 22);
        ctx.stroke();
      } else if (t === 'R') {
        ctx.fillStyle = '#7d7d85';
        ctx.beginPath();
        ctx.moveTo(px + 8, py + 46);
        ctx.lineTo(px + 18, py + 14);
        ctx.lineTo(px + 34, py + 20);
        ctx.lineTo(px + 46, py + 44);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.fillRect(px + 18, py + 14, 16, 6);
      } else if (t === 'T') {
        ctx.fillStyle = '#5d4632';
        ctx.fillRect(px + 24, py + 34, 8, 14);
        ctx.fillStyle = '#3f7d38';
        ctx.beginPath();
        ctx.arc(px + 28, py + 26, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.beginPath();
        ctx.arc(px + 22, py + 20, 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === '#') {
        ctx.fillStyle = '#5d4a3a';
        ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
        ctx.strokeStyle = 'rgba(0,0,0,.3)';
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(px + 2, py + i * 14);
          ctx.lineTo(px + CELL - 2, py + i * 14);
          ctx.stroke();
        }
      }
    }
  }

  // Surbrillances
  if (mode === 'move' && sel) {
    ctx.fillStyle = 'rgba(80,140,255,.38)';
    for (const k of moveCells.keys()) {
      const [x, y] = k.split(',').map(Number);
      ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
    }
  }
  if (mode === 'target') {
    const u = state.units[sel];
    const ab = u && u.abilities[targetAbility];
    for (const c of targetCells) {
      const t = unitAt(state, c.x, c.y);
      let color = 'rgba(255,120,60,.45)';
      if (ab && ab.target === 'enemy') color = t ? 'rgba(220,60,50,.5)' : 'rgba(255,120,60,.3)';
      else if (ab && ab.target === 'ally') color = 'rgba(80,200,90,.5)';
      ctx.fillStyle = color;
      ctx.fillRect(c.x * CELL + 2, c.y * CELL + 2, CELL - 4, CELL - 4);
    }
  }

  // Grille
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  for (let x = 0; x <= state.w; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, state.h * CELL); ctx.stroke();
  }
  for (let y = 0; y <= state.h; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(state.w * CELL, y * CELL); ctx.stroke();
  }

  // Survol
  if (hoverCell) {
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(hoverCell.x * CELL + 1, hoverCell.y * CELL + 1, CELL - 2, CELL - 2);
    ctx.lineWidth = 1;
  }

  // Unités
  for (const u of Object.values(state.units)) {
    if (!u.alive) continue;
    drawUnit(ctx, u);
  }

  // Étiquette de survol
  if (hoverCell) {
    const hu = unitAt(state, hoverCell.x, hoverCell.y);
    if (hu) {
      const label = hu.name + '  ' + hu.hp + '/' + hu.maxHp + ' PV';
      ctx.font = 'bold 12px sans-serif';
      const tw = ctx.measureText(label).width + 14;
      const lx = Math.min(Math.max(hu.x * CELL + CELL / 2 - tw / 2, 2), canvas.width - tw - 2);
      const ly = Math.max(hu.y * CELL - 24, 2);
      ctx.fillStyle = 'rgba(15,10,22,.85)';
      ctx.fillRect(lx, ly, tw, 18);
      ctx.strokeStyle = 'rgba(216,176,79,.7)';
      ctx.strokeRect(lx, ly, tw, 18);
      ctx.fillStyle = '#efe6f5';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + 7, ly + 9.5);
    }
  }
}

/* ---- dessin des personnages sur le plateau ---- */

const TEAM_COLORS = { p1: '#3b6fd6', p2: '#d05038' };
const SKIN = '#f2cfae';
const SKIN_DARK = '#d9ae87';
const OUTLINE = 'rgba(30,20,40,.55)';

function drawShadowAndRing(ctx, cx, cy, u) {
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 19, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = TEAM_COLORS[u.owner];
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 19, 15, 5.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawHairBack(ctx, cx, cy, art) {
  ctx.fillStyle = art.hair;
  if (art.style === 'long') {
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 10, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (art.style === 'twintails') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * 11, cy - 1, 3.6, 11, side * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBody(ctx, cx, cy, art) {
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 3);
  ctx.quadraticCurveTo(cx, cy - 7, cx + 8, cy - 3);
  ctx.lineTo(cx + 10, cy + 14);
  ctx.quadraticCurveTo(cx, cy + 17, cx - 10, cy + 14);
  ctx.closePath();
  ctx.fillStyle = art.outfit;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = art.trim;
  ctx.fillRect(cx - 9, cy + 3, 18, 3);
  ctx.globalAlpha = 1;
}

function drawHead(ctx, cx, cy, art) {
  ctx.beginPath();
  ctx.arc(cx, cy - 11, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = SKIN_DARK;
  ctx.stroke();

  if (art.style === 'beard') {
    ctx.fillStyle = art.hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 5.5, 5.6, 4.4, 0, 0, Math.PI);
    ctx.fill();
  }

  ctx.fillStyle = art.hair;
  ctx.beginPath();
  ctx.arc(cx, cy - 11.5, 9.1, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  if (art.style === 'bob') {
    ctx.fillRect(cx - 9.1, cy - 13, 3.4, 8);
    ctx.fillRect(cx + 5.7, cy - 13, 3.4, 8);
  } else if (art.style === 'short' || art.style === 'beard') {
    ctx.fillRect(cx - 9.1, cy - 13, 2.6, 5);
    ctx.fillRect(cx + 6.5, cy - 13, 2.6, 5);
  }

  ctx.fillStyle = '#2a2330';
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 10.5, 1.4, 0, Math.PI * 2);
  ctx.arc(cx + 3, cy - 10.5, 1.4, 0, Math.PI * 2);
  ctx.fill();

  if (art.horns) {
    ctx.fillStyle = '#ddd2c0';
    ctx.strokeStyle = OUTLINE;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 4, cy - 18.5);
      ctx.lineTo(cx + side * 7.5, cy - 25);
      ctx.lineTo(cx + side * 8.5, cy - 17.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawProp(ctx, cx, cy, art) {
  if (art.prop === 'staff' || art.prop === 'holy') {
    ctx.strokeStyle = '#6f5238';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx + 11, cy + 15);
    ctx.lineTo(cx + 16, cy - 15);
    ctx.stroke();
    ctx.lineWidth = 1;
    if (art.prop === 'staff') {
      ctx.fillStyle = art.orb;
      ctx.beginPath();
      ctx.arc(cx + 16.5, cy - 18, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(cx + 16.5, cy - 18, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = art.trim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 12.5, cy - 20);
      ctx.lineTo(cx + 19.5, cy - 20);
      ctx.moveTo(cx + 16, cy - 23.5);
      ctx.lineTo(cx + 16, cy - 16.5);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  } else if (art.prop === 'sword') {
    ctx.strokeStyle = '#b8c0cc';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy + 10);
    ctx.lineTo(cx + 14.5, cy - 11);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#6f5238';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 8.5, cy + 6.5);
    ctx.lineTo(cx + 13.5, cy + 9);
    ctx.stroke();
    ctx.lineWidth = 1;
  } else if (art.prop === 'axe') {
    ctx.strokeStyle = '#6f5238';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx + 9, cy + 14);
    ctx.lineTo(cx + 15, cy - 11);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#9aa0a8';
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(cx + 11, cy - 13);
    ctx.lineTo(cx + 20, cy - 11);
    ctx.lineTo(cx + 15.5, cy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawUnit(ctx, u) {
  const cx = u.x * CELL + CELL / 2;
  const cy = u.y * CELL + CELL / 2;
  const isActive = myTurn() && u.owner === state.current && !u.acted && !u.moved;
  const art = CHAR_ART[u.charId] || CHAR_ART.clone;

  ctx.save();
  if (u.isClone) ctx.globalAlpha = 0.72;

  drawShadowAndRing(ctx, cx, cy, u);
  drawHairBack(ctx, cx, cy, art);
  drawBody(ctx, cx, cy, art);
  drawHead(ctx, cx, cy, art);
  drawProp(ctx, cx, cy, art);

  ctx.restore();

  if (u.acted && u.owner === state.current && !u.isClone) {
    ctx.fillStyle = 'rgba(20,12,30,.32)';
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  if (sel === u.id) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 19, 17.5, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  } else if (isActive) {
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 19, 17.5, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  drawHealthBar(ctx, cx, cy, u);
  drawStatusIcons(ctx, cx, cy, u);
}

function drawHealthBar(ctx, cx, cy, u) {
  const bw = 40, bh = 6;
  const bx = cx - bw / 2, by = cy - 32;
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  const pct = Math.max(0, u.hp / u.maxHp);
  ctx.fillStyle = pct > 0.5 ? '#5cb85c' : (pct > 0.25 ? '#d8a04f' : '#d9534f');
  ctx.fillRect(bx, by, bw * pct, bh);
}

function drawStatusIcons(ctx, cx, cy, u) {
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let sx = cx - 14;
  for (const s of u.statuses) {
    const icon = { stun: '💤', shield: '🛡', noHeal: '🚫', atkUp: '⬆', atkDown: '⬇' }[s.s];
    if (icon) { ctx.fillText(icon, sx, cy + 27); sx += 14; }
  }
}

// ---------- interactions plateau ----------

function canvasCell(e) {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const x = Math.floor((e.clientX - rect.left) * scale / CELL);
  const y = Math.floor((e.clientY - rect.top) * scale / CELL);
  if (x < 0 || y < 0 || x >= state.w || y >= state.h) return null;
  return { x, y };
}

function initBoard() {
  canvas.addEventListener('mousemove', (e) => {
    if (!state) return;
    hoverCell = canvasCell(e);
    drawBoard();
  });
  canvas.addEventListener('mouseleave', () => { hoverCell = null; drawBoard(); });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (mode === 'target') cancelTargeting();
  });
  canvas.addEventListener('click', (e) => {
    if (!state || state.winner) return;
    const cell = canvasCell(e);
    if (!cell) return;
    handleBoardClick(cell);
  });
}

function handleBoardClick(cell) {
  const clicked = unitAt(state, cell.x, cell.y);

  if (!myTurn()) {
    if (clicked) { sel = clicked.id; mode = 'idle'; renderGame(); }
    return;
  }

  if (mode === 'target') {
    const valid = targetCells.some(c => c.x === cell.x && c.y === cell.y);
    if (valid) {
      doAbility(targetAbility, cell.x, cell.y);
    } else {
      cancelTargeting();
    }
    return;
  }

  if (clicked && clicked.owner === myRole) {
    if (sel === clicked.id && mode === 'move') { sel = null; mode = 'idle'; renderGame(); return; }
    sel = clicked.id;
    mode = clicked.moved || clicked.acted ? 'idle' : 'move';
    moveCells = legalMoveCells(state, clicked);
    renderGame();
    return;
  }

  if (sel && mode === 'move' && moveCells.has(key(cell.x, cell.y))) {
    doMove(cell.x, cell.y);
    return;
  }

  sel = null;
  mode = 'idle';
  renderGame();
}

function doMove(x, y) {
  const action = { k: 'move', u: sel, x, y };
  const res = applyAction(state, myRole, action);
  if (!res.ok) return;
  sendMsg({ t: 'action', action });
  const u = state.units[sel];
  mode = u.acted ? 'idle' : 'move';
  moveCells = legalMoveCells(state, u);
  renderGame();
}

function doAbility(idx, x, y) {
  const action = { k: 'ability', u: sel, a: idx, x, y };
  const res = applyAction(state, myRole, action);
  if (!res.ok) return;
  sendMsg({ t: 'action', action });
  mode = 'idle';
  targetAbility = null;
  targetCells = [];
  renderGame();
  maybeShowResult();
}

function initGameUi() {
  $('btn-end').onclick = () => {
    if (!myTurn()) return;
    const action = { k: 'end', u: '' };
    const res = applyAction(state, myRole, action);
    if (!res.ok) return;
    sendMsg({ t: 'action', action });
    sel = null;
    mode = 'idle';
    renderGame();
  };
}

// ---------- démarrage ----------

initHome();
initLobby();
initGameUi();
initBoard();
initShop();
updateHomeCoins();
