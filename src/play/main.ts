/**
 * Tela do jogo: tabuleiro 3D em tela cheia com cartões de vidro por cima,
 * tela inicial com 3 modos (contra BOT, neste aparelho, online) e janelas de regras e de fim de jogo.
 */
import { ArrowRight, BookOpen, Bot, Crown, X, Footprints, Hand, Sailboat, Waves, Pointer, Minimize, Maximize, CircleHelp, Crosshair, Dices, Gem, Menu, Minus, Plus, RotateCcw, RotateCw, ScrollText, Users, Video, Volume2, VolumeX, Music, Vibrate, VibrateOff, Wifi, createElement } from 'lucide';
import { hexEquals, hexKey, hexToWorld, type Hex } from '../engine/hex';
import {
  DEFAULT_SETTINGS,
  LENGTH_PRESETS,
  Rng,
  actor,
  applyAction,
  createGame,
  isAlive,
  isWater as isWaterHex,
  PRINCESS_BONUS,
  TRIDENT_VALUE,
  basePoints,
  finalScore,
  pointsNow,
  leavingTime,
  waveCells,
  legalActions,
  type Action,
  type AtlantisTile,
  type GameEvent,
  type GameState,
  type MatchLength,
  type Settings,
} from '../engine/atlantida';
import { autoSetup } from '../game/autoSetup';
import { chooseAction } from '../game/bot';
import { drawRobotFamilies, setSeatLooks, teamColor, teamName } from '../game/players';
import { ONLINE_AVAILABLE, ONLINE_SITE, wsUrl, type SeatInfo, type ServerMsg } from '../net/protocol';
import { FRONT_AZ, HOME_AZ, Stage3D, type Highlight } from '../stage/Stage3D';
import { icons, teamIcons, type IconName } from '../stage/icons';
import { getLang, setLang, t } from '../i18n';
import { logoSvg } from './logo';
import { isMuted, isMusicOn, isVibeOn, setVibeOn, play, setClimax, setMuted, setMusicOn, unlockAudio, type SoundName } from './sfx';

type IconNode = Parameters<typeof createElement>[0];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** Tridente desenhado no mesmo traço dos ícones (o lucide não tem um). */
const Trident = [
  ['path', { d: 'M12 3v18' }],
  ['path', { d: 'M6 4v3a6 6 0 0 0 12 0V4' }],
  ['path', { d: 'm4.5 6 1.5-3 1.5 3' }],
  ['path', { d: 'm10.5 6 1.5-3 1.5 3' }],
  ['path', { d: 'm16.5 6 1.5-3 1.5 3' }],
  ['path', { d: 'M9.5 21h5' }],
] as unknown as IconNode;
const icon = (n: IconNode, size = 18) => createElement(n, { width: size, height: size, class: 'icon' }) as unknown as SVGElement;

const TILE_PT: Record<AtlantisTile, string> = { crystal: t('Crystal', 'Cristal'), column: t('Column', 'Coluna'), portal: 'Portal', trident: t('Trident', 'Tridente'), calm: t('Calm Tide', 'Maré calma'), shield: t('Shield', 'Escudo'), ruin: t('Ruin', 'Ruína') };
const CREATURE_PT: Record<string, string> = { octopus: t('Colossus Octopus', 'Polvo-colosso'), leviathan: t('Leviathan', 'Leviatã'), guardian: t('Nereus', 'Nereu'), surge: t('Surge Tide', 'Maré viva') };
const SUMMONS = {
  triton: { name: t('Triton', 'Tritão'), tip: t('Mighty push: throws a neighboring rival up to 2 tiles. In the water, they end up adrift.', 'Empurrão forte: joga um adversário vizinho até 2 casas. Na água, ele fica boiando.') },
  lasso: { name: t('Lasso', 'Laço'), tip: t('Steals the Princess from a rival team that has a pirate up to 3 tiles from one of yours. She must not be on the ship yet.', 'Rouba a Princesa de um time rival que tenha um pirata a até 3 casas de um seu. Ela ainda não pode estar no navio.') },
  siren: { name: t('Siren', 'Sereia'), tip: t('Song: steals all crystals but 2 from a neighboring pirate\'s team (nothing to steal if they have 2 or fewer).', 'Canto: rouba todos os cristais, menos 2, do time de um pirata vizinho (nada a roubar se tiver 2 ou menos).') },
  colossus: { name: t('Coral Colossus', 'Colosso de coral'), tip: t('Instant dome: places a dome on any free tile except the Castle.', 'Cúpula relâmpago: coloca uma cúpula em qualquer casa livre que não seja o Castelo.') },
} as const;
type SummonKind = keyof typeof SUMMONS;
type Mode = 'move' | 'push' | 'swim' | `summon:${SummonKind}`;
type Session = { kind: 'bots' } | { kind: 'hot' } | { kind: 'net' };
interface NetState {
  ws: WebSocket;
  you: number;
  code: string;
  host: boolean;
  seats: SeatInfo[];
  started: boolean;
  error: string;
}

/* ---------- estado do aplicativo ---------- */

let game: GameState;
let session: Session = { kind: 'bots' };
let net: NetState | null = null;
let rng = new Rng(1);
let mode: Mode = 'move';
let selBuilder: string | null = null;
/** Escolhendo o Portal de destino: as jogadas de teletransporte esperando o toque no Portal para onde ir. */
let portalPick: Extract<Action, { type: 'move' }>[] | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let legal: Action[] = [];
let lastDie: string | null = null;
let inGame = false;
const logLines: string[] = [];
const opts = { bots: 1, players: 2, length: 'short' as MatchLength };
/** O final por fuga vale na partida em curso (ou, na tela inicial, na duração escolhida). */
const escapeRules = (): boolean => (inGame ? game.settings.ending === 'escape' : opts.length !== 'long');
/** Regras da partida em curso; na tela inicial, as da duração escolhida (o jogo de amostra não conta). */
const cfg = (): Settings => (inGame ? game.settings : { ...DEFAULT_SETTINGS, ...LENGTH_PRESETS[opts.length] });
let homeTab: 'bot' | 'local' | 'net' = 'bot';

const mine = (p: number): boolean => (session.kind === 'hot' ? true : session.kind === 'bots' ? p === 0 : !!net && net.you === p);
/** Quem olha a tela agora (no mesmo aparelho, quem joga a vez). */
const viewer = (): number => (session.kind === 'hot' ? actor(game) : session.kind === 'bots' ? 0 : net?.you ?? -1);
const isHumanTurn = () => inGame && game.phase !== 'ended' && mine(actor(game));
const pname = (p: number): string => {
  if (session.kind === 'net' && net?.seats[p]) return net.seats[p].name + (p === net.you ? ' (você)' : '');
  if (session.kind === 'bots') return teamName(p) + (p === 0 ? t(' (you)', ' (você)') : ' (BOT)');
  return teamName(p);
};
const isBotSeat = (p: number) => (session.kind === 'net' ? net?.seats[p]?.kind === 'bot' : session.kind === 'bots' ? p !== 0 : false);

/* ---------- textos ---------- */

const bname = (id: string) => {
  const b = game.builders.find((x) => x.id === id)!;
  return `${teamName(b.owner)} ${id.slice(-1) === '0' ? 1 : 2}`;
};
let endTimer = 0; // espera curta antes do aviso de fim, enquanto a ilha some
const LENGTH_PT: Record<MatchLength, string> = { short: t('Short', 'Curta'), medium: t('Medium', 'Média'), long: t('Long', 'Longa') };
const LENGTH_HINT: Record<MatchLength, string> = {
  short: t('about 7 rounds: the tide shifts fast; the Octopus, Leviathan and Nereus attack', 'cerca de 7 rodadas: a maré vira rápido; Polvo, Leviatã e Nereu atacam'),
  medium: t('about 8 to 12 rounds: the tide shifts, with Nereus', 'cerca de 8 a 12 rodadas: a maré vira, com o Nereu'),
  long: t('about 16 rounds: the original game, with the Princess of the Castle', 'cerca de 16 rodadas: o jogo original, com a Princesa do Castelo'),
};
const say = (t: string) => {
  logLines.push(t);
  if (logLines.length > 80) logLines.shift();
};
const evText = (e: GameEvent): string | null => {
  const P = (k: string) => teamName(e[k] as number);
  switch (e.type) {
    case 'crystal': return t(`${P('owner')} gained 1 crystal${e.surge ? ' (Surge Tide)' : ''}.`, `${P('owner')} ganhou 1 cristal${e.surge ? ' (Maré viva)' : ''}.`);
    case 'unearth': return e.tile === 'crystal' || e.tile === 'trident' || e.tile === 'calm' ? t(`${P('owner')} picked up a treasure: ${TILE_PT[e.tile as AtlantisTile]}!`, `${P('owner')} pegou um tesouro: ${TILE_PT[e.tile as AtlantisTile]}!`) : t(`${P('owner')} dug up: ${TILE_PT[e.tile as AtlantisTile]}.`, `${P('owner')} descobriu: ${TILE_PT[e.tile as AtlantisTile]}.`);
    case 'castleCrystal': return t(`${P('owner')} rescued the Princess from the Castle!`, `${P('owner')} resgatou a Princesa do Castelo!`);
    case 'princessSafe': return t(`${P('owner')} brought the Princess safely aboard (+${e.value} points)!`, `${P('owner')} levou a Princesa a salvo para o navio (+${e.value} pontos)!`);
    case 'launch': return t(`${bname(e.builderId as string)} got into a boat.`, `${bname(e.builderId as string)} entrou num bote.`);
    case 'aboard': return t(`${bname(e.builderId as string)} boarded the ship!`, `${bname(e.builderId as string)} subiu no navio!`);
    case 'escapeStarted': return t(`${P('by')} reached their ship! The island will vanish when the turn comes back to that team: last chance to escape.`, `${P('by')} chegou ao navio! A ilha vai sumir quando a vez voltar a esse time: última chance de fugir.`);
    case 'islandVanishes': return (e.left as string[]).length ? t(`The island vanished into the sea! ${(e.left as string[]).map((id) => bname(id)).join(', ')} left adrift.`, `A ilha sumiu no mar! ${(e.left as string[]).map((id) => bname(id)).join(', ')} ficou boiando.`) : t('The island vanished into the sea! Everyone escaped.', 'A ilha sumiu no mar! Todos escaparam.');
    case 'boatCapsized': return t(`The Octopus flipped ${P('owner')}'s boat: the pirate is adrift.`, `O Polvo virou o bote de ${P('owner')}: o pirata está boiando.`);
    case 'princessLost': return t(`Nereus took the Princess of ${P('owner')} back to the bottom of the sea!`, `Nereu levou a Princesa de ${P('owner')} de volta ao fundo do mar!`);
    case 'tridentTaken': return t(`${P('owner')} picked up a trident.`, `${P('owner')} pegou um tridente.`);
    case 'calmSea': return t('Calm Tide: the next Tide phase will be skipped.', 'Maré calma: a próxima Maré será pulada.');
    case 'flood': return t(`The tile sank and revealed: ${TILE_PT[e.tile as AtlantisTile]}.`, `A casa afundou e revelou: ${TILE_PT[e.tile as AtlantisTile]}.`);
    case 'floodSkipped': return t('The Tide phase was skipped.', 'A Maré foi pulada.');
    case 'waveWarning': return game.settings.tideShift
      ? t('SHIFT incoming! Next round the wave sweeps the foamy tiles: they turn into Atlantis and anyone on the ground or 1st floor falls into the sea. Towers (2nd floor or higher), domes and Shields hold.', 'SHIFT à vista! Na próxima rodada a onda varre as casas com espuma: elas viram Atlântida e quem estiver no chão ou no 1º andar cai no mar. Torres (2º andar ou mais), cúpulas e Escudos resistem.')
      : t('Giant wave ahead! Next round it sweeps the foamy tiles: anyone on the ground or 1st floor there falls into the sea.', 'Onda gigante à vista! Na próxima rodada ela varre as casas com espuma: quem estiver no chão ou no 1º andar ali cai no mar.');
    case 'wave': return (e.hit as string[]).length ? t(`The giant wave knocked ${(e.hit as string[]).map((id) => bname(id)).join(', ')} into the sea!`, `A onda gigante derrubou ${(e.hit as string[]).map((id) => bname(id)).join(', ')} no mar!`) : t('The giant wave passed and caught nobody.', 'A onda gigante passou e não pegou ninguém.');
    case 'floodPicked': return t('The quake picked the tile marked in red, where your pirate stands. A trident can save it.', 'O terremoto sorteou a casa marcada em vermelho, onde está o seu pirata. Um tridente pode salvá-la.');
    case 'quake': return t(`Earthquake! ${e.count} ${e.count === 1 ? 'tile is' : 'tiles are'} about to crumble and reveal Atlantis.`, `Terremoto! ${e.count} ${e.count === 1 ? 'casa vai' : 'casas vão'} se desfazer e revelar Atlântida.`);
    case 'floodCancelled': return t(`${P('by')} used the trident: the tile did not sink.`, `${P('by')} usou o tridente: a casa não afundou.`);
    case 'guardianAppears': return t('The Stone Sentinel appeared on the first Atlantis tile.', 'A Sentinela de pedra apareceu na primeira casa de Atlântida.');
    case 'floating': return t(`${P('owner')} fell in the water and is adrift.`, `${P('owner')} caiu na água e está boiando.`);
    case 'eliminated': return t(`${P('owner')} lost a pirate (gets 1 consolation crystal).`, `${P('owner')} perdeu um pirata (ganha 1 cristal de consolo).`);
    case 'die': return t(`The die rolled: ${CREATURE_PT[e.face as string]}.`, `O dado sorteou: ${CREATURE_PT[e.face as string]}.`);
    case 'octopusGrab': return t('The Octopus grabbed a pirate!', 'O Polvo agarrou um pirata!');
    case 'leviathanGrab': return t('The Leviathan lassoed a pirate with its tail!', 'O Leviatã laçou um pirata com a cauda!');
    case 'crumble': return t('A tile of Atlantis crumbled: now it is open sea.', 'Uma casa de Atlântida desmoronou: virou mar aberto.');
    case 'leviathanSmash': return t('The Leviathan smashed the top block of a tile.', 'O Leviatã derrubou o bloco de cima de uma casa.');
    case 'castleRises': return t('The Castle of Atlantis rose from the sea, with two towers and stairs! The Princess waits at the top.', 'O Castelo de Atlântida emergiu do mar, com duas torres e escadas! A Princesa espera no topo.');
    case 'nereusPull': return t(`Nereus rose from the sea and dragged ${bname(e.builderId as string)} into the water!`, `Nereu surgiu do mar e arrastou ${bname(e.builderId as string)} para a água!`);
    case 'nereusSleeps': return t('Nereus rose from the sea, but found nobody within reach.', 'Nereu surgiu do mar, mas não achou ninguém ao alcance.');
    case 'guardianPush': return t('The Sentinel pushed a pirate.', 'A Sentinela empurrou um pirata.');
    case 'sentinelWake': return e.falls ? t(`Sentinel water jet: ${bname(e.targetId as string)} ended up in the sea!`, `Jato de água da Sentinela: ${bname(e.targetId as string)} foi parar no mar!`) : e.pushTo ? t(`Sentinel water jet: ${bname(e.targetId as string)} was pushed away from the Castle.`, `Jato de água da Sentinela: ${bname(e.targetId as string)} foi empurrado para longe do Castelo.`) : t(`The Sentinel fired at ${bname(e.targetId as string)}, but something held the push back.`, `A Sentinela atirou em ${bname(e.targetId as string)}, mas algo segurou o empurrão.`);
    case 'sentinelSleeps': return t('The Sentinel keeps sleeping: no pirate within 2 tiles.', 'A Sentinela continua dormindo: não há pirata a até 2 casas.');
    case 'landed': return t(`${bname(e.builderId as string)} reached land.`, `${bname(e.builderId as string)} chegou à terra.`);
    case 'summon':
      return e.kind === 'triton' ? t(`Triton: mighty push${e.falls ? ', and they landed in the water' : ''}.`, `Tritão: empurrão forte${e.falls ? ', e foi parar na água' : ''}.`) : e.kind === 'lasso' ? t(`Lasso: ${teamName(e.to as number)} stole the Princess from ${teamName(e.from as number)}!`, `Laço: ${teamName(e.to as number)} roubou a Princesa de ${teamName(e.from as number)}!`) : e.kind === 'siren' ? t(`Siren: stole ${e.amount ?? 1} crystal${e.amount === 1 ? '' : 's'}.`, `Sereia: roubou ${e.amount ?? 1} cristal${e.amount === 1 ? '' : 'is'}.`) : t('Coral Colossus: instant dome.', 'Colosso de coral: cúpula relâmpago.');
    default: return null;
  }
};
const actText = (a: Action): string | null => {
  const n = teamName(a.player);
  switch (a.type) {
    case 'move': return t(`${n}: moves ${bname(a.builderId)}${a.portalTo ? ' through the Portal' : ''}.`, `${n}: move ${bname(a.builderId)}${a.portalTo ? ' pelo Portal' : ''}.`);
    case 'swim': return t(`${n}: ${bname(a.builderId)} swims.`, `${n}: ${bname(a.builderId)} nada.`);
    case 'launch': return t(`${n}: ${bname(a.builderId)} gets into a boat.`, `${n}: ${bname(a.builderId)} entra num bote.`);
    case 'row': return t(`${n}: ${bname(a.builderId)} rows.`, `${n}: ${bname(a.builderId)} rema.`);
    case 'push': return t(`${n}: pushes ${bname(a.targetId)}.`, `${n}: empurra ${bname(a.targetId)}.`);
    case 'endActions': return t(`${n}: ends their actions.`, `${n}: termina as ações.`);
    case 'flood': return t(`${n}: picks the tile that sinks.`, `${n}: escolhe a casa que afunda.`);
    case 'rollDie': return t(`${n}: rolls the creature die.`, `${n}: rola o dado das criaturas.`);
    case 'moveCreature': return t(`${n}: moves ${CREATURE_PT[a.creatureId]}.`, `${n}: move ${CREATURE_PT[a.creatureId]}.`);
    case 'summon': return t(`${n}: summons ${SUMMONS[a.kind].name}.`, `${n}: convoca ${SUMMONS[a.kind].name}.`);
    default: return null;
  }
};

