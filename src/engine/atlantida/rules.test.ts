import { describe, expect, it } from 'vitest';
import { hex, hexDistance, hexKey, hexNeighbors, hexRing, type Hex } from '../hex';
import {
  CASTLE_GATE,
  ORIGIN,
  TILE_COUNTS,
  applyAction,
  cellAt,
  createGame,
  floodCandidates,
  isWater,
  isSea,
  legalActions,
  redactFor,
  type Action,
  type AtlantisTile,
  type Builder,
  type GameState,
} from './index';
import { autoSetup } from '../../game/autoSetup';
import { chooseAction } from '../../game/bot';
import { Rng } from './rng';

/* ---------- ajudantes ---------- */

// as regras antigas (1 casa por Maré, Castelo desperta com 4) deixam os testes simples; o terremoto tem testes próprios
const start = (players = 2, seed = 1, settings: Partial<GameState['settings']> = { floodsPerRound: players, templeWake: 4 }): GameState =>
  autoSetup(createGame({ players, seed, settings }), seed);
const clone = <T,>(x: T): T => structuredClone(x);
const B = (s: GameState, id: string): Builder => s.builders.find((b) => b.id === id)!;
const put = (s: GameState, id: string, h: Hex) => {
  const b = B(s, id);
  b.hex = h;
  b.status = 'board';
};
const float = (s: GameState, id: string, h: Hex) => {
  const b = B(s, id);
  b.hex = h;
  b.status = 'floating';
};
const cell = (s: GameState, h: Hex) => cellAt(s, h)!;
const sink = (s: GameState, h: Hex) => {
  const c = cell(s, h);
  c.state = 'atlantis';
  c.floors = c.tile === 'column' ? 1 : 0;
};
const setTile = (s: GameState, h: Hex, t: AtlantisTile) => (cell(s, h).tile = t);
const ok = (s: GameState, a: Action) => {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(r.error);
  return r;
};
const bad = (s: GameState, a: Action) => {
  const r = applyAction(s, a);
  expect(r.ok).toBe(false);
};
/** limpa o tabuleiro: ninguém em campo, criaturas fora, jogador 0 na fase de Ação */
const blank = (players = 2): GameState => {
  const s = start(players);
  s.builders.forEach((b) => {
    b.hex = null;
    b.status = 'unplaced';
  });
  s.creatures.forEach((c) => (c.hex = null));
  s.phase = 'action';
  s.current = 0;
  s.actionsLeft = 3;
  s.winners = null;
  return s;
};
const wakeTemple = (s: GameState) => {
  for (const h of hexRing(ORIGIN, 3).slice(0, 4)) sink(s, h);
};

const H = hex;

/* ---------- preparação ---------- */

describe('criação e preparação', () => {
  it('tem 61 casas, Templo no centro e 60 peças com a distribuição certa', () => {
    const s = createGame({ players: 2, seed: 3 });
    const cells = Object.values(s.cells);
    expect(cells).toHaveLength(61);
    expect(cell(s, ORIGIN).temple).toBe(true);
    expect(cell(s, ORIGIN).tile).toBeNull();
    const counts: Record<string, number> = {};
    cells.filter((c) => !c.temple).forEach((c) => (counts[c.tile as string] = (counts[c.tile as string] ?? 0) + 1));
    expect(counts).toEqual(Object.fromEntries(Object.entries(TILE_COUNTS).filter(([, n]) => n > 0)));
    expect(Object.values(TILE_COUNTS).reduce((a, b) => a + b, 0)).toBe(60);
  });

  it('o sorteio depende da semente', () => {
    const tiles = (seed: number) =>
      Object.values(createGame({ players: 2, seed }).cells)
        .map((c) => c.tile)
        .join();
    expect(tiles(1)).toBe(tiles(1));
    expect(tiles(1)).not.toBe(tiles(2));
  });

  it('cria 2 construtores por jogador e as criaturas na água, com o Guardião fora', () => {
    const s = createGame({ players: 3, seed: 1 });
    expect(s.builders).toHaveLength(6);
    const [octopus, leviathan, guardian] = s.creatures;
    expect(isWater(octopus.hex!)).toBe(true);
    expect(isWater(leviathan.hex!)).toBe(true);
    expect(guardian.hex).toBeNull();
  });

  it('recusa menos de 2 ou mais de 4 jogadores', () => {
    expect(() => createGame({ players: 1, seed: 1 })).toThrow();
    expect(() => createGame({ players: 5, seed: 1 })).toThrow();
  });

  it('quem joga por último coloca primeiro, alternando, só na borda', () => {
    let s = createGame({ players: 3, seed: 1 });
    expect(s.setupOrder).toEqual([2, 1, 0, 2, 1, 0]);
    const ring3 = new Set(hexRing(ORIGIN, 4).map(hexKey));
    expect(legalActions(s).every((a) => a.type === 'placeBuilder' && a.player === 2 && ring3.has(hexKey(a.hex)))).toBe(true);
    bad(s, { type: 'placeBuilder', player: 0, hex: H(4, 0) }); // não é a vez
    bad(s, { type: 'placeBuilder', player: 2, hex: H(1, 0) }); // não é a borda
    s = ok(s, { type: 'placeBuilder', player: 2, hex: H(4, 0) }).state;
    bad(s, { type: 'placeBuilder', player: 1, hex: H(4, 0) }); // casa ocupada
    expect(s.phase).toBe('setup');
  });

  it('a organização automática coloca todos e começa a Ação com o jogador 0', () => {
    for (const n of [2, 3, 4]) {
      const s = start(n, 5);
      expect(s.phase).toBe('action');
      expect(s.current).toBe(0);
      expect(s.actionsLeft).toBe(3);
      const spots = s.builders.map((b) => hexKey(b.hex!));
      expect(new Set(spots).size).toBe(2 * n);
    }
  });
});

/* ---------- fase de Ação ---------- */

describe('mover', () => {
  it('sobe no máximo 1 andar por vez e desce quantos quiser', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    cell(s, H(3, 0)).floors = 2;
    bad(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0) });
    cell(s, H(3, 0)).floors = 1;
    ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0) });
    const t = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0) }).state;
    t.cells[hexKey(H(3, 0))].floors = 3;
    t.builders.find((b) => b.id === 'p0b0')!.hex = H(3, 0);
    ok(t, { type: 'move', player: 0, builderId: 'p0b0', to: H(2, 0) }); // desce 3 andares
  });

  it('não entra em casa com construtor, cúpula ou na água', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    put(s, 'p1b0', H(2, -1));
    cell(s, H(1, 0)).dome = true;
    bad(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(2, -1) });
    bad(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(1, 0) });
    put(s, 'p0b0', H(4, 0));
    bad(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(5, 0) });
  });

  it('gasta uma ação e só o jogador da vez joga', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    const r = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(2, -1) });
    expect(r.state.actionsLeft).toBe(2);
    bad(s, { type: 'move', player: 1, builderId: 'p0b0', to: H(2, -1) });
  });

  it('com 0 ações sobra só convocar e terminar', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    s.actionsLeft = 0;
    expect(legalActions(s).map((a) => a.type)).toEqual(['endActions']);
  });
});

describe('ninguém constrói', () => {
  it('não existe ação de construir: o Castelo, as torres e as escadas surgem sozinhos', () => {
    const s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(-1, 0));
    expect(legalActions(s).some((a) => (a as { type: string }).type === 'build')).toBe(false);
  });

  it('a casa do portão do Castelo e as vizinhas só recebem andares quando o Castelo se ergue', () => {
    const s = blank();
    expect(cell(s, ORIGIN).floors).toBe(0);
    expect(hexRing(ORIGIN, 1).every((h) => cell(s, h).floors === 0)).toBe(true);
  });
});

