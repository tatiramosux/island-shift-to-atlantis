/** Gerador pseudoaleatório determinístico (mulberry32). O estado vive no GameState para o jogo ser reproduzível. */

export const nextRandom = (state: number): [value: number, nextState: number] => {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
};

export class Rng {
  constructor(public state: number) {}
  next(): number {
    const [v, s] = nextRandom(this.state);
    this.state = s;
    return v;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
