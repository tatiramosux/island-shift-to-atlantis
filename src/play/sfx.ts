/**
 * Sons de 8 bits gerados na hora pelo navegador (Web Audio): ondas quadradas, triangulares e ruído, como os
 * videogames antigos. Nenhum arquivo de áudio é baixado, então não há licença nem peso extra.
 *
 * Cada som é uma sequência curta de notas. `play(nome)` toca; `setMuted` liga e desliga (fica salvo no aparelho).
 */

type Wave = OscillatorType | 'noise';
/** Uma nota: frequência (Hz, ou fim de um deslize), duração (s), onda, volume e atraso desde o começo do som. */
interface Note {
  f: number;
  to?: number;
  d: number;
  w?: Wave;
  v?: number;
  at?: number;
}

const NOTE = (n: string): number => {
  // nome da nota (ex.: "C5", "F#4") para frequência
  const m = /^([A-G])(#?)(\d)$/.exec(n)!;
  const semis: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const k = semis[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, k / 12);
};
/** Notas em sequência (arpejo): cada uma começa quando a anterior acaba. */
const seq = (names: string[], d: number, w: Wave = 'square', v = 0.5, gap = 0): Note[] =>
  names.map((n, i) => ({ f: NOTE(n), d, w, v, at: i * (d + gap) }));

const SOUNDS: Record<string, Note[]> = {
  // pirata anda: dois passinhos
  move: [{ f: 520, d: 0.05, w: 'square', v: 0.35 }, { f: 700, d: 0.05, w: 'square', v: 0.3, at: 0.07 }],
  // descobrir: raspar de pá (ruído) e um "tim" de descoberta
  dig: [{ f: 900, d: 0.09, w: 'noise', v: 0.35 }, { f: 700, d: 0.08, w: 'noise', v: 0.3, at: 0.12 }, { f: NOTE('E5'), d: 0.12, w: 'triangle', v: 0.5, at: 0.24 }],
  // construir: duas marteladas
  build: [{ f: 140, to: 70, d: 0.08, w: 'square', v: 0.55 }, { f: 160, to: 80, d: 0.08, w: 'square', v: 0.5, at: 0.13 }],
  push: [{ f: 300, to: 120, d: 0.14, w: 'square', v: 0.5 }],
  // na água: bolhas
  swim: [{ f: 300, to: 600, d: 0.08, w: 'triangle', v: 0.5 }, { f: 380, to: 760, d: 0.07, w: 'triangle', v: 0.4, at: 0.09 }],
  row: [{ f: 240, to: 420, d: 0.09, w: 'triangle', v: 0.5 }, { f: 260, to: 460, d: 0.09, w: 'triangle', v: 0.45, at: 0.16 }],
  launch: [{ f: 600, d: 0.12, w: 'noise', v: 0.3 }, ...seq(['C4', 'G4'], 0.08, 'triangle', 0.5).map((n) => ({ ...n, at: (n.at ?? 0) + 0.1 }))],
  // subiu no navio: fanfarra curta
  aboard: seq(['C5', 'E5', 'G5', 'C6'], 0.09, 'square', 0.4),
  // tesouros
  crystal: seq(['E5', 'G#5', 'B5', 'E6'], 0.06, 'square', 0.35),
  trident: seq(['G4', 'D5', 'G5'], 0.08, 'triangle', 0.55),
  calm: seq(['C5', 'A4', 'F4'], 0.12, 'triangle', 0.5),
  castle: [...seq(['C5', 'E5', 'G5', 'C6', 'G5', 'C6'], 0.09, 'square', 0.4), { f: NOTE('C6'), d: 0.35, w: 'triangle', v: 0.4, at: 0.56 }],
  // terremoto: ronco grave
  quake: [{ f: 70, to: 40, d: 0.5, w: 'square', v: 0.35 }, { f: 400, d: 0.45, w: 'noise', v: 0.35 }],
  flood: [{ f: 500, to: 120, d: 0.25, w: 'noise', v: 0.4 }, { f: 180, to: 60, d: 0.25, w: 'triangle', v: 0.5 }],
  splash: [{ f: 1200, to: 300, d: 0.22, w: 'noise', v: 0.45 }],
  // onda gigante: rugido de água subindo e caindo; aviso: dois toques de sino de navio
  wave: [{ f: 300, to: 1800, d: 0.5, w: 'noise', v: 0.5 }, { f: 1800, to: 200, d: 0.6, w: 'noise', v: 0.45, at: 0.45 }, { f: 90, to: 50, d: 0.7, w: 'square', v: 0.3, at: 0.3 }],
  waveWarning: [{ f: 880, d: 0.25, w: 'triangle', v: 0.45 }, { f: 880, d: 0.35, w: 'triangle', v: 0.4, at: 0.3 }],
  eliminated: seq(['G4', 'E4', 'C4', 'G3'], 0.11, 'square', 0.4),
  // dado: tique enquanto gira e acorde quando para
  tick: [{ f: 1400, d: 0.025, w: 'square', v: 0.2 }],
  dieLand: [{ f: NOTE('C5'), d: 0.18, w: 'square', v: 0.3 }, { f: NOTE('G5'), d: 0.18, w: 'square', v: 0.25 }],
  // criaturas
  creature: [{ f: 110, to: 160, d: 0.18, w: 'square', v: 0.35 }, { f: 90, to: 130, d: 0.18, w: 'square', v: 0.3, at: 0.2 }],
  grab: [{ f: 400, to: 90, d: 0.3, w: 'square', v: 0.45 }],
  smash: [{ f: 120, to: 40, d: 0.2, w: 'square', v: 0.55 }, { f: 300, d: 0.18, w: 'noise', v: 0.4 }],
  // convocação: brilho mágico subindo
  summon: [{ f: 300, to: 1600, d: 0.35, w: 'triangle', v: 0.45 }, ...seq(['C6', 'E6', 'G6'], 0.05, 'square', 0.2).map((n) => ({ ...n, at: (n.at ?? 0) + 0.25 }))],
  win: [...seq(['C5', 'C5', 'C5', 'E5', 'G5', 'E5', 'G5'], 0.12, 'square', 0.4, 0.02), { f: NOTE('C6'), d: 0.5, w: 'square', v: 0.4, at: 0.98 }],
  lose: seq(['E4', 'D#4', 'D4', 'C#4'], 0.2, 'square', 0.35, 0.04),
  turn: [{ f: NOTE('A5'), d: 0.07, w: 'triangle', v: 0.4 }, { f: NOTE('D6'), d: 0.1, w: 'triangle', v: 0.4, at: 0.08 }],
  error: [{ f: 160, d: 0.12, w: 'square', v: 0.35 }],
};
export type SoundName = keyof typeof SOUNDS;

const KEY = 'atlantida.som';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
})();