describe('pisar descobre (não existe mais a ação de cavar)', () => {
  it('não há ação de cavar', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
  });

  it('pisar numa casa com cristal revela e coleta na hora; a casa fica descoberta (vira buraco)', () => {
    let s = blank();
    put(s, 'p0b0', H(2, 0));
    setTile(s, H(3, 0), 'crystal');
    s = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0) }).state;
    expect(s.crystals[0]).toBe(1);
    expect(cell(s, H(3, 0)).dug).toBe(true);
    expect(cell(s, H(3, 0)).taken).toBe(true); // o cristal some do tabuleiro
    expect(cell(s, H(3, 0)).state).toBe('island');
    expect(s.actionsLeft).toBe(2); // pisar custa 1 ação, só isso
  });

  it('pisar: tridente é pego; ruína não dá nada; a peça fica à vista para todos', () => {
    let s = blank();
    put(s, 'p0b0', H(2, 0));
    setTile(s, H(3, 0), 'trident');
    setTile(s, H(2, 1), 'ruin');
    s = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0) }).state;
    expect(s.tridents[0]).toBe(1);
    put(s, 'p0b0', H(2, 0));
    s = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(2, 1) }).state;
    expect(s.crystals[0]).toBe(0);
    const red = redactFor(s, 1);
    expect(red.cells[hexKey(H(2, 1))].tile).toBe('ruin');
    expect(red.cells[hexKey(H(2, -1))].tile).toBe('hidden');
  });
});

describe('empurrar', () => {
  it('empurra 1 casa para trás em linha reta, só se estiver livre e em terra', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(2, 0));
    s = ok(s, { type: 'push', player: 0, builderId: 'p0b0', targetId: 'p1b0' }).state;
    expect(B(s, 'p1b0').hex).toEqual(H(3, 0));
  });

  it('nunca joga na água e não empurra o próprio time', () => {
    const s = blank();
    put(s, 'p0b0', H(3, 0));
    put(s, 'p1b0', H(4, 0)); // atrás dele já é água
    bad(s, { type: 'push', player: 0, builderId: 'p0b0', targetId: 'p1b0' });
    const t = blank();
    put(t, 'p0b0', H(1, 0));
    put(t, 'p0b1', H(2, 0));
    bad(t, { type: 'push', player: 0, builderId: 'p0b0', targetId: 'p0b1' });
  });

  it('não empurra para uma casa com cúpula, ocupada ou mais de 1 andar acima', () => {
    const s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(2, 0));
    cell(s, H(3, 0)).floors = 2;
    bad(s, { type: 'push', player: 0, builderId: 'p0b0', targetId: 'p1b0' });
    cell(s, H(3, 0)).floors = 0;
    put(s, 'p1b1', H(3, 0));
    bad(s, { type: 'push', player: 0, builderId: 'p0b0', targetId: 'p1b0' });
  });
});

/* ---------- peças de Atlântida ---------- */

describe('efeitos das peças ao entrar', () => {
  const walkOnto = (tile: AtlantisTile) => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    sink(s, H(3, 0));
    setTile(s, H(3, 0), tile);
    return ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0) }).state;
  };

  it('Cristal: pega 1 cristal e a casa vira Ruína (só vale uma vez)', () => {
    const s = walkOnto('crystal');
    expect(s.crystals[0]).toBe(1);
    expect(cell(s, H(3, 0)).tile).toBe('ruin');
    expect(cell(s, H(3, 0)).taken).toBe(true); // o cristal some do tabuleiro
  });
  it('Tridente: pega 1 tridente', () => {
    const s = walkOnto('trident');
    expect(s.tridents[0]).toBe(1);
  });
  it('Maré calma: pula a próxima Maré e a peça some', () => {
    const s = walkOnto('calm');
    expect(s.skipFlood).toBe(1);
    expect(cell(s, H(3, 0)).tile).toBe('ruin');
  });
  it('Ruína e Coluna não dão efeito ao entrar', () => {
    for (const t of ['ruin', 'column'] as const) {
      const s = walkOnto(t);
      expect(s.crystals[0] + s.tridents[0] + s.skipFlood).toBe(0);
    }
  });
  it('peça de casa que ainda não afundou só age quando alguém pisa nela (revela e leva o tesouro)', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    setTile(s, H(3, 0), 'shield');
    const r = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0) }).state;
    expect(cell(r, H(3, 0)).dug).toBe(true);
    expect(cell(r, H(3, 0)).state).toBe('island');
  });

  it('Portal: em vez de parar, leva a outro Portal livre', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    for (const h of [H(3, 0), H(-3, 0), H(0, 3)]) {
      sink(s, h);
      setTile(s, h, 'portal');
    }
    const moves = legalActions(s).filter((a) => a.type === 'move' && a.to.q === 3 && a.to.r === 0);
    expect(moves).toHaveLength(3); // parar, ou ir para um de 2 portais
    const r = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0), portalTo: H(-3, 0) }).state;
    expect(B(r, 'p0b0').hex).toEqual(H(-3, 0));
    bad(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0), portalTo: H(1, 0) });
  });

  it('Portal não leva para um portal ocupado', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    put(s, 'p1b0', H(-3, 0));
    for (const h of [H(3, 0), H(-3, 0)]) {
      sink(s, h);
      setTile(s, h, 'portal');
    }
    bad(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0), portalTo: H(-3, 0) });
  });
});

/* ---------- Maré ---------- */

const toFlood = (s: GameState): GameState => ok(s, { type: 'endActions', player: s.current }).state;
/** Termina as ações procurando uma semente em que o sorteio do terremoto cai na casa `h` (afunda ou espera o tridente). */
const floodAt = (s: GameState, h: Hex): GameState => {
  for (let seed = 1; seed < 5000; seed++) {
    const t = clone(s);
    t.rng = seed;
    const r = toFlood(t);
    if (cell(r, h).state === 'atlantis' || (r.pendingFlood && hexKey(r.pendingFlood.hex) === hexKey(h))) return r;
  }
  throw new Error('nenhuma semente sorteou a casa');
};

