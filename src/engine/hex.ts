/**
 * Grade hexagonal em coordenadas axiais (q, r). TypeScript puro: sem three.js, sem DOM.
 * Orientação "pointy-top" (ponta para cima). Referência: redblobgames.com/grids/hexagons
 *
 * Vizinhos, na ordem horária começando pelo leste: E, SE, SW, W, NW, NE
 * (SE/SW/NW/NE em relação à tela, com r crescendo para baixo).
 */

export interface Hex {
  readonly q: number;
  readonly r: number;
}

export const hex = (q: number, r: number): Hex => ({ q, r });

export const DIRECTIONS: readonly Hex[] = [
  hex(1, 0), // E
  hex(0, 1), // SE
  hex(-1, 1), // SW
  hex(-1, 0), // W
  hex(0, -1), // NW
  hex(1, -1), // NE
];

export const hexKey = (h: Hex): string => `${h.q},${h.r}`;

export const parseHexKey = (key: string): Hex => {
  const [q, r] = key.split(',').map(Number);
  return hex(q, r);
};

export const hexEquals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const hexAdd = (a: Hex, b: Hex): Hex => hex(a.q + b.q, a.r + b.r);

export const hexSubtract = (a: Hex, b: Hex): Hex => hex(a.q - b.q, a.r - b.r);

export const hexScale = (a: Hex, k: number): Hex => hex(a.q * k, a.r * k);

export const hexNeighbor = (h: Hex, dir: number): Hex => hexAdd(h, DIRECTIONS[((dir % 6) + 6) % 6]);

export const hexNeighbors = (h: Hex): Hex[] => DIRECTIONS.map((d) => hexAdd(h, d));

/** Número de passos entre duas casas, ignorando obstáculos. */
export const hexDistance = (a: Hex, b: Hex): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};

/** Anel: todas as casas a exatamente `radius` passos de `center`. radius 0 devolve só o centro. */
export const hexRing = (center: Hex, radius: number): Hex[] => {
  if (radius === 0) return [center];
  const results: Hex[] = [];
  // começa no canto "sudoeste" do anel e dá a volta
  let cur = hexAdd(center, hexScale(DIRECTIONS[4], radius));
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push(cur);
      cur = hexNeighbor(cur, side);
    }
  }
  return results;
};

/** Disco: todas as casas a até `radius` passos de `center`, do centro para fora. */
export const hexDisk = (center: Hex, radius: number): Hex[] => {
  const results: Hex[] = [];
  for (let k = 0; k <= radius; k++) results.push(...hexRing(center, k));
  return results;
};

/** Rotaciona `h` em torno de `center`, em múltiplos de 60° no sentido horário (em tela). */
export const hexRotate = (h: Hex, center: Hex, steps: number): Hex => {
  let d = hexSubtract(h, center);
  const n = ((steps % 6) + 6) % 6;
  for (let i = 0; i < n; i++) d = hex(-d.r, d.q + d.r);
  return hexAdd(center, d);
};

/** Linha reta entre duas casas (inclui as pontas). */
export const hexLine = (a: Hex, b: Hex): Hex[] => {
  const n = hexDistance(a, b);
  if (n === 0) return [a];
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // pequeno desvio evita empate exato em arestas
    out.push(hexRound(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6));
  }
  return out;
};

/** Arredonda coordenadas fracionárias para a casa mais próxima. */
export const hexRound = (fq: number, fr: number): Hex => {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return hex(q === 0 ? 0 : q, r === 0 ? 0 : r); // evita -0
};

/* ---------- Conversão para o plano do mundo (x, z) ---------- */

const SQRT3 = Math.sqrt(3);

/** Centro da casa no plano do mundo. `size` = raio do hexágono (centro até a ponta). */
export const hexToWorld = (h: Hex, size = 1): { x: number; z: number } => ({
  x: size * SQRT3 * (h.q + h.r / 2),
  z: size * 1.5 * h.r,
});

/** Casa que contém o ponto (x, z) do mundo. */
export const worldToHex = (x: number, z: number, size = 1): Hex => {
  const q = ((SQRT3 / 3) * x - (1 / 3) * z) / size;
  const r = ((2 / 3) * z) / size;
  return hexRound(q, r);
};

/* ---------- Caminhos ---------- */

export interface PathOptions {
  /** Casa pela qual se pode passar? Padrão: qualquer uma. */
  passable?: (h: Hex) => boolean;
  /** Limite de passos (opcional). */
  maxSteps?: number;
}

/** Menor caminho (BFS; todo passo custa 1). Devolve de `from` até `to`, incluindo ambas, ou null. */
export const hexPath = (from: Hex, to: Hex, opts: PathOptions = {}): Hex[] | null => {
  const { passable = () => true, maxSteps = Infinity } = opts;
  if (hexEquals(from, to)) return [from];
  if (!passable(to)) return null;
  const cameFrom = new Map<string, Hex | null>([[hexKey(from), null]]);
  const dist = new Map<string, number>([[hexKey(from), 0]]);
  let frontier: Hex[] = [from];
  while (frontier.length) {
    const next: Hex[] = [];
    for (const cur of frontier) {
      const d = dist.get(hexKey(cur))!;
      if (d >= maxSteps) continue;
      for (const nb of hexNeighbors(cur)) {
        const k = hexKey(nb);
        if (cameFrom.has(k) || !passable(nb)) continue;
        cameFrom.set(k, cur);
        dist.set(k, d + 1);
        if (hexEquals(nb, to)) {
          const path: Hex[] = [nb];
          let back = cur as Hex | null;
          while (back) {
            path.push(back);
            back = cameFrom.get(hexKey(back)) ?? null;
          }
          return path.reverse();
        }
        next.push(nb);
      }
    }
    frontier = next;
  }
  return null;
};

/** Todas as casas alcançáveis em até `steps` passos (inclui a de origem), com a distância de cada uma. */
export const hexReachable = (
  from: Hex,
  steps: number,
  passable: (h: Hex) => boolean = () => true,
): Map<string, number> => {
  const dist = new Map<string, number>([[hexKey(from), 0]]);
  let frontier: Hex[] = [from];
  for (let d = 1; d <= steps; d++) {
    const next: Hex[] = [];
    for (const cur of frontier) {
      for (const nb of hexNeighbors(cur)) {
        const k = hexKey(nb);
        if (dist.has(k) || !passable(nb)) continue;
        dist.set(k, d);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return dist;
};
