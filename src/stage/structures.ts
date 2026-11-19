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
 * Castelo de Atlântida (a casa central), no topo do bloco de mármore: cornija dourada na borda, colunata baixa de templo
 * grego em volta, portão em arco na frente e seis torreões baixos de telhado água-marinha (tudo baixo, para o pirata no
 * topo ficar à vista). Adormecido: pedra apagada, limo, portão gradeado. Desperto: mármore claro, ouro aceso e portão
 * iluminado. O grupo fica no topo do bloco (y = 0).
 */
export const buildCastle = (m: Models, awake: boolean): THREE.Group => {
  const g = new THREE.Group();
  const marble = m.solid(awake ? '#f2ede0' : '#b4bdb6');
  const shade = m.solid(awake ? '#d9d1bb' : '#949e97');
  const gold = m.solid('#e7b830', awake ? 0.45 : 0);
  const aqua = m.solid(awake ? '#2fc4bd' : '#5d8a84', awake ? 0.2 : 0);
  const aquaD = m.solid(awake ? '#1d8f8b' : '#46685f');
  const moss = m.solid('#4f7d4a');
  const ap = HEX_R * Math.cos(Math.PI / 6); // distância do centro até o meio de cada lado do bloco
  // anéis um pouco mais largos que o bloco (sem faces coladas)
  const ring = (r: number, h: number, y: number, mat: THREE.Material) => {
    const s = new THREE.Mesh(m.hexGeo(r, h), mat);
    s.position.y = y + h / 2;
    s.castShadow = s.receiveShadow = true;
    g.add(s);
  };
  // as casas vizinhas cobrem quase todo o bloco: só a borda de cima aparece. Ali vai a cornija dourada.
  ring(HEX_R + 0.05, 0.07, -0.1, gold);
  ring(HEX_R + 0.02, 0.04, -0.03, marble);
  // colunata baixa em volta do topo (peristilo): duas colunas por lado, ligadas por uma viga de mármore
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const tx = Math.cos(a);
    const tz = -Math.sin(a);
    const d = ap - 0.1;
    if (k === 0) continue; // a frente fica para o portão
    for (const off of [-0.2, 0.2]) {
      const x = nx * d + tx * off;
      const z = nz * d + tz * off;
      g.add(m.box(0.12, 0.04, 0.12, shade, x, 0, z)); // base
      g.add(m.box(0.08, 0.3, 0.08, marble, x, 0.04, z)); // fuste
      g.add(m.box(0.13, 0.04, 0.13, gold, x, 0.34, z)); // capitel
      if (!awake && off < 0) g.add(m.box(0.1, 0.1, 0.1, moss, x, 0, z)); // limo no pé
    }
    const beam = m.box(0.56, 0.05, 0.1, marble, nx * d, 0.38, nz * d);
    beam.rotation.y = a; // ao longo do lado
    g.add(beam);
  }
  // portão em arco na frente, de pé na borda do topo
  const [gx, gz] = sideMid(HEX_R - 0.16, 0);
  const door = new THREE.Group();
  door.position.set(gx, 0, gz);
  door.rotation.y = Math.PI / 6;
  for (const sx of [-0.24, 0.24]) door.add(m.box(0.1, 0.44, 0.1, marble, sx, 0, 0)); // pilares
  door.add(m.box(0.6, 0.06, 0.12, gold, 0, 0.44, 0)); // verga dourada
  door.add(m.box(0.4, 0.06, 0.12, aqua, 0, 0.5, 0)); // frontão em degraus
  door.add(m.box(0.2, 0.06, 0.12, aquaD, 0, 0.56, 0));
  door.add(m.box(0.06, 0.06, 0.06, awake ? m.solid('#ffe27a', 0.9) : gold, 0, 0.62, 0));
  if (!awake) for (const y of [0.1, 0.22, 0.34]) door.add(m.box(0.4, 0.035, 0.03, m.solid('#55595e'), 0, y, 0)); // grade fechada
  else door.add(m.box(0.36, 0.4, 0.02, m.solid('#ffe27a', 0.6), 0, 0.02, -0.02)); // luz no vão
  g.add(door);
  // seis torreões baixos nos cantos, com telhado de degraus água-marinha e ponta dourada
  corners(HEX_R - 0.08).forEach(([x, z], i) => {
    g.add(m.box(0.26, 0.24, 0.26, marble, x, 0, z));
    g.add(m.box(0.3, 0.04, 0.3, gold, x, 0.24, z));
    g.add(m.box(0.26, 0.07, 0.26, aqua, x, 0.28, z));
    g.add(m.box(0.18, 0.07, 0.18, aquaD, x, 0.35, z));
    g.add(m.box(0.1, 0.06, 0.1, aqua, x, 0.42, z));
    g.add(m.box(0.04, 0.08, 0.04, gold, x, 0.48, z));
    g.add(m.box(0.07, 0.09, 0.02, awake ? m.solid('#ffe27a', 0.9) : m.solid('#2a2f33'), x * 1.0, 0.08, z + (z > 0 ? 0.13 : -0.13))); // janela
    if (awake && i % 2 === 0) g.add(m.box(0.14, 0.08, 0.02, m.solid('#2fc4bd', 0.3), x + 0.09, 0.5, z)); // flâmula
  });
  return g;
};

/** Salão do castelo (andar `level`, de 1 a 3): mármore em degraus cada vez mais estreitos, com faixa dourada. */
export const buildCastleTier = (m: Models, level: number): THREE.Group => {
  const g = new THREE.Group();
  const r = HEX_R - 0.3 - (level - 1) * 0.1;
  g.add(slab(m, r, 'temple'));
  const band = new THREE.Mesh(m.hexGeo(r + 0.025, 0.05), m.solid('#e7b830', 0.4));
  band.position.y = FLOOR_H - 0.09;
  g.add(band);
  for (const [x, z] of corners(r)) g.add(m.box(0.07, 0.07, 0.07, m.solid('#3fc6c0', 0.4), x, FLOOR_H, z));
  return g;
};
