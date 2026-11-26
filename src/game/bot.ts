/**
 * BOT simples: olha 1 jogada à frente. Simula cada jogada legal e escolhe a que deixa o estado melhor para ele
 * (cristais, subir perto do Templo, não boiar, derrubar os outros), com um pouco de sorte para não ficar previsível.
 */
import { hexDistance, hexEquals } from '../engine/hex';
import { ORIGIN, PRINCESS_BONUS, Rng, TRIDENT_VALUE, actor, basePoints, applyTrusted, cellAt, islandProgress, leavingTime, legalActions, waveCells, type Action, type GameState } from '../engine/atlantida';

const value = (s: GameState, p: number, seek = false): number => {
  // cada ponto vale 12; o tridente vale 2 pontos e ainda protege uma casa; a Princesa a salvo no navio vale o bônus todo
  let v = s.crystals[p] * 12 + s.tridents[p] * (TRIDENT_VALUE * 12 + 2) + (s.princess?.by === p && s.princess.safe ? PRINCESS_BONUS * 12 : 0);
  // hora de levar o time para o navio (na partida longa, depois do cristal do Castelo; na fuga, com Atlântida já emersa)
  const leaving = leavingTime(s);
  // só corre para o navio quem não está muito atrás: quem fica boiando perde metade do tesouro, mas fugir cedo e pobre perde de qualquer jeito
  const rivals = s.crystals.map((_, i) => i).filter((i) => i !== p).map((i) => basePoints(s, i));
  const behind = Math.max(...rivals) - basePoints(s, p);
  const lastRounds = s.fleeDeadline != null && s.fleeDeadline - s.round <= 1; // a contagem para chegar ao navio está acabando
  const urgent = islandProgress(s) >= 0.9 || (s.escape != null && s.escape.by !== p) || lastRounds; // alguém já fugiu, a ilha está no fim ou o tempo está acabando
  const carrying = s.princess != null && s.princess.by === p && !s.princess.safe; // a princesa só vale quando chega ao navio
  // só corre para o navio depois de a Princesa ser resgatada (antes disso o BOT fica na ilha e vai atrás dela)
  const run = leaving && princessRescued(s) && (behind <= 1 || urgent || carrying) ? 1 : 0;
  const seekPrincess = seek && s.castleRisen && !princessRescued(s); // o Castelo já subiu e a Princesa ainda espera lá em cima
  if (carrying) v += 34;
  // onda avisada: sair das casas baixas daquele lado
  const wet = s.wave !== null && s.wave !== undefined ? new Set(waveCells(s, s.wave).map((h) => `${h.q},${h.r}`)) : null;
  const ship = s.ships[p];
  for (const b of s.builders) {
    if (b.owner !== p) continue;
    // quem carrega a Princesa é quem precisa chegar ao navio: ele pesa mais na hora de correr
    if (carrying && b.id === s.princess!.carrier && b.status !== 'aboard' && b.status !== 'dead') v += run ? 10 - (b.hex ? hexDistance(b.hex, ship) : 6) * 2 : 0;
    if (b.status === 'dead') v -= 40;
    else if (b.status === 'floating') v -= 12;
    else if (b.status === 'aboard') v += run ? 40 : leaving ? 14 : 4; // no navio: ótimo na hora de fugir, ruim cedo demais
    else if (b.status === 'boat' && b.hex) v += run ? 22 - hexDistance(b.hex, ship) * 2 : 2;
    else if (b.status === 'board' && b.hex) {
      const c = cellAt(s, b.hex)!;
      const d = hexDistance(ORIGIN, b.hex);
      if (wet?.has(`${b.hex.q},${b.hex.r}`) && c.floors <= 1 && c.tile !== 'shield') v -= 7;
      v += 10 + c.floors * 3 + (run ? -hexDistance(b.hex, ship) * 1.5 : (3 - d) * 1.5);
      if (c.temple) v += c.floors * 9; // o Castelo guarda a princesa
      if (seekPrincess) v += (4 - d) * 3 + c.floors * 8; // com o Castelo de pé: chega perto e sobe as escadas e torres
      if (c.tile === 'shield') v += 2;
    }
  }
  const temple = s.cells['0,0'];
  if (s.builders.some((b) => b.owner === p && b.status === 'board' && b.hex && hexDistance(ORIGIN, b.hex) === 1)) v += temple.floors * 3;
  return v;
};

export const evaluate = (s: GameState, me: number): number => {
  if (s.phase === 'ended') return s.winners?.includes(me) ? 1e6 : -1e6;
  let others = 0;
  for (let p = 0; p < s.playerCount; p++) if (p !== me) others += value(s, p);
  return value(s, me, true) - (0.35 * others) / Math.max(1, s.playerCount - 1);
};

/** A Princesa já foi resgatada (alguém chegou ao topo do Castelo, que só existe depois de surgir sozinho). */
const princessRescued = (s: GameState): boolean => s.castleTaken !== null;

/**
 * O BOT não foge antes de a Princesa ser resgatada: não entra em bote e não embarca no navio. Assim ele fica na ilha,
 * onde o Castelo sobe, e vai atrás da Princesa em vez de sumir da partida.
 */
const forbiddenForBot = (s: GameState, a: Action): boolean => {
  if (princessRescued(s)) return false;
  if (a.type === 'launch') return true;
  return (a.type === 'row' || a.type === 'swim') && hexEquals(a.to, s.ships[a.player]);
};

export const chooseAction = (s: GameState, rng: Rng): Action => {
  const me = actor(s);
  const all = legalActions(s);
  const allowed = all.filter((a) => !forbiddenForBot(s, a));
  const actions = allowed.length ? allowed : all;
  let best = actions[0];
  let bestScore = -Infinity;
  for (const a of actions) {
    // o BOT não enxerga a peça escondida: ao descobrir, conta só o ganho médio esperado (cerca de 1 em cada 4 casas tem cristal)
    // pisar numa casa fechada revela a peça (o BOT não a enxerga): conta só o ganho médio esperado, cerca de 1 cristal em cada 4 casas
    const dest = a.type === 'move' ? cellAt(s, a.to) : undefined;
    const unseen = !!dest && dest.state === 'island' && !dest.temple && dest.ring >= 2 && !dest.dug;
    let seen = s;
    if (unseen) {
      seen = structuredClone(s);
      cellAt(seen, a.type === 'move' ? a.to : dest!.hex)!.tile = 'hidden'; // não vale espiar o que há embaixo
    }
    const after = applyTrusted(seen, a).state;
    const score = evaluate(after, me) + (unseen ? 3.4 : 0) + rng.next() * 0.6 - (a.type === 'endActions' ? 0.01 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
};
