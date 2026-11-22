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
  // pulinho do tesouro saindo da casa (a melodia de cada tesouro vem logo depois)
  loot: [{ f: 520, to: 1040, d: 0.08, w: 'square', v: 0.3 }],
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
  // arroto: grave, rouco e meio desafinado
  burp: [{ f: 150, to: 65, d: 0.45, w: 'sawtooth', v: 0.5 }, { f: 118, to: 55, d: 0.4, w: 'square', v: 0.35, at: 0.04 }, { f: 300, d: 0.35, w: 'noise', v: 0.12, at: 0.02 }],
  grab: [{ f: 400, to: 90, d: 0.3, w: 'square', v: 0.45 }],
  smash: [{ f: 120, to: 40, d: 0.2, w: 'square', v: 0.55 }, { f: 300, d: 0.18, w: 'noise', v: 0.4 }],
  // convocação: brilho mágico subindo
  summon: [{ f: 300, to: 1600, d: 0.35, w: 'triangle', v: 0.45 }, ...seq(['C6', 'E6', 'G6'], 0.05, 'square', 0.2).map((n) => ({ ...n, at: (n.at ?? 0) + 0.25 }))],
  // vitória: fanfarra animada de pirata (subindo, ritmo saltitante, final longo)
  win: [
    ...seq(['G4', 'C5', 'E5', 'G5'], 0.1, 'square', 0.4, 0.02),
    ...seq(['E5', 'G5', 'C6'], 0.14, 'square', 0.4, 0.02).map((n) => ({ ...n, at: (n.at ?? 0) + 0.52 })),
    ...seq(['D6', 'C6', 'D6', 'E6'], 0.11, 'square', 0.4, 0.02).map((n) => ({ ...n, at: (n.at ?? 0) + 1.04 })),
    { f: NOTE('G6'), d: 0.7, w: 'square', v: 0.4, at: 1.6 },
    { f: NOTE('C5'), d: 0.7, w: 'triangle', v: 0.5, at: 1.6 },
    { f: NOTE('E5'), d: 0.7, w: 'triangle', v: 0.4, at: 1.6 },
  ],
  // derrota: quatro notas tristes descendo e um "uóóó" final arrastado
  lose: [
    ...seq(['E4', 'D#4', 'D4', 'C#4'], 0.28, 'square', 0.35, 0.05),
    { f: NOTE('C4'), to: NOTE('G3'), d: 0.9, w: 'triangle', v: 0.5, at: 1.35 },
    { f: NOTE('C5'), to: NOTE('F4'), d: 0.9, w: 'square', v: 0.25, at: 1.35 },
  ],
  turn: [{ f: NOTE('A5'), d: 0.07, w: 'triangle', v: 0.4 }, { f: NOTE('D6'), d: 0.1, w: 'triangle', v: 0.4, at: 0.08 }],
  error: [{ f: 160, d: 0.12, w: 'square', v: 0.35 }],
  // a ilha afunda (3,4 s): ronco grave, estalos de rachadura, mar subindo, borbulhas e o glub final
  sink: [
    { f: 62, to: 28, d: 3.3, w: 'square', v: 0.32 },
    { f: 220, to: 70, d: 3.0, w: 'noise', v: 0.3 },
    ...[0.05, 0.3, 0.55, 0.8, 1.05, 1.3, 1.6, 1.9].map((at, i) => ({ f: 700 + (i % 3) * 400, to: 120, d: 0.09, w: 'noise' as Wave, v: 0.5, at })),
    { f: 300, to: 1600, d: 1.1, w: 'noise', v: 0.4, at: 1.0 },
    { f: 1600, to: 180, d: 1.3, w: 'noise', v: 0.45, at: 2.0 },
    ...[2.3, 2.45, 2.62, 2.8, 2.95].map((at, i) => ({ f: 260 + i * 70, to: 700 + i * 110, d: 0.08, w: 'triangle' as Wave, v: 0.45, at })),
    { f: 180, to: 45, d: 0.55, w: 'triangle', v: 0.6, at: 3.0 },
  ],
  // Polvo: o tentáculo estica (estalo molhado), aperta o pirata e arremessa
  tentacle: [{ f: 300, to: 900, d: 0.45, w: 'noise', v: 0.35 }, { f: 110, to: 260, d: 0.4, w: 'square', v: 0.25 }, { f: 160, to: 340, d: 0.3, w: 'triangle', v: 0.3, at: 0.1 }],
  squeeze: [{ f: 220, to: 120, d: 0.12, w: 'square', v: 0.4 }, { f: 200, to: 110, d: 0.12, w: 'square', v: 0.4, at: 0.14 }, { f: 600, to: 300, d: 0.25, w: 'noise', v: 0.25 }],
  whoosh: [{ f: 400, to: 2400, d: 0.35, w: 'noise', v: 0.45 }, { f: 500, to: 900, d: 0.3, w: 'triangle', v: 0.25 }],
  // Leviatã: rugido, a cauda corta o ar e agarra
  roar: [{ f: 70, to: 150, d: 0.25, w: 'square', v: 0.4 }, { f: 150, to: 60, d: 0.45, w: 'square', v: 0.4, at: 0.22 }, { f: 500, to: 200, d: 0.6, w: 'noise', v: 0.3 }],
  tailWhip: [{ f: 90, to: 45, d: 0.5, w: 'square', v: 0.4 }, { f: 250, to: 1200, d: 0.35, w: 'noise', v: 0.4 }, { f: 700, to: 140, d: 0.25, w: 'square', v: 0.25, at: 0.3 }],
  bigSplash: [
    { f: 1400, to: 200, d: 0.5, w: 'noise', v: 0.55 },
    { f: 200, to: 60, d: 0.35, w: 'triangle', v: 0.6 },
    ...[0.2, 0.32, 0.45].map((at, i) => ({ f: 280 + i * 90, to: 700 + i * 120, d: 0.08, w: 'triangle' as Wave, v: 0.4, at })),
  ],
  // a princesa pede socorro: "he-e-elp!", voz aguda que sobe duas vezes e sobe de novo, esganiçada
  help: [
    { f: 620, to: 980, d: 0.16, w: 'square', v: 0.28 },
    { f: 760, to: 1240, d: 0.22, w: 'triangle', v: 0.32, at: 0.14 },
    { f: 980, to: 1500, d: 0.34, w: 'square', v: 0.26, at: 0.34 },
    { f: 1500, to: 1100, d: 0.25, w: 'triangle', v: 0.25, at: 0.62 },
  ],
  // Nereu ruge ao surgir do mar: "Ahrrrr!" grave, longo, com estrondo de água
  nereus: [
    { f: 150, to: 70, d: 1.7, w: 'square', v: 0.5 },
    { f: 105, to: 55, d: 2.0, w: 'triangle', v: 0.6, at: 0.05 },
    { f: 360, to: 130, d: 1.5, w: 'noise', v: 0.4 },
    { f: 460, to: 210, d: 1.0, w: 'square', v: 0.22, at: 0.12 },
    { f: 80, to: 40, d: 1.2, w: 'square', v: 0.4, at: 0.9 },
  ],
  // uma casa de Atlântida desmorona: estrondo grave e água
  crumble: [{ f: 90, to: 40, d: 0.6, w: 'square', v: 0.45 }, { f: 700, to: 150, d: 0.5, w: 'noise', v: 0.4 }, { f: 220, to: 60, d: 0.4, w: 'triangle', v: 0.5, at: 0.15 }],
  // grito de quem é agarrado e jogado: agudo subindo e caindo, duas vezes
  scream: [
    { f: 700, to: 1500, d: 0.35, w: 'square', v: 0.3 },
    { f: 1500, to: 500, d: 0.5, w: 'square', v: 0.3, at: 0.35 },
    { f: 900, to: 1700, d: 0.3, w: 'triangle', v: 0.3, at: 0.1 },
  ],
  // o fim se aproxima: sirene subindo e três pancadas
  climax: [
    { f: 200, to: 3200, d: 1.4, w: 'noise', v: 0.4 },
    { f: 110, to: 440, d: 1.4, w: 'square', v: 0.25 },
    ...[1.3, 1.5, 1.7].map((at) => ({ f: 120, to: 45, d: 0.2, w: 'square' as Wave, v: 0.55, at })),
  ],
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