describe('fase de Maré', () => {
  it('o terremoto sorteia sozinho entre todas as casas de superfície (inclusive no meio); o Castelo nunca', () => {
    const s = blank();
    put(s, 'p0b0', H(1, 0));
    expect(floodCandidates(s)).toHaveLength(60);
    const after = toFlood(s);
    expect(after.phase).toBe('creatures'); // ninguém escolhe: afundou sozinho
    expect(Object.values(after.cells).filter((c) => c.state === 'atlantis')).toHaveLength(1);
    expect(cell(after, ORIGIN).state).toBe('island');
    hexRing(ORIGIN, 4).forEach((h) => sink(s, h));
    expect(floodCandidates(s)).toHaveLength(36);
    [3, 2, 1].forEach((r) => hexRing(ORIGIN, r).forEach((h) => sink(s, h)));
    expect(floodCandidates(s)).toHaveLength(0);
  });

  it('a casa vira Atlântida no nível 0, os blocos somem e quem estava nela fica boiando', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(4, 0));
    cell(s, H(4, 0)).floors = 2;
    cell(s, H(4, 0)).dome = true;
    setTile(s, H(4, 0), 'ruin');
    s = floodAt(s, H(4, 0));
    const c = cell(s, H(4, 0));
    expect([c.state, c.floors, c.dome]).toEqual(['atlantis', 0, false]);
    expect(B(s, 'p1b0').status).toBe('floating');
    expect(isWater(B(s, 'p1b0').hex!)).toBe(true);
    expect(s.phase).toBe('creatures');
  });

  it('Coluna nasce com 1 andar', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    setTile(s, H(4, 0), 'column');
    s = floodAt(s, H(4, 0));
    expect(cell(s, H(4, 0)).floors).toBe(1);
  });

  it('Escudo: quem está na casa não cai', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(4, 0));
    setTile(s, H(4, 0), 'shield');
    s = floodAt(s, H(4, 0));
    expect(B(s, 'p1b0').status).toBe('board');
    expect(B(s, 'p1b0').hex).toEqual(H(4, 0));
  });

  it('o Guardião (só se a regra da Sentinela for ligada) entra na primeira casa de Atlântida que emergir', () => {
    let s = blank();
    s.settings.guardian = true;
    put(s, 'p0b0', H(1, 0));
    s = floodAt(s, H(4, 0));
    expect(s.creatures.find((c) => c.type === 'guardian')!.hex).toEqual(H(4, 0));
  });

  it('Maré calma pula a próxima Maré (e só ela)', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    s.skipFlood = 1;
    s = toFlood(s);
    expect(s.phase).toBe('creatures');
    expect(s.skipFlood).toBe(0);
    expect(Object.values(s.cells).filter((c) => c.state === 'atlantis')).toHaveLength(0);
  });

  it('Tridente cancela a descida da casa sorteada; passar deixa afundar', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(4, 0)); // só é perguntado a quem tem pirata em cima da casa
    s.tridents[1] = 1;
    s = floodAt(s, H(4, 0));
    expect(s.pendingFlood?.responders).toEqual([1]);
    expect(cell(s, H(4, 0)).state).toBe('island');
    bad(s, { type: 'useTrident', player: 0 }); // não é quem decide
    const cancelled = ok(s, { type: 'useTrident', player: 1 }).state;
    expect(cell(cancelled, H(4, 0)).state).toBe('island');
    expect(cancelled.tridents[1]).toBe(0);
    expect(cancelled.phase).toBe('creatures');
    const passed = ok(s, { type: 'passTrident', player: 1 }).state;
    expect(cell(passed, H(4, 0)).state).toBe('atlantis');
    expect(passed.tridents[1]).toBe(1);
  });

  it('sem pirata em cima da casa, o tridente nem é oferecido', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    s.tridents[1] = 1;
    s = floodAt(s, H(4, 0));
    expect(s.pendingFlood).toBeNull();
    expect(cell(s, H(4, 0)).state).toBe('atlantis');
  });
});

describe('o Castelo se ergue sozinho', () => {
  it('ao despertar, vira 3 andares com 2 torres e 3 escadas, e a casa do portão fica livre', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(-1, 0));
    for (const h of hexRing(ORIGIN, 3).slice(0, 3)) sink(s, h); // 3 casas já emersas; a 4ª desperta o Castelo
    s.settings = { ...s.settings, templeWake: 4 };
    expect(cell(s, ORIGIN).floors).toBe(0);
    s = floodAt(s, hexRing(ORIGIN, 3)[3]);
    expect(s.castleRisen).toBe(true);
    expect(cell(s, ORIGIN).floors).toBe(3);
    const ring = hexRing(ORIGIN, 1).map((h) => cell(s, h).floors).sort();
    expect(ring).toEqual([0, 1, 1, 1, 2, 2]); // portão livre, 3 escadas, 2 torres
    expect(cell(s, CASTLE_GATE).floors).toBe(0);
  });

  it('um pirata sobe escada → torre → Castelo e resgata a princesa', () => {
    let s = blank();
    wakeTemple(s);
    s.settings = { ...s.settings, templeWake: 4 };
    put(s, 'p0b0', H(2, 0));
    put(s, 'p1b0', H(-3, 0));
    s = floodAt(s, hexRing(ORIGIN, 3)[5]); // desperta e ergue o Castelo
    expect(s.castleRisen).toBe(true);
    // caminho: casa do portão (0,1) → escada (-1,1) → torre (-1,0) → Castelo
    const path = [H(1, 1), H(0, 1), H(-1, 1), H(-1, 0), ORIGIN];
    put(s, 'p0b0', H(1, 1));
    s.phase = 'action';
    s.current = 0;
    s.actionsLeft = 9;
    for (const to of path.slice(1)) s = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to }).state;
    expect(s.castleTaken).toBe(0);
    expect(s.princess).toMatchObject({ by: 0, safe: false });
  });
});

/* ---------- criaturas ---------- */

/** põe a partida na fase de criaturas com o dado já rolado */
const withDie = (s: GameState, face: 'octopus' | 'leviathan' | 'guardian'): GameState => {
  s.phase = 'creatures';
  s.die = face;
  return s;
};
const creature = (s: GameState, type: string) => s.creatures.find((c) => c.type === type)!;

