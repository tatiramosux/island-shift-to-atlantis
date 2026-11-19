/**
 * Simula partidas de BOT contra BOT e mostra números para equilibrar o jogo.
 * Uso: npm run simular -- [partidas] [jogadores] [short|medium|long]
 */
import { LENGTH_PRESETS, applyAction, createGame, islandProgress, Rng, type MatchLength } from '../src/engine/atlantida';
import { autoSetup } from '../src/game/autoSetup';
import { chooseAction } from '../src/game/bot';

const games = Number(process.argv[2] ?? 100);
const players = Number(process.argv[3] ?? 2);
const length = (process.argv[4] ?? 'long') as MatchLength;
if (!(length in LENGTH_PRESETS)) throw new Error('duração inválida: use short, medium ou long');
const MAX_STEPS = 6000;
const wins = Array(players).fill(0);
const reasons: Record<string, number> = {};
const roundsList: number[] = [];
const turnsList: number[] = [];
const crystalsWinner: number[] = [];
const fullAtList: number[] = []; // rodada em que a ilha virou Atlântida inteira
let vanished = 0;
let fled = 0; // partidas em que alguém chegou ao navio antes de a ilha sumir sozinha
let unfinished = 0;

for (let g = 0; g < games; g++) {
  let s = autoSetup(createGame({ players, seed: g + 1, settings: LENGTH_PRESETS[length] }), g + 7);
  const rng = new Rng(g + 99);
  let fullAt = 0;
  for (let i = 0; i < MAX_STEPS && s.phase !== 'ended'; i++) {
    const r = applyAction(s, chooseAction(s, rng));
    if (!r.ok) throw new Error(`jogada ilegal na partida ${g}: ${r.error}`);
    s = r.state;
    if (!fullAt && islandProgress(s) >= 1) fullAt = s.round;
  }
  if (s.phase !== 'ended') {
    unfinished++;
    continue;
  }
  if (fullAt) fullAtList.push(fullAt);
  roundsList.push(s.round);
  turnsList.push(s.turn);
  crystalsWinner.push(s.crystals[s.winners![0]]);
  if (s.vanished) vanished++;
  if (s.escape != null) fled++;
  s.winners!.forEach((w) => wins[w]++);
  reasons[s.winReason!] = (reasons[s.winReason!] ?? 0) + 1;
}
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-');
const sorted = [...roundsList].sort((a, b) => a - b);
console.log(`${games} partidas (${length}) com ${players} jogadores (${unfinished} sem terminar)`);
console.log('vitórias por lugar:', wins.join(' / '));
console.log('como terminaram:', reasons);
console.log('rodadas: média', avg(roundsList), '| mínima', sorted[0] ?? '-', '| máxima', sorted[sorted.length - 1] ?? '-');
console.log('ilha virou Atlântida inteira na rodada (média):', avg(fullAtList), '— em', fullAtList.length, 'partidas');
console.log('turnos (jogadas de vez) em média:', avg(turnsList));
console.log('cristais do vencedor em média:', avg(crystalsWinner));
if (length !== 'long') console.log(`ilha sumiu: ${vanished} | alguém fugiu antes do limite: ${fled}`);
