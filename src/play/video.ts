/**
 * Player de vídeo em tela cheia por cima do jogo: o trailer de abertura, o trailer e o tutorial (public/video).
 * Os vídeos são verticais: no computador aparecem centralizados sobre fundo escuro.
 *
 * Na abertura o vídeo começa mudo (o navegador não deixa começar sozinho com som) e tem "Ativar som" e "Pular".
 * Quando a pessoa toca para assistir, começa com som, a não ser que o som do jogo esteja desligado.
 */
import { BUILD_ID } from '../net/protocol';
import { t } from '../i18n';
import { holdAudio, isMuted } from './sfx';

export type VideoName = 'trailer' | 'how-to-play';

let closeCurrent: (() => void) | null = null;
export const isVideoOpen = () => closeCurrent !== null;

export const openVideo = (name: VideoName, o: { intro?: boolean; onClose?: () => void } = {}) => {
  closeCurrent?.();
  const back = document.createElement('div');
  back.className = 'videobox';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.setAttribute('aria-label', name === 'trailer' ? t('Trailer', 'Trailer') : t('Tutorial video', 'Vídeo tutorial'));

  const v = document.createElement('video');
  v.src = `${import.meta.env.BASE_URL}video/${name}.mp4?v=${BUILD_ID}`;
  v.playsInline = true;
  v.preload = 'auto';
  v.controls = !o.intro;
  v.muted = !!o.intro || isMuted();

  const bar = document.createElement('div');
  bar.className = 'videobar';
  const button = (label: string, onclick: () => void, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.onclick = onclick;
    bar.appendChild(b);
    return b;
  };

  const close = () => {
    if (closeCurrent !== close) return;
    closeCurrent = null;
    removeEventListener('keydown', onKey, true);
    v.pause();
    v.removeAttribute('src');
    v.load(); // solta o download se a pessoa pulou no meio
    back.remove();
    holdAudio(false);
    o.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); // fecha só o vídeo, não a janela que está por baixo
    close();
  };

  if (o.intro) {
    const sound = button(t('Turn sound on', 'Ativar som'), () => {
      v.muted = false;
      v.currentTime = 0;
      void v.play();
      v.controls = true;
      sound.remove();
    }, true);
    button(t('Skip', 'Pular'), close);
  } else button(t('Close', 'Fechar'), close);

  v.onended = close;
  v.onerror = close; // sem o arquivo ou sem conexão: segue para o jogo
  back.append(v, bar);
  document.body.appendChild(back);
  addEventListener('keydown', onKey, true);
  closeCurrent = close;
  holdAudio(true); // a música e os efeitos do jogo esperam o vídeo acabar
  // se o aparelho não deixar começar sozinho (modo de economia, por exemplo), os controles aparecem para dar o play
  v.play().catch(() => (v.controls = true));
  bar.querySelector('button')?.focus();
};

const SEEN = 'atlantida.abertura';
/** Trailer de abertura: só na primeira visita, e nunca para quem chega por um convite de sala (?sala=). */
export const openIntroOnce = () => {
  // outros parâmetros não contam: sites que embutem o jogo (como a itch.io) podem acrescentar os deles no endereço
  if (new URLSearchParams(location.search).has('sala')) return;
  try {
    if (localStorage.getItem(SEEN)) return;
    localStorage.setItem(SEEN, 'visto');
  } catch {
    return; // sem armazenamento abriria em toda visita
  }
  openVideo('trailer', { intro: true });
};
