/**
 * Motor de regras de Atlântida, Cidade Submersa. Funções puras sobre um GameState em JSON (sem three.js, sem DOM).
 *
 * Desenho: `legalActions(state)` lista TODAS as jogadas permitidas agora; `applyAction` só aceita uma jogada que
 * esteja nessa lista e a executa em uma cópia do estado. Assim a interface, o bot e o servidor usam a mesma verdade.
 *
 * Decisões de interpretação das regras (docs/atlantida.md) estão marcadas com "Regra:" nos comentários.
 */
import { hex, hexAdd, hexDisk, hexDistance, hexEquals, hexKey, hexNeighbors, hexReachable, hexRing, hexSubtract, hexToWorld, type Hex } from '../hex';
import { Rng, nextRandom } from './rng';
import {
  DEFAULT_SETTINGS,
  DIE_FACES,
  type Action,
  type ActionResult,
  type AtlantisTile,
  type Builder,
  type Cell,
  type Creature,
  type CreatureType,
  type GameEvent,
  type GameState,
  type Settings,
} from './types';

export const ORIGIN: Hex = hex(0, 0);
/** A ilha é um disco de raio 4 (61 casas). Fora dele, até WORLD_RADIUS, é água. */
export const ISLAND_RADIUS = 4;
export const WORLD_RADIUS = 6;

/** Quantas casas de Ruína mostram restos de colunas (as outras ficam limpas). */
export const RUIN_REMAINS = 7;

export const TILE_COUNTS: Record<AtlantisTile, number> = {
  crystal: 18,
  column: 8,
  portal: 3,
  trident: 5,
  calm: 3,
  fountain: 0, // a Fonte saiu do jogo
  shield: 2,
  ruin: 21, // a maioria fica limpa: só RUIN_REMAINS delas mostram restos de colunas
};

const MAX_FLOORS = 3;
const CREATURE_STEPS: Record<CreatureType, number> = { octopus: 3, leviathan: 2, guardian: 1 };
/** Até quantas casas os tentáculos do Polvo e a cauda do Leviatã alcançam a partir de onde eles param (sempre na água). */
export const OCTOPUS_TENTACLES = 2;

/* ---------- consultas ---------- */

export const cellAt = (s: GameState, h: Hex): Cell | undefined => s.cells[hexKey(h)];
export const isWater = (h: Hex): boolean => {
  const d = hexDistance(ORIGIN, h);
  return d > ISLAND_RADIUS && d <= WORLD_RADIUS;
};
/** Mar de verdade: a água em volta da ilha ou um buraco aberto no meio dela (casa que desabou). */
export const isSea = (s: GameState, h: Hex): boolean => isWater(h) || !!s.cells[hexKey(h)]?.sunk;
/** pirata que ocupa uma casa do tabuleiro (em terra, boiando ou no bote). Quem já subiu no navio não ocupa casa. */
export const isAlive = (b: Builder): boolean => b.status === 'board' || b.status === 'floating' || b.status === 'boat';
export const isShip = (s: GameState, h: Hex): boolean => s.ships.some((x) => hexEquals(x, h));
/** Piratas que estão juntos no mesmo bote, nesta casa de água. */
export const boatMates = (s: GameState, h: Hex): Builder[] => s.builders.filter((b) => b.status === 'boat' && b.hex && hexEquals(b.hex, h));
/** Cabem 2 piratas no bote, só do mesmo time. */
export const BOAT_SEATS = 2;
const canJoinBoat = (s: GameState, h: Hex, p: number): boolean => {
  const mates = boatMates(s, h);
  return mates.length > 0 && mates.length < BOAT_SEATS && mates.every((b) => b.owner === p) && !creatureAt(s, h);
};
/**
 * Seis pontos de ancoragem em volta, sempre com 1 casa de água entre a ilha e o navio (anel 6, logo além do mar
 * onde as criaturas andam). Cada time ancora o navio num deles, o mais longe possível dos outros.
 */
const SHIP_RING = ISLAND_RADIUS + 2;
const SHIP_SPOTS: Hex[] = [hex(SHIP_RING, 0), hex(SHIP_RING, -SHIP_RING), hex(0, -SHIP_RING), hex(-SHIP_RING, 0), hex(-SHIP_RING, SHIP_RING), hex(0, SHIP_RING)];
const SHIP_PICK: Record<number, number[]> = { 2: [4, 1], 3: [4, 0, 2], 4: [4, 5, 1, 2] }; // 2 jogadores: navios nos cantos inferior esquerdo e superior direito da tela
export const shipSpots = (players: number): Hex[] => SHIP_PICK[players].map((i) => SHIP_SPOTS[i]);
export const builderAt = (s: GameState, h: Hex): Builder | undefined => s.builders.find((b) => isAlive(b) && b.hex && hexEquals(b.hex, h));
export const creatureAt = (s: GameState, h: Hex): Creature | undefined => s.creatures.find((c) => c.hex && hexEquals(c.hex, h));
export const atlantisCount = (s: GameState): number => Object.values(s.cells).filter((c) => c.state === 'atlantis').length;
export const templeAwake = (s: GameState): boolean => atlantisCount(s) >= s.settings.templeWake;
export const levelOf = (s: GameState, b: Builder): number => (b.status === 'board' && b.hex ? cellAt(s, b.hex)?.floors ?? 0 : 0);
/** Escudo: o mar e as criaturas não levam quem está nesta casa. */
const shielded = (s: GameState, b: Builder): boolean => b.status === 'board' && !!b.hex && cellAt(s, b.hex)?.tile === 'shield';

/** Casa de terra onde um construtor pode entrar: sem cúpula, sem ninguém, e o Templo só depois de despertar. */
const landFree = (s: GameState, h: Hex): boolean => {
  const c = cellAt(s, h);
  if (!c || c.dome || c.sunk) return false;
  if (c.temple && !templeAwake(s)) return false;
  return !builderAt(s, h) && !creatureAt(s, h);
};
/** Valor do cristal do topo do Castelo. */
/** A princesa do Castelo: quem a resgata e embarca no navio com ela ganha este bônus (não vence na hora). */
export const PRINCESS_BONUS = 4;
/** Casa colada na entrada do Castelo (o portão em arco do desenho fica deste lado): ali não se constrói escada. */
export const CASTLE_GATE: Hex = hex(0, 1);
const canBuild = (s: GameState, c: Cell): boolean => {
  if (!landFree(s, c.hex)) return false;
  if (!c.temple && c.ring !== 1) return false; // Regra: só se constrói no Castelo e nas casas coladas nele
  if (hexEquals(c.hex, CASTLE_GATE)) return false; // a frente do portão fica livre
  return !(c.temple && c.floors >= MAX_FLOORS); // o Templo não aceita cúpula
};
/** Descobrir: casa de superfície longe do Castelo (anel 2 em diante), ainda fechada e livre. */
const canDig = (s: GameState, c: Cell): boolean => c.state === 'island' && !c.temple && c.ring >= 2 && !c.dug && !c.dome && !builderAt(s, c.hex) && !creatureAt(s, c.hex);
const waterFree = (s: GameState, h: Hex): boolean => isSea(s, h) && !isShip(s, h) && !builderAt(s, h) && !creatureAt(s, h);

/** Casa de água livre mais próxima (desempate pela ordem do anel, que é fixa). */
const nearestWater = (s: GameState, from: Hex): Hex | null => {
  for (let d = 1; d <= WORLD_RADIUS * 2; d++) for (const h of hexRing(from, d)) if (waterFree(s, h)) return h;
  return null;
};