const audio = (): AudioContext | null => {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18; // volume geral baixo: os sons acompanham, não incomodam
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

/** Os navegadores só liberam som depois de um toque: o primeiro toque na tela já prepara o áudio. */
export const unlockAudio = () => {
  const go = () => {
    audio();
    startMusic();
    removeEventListener('pointerdown', go);
    removeEventListener('keydown', go);
  };
  addEventListener('pointerdown', go);
  addEventListener('keydown', go);
};

export const isMuted = () => muted;
export const setMuted = (m: boolean) => {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? 'off' : 'on');
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  if (m) {
    void ctx?.suspend();
    stopMusic();
  } else {
    audio();
    startMusic();
  }
};

export const play = (name: SoundName) => {
  const ac = audio();
  if (!ac || !master || ac.state !== 'running') return;
  const t0 = ac.currentTime + 0.01;
  for (const n of SOUNDS[name]) {
    const start = t0 + (n.at ?? 0);
    const end = start + n.d;
    const g = ac.createGain();
    const v = n.v ?? 0.5;
    // envelope curtinho: sobe rápido e cai até o fim da nota (sem estalo)
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(v, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(master);
    if (n.w === 'noise') {
      const src = ac.createBufferSource();
      src.buffer = noise;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(n.f, start);
      if (n.to) bp.frequency.exponentialRampToValueAtTime(n.to, end);
      src.connect(bp).connect(g);
      src.start(start);
      src.stop(end + 0.02);
    } else {
      const o = ac.createOscillator();
      o.type = n.w ?? 'square';
      o.frequency.setValueAtTime(n.f, start);
      if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, end);
      o.connect(g);
      o.start(start);
      o.stop(end + 0.02);
    }
  }
};