/* ---------- aviso rápido ---------- */

let toastTimer: ReturnType<typeof setTimeout> | null = null;
const toast = (t: string) => {
  const el = $('toast');
  el.textContent = t;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
};

/* ---------- jogadas ---------- */

/* ---------- rolagem do dado ---------- */

let rollUntil = 0; // os bots esperam a rolagem terminar
let rolling = false; // enquanto o dado gira, o resultado fica escondido
let rollTimer: ReturnType<typeof setTimeout> | null = null;
const ROLL_MS = 1100;
const rollDie = (face: string) => {
  const box = $('roll');
  const img = box.querySelector('img')!;
  const cap = box.querySelector('b')!;
  const ic = icons();
  const faces = ['octopus', 'leviathan', 'guardian', 'surge'] as const;
  box.hidden = false;
  box.className = 'spin';
  rolling = true;
  cap.textContent = '';
  rollUntil = Date.now() + ROLL_MS + 900;
  const t0 = Date.now();
  let last = '';
  if (rollTimer) clearTimeout(rollTimer);
  // troca de face cada vez mais devagar, como um dado perdendo força
  const step = () => {
    const el = Date.now() - t0;
    if (el >= ROLL_MS) {
      img.src = ic[face as IconName];
      cap.textContent = CREATURE_PT[face];
      box.className = 'land';
      play('dieLand');
      rolling = false;
      refresh();
      rollTimer = setTimeout(() => (box.hidden = true), 1400);
      return;
    }
    let f: string = faces[Math.floor(Math.random() * faces.length)];
    if (f === last) f = faces[(faces.indexOf(f as (typeof faces)[number]) + 1) % faces.length];
    last = f;
    img.src = ic[f as IconName];
    play('tick');
    rollTimer = setTimeout(step, 60 + (el / ROLL_MS) * 160);
  };
  step();
};

/** O final: a ilha afunda (3,4 s), Nereu surge, ruge e some; só então vem o veredito e o painel final. */
const FINALE_MS = 7000;

/** Ordem de importância dos sons: em cada jogada toca só o primeiro desta lista que aconteceu. */
const SOUND_OF: [string, SoundName][] = [
  ['princessSafe', 'castle'],
  ['castleCrystal', 'castle'],
  ['wave', 'wave'],
  ['waveWarning', 'waveWarning'],
  ['eliminated', 'eliminated'],
  ['aboard', 'aboard'],
  ['leviathanSmash', 'smash'],
  ['crumble', 'crumble'],
  ['boatCapsized', 'splash'],
  ['castleRises', 'castle'],
  ['nereusPull', 'swim'],
  ['floating', 'splash'],
  ['flood', 'flood'],
  ['floodCancelled', 'trident'],
  ['quake', 'quake'],
  ['summon', 'summon'],
  ['princessLost', 'splash'],
  ['push', 'push'],
  ['guardianPush', 'push'],
  ['sentinelWake', 'smash'],
  ['launch', 'launch'],
  ['row', 'row'],
  ['swim', 'swim'],
  ['landed', 'swim'],
  ['move', 'move'],
  ['creatureMove', 'creature'],
];
const soundFor = (events: GameEvent[]) => {
  const over = events.find((e) => e.type === 'gameOver');
  const verdict = () => play((over?.winners as number[] | null)?.some((w) => mine(w)) ? 'win' : 'lose');
  if (over && events.some((e) => e.type === 'islandVanishes')) {
    play('sink'); // a ilha afunda (3,4 s) e só então o som de vitória ou derrota, junto com o aviso de fim
    setTimeout(verdict, FINALE_MS);
    return;
  }
  if (over) return verdict();
  for (const [type, s] of SOUND_OF) if (events.some((e) => e.type === type)) return play(s);
};

const takeState = (events: GameEvent[]) => {
  wake();
  soundFor(events);
  events.forEach((e) => {
    if (e.type === 'die') {
      lastDie = e.face as string;
      rollDie(lastDie);
    }
    // ganhou algo: um aviso curto diz para que serve
    const mine = e.owner === viewer() && !e.surge;
    if (mine && e.type === 'crystal') toast(t('+1 crystal: worth 1 point if you keep it, and pays for Summons.', '+1 cristal: vale 1 ponto se você guardar, e paga as Convocações.'));
    if (mine && e.type === 'tridentTaken') toast(t('Trident kept: during the quake, use it to stop a tile from sinking.', 'Tridente guardado: no terremoto, use para impedir uma casa de afundar.'));
    // a Maré calma se aplica sozinha ao ser pega: todo mundo recebe o aviso, e outro avisa quando o terremoto é pulado
    if (e.type === 'calmSea') {
      if (mine) toast(t('Calm Tide: the next quake will be skipped. It applies by itself, nothing to press.', 'Maré calma: o próximo terremoto será pulado. Ela vale sozinha, não precisa apertar nada.'));
      else if (!e.surge) toast(t(`${teamName(e.owner as number)} found Calm Tide: the next quake will be skipped.`, `${teamName(e.owner as number)} achou a Maré calma: o próximo terremoto será pulado.`));
    }
    if (e.type === 'floodSkipped') toast(t('Calm Tide: the quake was skipped this round.', 'Maré calma: o terremoto foi pulado nesta rodada.'));
    if (mine && e.type === 'castleCrystal') toast(t('You rescued the Princess! Get to the ship: boarding with her gives a big bonus (+4).', 'Você resgatou a Princesa! Chegue ao navio: embarcar com ela dá um bônus grande (+4).'));
    if (mine && e.type === 'princessSafe') toast(t('Princess safe! +4 points.', 'Princesa a salvo! +4 pontos.'));
    if (e.type === 'castleRises') toast(t('The Castle rose! Climb the stairs and towers to rescue the Princess at the top.', 'O Castelo emergiu! Suba pelas escadas e torres para resgatar a Princesa no topo.'));
    if (e.type === 'escapeStarted') toast(e.by === viewer() ? t('You reached the ship! The island will vanish: the others get one more turn to escape.', 'Você chegou ao navio! A ilha vai sumir: os outros têm mais um turno para fugir.') : t('Someone reached the ship! The island will vanish: you have one more turn to escape.', 'Alguém chegou ao navio! A ilha vai sumir: você tem mais um turno para fugir.'));
    if (e.type === 'islandVanishes') toast(t('The island vanished into the sea!', 'A ilha sumiu no mar!'));
    if (e.type === 'princessLost' && e.owner === viewer()) toast(t('Nereus took your Princess back to the bottom of the sea!', 'Nereu levou a sua Princesa de volta ao fundo do mar!'));
    if (e.type === 'summon' && e.kind === 'lasso') {
      if (e.from === viewer()) toast(t(`${teamName(e.to as number)} lassoed your Princess!`, `${teamName(e.to as number)} laçou a sua Princesa!`));
      else if (e.to === viewer()) toast(t('Lasso! The Princess is yours now. Get her to the ship.', 'Laço! A Princesa agora é sua. Leve-a ao navio.'));
    }
    if (e.type === 'summon' && e.kind === 'siren') {
      const thief = teamName(e.to as number);
      if (e.from === viewer()) setTimeout(() => explainSiren(thief, true, (e.amount as number) ?? 1), 1400);
      else if (e.to === viewer()) toast(t(`Siren: you stole ${e.amount ?? 1} crystal${e.amount === 1 ? '' : 's'} from ${teamName(e.from as number)}.`, `Sereia: você roubou ${e.amount ?? 1} cristal${e.amount === 1 ? '' : 'is'} de ${teamName(e.from as number)}.`));
    }
    const line = evText(e);
    if (line) say(line);
  });
  closeChooser();
  refresh();
  stage.playEvents(events, game);
  for (const e of events) if (e.type === 'wave') stage.playWave(waveCells(game, e.side as number));
  if (events.some((e) => e.type === 'waveWarning')) toast(t('The wave is coming! Leave the foamy tiles before the next round.', 'Onda gigante à vista! Saia das casas com espuma antes da próxima rodada.'));
  if (session.kind === 'hot' && inGame && game.phase === 'action' && events.some((e) => e.type !== 'summon')) faceActor();
};

const apply = (a: Action) => {
  portalPick = null;
  if (session.kind === 'net') {
    net?.ws.send(JSON.stringify({ t: 'action', action: a }));
    closeChooser();
    return;
  }
  const r = applyAction(game, a);
  if (!r.ok) {
    play('error');
    toast(t('That move is not allowed right now.', r.error));
    return refresh();
  }
  const line = actText(a);
  if (line) say(line);
  game = r.state;
  takeState(r.events);
  schedule();
};

const schedule = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!inGame || session.kind !== 'bots' || game.phase === 'ended' || isHumanTurn()) return;
  timer = setTimeout(() => apply(chooseAction(game, rng)), Math.max(560, rollUntil - Date.now()));
};

const faceActor = () => {
  const p = actor(game);
  stage.faceSide(game.builders.filter((b) => b.owner === p && b.hex).map((b) => b.hex!));
};

/* ---------- o que dá para clicar ---------- */

const builderHex = (id: string): Hex => game.builders.find((b) => b.id === id)!.hex!;
const cellOf = (a: Action): Hex | null => {
  switch (a.type) {
    case 'placeBuilder':
    case 'flood': return a.hex;
    case 'move': return portalPick && a.portalTo ? a.portalTo : a.to;
    case 'swim':
    case 'launch':
    case 'row': return a.to;
    case 'push': return builderHex(a.targetId);
    case 'moveCreature': return a.to;
    case 'summon': return a.kind === 'triton' || a.kind === 'siren' || a.kind === 'lasso' ? builderHex(a.targetId) : a.at;
    default: return null;
  }
};
/** Jogadas do Polvo/Leviatã: ficar parado só vale se não houver nenhuma outra casa para onde ir. */
const creatureMoves = (): Extract<Action, { type: 'moveCreature' }>[] => {
  const all = legal.filter((a): a is Extract<Action, { type: 'moveCreature' }> => a.type === 'moveCreature');
  const cr = all.length ? game.creatures.find((c) => c.type === all[0].creatureId) : undefined;
  const moving = cr?.hex ? all.filter((a) => !hexEquals(a.to, cr.hex!)) : all;
  return moving.length ? moving : all;
};
const candidates = (): Action[] => {
  if (!isHumanTurn()) return [];
  switch (game.phase) {
    case 'setup': return legal;
    case 'flood': return game.pendingFlood ? [] : legal;
    case 'creatures': return rolling ? [] : creatureMoves();
    case 'action':
      if (portalPick) return portalPick;
      if (mode.startsWith('summon:')) return legal.filter((a) => a.type === 'summon' && a.kind === mode.slice(7));
      return legal.filter((a) => ['move', 'swim', 'launch', 'row', 'push'].includes(a.type) && 'builderId' in a && a.builderId === selBuilder);
    default: return [];
  }
};
const label = (a: Action): string => {
  switch (a.type) {
    case 'move': return a.portalTo ? t('Teleport to the other Portal', 'Teletransportar para o outro Portal') : game.cells[hexKey(a.to)].tile === 'portal' ? t('Stop on this Portal', 'Parar neste Portal') : t('Move', 'Mover');
    case 'summon': return a.kind === 'triton' ? t(`Push ${a.distance} tile${a.distance > 1 ? 's' : ''}`, `Empurrar ${a.distance} casa${a.distance > 1 ? 's' : ''}`) : a.kind === 'lasso' ? t(`Lasso with ${bname(a.builderId)}`, `Laçar com ${bname(a.builderId)}`) : a.kind === 'siren' ? t(`Steal with ${bname(a.builderId)}`, `Roubar com ${bname(a.builderId)}`) : t('Dome here', 'Cúpula aqui');
    case 'swim': return hexEquals(a.to, game.ships[a.player]) ? t('Board the ship', 'Subir no navio') : t('Swim here', 'Nadar até aqui');
    case 'launch': return t('Get into a boat', 'Entrar num bote');
    case 'row': return hexEquals(a.to, game.ships[a.player]) ? t('Board the ship', 'Subir no navio') : isWaterHex(a.to) ? t('Row here', 'Remar até aqui') : t('Land on the beach', 'Descer na praia');
    case 'push': return t(`Push ${bname(a.targetId)}`, `Empurrar ${bname(a.targetId)}`);
    case 'moveCreature':
      if (!a.target) return t('Just move to this tile', 'Só ir para esta casa');
      if (a.creatureId === 'leviathan' && a.target.includes(',')) return t('Smash the top block', 'Derrubar o bloco de cima');
      return (a.creatureId !== 'guardian' ? t('Grab ', 'Agarrar ') : t('Push ', 'Empurrar ')) + bname(a.target);
    default: return a.type;
  }
};
const closeChooser = () => {
  $('chooser').hidden = true;
};

/** Ponto invisível onde o balão de uma casa se apoia (o lugar do toque). */
const tapAnchor = (() => {
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;width:1px;height:1px;pointer-events:none';
  return d;
})();
const showTileInfo = (h: Hex, px: number, py: number, tile: AtlantisTile, acts: Action[]) => {
  const app = $('app');
  if (!tapAnchor.parentElement) app.appendChild(tapAnchor);
  const r = app.getBoundingClientRect();
  tapAnchor.style.left = px - r.left + 'px';
  tapAnchor.style.top = py - r.top - 10 + 'px';
  closePop();
  openPop(`tile:${hexKey(h)}`, tapAnchor, (box) => {
    const info = TILE_INFO[tile];
    popHead(box, TILE_PT[tile]);
    popText(box, t(`<b>How to get it:</b> ${info.get}`, `<b>Como pegar:</b> ${info.get}`));
    popText(box, t(`<b>What it does:</b> ${info.use}`, `<b>Para que serve:</b> ${info.use}`));
    if (tile === 'portal') {
      const open = Object.values(game.cells).filter((c) => c.state === 'atlantis' && c.tile === 'portal').length;
      popText(box, open >= 2 ? t(`<b>On:</b> ${open} Portals are revealed.`, `<b>Ligado:</b> há ${open} Portais revelados.`) : t('<b>Off (gray):</b> it is the only revealed Portal. It turns on by itself when another shows up in a quake.', '<b>Desligado (cinza):</b> é o único Portal revelado. Ele liga sozinho quando outro aparecer no terremoto.'));
    }
    if (acts.length) {
      const btns = document.createElement('div');
      btns.className = 'pop-actions';
      const jumps = acts.filter((a): a is Extract<Action, { type: 'move' }> => a.type === 'move' && !!a.portalTo);
      acts
        .filter((a) => !(a.type === 'move' && a.portalTo))
        .forEach((a) => btns.appendChild(btn(a.type === 'move' && treasureAt(h) ? t(`Walk and take ${TILE_PT[tile]}`, `Andar e pegar ${TILE_PT[tile]}`) : a.type === 'move' && tile === 'portal' ? t('Walk and stop on the Portal', 'Andar e parar no Portal') : label(a), () => (closePop(), apply(a)), { primary: true })));
      if (jumps.length)
        btns.appendChild(
          btn(jumps.length === 1 ? t('Teleport through the Portal', 'Teletransportar pelo Portal') : t(`Teleport (choose from ${jumps.length} Portals)`, `Teletransportar (escolher entre ${jumps.length} Portais)`), () => {
            closePop();
            if (jumps.length === 1) return apply(jumps[0]);
            portalPick = jumps; // destaca os Portais de chegada; o próximo toque escolhe
            refresh();
          }, { primary: true }),
        );
      box.appendChild(btns);
    }
  });
};