/* ---------- construções com função (fora do Castelo) ---------- */

/** Escadaria (1 andar na casa colada no Castelo): quem está em cima dela sobe até 2 andares de uma vez (menos para dentro do Castelo). */
export const isStair = (c: Cell): boolean => !c.temple && c.ring === 1 && c.floors === 1;
/** Torre de vigia e Farol (2 andares ou mais): quem está em cima não pode ser empurrado por construtores nem pelo Tritão. */
export const isFortified = (c: Cell): boolean => !c.temple && c.floors >= 2;
/** Farol aceso (3 andares com alguém em cima): a casa dele e as vizinhas não afundam na Maré. */
export const lighthouseLit = (s: GameState, c: Cell): boolean => !c.temple && c.floors >= MAX_FLOORS && !!builderAt(s, c.hex);
const canClimb = (from: Cell, to: Cell): boolean => to.floors <= from.floors + (isStair(from) && !to.temple ? 2 : 1);
const onFortified = (s: GameState, b: Builder): boolean => !!b.hex && b.status === 'board' && isFortified(cellAt(s, b.hex)!);

export const floodCandidates = (s: GameState): Hex[] => {
  const open = Object.values(s.cells).filter((c) => c.state === 'island' && !c.temple);
  if (!open.length) return [];
  // o terremoto pode abrir qualquer casa de superfície (inclusive no meio), assim as criaturas chegam ao centro
  const edge = open;
  // a luz de um Farol aceso protege a própria casa e as vizinhas; se isso cobrir a borda inteira, a Maré segue normal
  const lit = open.filter((c) => lighthouseLit(s, c));
  const safe = new Set(lit.flatMap((c) => [hexKey(c.hex), ...hexNeighbors(c.hex).map(hexKey)]));
  const free = edge.filter((c) => !safe.has(hexKey(c.hex)));
  return (free.length ? free : edge).map((c) => c.hex);
};

export const playerAlive = (s: GameState, p: number): boolean => s.builders.some((b) => b.owner === p && b.status !== 'dead');

/** Quem precisa jogar agora (na preparação, quem coloca; no tridente, quem decide; senão, o jogador da vez). */
export const actor = (s: GameState): number => {
  if (s.phase === 'setup') return s.setupOrder[s.setupIndex];
  if (s.pendingFlood) return s.pendingFlood.responders[0];
  return s.current;
};

/* ---------- criação ---------- */

export interface NewGameOptions {
  players: number;
  seed: number;
  settings?: Partial<Settings>;
}

/** Peças que nunca podem ficar lado a lado no mapa. */
const NO_NEIGHBOR: AtlantisTile[] = ['fountain', 'portal']; // a Ruína quase sempre emerge limpa: pode ficar ao lado de outra

/**
 * Troca peças de lugar até nenhuma Fonte ficar ao lado de outra Fonte, nem Ruína ao lado de Ruína.
 * `tiles` está na ordem das casas de superfície (as mesmas que createGame percorre, sem o Castelo).
 */
const spreadTiles = (tiles: AtlantisTile[], rng: Rng): AtlantisTile[] => {
  const spots = hexDisk(ORIGIN, ISLAND_RADIUS).filter((h) => hexDistance(ORIGIN, h) > 0);
  const index = new Map(spots.map((h, i) => [hexKey(h), i]));
  const around = spots.map((h) => hexNeighbors(h).map((n) => index.get(hexKey(n))).filter((i): i is number => i !== undefined));
  const clash = (i: number, t: AtlantisTile): boolean => NO_NEIGHBOR.includes(t) && around[i].some((j) => tiles[j] === t);
  for (let tries = 0; tries < 5000; tries++) {
    const bad = tiles.findIndex((t, i) => clash(i, t));
    if (bad < 0) break;
    const j = Math.floor(rng.next() * tiles.length);
    if (j === bad || tiles[j] === tiles[bad]) continue;
    const a = tiles[bad];
    const b = tiles[j];
    tiles[bad] = b;
    tiles[j] = a;
    if (clash(bad, b) || clash(j, a)) {
      tiles[bad] = a; // a troca não resolveu: desfaz e tenta outra casa
      tiles[j] = b;
    }
  }
  return tiles;
};

export const createGame = ({ players, seed, settings }: NewGameOptions): GameState => {
  if (players < 2 || players > 4) throw new Error('Atlântida é para 2 a 4 jogadores');
  const rng = new Rng(seed);
  const tiles: AtlantisTile[] = [];
  (Object.keys(TILE_COUNTS) as AtlantisTile[]).forEach((t) => {
    for (let i = 0; i < TILE_COUNTS[t]; i++) tiles.push(t);
  });
  const shuffled = spreadTiles(rng.shuffle(tiles), rng);
  const cells: Record<string, Cell> = {};
  const lookRng = new Rng((seed ^ 0x9e3779b9) >>> 0); // gerador à parte: o visual não mexe no resto do sorteio
  let n = 0;
  for (const h of hexDisk(ORIGIN, ISLAND_RADIUS)) {
    const ring = hexDistance(ORIGIN, h);
    const temple = ring === 0;
    cells[hexKey(h)] = { hex: h, ring, state: 'island', temple, floors: 0, dome: false, tile: temple ? null : shuffled[n++], look: lookRng.next() };
  }
  // chão (só desenho): em cada anel as pedras ficam espaçadas por igual em volta da ilha (nunca amontoadas num lado);
  // as outras casas são areia ou grama (mais areia na borda, mais grama perto do Castelo)
  const STONE_SHARE = [0, 0.5, 0.25, 0.12, 0.12];
  const SAND_SHARE = [0, 0.3, 0.35, 0.62, 0.62];
  for (let r = 1; r <= ISLAND_RADIUS; r++) {
    const ring = hexRing(ORIGIN, r);
    const n = ring.length;
    const stones = Math.max(1, Math.round(n * STONE_SHARE[r]));
    const start = lookRng.next() * n;
    const stoneAt = new Set(Array.from({ length: stones }, (_, i) => Math.floor(start + (i * n) / stones) % n));
    ring.forEach((h, i) => {
      const c = cells[hexKey(h)];
      c.ground = stoneAt.has(i) ? 'mountain' : lookRng.next() < SAND_SHARE[r] / (1 - STONE_SHARE[r]) ? 'beach' : 'forest';
    });
  }
  // enfeites da ilha (só desenho, com o gerador visual): 2 palmeiras, uma de cada lado da ilha (casas opostas), e
  // 2 arbustos e 2 tufos de mato fora do centro; nunca em cima de pedra
  const decoSpots = Object.values(cells).filter((c) => c.ring >= 2 && c.ground !== 'mountain');
  const palmSpots = decoSpots.filter((c) => cells[hexKey(hex(-c.hex.q, -c.hex.r))]?.ground !== 'mountain');
  const palm = palmSpots[Math.floor(lookRng.next() * palmSpots.length)];
  if (palm) {
    palm.flora = 'palm';
    cells[hexKey(hex(-palm.hex.q, -palm.hex.r))].flora = 'palm';
  }
  (['bush', 'bush', 'grass', 'grass'] as const).forEach((f) => {
    const free = decoSpots.filter((c) => !c.flora);
    free[Math.floor(lookRng.next() * free.length)].flora = f;
  });
  // só algumas Ruínas têm restos de colunas à vista; as outras emergem como mármore limpo
  const ruins = rng.shuffle(Object.values(cells).filter((c) => c.tile === 'ruin'));
  ruins.slice(0, RUIN_REMAINS).forEach((c) => (c.relic = true));
  const builders: Builder[] = [];
  for (let p = 0; p < players; p++) for (let i = 0; i < 2; i++) builders.push({ id: `p${p}b${i}`, owner: p, hex: null, status: 'unplaced' });

  // criaturas em pontos separados da água ao redor da ilha (o Guardião entra com a primeira casa que emergir)
  // criaturas longe dos navios (para não ficarem encavaladas neles) e uma do lado oposto da outra
  const ships = shipSpots(players);
  const farFromShips = (h: Hex) => Math.min(...ships.map((x) => hexDistance(h, x)));
  const around = rng.shuffle(hexRing(ORIGIN, ISLAND_RADIUS + 1)).sort((a, b) => farFromShips(b) - farFromShips(a));
  const octopusAt = around[0];
  const leviathanAt = around.find((h) => hexDistance(h, octopusAt) >= 6 && farFromShips(h) >= 3) ?? around.find((h) => hexDistance(h, octopusAt) >= 6) ?? around[1];
  const creatures: Creature[] = [
    { id: 'octopus', type: 'octopus', hex: octopusAt },
    { id: 'leviathan', type: 'leviathan', hex: leviathanAt },
    { id: 'guardian', type: 'guardian', hex: null },
  ];

  // quem joga por último coloca primeiro; cada passada coloca um construtor de cada jogador
  const pass = Array.from({ length: players }, (_, i) => players - 1 - i);
  return {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    playerCount: players,
    cells,
    builders,
    creatures,
    ships,
    castleTaken: null,
    princess: null,
    wave: null,
    crystals: Array(players).fill(0),
    tridents: Array(players).fill(0),
    fountain: Array(players).fill(false),
    phase: 'setup',
    setupOrder: [...pass, ...pass],
    setupIndex: 0,
    current: 0,
    round: 1,
    turn: 1,
    actionsLeft: 0,
    summonUsed: false,
    skipFlood: 0,
    pendingFlood: null,
    floodLeft: 0,
    die: null,
    templeEntry: null,
    rng: rng.state,
    winners: null,
    winReason: null,
  };
};

