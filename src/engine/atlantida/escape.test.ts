import { describe, expect, it } from 'vitest';
import { hex } from '../hex';
import {
  LENGTH_PRESETS,
  applyAction,
  cellAt,
  createGame,
  islandProgress,
  leavingTime,
  legalActions,
  type Action,
  type GameState,
  type MatchLength,
} from './index';
import { autoSetup } from '../../game/autoSetup';
import { chooseAction } from '../../game/bot';
import { Rng } from './rng';

const H = hex;
const start = (length: MatchLength, seed = 1): GameState => autoSetup(createGame({ players: 2, seed, settings: LENGTH_PRESETS[length] }), seed);

/** tabuleiro vazio, jogador 0 na fase de Ação, para montar cenários à mão */
const blank = (length: MatchLength): GameState => {
  const s = start(length);
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
const put = (s: GameState, id: string, h: ReturnType<typeof hex>) => {
  const b = s.builders.find((x) => x.id === id)!;
  b.hex = h;
  b.status = 'board';
};
/** joga com o BOT até a condição valer (ou a partida acabar) */
const playUntil = (s: GameState, stop: (s: GameState) => boolean, seed = 5): GameState => {
  const rng = new Rng(seed);
  for (let i = 0; i < 3000 && s.phase !== 'ended' && !stop(s); i++) {
    const r = applyAction(s, chooseAction(s, rng));
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
};

describe('partida curta, média e longa', () => {
  it('curta e média usam fuga; longa é o jogo original', () => {
    expect(start('short').settings.ending).toBe('escape');
    expect(start('medium').settings.ending).toBe('escape');
    expect(start('long').settings.ending).toBe('castle');
    expect(start('long').settings.floodsPerRound).toBe(4);
  });

  it('curta: a Sentinela nunca entra em jogo e o dado nunca a sorteia', () => {
    let s = start('short');
    const rng = new Rng(3);
    const faces = new Set<string>();
    for (let i = 0; i < 1500 && s.phase !== 'ended'; i++) {
      const r = applyAction(s, chooseAction(s, rng));
      if (!r.ok) throw new Error(r.error);
      r.events.filter((e) => e.type === 'die').forEach((e) => faces.add(e.face as string));
      s = r.state;
    }
    expect(s.creatures.find((c) => c.type === 'guardian')!.hex).toBeNull();
    expect(faces.has('guardian')).toBe(false);
    expect(faces.size).toBeGreaterThan(0);
  });

  it('curta: sem ninguém agindo, a ilha inteira vira Atlântida em 6 rodadas', () => {
    let t = start('short');
    while (t.round <= 6 && t.phase !== 'ended') {
      // ninguém mexe um dedo: só passa a vez e rola o dado (a primeira jogada legal nas outras fases)
      const a: Action = t.phase === 'action' ? { type: 'endActions', player: t.current } : legalActions(t)[0];
      const r = applyAction(t, a);
      if (!r.ok) throw new Error(r.error);
      t = r.state;
    }
    expect(t.phase).not.toBe('ended');
    expect(islandProgress(t)).toBe(1);
  });

  it('curta: as partidas terminam com a ilha sumindo, dentro do limite de rodadas', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = playUntil(start('short', seed), () => false, seed);
      expect(s.phase, `seed ${seed}`).toBe('ended');
      expect(s.vanished, `seed ${seed}`).toBe(true);
      expect(s.round, `seed ${seed}`).toBeLessThanOrEqual(LENGTH_PRESETS.short.vanishRound! + 1);
    }
  });
});