const onCell = (h: Hex, px: number, py: number) => {
  if (!isHumanTurn()) {
    const t = visibleTile(h);
    if (t) showTileInfo(h, px, py, t, []);
    return;
  }
  const acts = candidates()
    .filter((a) => {
      const c = cellOf(a);
      return c && hexEquals(c, h);
    })
    // jogadas idênticas (ex.: nadar até o navio aparece duas vezes) viram uma só: não precisa perguntar
    .filter((a, i, all) => all.findIndex((x) => x.type === a.type && JSON.stringify(x) === JSON.stringify(a)) === i);
  if (portalPick) {
    // tocou num Portal de chegada: vai; tocou fora: desiste da escolha
    if (acts.length) return apply(acts[0]);
    portalPick = null;
    return refresh();
  }
  // vez do Polvo/Leviatã: tocar fora das casas em destaque (inclusive em cima do próprio monstro) não faz nada, só avisa
  if (game.phase === 'creatures' && game.die && !rolling && acts.length === 0) {
    const name = CREATURE_PT[game.die];
    // pirata fora de alcance (2º andar ou mais, ou sob Escudo): avisa que o monstro não consegue agarrá-lo
    if (game.die === 'octopus' || game.die === 'leviathan') {
      const prey = game.builders.find((b) => isAlive(b) && b.status === 'board' && b.hex && hexEquals(b.hex, h));
      const cell = prey?.hex ? game.cells[hexKey(prey.hex)] : undefined;
      if (prey && cell && (cell.tile === 'shield' || cell.floors > game.settings.octopusReach)) {
        const why = cell.tile === 'shield' ? t('is protected by a Shield', 'está protegido por um Escudo') : t('is up on the 2nd floor or higher', 'está no 2º andar ou mais alto');
        toast(t(`Not possible: the ${name} cannot grab ${bname(prey.id)}, who ${why}.`, `Não é possível: o ${name} não consegue agarrar ${bname(prey.id)}, que ${why}.`));
        return;
      }
    }
    toast(t(`Tap one of the highlighted tiles to move the ${name}.`, `Toque numa das casas em destaque para mover o ${name}.`));
    return;
  }
  // casa com peça à vista: primeiro explica o que é (e oferece o botão), em vez de jogar direto
  const tile = visibleTile(h);
  // (andar, nadar ou remar para a casa vai direto, sem perguntar; só o Portal com teletransporte ainda oferece a escolha)
  const goesStraight = !acts.some((a) => a.type === 'move' && a.portalTo) && acts.some((a) => a.type === 'move' || a.type === 'swim' || a.type === 'row' || a.type === 'launch');
  if (tile && !goesStraight && !acts.some((a) => a.type === 'moveCreature' || a.type === 'flood' || a.type === 'summon')) {
    const own = game.builders.some((b) => b.owner === viewer() && isAlive(b) && b.hex && hexEquals(b.hex, h));
    if (!own) return showTileInfo(h, px, py, tile, acts);
  }
  if (acts.length === 0) {
    // no bote cabem 2: tocar de novo troca entre os dois
    const here = game.builders.filter((b) => b.owner === viewer() && isAlive(b) && b.hex && hexEquals(b.hex, h));
    const own = here.length > 1 ? here[(here.findIndex((b) => b.id === selBuilder) + 1) % here.length] : here[0];
    if (own && game.phase === 'action') {
      selBuilder = own.id;
      mode = own.status === 'floating' ? 'swim' : 'move';
    }
    closeChooser();
    return refresh();
  }
  if (acts.length === 1) return apply(acts[0]);
  const box = $('chooser');
  box.innerHTML = '';
  // jogadas de pirata (andar, empurrar, nadar): só o ícone; o resto continua com texto
  const ICONS: Record<string, IconNode> = { move: Footprints, push: Hand, swim: Waves, launch: Sailboat, row: Sailboat };
  const iconOnly = acts.every((a) => a.type in ICONS);
  box.classList.toggle('icons', iconOnly);
  acts.forEach((a) => {
    const b = iconOnly ? btn('', () => apply(a), { icon: ICONS[a.type], title: label(a) }) : btn(label(a), () => apply(a));
    if (iconOnly) b.setAttribute('aria-label', label(a));
    box.appendChild(b);
  });
  if (iconOnly) {
    // o balão fica logo acima do toque, com a pontinha para a casa
    const half = 14 + acts.length * 31;
    box.style.left = Math.max(half, Math.min(px, innerWidth - half)) + 'px';
    box.style.top = Math.max(90, py - 6) + 'px';
  } else {
    box.style.left = Math.max(8, Math.min(px, innerWidth - 230)) + 'px';
    box.style.top = Math.max(8, Math.min(py, innerHeight - (50 * acts.length + 20))) + 'px';
  }
  box.hidden = false;
};

/* ---------- peças de interface ---------- */

const btn = (text: string, onclick: () => void, o: { icon?: IconNode; on?: boolean; primary?: boolean; disabled?: boolean; title?: string } = {}) => {
  const b = document.createElement('button');
  b.type = 'button';
  if (o.icon) b.appendChild(icon(o.icon, 17));
  if (text) b.appendChild(document.createTextNode(text));
  b.onclick = onclick;
  if (o.on) b.classList.add('on');
  if (o.primary) b.classList.add('primary');
  if (o.disabled) b.disabled = true;
  if (o.title) b.title = o.title;
  return b;
};
const row = (...children: HTMLElement[]) => {
  const d = document.createElement('div');
  d.className = 'row';
  children.forEach((c) => d.appendChild(c));
  return d;
};

/* ---------- popovers: tocar num item (ou no "?") explica o que ele significa ---------- */