/* ---------- movimentos de peças (usados por vários efeitos) ---------- */

const dropIntoWater = (s: GameState, b: Builder, ev: GameEvent[]) => {
  const from = b.hex!;
  const w = nearestWater(s, from);
  b.status = 'floating'; // ninguém morre: quem cai na água só boia
  if (!w) return;
  b.hex = w;
  ev.push({ type: 'floating', builderId: b.id, owner: b.owner, from, to: w });
};

/** Quem já boia e é agarrado é jogado de volta ao mar, um pouco mais longe (continua boiando). */
const tossFloater = (s: GameState, b: Builder, ev: GameEvent[]) => {
  const from = b.hex!;
  for (let d = 2; d <= 4; d++) {
    for (const h of hexRing(from, d)) {
      if (!waterFree(s, h)) continue;
      b.hex = h;
      ev.push({ type: 'floating', builderId: b.id, owner: b.owner, from, to: h });
      return;
    }
  }
};

/** Efeito da peça de Atlântida ao terminar o movimento numa casa (e vitória no Templo). */
const enter = (s: GameState, b: Builder, ev: GameEvent[]) => {
  const c = cellAt(s, b.hex!)!;
  if (c.temple && c.floors === MAX_FLOORS && s.castleTaken === null) {
    s.castleTaken = b.owner;
    s.princess = { by: b.owner, safe: false }; // no topo do Castelo estava a princesa: agora ela acompanha o time
    ev.push({ type: 'castleCrystal', owner: b.owner, hex: c.hex, value: 0 });
  }
  if (c.state !== 'atlantis') return;
  switch (c.tile) {
    case 'crystal':
      s.crystals[b.owner] += 1;
      c.taken = true;
      c.tile = 'ruin'; // a casa vira uma Ruína
      ev.push({ type: 'crystal', owner: b.owner, hex: c.hex });
      break;
    case 'trident':
      s.tridents[b.owner] += 1;
      c.taken = true;
      c.tile = 'ruin';
      ev.push({ type: 'tridentTaken', owner: b.owner, hex: c.hex });
      break;
    case 'calm':
      s.skipFlood += 1;
      c.taken = true;
      c.tile = 'ruin'; // a peça some
      ev.push({ type: 'calmSea', owner: b.owner, hex: c.hex });
      break;
    case 'fountain':
      s.fountain[b.owner] = true;
      ev.push({ type: 'fountain', owner: b.owner, hex: c.hex });
      break;
    default:
      break; // portal (tratado no movimento), coluna (efeito já aplicado ao afundar), escudo (passivo), ruína
  }
};

/* ---------- lista de jogadas legais ---------- */

const dirOf = (from: Hex, to: Hex): Hex => hexSubtract(to, from);

/** Casa para onde um construtor empurrado iria (uma casa atrás), se for permitida. */
const pushDest = (s: GameState, from: Hex, target: Builder): Hex | null => {
  const dest = hexAdd(target.hex!, dirOf(from, target.hex!));
  const dc = cellAt(s, dest);
  const tc = cellAt(s, target.hex!);
  if (!dc || !tc || !landFree(s, dest)) return null;
  // Regra: o empurrão simples respeita a regra de subir 1 andar por vez e nunca joga na água.
  return dc.floors <= tc.floors + 1 ? dest : null;
};

/** Deslize do Tritão: anda passo a passo, para antes de obstáculos e cai (e para) na primeira água. */
const tritonSlide = (s: GameState, from: Hex, target: Builder, distance: number): { to: Hex; falls: boolean } => {
  const dir = dirOf(from, target.hex!);
  let cur = target.hex!;
  for (let i = 0; i < distance; i++) {
    const next = hexAdd(cur, dir);
    if (isSea(s, next)) return waterFree(s, next) ? { to: next, falls: true } : { to: cur, falls: false };
    if (!landFree(s, next)) break;
    cur = next;
  }
  return { to: cur, falls: false };
};

const creatureOf = (s: GameState, type: CreatureType): Creature => s.creatures.find((c) => c.type === type)!;

