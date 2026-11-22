import { describe, expect, it } from 'vitest';
import { LENGTH_PRESETS, Rng, applyAction, createGame, legalActions } from '../engine/atlantida';
import { hexEquals } from '../engine/hex';
import { autoSetup } from './autoSetup';
import { chooseAction } from './bot';

describe('BOT e a Princesa', () => {
  it('não entra em bote nem embarca no navio antes de a Princesa ser resgatada', () => {
    let checked = 0;
    for (let g = 0; g < 6; g++) {
      let s = autoSetup(createGame({ players: 3, seed: g + 1, settings: LENGTH_PRESETS.short }), g + 7);
      const rng = new Rng(g + 99);
      for (let i = 0; i < 3000 && s.phase !== 'ended'; i++) {
        const a = chooseAction(s, rng);
        if (s.castleTaken === null) {
          const toOwnShip = (a.type === 'row' || a.type === 'swim') && hexEquals(a.to, s.ships[a.player]);
          expect(a.type === 'launch' || toOwnShip).toBe(false);
          checked++;
        }
        const r = applyAction(s, a);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        s = r.state;
      }
      // e nenhum BOT foi parar no navio sem a Princesa ter sido resgatada
      if (s.castleTaken === null) expect(s.builders.some((b) => b.status === 'aboard')).toBe(false);
    }
    expect(checked).toBeGreaterThan(100);
  }, 120000); // joga 6 partidas inteiras; com a máquina ocupada passa dos 5 s padrão

  it('depois que a Princesa é resgatada, o BOT pode fugir (embarcar é permitido)', () => {
    const s = autoSetup(createGame({ players: 2, seed: 5, settings: LENGTH_PRESETS.short }), 7);
    s.castleTaken = 0;
    // sem a trava, nenhuma jogada de fuga é filtrada: o BOT escolhe entre todas as jogadas legais
    const rng = new Rng(1);
    const a = chooseAction(s, rng);
    expect(legalActions(s).some((x) => JSON.stringify(x) === JSON.stringify(a))).toBe(true);
  });
});