/** Vibração do aparelho (onde o navegador permite, como no Android): cada ação tem o seu toque; liga e desliga à parte do som. */
const BUZZ: Partial<Record<SoundName, number | number[]>> = {
  move: 12, build: [20, 30, 20], push: 40, swim: 15, row: 20, launch: 30, castle: [60, 40, 60, 40, 140],
  quake: [80, 40, 80, 40, 80], flood: [40, 30, 40], splash: 35, wave: [120, 50, 120], waveWarning: [60, 80, 60],
  dieLand: 30, creature: 25, grab: 40, smash: [90, 40, 120], summon: [30, 30, 60], win: [80, 50, 80, 50, 200], turn: 15,
  error: [30, 40, 30], crumble: [90, 40, 120], help: [30, 30, 30, 30, 60], nereus: [250, 80, 250, 80, 450], sink: [150, 60, 150, 60, 250], tentacle: [30, 20, 50], squeeze: [70, 30, 70], whoosh: 25,
  roar: [120, 40, 160], tailWhip: [40, 20, 60], bigSplash: [60, 30, 140], scream: [30, 20, 30, 20, 30], climax: [200, 80, 200, 80, 200],
};
const VIBE_KEY = 'atlantida.vibracao';
let vibeOn = (() => {
  try {
    return localStorage.getItem(VIBE_KEY) !== 'off';
  } catch {
    return true;
  }
})();
export const isVibeOn = () => vibeOn;
export const setVibeOn = (on: boolean) => {
  vibeOn = on;
  try {
    localStorage.setItem(VIBE_KEY, on ? 'on' : 'off');
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  if (on) buzz('push'); // um toque de teste
};
const buzz = (name: SoundName) => {
  try {
    if (vibeOn && typeof navigator !== 'undefined' && 'vibrate' in navigator && BUZZ[name]) navigator.vibrate(BUZZ[name]!);
  } catch {
    /* sem vibração neste aparelho */
  }
};

export const play = (name: SoundName) => {
  buzz(name);
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

/** Uma faixa: 8 compassos de 8 passos (colcheias). '-' = pausa. `bass` = nota de cada compasso. */
interface Track {
  melody: string[];
  bass: string[][];
  step: number; // duração de um passo (s)
  gain: number;
  drums: boolean;
}
const TRACKS: Record<'calm' | 'climax', Track> = {
  // cantiga de marinheiro em lá menor; baixo: fundamental e quinta de cada compasso (Am G Am G F G Am E)
  calm: {
    melody: [
      'A4', '-', 'C5', 'E5', 'D5', 'C5', 'B4', '-',
      'G4', '-', 'B4', 'D5', 'C5', 'B4', 'A4', '-',
      'A4', '-', 'C5', 'E5', 'G5', 'E5', 'D5', 'C5',
      'B4', 'G4', 'B4', 'D5', 'E5', '-', '-', '-',
      'F5', '-', 'E5', 'D5', 'C5', '-', 'A4', '-',
      'G4', '-', 'B4', 'D5', 'C5', 'B4', 'A4', 'G4',
      'A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'D5', 'B4',
      'A4', '-', 'E4', '-', 'A4', '-', '-', '-',
    ],
    bass: [['A2', 'E3'], ['G2', 'D3'], ['A2', 'E3'], ['G2', 'D3'], ['F2', 'C3'], ['G2', 'D3'], ['A2', 'E3'], ['E2', 'B2']],
    step: 60 / 132 / 2,
    gain: 0.06,
    drums: false,
  },
  // clímax (reta final): mais rápida, baixo pulsando em colcheias, arpejos agudos e bateria (Am F C G Am F E E)
  climax: {
    melody: [
      'A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'C5', 'E5',
      'F4', 'A4', 'C5', 'F5', 'E5', 'C5', 'A4', 'C5',
      'E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'D5', 'C5',
      'B4', 'D5', 'G5', 'B5', 'A5', 'G5', 'D5', 'B4',
      'A4', 'C5', 'E5', 'A5', 'C6', 'A5', 'E5', 'C5',
      'F5', 'A5', 'C6', 'A5', 'F5', 'A5', 'C6', 'F6',
      'E5', 'G#5', 'B5', 'E6', 'B5', 'G#5', 'B5', 'E6',
      'E5', 'G#5', 'B5', 'E6', 'D6', 'B5', 'G#5', 'E5',
    ],
    bass: [['A2'], ['F2'], ['C3'], ['G2'], ['A2'], ['F2'], ['E2'], ['E2']],
    step: 60 / 156 / 2,
    gain: 0.085,
    drums: true,
  },
};
let track: Track = TRACKS.calm;
let climaxOn = false;

const tone = (ac: AudioContext, dest: AudioNode, f: number, start: number, d: number, w: Wave, v: number, to?: number) => {
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
    o.frequency.setValueAtTime(f, start);
    if (to) o.frequency.exponentialRampToValueAtTime(to, start + d);
    o.connect(g);
    o.start(start);
    o.stop(start + d + 0.02);
  }
};

const scheduleMusic = () => {
  const ac = ctx;
  if (!ac || !musicGain || ac.state !== 'running') return;
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
  const { melody, bass, step, drums } = track;
  while (nextTime < ac.currentTime + 0.25) {
    const i = nextStep % melody.length;
    const bar = Math.floor(i / 8);
    const beat = i % 8;
    const m = melody[i];
    if (m !== '-') {
      // a nota dura até a próxima (pausas seguram a anterior um pouco)
      let len = 1;
      while (len < 3 && melody[(i + len) % melody.length] === '-') len++;
      tone(ac, musicGain, NOTE(m), nextTime, step * len * 0.9, 'square', drums ? 0.2 : 0.22);
      if (drums) tone(ac, musicGain, NOTE(m) / 2, nextTime, step * 0.9, 'square', 0.08); // oitava abaixo: soa mais cheio
    }
    if (drums) {
      const root = NOTE(bass[bar][0]);
      tone(ac, musicGain, beat % 2 ? root * 2 : root, nextTime, step * 0.85, 'triangle', beat % 2 ? 0.32 : 0.55); // baixo pulsando
      if (beat % 4 === 0) tone(ac, musicGain, 150, nextTime, 0.14, 'triangle', 0.7, 45); // bumbo
      if (beat % 4 === 2) tone(ac, musicGain, 1800, nextTime, 0.1, 'noise', 0.32); // caixa
      tone(ac, musicGain, 7500, nextTime, 0.025, 'noise', beat % 2 ? 0.1 : 0.16); // chimbal
      // sinal de alarme: dois apitos (agudo, grave) no início de cada compasso, como sirene de aviso
      if (beat === 0) tone(ac, musicGain, 1318, nextTime, step * 1.6, 'square', 0.16);
      if (beat === 2) tone(ac, musicGain, 988, nextTime, step * 1.6, 'square', 0.16);
      if (beat === 4) tone(ac, musicGain, 1318, nextTime, step * 1.6, 'square', 0.16);
    } else {
      if (beat % 2 === 0) tone(ac, musicGain, NOTE(bass[bar][beat % 4 === 0 ? 0 : 1]), nextTime, step * 1.8, 'triangle', 0.5);
      tone(ac, musicGain, 7000, nextTime, beat % 4 === 2 ? 0.06 : 0.02, 'noise', beat % 4 === 2 ? 0.18 : 0.07); // chocalho
    }
    nextTime += step;
    nextStep++;
  }
};

/** Reta final da partida: troca a cantiga pela faixa de clímax (e volta quando a partida acaba). */
export const setClimax = (on: boolean) => {
  if (on === climaxOn) return;
  climaxOn = on;
  track = on ? TRACKS.climax : TRACKS.calm;
  nextStep = 0;
  nextTime = 0;
  if (musicGain) musicGain.gain.value = track.gain;
  if (on) play('climax');
};

const startMusic = () => {
  if (!musicOn || musicTimer) return;
  const ac = audio();
  if (!ac) return;
  if (!musicGain) {
    musicGain = ac.createGain();
    musicGain.gain.value = track.gain; // baixinha, por trás dos efeitos
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