const creatureMoves = (s: GameState, p: number): Action[] => {
  if (!s.die || s.die === 'surge') return [];
  const cr = creatureOf(s, s.die);
  if (!cr.hex) return [];
  const type = cr.type;
  const passable = (h: Hex): boolean => {
    if (builderAt(s, h) || creatureAt(s, h)) return false;
    if (isSea(s, h)) return type !== 'guardian'; // Polvo e Leviatã nadam: só andam pelo mar e pelos buracos que abrem na ilha
    if (type !== 'guardian') return false; // nunca sobem na ilha nem em Atlântida
    const c = cellAt(s, h);
    return !!c && c.state === 'atlantis' && !c.dome && !c.sunk;
  };
  const out: Action[] = [];
  for (const k of hexReachable(cr.hex, CREATURE_STEPS[type], passable).keys()) {
    const [q, r] = k.split(',').map(Number);
    const to = hex(q, r);
    const base = { type: 'moveCreature', player: p, creatureId: type, to } as const;
    if (type === 'octopus' || type === 'leviathan') {
      // Regra: laçam quem está a até 2 casas de onde param. Em terra, só quem está em andar baixo e sem Escudo; quem boia é jogado mais longe;
      // o bote vira. O Polvo é obrigado a puxar quando alguém está ao alcance; o Leviatã escolhe (ou derruba uma construção vizinha).
      const prey = s.builders.filter((b) => {
        if (!isAlive(b) || !b.hex || hexDistance(to, b.hex) > OCTOPUS_TENTACLES) return false;
        if (b.status !== 'board') return type === 'octopus';
        return !shielded(s, b) && levelOf(s, b) <= s.settings.octopusReach;
      });
      if (type === 'octopus') {
        if (!prey.length) out.push(base);
        for (const b of prey) out.push({ ...base, target: b.id });
        continue;
      }
      out.push(base);
      for (const b of prey) out.push({ ...base, target: b.id });
      for (const nb of hexNeighbors(to)) {
        const c = cellAt(s, nb);
        if (!c || c.sunk || !(c.dome || c.floors > 0)) continue;
        const on = builderAt(s, nb);
        if (on && shielded(s, on)) continue;
        out.push({ ...base, target: hexKey(nb) });
      }
      continue;
    }
    out.push(base);
    for (const nb of hexNeighbors(to)) {
      const b = builderAt(s, nb);
      if (b && b.status === 'board' && !shielded(s, b) && pushDest(s, to, b)) out.push({ ...base, target: b.id });
    }
  }
  return out;
};

export const legalActions = (s: GameState): Action[] => {
  if (s.phase === 'ended') return [];
  const out: Action[] = [];

  if (s.phase === 'setup') {
    const player = s.setupOrder[s.setupIndex];
    for (const h of hexRing(ORIGIN, ISLAND_RADIUS)) if (landFree(s, h)) out.push({ type: 'placeBuilder', player, hex: h });
    return out;
  }

  if (s.phase === 'flood') {
    if (s.pendingFlood) {
      const player = s.pendingFlood.responders[0];
      return [
        { type: 'useTrident', player },
        { type: 'passTrident', player },
      ];
    }
    return []; // o terremoto sorteia sozinho; ninguém escolhe a casa
  }

  if (s.phase === 'creatures') {
    if (!s.die) return [{ type: 'rollDie', player: s.current }];
    return creatureMoves(s, s.current);
  }

  // fase de Ação
  const p = s.current;
  const mine = s.builders.filter((b) => b.owner === p && isAlive(b));
  if (s.actionsLeft > 0) {
    for (const b of mine) {
      if (b.status === 'board') {
        const from = cellAt(s, b.hex!)!;
        for (const n of hexNeighbors(b.hex!)) {
          // da praia, entra num bote novo ou no bote do companheiro de time que está ali
          if (from.floors <= 1 && (waterFree(s, n) || canJoinBoat(s, n, p))) out.push({ type: 'launch', player: p, builderId: b.id, to: n });
          const c = cellAt(s, n);
          if (!c) continue;
          if (landFree(s, n) && canClimb(from, c)) {
            out.push({ type: 'move', player: p, builderId: b.id, to: n });
            if (c.tile === 'portal' && c.state === 'atlantis') {
              // Portal: em vez de parar aqui, vai para outro Portal livre
              for (const o of Object.values(s.cells)) {
                if (o !== c && o.state === 'atlantis' && o.tile === 'portal' && landFree(s, o.hex)) {
                  out.push({ type: 'move', player: p, builderId: b.id, to: n, portalTo: o.hex });
                }
              }
            }
          }
          if (canBuild(s, c)) out.push({ type: 'build', player: p, builderId: b.id, at: n });
          if (canDig(s, c)) out.push({ type: 'dig', player: p, builderId: b.id, at: n });
          const t = builderAt(s, n);
          if (t && t.status === 'board' && t.owner !== p && !onFortified(s, t) && pushDest(s, b.hex!, t)) out.push({ type: 'push', player: p, builderId: b.id, targetId: t.id });
        }
      } else if (b.status === 'boat') {
        // rema até 2 casas pela água livre; dá para subir no navio do time ou encostar numa praia (nível 0 ou 1)
        const ship = s.ships[p];
        const reach = hexReachable(b.hex!, 2, (h) => waterFree(s, h) || hexEquals(h, ship));
        for (const k of reach.keys()) {
          const [q, r] = k.split(',').map(Number);
          const to = hex(q, r);
          if (!hexEquals(to, b.hex!)) out.push({ type: 'row', player: p, builderId: b.id, to });
        }
        for (const n of hexNeighbors(b.hex!)) {
          const c = cellAt(s, n);
          if (c && landFree(s, n) && c.floors <= 1) out.push({ type: 'row', player: p, builderId: b.id, to: n });
        }
      } else {
        for (const n of hexNeighbors(b.hex!)) {
          if (hexEquals(n, s.ships[p])) out.push({ type: 'swim', player: p, builderId: b.id, to: n }); // nada até o navio
          if (waterFree(s, n) || canJoinBoat(s, n, p)) out.push({ type: 'swim', player: p, builderId: b.id, to: n }); // nada ou sobe no bote do time
          else {
            const c = cellAt(s, n);
            // Regra: um náufrago só sobe em terra de nível 0 ou 1.
            if (c && landFree(s, n) && c.floors <= 1) out.push({ type: 'swim', player: p, builderId: b.id, to: n });
          }
        }
      }
    }
  }

  if (!s.summonUsed) {
    const st = s.settings;
    const cr = s.crystals[p];
    if (cr >= st.tritonCost) {
      for (const b of mine) {
        if (b.status !== 'board') continue;
        for (const n of hexNeighbors(b.hex!)) {
          const t = builderAt(s, n);
          if (!t || t.status !== 'board' || t.owner === p || onFortified(s, t)) continue;
          for (const distance of [1, 2] as const) {
            if (!hexEquals(tritonSlide(s, b.hex!, t, distance).to, t.hex!)) out.push({ type: 'summon', player: p, kind: 'triton', builderId: b.id, targetId: t.id, distance });
          }
        }
      }
    }
    if (cr >= st.dolphinCost) {
      for (const b of mine) {
        if (b.status !== 'floating') continue;
        for (const c of hexDisk(b.hex!, 2)) {
          const cell = cellAt(s, c);
          if (cell && landFree(s, c) && cell.floors <= 1) out.push({ type: 'summon', player: p, kind: 'dolphin', builderId: b.id, to: c });
        }
      }
    }
    if (cr >= st.sirenCost) {
      for (const b of mine) {
        for (const n of hexNeighbors(b.hex!)) {
          const t = builderAt(s, n);
          if (t && t.owner !== p && s.crystals[t.owner] > 0) out.push({ type: 'summon', player: p, kind: 'siren', builderId: b.id, targetId: t.id });
        }
      }
    }
    if (cr >= st.colossusCost) {
      for (const c of Object.values(s.cells)) {
        // pode ser em qualquer casa que não seja o Templo, sem ninguém dentro
        if (!c.temple && !c.dome && !builderAt(s, c.hex) && !creatureAt(s, c.hex)) out.push({ type: 'summon', player: p, kind: 'colossus', at: c.hex });
      }
    }
  }
  out.push({ type: 'endActions', player: p });
  return out;
};


/* ---------- Sentinela (Guardião de pedra) ---------- */