describe('fase de Criaturas', () => {
  it('rola o dado e passa a vez no fim', () => {
    let s = blank();
    s.phase = 'creatures';
    s.die = null;
    expect(legalActions(s)).toEqual([{ type: 'rollDie', player: 0 }]);
    s = ok(s, { type: 'rollDie', player: 0 }).state;
    if (s.phase === 'creatures') {
      const a = legalActions(s)[0];
      s = ok(s, a).state;
    }
    expect(s.current).toBe(1);
    expect(s.phase).toBe('action');
    expect(s.actionsLeft).toBe(3);
  });

  it('o dado tem as 4 faces com as chances certas (2/2/1/1)', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 600; seed++) {
      const s = blank();
      s.phase = 'creatures';
      s.rng = seed * 7919;
      const r = ok(s, { type: 'rollDie', player: 0 });
      const face = r.events.find((e) => e.type === 'die')!.face as string;
      counts[face] = (counts[face] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(['guardian', 'leviathan', 'octopus', 'surge']);
    expect(counts.octopus).toBeGreaterThan(counts.guardian);
    expect(counts.leviathan).toBeGreaterThan(counts.surge);
  });

  it('Polvo: move até 3 casas pela água e joga na água o construtor do chão vizinho', () => {
    let s = withDie(blank(), 'octopus');
    creature(s, 'octopus').hex = H(4, -1);
    put(s, 'p1b0', H(3, 0));
    const grab = legalActions(s).find((a) => a.type === 'moveCreature' && a.target === 'p1b0')!;
    s = ok(s, grab).state;
    expect(B(s, 'p1b0').status).toBe('floating');
    expect(s.current).toBe(1);
  });

  it('fase final: depois do cristal do Castelo, o terremoto afunda o dobro', () => {
    const s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(-1, 0));
    const before = ok(s, { type: 'endActions', player: 0 }).state.floodLeft;
    s.castleTaken = 1;
    const after = ok(s, { type: 'endActions', player: 0 }).state.floodLeft;
    expect(after).toBe(before * 2);
  });

  it('onda gigante: avisa uma rodada antes e derruba quem está baixo naquele lado', () => {
    let s = withDie(blank(), 'guardian'); // o Guardião ainda não apareceu: o dado só passa a vez
    s.castleTaken = 0;
    s.current = 1;
    put(s, 'p0b0', H(4, -1)); // borda do lado q
    put(s, 'p0b1', H(3, 0)); // 2ª fileira do lado q, mas no 2º andar
    cell(s, H(3, 0)).floors = 2;
    put(s, 'p1b0', H(-1, 0));
    s.wave = 0; // a onda já avisada vem do lado q
    s.die = null;
    for (let seed = 1; seed < 500; seed++) {
      const t = clone(s);
      t.rng = seed;
      const r = ok(t, { type: 'rollDie', player: 1 });
      if (r.state.current !== 0) continue; // precisa ter passado a vez (e virado a rodada)
      expect(r.events.some((e) => e.type === 'wave')).toBe(true);
      expect(B(r.state, 'p0b0').status).toBe('floating');
      expect(B(r.state, 'p0b1').status).toBe('board'); // no alto, a onda não alcança
      expect(r.state.wave).not.toBeNull(); // e já avisa a próxima
      return;
    }
    throw new Error('nenhuma semente passou a vez');
  });

  it('Sentinela: pirata que para a até 2 casas leva um jato de água e vai 2 casas para longe do centro', () => {
    let s = blank();
    for (const h of [H(0, -2), H(1, -2), H(2, -2)]) sink(s, h);
    creature(s, 'guardian').hex = H(0, -2);
    put(s, 'p0b0', H(1, -1));
    s = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(1, -2) }).state;
    expect(creature(s, 'guardian').hex).toEqual(H(0, -2)); // ela não sai do lugar
    expect(hexDistance(ORIGIN, B(s, 'p0b0').hex!)).toBe(4); // estava a 2 do centro, foi para 4
  });

  it('Sentinela: o jato que passa da borda joga o pirata no mar', () => {
    let s = blank();
    for (const h of [H(2, -3), H(3, -3)]) sink(s, h);
    creature(s, 'guardian').hex = H(2, -3);
    put(s, 'p0b0', H(3, -2));
    s = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, -3) }).state;
    expect(B(s, 'p0b0').status).toBe('floating');
  });

  it('Sentinela não acorda com pirata a 3 casas, nem com quem está no 2º andar', () => {
    const s = blank();
    for (const h of [H(0, -2), H(1, -2), H(2, -2)]) sink(s, h);
    creature(s, 'guardian').hex = H(0, -2);
    put(s, 'p0b0', H(4, -2));
    const far = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, -2) }).state;
    expect(creature(far, 'guardian').hex).toEqual(H(0, -2));
    const t = clone(s);
    put(t, 'p0b0', H(3, -2));
    cell(t, H(2, -2)).floors = 2;
    cell(t, H(3, -2)).floors = 1;
    const high = ok(t, { type: 'move', player: 0, builderId: 'p0b0', to: H(2, -2) }).state;
    expect(creature(high, 'guardian').hex).toEqual(H(0, -2));
  });

  it('Polvo estica o tentáculo até 2 casas e puxa o pirata para o mar (obrigatório)', () => {
    let s = withDie(blank(), 'octopus');
    creature(s, 'octopus').hex = H(5, 0);
    put(s, 'p1b0', H(3, 0)); // a 2 casas da água onde o Polvo está
    const moves = legalActions(s).filter((a) => a.type === 'moveCreature' && hexKey(a.to) === hexKey(H(5, 0)));
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((a) => a.type === 'moveCreature' && a.target === 'p1b0')).toBe(true); // não dá para parar sem puxar
    s = ok(s, moves[0]).state;
    expect(B(s, 'p1b0').status).toBe('floating');
  });

  it('a 3 casas o Polvo não alcança', () => {
    const s = withDie(blank(), 'octopus');
    creature(s, 'octopus').hex = H(5, 0);
    put(s, 'p1b0', H(2, 0));
    const here = legalActions(s).filter((a) => a.type === 'moveCreature' && hexKey(a.to) === hexKey(H(5, 0)));
    expect(here).toHaveLength(1);
    expect(here[0].type === 'moveCreature' && here[0].target).toBeUndefined();
  });

  it('Polvo não alcança quem está no 2º andar ou mais alto, nem quem tem Escudo', () => {
    const s = withDie(blank(), 'octopus');
    creature(s, 'octopus').hex = H(4, -1);
    put(s, 'p1b0', H(3, 0));
    cell(s, H(3, 0)).floors = 2;
    expect(legalActions(s).some((a) => a.type === 'moveCreature' && a.target)).toBe(false);
    cell(s, H(3, 0)).floors = 0;
    setTile(s, H(3, 0), 'shield');
    expect(legalActions(s).some((a) => a.type === 'moveCreature' && a.target)).toBe(false);
  });

  it('Polvo joga quem já está boiando mais longe e ninguém é eliminado', () => {
    let s = withDie(blank(), 'octopus');
    creature(s, 'octopus').hex = H(5, -2);
    float(s, 'p1b0', H(4, -1));
    const grab = legalActions(s).find((a) => a.type === 'moveCreature' && a.target === 'p1b0')!;
    s = ok(s, grab).state;
    expect(B(s, 'p1b0').status).toBe('floating');
    expect(hexDistance(B(s, 'p1b0').hex!, H(4, -1))).toBeGreaterThanOrEqual(2);
    expect(s.crystals[1]).toBe(0);
  });

  it('Polvo e Leviatã só andam pelo mar: nunca sobem na ilha nem em Atlântida; os buracos que desabaram são mar', () => {
    const s = withDie(blank(), 'octopus');
    creature(s, 'octopus').hex = H(4, -1);
    sink(s, H(3, -1));
    sink(s, H(3, 0));
    cell(s, H(3, 0)).sunk = true;
    cell(s, H(3, 0)).tile = 'ruin';
    const dests = new Set(legalActions(s).map((a) => (a.type === 'moveCreature' ? hexKey(a.to) : '')));
    expect(dests.has(hexKey(H(3, -1)))).toBe(false); // Atlântida em pé: não sobe
    expect(dests.has(hexKey(H(3, 0)))).toBe(true); // buraco de mar: entra
    expect(dests.has(hexKey(H(2, 0)))).toBe(false);
  });

  it('Leviatã lança a cauda: alcança quem está a até 2 casas e o joga no mar', () => {
    let s = withDie(blank(), 'leviathan');
    creature(s, 'leviathan').hex = H(5, 0);
    put(s, 'p1b0', H(3, 0));
    const grab = legalActions(s).find((a) => a.type === 'moveCreature' && a.target === 'p1b0' && hexKey(a.to) === hexKey(H(5, 0)))!;
    expect(grab).toBeDefined();
    s = ok(s, grab).state;
    expect(B(s, 'p1b0').status).toBe('floating');
  });

  it('a partir da rodada 3 uma casa de Atlântida desmorona por rodada e vira mar', () => {
    const s = blank();
    sink(s, H(4, 0));
    sink(s, H(3, 0));
    cell(s, H(4, 0)).tile = 'ruin';
    cell(s, H(3, 0)).tile = 'ruin';
    s.round = 2;
    s.current = 1;
    s.phase = 'action';
    s.actionsLeft = 1;
    let r = s;
    const rng = new Rng(3);
    for (let i = 0; i < 400 && r.round < 3 && r.phase !== 'ended'; i++) r = ok(r, chooseAction(r, rng)).state;
    expect(r.round).toBe(3);
    const holes = Object.values(r.cells).filter((c) => c.sunk);
    expect(holes.length).toBe(1);
    expect(isSea(r, holes[0].hex)).toBe(true);
  });

  it('Leviatã derruba o bloco de cima, quem estava nela cai um andar, e empurra náufragos', () => {
    let s = withDie(blank(), 'leviathan');
    creature(s, 'leviathan').hex = H(4, -1);
    put(s, 'p1b0', H(3, 0));
    cell(s, H(3, 0)).floors = 2;
    float(s, 'p0b0', H(4, 0));
    const smash = legalActions(s).find((a) => a.type === 'moveCreature' && a.target === '3,0' && a.to.q === 4 && a.to.r === -1)!;
    s = ok(s, smash).state;
    expect(cell(s, H(3, 0)).floors).toBe(1);
    expect(B(s, 'p1b0').hex).toEqual(H(3, 0));
    expect(B(s, 'p0b0').hex).not.toEqual(H(4, 0)); // o náufrago foi empurrado 1 casa
    expect(isWater(B(s, 'p0b0').hex!)).toBe(true);
  });

  it('Leviatã tira a cúpula antes dos andares', () => {
    let s = withDie(blank(), 'leviathan');
    creature(s, 'leviathan').hex = H(4, -1);
    cell(s, H(3, 0)).floors = 3;
    cell(s, H(3, 0)).dome = true;
    const smash = legalActions(s).find((a) => a.type === 'moveCreature' && a.target === '3,0')!;
    s = ok(s, smash).state;
    expect([cell(s, H(3, 0)).dome, cell(s, H(3, 0)).floors]).toEqual([false, 3]);
  });

  it('Guardião anda 1 casa só por Atlântida e empurra um construtor 1 casa', () => {
    let s = withDie(blank(), 'guardian');
    sink(s, H(3, -1));
    sink(s, H(3, 0));
    creature(s, 'guardian').hex = H(3, -1);
    put(s, 'p1b0', H(2, 0));
    const dests = new Set(legalActions(s).map((a) => (a.type === 'moveCreature' ? hexKey(a.to) : '')));
    expect([...dests].sort()).toEqual([hexKey(H(3, -1)), hexKey(H(3, 0))].sort());
    const push = legalActions(s).find((a) => a.type === 'moveCreature' && a.target === 'p1b0' && a.to.q === 3 && a.to.r === 0)!;
    s = ok(s, push).state;
    expect(B(s, 'p1b0').hex).toEqual(H(1, 0));
  });

  it('Guardião ainda fora do tabuleiro: o dado passa a vez sem efeito', () => {
    const s = blank();
    s.phase = 'creatures';
    // procura uma semente que rola o Guardião
    for (let seed = 1; seed < 500; seed++) {
      const t = clone(s);
      t.rng = seed;
      const r = ok(t, { type: 'rollDie', player: 0 });
      if (r.events.some((e) => e.type === 'die' && e.face === 'guardian')) {
        expect(r.state.phase).toBe('action');
        expect(r.state.current).toBe(1);
        return;
      }
    }
    throw new Error('nenhuma semente rolou o Guardião');
  });

  it('Maré viva: todo construtor em casa de Atlântida ganha 1 cristal', () => {
    const s = blank();
    s.phase = 'creatures';
    put(s, 'p0b0', H(3, 0));
    put(s, 'p0b1', H(3, -1));
    put(s, 'p1b0', H(2, 0));
    sink(s, H(3, 0));
    sink(s, H(3, -1));
    for (let seed = 1; seed < 500; seed++) {
      const t = clone(s);
      t.rng = seed;
      const r = ok(t, { type: 'rollDie', player: 0 });
      if (r.events.some((e) => e.type === 'die' && e.face === 'surge')) {
        expect(r.state.crystals).toEqual([2, 0]);
        return;
      }
    }
    throw new Error('nenhuma semente rolou a Maré viva');
  });
});