let popKey: string | null = null;
let popAnchor: HTMLElement | null = null;
const closePop = () => {
  $('pop').hidden = true;
  popKey = null;
  popAnchor = null;
  document.querySelectorAll('.dice-help.open').forEach((e) => e.classList.remove('open'));
};
const openPop = (key: string, anchor: HTMLElement, build: (box: HTMLElement) => void) => {
  if (popKey === key) return closePop();
  closePop();
  const box = $('pop');
  box.replaceChildren();
  build(box);
  box.hidden = false;
  popKey = key;
  popAnchor = anchor;
  if (anchor.classList.contains('dice-help')) anchor.classList.add('open');
  const app = $('app').getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const left = Math.max(8, Math.min(a.left - app.left + a.width / 2 - w / 2, app.width - w - 8));
  const above = a.top - app.top - h - 8;
  box.style.left = left + 'px';
  box.style.top = (above >= 8 ? above : Math.min(a.bottom - app.top + 8, app.height - h - 8)) + 'px';
};
const popText = (box: HTMLElement, html: string) => {
  const p = document.createElement('p');
  p.innerHTML = html;
  box.appendChild(p);
};
const popHead = (box: HTMLElement, title: string, img?: string) => {
  const hd = document.createElement('div');
  hd.className = 'pop-head';
  if (img) {
    const i = document.createElement('img');
    i.src = img;
    i.alt = '';
    hd.appendChild(i);
  }
  const b = document.createElement('b');
  b.textContent = title;
  hd.appendChild(b);
  box.appendChild(hd);
};
const bindHelp = (id: string, title: string, lines: () => string[]) => {
  const b = $(id);
  b.appendChild(icon(CircleHelp, 14));
  b.onclick = (e) => {
    e.stopPropagation();
    openPop(id, b, (box) => {
      popHead(box, title);
      lines().forEach((l) => popText(box, l));
    });
  };
};
document.addEventListener('pointerdown', (e) => {
  if (!popKey) return;
  const t = e.target as Node;
  if ($('pop').contains(t) || (popAnchor && popAnchor.contains(t))) return;
  closePop();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closePop());

/** O que cada peça de Atlântida faz, como se pega e como se usa (balão ao tocar na casa e regras). */
const TILE_INFO: Record<AtlantisTile, { treasure: boolean; get: string; use: string }> = {
  crystal: { treasure: true, get: t('Step on the tile with a pirate: stepping reveals what is under it, even before it sinks.', 'Pise na casa com um pirata: pisar revela o que há embaixo, mesmo antes de ela afundar.'), use: t('A <b>resource</b>: worth <b>1 point</b> if you keep it at the end, and it pays for <b>Summons</b> (bottom panel). Spending it costs you points.', 'É um <b>recurso</b>: vale <b>1 ponto</b> se você guardar até o fim, e paga as <b>Convocações</b> (painel de baixo). Gastar custa pontos.') },
  trident: { treasure: true, get: t('Step on the tile with a pirate (stepping reveals it).', 'Pise na casa com um pirata (pisar revela).'), use: t('Kept on the scoreboard (trident icon, next to the crystals). When the quake picks the tile under your pirate, it is used <b>by itself</b>: the tile does not sink.', 'Fica guardado no placar (ícone de tridente, ao lado dos cristais). Quando o terremoto sortear a casa do seu pirata, ele é usado <b>sozinho</b>: a casa não afunda.') },
  calm: { treasure: true, get: t('Step on the tile with a pirate.', 'Pise na casa com um pirata.'), use: t('It applies <b>by itself</b> the moment it is collected (nothing to store or press): the <b>next quake is skipped</b>, and everyone gets an alert.', 'Vale <b>sozinha</b> na hora em que é pega (não guarda nem aperta nada): o <b>próximo terremoto é pulado</b>, e todos recebem um alerta.') },
  portal: { treasure: false, get: t('Walk onto it.', 'Ande até ela.'), use: t('Tap the tile and choose to <b>stop</b> or <b>go to another free Portal</b> (a shortcut across the map). It only works with <b>2 revealed Portals</b>: until then it stays <b>gray</b>, switched off.', 'Ao tocar na casa, escolha <b>parar</b> ou <b>ir para outro Portal livre</b> (atalho pelo mapa). Só funciona com <b>2 Portais revelados</b>: até lá ele fica <b>cinza</b>, desligado.') },
  shield: { treasure: false, get: t('Stay on top of it.', 'Fique em cima dela.'), use: t('While you stand on it, the sea and the creatures <b>cannot take you</b>.', 'Enquanto você estiver em cima, o mar e as criaturas <b>não te levam</b>.') },
  column: { treasure: false, get: t('Walk onto it.', 'Ande até ela.'), use: t('Comes with 1 floor: higher ground, where the Octopus reaches less.', 'Já nasce com 1 andar: um lugar mais alto, onde o Polvo alcança menos.') },
  ruin: { treasure: false, get: '—', use: t('No effect.', 'Nenhum efeito.') },
};
/** Peça visível nesta casa (já revelada e ainda não pega), ou null. */
const visibleTile = (h: Hex): AtlantisTile | null => {
  const c = game.cells[hexKey(h)];
  if (!c || c.temple || c.taken || !c.tile || c.tile === 'hidden') return null;
  if (c.state !== 'atlantis' && !c.dug) return null;
  return c.tile === 'ruin' ? null : c.tile;
};
/** Tesouro que um pirata pega ao pisar nesta casa agora. */
const treasureAt = (h: Hex): AtlantisTile | null => {
  const t = visibleTile(h);
  return t && TILE_INFO[t].treasure && game.cells[hexKey(h)].state === 'atlantis' ? t : null;
};

const FACE_INFO: Record<string, { faces: number; text: string }> = {
  octopus: { faces: 2, text: t('Moves the <b>Colossus Octopus</b> up to 3 tiles, <b>only through the sea</b> (the water around the island and the holes where Atlantis crumbled). When it stops, it stretches a tentacle <b>up to 2 tiles</b>, wraps a pirate and throws them into the sea (mandatory if anyone is in reach): a pirate on land ends up floating; one already floating is thrown farther away; the boat flips. Anyone on the 2nd floor or on a Shield is out of reach.', 'Move o <b>Polvo-colosso</b> até 3 casas, <b>só pelo mar</b> (a água em volta da ilha e os buracos onde Atlântida desmoronou). Ao parar, estica um tentáculo <b>até 2 casas</b>, enrola um pirata e o joga no mar (é obrigatório se houver alguém ao alcance): quem está em terra fica boiando; quem já boiava é jogado mais longe; o bote vira. Quem está no 2º andar ou num Escudo não é alcançado.') },
  leviathan: { faces: 2, text: t('Moves the <b>Leviathan</b> up to 2 tiles, only through the sea. When it stops, it can lasso a pirate up to 2 tiles away with its tail and throw them into the sea, or smash the top block of a neighboring tile (anyone on it drops one floor). It also pushes neighboring castaways 1 tile.', 'Move o <b>Leviatã</b> até 2 casas, só pelo mar. Ao parar, pode laçar com a cauda um pirata a até 2 casas e jogá-lo no mar, ou derrubar o bloco de cima de uma casa vizinha (quem estava nela cai um andar). Também empurra 1 casa os náufragos vizinhos.') },
  guardian: { faces: 1, text: t('<b>Nereus</b>, king of the seas and of Atlantis, rises from the water and drags a pirate into the sea, <b>from anywhere on the board</b>: one pirate on land is picked at random (including those of whoever rolled). Anyone on a Shield or on the 2nd floor or higher is out of his reach. Nobody is eliminated: the pirate just floats.', '<b>Nereu</b>, rei dos mares e de Atlântida, sobe da água e arrasta um pirata para o mar, <b>de qualquer lugar do tabuleiro</b>: sorteia um pirata em terra (até os do próprio jogador da vez). Quem está num Escudo ou no 2º andar ou mais alto fica fora do alcance. Ninguém é eliminado: o pirata só fica boiando.') },
  surge: { faces: 1, text: t('<b>No creature moves.</b> Every pirate on an Atlantis tile gains 1 crystal.', '<b>Nenhuma criatura se mexe.</b> Todo pirata em casa de Atlântida ganha 1 cristal.') },
};

bindHelp('helpSummons', t('Summons', 'Convocações'), () => [
  t('Spend <b>crystals</b> to call a character that does one action and leaves.', 'Gaste <b>cristais</b> para chamar um personagem que faz uma ação e vai embora.'),
  t('Only <b>1 summon per turn</b>, in the Action phase, without spending an action.', 'Só <b>1 convocação por turno</b>, na fase de Ação, sem gastar ação.'),
  t('Tap each one to see what it does. Dimmed ones cannot be used now.', 'Toque em cada uma para ver o que faz. As apagadas não dá para usar agora.'),
]);
bindHelp('helpDice', t('Die', 'Dado'), () => [
  t('In phase 3 (<b>Creatures</b>) the die picks which creature moves.', 'Na fase 3 (<b>Criaturas</b>) o dado sorteia qual criatura se mexe.'),
  t('The <b>×2</b> (or ×3) shows how many of the 6 faces the creature appears on.', 'O <b>×2</b> (ou ×3) marca em quantas das 6 faces a criatura aparece.'),
  t('Tap a face to see what it does. The lit one came out last.', 'Toque numa face para ver o que ela faz. A iluminada é a que saiu por último.'),
]);
bindHelp('helpPhase', t('Rules for this phase', 'Regras desta fase'), () => {
  const objective = escapeRules()
    ? t(`<b>Goal:</b> discover treasure and collect crystals while the island turns into Atlantis (day turns to night). When the first team reaches a ship, the island will vanish: the others get one more turn to escape. Whoever has the most points (crystals + tridents×2 + Princess) among the teams that escaped wins (castaways keep half). Rescue the Princess from the Castle and board with her: +4. If nobody escapes, Nereus keeps the treasure and nobody wins.`, `<b>Objetivo:</b> descubra tesouros e junte cristais enquanto a ilha vira Atlântida (o dia vira noite). Quando o primeiro time chega ao navio, a ilha vai sumir: os outros têm mais um turno para fugir. Vence quem tiver mais pontos (cristais + tridentes×2 + Princesa) entre os times que fugiram (quem ficou boiando leva metade). Resgate a Princesa do Castelo e embarque com ela: +4. Se ninguém fugir, Nereu fica com o tesouro e ninguém vence.`)
    : t(`<b>Goal:</b> discover treasure and collect crystals. The Princess waits on top of the Castle: rescue her and board the ship with her for a +4 bonus. After she is rescued, the first team to row all its pirates to its own ship ends the match: whoever has the most points wins.`, `<b>Objetivo:</b> descubra tesouros e junte cristais. A Princesa espera no topo do Castelo: resgate-a e embarque no navio com ela para ganhar +4 de bônus. Depois que ela for resgatada, o primeiro time que levar todos os piratas de bote até o próprio navio encerra a partida: vence quem tiver mais pontos.`);
  const byPhase: Record<string, string[]> = {
    setup: [t('<b>Setup:</b> tap a free tile on the edge to place your pirate.', '<b>Preparação:</b> toque numa casa livre da borda para colocar seu pirata.')],
    action: [t('<b>1 Action:</b> you have 3 actions. Tap your pirate, then a colored tile to walk (stepping on a closed tile away from the Castle reveals the treasure under it) or push. Summon: 1 per turn, no action spent.', '<b>1 Ação:</b> você tem 3 ações. Toque no seu pirata e depois numa casa colorida para andar (pisar numa casa fechada longe do Castelo revela o tesouro que há embaixo) ou empurrar. Convocação: 1 por turno, sem gastar ação.')],
    flood: [t(`<b>2 Tide (quake):</b> the table randomly picks the tiles that crumble and reveal Atlantis (nobody chooses), ${game.settings.floodsPerRound} per round. Anyone on them falls in the water and floats. To take the treasure of a revealed tile, walk a pirate onto it.`, `<b>2 Maré (terremoto):</b> a mesa sorteia as casas que se desfazem e revelam Atlântida (ninguém escolhe), ${game.settings.floodsPerRound} por rodada. Quem estava nelas cai na água e fica boiando. Para pegar o tesouro de uma casa revelada, leve um pirata até ela.`)],
    creatures: [t('<b>3 Creatures:</b> the die picks a creature. Move it along the yellow tiles (the Octopus and Leviathan swim only in the sea and the holes where Atlantis crumbled); it lassos anyone up to 2 tiles away and throws them into the water.', '<b>3 Criaturas:</b> o dado sorteia uma criatura. Mova-a pelas casas amarelas (o Polvo e o Leviatã nadam só pelo mar e pelos buracos onde Atlântida desmoronou); ela laça quem estiver a até 2 casas e joga na água.')],
    ended: [t('The match is over.', 'A partida terminou.')],
  };
  return [...(byPhase[game.phase] ?? []), objective];
});
bindHelp('helpScore', t('Scoreboard: what each thing is worth', 'Placar: quanto vale cada coisa'), () => [
  t(`<b>Crystal</b> = ${1} point. It also pays for summons.`, `<b>Cristal</b> = ${1} ponto. Também paga as convocações.`),
  t(`<b>Trident</b> = ${TRIDENT_VALUE} points. Or spend it to cancel one tile sinking in the Tide phase.`, `<b>Tridente</b> = ${TRIDENT_VALUE} pontos. Ou gaste para cancelar a descida de uma casa na fase de Maré.`),
  t(`<b>Princess</b> safe on your ship = +${PRINCESS_BONUS} points.`, `<b>Princesa</b> a salva no seu navio = +${PRINCESS_BONUS} pontos.`),
  t('<b>Adrift</b> (not on a ship when the island sinks): only half of your points, rounded down.', '<b>Boiando</b> (fora do navio quando a ilha afunda): só metade dos seus pontos, arredondada para baixo.'),
  t('<b>Green box</b> = your points now. Whoever has the most wins. Tie: whoever rescued the Princess, then whoever escaped first.', '<b>Caixa verde</b> = seus pontos agora. Vence quem tiver mais. Empate: quem salvou a Princesa, depois quem fugiu primeiro.'),
  t('Crystals and tridents are <b>resources</b>: spending them costs points. Tap a team to see its sum.', 'Cristais e tridentes são <b>recursos</b>: gastar custa pontos. Toque num time para ver a conta dele.'),
  t('<b>Crown</b> on the dot: that team has the Princess. <b>Squares</b>: the pirates (filled = on land, circle = floating, boat = rowing, ship = escaped).', '<b>Coroinha</b> na bolinha: esse time está com a Princesa. <b>Quadradinhos</b>: os piratas (cheio = em terra, círculo = boiando, bote = remando, navio = fugiu).'),
]);

const closeScorePop = () => document.getElementById('scorepop')?.remove();
/** Balãozinho com a conta dos pontos de um time (fecha ao tocar fora). */
const showScorePop = (p: number) => {
  const had = document.getElementById('scorepop')?.dataset.p === String(p);
  closeScorePop();
  if (had) return;
  const d = document.createElement('div');
  d.id = 'scorepop';
  d.dataset.p = String(p);
  d.style.borderColor = teamColor(p);
  const line = (label: string, val: string, cls = '') => `<tr class="${cls}"><td>${label}</td><td>${val}</td></tr>`;
  const safe = game.princess?.by === p && game.princess.safe;
  const half = game.settings.ending === 'escape' && !game.builders.some((b) => b.owner === p && b.status === 'aboard');
  d.innerHTML =
    `<h3>${pname(p)}</h3><table>` +
    line(t('Crystals', 'Cristais') + ` ${game.crystals[p]} × 1`, String(game.crystals[p])) +
    line(t('Tridents', 'Tridentes') + ` ${game.tridents[p]} × ${TRIDENT_VALUE}`, String(game.tridents[p] * TRIDENT_VALUE)) +
    line(t('Princess on the ship', 'Princesa no navio'), safe ? `+${PRINCESS_BONUS}` : game.princess?.by === p ? t('rescued, not aboard yet', 'resgatada, ainda fora do navio') : '—') +
    (half ? line(t('Adrift: half', 'Boiando: metade'), `÷ 2`, 'half') : '') +
    line(t('Points now', 'Pontos agora'), String(pointsNow(game, p)), 'tot') +
    `</table><p>${t('Crystals pay for summons; each trident cancels one tile sinking. Spending costs points.', 'Cristal paga convocações; cada tridente cancela uma casa afundando. Gastar custa pontos.')}</p>`;
  document.body.appendChild(d);
  setTimeout(() => document.addEventListener('pointerdown', closeScorePop, { once: true }), 0);
};

const usableBuilder = (id: string) => legal.some((a) => 'builderId' in a && a.builderId === id && ['move', 'push', 'swim', 'launch', 'row'].includes(a.type));
const ensureSelection = () => {
  if (!inGame) return;
  const me = viewer();
  const mineB = game.builders.filter((b) => b.owner === me && isAlive(b));
  if (!selBuilder || !mineB.some((b) => b.id === selBuilder)) selBuilder = (mineB.find((b) => usableBuilder(b.id)) ?? mineB[0])?.id ?? null;
  const sb = mineB.find((b) => b.id === selBuilder);
  if (sb && (mode === 'move' || mode === 'swim')) mode = sb.status === 'floating' ? 'swim' : 'move';
  if (game.phase !== 'action') mode = 'move';
};

/* ---------- HUD ---------- */

const renderHud = () => {
  const a = actor(game);
  const chip = $('turnchip');
  chip.style.borderColor = teamColor(a);
  const dotEl = $('turnDot');
  dotEl.style.borderColor = teamColor(a);
  dotEl.style.background = game.phase === 'ended' ? teamColor(a) : '';
  // avatar: a carinha de quem joga agora, num círculo da cor do jogador
  if (game.phase === 'ended') dotEl.replaceChildren();
  else {
    // a mesma <img> é reaproveitada: recriar a cada jogada fazia o avatar piscar
    let face = dotEl.querySelector('img');
    if (!face) dotEl.replaceChildren((face = Object.assign(document.createElement('img'), { alt: '' })));
    const url = teamIcons(a)[0];
    if (face.getAttribute('src') !== url) face.src = url;
  }
  const tt = $('turnText');
  tt.replaceChildren(document.createTextNode(game.phase === 'ended' ? t('Match over', 'Fim da partida') : t(`${pname(a)}'s turn `, `Vez de ${pname(a)} `)));
  if (game.phase !== 'ended' && isBotSeat(a)) tt.appendChild(icon(Bot, 15));
  $('turnBadge').textContent = game.phase === 'action' ? t(`${game.actionsLeft} ${game.actionsLeft === 1 ? 'action' : 'actions'}`, `${game.actionsLeft} ${game.actionsLeft === 1 ? 'ação' : 'ações'}`) : '';
  document.querySelectorAll<HTMLElement>('#phases .ph').forEach((el) => el.classList.toggle('on', el.dataset.ph === game.phase));

  // placar
  const sc = $('score');
  sc.replaceChildren();
  for (let p = 0; p < game.playerCount; p++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = teamColor(p);
    const who = document.createElement('div');
    who.className = 'who' + (game.phase !== 'ended' && a === p ? ' turn' : '');
    who.textContent = pname(p);
    const small = document.createElement('small');
    game.builders.filter((b) => b.owner === p).forEach((b) => {
      const pip = document.createElement('span');
      pip.className = 'pip' + (b.status === 'aboard' ? ' aboard' : b.status === 'boat' ? ' boat' : b.status === 'floating' ? ' float' : b.status === 'dead' ? ' dead' : '');
      pip.style.background = teamColor(p);
      pip.title = b.status === 'aboard' ? t('on the ship', 'no navio') : b.status === 'boat' ? t('in a boat', 'no bote') : b.status === 'board' ? t('on land', 'em terra') : b.status === 'floating' ? t('adrift', 'boiando') : b.status === 'dead' ? t('out of the game', 'fora do jogo') : '';
      small.appendChild(pip);
    });
    who.appendChild(small);
    const res = document.createElement('div');
    res.className = 'res';
    const g1 = document.createElement('span');
    g1.title = t('Crystals', 'Cristais');
    g1.append(icon(Gem, 14), `${game.crystals[p]}`);
    const g2 = document.createElement('span');
    g2.title = t('Tridents', 'Tridentes');
    g2.className = 'tri';
    g2.append(icon(Trident, 14), String(game.tridents[p]));
    res.append(g1, g2);
    const pts = document.createElement('span');
    const pnow = pointsNow(game, p);
    const half = game.settings.ending === 'escape' && !game.builders.some((b) => b.owner === p && b.status === 'aboard') && basePoints(game, p) > 0;
    pts.className = 'pts' + (half ? ' half' : '');
    pts.title = t('Points', 'Pontos');
    pts.textContent = String(pnow);
    if (half) {
      const sm = document.createElement('small');
      sm.textContent = '½';
      pts.appendChild(sm);
    }
    if (game.princess?.by === p) dot.classList.add('q');
    sc.append(dot, who, res, pts);
    for (const el of [dot, who, res, pts]) el.onclick = (ev) => (ev.stopPropagation(), showScorePop(p));
  }

  if (popKey?.startsWith('s:')) closePop(); // o "Usar" da convocação depende do estado: fecha quando algo muda
  // convocações
  const sm = $('summons');
  sm.replaceChildren();
  const ic = icons();
  const cost = { triton: game.settings.tritonCost, lasso: game.settings.lassoCost, siren: game.settings.sirenCost, colossus: game.settings.colossusCost };
  (Object.keys(SUMMONS) as SummonKind[]).forEach((k) => {
    const ok = isHumanTurn() && legal.some((x) => x.type === 'summon' && x.kind === k);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot' + (mode === `summon:${k}` ? ' on' : '') + (ok ? '' : ' off');
    b.setAttribute('aria-haspopup', 'dialog');
    const img = document.createElement('img');
    img.src = ic[k as IconName];
    img.alt = SUMMONS[k].name;
    const c = document.createElement('span');
    c.className = 'cost';
    c.append(icon(Gem, 11), String(cost[k]));
    b.append(img, c);
    b.onclick = () =>
      openPop(`s:${k}`, b, (box) => {
        popHead(box, SUMMONS[k].name, ic[k as IconName]);
        popText(box, SUMMONS[k].tip);
        popText(box, t(`<b>Cost:</b> ${cost[k]} ${cost[k] > 1 ? 'crystals' : 'crystal'}. Only 1 summon per turn, in the Action phase, without spending an action.`, `<b>Custo:</b> ${cost[k]} ${cost[k] > 1 ? 'cristais' : 'cristal'}. Só 1 convocação por turno, na fase de Ação, sem gastar ação.`));
        const me = viewer();
        const why = !isHumanTurn() ? t('Wait for your turn.', 'Espere a sua vez.') : game.phase !== 'action' ? t('Only in the Action phase.', 'Só na fase de Ação.') : game.summonUsed ? t('You already used this turn\'s summon.', 'Você já usou a convocação deste turno.') : game.crystals[me] < cost[k] ? t(`Not enough crystals (you have ${game.crystals[me]}).`, `Faltam cristais (você tem ${game.crystals[me]}).`) : !ok ? t('No move possible right now.', 'Sem jogada possível agora.') : '';
        const st = document.createElement('p');
        st.className = 'pop-state' + (why ? '' : ' ok');
        st.textContent = why || t('You can use it now.', 'Pode usar agora.');
        box.appendChild(st);
        if (!why) {
          box.appendChild(btn(mode === `summon:${k}` ? t('Cancel', 'Cancelar') : t('Use', 'Usar'), () => {
            mode = mode === `summon:${k}` ? 'move' : `summon:${k}`;
            closePop();
            closeChooser();
            refresh();
          }, { primary: true }));
        }
      });
    sm.appendChild(b);
  });

  // dado
  const dc = $('dice');
  dc.replaceChildren();
  // sem a Sentinela (partida curta), a face dela vira Polvo: o Polvo aparece em 3 das 6 faces
  const faceCount = (f: string) => FACE_INFO[f].faces;
  (['octopus', 'leviathan', 'guardian', 'surge'] as const).forEach((f) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.setAttribute('aria-haspopup', 'dialog');
    d.className = 'face' + (!rolling && (game.die ?? lastDie) === f ? ' on' : '');
    d.onclick = () =>
      openPop(`d:${f}`, d, (box) => {
        popHead(box, CREATURE_PT[f], ic[f]);
        popText(box, FACE_INFO[f].text);
        popText(box, t(`Appears on <b>${faceCount(f)} of 6</b> die faces.`, `Aparece em <b>${faceCount(f)} de 6</b> faces do dado.`));
        if ((game.die ?? lastDie) === f) popText(box, game.die === f ? t('<b>Just rolled.</b>', '<b>Saiu agora.</b>') : t('<b>Was the last to come out.</b>', '<b>Foi a última a sair.</b>'));
      });
    const img = document.createElement('img');
    img.src = ic[f];
    img.alt = CREATURE_PT[f];
    d.appendChild(img);
    if (f === 'octopus' || f === 'leviathan') {
      const s = document.createElement('small');
      s.textContent = `×${faceCount(f)}`;
      d.appendChild(s);
    }
    dc.appendChild(d);
  });
  $('diecap').textContent = rolling ? t('Rolling…', 'Rolando…') : game.die ? CREATURE_PT[game.die] : lastDie ? t(`Last: ${CREATURE_PT[lastDie]}`, `Último: ${CREATURE_PT[lastDie]}`) : t('Picks the creature', 'Sorteia a criatura');

  renderBar();
};