/** Até quantas casas a Sentinela percebe um pirata, e quantas casas ela avança quando acorda. */
export const SENTINEL_SENSE = 2;

/** Pirata que a Sentinela pode atacar: em terra, sem Escudo e fora da torre de vigia (2º andar ou mais). */
const sentinelPrey = (s: GameState, b: Builder): boolean => b.status === 'board' && !!b.hex && !shielded(s, b) && !onFortified(s, b);

/** Piratas ao alcance dos sentidos da Sentinela agora (os olhos dela acendem). */
export const sentinelAlert = (s: GameState): boolean => {
  const g = creatureOf(s, 'guardian');
  return !!g.hex && s.builders.some((b) => sentinelPrey(s, b) && hexDistance(g.hex!, b.hex!) <= SENTINEL_SENSE);
};

/** Quantas casas o jato de água da Sentinela empurra o pirata para longe do centro. */
export const SENTINEL_BLAST = 2;

/** Vizinha que mais se afasta do centro da ilha (do Castelo), na mesma direção em que o pirata já está. */
const outward = (from: Hex): Hex | null => {
  const w = hexToWorld(from);
  const len = Math.hypot(w.x, w.z);
  if (len === 0) return null;
  let best: Hex | null = null;
  let bestDot = -Infinity;
  for (const n of hexNeighbors(from)) {
    const v = hexToWorld(n);
    const dot = ((v.x - w.x) * w.x + (v.z - w.z) * w.z) / len;
    if (dot > bestDot) {
      bestDot = dot;
      best = n;
    }
  }
  return best;
};

/**
 * A Sentinela acorda e, sem sair do lugar, dispara um jato de água no pirata (como o raio de um ciclope): ele é empurrado
 * até 2 casas para longe do centro. Para antes de cúpula, criatura ou outro pirata; se o empurrão passa da borda, ele cai
 * no mar e fica boiando. Depois ela volta a dormir.
 */
const sentinelWake = (s: GameState, target: Builder, ev: GameEvent[]) => {
  const g = creatureOf(s, 'guardian');
  if (!g.hex || !target.hex) return;
  const start = target.hex;
  let cur = start;
  let falls = false;
  for (let i = 0; i < SENTINEL_BLAST; i++) {
    const next = outward(cur);
    if (!next) break;
    if (isSea(s, next)) {
      if (waterFree(s, next)) {
        cur = next;
        falls = true;
      }
      break;
    }
    if (!landFree(s, next)) break;
    cur = next;
  }
  ev.push({ type: 'sentinelWake', at: g.hex, targetId: target.id, pushFrom: start, pushTo: hexEquals(cur, start) ? null : cur, falls });
  target.hex = cur;
  if (falls) {
    target.status = 'floating';
    ev.push({ type: 'floating', builderId: target.id, owner: target.owner, from: start, to: cur });
  }
};

/** Um pirata terminou o movimento: se parou a até 2 casas da Sentinela, ela acorda e vai atrás dele. */
const sentinelCheck = (s: GameState, b: Builder, ev: GameEvent[]) => {
  const g = creatureOf(s, 'guardian');
  if (!g.hex || !sentinelPrey(s, b) || hexDistance(g.hex, b.hex!) > SENTINEL_SENSE) return;
  sentinelWake(s, b, ev);
};

/* ---------- execução ---------- */

const rand = (s: GameState): number => {
  const [v, next] = nextRandom(s.rng);
  s.rng = next;
  return v;
};

const startCreatures = (s: GameState) => {
  s.phase = 'creatures';
  s.die = null;
};

const startFlood = (s: GameState, ev: GameEvent[]) => {
  s.phase = 'flood';
  if (s.skipFlood > 0) {
    s.skipFlood -= 1;
    ev.push({ type: 'floodSkipped' });
    return startCreatures(s);
  }
  // terremoto: a rodada inteira afunda `floodsPerRound` casas, divididas entre as Marés de quem ainda joga
  s.floodLeft = Math.min(floodQuota(s), floodCandidates(s).length);
  if (s.floodLeft <= 0) return startCreatures(s);
  ev.push({ type: 'quake', count: s.floodLeft });
  autoFlood(s, ev);
};

/**
 * Regra: o terremoto é da mesa, não de um jogador. As casas que afundam são sorteadas entre as candidatas, uma de cada
 * vez. Se alguém tem tridente, o sorteio para e espera a decisão (usar ou deixar afundar).
 */
const autoFlood = (s: GameState, ev: GameEvent[]) => {
  while (s.phase === 'flood' && !s.pendingFlood) {
    const cands = floodCandidates(s);
    if (s.floodLeft <= 0 || !cands.length) {
      s.floodLeft = 0;
      return startCreatures(s);
    }
    const h = cands[Math.floor(rand(s) * cands.length)];
    const responders = Array.from({ length: s.playerCount }, (_, i) => (s.current + i) % s.playerCount).filter((p) => s.tridents[p] > 0);
    if (responders.length) {
      s.pendingFlood = { hex: h, responders };
      ev.push({ type: 'floodPicked', hex: h });
      return;
    }
    resolveFlood(s, h, ev);
  }
};

const floodQuota = (s: GameState): number => {
  const alive = Array.from({ length: s.playerCount }, (_, i) => i).filter((p) => playerAlive(s, p));
  const n = Math.max(1, alive.length);
  const i = Math.max(0, alive.indexOf(s.current));
  // fase final (o cristal do Castelo já saiu): o terremoto dobra e Atlântida emerge quase inteira
  const per = s.settings.floodsPerRound * (s.castleTaken !== null ? 2 : 1);
  return Math.floor((per * (i + 1)) / n) - Math.floor((per * i) / n);
};

/**
 * Lados da ilha para a onda gigante: o lado k é a fileira de borda onde uma coordenada cúbica vale o raio
 * (q, r, s, -q, -r, -s). A onda atinge as duas fileiras de fora daquele lado.
 */
const sideCoord = (h: Hex, k: number): number => [h.q, h.r, -h.q - h.r, -h.q, -h.r, h.q + h.r][k];
export const waveCells = (s: GameState, k: number): Hex[] =>
  Object.values(s.cells)
    .filter((c) => !c.temple && sideCoord(c.hex, k) >= ISLAND_RADIUS - 1)
    .map((c) => c.hex);

/** A onda bate: quem está no chão ou no 1º andar daquele lado cai no mar (o Escudo segura). */
const waveHit = (s: GameState, k: number, ev: GameEvent[]) => {
  const keys = new Set(waveCells(s, k).map(hexKey));
  // virada da maré: as casas de superfície varridas viram Atlântida na hora (torres de 2 andares ou mais e cúpulas resistem)
  const turned: Hex[] = [];
  if (s.settings.tideShift) {
    for (const h of waveCells(s, k)) {
      const c = cellAt(s, h)!;
      if (c.state !== 'island' || c.floors >= 2 || c.dome) continue;
      flipCell(s, h, ev);
      turned.push(h);
    }
  }
  const hit = s.builders.filter((b) => b.status === 'board' && b.hex && keys.has(hexKey(b.hex)) && levelOf(s, b) <= 1 && !shielded(s, b));
  ev.push({ type: 'wave', side: k, hit: hit.map((b) => b.id), turned: turned.length });
  for (const b of hit) dropIntoWater(s, b, ev);
};