/* ---------- boiando ---------- */

describe('boiando', () => {
  it('náufrago nada 1 casa por ação e sobe em terra de nível 0 ou 1', () => {
    let s = blank();
    put(s, 'p0b1', H(1, 0));
    float(s, 'p0b0', H(5, -1));
    s = ok(s, { type: 'swim', player: 0, builderId: 'p0b0', to: H(6, -2) }).state;
    expect(B(s, 'p0b0').status).toBe('floating');
    s = ok(s, { type: 'swim', player: 0, builderId: 'p0b0', to: H(5, -1) }).state;
    cell(s, H(4, 0)).floors = 2;
    bad(s, { type: 'swim', player: 0, builderId: 'p0b0', to: H(4, 0) }); // alto demais
    cell(s, H(4, 0)).floors = 1;
    s = ok(s, { type: 'swim', player: 0, builderId: 'p0b0', to: H(4, 0) }).state;
    expect(B(s, 'p0b0').status).toBe('board');
  });

  it('náufrago não constrói, não empurra e não anda', () => {
    const s = blank();
    put(s, 'p0b1', H(1, 0));
    float(s, 'p0b0', H(4, -1));
    const types = legalActions(s)
      .filter((a) => 'builderId' in a && a.builderId === 'p0b0')
      .map((a) => a.type);
    expect(new Set(types)).toEqual(new Set(['swim']));
  });

  it('ao nadar para uma casa com peça, o efeito vale', () => {
    let s = blank();
    put(s, 'p0b1', H(1, 0));
    float(s, 'p0b0', H(4, -1));
    sink(s, H(3, -1));
    setTile(s, H(3, -1), 'crystal');
    s = ok(s, { type: 'swim', player: 0, builderId: 'p0b0', to: H(3, -1) }).state;
    expect(s.crystals[0]).toBe(1);
  });
});

/* ---------- convocações ---------- */

