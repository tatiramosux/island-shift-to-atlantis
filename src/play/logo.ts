/**
 * Título da tela inicial: "Island Shift" em Cinzel Decorative (letras de inscrição de templo grego) e "to Atlantis"
 * em Cinzel, em azul-marinho. O contorno claro de espuma é uma cópia do texto atrás das letras (data-t), para não
 * cobrir o azul. O estilo fica em index.html, classe .logo.
 */
const line = (cls: string, text: string) => `<span class="${cls}" data-t="${text}"><b>${text}</b></span>`;
export const logoSvg = (): string =>
  `<h1 class="logo" aria-label="Island Shift to Atlantis">${line('l1', 'Island Shift')}${line('l2', 'to Atlantis')}</h1>`;