/** Tesouros ainda não pegos: a casa que os guarda não desmorona. */
const CRUMBLE_KEEP = new Set<string>(['crystal', 'trident', 'calm', 'fountain']);
/**
 * Atlântida é frágil: a cada virada de rodada (da 3ª em diante; 2 casas na fase final) uma casa já emersa, sem construção
 * nem ninguém em cima e colada na água, desmorona e vira um buraco de mar. Assim o mar avança para dentro da ilha em
 * canais por onde o Polvo e o Leviatã chegam perto dos piratas.
 */
const crumble = (s: GameState, ev: GameEvent[]) => {
  if (s.round < 3) return;
  const n = s.castleTaken !== null ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const open = Object.values(s.cells).filter(
      (c) =>
        c.state === 'atlantis' && !c.temple && !c.sunk && !c.dome && c.floors === 0 && c.ring >= 2 &&
        !builderAt(s, c.hex) && !creatureAt(s, c.hex) && !(c.tile && CRUMBLE_KEEP.has(c.tile) && !c.taken) &&
        hexNeighbors(c.hex).some((nb) => isSea(s, nb)),
    );
    if (!open.length) return;
    const c = open[Math.floor(rand(s) * open.length)];
    c.sunk = true;
    c.tile = 'ruin';
    ev.push({ type: 'crumble', hex: c.hex });
  }
};

const endTurn = (s: GameState, ev: GameEvent[]) => {
  for (let i = 1; i <= s.playerCount; i++) {
    const next = (s.current + i) % s.playerCount;
    if (playerAlive(s, next)) {
      if (next <= s.current) {
        s.round += 1;
        crumble(s, ev);
        // fase final (ou virada da maré, a partir da rodada 2): a cada virada de rodada bate a onda avisada e já se avisa a próxima
        if (s.castleTaken !== null || (s.settings.tideShift && s.round >= 2)) {
          if (s.wave !== null && s.wave !== undefined) waveHit(s, s.wave, ev);
          s.wave = Math.floor(rand(s) * 6);
          ev.push({ type: 'waveWarning', side: s.wave });
        }
      }
      s.current = next;
      break;
    }
  }
  // final por fuga: a ilha some quando a vez volta a quem fugiu primeiro (última chamada) ou na rodada limite
  if (s.settings.ending === 'escape' && !s.vanished) {
    const lastCall = s.escape != null && s.current === s.escape.by;
    const late = s.settings.vanishRound > 0 && s.round > s.settings.vanishRound;
    if (lastCall || late) return vanishIsland(s, ev);
  }
  s.phase = 'action';
  s.turn += 1;
  s.actionsLeft = s.settings.actionsPerTurn;
  s.summonUsed = false;
  s.die = null;
};

/** A casa vira Atlântida (blocos somem, quem estava nela cai na água, salvo Escudo) e a peça de baixo é revelada. */
const flipCell = (s: GameState, h: Hex, ev: GameEvent[]) => {
  const c = cellAt(s, h)!;
  const here = s.builders.filter((b) => b.status === 'board' && b.hex && hexEquals(b.hex, h));
  const tile = c.tile as AtlantisTile;
  c.state = 'atlantis';
  c.dome = false;
  c.floors = tile === 'column' ? 1 : 0; // a Coluna já nasce com 1 andar
  for (const b of here) if (tile !== 'shield') dropIntoWater(s, b, ev);
  ev.push({ type: 'flood', hex: h, tile });
  const g = creatureOf(s, 'guardian');
  if (s.settings.guardian && !g.hex && !builderAt(s, h)) {
    g.hex = h;
    ev.push({ type: 'guardianAppears', hex: h });
  }
};

const resolveFlood = (s: GameState, h: Hex, ev: GameEvent[]) => {
  flipCell(s, h, ev);
  pendingEnd(s);
};

const pendingEnd = (s: GameState) => {
  s.pendingFlood = null;
  s.floodLeft -= 1; // o sorteio da próxima casa (ou o fim do terremoto) fica com autoFlood
};

/** O time fugiu: todos os piratas vivos dele já estão no navio. */
export const teamAboard = (s: GameState, p: number): boolean => {
  const mine = s.builders.filter((b) => b.owner === p && b.status !== 'dead');
  return mine.length > 0 && mine.every((b) => b.status === 'aboard');
};

/** Fatia da superfície que já virou Atlântida (0 a 1). Guia o céu (dia para noite) e a hora de o BOT fugir. */
export const islandProgress = (s: GameState): number => {
  const cells = Object.values(s.cells).filter((c) => !c.temple);
  return cells.length ? cells.filter((c) => c.state === 'atlantis').length / cells.length : 1;
};

/** Hora de levar o time para o navio: no jogo original, depois do cristal do Castelo; na fuga, com Atlântida já emersa. */
export const leavingTime = (s: GameState): boolean =>
  s.settings.ending === 'escape' ? s.escape != null || islandProgress(s) >= 0.75 : s.castleTaken !== null;

/** Quem fica boiando só leva metade do tesouro (arredondada para baixo): fugir vale, mas não mais que juntar muito. */
export const finalScore = (s: GameState, p: number): number => {
  const aboard = s.builders.some((b) => b.owner === p && b.status === 'aboard');
  return aboard ? s.crystals[p] : Math.floor(s.crystals[p] / 2);
};

/**
 * Final por fuga: a ilha some no mar. Quem ainda estava em terra ou de bote fica boiando. Vence quem tiver mais pontos:
 * cada time que fugiu conta todos os seus cristais; quem ficou boiando conta só metade. Empate: quem fugiu primeiro, depois quem estava no navio.
 */
const vanishIsland = (s: GameState, ev: GameEvent[]) => {
  const left = s.builders.filter((b) => b.status === 'board' || b.status === 'boat');
  for (const b of left) b.status = 'floating';
  s.vanished = true;
  ev.push({ type: 'islandVanishes', left: left.map((b) => b.id) });
  const order = Array.from({ length: s.playerCount }, (_, i) => i);
  const aboardNow = (p: number) => s.builders.some((b) => b.owner === p && b.status === 'aboard');
  const anyAboard = order.some(aboardNow);
  if (!anyAboard) {
    // ninguém fugiu: Nereu fica com o tesouro e ninguém vence
    s.winners = [];
    s.winReason = 'draw';
    s.phase = 'ended';
    ev.push({ type: 'gameOver', winners: s.winners, reason: s.winReason });
    return;
  }
  const points = (p: number) => (anyAboard ? finalScore(s, p) : s.crystals[p]);
  const best = Math.max(...order.map(points));
  const tied = order.filter((p) => points(p) === best);
  const winner = (s.escape != null && tied.includes(s.escape.by) ? s.escape.by : (tied.find(aboardNow) ?? tied[0]))!;
  s.winners = [winner];
  s.winReason = aboardNow(winner) ? 'ship' : 'crystals';
  s.phase = 'ended';
  ev.push({ type: 'gameOver', winners: s.winners, reason: s.winReason });
};