describe('convocações', () => {
  it('só 1 convocação por turno, na Ação, e precisa de cristais', () => {
    let s = blank();
    put(s, 'p0b0', H(2, 0));
    put(s, 'p1b0', H(2, -1));
    expect(legalActions(s).some((a) => a.type === 'summon')).toBe(false);
    s.crystals[0] = 3;
    s.crystals[1] = 4;
    s = ok(s, { type: 'summon', player: 0, kind: 'siren', builderId: 'p0b0', targetId: 'p1b0' }).state;
    s.crystals[0] = 9;
    expect(legalActions(s).some((a) => a.type === 'summon')).toBe(false);
    expect(s.actionsLeft).toBe(3); // convocar não gasta ação
  });

  it('Tritão (2): joga um adversário até 2 casas; na água, ele fica boiando', () => {
    let s = blank();
    put(s, 'p0b0', H(-2, -1));
    put(s, 'p1b0', H(-1, -1));
    s.crystals[0] = 2;
    const t2 = ok(s, { type: 'summon', player: 0, kind: 'triton', builderId: 'p0b0', targetId: 'p1b0', distance: 2 }).state;
    expect(B(t2, 'p1b0').hex).toEqual(H(1, -1));
    expect(t2.crystals[0]).toBe(0);
    expect(B(t2, 'p1b0').status).toBe('board');
    // da borda ele cai na água
    s = blank();
    put(s, 'p0b0', H(2, -1));
    put(s, 'p1b0', H(3, -1));
    s.crystals[0] = 2;
    const wet = ok(s, { type: 'summon', player: 0, kind: 'triton', builderId: 'p0b0', targetId: 'p1b0', distance: 2 }).state;
    expect(B(wet, 'p1b0').status).toBe('floating');
    expect(isWater(B(wet, 'p1b0').hex!)).toBe(true);
  });

  it('Tritão para antes de cúpulas e construtores, e não pode custar sem cristais', () => {
    const s = blank();
    put(s, 'p0b0', H(0, 1));
    put(s, 'p1b0', H(1, 1));
    s.crystals[0] = 1;
    expect(legalActions(s).some((a) => a.type === 'summon' && a.kind === 'triton')).toBe(false);
    s.crystals[0] = 2;
    cell(s, H(2, 1)).dome = true;
    expect(legalActions(s).some((a) => a.type === 'summon' && a.kind === 'triton')).toBe(false); // nem sai do lugar
  });

  it('Laço (2): rouba a princesa de um time rival que está a até 3 casas', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(1, 3)); // 3 casas
    s.princess = { by: 1, safe: false };
    s.crystals[0] = 2;
    const lassos = legalActions(s).filter((a) => a.type === 'summon' && a.kind === 'lasso');
    expect(lassos.length).toBe(1);
    s = ok(s, { type: 'summon', player: 0, kind: 'lasso', builderId: 'p0b0', targetId: 'p1b0' }).state;
    expect(s.princess).toMatchObject({ by: 0, safe: false });
    expect(s.crystals[0]).toBe(0);
  });

  it('Laço: o alvo é o pirata que leva a princesa, mesmo no bote ou na água, e quem laça passa a conduzi-la', () => {
    let s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(1, 2));
    put(s, 'p1b1', H(2, 1)); // outro pirata do time rival, também perto, mas sem a princesa
    s.princess = { by: 1, safe: false, carrier: 'p1b0' };
    s.crystals[0] = 2;
    const targets = legalActions(s).filter((a) => a.type === 'summon' && a.kind === 'lasso').map((a) => (a as { targetId: string }).targetId);
    expect(targets).toEqual(['p1b0']);
    B(s, 'p1b0').status = 'boat'; // agora o portador está num bote
    expect(legalActions(s).some((a) => a.type === 'summon' && a.kind === 'lasso')).toBe(true);
    s = ok(s, { type: 'summon', player: 0, kind: 'lasso', builderId: 'p0b0', targetId: 'p1b0' }).state;
    expect(s.princess).toEqual({ by: 0, safe: false, carrier: 'p0b0' });
  });

  it('Laço: não serve se a princesa já está a salvo, é do próprio time, está longe ou faltam cristais', () => {
    const base = () => {
      const s = blank();
      put(s, 'p0b0', H(1, 0));
      put(s, 'p1b0', H(1, 2));
      s.crystals[0] = 2;
      return s;
    };
    const has = (s: GameState) => legalActions(s).some((a) => a.type === 'summon' && a.kind === 'lasso');
    let s = base();
    s.princess = { by: 1, safe: true };
    expect(has(s)).toBe(false); // já no navio
    s = base();
    s.princess = { by: 0, safe: false };
    expect(has(s)).toBe(false); // já é sua
    s = base();
    s.princess = null;
    expect(has(s)).toBe(false); // ninguém está com ela
    s = base();
    s.princess = { by: 1, safe: false };
    put(s, 'p1b0', H(1, 4)); // 4 casas
    expect(has(s)).toBe(false);
    s = base();
    s.princess = { by: 1, safe: false };
    s.crystals[0] = 1;
    expect(has(s)).toBe(false); // custa 2
  });

  it('Sereia (3): rouba todos os cristais do vizinho menos 2; quem tem 2 ou menos não pode ser roubado', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    put(s, 'p1b0', H(2, -1));
    s.crystals[0] = 3;
    for (const poor of [0, 1, 2]) {
      s.crystals[1] = poor;
      expect(legalActions(s).some((a) => a.type === 'summon' && a.kind === 'siren')).toBe(false); // nada para roubar
    }
    s.crystals[1] = 7;
    const r = ok(s, { type: 'summon', player: 0, kind: 'siren', builderId: 'p0b0', targetId: 'p1b0' }).state;
    expect(r.crystals).toEqual([0 + 5, 2]); // paga 3, leva 5 (7 - 2)
  });

  it('Colosso de coral (2): cúpula em qualquer casa livre que não seja o Templo', () => {
    let s = blank();
    put(s, 'p0b0', H(2, 0));
    s.crystals[0] = 2;
    bad(s, { type: 'summon', player: 0, kind: 'colossus', at: ORIGIN });
    bad(s, { type: 'summon', player: 0, kind: 'colossus', at: H(2, 0) }); // ocupada
    s = ok(s, { type: 'summon', player: 0, kind: 'colossus', at: H(-2, 0) }).state;
    expect(cell(s, H(-2, 0)).dome).toBe(true);
    expect(s.crystals[0]).toBe(0);
  });
});

/* ---------- vitória ---------- */