const renderBar = () => {
  const msg = $('msg');
  const ctl = $('controls');
  ctl.replaceChildren();
  msg.innerHTML = '';
  $('bar').classList.toggle('idle', game.phase !== 'ended' && !isHumanTurn()); // vez do bot: aviso discreto
  if (game.phase === 'ended') return;
  const a = actor(game);
  // terremoto sorteou a casa de um pirata de quem tem tridente: o tridente é usado sozinho, sem perguntar
  if (game.phase === 'flood' && game.pendingFlood && isHumanTurn() && game.tridents[a] > 0) {
    window.setTimeout(() => game.phase === 'flood' && game.pendingFlood && game.tridents[a] > 0 && apply({ type: 'useTrident', player: a }), 450);
    msg.innerHTML = t('<b>Tide:</b> the trident saves your tile!', '<b>Maré:</b> o tridente salva a sua casa!');
    return;
  }
  if (!isHumanTurn()) {
    msg.innerHTML = t(`<b>${pname(a)}</b> is playing…`, `<b>${pname(a)}</b> está jogando…`);
    return;
  }
  if (game.phase === 'action') {
    const has = (t: string) => legal.some((x) => x.type === t && 'builderId' in x && x.builderId === selBuilder);
    const bits: string[] = [];
    if (has('move') || has('swim')) bits.push(t('<span class="key y"></span> walk', '<span class="key y"></span> andar'));
    if (has('launch') || has('row')) bits.push(t('<span class="key y"></span> boat to the ship', '<span class="key y"></span> bote até o navio'));
    if (has('push')) bits.push(t('<span class="key r"></span> push', '<span class="key r"></span> empurrar'));
    msg.innerHTML = portalPick
      ? t('<b>Portal:</b> tap one of the highlighted Portals to arrive there (tapping elsewhere cancels).', '<b>Portal:</b> toque num dos Portais destacados para chegar nele (tocar fora cancela).')
      : mode.startsWith('summon:')
      ? t(`<b>${SUMMONS[mode.slice(7) as SummonKind].name}:</b> tap a yellow tile.`, `<b>${SUMMONS[mode.slice(7) as SummonKind].name}:</b> toque numa casa amarela.`)
      : t(`<span class="badge">${game.actionsLeft} ${game.actionsLeft === 1 ? 'action' : 'actions'} left</span> Tap your pirate, then a colored tile${bits.length ? ': ' + bits.join(' · ') : ''}.${game.wave !== null && game.wave !== undefined ? ' <b>Wave ahead:</b> leave the foamy tiles (or climb to the 2nd floor).' : ''}`, `<span class="badge">Restam ${game.actionsLeft} ${game.actionsLeft === 1 ? 'ação' : 'ações'}</span> Toque no seu pirata e depois numa casa colorida${bits.length ? ': ' + bits.join(' · ') : ''}.${game.wave !== null && game.wave !== undefined ? ' <b>Onda à vista:</b> saia das casas com espuma (ou suba ao 2º andar).' : ''}`);
    ctl.append(row(btn(t('End actions', 'Terminar ações'), () => apply({ type: 'endActions', player: a }), { icon: ArrowRight, primary: game.actionsLeft === 0 || !legal.some((x) => x.type !== 'endActions' && x.type !== 'summon') })));  // só pisca quando não resta o que fazer
  } else if (game.phase === 'flood') {
    if (game.pendingFlood) {
      msg.innerHTML = t(`<b>Tide:</b> a trident can stop the tile under your pirate from sinking. You have ${game.tridents[a]}.`, `<b>Maré:</b> um tridente pode impedir que a casa do seu pirata afunde. Você tem ${game.tridents[a]}.`);
      ctl.append(row(btn(t('Use trident', 'Usar tridente'), () => apply({ type: 'useTrident', player: a }), { icon: Trident, primary: true }), btn(t('Let it sink', 'Deixar afundar'), () => apply({ type: 'passTrident', player: a }))));
    } else msg.innerHTML = t('<b>Quake:</b> the table is picking the tiles that sink.', '<b>Terremoto:</b> a mesa está sorteando as casas que afundam.');
  } else if (game.phase === 'creatures') {
    if (!game.die) {
      msg.innerHTML = t('<b>Creatures:</b> roll the die to see which one moves.', '<b>Criaturas:</b> role o dado para ver qual delas se mexe.');
      ctl.append(row(btn(t('Roll the die', 'Rolar o dado'), () => apply({ type: 'rollDie', player: a }), { icon: Dices, primary: true })));
    } else if (rolling) msg.innerHTML = t('<b>Rolling the die…</b>', '<b>Rolando o dado…</b>');
    else msg.innerHTML = t(`<b>${CREATURE_PT[game.die]}:</b> tap one of the highlighted tiles.`, `<b>${CREATURE_PT[game.die]}:</b> toque numa das casas em destaque.`);
  }
};

const refresh = () => {
  // reta final: quem fugiu primeiro, Atlântida quase toda emersa (ou o Castelo tomado) troca a cantiga pela música de clímax
  const danger = inGame && game.phase !== 'ended' && !game.vanished && leavingTime(game);
  setClimax(danger);
  document.body.classList.toggle('alarm', danger);
  if (!inGame) return;
  legal = legalActions(game);
  ensureSelection();
  renderHud();
  drawScene();
  if (!$('logpanel').hidden) renderLog();
  if (game.phase === 'ended') {
    // ilha sumindo: espera a animação (cerca de 3,5 s) antes de mostrar o vencedor
    if (game.vanished && !endTimer) endTimer = window.setTimeout(() => ((endTimer = 0), inGame && game.phase === 'ended' && showEnd()), FINALE_MS);
    else if (!game.vanished) showEnd();
  }
};

const renderLog = () => {
  const lp = $('logpanel');
  lp.replaceChildren(...logLines.slice(-40).map((l) => Object.assign(document.createElement('div'), { textContent: l })));
  lp.scrollTop = lp.scrollHeight;
};

/* ---------- palco 3D ---------- */

const stage = new Stage3D($('view'), (h, x, y) => onCell(h, x, y));
stage.nereusLine = t('MY PRINCESS!!', 'MINHA PRINCESA!!');
stage.overboardLine = t('MAN OVERBOARD!', 'HOMEM AO MAR!');
stage.sfx = (name) => play(name as SoundName);
// sem jogada há um tempo: todo mundo cochila (Z subindo) até alguém tocar na tela de novo
let lastAct = Date.now();
const wake = () => {
  lastAct = Date.now();
  stage.setSleeping(false);
};
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, wake, { passive: true });
setInterval(() => {
  if (inGame && game.phase !== 'ended' && !game.vanished && Date.now() - lastAct > 25000) stage.setSleeping(true);
}, 1000);
const drawScene = () => {
  const hl = new Map<string, Highlight>();
  const kindOf = (a: Action): Highlight => (game.phase === 'flood' ? 'flood' : a.type === 'push' ? 'push' : a.type === 'move' && !a.portalTo && treasureAt(a.to) ? 'treasure' : 'move');
  const seen = new Map<string, Set<Highlight>>();
  candidates().forEach((a) => {
    const c = cellOf(a);
    if (!c) return;
    const s = seen.get(hexKey(c)) ?? new Set<Highlight>();
    s.add(kindOf(a));
    seen.set(hexKey(c), s);
  });
  seen.forEach((s, k) => {
    // casa que aceita andar: amarela
    hl.set(k, s.has('treasure') ? 'treasure' : s.has('move') ? 'move' : s.has('push') ? 'push' : 'flood');
  });
  if (game.pendingFlood) hl.set(hexKey(game.pendingFlood.hex), 'flood'); // casa sorteada esperando o tridente
  // fase final: as casas que a próxima onda vai varrer ficam com espuma (por baixo das jogadas possíveis)
  if (game.wave !== null && game.wave !== undefined && inGame && !game.vanished && game.phase !== 'ended') for (const h of waveCells(game, game.wave)) if (!hl.has(hexKey(h))) hl.set(hexKey(h), 'wave');
  stage.update({ state: game, highlights: hl, selectedBuilder: isHumanTurn() && game.phase === 'action' ? selBuilder : null });
};

