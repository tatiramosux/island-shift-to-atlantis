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
export const ONLINE_SITE = 'https://atlantida-cidade-submersa.onrender.com';
/** Falso na Vercel (reconhecida na compilação pela variável VERCEL ou pelo endereço *.vercel.app): lá só há partida neste aparelho e contra o BOT. */
// Online desligado nesta versão (Game Off 2026): as salas em rede voltam num próximo release. Para religar, troque por: !__NO_ONLINE__ && !(typeof location !== 'undefined' && /.vercel.app$/i.test(location.hostname))
export const ONLINE_AVAILABLE = false;

/** Mesmo endereço do jogo, caminho /ws (o servidor da sala serve o jogo e o WebSocket juntos). */
export const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
