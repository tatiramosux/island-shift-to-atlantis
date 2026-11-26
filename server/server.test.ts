import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer } from './index';
import { legalActions } from '../src/engine/atlantida';

type Msg = { t: string; [k: string]: any };

/** Cliente de teste: guarda as mensagens e deixa esperar por uma delas. */
const client = (port: number) =>
  new Promise<{ send: (m: object) => void; next: (pred: (m: Msg) => boolean) => Promise<Msg>; close: () => void }>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const inbox: Msg[] = [];
    const waiters: { pred: (m: Msg) => boolean; res: (m: Msg) => void }[] = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as Msg;
      const w = waiters.findIndex((x) => x.pred(m));
      if (w >= 0) waiters.splice(w, 1)[0].res(m);
      else inbox.push(m);
    });
    ws.on('open', () =>
      resolve({
        send: (m) => ws.send(JSON.stringify(m)),
        next: (pred) =>
          new Promise((res, rej) => {
            const i = inbox.findIndex(pred);
            if (i >= 0) return res(inbox.splice(i, 1)[0]);
            const timer = setTimeout(() => rej(new Error('tempo esgotado esperando mensagem')), 4000);
            waiters.push({ pred, res: (m) => (clearTimeout(timer), res(m)) });
          }),
        close: () => ws.close(),
      }),
    );
  });

let server: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  server = await startServer(0, '127.0.0.1', 'dist');
});
afterAll(async () => {
  await server.close();
});