const tools = $('tools');
// canto superior esquerdo: menu, tela cheia, como jogar (com o objetivo) e gestos do tabuleiro
// tela cheia: padrão, com o prefixo do Safari (iPad); no iPhone o Safari não deixa a página ocupar a tela,
// então o botão explica como abrir o jogo pela Tela de Início (lá ele abre sem as barras do navegador)
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fsDoc = document as FsDoc;
const fsEl = (): Element | null => document.fullscreenElement ?? fsDoc.webkitFullscreenElement ?? null;
const fsApi = !!(document.fullscreenEnabled || fsDoc.webkitFullscreenEnabled);
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const showHomeScreenTip = () => {
  const c = document.createElement('div');
  c.className = 'card';
  c.innerHTML =
    t('<h3>Full screen on your phone</h3><p>iPhone Safari does not let sites fill the whole screen. To play without the browser bars:</p>', '<h3>Tela cheia no celular</h3><p>O Safari do iPhone não deixa sites ocuparem a tela toda. Para jogar sem as barras do navegador:</p>') +
    t('<ol><li>Tap <b>Share</b> (the square with an up arrow).</li><li>Choose <b>Add to Home Screen</b>.</li><li>Open the game from the new icon: it opens full screen.</li></ol>', '<ol><li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li><li>Escolha <b>Adicionar à Tela de Início</b>.</li><li>Abra o jogo pelo ícone novo: ele abre em tela cheia.</li></ol>');
  c.appendChild(row(btn(t('Got it', 'Entendi'), closeModal, { primary: true })));
  modal(c);
};
const toggleFullscreen = () => {
  if (!fsApi) return showHomeScreenTip();
  if (fsEl()) (document.exitFullscreen ? document.exitFullscreen() : fsDoc.webkitExitFullscreen?.());
  else {
    const el = document.documentElement as FsEl;
    if (el.requestFullscreen) void el.requestFullscreen();
    else el.webkitRequestFullscreen?.();
  }
};
const fsBtn = btn('', toggleFullscreen, { icon: Maximize, title: t('Full screen', 'Tela cheia') });
const syncFs = () => {
  const on = !!fsEl();
  fsBtn.replaceChildren(icon(on ? Minimize : Maximize, 17));
  fsBtn.title = on ? t('Exit full screen', 'Sair da tela cheia') : t('Full screen', 'Tela cheia');
  fsBtn.setAttribute('aria-label', fsBtn.title);
};
document.addEventListener('fullscreenchange', syncFs);
document.addEventListener('webkitfullscreenchange', syncFs);
// câmera: escondida no menu da esquerda; o botão "Câmera" abre e fecha os controles de girar e centralizar
const camera = $('camera');
const camBtn = btn('', () => {
  camera.hidden = !camera.hidden;
  camBtn.classList.toggle('on', !camera.hidden);
}, { icon: Video, title: t('Camera: rotate and recenter', 'Câmera: girar e centralizar') });
const soundBtn = btn('', () => {
  setMuted(!isMuted());
  syncSound();
  if (!isMuted()) play('turn');
}, { icon: isMuted() ? VolumeX : Volume2, title: t('Sound', 'Som') });
const syncSound = () => {
  soundBtn.replaceChildren(icon(isMuted() ? VolumeX : Volume2, 17));
  soundBtn.title = isMuted() ? t('Turn sound on', 'Ligar o som') : t('Turn sound off', 'Desligar o som');
  soundBtn.setAttribute('aria-label', soundBtn.title);
};
syncSound();
// música de fundo: liga e desliga à parte (o botão de som desliga tudo)
const musicBtn = btn('', () => {
  setMusicOn(!isMusicOn());
  syncMusic();
}, { icon: Music, title: '' });
musicBtn.style.position = 'relative';
/** Nota musical; desligada, ganha uma barra por cima (como o ícone de vibração). */
const syncMusic = () => {
  musicBtn.replaceChildren(icon(Music, 17));
  if (!isMusicOn()) {
    const slash = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    slash.setAttribute('viewBox', '0 0 24 24');
    slash.setAttribute('width', '22');
    slash.setAttribute('height', '22');
    slash.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none';
    slash.innerHTML = '<line x1="4" y1="4" x2="20" y2="20" stroke="#10243a" stroke-width="4.6" stroke-linecap="round"/><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>';
    musicBtn.appendChild(slash);
  }
  musicBtn.classList.toggle('on', isMusicOn());
  musicBtn.title = isMusicOn() ? t('Turn music off', 'Desligar a música') : t('Turn music on', 'Ligar a música');
  musicBtn.setAttribute('aria-label', musicBtn.title);
};
syncMusic();
// vibração: liga e desliga à parte (onde o aparelho deixa vibrar)
const vibBtn = btn('', () => {
  setVibeOn(!isVibeOn());
  syncVibe();
}, { icon: Vibrate, title: '' });
const syncVibe = () => {
  vibBtn.replaceChildren(icon(isVibeOn() ? Vibrate : VibrateOff, 17));
  vibBtn.classList.toggle('on', isVibeOn());
  vibBtn.title = isVibeOn() ? t('Turn vibration off', 'Desligar a vibração') : t('Turn vibration on', 'Ligar a vibração');
  vibBtn.setAttribute('aria-label', vibBtn.title);
};
syncVibe();
unlockAudio();
// menu, som e tela cheia sempre à vista; uma aba com seta logo abaixo abre e recolhe o resto
const mobileOnly = (b: HTMLButtonElement) => (b.classList.add('mobile-only'), b);
const toolsList = document.createElement('div');
toolsList.className = 'tools-list';
toolsList.id = 'hud-tools';
toolsList.append(
  musicBtn,
  vibBtn,
  mobileOnly(btn('', () => showRules(), { icon: BookOpen, title: t('How to play and goal', 'Como jogar e objetivo') })),
  mobileOnly(btn('', () => showGestures(), { icon: Pointer, title: t('How to move the board (gestures)', 'Como mexer no tabuleiro (gestos)') })),
  btn('', () => stage.rotateBy(Math.PI / 8), { icon: RotateCcw, title: t('Rotate left', 'Girar para a esquerda') }),
  btn('', () => stage.rotateBy(-Math.PI / 8), { icon: RotateCw, title: t('Rotate right', 'Girar para a direita') }),
  mobileOnly(camBtn),
  camera,
);
// o botão de menu da barra inferior abre e fecha esta lista (acima da barra); tocar fora fecha
const menuBtn = $('menuBtn') as HTMLButtonElement;
const setMenuOpen = (open: boolean) => {
  tools.hidden = !open;
  menuBtn.classList.toggle('on', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.replaceChildren(icon(open ? X : Menu, 20));
  menuBtn.title = open ? t('Close the menu', 'Fechar o menu') : t('Menu', 'Menu');
  menuBtn.setAttribute('aria-label', menuBtn.title);
};
// desktop: os ícones ficam abertos na barra do topo e o ☰ abre uma lista com as ações que no celular ficam numa janela
const desktopMq = matchMedia('(min-width: 761px)');
const menuDrop = $('menudrop');
const setDropOpen = (open: boolean) => {
  menuDrop.hidden = !open;
  menuBtn.classList.toggle('on', open);
  menuBtn.setAttribute('aria-expanded', String(open));
};
menuDrop.append(
  btn(t('How to play', 'Como jogar'), () => (setDropOpen(false), showRules()), { icon: BookOpen }),
  btn(t('How to move the board', 'Como mexer no tabuleiro'), () => (setDropOpen(false), showGestures()), { icon: Pointer }),
  btn(t('What happened', 'O que aconteceu'), () => (setDropOpen(false), toggleLog()), { icon: ScrollText }),
  btn(t('Back to start', 'Voltar ao início'), () => (setDropOpen(false), leaveGame()), { icon: Menu }),
);
menuBtn.onclick = () => (desktopMq.matches ? setDropOpen(!!menuDrop.hidden) : setMenuOpen(!!tools.hidden));
document.addEventListener('pointerdown', (ev) => {
  const el = ev.target as Node;
  if (!tools.hidden && !tools.contains(el) && !menuBtn.contains(el)) setMenuOpen(false);
  if (!menuDrop.hidden && !menuDrop.contains(el) && !menuBtn.contains(el)) setDropOpen(false);
});
tools.append(
  mobileOnly(btn('', () => (setMenuOpen(false), showPause()), { icon: Menu, title: t('Game menu', 'Menu do jogo') })),
  soundBtn,
  ...(standalone ? [] : [fsBtn]), // aberto pela Tela de Início já está em tela cheia
  toolsList,
);
setMenuOpen(false);
const toolHome = tools.parentElement!; // no celular a lista mora aqui (abre abaixo da barra); no desktop vai para a barra do topo
const placeTools = () => {
  setDropOpen(false);
  if (desktopMq.matches) {
    $('toolcell').appendChild(tools);
    tools.hidden = false;
    camera.hidden = false; // zoom e centralizar ficam à vista
    menuBtn.replaceChildren(icon(Menu, 20));
    menuBtn.title = t('Menu', 'Menu');
    menuBtn.classList.remove('on');
  } else {
    toolHome.appendChild(tools);
    camera.hidden = true;
    setMenuOpen(false);
  }
};
desktopMq.addEventListener('change', placeTools);
placeTools();
// as barras avisam a altura delas: o aviso azul fica acima da de baixo; o menu e o placar abrem abaixo da de cima
const dock = $('dock');
const topbar = $('topbar');
const syncDock = () => {
  const st = document.getElementById('app')!.style;
  st.setProperty('--dock-h', dock.offsetHeight + 'px');
  st.setProperty('--top-h', topbar.offsetHeight + 'px');
  stage.setInsets(topbar.offsetHeight, dock.offsetHeight);
};
new ResizeObserver(syncDock).observe(dock);
new ResizeObserver(syncDock).observe(topbar);
syncDock();
const zoomBtn = (b: HTMLButtonElement) => (b.classList.add('zoomonly'), b);
camera.append(
  zoomBtn(btn('', () => stage.zoomBy(1.25), { icon: Plus, title: t('Zoom in', 'Aproximar') })),
  zoomBtn(btn('', () => stage.zoomBy(0.8), { icon: Minus, title: t('Zoom out', 'Afastar') })),
  btn('', () => stage.resetView(), { icon: Crosshair, title: t('Recenter and reset the view', 'Centralizar e voltar à visão inicial') }),
);
const toggleLog = () => {
  const lp = $('logpanel');
  lp.hidden = !lp.hidden;
  if (!lp.hidden) renderLog();
};

/* ---------- janelas ---------- */

const modal = (content: HTMLElement) => {
  const m = $('modal');
  m.replaceChildren(content);
  m.hidden = false;
};
let stopConfetti: (() => void) | null = null;
const closeModal = () => {
  $('modal').hidden = true;
  stopConfetti?.();
};

/** Confete colorido caindo pela tela toda (só para quem ganhou). */
const confetti = () => {
  stopConfetti?.();
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60';
  document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  const g = cv.getContext('2d')!;
  const colors = ['#ffd23f', '#ff5fae', '#3fc6c0', '#7be26a', '#ff7a3d', '#8ab4ff', '#ffffff'];
  const bits = Array.from({ length: 160 }, () => ({
    x: Math.random() * cv.width,
    y: -Math.random() * cv.height,
    w: (6 + Math.random() * 8) * dpr,
    h: (4 + Math.random() * 6) * dpr,
    vy: (2 + Math.random() * 3.5) * dpr,
    vx: (Math.random() - 0.5) * 2 * dpr,
    a: Math.random() * 6,
    va: (Math.random() - 0.5) * 0.35,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let raf = 0;
  const born = performance.now();
  const loop = () => {
    g.clearRect(0, 0, cv.width, cv.height);
    for (const b of bits) {
      b.y += b.vy;
      b.x += b.vx + Math.sin(b.a) * 0.6 * dpr;
      b.a += b.va;
      if (b.y > cv.height + 20 && performance.now() - born < 9000) b.y = -20 * dpr; // continua chovendo por uns segundos
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.a);
      g.fillStyle = b.c;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    raf = requestAnimationFrame(loop);
    if (performance.now() - born > 13000) stopConfetti?.();
  };
  loop();
  stopConfetti = () => {
    cancelAnimationFrame(raf);
    cv.remove();
    stopConfetti = null;
  };
};

/** Cabeça de Nereu, deus do mar, furioso (quando ninguém vence): blocos como o resto do jogo. */
const NEREUS_ANGRY = `<svg viewBox="0 0 120 130" width="150" height="162" aria-hidden="true">
  <rect x="26" y="8" width="68" height="12" fill="#f3c846"/><rect x="30" y="0" width="10" height="10" fill="#f3c846"/><rect x="50" y="-2" width="10" height="12" fill="#f3c846"/><rect x="70" y="0" width="10" height="10" fill="#f3c846"/><rect x="88" y="2" width="6" height="8" fill="#f3c846"/>
  <rect x="20" y="20" width="80" height="22" fill="#f1f7fa"/><rect x="14" y="30" width="16" height="60" fill="#f1f7fa"/><rect x="90" y="30" width="16" height="60" fill="#f1f7fa"/>
  <rect x="30" y="36" width="60" height="50" fill="#5db7c9"/>
  <polygon points="34,44 56,54 56,60 34,52" fill="#f1f7fa"/><polygon points="86,44 64,54 64,60 86,52" fill="#f1f7fa"/>
  <rect x="38" y="56" width="16" height="10" fill="#fff"/><rect x="66" y="56" width="16" height="10" fill="#fff"/>
  <rect x="44" y="58" width="8" height="8" fill="#ff2a2a"/><rect x="68" y="58" width="8" height="8" fill="#ff2a2a"/>
  <rect x="55" y="62" width="10" height="14" fill="#3f98ad"/>
  <rect x="36" y="76" width="48" height="8" fill="#f1f7fa"/>
  <rect x="44" y="86" width="32" height="18" fill="#3a0a14"/><rect x="48" y="86" width="6" height="6" fill="#fff"/><rect x="66" y="86" width="6" height="6" fill="#fff"/>
  <rect x="26" y="84" width="68" height="14" fill="#f1f7fa"/><rect x="34" y="98" width="52" height="14" fill="#f1f7fa"/><rect x="44" y="112" width="32" height="12" fill="#f1f7fa"/>
</svg>`;

/** Painel final: cabeça do capitão que venceu piscando (ou Nereu furioso se ninguém venceu), pontos de cada time e, para o vencedor, confete. */
const fmtTime = (ms: number): string => {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/** Rosto do pirata do time, num círculo com o contorno na cor do time (só a cabeça e um pouco do peito). */
const faceAvatar = (p: number, size: number): HTMLElement => {
  const d = document.createElement('div');
  d.className = 'endav';
  d.style.setProperty('--team', teamColor(p));
  d.style.width = d.style.height = size + 'px';
  const img = document.createElement('img');
  img.src = teamIcons(p)[0];
  img.alt = '';
  d.appendChild(img);
  return d;
};

const showEnd = () => {
  if (!$('modal').hidden && $('modal').querySelector('.winner')) return;
  const w = game.winners ?? [];
  const iWon = w.length > 0 && w.some((p) => mine(p));
  const c = document.createElement('div');
  c.className = 'card winner ' + (w.length ? (iWon ? 'won' : 'lost') : 'nobody');
  const total = (p: number) => (game.vanished ? finalScore(game, p) : basePoints(game, p));
  const ptsText = (p: number) => `${total(p)} ${t(total(p) === 1 ? 'point' : 'points', total(p) === 1 ? 'ponto' : 'pontos')}`;
  const nameOf = (p: number) => pname(p); // o nome já traz o (você) e o (BOT)
  const kicker = document.createElement('div');
  kicker.className = 'endk';
  kicker.textContent = !w.length || iWon ? t('GAME OVER', 'FIM DE JOGO') : t('YOU LOST', 'VOCÊ PERDEU');
  c.appendChild(kicker);
  if (w.length) {
    // no lugar da taça: o avatar de quem venceu (se foi o bot, é o avatar do bot)
    c.appendChild(faceAvatar(w[0], 112));
    const pill = document.createElement('div');
    pill.className = 'endname';
    pill.style.setProperty('--team', teamColor(w[0]));
    pill.innerHTML = `<span class="dot" style="background:${teamColor(w[0])}"></span><b>${nameOf(w[0])}</b><em>${ptsText(w[0])}</em>`;
    c.appendChild(pill);
    const sub = document.createElement('p');
    sub.className = 'endsub';
    sub.textContent = t('won the island!', 'venceu a ilha!');
    c.appendChild(sub);
  } else {
    const rage = document.createElement('div');
    rage.className = 'endhead nereus';
    rage.innerHTML = NEREUS_ANGRY;
    c.appendChild(rage);
    const sub = document.createElement('p');
    sub.className = 'endsub';
    sub.textContent = t('Nereus is furious! Nobody won this time.', 'Nereu está furioso! Ninguém venceu desta vez.');
    c.appendChild(sub);
  }
  if (matchStartAt) {
    const tm = document.createElement('p');
    tm.className = 'endtime';
    tm.innerHTML = `${t('Match time', 'Tempo de partida')} <b>${fmtTime(Date.now() - matchStartAt)}</b>`;
    c.appendChild(tm);
  }
  // os outros times: cristais, tridentes e princesa em bolinhas, e o total
  const others = Array.from({ length: game.playerCount }, (_, p) => p).filter((p) => !w.includes(p)).sort((a, b) => total(b) - total(a));
  if (others.length) {
    const hr = document.createElement('hr');
    hr.className = 'enddiv';
    c.appendChild(hr);
    const list = document.createElement('ul');
    list.className = 'endlist';
    for (const p of others) {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.className = 'who';
      who.innerHTML = `<span class="dot" style="background:${teamColor(p)}"></span>${nameOf(p)}`;
      const chips = document.createElement('span');
      chips.className = 'chips';
      const chip = (ic: IconNode, n: string, title: string) => {
        const el = document.createElement('span');
        el.className = 'chip';
        el.title = title;
        el.append(icon(ic, 11), document.createTextNode(n));
        chips.appendChild(el);
      };
      chip(Gem, String(game.crystals[p]), t('Crystals', 'Cristais'));
      chip(Trident, String(game.tridents[p]), t('Tridents', 'Tridentes'));
      if (game.princess?.by === p && game.princess.safe) chip(Crown, `+${PRINCESS_BONUS}`, t('Princess on the ship', 'Princesa no navio'));
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = ptsText(p);
      li.append(who, chips, pts);
      list.appendChild(li);
    }
    c.appendChild(list);
  }
  const again = session.kind === 'bots' || session.kind === 'hot';
  c.appendChild(
    row(
      btn(t('See the board', 'Ver tabuleiro'), closeModal),
      again
        ? btn(t('Play again', 'Jogar de novo'), () => (closeModal(), startLocal(session.kind as 'bots' | 'hot')), { icon: RotateCw, primary: true })
        : btn(t('Back to start', 'Voltar ao início'), () => (closeModal(), leaveGame()), { primary: true }),
    ),
  );
  modal(c);
  if (iWon) confetti();
};

// tocar fora do cartão (no fundo escuro) ou apertar Esc fecha a janela; a de fim de partida fica até escolher um botão
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal') && !$('modal').querySelector('.winner')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('modal').hidden && !$('modal').querySelector('.winner')) closeModal();
});

const rulesHtml = () => t(`
<h3>How to play</h3>
<h4>Goal</h4>
<p>An island sinks while the ancient city of Atlantis rises from below. Gather as much treasure as you can and escape on your ship.</p>
<ul>
<li><b>Castle:</b> at the top (3rd floor) of the Castle of Atlantis, in the center, waits the Princess. There is only one. Rescue her and get on your ship with her to earn a +4 bonus (it does not win by itself: whoever has the most points still wins). Nobody builds it: after ${cfg().templeWake} tiles have sunk (about ${Math.max(1, Math.ceil(cfg().templeWake / cfg().floodsPerRound))} ${Math.ceil(cfg().templeWake / cfg().floodsPerRound) <= 1 ? "round" : "rounds"}) the Castle rises from the sea by itself, with two towers and stairs, and any pirate can climb up to her. Longer matches take more time, but the rule is the same.</li>
${escapeRules()
  ? `<li><b>Escape:</b> each team has a ship anchored at sea. From any beach, a pirate gets into a boat (1 action) and rows up to 2 tiles per action to the ship. The boat holds the team's 2 pirates. When <b>the first pirate</b> of any team boards a ship, the island is about to vanish: each of the other teams plays one more turn, then the island sinks into the sea. Anyone left on land is adrift and keeps only half of their crystals. If nobody escapes by round ${cfg().vanishRound}, the island vanishes anyway and Nereus, king of the seas and of Atlantis, keeps the treasure: nobody wins.</li>`
  : `<li><b>Escape:</b> each team has a ship anchored at sea. From any beach, a pirate gets into a boat (1 action) and rows up to 2 tiles per action to the ship. The boat holds the team's 2 pirates: the second one gets into the same boat and one stroke carries both. After the Princess is rescued, the first team with <b>all</b> its pirates on the ship ends the match. Nobody is left behind.</li>`}
<li><b>Discover:</b> away from the Castle, stepping on a closed tile reveals what is underneath. If it is treasure (crystal, trident or Calm Tide), the pirate takes it at once. No extra action: walking is enough.</li>
${escapeRules()
  ? `<li><b>Points:</b> whoever has the most wins. Points = crystals you still have + tridents you still have ×2 + 4 if the Princess is safe on your ship. Crystals and tridents are <b>resources</b>: spending them costs points. Teams with a pirate on a ship count all their points; teams left adrift count only half, rounded down (tie: whoever rescued the Princess, then whoever escaped first). The sky darkens as the island turns into Atlantis: ${cfg().floodsPerRound} tiles crumble per round.</li>
<li><b>Tide shift:</b> from round 2, every round a wave warned by foam sweeps the two outer rows on one side of the island: those tiles turn into Atlantis at once and anyone on the ground or 1st floor falls into the sea. Towers (2nd floor or higher), domes and Shields hold.</li>`
  : `<li><b>Points:</b> whoever has the most at the end wins: crystals + tridents×2 + 4 for the Princess on your ship (tie: whoever rescued the Princess, then whoever escaped on the ship). The match also ends if the whole island sinks.</li>
<li><b>Final phase:</b> after someone rescues the Princess, the quake sinks twice as many tiles and the <b>giant wave</b> begins. Each round it comes from one side of the island, warned a round before with foam on the tiles: anyone on the ground or 1st floor of those tiles falls into the sea. Those higher up or on a Shield hold on.</li>`}
<li><b>The finale:</b> when the island sinks, Nereus rises from the sea roaring for his Princess. If your team escaped with the most points, you win with confetti; if nobody escaped, Nereus is furious and nobody wins.</li>
</ul>
<h4>The game</h4>
<p>Each tile hides an Atlantis piece that only shows when it sinks.</p>
<ul>
<li><b>Your turn has 3 phases.</b> 1 Action: 3 actions to walk (and discover), push or swim. 2 Tide (quake): the table randomly picks ${cfg().floodsPerRound} tiles per round (from the edge or the middle) that crumble and reveal Atlantis. Nobody chooses. 3 Creatures: roll the die and move the creature it picks.</li>
<li><b>Move:</b> climb at most 1 floor at a time.</li>
<li><b>Nobody builds.</b> When the Castle wakes up it rises by itself with <b>two towers</b> (2 floors) and <b>stairs</b> (1 floor) beside it, and the tile in front of the gate stays free. Stairs let you climb up to 2 floors at once. Whoever stands on a tower cannot be pushed (not even by Triton), is out of reach of Nereus, the Octopus and the Leviathan, and cannot be washed away by the giant wave.</li>
<li><b>Push:</b> a neighboring pirate moves 1 tile back, if the tile behind is free and on land.</li>
<li><b>Creatures:</b> the Octopus and the Leviathan swim only in the sea (never on the island or on Atlantis). When one stops, it wraps a pirate up to 2 tiles away and throws them into the water (the Leviathan can also smash a neighboring building). Atlantis crumbles from round 3, opening holes of sea in the middle of the island where they can swim in. The die has two more faces: <b>Nereus</b> rises from the sea and drags a random pirate on land into the water (anyone on a Shield or on the 2nd floor or higher is out of reach), and <b>Surge Tide</b>: no creature moves and every pirate on an Atlantis tile gains 1 crystal.</li>
<li><b>Falling in the water is not death:</b> you sit on a buoy and can swim back. Nobody is ever eliminated: the Octopus and Leviathan throw floaters farther away and flip boats (whoever was in it ends up floating). Atlantis is fragile: from round 3 a tile crumbles every round and the sea slowly opens channels into the island.</li>
<li><b>Summons</b> (1 per turn, cost crystals): Triton pushes hard, Lasso steals the Princess, Siren steals all crystals but 2 (nothing to steal from a team with 2 or fewer), Coral Colossus places a dome.</li>
<li><b>Treasures:</b> stepping onto a closed tile or onto a sunken one (revealed by the quake) shows the piece. Crystal, Trident and Calm Tide are taken at once and the tile becomes a Ruin. The Princess on top of the Castle is worth +4 once she is aboard your ship.</li>
<li><b>Pieces:</b> tap any tile with a piece in view to see what it is and how to use it.</li>
</ul>
<h4>Resources: how to use them</h4>
<ul>
<li><b>Crystal:</b> step on the tile to take it. A resource: worth 1 point if kept, and pays for Summons (bottom panel).</li>
<li><b>Trident:</b> step on it to take it; it stays on the scoreboard (trident icon). In the quake, when the table picks the tile under your pirate, the trident is used <b>by itself</b>: the tile does not sink and you spend 1 trident.</li>
<li><b>Calm Tide:</b> step on it to take it. It applies <b>by itself</b> right away (nothing to store or press): the next quake is skipped, and everyone gets an alert.</li>
<li><b>Portal:</b> when you enter, choose to stop or go to another free Portal. It only works with 2 revealed Portals; before that it stays gray.</li>
<li><b>Shield:</b> stand on it; the sea and creatures cannot take you.</li>
<li><b>Column:</b> already has 1 floor. <b>Ruin:</b> nothing.</li>
</ul>
`, `
<h3>Como jogar</h3>
<h4>Objetivo</h4>
<p>Uma ilha afunda enquanto a cidade antiga de Atlântida emerge por baixo. Junte o máximo de tesouro e fuja no seu navio.</p>
<ul>
<li><b>Castelo:</b> no topo (3º andar) do Castelo de Atlântida, no centro, espera a Princesa. Só existe uma. Resgate-a e suba no seu navio com ela para ganhar +4 de bônus (ela não vence sozinha: quem tiver mais pontos continua ganhando). Ninguém o constrói: depois de ${cfg().templeWake} casas afundadas (cerca de ${Math.max(1, Math.ceil(cfg().templeWake / cfg().floodsPerRound))} ${Math.ceil(cfg().templeWake / cfg().floodsPerRound) <= 1 ? "rodada" : "rodadas"}) o Castelo emerge sozinho do mar, com duas torres e escadas, e qualquer pirata pode subir até ela. Partidas mais longas demoram mais, mas a regra é a mesma.</li>
${escapeRules()
  ? `<li><b>Fuga:</b> cada time tem um navio ancorado no mar. De qualquer praia, o pirata entra num bote (1 ação) e rema até 2 casas por ação até o navio. No bote cabem os 2 piratas do time. Quando <b>o primeiro pirata</b> de qualquer time sobe num navio, a ilha vai sumir: cada um dos outros times joga mais um turno, e a ilha afunda no mar. Quem ficou em terra fica boiando e só leva metade dos cristais. Se ninguém fugir até a rodada ${cfg().vanishRound}, a ilha some do mesmo jeito e Nereu, rei dos mares e de Atlântida, fica com o tesouro: ninguém vence.</li>`
  : `<li><b>Fuga:</b> cada time tem um navio ancorado no mar. De qualquer praia, o pirata entra num bote (1 ação) e rema até 2 casas por ação até o navio. No bote cabem os 2 piratas do time: o segundo entra no mesmo bote e uma remada leva os dois. Depois que a Princesa for resgatada, o primeiro time com <b>todos</b> os piratas no navio encerra a partida. Ninguém fica para trás.</li>`}
<li><b>Descobrir:</b> longe do Castelo, pisar numa casa fechada revela o que há embaixo. Se for tesouro (cristal, tridente ou Maré calma), o pirata pega na hora. Sem ação extra: andar já basta.</li>
${escapeRules()
  ? `<li><b>Pontos:</b> vence quem tiver mais. Pontos = cristais que você ainda tem + tridentes que ainda tem ×2 + 4 se a Princesa está a salvo no seu navio. Cristais e tridentes são <b>recursos</b>: gastar custa pontos. Quem fugiu no navio conta todos os pontos; quem ficou boiando conta só metade, arredondada para baixo (empate: quem salvou a Princesa, depois quem fugiu primeiro). O céu escurece conforme a ilha vira Atlântida: ${cfg().floodsPerRound} casas se desfazem por rodada.</li>
<li><b>Virada da maré:</b> a partir da rodada 2, a cada rodada uma onda avisada com espuma varre as duas fileiras de um lado da ilha: essas casas viram Atlântida na hora e quem está no chão ou no 1º andar cai no mar. Torres (2º andar ou mais), cúpulas e Escudos resistem.</li>`
  : `<li><b>Pontos:</b> no fim vence quem tiver mais: cristais + tridentes×2 + 4 pela Princesa no seu navio (empate: quem salvou a Princesa, depois quem fugiu no navio). A partida também acaba se a ilha inteira afundar.</li>
<li><b>Fase final:</b> depois que alguém resgata a Princesa, o terremoto afunda o dobro de casas e começa a <b>onda gigante</b>. A cada rodada ela vem de um lado da ilha, avisada uma rodada antes com espuma nas casas: quem estiver no chão ou no 1º andar dessas casas cai no mar. Quem está mais alto ou num Escudo aguenta.</li>`}
<li><b>O grande final:</b> quando a ilha afunda, Nereu surge do mar urrando pela sua Princesa. Se seu time fugiu com mais pontos, você vence com confete; se ninguém fugiu, Nereu fica furioso e ninguém vence.</li>
</ul>
<h4>O jogo</h4>
<p>Cada casa esconde uma peça de Atlântida que só aparece quando ela afunda.</p>
<ul>
<li><b>Sua vez tem 3 fases.</b> 1 Ação: 3 ações para andar (e pegar tesouros), empurrar ou nadar. 2 Maré (terremoto): a mesa sorteia ${cfg().floodsPerRound} casas por rodada (da borda ou do meio), que se desfazem e revelam Atlântida. Ninguém escolhe. 3 Criaturas: role o dado e mova a criatura sorteada.</li>
<li><b>Mover:</b> suba no máximo 1 andar por vez.</li>
<li><b>Ninguém constrói.</b> Quando o Castelo desperta, ele emerge sozinho com <b>duas torres</b> (2 andares) e <b>escadas</b> (1 andar) ao lado, e a casa na frente do portão fica livre. As escadas deixam subir até 2 andares de uma vez. Quem está numa torre não pode ser empurrado (nem pelo Tritão), fica fora do alcance do Nereu, do Polvo e do Leviatã, e a onda gigante não o leva.</li>
<li><b>Empurrar:</b> um pirata vizinho vai 1 casa para trás, se a casa de trás estiver livre e em terra.</li>
<li><b>Criaturas:</b> o Polvo e o Leviatã nadam só pelo mar (nunca na ilha nem em Atlântida). Ao parar, cada um enrola um pirata a até 2 casas e o joga na água (o Leviatã também pode derrubar uma construção vizinha). Atlântida desmorona a partir da rodada 3 e abre buracos de mar no meio da ilha, por onde eles podem entrar. O dado tem mais duas faces: o <b>Nereu</b> sobe do mar e arrasta para a água um pirata sorteado em terra (quem está num Escudo ou no 2º andar ou mais alto fica fora do alcance), e a <b>Maré viva</b>: nenhuma criatura se mexe e todo pirata em casa de Atlântida ganha 1 cristal.</li>
<li><b>Quem cai na água não morre:</b> fica numa boia e pode nadar de volta. Ninguém é eliminado: o Polvo e o Leviatã jogam quem já boia mais longe e viram botes (quem estava nele fica boiando). Atlântida é frágil: a partir da rodada 3, uma casa desmorona a cada rodada e o mar vai abrindo canais para dentro da ilha.</li>
<li><b>Convocações</b> (1 por turno, custam cristais): Tritão empurra forte, Laço rouba a Princesa, Sereia rouba todos os cristais menos 2 (nada a roubar de quem tem 2 ou menos), Colosso de coral põe uma cúpula.</li>
<li><b>Tesouros:</b> pisar numa casa fechada ou entrar numa afundada (revelada pelo terremoto) mostra a peça. Cristal, Tridente e Maré calma são pegos na hora e a casa vira Ruína. A Princesa do topo do Castelo vale +4 quando estiver a bordo do seu navio.</li>
<li><b>Peças:</b> toque em qualquer casa com uma peça à vista para ver o que é e como usar.</li>
</ul>
<h4>Recursos: como usar</h4>
<ul>
<li><b>Cristal:</b> pise na casa para pegar. É um recurso: vale 1 ponto se guardar, e paga as Convocações (painel de baixo).</li>
<li><b>Tridente:</b> pise para pegar; fica no placar (ícone de tridente). No terremoto, quando a casa sorteada é a do seu pirata, o tridente é usado <b>sozinho</b>: a casa não afunda e você gasta 1 tridente.</li>
<li><b>Maré calma:</b> pise para pegar. Ela vale <b>sozinha</b>, na hora (não guarda nem aperta nada): o próximo terremoto é pulado, e todos recebem um alerta.</li>
<li><b>Portal:</b> ao entrar, escolha parar ou ir para outro Portal livre. Só funciona com 2 Portais revelados; antes disso fica cinza.</li>
<li><b>Escudo:</b> fique em cima; o mar e as criaturas não te levam.</li>
<li><b>Coluna:</b> já tem 1 andar. <b>Ruína:</b> nada.</li>
</ul>
`);

const showRules = () => {
  const c = document.createElement('div');
  c.className = 'card';
  c.innerHTML = rulesHtml();
  c.appendChild(row(btn(t('Got it', 'Entendi'), closeModal, { primary: true })));
  modal(c);
};

/** Gestos do tabuleiro: dicas de girar, mover, zoom e centralizar. */
/** Quem perdeu um cristal para a Sereia entende o que houve (e como evitar). */
const explainSiren = (thief: string, victim: boolean, amount = 1) => {
  if (!victim) return;
  const c = document.createElement('div');
  c.className = 'card';
  c.innerHTML =
    t('<h3>The Siren stole your crystals!</h3>', '<h3>A Sereia roubou seus cristais!</h3>') +
    `<p>${t(
      `${thief} paid crystals to summon the Siren. Her song makes a pirate next to yours hand over <b>${amount} crystal${amount === 1 ? '' : 's'}</b> (everything above 2): you lose ${amount} point${amount === 1 ? '' : 's'} and ${thief} gains them.`,
      `${thief} pagou cristais para convocar a Sereia. O canto dela faz um pirata vizinho do seu entregar <b>${amount} cristal${amount === 1 ? '' : 'is'}</b> (tudo o que passa de 2): você perde ${amount} ponto${amount === 1 ? '' : 's'} e ${thief} ganha.`,
    )}</p><p>${t(
      'To avoid it: keep your pirates away from opponents, or spend your crystals on your own Summons before they are stolen.',
      'Para evitar: mantenha seus piratas longe dos adversários, ou gaste seus cristais em Convocações antes que sejam roubados.',
    )}</p>`;
  c.appendChild(row(btn(t('Got it', 'Entendi'), closeModal, { primary: true })));
  modal(c);
};

const showGestures = () => {
  const c = document.createElement('div');
  c.className = 'card';
  c.innerHTML = t('<h3>How to move the board</h3>', '<h3>Como mexer no tabuleiro</h3>');
  const rows = [
    ['girar', t('Rotate', 'Girar'), t('Drag one finger (or the mouse) over the board.', 'Arraste um dedo (ou o mouse) sobre o tabuleiro.')],
    ['mover', t('Move', 'Mover'), t('Slide two fingers together (on a computer: right button or Shift + drag).', 'Deslize dois dedos juntos (no computador: botão direito ou Shift + arrastar).')],
    ['aproximar', t('Zoom in', 'Aproximar'), t('Spread two fingers on the screen (on a computer: mouse wheel).', 'Separe dois dedos na tela (no computador: roda do mouse).')],
    ['afastar', t('Zoom out', 'Afastar'), t('Pinch two fingers together on the screen.', 'Junte dois dedos na tela.')],
    ['centralizar', t('Recenter', 'Centralizar'), t('Tap the crosshair button to go back to the starting view.', 'Toque no botão de mira para voltar à visão inicial.')],
  ];
  const ul = document.createElement('ul');
  ul.className = 'gest-list';
  rows.forEach(([img, t, text]) => {
    const li = document.createElement('li');
    li.innerHTML = `<img class="gest-art" src="gestos/${img}.png" alt="" width="108" height="88"><span><b>${t}</b>${text}</span>`;
    ul.appendChild(li);
  });
  c.appendChild(ul);
  c.appendChild(row(btn(t('Got it', 'Entendi'), closeModal, { primary: true })));
  modal(c);
};

const showPause = () => {
  const c = document.createElement('div');
  c.className = 'card';
  c.innerHTML = '<h3>Menu</h3>';
  const col = document.createElement('div');
  col.style.cssText = 'display:grid;gap:8px';
  col.append(
    btn(t('Resume', 'Continuar'), closeModal, { primary: true }),
    btn(t('How to play', 'Como jogar'), showRules, { icon: BookOpen }),
    btn(t('What happened', 'O que aconteceu'), () => (closeModal(), toggleLog()), { icon: ScrollText }),
    btn(t('How to move the board', 'Como mexer no tabuleiro'), showGestures, { icon: Pointer }),
    btn(t('Back to start', 'Voltar ao início'), () => (closeModal(), leaveGame()), { icon: Menu }),
  );
  c.appendChild(col);
  modal(c);
};

/* ---------- partida ---------- */

let matchStartAt = 0;
const enterGame = () => {
  inGame = true;
  $('view').classList.add('ready');
  matchStartAt = Date.now();
  $('home').hidden = true;
  $('hud').hidden = false;
  closeModal();
  closeChooser();
  mode = 'move';
  selBuilder = null;
  refresh();
  stage.setHomeMode(false);
  stage.turnTo(FRONT_AZ);
  if (session.kind === 'hot') faceActor(); // passa e joga: o tabuleiro gira para quem joga; contra bots a visão inicial é fixa
  schedule();
};

/** Famílias dos bots de uma sala online, sorteadas a partir do código da sala (igual em todos os aparelhos). */
const robotLooksFor = (code: string, seats: { kind: string }[]) => {
  let h = 2166136261;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const r = new Rng(h || 1);
  return drawRobotFamilies(seats.map((s, i) => (s.kind === 'bot' ? i : -1)).filter((i) => i >= 0), () => r.next());
};

const startLocal = (kind: 'bots' | 'hot') => {
  const players = kind === 'bots' ? opts.bots + 1 : opts.players;
  session = { kind };
  const seed = Math.floor(Math.random() * 1e9);
  rng = new Rng(seed);
  // contra o computador, cada bot é uma família de piratas robôs sorteada; neste aparelho todos são piratas
  setSeatLooks(kind === 'bots' ? drawRobotFamilies(Array.from({ length: players - 1 }, (_, i) => i + 1)) : []);
  game = autoSetup(createGame({ players, seed, settings: LENGTH_PRESETS[opts.length] }), seed);
  logLines.length = 0;
  lastDie = null;
  say(t(`New match (${LENGTH_PT[opts.length].toLowerCase()}) with ${players} players. Pirates already placed.`, `Nova partida (${LENGTH_PT[opts.length].toLowerCase()}) com ${players} jogadores. Piratas já colocados.`));
  enterGame();
};

/** Tela inicial: os piratas ficam na parte da ilha mais perto da câmera, onde dá para ver quem são. */
const demoGame = () => {
  setSeatLooks([null, null, 1]); // o 3º time da amostra é a família de robôs Cobalto
  const g = autoSetup(createGame({ players: 3, seed: 20261117 }), 7);
  // a ilha da tela inicial é só uma amostra: uma fileira a menos que a real, para ficar mais limpa
  for (const [k, c] of Object.entries(g.cells)) if (c.ring >= 4) delete g.cells[k];
  // os seis piratas bem espalhados pela ilha (um a cada 60 graus, alternando as fileiras 3 e 2)
  const angle = (h: Hex) => {
    const w = hexToWorld(h);
    return Math.atan2(w.z, w.x);
  };
  const pickAt = (ring: number, a: number) =>
    Object.values(g.cells)
      .filter((c) => c.ring === ring && !c.temple)
      .map((c) => c.hex)
      .sort((p, q) => Math.abs(Math.atan2(Math.sin(angle(p) - a), Math.cos(angle(p) - a))) - Math.abs(Math.atan2(Math.sin(angle(q) - a), Math.cos(angle(q) - a))))[0];
  g.builders.forEach((b, i) => (b.hex = pickAt(i % 2 ? 2 : 3, 0.4 + (i * Math.PI) / 3)));
  // Polvo à esquerda e Leviatã à direita, mais para o alto, na água ao lado da ilha
  g.creatures[0].hex = { q: -1, r: -3 };
  g.creatures[1].hex = { q: 2, r: 2 }; // uma casa acima (na tela) de onde estava
  // o pirata preto do canto direito de cima também sobe uma casa
  const top = g.builders[0];
  if (top.hex) top.hex = { q: top.hex.q + 1, r: top.hex.r - 1 };
  return g;
};

/**
 * Navios da tela inicial: cada um vai para a casa de água que aparece mais perto de um ponto da tela, conforme o formato
 * da tela. Deitada: um de cada lado do nome do jogo. Em pé (celular): o dos piratas no alto à esquerda e o dos robôs
 * mais embaixo à direita, sem cobrir a ilha. O 3º navio fica fora da tela.
 */
const cacheKey = () => {
  const v = $('view');
  return `r12|${getLang()}|${v.clientWidth}x${Math.round(v.clientHeight / 60)}`; // o idioma entra na chave: o texto muda a altura do painel e, com ela, onde os navios ficam
};
const placeHomeShips = () => {
  if (inGame) return;
  const v = $('view');
  const portrait = v.clientWidth / Math.max(1, v.clientHeight) < 0.9;
  // o 1º navio fica fora da tela; no celular o da esquerda fica na fileira 5 (2 casas de mar de folga até a ilha, perto como o do bot)
  // desktop: os dois navios ficam a 2 casas de mar da ilha (fileira 5), um no canto de cima à esquerda e outro embaixo à direita,
  // medidos em relação ao tamanho da ilha na tela (assim valem para qualquer formato de janela)
  const hc = stage.homeScreenOf({ q: 0, r: 0 });
  const rim = [] as { x: number; y: number }[];
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 3) rim.push(stage.homeScreenOf({ q, r }));
  const hw = (Math.max(...rim.map((v) => v.x)) - Math.min(...rim.map((v) => v.x))) / 2;
  const hh = (Math.max(...rim.map((v) => v.y)) - Math.min(...rim.map((v) => v.y))) / 2;
  const spots: { x: number; y: number; ring?: number; down?: boolean }[] = portrait
    ? [{ x: -1.5, y: 0.2 }, { x: 0.1, y: 0.1, ring: 5 }, { x: 0.82, y: 0.29 }]
    : [{ x: -1.5, y: 0.2 }, { x: hc.x - 1.28 * hw, y: hc.y - 0.7 * hh, ring: 5 }, { x: hc.x + 0.88 * hw, y: hc.y + 0.35 * hh, ring: 5, down: true }];
  const taken = new Set(game.creatures.filter((c) => c.hex).map((c) => hexKey(c.hex!)));
  const pool: Hex[] = [];
  for (let q = -30; q <= 30; q++)
    for (let r = -30; r <= 30; r++) {
      const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (d >= 5 && d <= 30) pool.push({ q, r });
    }
  const where = pool.map((h) => ({ h, s: stage.homeScreenOf(h) }));
  game.ships = spots.map((t) => {
    let best = where[0];
    let bd = Infinity;
    for (const c of where) {
      if (taken.has(hexKey(c.h))) continue;
      if (t.ring && Math.max(Math.abs(c.h.q), Math.abs(c.h.r), Math.abs(c.h.q + c.h.r)) !== t.ring) continue;
      const dd = (c.s.x - t.x) ** 2 + (c.s.y - t.y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    if (t.down) {
      // desce uma casa na tela, continuando na mesma fileira de mar (2 casas da ilha)
      const ringOf = (h: Hex) => Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r));
      const lower = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
        .map(([dq, dr]) => ({ q: best.h.q + dq, r: best.h.r + dr }))
        .filter((n) => ringOf(n) === ringOf(best.h) && !taken.has(hexKey(n)))
        .map((n) => ({ h: n, s: stage.homeScreenOf(n) }))
        .sort((p, q) => q.s.y - p.s.y)[0];
      if (lower && lower.s.y > best.s.y) best = lower;
    }
    taken.add(hexKey(best.h));
    return best.h;
  });
  stage.update({ state: game, highlights: new Map(), selectedBuilder: null });
  try {
    sessionStorage.setItem('ais-ships', JSON.stringify({ k: cacheKey(), ships: game.ships }));
  } catch {
    /* sem armazenamento: só perde o atalho */
  }
};
// só reposiciona se a largura ou o formato da tela mudaram: a barra do navegador do celular (muda só a altura) não faz os navios pularem
let shipsLayout = '';
const layoutOf = () => {
  const v = $('view');
  return `${Math.round(v.clientWidth / 24)}|${v.clientWidth / Math.max(1, v.clientHeight) < 0.9}`;
};
addEventListener('resize', () =>
  setTimeout(() => {
    if (layoutOf() === shipsLayout) return;
    shipsLayout = layoutOf();
    placeHomeShips();
  }, 60),
);

const leaveGame = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  net?.ws.close();
  net = null;
  inGame = false;
  setClimax(false);
  document.body.classList.remove('alarm');
  $('hud').hidden = true;
  $('home').hidden = false;
  closeChooser();
  stage.setHomeMode(true);
  stage.turnTo(HOME_AZ);
  game = demoGame();
  stage.update({ state: game, highlights: new Map(), selectedBuilder: null });
  renderHome();
  placeHomeShips();
};

/* ---------- online ---------- */

const connect = (first: object) => {
  if (net) return;
  const ws = new WebSocket(wsUrl());
  net = { ws, you: -1, code: '', host: false, seats: [], started: false, error: '' };
  ws.onopen = () => ws.send(JSON.stringify(first));
  ws.onmessage = (e) => onServer(JSON.parse(String(e.data)) as ServerMsg);
  ws.onclose = () => {
    if (!net || net.ws !== ws) return;
    const wasPlaying = net.started;
    net = null;
    if (wasPlaying) {
      toast('A conexão com a sala caiu.');
      leaveGame();
    } else {
      homeTab = 'net';
      renderHome('Não consegui conectar ao servidor de salas.');
    }
  };
};

const onServer = (m: ServerMsg) => {
  if (!net) return;
  if (m.t === 'error') {
    net.error = m.message;
    if (net.started) toast(m.message);
    else {
      const wasEmpty = !net.code;
      renderHome();
      if (wasEmpty) {
        net.ws.close();
        net = null;
      }
    }
    return;
  }
  net.you = m.you;
  net.seats = m.seats;
  // na sala online, a família de cada bot vem do código da sala: todos os aparelhos veem o mesmo robô
  if (m.t === 'lobby') net.code = m.code;
  setSeatLooks(robotLooksFor(net.code, m.seats));
  if (m.t === 'lobby') {
    net.code = m.code;
    net.host = m.host;
    net.error = '';
    return renderHome();
  }
  const first = !net.started;
  net.started = true;
  session = { kind: 'net' };
  game = m.state;
  if (first) {
    logLines.length = 0;
    lastDie = null;
    say('A partida online começou.');
    enterGame();
  }
  takeState(m.events);
};

/* ---------- tela inicial ---------- */

const step = (n: number, title: string, hint = '') => {
  const s = document.createElement('div');
  s.className = 'step';
  s.innerHTML = `<b>${n}</b>${title}${hint ? ` <small>${hint}</small>` : ''}`;
  return s;
};
const choices = (values: number[], current: number, set: (v: number) => void) => {
  const d = document.createElement('div');
  d.className = 'choices';
  values.forEach((v) => d.appendChild(btn(String(v), () => (set(v), renderHome()), { on: v === current })));
  return d;
};
/** Escolha da duração da partida (curta, média ou longa), com uma linha explicando a escolhida. */
const lengthPicker = (n: number): HTMLElement => {
  const w = document.createElement('div');
  const d = document.createElement('div');
  d.className = 'choices';
  (['short', 'medium', 'long'] as MatchLength[]).forEach((l) => d.appendChild(btn(LENGTH_PT[l], () => ((opts.length = l), renderHome()), { on: l === opts.length })));
  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent = LENGTH_HINT[opts.length];
  w.append(step(n, t('Match length', 'Duração da partida')), d, hint);
  return w;
};
const actionsRow = (...b: HTMLElement[]) => {
  const d = document.createElement('div');
  d.className = 'actions';
  b.forEach((x) => d.appendChild(x));
  return d;
};

/** Troca de idioma (inglês é o padrão); recarrega a página. */
const langSwitch = (): HTMLElement => {
  const d = document.createElement('div');
  d.className = 'langsw';
  (['en', 'pt'] as const).forEach((l) => {
    const b = btn(l.toUpperCase(), () => l !== getLang() && setLang(l), { on: getLang() === l, title: l === 'en' ? 'English' : 'Português' });
    b.setAttribute('aria-label', b.title);
    d.appendChild(b);
  });
  return d;
};

const renderHome = (notice = '') => {
  const home = $('home');
  home.replaceChildren();
  home.appendChild(langSwitch());
  home.insertAdjacentHTML('beforeend', logoSvg());
  const tag = document.createElement('p');
  tag.className = 'tagline';
  tag.textContent = t('The island sinks, day turns to night and the ancient city rises from below. Discover treasure and escape on your ship before the island disappears. Beware of the creatures and the other pirates.', 'A ilha afunda, o dia vira noite e a cidade antiga emerge por baixo. Descubra tesouros e fuja no seu navio antes que a ilha desapareça. Cuidado com as criaturas e com os outros piratas.');
  home.appendChild(tag);

  const card = document.createElement('div');
  card.className = 'card';
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.style.gridTemplateColumns = `repeat(${ONLINE_AVAILABLE ? 3 : 2}, minmax(0, 1fr))`;
  const tabDefs: ['bot' | 'local' | 'net', string, IconNode][] = [['bot', t('Vs. BOT', 'Contra o BOT'), Bot], ['local', t('This device', 'Neste aparelho'), Users], ...(ONLINE_AVAILABLE ? ([['net', 'Online', Wifi]] as ['net', string, IconNode][]) : [])];
  tabDefs.forEach(([id, t, ic2]) => {
    const b = btn(t, () => ((homeTab = id), renderHome()), { icon: ic2 });
    b.className = 'tab' + (homeTab === id ? ' on' : '');
    tabs.appendChild(b);
  });
  card.appendChild(tabs);

  if (homeTab === 'bot') {
    card.append(step(1, t('How many bots?', 'Quantos bots?'), t('players controlled by the computer', 'jogadores controlados pelo computador')), choices([1, 2, 3], opts.bots, (v) => (opts.bots = v)), lengthPicker(2));
    card.appendChild(actionsRow(btn(t('How to play', 'Como jogar'), showRules, { icon: BookOpen }), btn(t('Start match', 'Iniciar partida'), () => startLocal('bots'), { primary: true })));
  } else if (homeTab === 'local') {
    card.append(step(1, t('How many players?', 'Quantos jogadores?'), t('passing the device from hand to hand', 'passando o aparelho de mão em mão')), choices([2, 3, 4], opts.players, (v) => (opts.players = v)), lengthPicker(2));
    card.appendChild(actionsRow(btn(t('How to play', 'Como jogar'), showRules, { icon: BookOpen }), btn(t('Start match', 'Iniciar partida'), () => startLocal('hot'), { primary: true })));
  } else if (!ONLINE_AVAILABLE) {
    const n = document.createElement('div');
    n.className = 'notice';
    n.innerHTML = `Nesta versão do site não há salas online. Para jogar em rede, abra <a href="${ONLINE_SITE}">${ONLINE_SITE.replace('https://', '')}</a>. Aqui você joga neste aparelho ou contra o BOT.`;
    card.appendChild(n);
  } else if (!net || !net.code) {
    const params = new URLSearchParams(location.search);
    const f = document.createElement('div');
    f.className = 'field';
    const name = Object.assign(document.createElement('input'), { placeholder: 'Seu apelido', maxLength: 16, value: localStorage.getItem('atl-name') ?? '' });
    const code = Object.assign(document.createElement('input'), { placeholder: 'Código da sala (4 letras)', maxLength: 4, value: (params.get('sala') ?? '').toUpperCase() });
    code.style.textTransform = 'uppercase';
    const nm = () => {
      localStorage.setItem('atl-name', name.value);
      return name.value.trim() || 'Jogador';
    };
    const two = document.createElement('div');
    two.className = 'two';
    two.append(code, btn('Entrar', () => connect({ t: 'join', code: code.value, name: nm() }), { primary: true }), btn('Assistir', () => connect({ t: 'watch', code: code.value })));
    f.append(name, btn('Criar sala', () => connect({ t: 'create', name: nm() }), { icon: Wifi, primary: true }), two);
    card.append(step(1, 'Jogar em rede', 'crie uma sala ou entre com o código'), f);
  } else {
    card.append(step(1, 'Sala', 'passe o código para quem vai jogar'));
    const cb = document.createElement('div');
    cb.className = 'codebox';
    cb.textContent = net.code;
    card.appendChild(cb);
    const ul = document.createElement('ul');
    ul.className = 'seats';
    net.seats.forEach((s, i) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = teamColor(i);
      li.append(dot, document.createTextNode(`${s.name}${s.kind === 'bot' ? ' (BOT)' : ''}${i === net!.you ? ' (você)' : ''}`));
      ul.appendChild(li);
    });
    card.appendChild(ul);
    if (net.host) {
      card.appendChild(
        actionsRow(
          btn('Adicionar BOT', () => net!.ws.send(JSON.stringify({ t: 'addBot' })), { icon: Bot, disabled: net.seats.length >= 4 }),
          btn('Começar', () => net!.ws.send(JSON.stringify({ t: 'start' })), { primary: true, disabled: net.seats.length < 2 }),
        ),
      );
    } else {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = net.you < 0 ? 'Você está assistindo. Aguarde o início.' : 'Aguardando o criador da sala iniciar a partida…';
      card.appendChild(p);
    }
  }
  const err = notice || net?.error;
  if (err) {
    const n = document.createElement('div');
    n.className = 'notice';
    n.textContent = err;
    card.appendChild(n);
  }
  home.appendChild(card);
};

/* ---------- início ---------- */

// textos fixos do index.html: ficam em inglês no HTML e trocam para português quando esse idioma está escolhido
document.documentElement.lang = getLang() === 'pt' ? 'pt-BR' : 'en';
if (getLang() === 'pt') {
  document.querySelectorAll<HTMLElement>('[data-pt]').forEach((el) => (el.textContent = el.dataset.pt!));
  document.querySelectorAll<HTMLElement>('[data-pt-aria]').forEach((el) => el.setAttribute('aria-label', el.dataset.ptAria!));
  document.querySelectorAll<HTMLElement>('[data-pt-title]').forEach((el) => (el.title = el.dataset.ptTitle!));
}

game = demoGame();
stage.update({ state: game, highlights: new Map(), selectedBuilder: null });
stage.setHomeMode(true);
if (ONLINE_AVAILABLE && new URLSearchParams(location.search).get('sala')) homeTab = 'net';
renderHome();
try {
  const c = JSON.parse(sessionStorage.getItem('ais-ships') ?? 'null') as { k: string; ships: Hex[] } | null;
  if (c && c.k === cacheKey() && c.ships.length === game.ships.length) {
    game.ships = c.ships; // mesma tela da última vez: navios já no lugar final
    stage.update({ state: game, highlights: new Map(), selectedBuilder: null });
  } else placeHomeShips();
} catch {
  placeHomeShips();
}
// o título muda de tamanho quando a fonte chega: os navios são reposicionados depois disso. A última posição fica guardada
// (por formato de tela), então ao recarregar (trocar PT/EN) eles já aparecem no lugar final e nada pisca nem pula
// o cenário só aparece (com um fade curto) depois de tudo no lugar: sem pulo dos navios nem lampejo ao carregar ou trocar o idioma
const showScene = () => $('view').classList.add('ready');
void (document.fonts?.ready ?? Promise.resolve()).then(() =>
  setTimeout(() => {
    placeHomeShips();
    shipsLayout = layoutOf();
    showScene();
  }, 80),
);
setTimeout(showScene, 1800); // se a fonte demorar, mostra mesmo assim
document.body.classList.remove('alarm');

// atalho de teste (só em desenvolvimento)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__atl = { stage, get game() { return game; }, apply, startLocal, opts, showEnd, play };
