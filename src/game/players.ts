import { t } from '../i18n';
/** Cores e nomes dos 4 times (vermelho, verde, amarelo, roxo). */
export const PLAYER_COLORS = ['#d8232a', '#2fa24a', '#f2c80f', '#6a3fa0'];
export const PLAYER_DARK = ['#a81a20', '#217a36', '#c9a50c', '#4a2a7a'];
export const PLAYER_NAMES = [t('Capt. Beard', 'Cap. Barba'), t('Capt. Hook', 'Cap. Anzol'), t('Capt. Fang', 'Cap. Dente'), t('Capt. Tide', 'Cap. Maré')];

/**
 * Famílias de piratas robôs: só os bots usam. Cada uma tem cores que nenhum time humano usa (laranja, ciano e rosa)
 * e um jeito próprio de cabeça e olhos.
 */
export interface RobotFamily {
  name: string;
  color: string;
  dark: string;
  /** cor dos olhos e das luzes, que brilham. */
  glow: string;
  /** metal do corpo. */
  metal: string;
}
export const ROBOT_FAMILIES: RobotFamily[] = [
  { name: t('Brass Robot', 'Robô Latão'), color: '#f07a12', dark: '#a8520a', glow: '#ffe14a', metal: '#b9925a' },
  { name: t('Cobalt Robot', 'Robô Cobalto'), color: '#16b4e0', dark: '#0d7898', glow: '#ff4040', metal: '#8d9aa8' },
  { name: t('Coral Robot', 'Robô Coral'), color: '#ff5fa8', dark: '#b8326e', glow: '#6dffb0', metal: '#c9c2cc' },
];

/** Família de robô de cada lugar da mesa nesta partida (null = pirata de gente). */
const looks: (number | null)[] = [null, null, null, null];

/** Define quem é robô nesta partida. `families[p]` é o número da família (ou null). */
export const setSeatLooks = (families: (number | null)[]) => {
  for (let p = 0; p < 4; p++) looks[p] = families[p] ?? null;
};
export const robotFamily = (p: number): RobotFamily | null => (looks[p] === null ? null : ROBOT_FAMILIES[looks[p]!]);
/** Chave curta do visual de um lugar (muda o desenho quando a família muda). */
export const lookKey = (p: number): string => (looks[p] === null ? 'p' : `r${looks[p]}`);
export const teamColor = (p: number): string => robotFamily(p)?.color ?? PLAYER_COLORS[p];
export const teamDark = (p: number): string => robotFamily(p)?.dark ?? PLAYER_DARK[p];
export const teamName = (p: number): string => robotFamily(p)?.name ?? PLAYER_NAMES[p];

/** Sorteia famílias diferentes para os lugares dos bots. */
export const drawRobotFamilies = (botSeats: number[], random: () => number = Math.random): (number | null)[] => {
  const pool = ROBOT_FAMILIES.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: (number | null)[] = [null, null, null, null];
  botSeats.forEach((p, k) => (out[p] = pool[k % pool.length]));
  return out;
};