const finalize = (s: GameState, ev: GameEvent[], justPlayed: number) => {
  if (s.phase === 'ended' || s.phase === 'setup') return;
  const order = Array.from({ length: s.playerCount }, (_, i) => (justPlayed + i) % s.playerCount);
  s.templeEntry = null;
  const escapeMode = s.settings.ending === 'escape';
  if (escapeMode && s.escape == null) {
    const first = s.builders.find((b) => b.status === 'aboard');
    if (first) {
      s.escape = { by: first.owner };
      ev.push({ type: 'escapeStarted', by: first.owner });
    }
  }
  if (escapeMode && !s.builders.some(isAlive) && s.builders.some((b) => b.status === 'aboard')) {
    return vanishIsland(s, ev); // todo mundo já embarcou (ou saiu do jogo): a ilha some
  }
  const limit = s.settings.crystalsToWin;
  const rich = limit > 0 ? order.find((p) => s.crystals[p] >= limit) : undefined;
  // Regra (jogo original): a partida acaba quando o cristal do Castelo já foi pego e algum time está todo no navio.
  const fled = !escapeMode && s.castleTaken !== null ? order.filter((p) => teamAboard(s, p)) : [];
  const islandGone = !escapeMode && !Object.values(s.cells).some((c) => c.state === 'island' && !c.temple); // acabou o chão para afundar
  const nobodyLeft = !escapeMode && !s.builders.some(isAlive) && s.builders.some((b) => b.status === 'aboard'); // todo mundo já embarcou ou saiu do jogo
  if (fled.length || rich !== undefined || islandGone || nobodyLeft) {
    // vence quem tiver mais cristais; empate: quem fugiu no navio, depois quem jogou por último
    const best = Math.max(...s.crystals);
    const first = fled.find((p) => s.crystals[p] === best) ?? order.find((p) => s.crystals[p] === best)!;
    s.winners = [first];
    s.winReason = fled.includes(first) ? 'ship' : 'crystals';
  } else {
    const alive = order.filter((p) => playerAlive(s, p));
    if (alive.length > 1) return;
    s.winners = alive;
    s.winReason = alive.length === 1 ? 'last' : 'draw';
  }
  s.phase = 'ended';
  ev.push({ type: 'gameOver', winners: s.winners, reason: s.winReason });
};

const climbAboard = (s: GameState, b: Builder, ev: GameEvent[]) => {
  ev.push({ type: 'aboard', builderId: b.id, owner: b.owner, from: b.hex });
  b.status = 'aboard';
  b.hex = null;
  // a princesa está a salvo quando alguém do time que a resgatou chega ao navio: bônus grande
  if (s.princess && !s.princess.safe && s.princess.by === b.owner) {
    s.princess.safe = true;
    s.crystals[b.owner] += PRINCESS_BONUS;
    ev.push({ type: 'princessSafe', owner: b.owner, value: PRINCESS_BONUS });
  }
};

