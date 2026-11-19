/**
 * BOT simples: olha 1 jogada à frente. Simula cada jogada legal e escolhe a que deixa o estado melhor para ele
 * (cristais, subir perto do Templo, não boiar, derrubar os outros), com um pouco de sorte para não ficar previsível.
 */
import { hexDistance } from '../engine/hex';
import { ORIGIN, Rng, actor, applyTrusted, cellAt, leavingTime, legalActions, waveCells, type Action, type GameState } from '../engine/atlantida';

const value = (s: GameState, p: number): number => {
  let v = s.crystals[p] * 12 + s.tridents[p] * 4 + (s.fountain[p] ? 1 : 0);
  // hora de levar o time para o navio (no jogo original, depois do cristal do Castelo; na fuga, com Atlântida já emersa)
  const leaving = leavingTime(s);
  // onda avisada: sair das casas baixas daquele lado
  const wet = s.wave !== null && s.wave !== undefined ? new Set(waveCells(s, s.wave).map((h) => `${h.q},${h.r}`)) : null;
  const ship = s.ships[p];
  for (const b of s.builders) {
    if (b.owner !== p) continue;
    if (b.status === 'dead') v -= 40;
    else if (b.status === 'floating') v -= 12;
    else if (b.status === 'aboard') v += leaving ? 40 : 4; // no navio: ótimo na hora de fugir, ruim cedo demais
    else if (b.status === 'boat' && b.hex) v += leaving ? 22 - hexDistance(b.hex, ship) * 2 : 2;
    else if (b.status === 'board' && b.hex) {
      const c = cellAt(s, b.hex)!;
      const d = hexDistance(ORIGIN, b.hex);
      if (wet?.has(`${b.hex.q},${b.hex.r}`) && c.floors <= 1 && c.tile !== 'shield') v -= 7;
      v += 10 + c.floors * 3 + (leaving ? -hexDistance(b.hex, ship) * 1.5 : (3 - d) * 1.5);
      if (c.temple) v += c.floors * 6;
      if (c.tile === 'shield') v += 2;
    }
  }
  const temple = s.cells['0,0'];
  if (s.builders.some((b) => b.owner === p && b.status === 'board' && b.hex && hexDistance(ORIGIN, b.hex) === 1)) v += temple.floors * 2;
  return v;
};

export const evaluate = (s: GameState, me: number): number => {
  if (s.phase === 'ended') return s.winners?.includes(me) ? 1e6 : -1e6;
  let others = 0;
  for (let p = 0; p < s.playerCount; p++) if (p !== me) others += value(s, p);
  return value(s, me) - (0.35 * others) / Math.max(1, s.playerCount - 1);
};

export const chooseAction = (s: GameState, rng: Rng): Action => {
  const me = actor(s);
  const actions = legalActions(s);
  let best = actions[0];
  let bestScore = -Infinity;
  for (const a of actions) {
    // o BOT não enxerga a peça escondida: ao descobrir, conta só o ganho médio esperado (cerca de 1 em cada 4 casas tem cristal)
    const after = a.type === 'dig' ? s : applyTrusted(s, a).state;
    const score = evaluate(after, me) + (a.type === 'dig' ? 3.4 : 0) + rng.next() * 0.6 - (a.type === 'endActions' ? 0.01 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
};