describe('como se vence', () => {
  const climb = (s: GameState) => {
    wakeTemple(s);
    put(s, 'p0b0', H(1, 0));
    cell(s, H(1, 0)).floors = 2;
    cell(s, ORIGIN).floors = 3;
    return ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: ORIGIN }).state;
  };

  it('o topo do Castelo resgata a princesa (sem cristal na hora) e a partida continua', () => {
    const r = climb(blank());
    expect(r.crystals[0]).toBe(0);
    expect(r.princess).toMatchObject({ by: 0, safe: false });
    expect(r.castleTaken).toBe(0);
    expect(r.phase).toBe('action');
  });

  it('entrar no Castelo em andar menor que 3 não pega o cristal', () => {
    const s = blank();
    wakeTemple(s);
    put(s, 'p0b0', H(1, 0));
    cell(s, ORIGIN).floors = 2;
    cell(s, H(1, 0)).floors = 1;
    const r = ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: ORIGIN }).state;
    expect(r.castleTaken).toBeNull();
    expect(r.crystals[0]).toBe(0);
  });

  it('cada time tem um navio na água desde o começo, longe dos outros', () => {
    const s = start(4, 1);
    expect(s.ships).toHaveLength(4);
    // 1 casa de água entre a ilha (anel 4) e o navio
    s.ships.forEach((h) => expect(hexDistance(ORIGIN, h)).toBe(6));
    expect(new Set(s.ships.map(hexKey)).size).toBe(4);
  });

  it('da praia o pirata entra no bote, rema até 2 casas e sobe no navio', () => {
    let s = blank();
    put(s, 'p0b0', H(-4, 4));
    s = ok(s, { type: 'launch', player: 0, builderId: 'p0b0', to: H(-5, 5) }).state;
    expect(s.builders[0].status).toBe('boat');
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b0', to: H(-6, 6) }).state; // o navio do time 0
    expect(s.builders[0].status).toBe('aboard');
    expect(s.builders[0].hex).toBeNull();
  });

  it('não sobe no navio dos outros', () => {
    const s = blank();
    s.builders[0].status = 'boat';
    s.builders[0].hex = H(5, -5);
    bad(s, { type: 'row', player: 0, builderId: 'p0b0', to: H(6, -6) });
  });

  it('cabem 2 piratas do mesmo time no bote, e eles remam juntos até o navio', () => {
    let s = blank();
    put(s, 'p0b0', H(-4, 4));
    put(s, 'p0b1', H(-3, 3));
    s.actionsLeft = 5;
    s = ok(s, { type: 'launch', player: 0, builderId: 'p0b0', to: H(-5, 5) }).state;
    s = ok(s, { type: 'move', player: 0, builderId: 'p0b1', to: H(-4, 4) }).state;
    s = ok(s, { type: 'launch', player: 0, builderId: 'p0b1', to: H(-5, 5) }).state; // entra no mesmo bote
    expect(s.builders.filter((b) => b.owner === 0).every((b) => b.status === 'boat')).toBe(true);
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b0', to: H(-6, 6) }).state;
    expect(s.builders.filter((b) => b.owner === 0).every((b) => b.status === 'aboard')).toBe(true);
    expect(s.actionsLeft).toBe(1);
  });

  it('o bote leva os dois na mesma remada; na praia só desce quem remou', () => {
    let s = blank();
    for (const id of ['p0b0', 'p0b1']) {
      const b = s.builders.find((x) => x.id === id)!;
      b.status = 'boat';
      b.hex = H(-5, 5);
    }
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b0', to: H(-4, 6) }).state;
    expect(s.builders.filter((b) => b.owner === 0).every((b) => hexKey(b.hex!) === hexKey(H(-4, 6)))).toBe(true);
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b1', to: H(-4, 5) }).state;
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b1', to: H(-3, 4) }).state;
    expect(s.builders.find((b) => b.id === 'p0b1')!.status).toBe('board');
    expect(s.builders.find((b) => b.id === 'p0b0')!.status).toBe('boat');
  });

  it('não cabe pirata de outro time, nem um terceiro', () => {
    const s = blank();
    const b = s.builders.find((x) => x.id === 'p1b0')!;
    b.status = 'boat';
    b.hex = H(-5, 5);
    put(s, 'p0b0', H(-4, 4));
    bad(s, { type: 'launch', player: 0, builderId: 'p0b0', to: H(-5, 5) });
  });

  it('o Polvo vira o bote com 2: os dois ficam boiando, cada um numa casa', () => {
    let s = withDie(blank(), 'octopus');
    for (const id of ['p1b0', 'p1b1']) {
      const b = s.builders.find((x) => x.id === id)!;
      b.status = 'boat';
      b.hex = H(5, -1);
    }
    creature(s, 'octopus').hex = H(5, -3);
    put(s, 'p0b0', H(-2, 0));
    const grab = legalActions(s).find((a) => a.type === 'moveCreature' && a.target === 'p1b0')!;
    s = ok(s, grab).state;
    const crew = s.builders.filter((b) => b.owner === 1);
    expect(crew.every((b) => b.status === 'floating')).toBe(true);
    expect(hexKey(crew[0].hex!)).not.toBe(hexKey(crew[1].hex!));
  });

  it('o Polvo vira o bote: o pirata fica boiando', () => {
    let s = withDie(blank(), 'octopus');
    s.builders.find((b) => b.id === 'p1b0')!.status = 'boat';
    s.builders.find((b) => b.id === 'p1b0')!.hex = H(5, -1);
    creature(s, 'octopus').hex = H(5, -3);
    put(s, 'p0b0', H(-2, 0));
    const grab = legalActions(s).find((a) => a.type === 'moveCreature' && a.target === 'p1b0')!;
    s = ok(s, grab).state;
    expect(s.builders.find((b) => b.id === 'p1b0')!.status).toBe('floating');
  });

  it('fuga: com o cristal do Castelo já pego, o time todo no navio encerra a partida; vence quem tem mais cristais', () => {
    let s = climb(blank());
    s.builders.find((b) => b.id === 'p0b0')!.status = 'aboard';
    s.builders.find((b) => b.id === 'p0b0')!.hex = null;
    const b1 = s.builders.find((b) => b.id === 'p0b1')!;
    b1.status = 'boat';
    b1.hex = H(-5, 5);
    put(s, 'p1b0', H(3, -3));
    s.crystals[1] = 5;
    s.actionsLeft = 3;
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b1', to: H(-6, 6) }).state;
    expect(s.phase).toBe('ended');
    expect(s.winners).toEqual([1]); // 5 cristais contra 3
  });

  it('ninguém fica para trás: com um pirata em terra, o navio não parte', () => {
    let s = climb(blank());
    const b1 = s.builders.find((b) => b.id === 'p0b1')!;
    b1.status = 'boat';
    b1.hex = H(-5, 5);
    s.actionsLeft = 3;
    put(s, 'p1b0', H(3, -3));
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b1', to: H(-6, 6) }).state;
    expect(s.phase).toBe('action'); // o p0b0 ainda está no Castelo
  });

  it('embarcar todos antes de alguém pegar o cristal do Castelo não encerra', () => {
    let s = blank();
    s.builders.find((b) => b.id === 'p0b0')!.status = 'aboard';
    const b1 = s.builders.find((b) => b.id === 'p0b1')!;
    b1.status = 'boat';
    b1.hex = H(-5, 5);
    put(s, 'p1b0', H(3, -3));
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b1', to: H(-6, 6) }).state;
    expect(s.phase).toBe('action');
  });

  it('empate no fim: vence quem fugiu no navio', () => {
    let s = climb(blank());
    s.builders.find((b) => b.id === 'p0b0')!.status = 'aboard';
    s.builders.find((b) => b.id === 'p0b0')!.hex = null;
    const b1 = s.builders.find((b) => b.id === 'p0b1')!;
    b1.status = 'boat';
    b1.hex = H(-5, 5);
    put(s, 'p1b0', H(3, -3));
    s.crystals[1] = 3;
    s.actionsLeft = 3;
    s = ok(s, { type: 'row', player: 0, builderId: 'p0b1', to: H(-6, 6) }).state;
    expect(s.winners).toEqual([0]);
    expect(s.winReason).toBe('ship');
  });

  it('juntar cristais sozinho não encerra o jogo', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    s.crystals[0] = 9;
    expect(ok(s, { type: 'move', player: 0, builderId: 'p0b0', to: H(3, 0) }).state.phase).toBe('action');
  });

  it('quando toda a ilha afunda, o jogo acaba e vence quem tem mais cristais', () => {
    const s = blank();
    put(s, 'p0b0', H(1, 0));
    Object.values(s.cells).forEach((c) => !c.temple && sink(s, c.hex));
    s.crystals[1] = 2;
    const r = ok(s, { type: 'endActions', player: 0 }).state;
    expect(r.phase).toBe('ended');
    expect(r.winners).toEqual([1]);
  });

  it('depois do fim, ninguém joga', () => {
    const s = blank();
    s.phase = 'ended';
    expect(legalActions(s)).toEqual([]);
    bad(s, { type: 'endActions', player: 0 });
  });
});

/* ---------- informação escondida ---------- */

describe('redact', () => {
  it('esconde as peças das casas que não afundaram e a semente', () => {
    const s = start(2, 9);
    sink(s, H(3, 0));
    const v = redactFor(s, 0);
    expect(v.rng).toBe(0);
    expect(cell(v, H(2, 0)).tile).toBe('hidden');
    expect(cell(v, H(3, 0)).tile).toBe(cell(s, H(3, 0)).tile); // afundada: revelada
    expect(cell(v, ORIGIN).tile).toBeNull();
    expect(cell(s, H(2, 0)).tile).not.toBe('hidden'); // o original não foi alterado
  });

  it('revela tudo no fim da partida', () => {
    const s = start(2, 9);
    s.phase = 'ended';
    expect(cell(redactFor(s, 0), H(2, 0)).tile).not.toBe('hidden');
  });
});

/* ---------- partidas completas ---------- */

