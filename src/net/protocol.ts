/** Mensagens entre o jogo (celular/TV) e o servidor da sala (server/index.ts). */
import type { Action, GameEvent, GameState } from '../engine/atlantida';

export interface SeatInfo {
  name: string;
  kind: 'human' | 'bot';
}

export type ServerMsg =
  | { t: 'lobby'; code: string; seats: SeatInfo[]; you: number; host: boolean }
  | { t: 'state'; state: GameState; you: number; seats: SeatInfo[]; events: GameEvent[] }
  | { t: 'error'; message: string };

export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'watch'; code: string }
  | { t: 'addBot' }
  | { t: 'start' }
  | { t: 'action'; action: Action };

declare const __NO_ONLINE__: boolean;
/** Endereço do site que tem as salas em rede (a hospedagem estática da Vercel não tem servidor de salas). */
export const ONLINE_SITE = 'https://island-shift-to-atlantis.onrender.com';
/** Falso na Vercel (reconhecida na compilação pela variável VERCEL ou pelo endereço *.vercel.app) e no zip do itch.io: lá só há partida neste aparelho e contra o BOT. As salas em rede ficam só no site do Render. */
export const ONLINE_AVAILABLE = !__NO_ONLINE__ && !(typeof location !== 'undefined' && /\.vercel\.app$/i.test(location.hostname));

/** Mesmo endereço do jogo, caminho /ws (o servidor da sala serve o jogo e o WebSocket juntos). */
export const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