describe('servidor de salas', () => {
  it('cria sala, entra com o código, inicia e cada um vê as peças escondidas', async () => {
    const a = await client(server.port);
    const b = await client(server.port);
    a.send({ t: 'create', name: 'Ana' });
    const lobby = await a.next((m) => m.t === 'lobby');
    expect(lobby.code).toMatch(/^[A-Z]{4}$/);
    expect(lobby.host).toBe(true);

    b.send({ t: 'join', code: lobby.code.toLowerCase(), name: 'Beto' });
    const lobbyB = await b.next((m) => m.t === 'lobby');
    expect(lobbyB.you).toBe(1);
    expect(lobbyB.host).toBe(false);
    expect(lobbyB.seats.map((s: any) => s.name)).toEqual(['Ana', 'Beto']);

    b.send({ t: 'start' }); // só o criador pode iniciar
    expect((await b.next((m) => m.t === 'error')).message).toMatch(/criou/);

    a.send({ t: 'start' });
    const sa = await a.next((m) => m.t === 'state');
    const sb = await b.next((m) => m.t === 'state');
    expect([sa.you, sb.you]).toEqual([0, 1]);
    expect(sa.state.phase).toBe('action');
    expect(sa.state.rng).toBe(0); // a semente não vai para o cliente
    const islands = Object.values(sa.state.cells).filter((c: any) => !c.temple);
    expect(islands.every((c: any) => c.tile === 'hidden')).toBe(true); // peças de baixo escondidas
    expect(sb.state.builders.filter((x: any) => x.status === 'board')).toHaveLength(4);

    // jogada do jogador errado e jogada ilegal são recusadas
    b.send({ t: 'action', action: { type: 'endActions', player: 1 } });
    expect((await b.next((m) => m.t === 'error')).message).toMatch(/vez/);
    a.send({ t: 'action', action: { type: 'move', player: 0, builderId: 'p0b0', to: { q: 9, r: 9 } } });
    expect((await a.next((m) => m.t === 'error')).message).toMatch(/permitida/);
    a.send({ t: 'action', action: { type: 'endActions', player: 1 } }); // fingindo ser outro
    expect((await a.next((m) => m.t === 'error')).message).toMatch(/inválida/);

    // jogada válida chega para os dois
    a.send({ t: 'action', action: { type: 'endActions', player: 0 } });
    const after = await b.next((m) => m.t === 'state');
    expect(after.state.phase).toBe('creatures'); // o terremoto sorteia e afunda sozinho
    a.close();
    b.close();
  });

  it('adiciona bot, o bot joga sozinho e a sala fecha quando todos saem', async () => {
    const a = await client(server.port);
    a.send({ t: 'create', name: 'Solo' });
    await a.next((m) => m.t === 'lobby');
    a.send({ t: 'start' });
    expect((await a.next((m) => m.t === 'error')).message).toMatch(/pelo menos 2/);
    a.send({ t: 'addBot' });
    const lobby = await a.next((m) => m.t === 'lobby' && m.seats.length === 2);
    expect(lobby.seats[1]).toEqual({ name: 'Bot 1', kind: 'bot' });
    a.send({ t: 'start' });
    await a.next((m) => m.t === 'state');
    // termino as ações, a Maré e as criaturas: depois disso é a vez do bot, que joga sozinho
    a.send({ t: 'action', action: { type: 'endActions', player: 0 } });
    // o terremoto afunda sozinho (sorteado pela mesa); logo vem a fase das criaturas
    const st = await a.next((m) => m.t === 'state' && m.state.phase === 'creatures');
    expect(st.events.some((e: any) => e.type === 'flood')).toBe(true);
    a.send({ t: 'action', action: { type: 'rollDie', player: 0 } });
    // se o dado sorteou uma criatura, ela precisa ser movida (ficar parada vale)
    const rolled = await a.next((m) => m.t === 'state' && (m.state.current === 1 || m.state.die));
    if (rolled.state.die) {
      // a primeira jogada permitida da criatura (o Polvo é obrigado a puxar quem estiver ao alcance)
      a.send({ t: 'action', action: legalActions(rolled.state).find((x) => x.type === 'moveCreature') });
    }
    const botTurn = rolled.state.current === 1 ? rolled : await a.next((m) => m.t === 'state' && m.state.current === 1);
    expect(botTurn.state.current).toBe(1);
    const botMoved = await a.next((m) => m.t === 'state' && m.events.some((e: any) => e.type === 'move' || e.type === 'build' || e.type === 'dig' || e.type === 'swim' || e.type === 'flood' || e.type === 'die' || e.type === 'creatureMove'));
    expect(botMoved).toBeTruthy();
    a.close();
  });

  it('espectador vê o jogo sem jogar e sala desconhecida dá erro', async () => {
    const a = await client(server.port);
    const w = await client(server.port);
    a.send({ t: 'create', name: 'Ana' });
    const lobby = await a.next((m) => m.t === 'lobby');
    a.send({ t: 'addBot' });
    await a.next((m) => m.t === 'lobby' && m.seats.length === 2);
    a.send({ t: 'start' });
    await a.next((m) => m.t === 'state');
    w.send({ t: 'watch', code: lobby.code });
    const view = await w.next((m) => m.t === 'state');
    expect(view.you).toBe(-1);
    w.send({ t: 'action', action: { type: 'endActions', player: 0 } });
    expect((await w.next((m) => m.t === 'error')).message).toMatch(/assiste/);
    const x = await client(server.port);
    x.send({ t: 'join', code: 'ZZZZ', name: 'X' });
    expect((await x.next((m) => m.t === 'error')).message).toMatch(/não encontrada/);
    [a, w, x].forEach((c) => c.close());
  });

  it('quem sai no meio da partida vira bot', async () => {
    const a = await client(server.port);
    const b = await client(server.port);
    a.send({ t: 'create', name: 'Ana' });
    const lobby = await a.next((m) => m.t === 'lobby');
    b.send({ t: 'join', code: lobby.code, name: 'Beto' });
    await b.next((m) => m.t === 'lobby');
    a.send({ t: 'start' });
    await a.next((m) => m.t === 'state');
    b.close();
    const after = await a.next((m) => m.t === 'state' && m.seats[1].kind === 'bot');
    expect(after.seats[1].name).toMatch(/bot/);
    a.close();
  });
});

describe('arquivos', () => {
  it('entrega só o pedaço pedido de um vídeo', async () => {
    const url = `http://127.0.0.1:${server.port}/video/trailer.mp4`;
    const r = await fetch(url, { headers: { range: 'bytes=0-99' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('content-range')).toMatch(/^bytes 0-99\/\d+$/);
    expect((await r.arrayBuffer()).byteLength).toBe(100);
    expect((await fetch(url, { headers: { range: 'bytes=999999999-' } })).status).toBe(416);
  });
});
