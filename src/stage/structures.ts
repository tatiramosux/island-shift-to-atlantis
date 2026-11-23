/**
 * Construções das casas: cada andar construído é uma peça de verdade, e não só um bloco mais alto.
 *   andar 1  Escadaria        (degrau para subir)
 *   andar 2  Torre de vigia   (o Polvo não alcança quem está aqui)
 *   andar 3  Farol            (o ponto mais alto da ilha)
 * O Castelo de Atlântida (o centro) tem torres nos cantos; seus andares são salões dourados.
 * Todas têm o topo plano: é onde o construtor fica em pé.
 */
import * as THREE from 'three';
import type { Models } from './models';

export const FLOOR_H = 0.3;
export const HEX_R = 0.96;

/** os 6 cantos de um hexágono "de ponta" (como o dos prismas do tabuleiro), a uma distância r do centro. */
const corners = (r: number): [number, number][] =>
  Array.from({ length: 6 }, (_, k) => [Math.sin((k * Math.PI) / 3) * r, Math.cos((k * Math.PI) / 3) * r] as [number, number]);

/** ponto no meio do lado k de um hexágono de raio r (para pôr janelas e portões). */
const sideMid = (r: number, k: number): [number, number] => {
  const a = Math.PI / 6 + (k * Math.PI) / 3;
  const ap = r * Math.cos(Math.PI / 6);
  return [Math.sin(a) * ap, Math.cos(a) * ap];
};

const slab = (m: Models, r: number, kind: 'block' | 'temple' | 'marble'): THREE.Mesh => {
  const f = new THREE.Mesh(m.hexGeo(r, FLOOR_H), m.terrain(kind));
  f.position.y = FLOOR_H / 2;
  f.castShadow = f.receiveShadow = true;
  return f;
};

/** Uma peça de construção (o andar `level`, de 1 a 3), com a base em y = 0. */
/** `stairs`: ângulo (rotation.y) para onde a escadaria aponta (o lado que faz fronteira com o Castelo); null = sem degraus. */
export const buildLevel = (m: Models, level: number, stairs: number | null = null): THREE.Group => {
  const g = new THREE.Group();
  const stone = m.solid('#cfc8b0');
  const dark = m.solid('#4a4a52');
  if (level === 1) {
    // 1º andar: laje simples; só na casa colada no Castelo ela ganha degraus (a Escadaria de verdade)
    g.add(slab(m, HEX_R - 0.06, 'block'));
    if (stairs !== null) {
      // degraus que começam no meio da casa e sobem até encostar na borda do Castelo
      const st = new THREE.Group();
      for (let i = 0; i < 5; i++) st.add(m.box(0.42, 0.065 * (i + 1), 0.17, stone, 0, FLOOR_H, 0.06 + i * 0.17));
      st.rotation.y = stairs;
      g.add(st);
    }
  } else if (level === 2) {
    // torre de vigia: mais estreita, com seteiras e ameias nos cantos
    g.add(slab(m, HEX_R - 0.2, 'block'));
    for (const k of [0, 1, 2]) {
      const [x, z] = sideMid(HEX_R - 0.2, k);
      g.add(m.box(0.1, 0.16, 0.1, dark, x * 1.02, 0.08, z * 1.02));
    }
    for (const [x, z] of corners(HEX_R - 0.2)) g.add(m.box(0.15, 0.13, 0.15, stone, x, FLOOR_H, z));
  } else {
    // farol: topo dourado com seis lanternas acesas
    g.add(slab(m, HEX_R - 0.32, 'block'));
    for (const [x, z] of corners(HEX_R - 0.34)) {
      g.add(m.box(0.1, 0.1, 0.1, m.solid('#a78a2c'), x, FLOOR_H, z));
      g.add(m.box(0.07, 0.07, 0.07, m.solid('#ffe27a', 0.9), x, FLOOR_H + 0.1, z));
    }
  }
  return g;
};

/** Base de mármore da Coluna de Atlântida (o andar que a coluna já traz ao emergir). */
export const buildMarbleBase = (m: Models): THREE.Group => {
  const g = new THREE.Group();
  g.add(slab(m, HEX_R - 0.06, 'marble'));
  return g;
};