describe('final por fuga', () => {
  it('o primeiro navio dá uma última chamada: o outro time joga mais um turno e a ilha some', () => {
    let s = blank('short');
    const b0 = s.builders.find((b) => b.id === 'p0b0')!;
    b0.status = 'boat';
    b0.hex = H(5, 0);
    put(s, 'p1b0', H(1, 1));
    s.crystals = [2, 5];
    const r = applyAction(s, { type: 'row', player: 0, builderId: 'p0b0', to: H(6, 0) });
    expect(r.ok).toBe(true);
    s = (r as { ok: true; state: GameState }).state;
    expect(s.escape).toEqual({ by: 0 });
    expect(s.phase).toBe('action'); // ainda não acabou: o outro time tem a última chamada
    s = playUntil(s, () => false);
    expect(s.phase).toBe('ended');
    expect(s.vanished).toBe(true);
    // o time 1 tinha mais cristais, mas não fugiu: só conta quem tem pirata no navio
    expect(s.winners).toEqual([0]);
    expect(s.winReason).toBe('ship');
    expect(s.builders.find((b) => b.id === 'p1b0')!.status).toBe('floating'); // ficou boiando
  });

  it('com os dois times no navio, vence quem tiver mais cristais', () => {
    let s = blank('short');
    s.builders.find((b) => b.id === 'p0b0')!.status = 'aboard';
    const b1 = s.builders.find((b) => b.id === 'p1b0')!;
    b1.status = 'aboard';
    s.crystals = [2, 5];
    s.escape = { by: 0 };
    s = playUntil(s, () => false);
    expect(s.phase).toBe('ended');
    expect(s.winners).toEqual([1]);
  });

  it('empate de cristais: vence quem fugiu primeiro', () => {
    let s = blank('short');
    s.builders.find((b) => b.id === 'p0b0')!.status = 'aboard';
    s.builders.find((b) => b.id === 'p1b0')!.status = 'aboard';
    s.crystals = [4, 4];
    s.escape = { by: 1 };
    s.current = 1;
    s = playUntil(s, () => false);
    expect(s.winners).toEqual([1]);
  });

  it('ninguém foge: na rodada limite a ilha some e vence quem tiver mais cristais', () => {
    let s = blank('short');
    put(s, 'p0b0', H(1, 1));
    put(s, 'p1b0', H(-1, -1));
    s.crystals = [3, 1];
    s.round = LENGTH_PRESETS.short.vanishRound!;
    s.current = 1; // o último a jogar na rodada limite
    s = playUntil(s, () => false);
    expect(s.phase).toBe('ended');
    expect(s.vanished).toBe(true);
    expect(s.winners).toEqual([0]);
    expect(s.winReason).toBe('crystals');
  });

  it('no jogo longo, nada muda: o final por fuga não dispara e a ilha não some sozinha', () => {
    let s = blank('long');
    s.builders.find((b) => b.id === 'p0b0')!.status = 'aboard';
    put(s, 'p0b1', H(2, 0));
    put(s, 'p1b0', H(-2, 0));
    s = playUntil(s, (x) => x.round >= 3);
    expect(s.escape ?? null).toBeNull();
    expect(s.vanished ?? false).toBe(false);
  });
});

describe('dia e noite', () => {
  it('islandProgress vai de 0 a 1 conforme a ilha vira Atlântida', () => {
    const s = start('short');
    expect(islandProgress(s)).toBe(0);
    const surface = Object.values(s.cells).filter((c) => !c.temple);
    surface.slice(0, 30).forEach((c) => (cellAt(s, c.hex)!.state = 'atlantis'));
    expect(islandProgress(s)).toBeCloseTo(0.5);
    surface.forEach((c) => (cellAt(s, c.hex)!.state = 'atlantis'));
    expect(islandProgress(s)).toBe(1);
  });

  it('o BOT só vai para o navio quando Atlântida já emergiu (ou alguém fugiu)', () => {
    const s = start('short');
    expect(leavingTime(s)).toBe(false);
    Object.values(s.cells).filter((c) => !c.temple).slice(0, 48).forEach((c) => (c.state = 'atlantis'));
    expect(leavingTime(s)).toBe(true);
    expect(leavingTime(start('long'))).toBe(false);
  });
});

