/** Os dois personagens da lenda de Atlântida: a Princesa (presa no topo do Castelo) e Nereu, rei dos mares e de Atlântida (meio homem, meio sereia). */
import * as THREE from 'three';
import type { Models } from './models';

/** Princesa de Atlântida: vestido rosa em camadas, cabelo dourado comprido, tiara com joia azul, braços para o alto pedindo socorro. Altura ≈ 0.6. */
export const buildPrincess = (m: Models) => {
  const root = new THREE.Group();
  const dress = m.solid('#ff5fae');
  const dressL = m.solid('#ff8cc6');
  const lace = m.solid('#ffffff');
  const skin = m.solid('#ffd7b8', 0.55);
  const hair = m.solid('#ffd447', 0.3);
  const gold = m.solid('#ffe27a', 0.7);
  // saia em três camadas, com barra de renda
  root.add(m.box(0.4, 0.09, 0.4, lace, 0, 0.045, 0), m.box(0.36, 0.1, 0.36, dress, 0, 0.14, 0), m.box(0.3, 0.1, 0.3, dressL, 0, 0.24, 0), m.box(0.24, 0.1, 0.24, dress, 0, 0.34, 0));
  root.add(m.box(0.2, 0.1, 0.18, dressL, 0, 0.44, 0), m.box(0.22, 0.03, 0.2, gold, 0, 0.395, 0)); // corpete e cinto de ouro
  // cabelo comprido caindo atrás e pelos lados; rosto com olhos azuis, sobrancelhas, narizinho e boca; coroa de ouro com joias
  root.add(m.box(0.34, 0.42, 0.07, hair, 0, 0.43, -0.15));
  const head = new THREE.Group();
  head.position.set(0, 0.58, 0);
  head.add(m.box(0.3, 0.28, 0.2, skin, 0, 0, 0)); // rosto grande e liso (as caixas apoiam a base em y)
  head.add(m.box(0.34, 0.06, 0.28, hair, 0, 0.28, -0.05)); // cabelo só por cima da cabeça
  head.add(m.box(0.04, 0.38, 0.1, hair, -0.18, -0.12, -0.07), m.box(0.04, 0.38, 0.1, hair, 0.18, -0.12, -0.07)); // mechas atrás do rosto, não na frente
  head.add(m.box(0.07, 0.05, 0.03, hair, -0.115, 0.232, 0.105), m.box(0.07, 0.05, 0.03, hair, 0.115, 0.232, 0.105)); // só as pontinhas da franja nos cantos
  for (const x of [-0.07, 0.07]) {
    head.add(m.box(0.08, 0.095, 0.02, m.solid('#ffffff', 0.6), x, 0.115, 0.105), m.box(0.056, 0.075, 0.02, m.solid('#2a6bff', 0.7), x, 0.12, 0.112), m.box(0.026, 0.04, 0.02, m.solid('#10204a'), x, 0.125, 0.118), m.box(0.016, 0.016, 0.02, m.solid('#ffffff', 1), x + 0.012, 0.16, 0.122));
    head.add(m.box(0.09, 0.02, 0.02, m.solid('#8a5a10'), x, 0.225, 0.108)); // sobrancelha
    head.add(m.box(0.09, 0.015, 0.02, m.solid('#2a1a1a'), x, 0.208, 0.108)); // cílios
  }
  head.add(m.box(0.03, 0.03, 0.03, m.solid('#f0b898', 0.35), 0, 0.09, 0.11)); // narizinho
  for (const x of [-0.105, 0.105]) head.add(m.box(0.055, 0.035, 0.02, m.solid('#ff8a9c', 0.5), x, 0.045, 0.105)); // bochechas
  const mouth = m.box(0.07, 0.045, 0.02, m.solid('#c2184b'), 0, 0.008, 0.105); // boca aberta: grita por socorro
  mouth.userData.baseY = mouth.scale.y;
  mouth.userData.posY = mouth.position.y;
  head.add(mouth);
  // coroa de ouro: faixa, cinco pontas (a do meio mais alta, com bolinha) e joias
  const crownGold = m.solid('#ffd23f', 0.8);
  head.add(m.box(0.32, 0.055, 0.27, crownGold, 0, 0.335, -0.05));
  for (const [x, h] of [[-0.12, 0.07], [-0.06, 0.11], [0, 0.15], [0.06, 0.11], [0.12, 0.07]] as const) head.add(m.box(0.045, h, 0.045, crownGold, x, 0.39, -0.05));
  head.add(m.box(0.055, 0.055, 0.055, m.solid('#ff3b5c', 1), 0, 0.54, -0.05), m.box(0.045, 0.04, 0.03, m.solid('#46c2ff', 1), -0.09, 0.343, 0.09), m.box(0.045, 0.04, 0.03, m.solid('#ff3b5c', 1), 0, 0.343, 0.09), m.box(0.045, 0.04, 0.03, m.solid('#46c2ff', 1), 0.09, 0.343, 0.09));
  root.add(head);
  // braços para o alto, balançando
  const arm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.46, 0);
    g.add(m.box(0.06, 0.2, 0.06, skin, 0, 0.1, 0), m.box(0.075, 0.075, 0.075, skin, 0, 0.22, 0), m.box(0.08, 0.06, 0.08, dressL, 0, 0.0, 0));
    root.add(g);
    return g;
  };
  const armL = arm(-0.13);
  const armR = arm(0.13);
  armL.rotation.z = 0.45;
  armR.rotation.z = -0.45;
  // pernas como as dos outros personagens: o vestido sobe um pouco e embaixo aparecem pernas e sapatinhos
  const upper = new THREE.Group();
  upper.position.y = 0.22;
  for (const c of [...root.children]) upper.add(c);
  root.add(upper);
  for (const x of [-0.07, 0.07]) {
    root.add(m.box(0.07, 0.2, 0.07, m.solid('#ffd7b8', 0.3), x, 0.13, 0), m.box(0.085, 0.045, 0.12, m.solid('#c2185b'), x, 0.022, 0.015));
  }
  return { root, head, mouth, armL, armR };
};