/**
 * Castelo de Atlântida (a casa central), no topo do bloco: um templo grego dourado, como o do ícone do jogo. De frente
 * (o lado do portão), o pórtico com três colunas caneladas, friso de gregas, frontão com o tridente e degraus; em volta,
 * a cornija dourada na borda; e, flutuando e girando bem acima do topo, o cristal água-marinha. Os andares do Castelo
 * (salões dourados em degraus) sobem por trás do pórtico. Tudo baixo ou fino, para o pirata no topo ficar à vista.
 * Adormecido: pedra apagada, limo e grade fechada, sem cristal. `floors` (0 a 3) diz a altura do topo, onde o cristal flutua.
 * O grupo fica no topo do bloco (y = 0).
 */
export const buildCastle = (m: Models, awake: boolean, floors = 0): THREE.Group => {
  const g = new THREE.Group();
  const sand = m.solid(awake ? '#f6e8b6' : '#b4bdb6');
  const gold = m.solid(awake ? '#f0c64a' : '#a99a62', awake ? 0.35 : 0);
  const goldD = m.solid(awake ? '#cf9d28' : '#85794d');
  const goldL = m.solid(awake ? '#ffe58a' : '#bcae78', awake ? 0.55 : 0);
  const teal = m.solid(awake ? '#1b8f8d' : '#46685f');
  const moss = m.solid('#4f7d4a');
  const ap = HEX_R * Math.cos(Math.PI / 6); // distância do centro até o meio de cada lado do bloco
  // anéis um pouco mais largos que o bloco (sem faces coladas): só a borda de cima aparece. Ali vai a cornija dourada.
  const ring = (r: number, h: number, y: number, mat: THREE.Material) => {
    const s = new THREE.Mesh(m.hexGeo(r, h), mat);
    s.position.y = y + h / 2;
    s.castShadow = s.receiveShadow = true;
    g.add(s);
  };
  ring(HEX_R + 0.05, 0.07, -0.1, gold);
  ring(HEX_R + 0.02, 0.04, -0.03, sand);

  // pórtico de frente para o portão: z local aponta para fora do Castelo; o portão fica virado para a câmera da visão inicial
  const a0 = -Math.PI / 6;
  const d0 = ap - 0.14;
  const front = new THREE.Group();
  front.position.set(Math.sin(a0) * d0, 0, Math.cos(a0) * d0);
  front.rotation.y = a0;
  front.add(m.box(1.0, 0.05, 0.2, goldD, 0, 0, 0)); // plataforma
  front.add(m.box(0.92, 0.03, 0.05, sand, 0, 0, 0.12)); // degrau
  for (const x of [-0.3, 0, 0.3]) {
    front.add(m.box(0.14, 0.04, 0.14, goldD, x, 0.05, 0)); // base
    front.add(m.box(0.09, 0.34, 0.09, gold, x, 0.09, 0)); // fuste
    for (const dx of [-0.025, 0.025]) front.add(m.box(0.012, 0.3, 0.012, goldD, x + dx, 0.11, 0.047)); // caneluras
    front.add(m.box(0.15, 0.05, 0.15, goldL, x, 0.43, 0)); // capitel
    if (!awake) front.add(m.box(0.1, 0.1, 0.1, moss, x, 0.05, 0.02)); // limo no pé
  }
  front.add(m.box(0.98, 0.07, 0.16, gold, 0, 0.48, 0)); // arquitrave
  front.add(m.box(0.98, 0.06, 0.17, goldD, 0, 0.55, 0)); // friso
  for (let i = 0; i < 10; i++) front.add(m.box(0.05, 0.035, 0.02, teal, -0.42 + i * 0.093, 0.567, 0.088)); // gregas
  front.add(m.box(1.04, 0.04, 0.2, goldL, 0, 0.61, 0)); // cornija
  // frontão em degraus, com o tridente no meio
  const widths = [0.96, 0.8, 0.64, 0.48, 0.32, 0.16];
  widths.forEach((w, j) => {
    const y = 0.65 + j * 0.06;
    front.add(m.box(w, 0.06, 0.16, gold, 0, y, 0));
    if (w - 0.14 >= 0.06) front.add(m.box(w - 0.14, 0.06, 0.02, teal, 0, y, 0.09));
  });
  front.add(m.box(0.022, 0.13, 0.02, goldL, 0, 0.67, 0.104)); // tridente: haste
  front.add(m.box(0.12, 0.022, 0.02, goldL, 0, 0.77, 0.104)); // travessa
  for (const x of [-0.05, 0, 0.05]) front.add(m.box(0.02, x === 0 ? 0.11 : 0.08, 0.02, goldL, x, 0.79, 0.104)); // pontas
  if (!awake) for (const y of [0.1, 0.22, 0.34]) front.add(m.box(0.22, 0.03, 0.03, m.solid('#55595e'), 0, y, 0.02)); // grade entre as colunas
  g.add(front);

  // ruínas nos outros cantos do bloco (menos os dois ao lado do portão): colunas inteiras, quebradas e caídas, como partes mais destruídas do palácio
  // as ruínas têm o mesmo dourado das colunas do pórtico
  const stone = gold;
  const stoneD = goldD;
  const rr = HEX_R - 0.2;
  const ruin = (k: number, kind: 'whole' | 'broken' | 'half' | 'fallen') => {
    const x = Math.sin((k * Math.PI) / 3) * rr;
    const z = Math.cos((k * Math.PI) / 3) * rr;
    const col = new THREE.Group();
    col.position.set(x, 0, z);
    col.rotation.y = (k * 0.7) % 1;
    col.add(m.box(0.14, 0.04, 0.14, goldD, 0, 0, 0)); // base (mesmo tom e tamanho das colunas do pórtico)
    if (kind === 'fallen') {
      // coluna caída: o fuste deitado no chão, uma ponta quebrada e um caco ao lado
      const lying = new THREE.Group();
      lying.position.set(0.02, 0.07, 0.16);
      lying.rotation.y = 0.55;
      lying.add(m.box(0.34, 0.09, 0.09, stone, 0, 0, 0));
      lying.add(m.box(0.03, 0.11, 0.11, stone, 0.17, 0, 0));
      col.add(lying);
      col.add(m.box(0.08, 0.04, 0.06, stone, -0.1, 0.04, -0.05));
    } else {
      const h = kind === 'whole' ? 0.34 : kind === 'broken' ? 0.22 : 0.12; // a inteira tem a altura das colunas do pórtico; as quebradas são menores
      col.add(m.box(0.09, h, 0.09, stone, 0, 0.05, 0)); // fuste
      col.add(m.box(0.025, h * 0.9, 0.012, stoneD, 0, 0.07, 0.047)); // estria
      if (kind === 'whole') col.add(m.box(0.15, 0.05, 0.15, goldL, 0, 0.05 + h, 0)); // capitel
      else {
        col.add(m.box(0.07, 0.04, 0.07, stone, -0.01, 0.05 + h, 0)); // topo quebrado, em degrau
        col.add(m.box(0.12, 0.04, 0.09, stone, 0.14, 0.04, 0.08)); // pedaço caído ao pé
      }
    }
    if (!awake) col.add(m.box(0.08, 0.06, 0.08, moss, 0.06, 0.05, 0.08)); // limo
    g.add(col);
  };
  ruin(4, 'whole'); // o canto da frente à esquerda é o que mais aparece na visão inicial
  ruin(1, 'broken');
  ruin(2, 'fallen');
  ruin(3, 'half');

  // cristal água-marinha flutuando acima do topo, girando, com os raios do ícone
  if (awake) {
    const y = floors * FLOOR_H + 2.05; // acima da Princesa, que espera no topo
    const cr = new THREE.Group();
    cr.position.set(0, y, 0);
    cr.userData.spin = 0.9;
    cr.userData.bob = 0.06;
    cr.userData.baseY = y;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), m.solid('#38e0d6', 0.9));
    gem.scale.set(0.8, 1.5, 0.8);
    gem.castShadow = true;
    cr.add(gem);
    const glint = m.solid('#bffcf6', 1);
    for (const s of [-1, 1]) {
      cr.add(m.box(0.12, 0.018, 0.018, glint, s * 0.34 - 0.06, -0.01, 0));
      cr.add(m.box(0.018, 0.018, 0.12, glint, 0, -0.01, s * 0.34 - 0.06));
    }
    g.add(cr);
  }
  return g;
};

/** Salão do castelo (andar `level`, de 1 a 3): mármore em degraus cada vez mais estreitos, com faixa dourada. */
export const buildCastleTier = (m: Models, level: number): THREE.Group => {
  const g = new THREE.Group();
  const r = HEX_R - 0.3 - (level - 1) * 0.1;
  g.add(slab(m, r, 'temple'));
  const band = new THREE.Mesh(m.hexGeo(r + 0.025, 0.05), m.solid('#f0c64a', 0.4));
  band.position.y = FLOOR_H - 0.09;
  g.add(band);
  for (const [x, z] of corners(r)) g.add(m.box(0.07, 0.07, 0.07, m.solid('#3fc6c0', 0.4), x, FLOOR_H, z));
  return g;
};