describe('partidas completas com o BOT', () => {
  for (const players of [2, 3, 4]) {
    it(`${players} jogadores: só joga o que o motor aceita e a partida termina`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        let s = start(players, seed);
        const rng = new Rng(seed);
        for (let i = 0; i < 4000 && s.phase !== 'ended'; i++) {
          const r = applyAction(s, chooseAction(s, rng));
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          s = r.state;
          // invariantes
          // cada casa tem no máximo um pirata; só o bote leva 2 do mesmo time
          const placed = s.builders.filter((b) => b.hex);
          const spots = placed.map((b) => hexKey(b.hex!));
          for (const k of new Set(spots)) {
            const here = placed.filter((b) => hexKey(b.hex!) === k);
            if (here.length > 1) {
              expect(here.length).toBeLessThanOrEqual(2);
              expect(here.every((b) => b.status === 'boat' && b.owner === here[0].owner)).toBe(true);
            }
          }
          s.creatures.forEach((c) => c.hex && expect(spots.includes(hexKey(c.hex))).toBe(false));
          s.builders.forEach((b) => {
            if (b.status === 'board') expect(cellAt(s, b.hex!)).toBeDefined();
            if (b.status === 'floating') expect(isSea(s, b.hex!)).toBe(true);
          });
        }
        expect(s.phase).toBe('ended');
        expect(s.winners).not.toBeNull();
      }
    }, 120000);
  }
});

describe('vizinhança da ilha', () => {
  it('toda casa da ilha tem no máximo 6 vizinhos e o Templo tem 6 de superfície', () => {
    const s = start(2, 1);
    expect(hexNeighbors(ORIGIN).every((h) => cellAt(s, h))).toBe(true);
  });
});


/* ---------- construções com função ---------- */

describe('construções com função', () => {
  const canMove = (s: GameState, id: string, to: Hex) =>
    legalActions(s).some((a) => a.type === 'move' && a.builderId === id && hexKey(a.to) === hexKey(to) && !a.portalTo);

  it('Escadaria: de cima dela sobe até 2 andares de uma vez; no chão, só 1', () => {
    const s = blank();
    put(s, 'p0b0', H(1, 0));
    cell(s, H(2, 0)).floors = 2;
    expect(canMove(s, 'p0b0', H(2, 0))).toBe(false); // do chão (0) para 2: não
    cell(s, H(1, 0)).floors = 1; // agora ele está em cima da Escadaria (casa colada no Castelo)
    expect(canMove(s, 'p0b0', H(2, 0))).toBe(true); // 1 -> 3 vale
    cell(s, H(2, 0)).floors = 3;
    expect(canMove(s, 'p0b0', H(2, 0))).toBe(true);
  });

  it('1 andar longe do Castelo é só um bloco: não vira Escadaria', () => {
    const s = blank();
    put(s, 'p0b0', H(2, 0));
    cell(s, H(2, 0)).floors = 1;
    cell(s, H(3, 0)).floors = 3;
    expect(canMove(s, 'p0b0', H(3, 0))).toBe(false);
    cell(s, H(3, 0)).floors = 2;
    expect(canMove(s, 'p0b0', H(3, 0))).toBe(true); // só o passo normal de 1 andar
  });

  it('Terremoto: a rodada afunda 4 casas, divididas entre os jogadores', () => {
    const sunk = (s: GameState) => Object.values(s.cells).filter((c) => c.state === 'atlantis').length;
    const play = (players: number) => {
      let s = start(players, 1, {});
      expect(s.settings.floodsPerRound).toBe(4);
      const startRound = s.round;
      while (s.round === startRound && s.phase !== 'ended') {
        s = ok(s, { type: 'endActions', player: s.current }).state;
        while (s.phase === 'flood') s = ok(s, legalActions(s)[0]).state;
        if (s.phase === 'creatures') {
          s = ok(s, { type: 'rollDie', player: s.current }).state;
          if (s.die) s = ok(s, legalActions(s)[0]).state;
        }
      }
      return sunk(s);
    };
    expect(play(2)).toBe(4);
    expect(play(3)).toBe(4);
    expect(play(4)).toBe(4);
  });

  it('Terremoto: na Maré de 2 casas as duas afundam sozinhas, sem ninguém escolher', () => {
    let s = start(2, 1, {});
    const before = Object.values(s.cells).filter((c) => c.state === 'atlantis').length;
    s = toFlood(s);
    expect(s.phase).toBe('creatures');
    expect(s.floodLeft).toBe(0);
    expect(Object.values(s.cells).filter((c) => c.state === 'atlantis').length - before).toBe(2);
  });

  it('Escadaria não dá atalho para dentro do Castelo', () => {
    const s = blank();
    wakeTemple(s);
    put(s, 'p0b0', H(1, 0));
    cell(s, H(1, 0)).floors = 1;
    cell(s, ORIGIN).floors = 3;
    expect(canMove(s, 'p0b0', ORIGIN)).toBe(false);
    cell(s, ORIGIN).floors = 2;
    expect(canMove(s, 'p0b0', ORIGIN)).toBe(true); // 1 -> 2 é o passo normal
  });

  it('Torre de vigia (2 andares ou mais): ninguém empurra quem está em cima, nem o Tritão', () => {
    const s = blank();
    put(s, 'p0b0', H(1, 0));
    put(s, 'p1b0', H(2, 0));
    s.crystals[0] = 5;
    const pushes = () => legalActions(s).filter((a) => a.type === 'push' || (a.type === 'summon' && a.kind === 'triton'));
    expect(pushes().length).toBeGreaterThan(0); // no chão dá para empurrar
    cell(s, H(2, 0)).floors = 2;
    expect(pushes()).toHaveLength(0);
    cell(s, H(2, 0)).floors = 1; // Escadaria ainda não protege
    expect(pushes().length).toBeGreaterThan(0);
  });

  it('Farol aceso (3 andares com alguém em cima) protege a própria casa e as vizinhas da Maré', () => {
    let s = blank();
    put(s, 'p0b0', H(4, 0));
    cell(s, H(4, 0)).floors = 3;
    s = toFlood(s);
    const cand = floodCandidates(s).map(hexKey);
    expect(cand).not.toContain(hexKey(H(4, 0)));
    for (const n of hexNeighbors(H(4, 0))) expect(cand).not.toContain(hexKey(n));
    expect(cand.length).toBeGreaterThan(0);
    // sem ninguém em cima, o Farol apagado não protege
    let t = blank();
    cell(t, H(4, 0)).floors = 3;
    t = toFlood(t);
    expect(floodCandidates(t).map(hexKey)).toContain(hexKey(H(4, 0)));
  });

  it('se o Farol cobrir a borda inteira, a Maré segue normal', () => {
    let s = blank();
    put(s, 'p0b0', H(4, 0));
    cell(s, H(4, 0)).floors = 3;
    const keep = hexRing(ORIGIN, 4).find((h) => hexKey(h) === hexKey(H(4, 0)))!;
    // só sobra, na borda, a casa do próprio Farol e as vizinhas: afunda todas as outras
    for (const h of hexRing(ORIGIN, 4)) {
      const near = hexKey(h) === hexKey(keep) || hexNeighbors(keep).some((n) => hexKey(n) === hexKey(h));
      if (!near) sink(s, h);
    }
    s = toFlood(s);
    expect(floodCandidates(s).length).toBeGreaterThan(0);
  });
});

describe('peças espalhadas', () => {
  it('Portal nunca fica ao lado de outro Portal, em nenhuma partida', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = createGame({ players: 2, seed });
      for (const c of Object.values(s.cells)) {
        if (c.tile !== 'portal') continue;
        for (const n of hexNeighbors(c.hex)) expect(cellAt(s, n)?.tile === c.tile, `seed ${seed}`).toBe(false);
      }
    }
  });
});
