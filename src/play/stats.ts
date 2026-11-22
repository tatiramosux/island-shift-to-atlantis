/**
 * Estatísticas anônimas: avisa o servidor do Render quando alguém abre o jogo, começa ou termina uma partida.
 * Só vão contagens (modo, duração da partida, número de jogadores, idioma, resultado). Nada de nome, e-mail, cookie ou
 * identificador de pessoa. Respeita o "Não rastrear" do navegador e não envia nada em testes locais.
 * Funciona no itch.io, na Vercel e no Render: o evento sempre vai para o servidor do Render (veja server/stats.ts).
 */
import { ONLINE_SITE } from '../net/protocol';
import { getLang } from '../i18n';

type Data = Record<string, string | number | boolean>;

const site = (): string => {
  const h = location.hostname;
  if (/itch\.(io|zone)$/.test(h)) return 'itch';
  if (/vercel\.app$/.test(h)) return 'vercel';
  if (/onrender\.com$/.test(h)) return 'render';
  return 'other';
};

const enabled = (): boolean => {
  const local = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(location.hostname);
  const dnt = navigator.doNotTrack === '1' || (window as unknown as { doNotTrack?: string }).doNotTrack === '1';
  return !local && !dnt;
};

export const track = (e: string, data: Data = {}): void => {
  try {
    if (!enabled()) return;
    const url = (site() === 'render' ? '' : ONLINE_SITE) + '/api/event';
    const body = JSON.stringify({ e, lang: getLang(), site: site(), ...data });
    // texto simples: não precisa de pré-verificação (CORS) e não atrasa nada; se falhar, ninguém percebe
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) void fetch(url, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(() => undefined);
  } catch {
    /* sem estatística: o jogo segue normal */
  }
};
