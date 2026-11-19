/**
 * Servidor do jogo em rede: serve o jogo (pasta dist) e mantém as salas por WebSocket em /ws.
 * O servidor é a autoridade: sorteia as peças de Atlântida, confere cada jogada com o MESMO motor de regras do cliente
 * e manda a cada pessoa só a visão dela (as peças de baixo das casas que não afundaram ficam escondidas). Bots rodam aqui.
 *
 * Rodar: npm run host   (faz o build do jogo e sobe o servidor)
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { Rng, actor, applyAction, createGame, redactFor, type Action, type GameEvent, type GameState } from '../src/engine/atlantida';
import { autoSetup } from '../src/game/autoSetup';
import { chooseAction } from '../src/game/bot';

interface Seat {
  kind: 'human' | 'bot';
  name: string;
  ws: WebSocket | null;
}
interface Room {
  code: string;
  seats: Seat[]; // a posição é o número do jogador no motor
  state: GameState | null;
  watchers: Set<WebSocket>;
  botTimer: ReturnType<typeof setTimeout> | null;
  rng: Rng;
}

const MAX_PLAYERS = 4;
const BOT_DELAY_MS = 900;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, para não confundir com 1 e 0

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

const clean = (s: unknown, fallback: string) => String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || fallback;

export function startServer(port: number, host = '0.0.0.0', distDir?: string) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(distDir ?? path.join(here, '..', 'dist'));
  const rooms = new Map<string, Room>();
  const clients = new Map<WebSocket, { room: Room; seat: number }>(); // seat -1 = espectador (TV)

  /* ---------- arquivos estáticos ---------- */
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('O jogo ainda não foi montado: rode "npm run host".');
      return;
    }
    const ext = path.extname(file);
    const cache = ext === '.html' ? 'no-cache' : url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': fs.statSync(file).size,
      'cache-control': cache,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });

  /* ---------- salas ---------- */
  const send = (ws: WebSocket, msg: unknown) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const seatInfo = (room: Room) => room.seats.map((s) => ({ name: s.name, kind: s.kind }));
  const lobbyMsg = (room: Room, you: number) => ({ t: 'lobby', code: room.code, seats: seatInfo(room), you, host: you === 0 });
  const broadcastLobby = (room: Room) => {
    room.seats.forEach((s, i) => s.ws && send(s.ws, lobbyMsg(room, i)));
    room.watchers.forEach((w) => send(w, lobbyMsg(room, -1)));
  };
  const broadcastState = (room: Room, events: GameEvent[]) => {
    if (!room.state) return;
    room.seats.forEach((s, i) => s.ws && send(s.ws, { t: 'state', state: redactFor(room.state!, i), you: i, seats: seatInfo(room), events }));
    room.watchers.forEach((w) => send(w, { t: 'state', state: redactFor(room.state!, -1), you: -1, seats: seatInfo(room), events }));
  };
  const closeRoom = (room: Room, why: string) => {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.seats.forEach((s) => s.ws && send(s.ws, { t: 'error', message: why }));
    room.watchers.forEach((w) => send(w, { t: 'error', message: why }));
    rooms.delete(room.code);
  };

  /** Faz o bot da vez jogar (um passo de cada vez, com uma pausa para dar para acompanhar). */
  const runBots = (room: Room) => {
    if (room.botTimer || !room.state || room.state.phase === 'ended') return;
    if (room.seats[actor(room.state)]?.kind !== 'bot') return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (!room.state || room.state.phase === 'ended') return;
      const r = applyAction(room.state, chooseAction(room.state, room.rng));
      if (!r.ok) return;
      room.state = r.state;
      broadcastState(room, r.events);
      runBots(room);
    }, BOT_DELAY_MS);
  };

  const newCode = () => {
    for (;;) {
      const c = Array.from({ length: 4 }, () => CODE_LETTERS[(Math.random() * CODE_LETTERS.length) | 0]).join('');
      if (!rooms.has(c)) return c;
    }
  };

  const leave = (ws: WebSocket) => {
    const c = clients.get(ws);
    if (!c) return;
    clients.delete(ws);
    const { room, seat } = c;
    if (seat < 0) {
      room.watchers.delete(ws);
      return;
    }
    if (!room.state) {
      // na sala de espera: quem sai libera a vaga; se for o criador, a sala acaba
      if (seat === 0) return closeRoom(room, 'O criador saiu: a sala foi encerrada.');
      room.seats.splice(seat, 1);
      room.seats.forEach((s, i) => s.ws && clients.set(s.ws, { room, seat: i }));
      broadcastLobby(room);
      return;
    }
    // no meio da partida: o jogador que saiu vira bot, e o jogo continua
    room.seats[seat] = { kind: 'bot', name: `${room.seats[seat].name} (bot)`, ws: null };
    if (!room.seats.some((s) => s.kind === 'human' && s.ws)) return closeRoom(room, 'Todos saíram.');
    broadcastState(room, []);
    runBots(room);
  };

  /* ---------- mensagens ---------- */
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    (ws as WebSocket & { alive?: boolean }).alive = true;
    ws.on('pong', () => ((ws as WebSocket & { alive?: boolean }).alive = true));
    ws.on('close', () => leave(ws));
    ws.on('message', (raw) => {
      let msg: { t?: string; [k: string]: unknown };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const c = clients.get(ws);
      const fail = (message: string) => send(ws, { t: 'error', message });

      if (msg.t === 'create') {
        if (c) return fail('Você já está numa sala.');
        const room: Room = { code: newCode(), seats: [{ kind: 'human', name: clean(msg.name, 'Jogador 1'), ws }], state: null, watchers: new Set(), botTimer: null, rng: new Rng((Math.random() * 2 ** 32) >>> 0) };
        rooms.set(room.code, room);
        clients.set(ws, { room, seat: 0 });
        return send(ws, lobbyMsg(room, 0));
      }
      if (msg.t === 'join' || msg.t === 'watch') {
        if (c) return fail('Você já está numa sala.');
        const room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!room) return fail('Sala não encontrada. Confira o código.');
        if (msg.t === 'watch') {
          room.watchers.add(ws);
          clients.set(ws, { room, seat: -1 });
          return room.state ? send(ws, { t: 'state', state: redactFor(room.state, -1), you: -1, seats: seatInfo(room), events: [] }) : send(ws, lobbyMsg(room, -1));
        }
        if (room.state) return fail('A partida dessa sala já começou.');
        if (room.seats.length >= MAX_PLAYERS) return fail(`A sala está cheia (máximo de ${MAX_PLAYERS}).`);
        room.seats.push({ kind: 'human', name: clean(msg.name, `Jogador ${room.seats.length + 1}`), ws });
        clients.set(ws, { room, seat: room.seats.length - 1 });
        return broadcastLobby(room);
      }
      if (!c) return fail('Entre numa sala primeiro.');
      const { room, seat } = c;

      if (msg.t === 'addBot' || msg.t === 'start') {
        if (seat !== 0) return fail('Só quem criou a sala pode fazer isso.');
        if (room.state) return fail('A partida já começou.');
        if (msg.t === 'addBot') {
          if (room.seats.length >= MAX_PLAYERS) return fail(`A sala está cheia (máximo de ${MAX_PLAYERS}).`);
          room.seats.push({ kind: 'bot', name: `Bot ${room.seats.filter((s) => s.kind === 'bot').length + 1}`, ws: null });
          return broadcastLobby(room);
        }
        if (room.seats.length < 2) return fail('Precisa de pelo menos 2 jogadores (adicione um bot ou espere alguém entrar).');
        const seed = (Math.random() * 2 ** 32) >>> 0;
        // as peças de Atlântida são sorteadas aqui, no servidor, e só são reveladas quando a casa afunda
        room.state = autoSetup(createGame({ players: room.seats.length, seed }), seed ^ 0x9e3779b9);
        broadcastState(room, []);
        return runBots(room);
      }

      if (msg.t === 'action') {
        if (seat < 0) return fail('Quem só assiste não joga.');
        if (!room.state) return fail('A partida ainda não começou.');
        const action = msg.action as Action;
        if (!action || typeof action.type !== 'string' || action.player !== seat) return fail('Jogada inválida.');
        const r = applyAction(room.state, action);
        if (!r.ok) return fail(r.error);
        room.state = r.state;
        broadcastState(room, r.events);
        return runBots(room);
      }
    });
  });

  // derruba conexões que sumiram (celular que perdeu o Wi-Fi)
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const w = ws as WebSocket & { alive?: boolean };
      if (w.alive === false) return ws.terminate();
      w.alive = false;
      ws.ping();
    });
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  return new Promise<{ port: number; close: () => Promise<void>; rooms: Map<string, Room> }>((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const real = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: real,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            rooms.forEach((r) => r.botTimer && clearTimeout(r.botTimer));
            wss.clients.forEach((c) => c.terminate());
            wss.close(() => server.close(() => done()));
          }),
      });
    });
  });
}

/** Endereços da máquina na rede local, para abrir nos celulares. */
export const lanAddresses = (): string[] =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

// quando rodado direto (npm run host / npm run server / npm start)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  startServer(port).then(({ port: p }) => {
    console.log('\nAtlântida, Cidade Submersa: servidor no ar.\n');
    console.log(`  Neste computador:  http://localhost:${p}`);
    lanAddresses().forEach((ip) => console.log(`  No celular/TV (mesmo Wi-Fi):  http://${ip}:${p}`));
    console.log('\nSe o Windows perguntar sobre o firewall, permita o acesso em redes privadas.');
    console.log('Para parar: Ctrl+C.\n');
  });
}
