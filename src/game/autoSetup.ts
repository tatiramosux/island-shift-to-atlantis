/** "Organização automática": espalha os piratas de forma justa pela borda (anel 3), alternando os jogadores. */
import { hexRing } from '../engine/hex';
import { ISLAND_RADIUS, ORIGIN, applyAction, type GameState } from '../engine/atlantida';
import { Rng } from '../engine/atlantida';

export const autoSetup = (start: GameState, seed: number): GameState => {
  const ring = hexRing(ORIGIN, ISLAND_RADIUS);
  const total = start.setupOrder.length;
  const offset = new Rng(seed).int(ring.length);
  // a ordem da preparação é [N-1..0, N-1..0]; cada pirata vai para uma casa igualmente espaçada
  const picks = Array.from({ length: total }, (_, k) => ring[(offset + Math.floor((k * ring.length) / total)) % ring.length]);
  let s = start;
  for (let k = 0; k < total; k++) {
    const r = applyAction(s, { type: 'placeBuilder', player: s.setupOrder[s.setupIndex], hex: picks[k] });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
};