const execute = (s: GameState, a: Action, ev: GameEvent[]) => {
  switch (a.type) {
    case 'placeBuilder': {
      const b = s.builders.find((x) => x.owner === a.player && x.status === 'unplaced')!;
      b.hex = a.hex;
      b.status = 'board';
      ev.push({ type: 'placed', builderId: b.id, hex: a.hex });
      s.setupIndex += 1;
      if (s.setupIndex >= s.setupOrder.length) {
        s.phase = 'action';
        s.current = 0;
        s.actionsLeft = s.settings.actionsPerTurn;
      }
      return;
    }
    case 'move': {
      const b = s.builders.find((x) => x.id === a.builderId)!;
      b.hex = a.portalTo ?? a.to;
      s.actionsLeft -= 1;
      ev.push({ type: 'move', builderId: b.id, to: b.hex, portal: !!a.portalTo });
      enter(s, b, ev);
      sentinelCheck(s, b, ev);
      return;
    }
    case 'swim': {
      const b = s.builders.find((x) => x.id === a.builderId)!;
      s.actionsLeft -= 1;
      if (hexEquals(a.to, s.ships[a.player])) return climbAboard(s, b, ev);
      if (canJoinBoat(s, a.to, a.player)) {
        b.hex = a.to;
        b.status = 'boat'; // subiu no bote do companheiro
        ev.push({ type: 'launch', builderId: b.id, owner: b.owner, from: b.hex, to: a.to, join: true });
        return;
      }
      b.hex = a.to;
      if (!isSea(s, a.to)) {
        b.status = 'board';
        ev.push({ type: 'landed', builderId: b.id, to: a.to });
        enter(s, b, ev);
        sentinelCheck(s, b, ev);
      } else ev.push({ type: 'swim', builderId: b.id, to: a.to });
      return;
    }
    case 'build': {
      const c = cellAt(s, a.at)!;
      const blocks = s.fountain[a.player] ? 2 : 1; // Fonte: 2 blocos no próximo passo de construir
      s.fountain[a.player] = false;
      s.actionsLeft -= 1;
      for (let i = 0; i < blocks && canBuild(s, c); i++) {
        if (c.floors >= MAX_FLOORS) c.dome = true;
        else c.floors += 1;
      }
      ev.push({ type: 'build', builderId: a.builderId, hex: a.at, floors: c.floors, dome: c.dome });
      return;
    }
    case 'launch': {
      const b = s.builders.find((x) => x.id === a.builderId)!;
      s.actionsLeft -= 1;
      ev.push({ type: 'launch', builderId: b.id, owner: b.owner, from: b.hex, to: a.to, join: boatMates(s, a.to).length > 0 });
      b.hex = a.to;
      b.status = 'boat';
      return;
    }
    case 'row': {
      const b = s.builders.find((x) => x.id === a.builderId)!;
      s.actionsLeft -= 1;
      // o bote leva todo mundo que está nele
      const crew = boatMates(s, b.hex!);
      if (hexEquals(a.to, s.ships[a.player])) {
        crew.forEach((m) => climbAboard(s, m, ev));
        return;
      }
      if (!isSea(s, a.to)) {
        b.hex = a.to;
        b.status = 'board'; // encostou na praia: quem remou desce; o companheiro fica no bote
        ev.push({ type: 'landed', builderId: b.id, to: a.to });
        enter(s, b, ev);
        sentinelCheck(s, b, ev);
        return;
      }
      for (const m of crew) {
        m.hex = a.to;
        ev.push({ type: 'row', builderId: m.id, to: a.to });
      }
      return;
    }
    case 'dig': {
      const c = cellAt(s, a.at)!;
      const tile = c.tile as AtlantisTile;
      c.dug = true;
      if (tile === 'crystal' || tile === 'trident' || tile === 'calm') c.taken = true; // o tesouro sai da casa
      s.actionsLeft -= 1;
      ev.push({ type: 'dig', builderId: a.builderId, owner: a.player, hex: a.at, tile });
      if (tile === 'crystal') {
        s.crystals[a.player] += 1;
        c.tile = 'ruin'; // o cristal foi levado; sobra o buraco
        ev.push({ type: 'crystal', owner: a.player, hex: a.at });
      } else if (tile === 'trident') {
        s.tridents[a.player] += 1;
        c.tile = 'ruin';
        ev.push({ type: 'tridentTaken', owner: a.player, hex: a.at });
      } else if (tile === 'calm') {
        s.skipFlood += 1;
        c.tile = 'ruin';
        ev.push({ type: 'calmSea', owner: a.player, hex: a.at });
      }
      return;
    }
    case 'push': {
      const b = s.builders.find((x) => x.id === a.builderId)!;
      const t = s.builders.find((x) => x.id === a.targetId)!;
      const dest = pushDest(s, b.hex!, t)!;
      s.actionsLeft -= 1;
      ev.push({ type: 'push', targetId: t.id, from: t.hex, to: dest });
      t.hex = dest; // Regra: quem é empurrado não aciona o efeito da peça da casa nova.
      return;
    }
    case 'summon': {
      s.summonUsed = true;
      const st = s.settings;
      if (a.kind === 'triton') {
        s.crystals[a.player] -= st.tritonCost;
        const b = s.builders.find((x) => x.id === a.builderId)!;
        const t = s.builders.find((x) => x.id === a.targetId)!;
        const { to, falls } = tritonSlide(s, b.hex!, t, a.distance);
        ev.push({ type: 'summon', kind: 'triton', targetId: t.id, by: b.hex, from: t.hex, to, falls });
        t.hex = to;
        if (falls) t.status = 'floating';
      } else if (a.kind === 'dolphin') {
        s.crystals[a.player] -= st.dolphinCost;
        const b = s.builders.find((x) => x.id === a.builderId)!;
        ev.push({ type: 'summon', kind: 'dolphin', builderId: b.id, from: b.hex, to: a.to });
        b.hex = a.to;
        b.status = 'board';
        enter(s, b, ev);
      } else if (a.kind === 'siren') {
        s.crystals[a.player] -= st.sirenCost;
        const t = s.builders.find((x) => x.id === a.targetId)!;
        s.crystals[t.owner] -= 1;
        s.crystals[a.player] += 1;
        ev.push({ type: 'summon', kind: 'siren', by: s.builders.find((x) => x.id === a.builderId)!.hex, at: t.hex, from: t.owner, to: a.player });
      } else {
        s.crystals[a.player] -= st.colossusCost;
        cellAt(s, a.at)!.dome = true;
        ev.push({ type: 'summon', kind: 'colossus', hex: a.at });
      }
      return;
    }
    case 'endActions':
      startFlood(s, ev);
      return;
    case 'flood': {
      const responders = Array.from({ length: s.playerCount }, (_, i) => (s.current + i) % s.playerCount).filter((p) => s.tridents[p] > 0);
      if (responders.length) s.pendingFlood = { hex: a.hex, responders };
      else resolveFlood(s, a.hex, ev);
      return;
    }
    case 'useTrident': {
      s.tridents[a.player] -= 1;
      ev.push({ type: 'floodCancelled', by: a.player, hex: s.pendingFlood!.hex });
      pendingEnd(s);
      autoFlood(s, ev);
      return;
    }
    case 'passTrident': {
      s.pendingFlood!.responders.shift();
      if (!s.pendingFlood!.responders.length) {
        resolveFlood(s, s.pendingFlood!.hex, ev);
        autoFlood(s, ev);
      }
      return;
    }
    case 'rollDie': {
      let face = DIE_FACES[Math.floor(rand(s) * DIE_FACES.length)];
      if (face === 'guardian' && !s.settings.guardian) face = 'octopus'; // sem Sentinela, a face dela vira Polvo
      ev.push({ type: 'die', face });
      if (face === 'surge') {
        // Maré viva: todo construtor em casa de Atlântida ganha 1 cristal
        for (const b of s.builders) {
          if (b.status === 'board' && cellAt(s, b.hex!)?.state === 'atlantis') {
            s.crystals[b.owner] += 1;
            ev.push({ type: 'crystal', owner: b.owner, hex: b.hex, surge: true });
          }
        }
        endTurn(s, ev);
      } else if (!creatureOf(s, face).hex) {
        endTurn(s, ev); // o Guardião ainda não apareceu
      } else if (face === 'guardian') {
        // Sentinela: o dado a acorda contra o pirata mais perto, se houver alguém a até 2 casas; senão ela segue parada
        const g = creatureOf(s, 'guardian');
        const prey = s.builders
          .filter((b) => sentinelPrey(s, b) && hexDistance(g.hex!, b.hex!) <= SENTINEL_SENSE)
          .sort((x, y) => hexDistance(g.hex!, x.hex!) - hexDistance(g.hex!, y.hex!));
        if (prey.length) sentinelWake(s, prey[0], ev);
        else ev.push({ type: 'sentinelSleeps' });
        endTurn(s, ev);
      } else s.die = face;
      return;
    }
    case 'moveCreature': {
      const cr = creatureOf(s, a.creatureId);
      const from = cr.hex;
      cr.hex = a.to;
      ev.push({ type: 'creatureMove', creature: cr.type, from, to: a.to });
      if (a.target) {
        if (cr.type === 'leviathan' && a.target.includes(',')) {
          const c = s.cells[a.target];
          if (c.dome) c.dome = false;
          else c.floors -= 1; // quem estava nela cai um andar
          ev.push({ type: 'leviathanSmash', hex: c.hex, floors: c.floors });
        } else {
          const b = s.builders.find((x) => x.id === a.target)!;
          if (cr.type === 'octopus' || cr.type === 'leviathan') {
            ev.push({ type: cr.type === 'octopus' ? 'octopusGrab' : 'leviathanGrab', builderId: b.id });
            if (b.status === 'floating') tossFloater(s, b, ev);
            else if (b.status === 'boat') {
              // vira o bote: todos ficam boiando (o segundo náufrago vai para a água livre mais perto)
              const crew = boatMates(s, b.hex!);
              crew.forEach((m, i) => {
                m.status = 'floating';
                ev.push({ type: 'boatCapsized', builderId: m.id, owner: m.owner, hex: m.hex });
                if (i > 0) {
                  const w = nearestWater(s, m.hex!);
                  if (w) m.hex = w;
                }
              });
            } else dropIntoWater(s, b, ev);
          } else {
            const dest = pushDest(s, a.to, b)!;
            ev.push({ type: 'guardianPush', builderId: b.id, from: b.hex, to: dest });
            b.hex = dest;
          }
        }
      }
      if (cr.type === 'leviathan') {
        // empurra 1 casa os náufragos vizinhos (para água livre)
        for (const nb of hexNeighbors(a.to)) {
          const f = builderAt(s, nb);
          if (!f || (f.status !== 'floating' && f.status !== 'boat')) continue;
          const dest = hexAdd(nb, dirOf(a.to, nb));
          if (waterFree(s, dest)) {
            const group = f.status === 'boat' ? boatMates(s, nb) : [f]; // o bote vai inteiro
            for (const m of group) {
              ev.push({ type: 'leviathanPush', builderId: m.id, from: nb, to: dest });
              m.hex = dest;
            }
          }
        }
      }
      endTurn(s, ev);
      return;
    }
  }
};

/* ---------- API pública ---------- */

/** Forma canônica (chaves em ordem) para comparar jogadas vindas da rede. */
const canon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, x]) => [k, canon(x)]),
    );
  }
  return v;
};
export const actionKey = (a: Action): string => JSON.stringify(canon(a));

/** Executa sem conferir (o chamador garante que a jogada é legal). Usado pelo bot para simular. */
export const applyTrusted = (state: GameState, action: Action): { state: GameState; events: GameEvent[] } => {
  const s = structuredClone(state);
  const events: GameEvent[] = [];
  execute(s, action, events);
  finalize(s, events, action.player);
  return { state: s, events };
};

export const applyAction = (state: GameState, action: Action): ActionResult => {
  if (state.phase === 'ended') return { ok: false, error: 'A partida já terminou.' };
  if (action.player !== actor(state)) return { ok: false, error: 'Não é a vez desse jogador.' };
  const key = actionKey(action);
  const legal = legalActions(state).find((l) => actionKey(l) === key);
  if (!legal) return { ok: false, error: 'Jogada não permitida agora.' };
  return { ok: true, ...applyTrusted(state, legal) };
};
