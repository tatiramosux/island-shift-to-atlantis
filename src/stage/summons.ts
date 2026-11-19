/**
 * As 4 convocações: personagens em blocos que entram em cena, agem e somem (Tritão, Golfinho-guia, Sereia, Colosso de coral).
 * Todos olham para +z. Provisório até a arte final.
 */
import * as THREE from 'three';
import type { Models } from './models';

export type SummonKind = 'triton' | 'dolphin' | 'siren' | 'colossus';

type Draw = (g: CanvasRenderingContext2D) => void;
const P = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

export const buildSummon = (m: Models, kind: SummonKind): THREE.Group => {
  const g = new THREE.Group();
  const skin = m.solid('#f5c9a0');
  const face = (key: string, draw: Draw) => m.textured(key, 16, 16, draw);
  const gold = m.solid('#f2c80f', 0.35);

  if (kind === 'triton') {
    // rei do mar: pele turquesa, barba azul, coroa dourada, tridente e cauda de peixe
    const teal = m.solid('#2fa5a0');
    const tealD = m.solid('#1f7f86');
    const blue = m.solid('#2a5bd7');
    g.add(m.box(0.3, 0.16, 0.2, teal, 0, 0, 0));
    g.add(m.box(0.22, 0.14, 0.16, tealD, 0, 0.16, 0));
    g.add(m.box(0.34, 0.1, 0.1, m.solid('#d8232a'), 0, 0.02, -0.14));
    g.add(m.box(0.4, 0.34, 0.22, skin, 0, 0.3, 0));
    g.add(m.box(0.42, 0.1, 0.24, blue, 0, 0.3, 0));
    for (const sx of [-0.28, 0.28]) g.add(m.box(0.12, 0.3, 0.12, skin, sx, 0.32, 0));
    const f = face('tritonFace', (c) => {
      P(c, 0, 0, 16, 16, '#f5c9a0');
      P(c, 0, 0, 16, 3, '#2a5bd7');
      P(c, 3, 6, 3, 3, '#ffffff');
      P(c, 10, 6, 3, 3, '#ffffff');
      P(c, 4, 7, 2, 2, '#16243f');
      P(c, 10, 7, 2, 2, '#16243f');
      P(c, 2, 10, 12, 6, '#2a5bd7');
      P(c, 6, 11, 4, 1, '#f5c9a0');
    });
    g.add(m.box(0.3, 0.3, 0.3, [skin, skin, blue, skin, f, blue], 0, 0.64, 0));
    g.add(m.box(0.3, 0.05, 0.3, gold, 0, 0.92, 0));
    for (const x of [-0.11, 0, 0.11]) g.add(m.box(0.06, 0.12, 0.06, gold, x, 0.97, 0));
    // tridente
    g.add(m.box(0.05, 0.95, 0.05, gold, 0.38, 0.1, 0.1));
    g.add(m.box(0.26, 0.05, 0.05, gold, 0.38, 1.0, 0.1));
    for (const x of [0.28, 0.38, 0.48]) g.add(m.box(0.05, 0.16, 0.05, m.solid('#ffd84a', 0.5), x, 1.04, 0.1));
  } else if (kind === 'dolphin') {
    // corpo azul-acinzentado com barriga branca, focinho, nadadeira e cauda
    const body = m.solid('#5d8fc4');
    const belly = m.solid('#e8f1fa');
    const fin = m.solid('#4a76a8');
    const f = face('dolphinFace', (c) => {
      P(c, 0, 0, 16, 16, '#5d8fc4');
      P(c, 0, 9, 16, 7, '#e8f1fa');
      P(c, 2, 4, 3, 3, '#16243f');
      P(c, 11, 4, 3, 3, '#16243f');
      P(c, 3, 5, 1, 1, '#ffffff');
      P(c, 12, 5, 1, 1, '#ffffff');
    });
    g.add(m.box(0.3, 0.2, 0.3, body, 0, 0.18, -0.55));
    g.add(m.box(0.4, 0.3, 0.4, [body, body, body, belly, body, body], 0, 0.16, -0.2));
    g.add(m.box(0.4, 0.34, 0.4, [body, body, body, belly, body, body], 0, 0.2, 0.18));
    g.add(m.box(0.36, 0.36, 0.34, [body, body, body, belly, f, body], 0, 0.22, 0.54));
    g.add(m.box(0.16, 0.12, 0.28, fin, 0, 0.2, 0.84));
    g.add(m.box(0.06, 0.26, 0.2, fin, 0, 0.54, 0.0));
    g.add(m.box(0.46, 0.06, 0.16, fin, 0, 0.3, -0.76));
  } else if (kind === 'siren') {
    // cabelo rosa comprido, concha no peito, cauda verde-água
    const pink = m.solid('#f29ac2');
    const tail = m.solid('#37c4a6');
    const tailD = m.solid('#25977f');
    g.add(m.box(0.26, 0.16, 0.18, tail, 0, 0, 0));
    g.add(m.box(0.2, 0.14, 0.15, tailD, 0, 0.16, 0));
    g.add(m.box(0.36, 0.08, 0.1, pink, 0, 0.02, -0.14));
    g.add(m.box(0.3, 0.3, 0.18, skin, 0, 0.3, 0));
    for (const sx of [-0.07, 0.07]) g.add(m.box(0.1, 0.1, 0.06, m.solid('#fff7e0'), sx, 0.46, 0.11));
    for (const sx of [-0.21, 0.21]) g.add(m.box(0.09, 0.26, 0.1, skin, sx, 0.34, 0));
    const f = face('sirenFace', (c) => {
      P(c, 0, 0, 16, 16, '#fbd9bd');
      P(c, 0, 0, 16, 5, '#f29ac2');
      P(c, 0, 5, 3, 11, '#f29ac2');
      P(c, 13, 5, 3, 11, '#f29ac2');
      P(c, 4, 7, 3, 3, '#ffffff');
      P(c, 9, 7, 3, 3, '#ffffff');
      P(c, 5, 8, 2, 2, '#2a8f5b');
      P(c, 10, 8, 2, 2, '#2a8f5b');
      P(c, 6, 12, 4, 1, '#e0457b');
    });
    g.add(m.box(0.28, 0.28, 0.28, [pink, pink, pink, skin, f, pink], 0, 0.62, 0));
    g.add(m.box(0.34, 0.36, 0.08, pink, 0, 0.34, -0.14));
    g.add(m.box(0.1, 0.1, 0.06, gold, 0.1, 0.84, 0.12));
  } else {
    // gigante de coral laranja e rosa com espinhos
    const coral = m.solid('#f08a4b');
    const coralD = m.solid('#d8623a');
    const pinkC = m.solid('#f29ac2');
    for (const sx of [-0.28, 0.28]) g.add(m.box(0.3, 0.5, 0.34, coralD, sx, 0, 0));
    g.add(m.box(0.9, 0.55, 0.5, coral, 0, 0.5, 0));
    for (const sx of [-0.6, 0.6]) g.add(m.box(0.26, 0.7, 0.28, coralD, sx, 0.4, 0));
    for (const [x, h] of [[-0.3, 0.3], [0, 0.42], [0.3, 0.3]] as const) g.add(m.box(0.14, h, 0.14, pinkC, x, 1.05, -0.05));
    const f = face('colossusFace', (c) => {
      P(c, 0, 0, 16, 16, '#f08a4b');
      P(c, 2, 4, 4, 4, '#fff7e0');
      P(c, 10, 4, 4, 4, '#fff7e0');
      P(c, 3, 5, 2, 3, '#16243f');
      P(c, 11, 5, 2, 3, '#16243f');
      P(c, 4, 11, 8, 2, '#a8402a');
      P(c, 0, 0, 3, 3, '#f29ac2');
      P(c, 13, 0, 3, 3, '#f29ac2');
    });
    g.add(m.box(0.55, 0.5, 0.5, [coral, coral, coral, coral, f, coral], 0, 1.0, 0));
    for (const [x, z] of [[-0.2, 0], [0.2, 0.1], [0, -0.2]] as const) g.add(m.box(0.1, 0.22, 0.1, pinkC, x, 1.5, z));
  }
  return g;
};