/**
 * Nereu: rei dos mares e de Atlântida. Da cintura para cima é homem (barba e cabelo brancos, coroa de ouro, tridente);
 * da cintura para baixo é sereia: cauda de escamas que se enrola ao lado dele e termina numa nadadeira no alto. Altura ≈ 4 (sem o tridente).
 */
export const buildNereus = (m: Models) => {
  const skin = m.solid('#5db7c9', 0.18);
  const skinD = m.solid('#3f98ad', 0.12);
  const white = m.solid('#f1f7fa', 0.4);
  const gold = m.solid('#f3c846', 0.35);
  const scaleA = m.solid('#1fae9d');
  const scaleB = m.solid('#14877f');
  const fin = m.solid('#3fe0cf', 0.3);
  const mouthMat = m.solid('#3a0a14');
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // da cintura para baixo: escamas (sereia), com o início da cauda sob o cinto de ouro
  body.add(m.box(1.7, 0.5, 1.05, scaleA, 0, 0.75, 0), m.box(1.55, 0.5, 1.0, scaleB, 0, 0.25, 0), m.box(1.95, 0.18, 1.15, gold, 0, 1.08, 0));
  // tronco de halterofilista: cintura fina, peitoral largo, abdômen definido, ombros enormes
  const skinL = m.solid('#74cde0', 0.28);
  body.add(m.box(1.8, 1.2, 1.1, skin, 0, 1.6, 0), m.box(3.1, 1.4, 1.3, skin, 0, 2.9, 0)); // cintura e caixa torácica enorme
  body.add(m.box(1.5, 0.6, 0.2, skinD, 0, 1.55, 0.5)); // faixa escura atrás do abdômen
  for (const y of [1.2, 1.55, 1.9]) for (const x of [-0.36, 0.36]) body.add(m.box(0.62, 0.3, 0.16, skinL, x, y, 0.58)); // seis gomos
  body.add(m.box(1.5, 0.95, 0.26, skinL, -0.77, 3.05, 0.7), m.box(1.5, 0.95, 0.26, skinL, 0.77, 3.05, 0.7), m.box(0.12, 0.9, 0.26, skinD, 0, 3.05, 0.68)); // peitorais enormes
  body.add(m.box(1.2, 0.45, 0.9, skin, 0, 3.75, 0.0)); // trapézio e pescoço grosso
  for (const sx of [-1, 1]) body.add(m.box(1.15, 1.15, 1.2, skinL, sx * 2.1, 3.3, 0)); // ombros enormes
  // cauda: uma curva de escamas que desce pelo lado esquerdo, dá a volta e sobe até a nadadeira
  const tail = new THREE.Group();
  body.add(tail);
  const P = [new THREE.Vector3(-0.5, 0.2, 0), new THREE.Vector3(-1.0, -1.8, 0.2), new THREE.Vector3(-3.4, -2.2, 0.2), new THREE.Vector3(-3.0, 1.2, 0.1)];
  const bez = (u: number) => {
    const q = 1 - u;
    return P[0].clone().multiplyScalar(q * q * q).add(P[1].clone().multiplyScalar(3 * q * q * u)).add(P[2].clone().multiplyScalar(3 * q * u * u)).add(P[3].clone().multiplyScalar(u * u * u));
  };
  const SEG = 16;
  for (let i = 0; i < SEG; i++) {
    const u = i / (SEG - 1);
    const p = bez(u);
    const size = 1.05 - 0.6 * u;
    tail.add(m.box(size, size, size * 0.9, i % 2 ? scaleB : scaleA, p.x, p.y, p.z));
  }
  const finGroup = new THREE.Group();
  finGroup.position.copy(P[3]);
  finGroup.add(m.box(0.16, 0.9, 0.7, fin, -0.4, 0.8, 0), m.box(0.16, 1.35, 0.7, fin, 0, 1.0, 0), m.box(0.16, 0.9, 0.7, fin, 0.4, 0.8, 0), m.box(0.8, 0.14, 0.7, scaleB, 0, 0.35, 0));
  tail.add(finGroup);
  // braços grossos: bíceps estufado, antebraço forte e punho fechado
  const armOf = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 3.3, 0);
    g.add(m.box(0.8, 1.0, 0.8, skin, 0, -0.6, 0), m.box(0.9, 0.55, 0.85, skinL, 0, -0.5, 0.06), m.box(0.7, 1.0, 0.7, skin, 0, -1.55, 0), m.box(0.8, 0.6, 0.8, skinD, 0, -2.2, 0));
    body.add(g);
    return g;
  };
  const armL = armOf(-2.2);
  const armR = armOf(2.2);
  const trident = new THREE.Group();
  // preso ao braço direito: a haste fica na frente do antebraço (visível) e os dedos fecham em volta dela, na altura do punho (y = -2.2)
  // (a haste fica à frente do ombro, que vai até z = 0.6: sem isso ela atravessava o ombro)
  // o tridente gira num punho (grip) na mão: o pulso compensa o braço, senão a ponta de cima balançava para trás e entrava no ombro
  const grip = new THREE.Group();
  grip.position.set(0, -2.2, 0.85);
  trident.position.set(0, -1.6, 0);
  grip.add(trident);
  armR.add(m.box(0.78, 0.6, 0.6, skinD, 0, -2.2, 0.5), m.box(0.5, 0.36, 0.3, skin, 0, -2.2, 0.98));
  trident.add(m.box(0.2, 4.8, 0.2, gold, 0, 2.4, 0), m.box(1.1, 0.18, 0.2, gold, 0, 4.9, 0));
  for (const x of [-0.48, 0, 0.48]) trident.add(m.box(0.16, x === 0 ? 1.1 : 0.8, 0.16, gold, x, x === 0 ? 5.5 : 5.3, 0));
  armR.add(grip);
  // cabeça: barba e cabelo brancos, coroa de ouro, olhos brilhantes, boca que abre no urro
  const head = new THREE.Group();
  head.position.set(0, 4.05, 0.5);
  head.add(m.box(1.05, 1.05, 1.0, skin, 0, 0.55, 0));
  for (const x of [-0.27, 0.27]) {
    const brow = m.box(0.4, 0.11, 0.1, white, x, 0.9, 0.53); // sobrancelha grossa
    brow.rotation.z = x < 0 ? -0.3 : 0.3;
    head.add(brow, m.box(0.3, 0.22, 0.06, m.solid('#ffffff', 0.7), x, 0.7, 0.52), m.box(0.14, 0.16, 0.07, m.solid('#7ff2ff', 1.2), x, 0.69, 0.55));
  }
  head.add(m.box(0.2, 0.3, 0.26, skinD, 0, 0.5, 0.58));
  const mouth = m.box(0.6, 0.1, 0.06, mouthMat, 0, 0.3, 0.66);
  mouth.userData.baseY = mouth.scale.y;
  mouth.userData.posY = mouth.position.y;
  head.add(mouth);
  head.add(m.box(0.9, 0.14, 0.16, white, 0, 0.44, 0.58));
  head.add(m.box(1.12, 0.6, 0.5, white, 0, -0.38, 0.38), m.box(0.75, 0.45, 0.4, white, 0, -0.82, 0.42), m.box(1.2, 0.4, 1.1, white, 0, 1.2, -0.02));
  head.add(m.box(0.28, 1.1, 0.85, white, -0.66, 0.4, -0.1), m.box(0.28, 1.1, 0.85, white, 0.66, 0.4, -0.1));
  head.add(m.box(1.2, 0.22, 1.1, gold, 0, 1.5, 0));
  for (const x of [-0.45, -0.15, 0.15, 0.45]) head.add(m.box(0.16, 0.45, 0.16, gold, x, 1.82, 0.0));
  head.scale.setScalar(1.15);
  body.add(head);
  return { root, body, head, mouth, armL, armR, trident: grip, tail, fin: finGroup };
};