describe('virada da maré (onda que vira a fileira em Atlântida)', () => {
  /** rodada 2, vez do último jogador, com a onda avisada para o lado 0 (casas com q >= 3); sem terremoto, para isolar a onda */
  const waveScene = (): GameState => {
    const s = autoSetup(createGame({ players: 2, seed: 1, settings: { ...LENGTH_PRESETS.short, floodsPerRound: 0 } }), 1);
    s.builders.forEach((b) => ((b.hex = null), (b.status = 'unplaced')));
    s.creatures.forEach((c) => (c.hex = null));
    s.phase = 'action';
    s.round = 2;
    s.current = 1;
    s.actionsLeft = 3;
    s.wave = 0;
    return s;
  };
  /** passa a vez do jogador atual até a rodada virar (rola o dado e fecha as outras fases) */
  const untilNextRound = (s: GameState): GameState => {
    const round = s.round;
    for (let i = 0; i < 50 && s.round === round && s.phase !== 'ended'; i++) {
      const a: Action = s.phase === 'action' ? { type: 'endActions', player: s.current } : legalActions(s)[0];
      const r = applyAction(s, a);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    return s;
  };

  it('vira em Atlântida as casas varridas, derruba quem está no chão e avisa a próxima onda', () => {
    let s = waveScene();
    put(s, 'p0b0', H(4, 0));
    put(s, 'p1b0', H(1, 1)); // fora da onda
    const swept = Object.values(s.cells).filter((c) => !c.temple && c.hex.q >= 3);
    s = untilNextRound(s);
    expect(s.round).toBe(3);
    for (const c of swept) expect(cellAt(s, c.hex)!.state, `${c.hex.q},${c.hex.r}`).toBe('atlantis');
    expect(s.builders.find((b) => b.id === 'p0b0')!.status).toBe('floating');
    expect(s.builders.find((b) => b.id === 'p1b0')!.status).toBe('board');
    expect(cellAt(s, H(1, 1))!.state).toBe('island'); // o resto da ilha não mudou
    expect(s.wave).not.toBeNull(); // já avisa a próxima onda
  });

  it('torres de 2 andares ou mais e cúpulas resistem à onda', () => {
    let s = waveScene();
    cellAt(s, H(3, 0))!.floors = 2;
    put(s, 'p0b0', H(3, 0));
    cellAt(s, H(3, -1))!.dome = true;
    s = untilNextRound(s);
    expect(cellAt(s, H(3, 0))!.state).toBe('island');
    expect(s.builders.find((b) => b.id === 'p0b0')!.status).toBe('board');
    expect(cellAt(s, H(3, -1))!.state).toBe('island');
    expect(cellAt(s, H(4, 0))!.state).toBe('atlantis');
  });

  it('o Escudo segura o pirata, mesmo na casa virada', () => {
    let s = waveScene();
    cellAt(s, H(4, -1))!.tile = 'shield';
    put(s, 'p0b0', H(4, -1));
    s = untilNextRound(s);
    expect(cellAt(s, H(4, -1))!.state).toBe('atlantis');
    expect(s.builders.find((b) => b.id === 'p0b0')!.status).toBe('board');
  });

  it('na partida longa a onda não vira nada antes do cristal do Castelo', () => {
    let s = waveScene();
    s.settings = { ...s.settings, tideShift: false, ending: 'castle' };
    s = untilNextRound(s);
    expect(cellAt(s, H(4, 0))!.state).toBe('island');
  });

  it('a virada começa só na rodada 2: na rodada 1 ninguém é avisado', () => {
    let s = waveScene();
    s.round = 1;
    s.wave = null;
    s = untilNextRound(s);
    expect(s.round).toBe(2);
    expect(s.wave).not.toBeNull(); // o primeiro aviso vem na virada para a rodada 2
    expect(Object.values(s.cells).filter((c) => c.state === 'atlantis')).toHaveLength(0); // e ainda nada virou
  });
});
