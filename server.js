/*
 * Frieren Tactics — serveur de jeu
 * Sert les fichiers du client et relaie les messages WebSocket entre les deux joueurs.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  let p = (req.url || '/').split('?')[0];
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end('Interdit');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Introuvable');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function other(room, role) {
  return room[role === 'p1' ? 'p2' : 'p1'];
}

// Nettoyage des salles abandonnées (toutes les 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const empty = (!room.p1 || room.p1.readyState !== 1) && (!room.p2 || room.p2.readyState !== 1);
    if (empty && now - room.created > 10 * 60 * 1000) rooms.delete(code);
  }
}, 10 * 60 * 1000);

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const room = ws.room ? rooms.get(ws.room) : null;

    switch (m.t) {
      case 'create': {
        let code;
        do { code = genCode(); } while (rooms.has(code));
        rooms.set(code, {
          code,
          p1: ws,
          p2: null,
          names: { p1: String(m.name || 'Joueur 1').slice(0, 20) },
          mapId: m.mapId || 'plaines',
          ready: null,
          rematch: null,
          created: Date.now()
        });
        ws.room = code;
        ws.role = 'p1';
        send(ws, { t: 'created', code });
        break;
      }

      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r || !r.p1 || r.p1.readyState !== 1) {
          send(ws, { t: 'error', msg: 'Partie introuvable. Vérifie le code.' });
          break;
        }
        if (r.p2) {
          send(ws, { t: 'error', msg: 'Cette partie est déjà complète.' });
          break;
        }
        r.p2 = ws;
        r.ready = null;
        r.rematch = null;
        ws.room = r.code;
        ws.role = 'p2';
        r.names.p2 = String(m.name || 'Joueur 2').slice(0, 20);
        send(ws, { t: 'joined', code: r.code });
        send(r.p1, { t: 'lobby', names: r.names, mapId: r.mapId, youAre: 'p1' });
        send(r.p2, { t: 'lobby', names: r.names, mapId: r.mapId, youAre: 'p2' });
        break;
      }

      case 'map': {
        if (room && ws.role === 'p1') {
          room.mapId = String(m.mapId);
          send(room.p2, { t: 'map', mapId: room.mapId });
        }
        break;
      }

      case 'ready': {
        if (!room) break;
        room.ready = room.ready || {};
        room.ready[ws.role] = { chars: (Array.isArray(m.chars) ? m.chars : []).slice(0, 4) };
        send(other(room, ws.role), { t: 'opponentReady' });
        if (room.ready.p1 && room.ready.p2) {
          const start = {
            t: 'start',
            mapId: room.mapId,
            teams: { p1: room.ready.p1.chars, p2: room.ready.p2.chars },
            names: room.names
          };
          send(room.p1, Object.assign({}, start, { youAre: 'p1' }));
          send(room.p2, Object.assign({}, start, { youAre: 'p2' }));
          room.ready = null;
        }
        break;
      }

      case 'action': {
        if (room && m.action) {
          send(other(room, ws.role), { t: 'action', action: m.action });
        }
        break;
      }

      case 'rematch': {
        if (!room) break;
        room.rematch = room.rematch || {};
        if (room.rematch[ws.role]) break;
        room.rematch[ws.role] = true;
        send(other(room, ws.role), { t: 'opponentRematch' });
        if (room.rematch.p1 && room.rematch.p2) {
          room.rematch = null;
          room.ready = null;
          send(room.p1, { t: 'lobby', names: room.names, mapId: room.mapId, youAre: 'p1' });
          send(room.p2, { t: 'lobby', names: room.names, mapId: room.mapId, youAre: 'p2' });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = ws.room && rooms.get(ws.room);
    if (!room) return;
    const o = other(room, ws.role);
    if (o && o.readyState === 1) {
      send(o, { t: 'opponentLeft' });
    } else {
      rooms.delete(room.code);
    }
  });
});

server.listen(PORT, () => {
  console.log('Frieren Tactics démarré sur http://localhost:' + PORT);
});
