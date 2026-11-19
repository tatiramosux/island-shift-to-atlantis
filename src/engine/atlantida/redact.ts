/**
 * Visão de um jogador: esconde as peças de Atlântida das casas que ainda não afundaram e a semente do sorteio.
 * O servidor deve enviar SEMPRE o resultado disto, nunca o estado completo. Ao fim da partida tudo é revelado.
 */
import type { GameState } from './types';

export const redactFor = (state: GameState, _viewer: number): GameState => {
  const s = structuredClone(state);
  s.rng = 0;
  if (s.phase === 'ended') return s;
  for (const c of Object.values(s.cells)) if (c.state === 'island' && !c.temple && !c.dug) c.tile = 'hidden';
  return s;
};
