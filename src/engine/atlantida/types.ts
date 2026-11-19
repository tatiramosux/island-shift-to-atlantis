/**
 * Tipos do motor de regras de Atlântida, Cidade Submersa. TypeScript puro e dados simples (serializáveis em JSON),
 * para rodar igual no cliente e no servidor. Regras em docs/atlantida.md.
 */
import type { Hex } from '../hex';

/** Peça de Atlântida escondida embaixo de cada casa da ilha. 'hidden' = o jogador não pode ver (veja redact.ts). */
export type AtlantisTile = 'crystal' | 'column' | 'portal' | 'trident' | 'calm' | 'fountain' | 'shield' | 'ruin';

export interface Cell {
  hex: Hex;
  /** distância do centro: 0 = Templo, 1 a 4 = casas de superfície. */
  ring: number;
  /** 'island' = superfície; 'atlantis' = já afundou e a cidade emergiu. */
  state: 'island' | 'atlantis';
  temple: boolean;
  /** andares construídos (0 a 3). */
  floors: number;
  dome: boolean;
  /** peça de baixo; null no Templo. */
  tile: AtlantisTile | 'hidden' | null;
  /** sorteio só visual (0 a 1): varia areia, grama e pedra de uma partida para outra. Não muda nenhuma regra. */
  look?: number;
  /** já foi descoberta por um pirata (a peça de baixo ficou à vista, sem a casa afundar). */
  dug?: boolean;
  /** o tesouro desta casa já foi pego (a peça vira Ruína, mas some do tabuleiro). */
  taken?: boolean;
  /** Ruína com restos de colunas à vista (só algumas; as outras são mármore limpo). Só muda o desenho. */
  relic?: boolean;
  /** enfeite da superfície (só desenho): palmeira, arbusto ou tufo de mato. Some quando a casa afunda. */
  flora?: 'palm' | 'bush' | 'grass';
  /** chão da superfície (só desenho): areia, grama ou pedra, espalhados por igual em volta da ilha. */
  ground?: 'beach' | 'forest' | 'mountain';
}

/** board = em terra; floating = boiando na boia; boat = remando num bote; aboard = já subiu no navio do time (fora do tabuleiro). */
export type BuilderStatus = 'unplaced' | 'board' | 'floating' | 'boat' | 'aboard' | 'dead';

export interface Builder {
  id: string;
  owner: number;
  /** casa de terra (board) ou casa de água (floating); null se não está no tabuleiro. */
  hex: Hex | null;
  status: BuilderStatus;
}

export type CreatureType = 'octopus' | 'leviathan' | 'guardian';

export interface Creature {
  id: CreatureType;
  type: CreatureType;
  /** null = ainda fora do tabuleiro (o Guardião só entra na primeira casa de Atlântida que emergir). */
  hex: Hex | null;
}

export type DieFace = 'octopus' | 'leviathan' | 'guardian' | 'surge';
export const DIE_FACES: readonly DieFace[] = ['octopus', 'octopus', 'leviathan', 'leviathan', 'guardian', 'surge'];

export type Phase = 'setup' | 'action' | 'flood' | 'creatures' | 'ended';

/** Números que ainda vão ser ajustados jogando (veja "Pontos a testar" em docs/atlantida.md). */
export interface Settings {
  /** 0 = desligado: o jogo termina no topo do Castelo e vence quem tiver mais cristais. */
  crystalsToWin: number;
  /** quantas casas precisam ter virado Atlântida para o Templo despertar. */
  templeWake: number;
  /** terremoto: quantas casas afundam por rodada (divididas entre as Marés de cada jogador). */
  floodsPerRound: number;
  actionsPerTurn: number;
  tritonCost: number;
  dolphinCost: number;
  sirenCost: number;
  colossusCost: number;
  /** o Polvo alcança construtores em casas com até este número de andares (0 = só no chão). */
  octopusReach: number;
  /** 'castle' = jogo original (o fim vem do Castelo); 'escape' = fim por fuga: o primeiro navio faz a ilha sumir. */
  ending: 'castle' | 'escape';
  /** só no final por fuga: rodada em que a ilha some de qualquer jeito (0 = sem limite). */
  vanishRound: number;
  /** a Sentinela de pedra entra em jogo (nas partidas curtas fica de fora). */
  guardian: boolean;
  /** Virada da maré: a onda gigante começa na rodada 2 e vira em Atlântida as fileiras que ela varre (acelera a partida). */
  tideShift: boolean;
}

export type MatchLength = 'short' | 'medium' | 'long';