/* ---------- música de fundo: uma cantiga de marinheiro em 8 bits, original, tocando em loop ---------- */

const MUSIC_KEY = 'atlantida.musica';
let musicOn = (() => {
  try {
    return localStorage.getItem(MUSIC_KEY) !== 'off';
  } catch {
    return true;
  }
})();
let musicGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextStep = 0;
let nextTime = 0;

// cada passo é uma colcheia; 8 compassos de 8 passos, em lá menor ('-' = pausa)
const MELODY = [
  'A4', '-', 'C5', 'E5', 'D5', 'C5', 'B4', '-',
  'G4', '-', 'B4', 'D5', 'C5', 'B4', 'A4', '-',
  'A4', '-', 'C5', 'E5', 'G5', 'E5', 'D5', 'C5',
  'B4', 'G4', 'B4', 'D5', 'E5', '-', '-', '-',
  'F5', '-', 'E5', 'D5', 'C5', '-', 'A4', '-',
  'G4', '-', 'B4', 'D5', 'C5', 'B4', 'A4', 'G4',
  'A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'D5', 'B4',
  'A4', '-', 'E4', '-', 'A4', '-', '-', '-',
];
// baixo: fundamental e quinta de cada compasso (Am G Am G F G Am E)
const BASS: [string, string][] = [['A2', 'E3'], ['G2', 'D3'], ['A2', 'E3'], ['G2', 'D3'], ['F2', 'C3'], ['G2', 'D3'], ['A2', 'E3'], ['E2', 'B2']];
const STEP = 60 / 132 / 2; // colcheia a 132 batidas por minuto

const tone = (ac: AudioContext, dest: AudioNode, f: number, start: number, d: number, w: Wave, v: number) => {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(v, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + d);
  g.connect(dest);
  if (w === 'noise') {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = f;
    src.connect(hp).connect(g);
    src.start(start);
    src.stop(start + d + 0.02);
  } else {
    const o = ac.createOscillator();
    o.type = w;
    o.frequency.value = f;
    o.connect(g);
    o.start(start);
    o.stop(start + d + 0.02);
  }
};

const scheduleMusic = () => {
  const ac = ctx;
  if (!ac || !musicGain || ac.state !== 'running') return;
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + 0.25) {
    const i = nextStep % MELODY.length;
    const bar = Math.floor(i / 8);
    const beat = i % 8;
    const m = MELODY[i];
    if (m !== '-') {
      // a nota dura até a próxima (pausas seguram a anterior um pouco)
      let len = 1;
      while (len < 3 && MELODY[(i + len) % MELODY.length] === '-') len++;
      tone(ac, musicGain, NOTE(m), nextTime, STEP * len * 0.9, 'square', 0.22);
    }
    if (beat % 2 === 0) tone(ac, musicGain, NOTE(BASS[bar][beat % 4 === 0 ? 0 : 1]), nextTime, STEP * 1.8, 'triangle', 0.5);
    tone(ac, musicGain, 7000, nextTime, beat % 4 === 2 ? 0.06 : 0.02, 'noise', beat % 4 === 2 ? 0.18 : 0.07); // chocalho
    nextTime += STEP;
    nextStep++;
  }
};

const startMusic = () => {
  if (!musicOn || musicTimer) return;
  const ac = audio();
  if (!ac) return;
  if (!musicGain) {
    musicGain = ac.createGain();
    musicGain.gain.value = 0.06; // bem baixinha, por trás dos efeitos
    musicGain.connect(ac.destination);
  }
  nextTime = 0;
  musicTimer = setInterval(scheduleMusic, 60);
};
const stopMusic = () => {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
};

export const isMusicOn = () => musicOn;
export const setMusicOn = (on: boolean) => {
  musicOn = on;
  try {
    localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  if (on) startMusic();
  else stopMusic();
};