export const DEFAULT_SETTINGS: Settings = {
  crystalsToWin: 0,
  templeWake: 12,
  floodsPerRound: 4,
  actionsPerTurn: 3,
  tritonCost: 2,
  dolphinCost: 1,
  sirenCost: 1,
  colossusCost: 2,
  octopusReach: 1,
  ending: 'castle',
  vanishRound: 0,
  guardian: true,
  tideShift: false,
};

/** Duração da partida: curta e média usam o final por fuga (veja docs/modo-fuga.md); longa é o jogo original. */
export const LENGTH_PRESETS: Record<MatchLength, Partial<Settings>> = {
  short: { ending: 'escape', floodsPerRound: 10, vanishRound: 9, guardian: false, tideShift: true },
  medium: { ending: 'escape', floodsPerRound: 6, vanishRound: 15, guardian: true, tideShift: true },
  long: {},
};

export interface PendingFlood {
  /** casa escolhida para afundar. */
  hex: Hex;
  /** jogadores com tridente que ainda podem cancelar; o primeiro é o da vez de decidir. */
  responders: number[];
}

export type WinReason = 'ship' | 'temple' | 'crystals' | 'last' | 'draw';

export interface GameState {
  settings: Settings;
  playerCount: number;
  /** chave "q,r" -> casa. 61 casas: o Templo e 60 de superfície. */
  cells: Record<string, Cell>;
  builders: Builder[];
  creatures: Creature[];
  /** navio de cada time, ancorado na água desde o começo (uma casa por jogador). */
  ships: Hex[];
  /** quem pegou o cristal do topo do Castelo (só existe um); null = ainda está lá. */
  castleTaken: number | null;
  /** fase final: lado (0 a 5) de onde vem a próxima onda gigante, avisado uma rodada antes; null = nenhuma à vista. */
  wave?: number | null;
  /** final por fuga: time que chegou primeiro ao navio (a ilha some quando a vez volta a ele); undefined = ninguém ainda. */
  escape?: { by: number } | null;
  /** a ilha já sumiu no mar (fim da partida por fuga). */
  vanished?: boolean;
  crystals: number[];
  tridents: number[];
  /** Fonte: o próximo passo de construir do jogador coloca 2 blocos. */
  fountain: boolean[];
  phase: Phase;
  /** ordem em que os construtores são colocados na preparação. */
  setupOrder: number[];
  setupIndex: number;
  current: number;
  round: number;
  turn: number;
  actionsLeft: number;
  summonUsed: boolean;
  /** quantas fases de Maré ainda serão puladas (Maré calma). */
  skipFlood: number;
  pendingFlood: PendingFlood | null;
  /** casas que ainda vão afundar nesta Maré (terremoto). */
  floodLeft: number;
  die: DieFace | null;
  /** jogador que acabou de entrar no 3º andar do Templo (uso interno, limpo ao fim da jogada). */
  templeEntry: number | null;
  rng: number;
  winners: number[] | null;
  winReason: WinReason | null;
}

export type Action =
  | { type: 'placeBuilder'; player: number; hex: Hex }
  | { type: 'move'; player: number; builderId: string; to: Hex; portalTo?: Hex }
  | { type: 'swim'; player: number; builderId: string; to: Hex }
  | { type: 'build'; player: number; builderId: string; at: Hex }
  | { type: 'dig'; player: number; builderId: string; at: Hex }
  | { type: 'push'; player: number; builderId: string; targetId: string }
  /** da praia, o pirata entra num bote na água vizinha. */
  | { type: 'launch'; player: number; builderId: string; to: Hex }
  /** no bote: rema até 2 casas de água, encosta numa praia ou sobe no navio do time. */
  | { type: 'row'; player: number; builderId: string; to: Hex }
  | { type: 'summon'; player: number; kind: 'triton'; builderId: string; targetId: string; distance: 1 | 2 }
  | { type: 'summon'; player: number; kind: 'dolphin'; builderId: string; to: Hex }
  | { type: 'summon'; player: number; kind: 'siren'; builderId: string; targetId: string }
  | { type: 'summon'; player: number; kind: 'colossus'; at: Hex }
  | { type: 'endActions'; player: number }
  | { type: 'flood'; player: number; hex: Hex }
  | { type: 'useTrident'; player: number }
  | { type: 'passTrident'; player: number }
  | { type: 'rollDie'; player: number }
  /** `target`: id do construtor (Polvo e Guardião) ou chave "q,r" da casa (Leviatã). */
  | { type: 'moveCreature'; player: number; creatureId: CreatureType; to: Hex; target?: string };

export type GameEvent = { type: string } & Record<string, unknown>;

export type ActionResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };
