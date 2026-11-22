/**
 * Fábrica das peças 3D em blocos (estilo Minecraft, texturas de pixel):
 * tudo é feito de caixas coloridas e texturas 16x16 desenhadas por código. Provisório até a arte final.
 */
import * as THREE from 'three';
import type { AtlantisTile, CreatureType } from '../engine/atlantida';
import { PLAYER_COLORS, PLAYER_DARK, ROBOT_FAMILIES, robotFamily, teamColor } from '../game/players';

type Draw = (g: CanvasRenderingContext2D) => void;
/** Cabelo de cada time (além da cor da roupa): castanho, loiro, preto, ruivo. */
const HAIR = ['#5b3a1e', '#e0a030', '#1b1b1b', '#c0502b'];
const P = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

export class Models {
  private mats = new Map<string, THREE.Material>();
  private texs = new Map<string, THREE.CanvasTexture>();
  private unit = new THREE.BoxGeometry(1, 1, 1);
  private hexGeos = new Map<string, THREE.CylinderGeometry>();

  /* ---------- texturas e materiais ---------- */

  tex(key: string, w: number, h: number, draw: Draw): THREE.CanvasTexture {
    let t = this.texs.get(key);
    if (!t) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      draw(g);
      t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      this.texs.set(key, t);
    }
    return t;
  }
  noise(key: string, base: [number, number, number], vary: number, seed: number, extra?: Draw): THREE.CanvasTexture {
    return this.tex(key, 16, 16, (g) => {
      let s = seed;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const k = 1 + (rnd() - 0.5) * vary;
          g.fillStyle = `rgb(${Math.min(255, base[0] * k) | 0},${Math.min(255, base[1] * k) | 0},${Math.min(255, base[2] * k) | 0})`;
          g.fillRect(x, y, 1, 1);
        }
      extra?.(g);
    });
  }
  solid(color: string | number, emissive = 0): THREE.MeshStandardMaterial {
    const key = `s${color}-${emissive}`;
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
      if (emissive) {
        m.emissive = new THREE.Color(color);
        m.emissiveIntensity = emissive;
      }
      this.mats.set(key, m);
    }
    return m;
  }
  glass(color: string, opacity: number): THREE.MeshStandardMaterial {
    const key = `g${color}-${opacity}`;
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0, transparent: true, opacity, emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
      this.mats.set(key, m);
    }
    return m;
  }
  /** Halo de luz suave (some nas bordas), somado à cor do que está atrás. */
  glowMat(color: string): THREE.SpriteMaterial {
    const key = `glow${color}`;
    let m = this.mats.get(key) as unknown as THREE.SpriteMaterial | undefined;
    if (!m) {
      const tex = this.tex(key, 64, 64, (c) => {
        const r = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        r.addColorStop(0, color + 'cc');
        r.addColorStop(0.3, color + '66');
        r.addColorStop(1, color + '00');
        c.fillStyle = r;
        c.fillRect(0, 0, 64, 64);
      });
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.mats.set(key, m as unknown as THREE.Material);
    }
    return m;
  }
  textured(key: string, w: number, h: number, draw: Draw): THREE.MeshStandardMaterial {
    const mk = `t${key}`;
    let m = this.mats.get(mk) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.tex(key, w, h, draw), roughness: 0.9, metalness: 0 });
      this.mats.set(mk, m);
    }
    return m;
  }

  /* ---------- blocos ---------- */

  box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.unit, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  add(g: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number, emissive = 0) {
    g.add(this.box(w, h, d, this.solid(color, emissive), x, y, z));
  }
  hexGeo(radius: number, h: number): THREE.CylinderGeometry {
    const k = `${radius}-${h}`;
    let g = this.hexGeos.get(k);
    if (!g) this.hexGeos.set(k, (g = new THREE.CylinderGeometry(radius, radius, h, 6)));
    return g;
  }

  /* ---------- terrenos (topo com textura de pixel) ---------- */

  /** [lado, topo, base] de um prisma hexagonal. */
  terrain(kind: 'water' | 'beach' | 'forest' | 'mountain' | 'marble' | 'block' | 'temple' | 'sealed'): THREE.Material[] {
    const key = `terrain-${kind}`;
    let mats = this.cache.get(key);
    if (mats) return mats;
    const spec = {
      water: { side: '#2a6fba', top: this.noise('nWater', [47, 127, 209], 0.1, 11, (g) => { P(g, 2, 3, 4, 1, 'rgba(255,255,255,0.18)'); P(g, 9, 10, 5, 1, 'rgba(255,255,255,0.18)'); }) },
      beach: { side: '#c9b06a', top: this.noise('nBeach', [232, 210, 138], 0.1, 21, (g) => { P(g, 4, 5, 1, 1, '#cdb36b'); P(g, 11, 9, 1, 1, '#cdb36b'); }) },
      forest: { side: '#2f7a39', top: this.noise('nForest', [63, 155, 74], 0.18, 31, (g) => { P(g, 3, 4, 2, 2, '#2f7a39'); P(g, 10, 10, 2, 2, '#2f7a39'); }) },
      mountain: { side: '#6f737c', top: this.noise('nMountain', [139, 143, 153], 0.14, 41, (g) => { for (const [x, y] of [[2, 3], [11, 2], [6, 8], [13, 11], [3, 13], [9, 14]]) P(g, x, y, 2, 1, '#6a6e77'); }) },
      marble: { side: '#a9d3d6', top: this.noise('nMarble', [226, 244, 242], 0.06, 51, (g) => { P(g, 0, 7, 16, 1, '#cfe6e6'); P(g, 7, 0, 1, 16, '#cfe6e6'); P(g, 2, 2, 3, 1, '#ffffff'); }) },
      block: { side: '#d6cfb8', top: this.noise('nBlock', [236, 228, 200], 0.07, 61, (g) => { P(g, 0, 0, 16, 1, '#c4bca0'); P(g, 0, 8, 16, 1, '#c4bca0'); P(g, 5, 0, 1, 8, '#c4bca0'); P(g, 11, 8, 1, 8, '#c4bca0'); }) },
      // Castelo desperto: mármore claro com mosaico dourado e água-marinha no piso
      temple: { side: '#ebe5d3', top: this.noise('nTemple', [242, 236, 218], 0.05, 71, (g) => { P(g, 0, 0, 16, 1, '#e0b032'); P(g, 0, 15, 16, 1, '#e0b032'); P(g, 0, 0, 1, 16, '#e0b032'); P(g, 15, 0, 1, 16, '#e0b032'); P(g, 5, 5, 6, 6, '#3fc6c0'); P(g, 7, 7, 2, 2, '#ffe27a'); }) },
      // Castelo adormecido: o mesmo mármore, mas apagado e coberto de limo do fundo do mar
      sealed: { side: '#a7b3ad', top: this.noise('nSealed', [168, 180, 172], 0.12, 81, (g) => { P(g, 0, 0, 16, 1, '#8a9a8e'); P(g, 0, 15, 16, 1, '#8a9a8e'); P(g, 5, 5, 6, 6, '#6f8378'); P(g, 2, 11, 3, 2, '#5f8a5a'); P(g, 11, 3, 2, 2, '#5f8a5a'); }) },
    }[kind];
    const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: spec.top, roughness: 0.9, metalness: 0 });
    mats = [this.solid(spec.side), topMat, this.solid(spec.side)];
    this.cache.set(key, mats);
    return mats;
  }
  private cache = new Map<string, THREE.Material[]>();

  /* ---------- decorações das peças de Atlântida ---------- */

  /** `v` (0 a 1) varia o desenho de cada casa: fontes e ruínas nunca saem idênticas. */
  /** `portalOn`: com menos de 2 Portais revelados, o Portal fica cinza e parado (desligado). */
  decor(tile: AtlantisTile, v = 0.5, portalOn = true, relic = true): THREE.Group {
    const g = new THREE.Group();
    let seed = Math.floor(v * 1e6) + 1;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const between = (a: number, b: number) => a + (b - a) * rnd();
    switch (tile) {
      case 'crystal': {
        // pedra preciosa no formato do ícone de cristal: mesa reta em cima, coroa larga e ponta embaixo, girando e brilhando
        const gem = new THREE.Group();
        const layers: [number, number, string][] = [
          [0.12, 0.05, '#08797a'], // ponta (mais escura)
          [0.2, 0.06, '#0c9894'],
          [0.28, 0.07, '#13b8b0'],
          [0.36, 0.08, '#1fd3c8'],
          [0.42, 0.07, '#4fe9de'], // cintura (a parte mais larga)
          [0.34, 0.07, '#8cf4ec'], // coroa
          [0.22, 0.04, '#d2fffa'], // mesa (a mais clara)
        ];
        let y = 0;
        for (const [w, h, col] of layers) {
          gem.add(this.box(w, h, w * 0.62, this.solid(col, 0.4), 0, y, 0));
          y += h;
        }
        // facetas claras e um ponto de luz
        gem.add(this.box(0.06, 0.12, 0.02, this.solid('#ffffff', 1), -0.08, 0.2, 0.13));
        gem.add(this.box(0.04, 0.04, 0.02, this.solid('#ffffff', 1), 0.1, 0.36, 0.11));
        gem.position.y = 0.12;
        gem.userData.spin = 1.2;
        gem.userData.bob = 0.05;
        g.add(gem);
        // brilho: um halo que pulsa em volta da pedra e faíscas que piscam
        const halo = new THREE.Sprite(this.glowMat('#5ff5e6'));
        halo.scale.setScalar(0.8);
        halo.position.y = 0.33;
        halo.userData.pulse = 0.8;
        g.add(halo);
        for (const [x, yy, z, ph] of [[0.24, 0.5, 0.05, 0], [-0.22, 0.3, -0.08, 2.1], [0.05, 0.62, -0.18, 4.2]]) {
          const sp = new THREE.Sprite(this.glowMat('#ffffff'));
          sp.position.set(x, yy, z);
          sp.scale.setScalar(0.14);
          sp.userData.twinkle = ph;
          g.add(sp);
        }
        break;
      }
      case 'column':
        this.add(g, 0.34, 0.05, 0.34, '#fff7e0', 0, 0, 0);
        this.add(g, 0.22, 0.5, 0.22, '#ffffff', 0, 0.05, 0);
        this.add(g, 0.1, 0.5, 0.04, '#dfeff0', 0, 0.05, 0.12);
        this.add(g, 0.34, 0.07, 0.34, '#fff7e0', 0, 0.55, 0);
        break;
      case 'portal': {
        // anel violeta de pé, girando
        const ring = new THREE.Group();
        const n = 20; // mais quadradinhos e menores: o anel fica mais redondo
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ring.add(this.box(0.065, 0.065, 0.07, portalOn ? this.solid('#b07cff', 0.8) : this.solid('#8a8a92'), Math.cos(a) * 0.3, 0.36 + Math.sin(a) * 0.3 - 0.0325, 0));
        }
        if (portalOn) {
          ring.add(this.box(0.4, 0.4, 0.02, this.glass('#c9a8ff', 0.5), 0, 0.16, 0)); // o "espelho" só aparece ligado
          ring.userData.spin = 0.8;
        } else ring.rotation.y = 0.8; // parado e meio de lado, para o anel aparecer inteiro
        g.add(ring);
        this.add(g, 0.5, 0.06, 0.2, portalOn ? '#8f6fd6' : '#6d6d74', 0, 0, 0);
        g.scale.setScalar(1.5); // portal grande, fácil de ver de longe (sem invadir a casa vizinha)
        break;
      }
      case 'trident': {
        this.add(g, 0.05, 0.62, 0.05, '#f2c80f', 0, 0, 0);
        this.add(g, 0.26, 0.05, 0.05, '#f2c80f', 0, 0.42, 0);
        for (const x of [-0.11, 0, 0.11]) this.add(g, 0.05, 0.2, 0.05, '#ffd84a', x, 0.45, 0, 0.3);
        g.userData.spin = 0.7;
        break;
      }
      case 'calm':
        for (let i = 0; i < 3; i++) this.add(g, 0.5 - i * 0.1, 0.05, 0.12, i % 2 ? '#bfe6f5' : '#8cc4ee', 0, 0.02 + i * 0.07, -0.1 + i * 0.1, 0.2);
        break;
      case 'shield':
        this.add(g, 0.4, 0.46, 0.1, '#d8232a', 0, 0.05, 0);
        this.add(g, 0.1, 0.4, 0.12, '#fff7e0', 0, 0.08, 0);
        this.add(g, 0.34, 0.08, 0.12, '#fff7e0', 0, 0.28, 0);
        this.add(g, 0.2, 0.08, 0.1, '#d8232a', 0, 0, 0);
        break;
      case 'ruin': {
        // ruína de mármore, no mesmo branco da Coluna de Atlântida: uma coluna em pé (inteira ou quebrada), outra caída
        // por cima em pedaço inclinado, e dois cacos no chão. Cada casa sorteia alturas e posições um pouco diferentes.
        const white = '#ffffff';
        const cream = '#fff7e0';
        const vein = '#dfeff0';
        // para não poluir: só as Ruínas marcadas (relic) mostram restos; as outras ficam como mármore limpo
        if (!relic) break;
        const x0 = between(-0.18, 0.02);
        const z0 = between(-0.16, 0.02);
        const h = between(0.38, 0.55);
        const whole = rnd() > 0.5;
        this.add(g, 0.32, 0.05, 0.32, cream, x0, 0, z0); // base
        this.add(g, 0.2, h, 0.2, white, x0, 0.05, z0); // fuste
        this.add(g, 0.09, h * 0.92, 0.04, vein, x0, 0.07, z0 + 0.1); // estria
        if (whole) {
          this.add(g, 0.32, 0.06, 0.32, cream, x0, 0.05 + h, z0); // capitel
        } else {
          this.add(g, 0.13, 0.07, 0.16, white, x0 - 0.03, 0.05 + h, z0); // topo quebrado, em degrau
          this.add(g, 0.07, 0.04, 0.09, white, x0 - 0.06, 0.12 + h, z0);
        }
        // a outra coluna, caída e inclinada, encostada na de pé
        const fallen = new THREE.Group();
        fallen.position.set(x0 + 0.26, 0.02, z0 + between(0.12, 0.22));
        fallen.rotation.y = between(-0.5, 0.2);
        fallen.rotation.z = 0.45;
        fallen.add(this.box(0.44, 0.18, 0.18, this.solid(white), 0, 0, 0));
        fallen.add(this.box(0.4, 0.04, 0.08, this.solid(vein), 0, 0.17, 0));
        fallen.add(this.box(0.07, 0.2, 0.2, this.solid(cream), -0.22, -0.01, 0)); // ponta quebrada
        g.add(fallen);
        // dois cacos no chão
        this.add(g, 0.16, 0.08, 0.13, white, between(0.18, 0.34), 0, between(-0.36, -0.2));
        this.add(g, 0.11, 0.06, 0.09, cream, between(-0.38, -0.24), 0, between(0.22, 0.34));
        break;
      }
    }
    return g;
  }

  /* ---------- personagens ---------- */

  private face(player: number, index: number): THREE.MeshStandardMaterial {
    const hair = HAIR[player];
    return this.textured(`faceBuilder${player}-${index}`, 16, 16, (g) => {
      P(g, 0, 0, 16, 16, '#f5c9a0');
      if (index === 0) P(g, 0, 0, 16, 4, hair); // franja
      else P(g, 0, 0, 16, 2, hair);
      P(g, 0, 4, 2, 5, hair);
      P(g, 14, 4, 2, 5, hair);
      // sobrancelhas, olhos e boca (o 2º tem sobrancelha grossa e sorriso de canto)
      P(g, 3, index === 0 ? 6 : 5, 4, index === 0 ? 1 : 2, '#3a2814');
      P(g, 9, index === 0 ? 6 : 5, 4, index === 0 ? 1 : 2, '#3a2814');
      P(g, 3, 7, 4, 3, '#ffffff');
      P(g, 9, 7, 4, 3, '#ffffff');
      P(g, 5, 7, 2, 3, '#1f5fa8');
      P(g, 9, 7, 2, 3, '#1f5fa8');
      P(g, 6, 8, 1, 1, '#ffffff');
      P(g, 10, 8, 1, 1, '#ffffff');
      if (index === 0) {
        // capitão: bigode e barba cheia
        P(g, 4, 10, 8, 1, '#2a1a0c'); // bigode
        P(g, 2, 13, 12, 3, '#2a1a0c'); // barba no queixo
        P(g, 6, 11, 4, 1, '#8c3a3a');
        P(g, 8, 6, 6, 5, '#111111'); // tapa-olho no olho direito
        P(g, 0, 5, 16, 1, '#111111'); // tira
      } else {
        // marujo: cicatriz e sorriso torto (o tapa-olho é só do capitão)
        P(g, 12, 6, 1, 4, '#c97a6a');
        P(g, 6, 12, 5, 1, '#8c3a3a');
        P(g, 11, 11, 1, 1, '#8c3a3a');
        P(g, 7, 12, 1, 1, '#ffffff'); // dente de ouro
      }
    });
  }

  /**
   * Pirata de Atlântida: casaco listrado nas cores da tripulação, cinto com fivela de ouro e bota.
   * O 1º é o capitão (chapéu de três pontas, barba, tapa-olho e sabre); o 2º é o marujo (lenço de touca, brinco e gancho).
   */
  builder(player: number, index = 0): THREE.Group {
    if (robotFamily(player)) return this.robot(player, index); // os bots são piratas robôs
    const T = PLAYER_COLORS[player];
    const D = PLAYER_DARK[player];
    const hair = HAIR[player];
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const tan = this.solid('#c9a56a');
    const wood = this.solid('#8b5a2b');
    const steel = this.solid('#9ea3ad');
    g.userData.captain = index === 0; // o capitão tem perna de pau (e só ele perde o equilíbrio nos movimentos de espera)
    for (const sx of [-0.07, 0.07]) {
      if (index === 0 && sx > 0) {
        // perna de pau: só a haste de madeira, sem sapato (a ponta toca o chão), com uma cinta no alto
        inner.add(this.box(0.05, 0.22, 0.05, wood, sx, 0, 0));
        inner.add(this.box(0.09, 0.03, 0.09, this.solid('#5b3a1e'), sx, 0.16, 0));
        continue;
      }
      const foot = this.box(0.13, 0.07, 0.17, this.solid('#6b3d1a'), sx, 0, 0.02);
      if (sx < 0) g.userData.foot = foot; // o pé esquerdo bate no chão nos movimentos de espera
      g.add(foot);
      inner.add(this.box(0.11, 0.14, 0.11, tan, sx, 0.07, 0));
    }
    // torso, cinto de ferramentas e alças
    inner.add(this.box(0.27, 0.26, 0.16, this.solid(T), 0, 0.21, 0));
    inner.add(this.box(0.28, 0.05, 0.17, this.solid('#5b3a1e'), 0, 0.22, 0));
    inner.add(this.box(0.06, 0.05, 0.02, this.solid('#f2c80f', 0.3), 0, 0.22, 0.09));
    for (const y of [0.13, 0.3, 0.35]) inner.add(this.box(0.28, 0.025, 0.165, this.solid('#fff7e0'), 0, y, 0)); // listras de marinheiro
    inner.add(this.box(0.08, 0.08, 0.05, this.solid('#f2c80f', 0.4), -0.13, 0.17, 0.09)); // bolsa de moedas
    const beltGun = this.box(0.04, 0.1, 0.03, this.solid('#2a2a2a'), 0.13, 0.17, 0.1); // pistola no cinto (sai dali nos movimentos de espera)
    inner.add(beltGun);
    g.userData.beltGun = beltGun;
    // braços: o direito segura a ferramenta e balança ao construir
    const mkArm = (sx: number) => {
      const arm = new THREE.Group();
      arm.position.set(sx, 0.45, 0);
      arm.add(this.box(0.09, 0.1, 0.1, this.solid(T), 0, -0.1, 0));
      arm.add(this.box(0.09, 0.12, 0.1, this.solid('#f5c9a0'), 0, -0.22, 0));
      arm.add(this.box(0.1, 0.07, 0.11, this.solid('#a8742f'), 0, -0.29, 0));
      return arm;
    };
    const armL = mkArm(-0.18);
    const armR = mkArm(0.18);
    const tool = new THREE.Group();
    tool.position.set(0, -0.3, 0.05);
    tool.add(this.box(0.04, 0.3, 0.04, wood, 0, -0.04, 0));
    if (index === 0) {
      tool.add(this.box(0.14, 0.03, 0.05, this.solid('#f2c80f', 0.3), 0, 0.12, 0)); // sabre: guarda dourada
      tool.add(this.box(0.035, 0.34, 0.02, this.solid('#e4e8ee'), 0, 0.3, 0)); // lâmina
      tool.add(this.box(0.04, 0.05, 0.03, this.solid('#e4e8ee'), 0, 0.5, 0)); // ponta
    } else {
      tool.add(this.box(0.06, 0.08, 0.06, steel, 0, 0.14, 0)); // gancho no lugar da mão
      tool.add(this.box(0.04, 0.16, 0.04, steel, 0, 0.24, 0));
      tool.add(this.box(0.1, 0.04, 0.04, steel, 0.04, 0.34, 0));
      tool.add(this.box(0.04, 0.08, 0.04, steel, 0.08, 0.3, 0));
    }
    armR.add(tool);
    armR.rotation.x = -0.25;
    inner.add(armL, armR);
    g.userData.tool = tool; // o sabre (capitão) ou o gancho (marujo): gira na mão nos movimentos de espera
    if (index === 0) g.userData.fencer = true;
    else g.userData.hookTop = new THREE.Vector3(0.04, 0.41, 0); // onde uma bola se equilibra no gancho
    // cabeça
    const skin = this.solid('#f5c9a0');
    const hairM = this.solid(hair);
    inner.add(this.box(0.3, 0.3, 0.3, [skin, skin, hairM, skin, this.face(player, index), hairM], 0, 0.48, 0));
    inner.add(this.box(0.32, 0.16, 0.05, hairM, 0, 0.56, -0.15)); // cabelo atrás
    if (index === 1) {
      // lenço amarrado rente à cabeça, como uma touca de pano: cobre só o alto do crânio, deixa a testa e as orelhas livres
      // e termina num nó atrás, com duas pontas soltas
      const scarf = this.solid(T);
      const scarfD = this.solid(D);
      inner.add(this.box(0.33, 0.05, 0.33, scarf, 0, 0.75, 0)); // topo, rente ao crânio
      inner.add(this.box(0.33, 0.04, 0.03, scarf, 0, 0.72, 0.16)); // borda na testa
      for (const sx of [-0.16, 0.16]) inner.add(this.box(0.03, 0.08, 0.3, scarf, sx, 0.69, 0)); // laterais curtas, acima das orelhas
      inner.add(this.box(0.33, 0.14, 0.03, scarf, 0, 0.64, -0.16)); // atrás, sobre o cabelo da nuca
      // estampa de cachemira: gotinhas escuras espalhadas
      for (const [x, z, w, d] of [[-0.09, 0.05, 0.07, 0.04], [0.07, 0.08, 0.04, 0.07], [0.02, -0.07, 0.08, 0.04], [-0.1, -0.08, 0.04, 0.06], [0.11, -0.04, 0.06, 0.04]]) inner.add(this.box(w, 0.012, d, scarfD, x, 0.8, z));
      for (const sx of [-0.165, 0.165]) inner.add(this.box(0.012, 0.04, 0.07, scarfD, sx, 0.7, 0.04));
      // nó e pontas soltas
      inner.add(this.box(0.09, 0.09, 0.06, scarfD, 0.06, 0.66, -0.2));
      const tailA = this.box(0.06, 0.17, 0.025, scarf, 0.12, 0.5, -0.22);
      tailA.rotation.z = -0.45;
      const tailB = this.box(0.06, 0.13, 0.025, scarfD, 0.02, 0.52, -0.22);
      tailB.rotation.z = 0.3;
      inner.add(tailA, tailB);
      inner.add(this.box(0.04, 0.07, 0.04, this.solid('#f2c80f', 0.6), 0.17, 0.55, 0.04)); // brinco de ouro
    } else {
      const black = this.solid('#1b1b1b');
      inner.add(this.box(0.36, 0.03, 0.36, black, 0, 0.75, 0)); // chapéu de três pontas: aba
      inner.add(this.box(0.26, 0.1, 0.26, black, 0, 0.78, 0)); // copa
      inner.add(this.box(0.05, 0.09, 0.34, black, -0.19, 0.77, 0)); // abas dobradas para cima
      inner.add(this.box(0.05, 0.09, 0.34, black, 0.19, 0.77, 0));
      inner.add(this.box(0.26, 0.03, 0.26, this.solid(T), 0, 0.76, 0)); // faixa da tripulação
      inner.add(this.box(0.06, 0.06, 0.03, this.solid('#fff7e0'), 0, 0.8, 0.14)); // caveira
    }
    g.userData.armR = armR;
    g.userData.armL = armL;
    g.add(inner);
    return g;
  }

  /**
   * Pirata robô (só os bots): corpo de metal com placas na cor da família, olhos que brilham e antena.
   * Cada família tem uma cabeça diferente (Latão: redonda com escotilha; Cobalto: quadrada com visor; Coral: alta com dois olhos).
   * O 1º é o capitão (chapéu de três pontas e olho de luneta); o 2º é o marujo (lenço de metal e gancho).
   */
  robot(player: number, index = 0): THREE.Group {
    const f = robotFamily(player)!;
    const fam = ROBOT_FAMILIES.indexOf(f);
    const T = this.solid(f.color);
    const D = this.solid(f.dark);
    const metal = this.solid(f.metal);
    const darkMetal = this.solid('#3d4249');
    const glow = this.solid(f.glow, 1.2);
    const g = new THREE.Group();
    const inner = new THREE.Group();
    // pés de ferro e pernas de pistão
    for (const sx of [-0.07, 0.07]) {
      g.add(this.box(0.13, 0.06, 0.18, darkMetal, sx, 0, 0.02));
      inner.add(this.box(0.07, 0.14, 0.07, metal, sx, 0.06, 0));
      inner.add(this.box(0.1, 0.03, 0.1, D, sx, 0.1, 0)); // junta
    }
    // tronco: caixa de metal com placa na cor da família, painel de luzes e rebites
    inner.add(this.box(0.28, 0.26, 0.17, metal, 0, 0.2, 0));
    inner.add(this.box(0.24, 0.18, 0.02, T, 0, 0.24, 0.085));
    inner.add(this.box(0.12, 0.08, 0.02, darkMetal, 0, 0.28, 0.096)); // painel
    for (const [x, c] of [[-0.035, glow], [0, this.solid('#ffffff', 0.8)], [0.035, glow]] as const) inner.add(this.box(0.022, 0.022, 0.012, c, x, 0.31, 0.106));
    inner.add(this.box(0.29, 0.04, 0.18, D, 0, 0.2, 0)); // cinturão
    inner.add(this.box(0.05, 0.05, 0.02, this.solid('#f2c80f', 0.4), 0, 0.195, 0.095)); // fivela
    for (const x of [-0.11, 0.11]) inner.add(this.box(0.025, 0.025, 0.015, darkMetal, x, 0.4, 0.088)); // rebites
    inner.add(this.box(0.08, 0.06, 0.05, this.solid('#f2c80f', 0.4), -0.13, 0.15, 0.09)); // cofre de moedas
    // braços articulados (o direito segura a ferramenta e balança ao construir)
    const mkArm = (sx: number) => {
      const arm = new THREE.Group();
      arm.position.set(sx, 0.45, 0);
      arm.add(this.box(0.1, 0.08, 0.1, T, 0, -0.08, 0)); // ombreira
      arm.add(this.box(0.06, 0.14, 0.06, metal, 0, -0.2, 0));
      arm.add(this.box(0.09, 0.06, 0.09, darkMetal, 0, -0.29, 0)); // garra
      return arm;
    };
    const armL = mkArm(-0.19);
    const armR = mkArm(0.19);
    const tool = new THREE.Group();
    tool.position.set(0, -0.3, 0.05);
    if (index === 0) {
      tool.add(this.box(0.04, 0.1, 0.04, darkMetal, 0, -0.02, 0)); // cabo
      tool.add(this.box(0.14, 0.03, 0.05, this.solid('#f2c80f', 0.3), 0, 0.06, 0));
      tool.add(this.box(0.035, 0.36, 0.02, this.solid(f.glow, 0.9), 0, 0.24, 0)); // sabre de luz da cor dos olhos
    } else {
      const steel = this.solid('#c9ced6');
      tool.add(this.box(0.04, 0.18, 0.04, steel, 0, 0.06, 0)); // gancho
      tool.add(this.box(0.1, 0.04, 0.04, steel, 0.04, 0.16, 0));
      tool.add(this.box(0.04, 0.08, 0.04, steel, 0.08, 0.12, 0));
    }
    armR.add(tool);
    armR.rotation.x = -0.25;
    inner.add(armL, armR);
    g.userData.tool = tool;
    if (index === 0) g.userData.fencer = true;
    else g.userData.hookTop = new THREE.Vector3(0.04, 0.23, 0);
    // pescoço e cabeça (cada família tem um formato)
    inner.add(this.box(0.1, 0.05, 0.1, darkMetal, 0, 0.45, 0));
    let top = 0.78;
    if (fam === 0) {
      // Latão: cabeça larga e baixa, uma escotilha redonda no lugar dos olhos
      inner.add(this.box(0.32, 0.26, 0.28, metal, 0, 0.49, 0));
      inner.add(this.box(0.34, 0.05, 0.3, T, 0, 0.6, 0)); // faixa
      inner.add(this.box(0.16, 0.12, 0.03, darkMetal, 0, 0.56, 0.14));
      inner.add(this.box(0.1, 0.08, 0.02, glow, 0, 0.58, 0.155)); // olho único
      inner.add(this.box(0.18, 0.03, 0.02, darkMetal, 0, 0.52, 0.145)); // grade da boca
      top = 0.75;
    } else if (fam === 1) {
      // Cobalto: cabeça quadrada com visor que atravessa o rosto
      inner.add(this.box(0.3, 0.3, 0.3, metal, 0, 0.48, 0));
      inner.add(this.box(0.31, 0.08, 0.02, darkMetal, 0, 0.6, 0.15));
      inner.add(this.box(0.26, 0.04, 0.01, glow, 0, 0.62, 0.162)); // visor aceso
      inner.add(this.box(0.31, 0.04, 0.31, T, 0, 0.5, 0)); // queixo na cor
      for (const sx of [-0.16, 0.16]) inner.add(this.box(0.03, 0.1, 0.1, D, sx, 0.58, 0)); // parafusos das orelhas
    } else {
      // Coral: cabeça alta e estreita com dois olhos redondos
      inner.add(this.box(0.26, 0.34, 0.26, metal, 0, 0.48, 0));
      inner.add(this.box(0.27, 0.06, 0.27, T, 0, 0.74, 0));
      for (const sx of [-0.06, 0.06]) {
        inner.add(this.box(0.08, 0.08, 0.02, darkMetal, sx, 0.6, 0.13));
        inner.add(this.box(0.05, 0.05, 0.02, glow, sx, 0.615, 0.142));
      }
      inner.add(this.box(0.12, 0.03, 0.02, D, 0, 0.53, 0.135));
      top = 0.82;
    }
    // antena com luz na ponta (fica atrás do chapéu ou do lenço)
    inner.add(this.box(0.02, 0.12, 0.02, darkMetal, 0.1, top - 0.02, -0.08));
    inner.add(this.box(0.05, 0.05, 0.05, glow, 0.1, top + 0.1, -0.08));
    if (index === 0) {
      // capitão: chapéu de três pontas de ferro, com faixa da família, e luneta no olho
      const black = this.solid('#1b1b1b');
      inner.add(this.box(0.36, 0.03, 0.36, black, 0, top - 0.03, 0));
      inner.add(this.box(0.26, 0.1, 0.26, black, 0, top, 0));
      inner.add(this.box(0.05, 0.09, 0.34, black, -0.19, top - 0.01, 0));
      inner.add(this.box(0.05, 0.09, 0.34, black, 0.19, top - 0.01, 0));
      inner.add(this.box(0.26, 0.03, 0.26, T, 0, top - 0.02, 0));
      inner.add(this.box(0.06, 0.06, 0.03, this.solid('#fff7e0'), 0, top + 0.02, 0.14)); // caveira
      inner.add(this.box(0.06, 0.06, 0.06, this.solid('#f2c80f', 0.3), -0.1, 0.6, 0.15)); // luneta de latão
    } else {
      // marujo: lenço de chapa na cor da família, com nó atrás
      inner.add(this.box(0.31, 0.05, 0.31, T, 0, top - 0.04, 0));
      inner.add(this.box(0.31, 0.12, 0.03, T, 0, top - 0.14, -0.15));
      inner.add(this.box(0.08, 0.08, 0.05, D, 0.06, top - 0.12, -0.19));
      inner.add(this.box(0.04, 0.07, 0.04, this.solid('#f2c80f', 0.6), 0.16, 0.52, 0.04)); // brinco
    }
    g.userData.armR = armR;
    g.userData.armL = armL;
    g.add(inner);
    return g;
  }

  /** Enfeites da superfície da ilha: palmeira, arbusto ou tufo de mato, num canto da casa (o meio fica livre). */
  flora(kind: 'palm' | 'bush' | 'grass', v: number): THREE.Group {
    const g = new THREE.Group();
    const a = v * Math.PI * 2;
    const ox = Math.sin(a) * 0.48;
    const oz = Math.cos(a) * 0.48;
    const leaf = this.solid('#3f9a3a');
    const leafL = this.solid('#62bf4a');
    if (kind === 'palm') {
      // palmeira: tronco curvo em 3 blocos (inclina para dentro da casa) e copa pixelada de 4 folhas
      const len = Math.hypot(ox, oz) || 1;
      const inX = -ox / len;
      const inZ = -oz / len;
      g.add(this.box(0.13, 0.34, 0.13, this.solid('#8b5a2b'), ox, 0, oz));
      g.add(this.box(0.12, 0.32, 0.12, this.solid('#9b6530'), ox + inX * 0.04, 0.32, oz + inZ * 0.04));
      g.add(this.box(0.11, 0.28, 0.11, this.solid('#a66d35'), ox + inX * 0.1, 0.62, oz + inZ * 0.1));
      const cx = ox + inX * 0.14;
      const cz = oz + inZ * 0.14;
      const cy = 0.9;
      const frond = this.solid('#2f8f43');
      for (const [dx, dz, rot] of [[0.26, 0, 0], [-0.26, 0, 0], [0, 0.26, Math.PI / 2], [0, -0.26, Math.PI / 2]] as const) {
        const leafB = this.box(0.42, 0.07, 0.16, frond, cx + dx, cy, cz + dz);
        leafB.rotation.y = rot;
        g.add(leafB);
      }
      g.add(this.box(0.24, 0.1, 0.24, this.solid('#49ad51'), cx, cy + 0.04, cz));
    } else if (kind === 'bush') {
      g.add(this.box(0.26, 0.16, 0.24, leaf, ox, 0, oz));
      g.add(this.box(0.18, 0.12, 0.18, leafL, ox + 0.05, 0.14, oz - 0.03));
      g.add(this.box(0.14, 0.1, 0.14, leaf, ox - 0.1, 0.08, oz + 0.08));
      g.add(this.box(0.05, 0.05, 0.05, this.solid('#e2445c'), ox + 0.08, 0.2, oz + 0.06)); // frutinha
    } else {
      for (const [dx, dz, h] of [[0, 0, 0.12], [0.06, 0.04, 0.08], [-0.05, 0.05, 0.1], [0.03, -0.06, 0.07]] as const)
        g.add(this.box(0.03, h, 0.03, h > 0.09 ? leafL : leaf, ox + dx, 0, oz + dz));
    }
    return g;
  }

  /** Boia salva-vidas: anel vermelho e branco, como um donut (o construtor senta nela). */
  lifebuoy(): THREE.Group {
    const g = new THREE.Group();
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const seg = this.box(0.2, 0.14, 0.2, this.solid(i % 3 === 0 ? '#fff7e0' : '#d8232a'), Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
      seg.rotation.y = -a;
      g.add(seg);
    }
    return g;
  }

  /** Bote a remo de madeira com dois bancos (cabem 2 piratas), a faixa na cor do time e dois pares de remos. */
  rowboat(player: number): THREE.Group {
    if (robotFamily(player)) return this.robotBoat(player); // os robôs usam uma lancha-submarino
    const g = new THREE.Group();
    const wood = '#7a4a26';
    const L = 1.0;
    this.add(g, L, 0.1, 0.38, '#5c3519', 0, 0, 0); // fundo
    this.add(g, L + 0.04, 0.14, 0.06, wood, 0, 0.08, 0.18); // laterais
    this.add(g, L + 0.04, 0.14, 0.06, wood, 0, 0.08, -0.18);
    this.add(g, 0.08, 0.18, 0.3, wood, L / 2 + 0.02, 0.08, 0); // proa e popa
    this.add(g, 0.08, 0.14, 0.3, wood, -L / 2 - 0.02, 0.06, 0);
    for (const x of [-0.24, 0.24]) this.add(g, 0.08, 0.03, 0.34, '#a0703f', x, 0.12, 0); // bancos
    this.add(g, L + 0.06, 0.04, 0.07, teamColor(player), 0, 0.2, 0.18); // faixa do time
    this.add(g, L + 0.06, 0.04, 0.07, teamColor(player), 0, 0.2, -0.18);
    const oar = (x: number, z: number, a: number) => {
      const o = this.box(0.05, 0.04, 0.5, this.solid('#c99a5b'), x, 0.2, z);
      o.rotation.x = a;
      g.add(o);
    };
    for (const x of [-0.24, 0.24]) {
      oar(x, 0.36, 0.35);
      oar(x, -0.36, -0.35);
    }
    return g;
  }

  /**
   * Navio dos piratas robôs: casco de chapa rebitada, escotilhas acesas na cor dos olhos da família, duas chaminés,
   * mastro de antena com radar e velas de placas metálicas na cor da família. A bandeira tem uma caveira de robô.
   */
  robotShip(player: number): THREE.Group {
    const f = robotFamily(player)!;
    const g = new THREE.Group();
    const T = this.solid(f.color);
    const D = this.solid(f.dark);
    const plate = this.solid('#5d6670');
    const plateDark = this.solid('#3a4148');
    const deck = this.solid('#8d969f');
    const glow = this.solid(f.glow, 1.3);
    // casco de chapa em degraus, proa para +x
    g.add(this.box(1.3, 0.16, 0.44, plateDark, 0, 0, 0));
    g.add(this.box(1.5, 0.2, 0.6, plate, 0, 0.14, 0));
    g.add(this.box(0.3, 0.2, 0.42, plate, 0.86, 0.18, 0)); // proa
    g.add(this.box(0.2, 0.1, 0.2, D, 1.06, 0.26, 0)); // aríete na cor da família
    g.add(this.box(0.3, 0.36, 0.64, plate, -0.62, 0.3, 0)); // ponte de comando
    g.add(this.box(1.52, 0.05, 0.62, D, 0, 0.3, 0)); // faixa grossa da família no casco
    g.add(this.box(1.3, 0.04, 0.5, deck, 0.05, 0.34, 0)); // convés de metal
    g.add(this.box(0.32, 0.04, 0.56, deck, -0.62, 0.66, 0));
    // rebites e escotilhas acesas
    for (const x of [-0.5, -0.2, 0.1, 0.4, 0.65]) for (const z of [0.312, -0.312]) g.add(this.box(0.03, 0.03, 0.012, plateDark, x, 0.24, z));
    for (const x of [-0.35, -0.05, 0.25, 0.55]) for (const z of [0.31, -0.31]) g.add(this.box(0.07, 0.06, 0.01, glow, x, 0.17, z));
    for (const z of [0.326, -0.326]) g.add(this.box(0.16, 0.06, 0.012, glow, -0.62, 0.52, z)); // janela da ponte
    // chaminés com faixa da família
    for (const x of [-0.05, 0.25]) {
      g.add(this.box(0.12, 0.3, 0.12, plateDark, x, 0.36, 0));
      g.add(this.box(0.13, 0.05, 0.13, T, x, 0.56, 0));
      g.add(this.box(0.14, 0.03, 0.14, this.solid('#1e2226'), x, 0.66, 0));
    }
    // mastro de antena na ponte: radar, luz na ponta e velas de placas na cor da família
    g.add(this.box(0.05, 1.05, 0.05, plateDark, -0.62, 0.68, 0));
    g.add(this.box(0.04, 0.5, 0.56, T, -0.56, 0.9, 0)); // vela de placa
    for (const y of [0.98, 1.12, 1.26]) g.add(this.box(0.045, 0.02, 0.58, D, -0.56, y, 0)); // juntas das placas
    g.add(this.box(0.14, 0.04, 0.22, deck, -0.62, 1.5, 0)); // radar
    g.add(this.box(0.04, 0.08, 0.04, glow, -0.62, 1.73, 0)); // luz no topo
    g.add(this.box(0.04, 0.4, 0.04, plateDark, 0.55, 0.36, 0)); // antena da proa
    g.add(this.box(0.06, 0.06, 0.06, glow, 0.55, 0.76, 0));
    // bandeira: caveira de robô (cabeça quadrada, olhos acesos e parafusos cruzados)
    const flag = new THREE.Group();
    flag.position.set(-0.62, 1.56, 0.03);
    const u = 0.026;
    flag.add(this.box(0.02, 11 * u, 15 * u, this.solid('#141414'), 0, 0, 7.5 * u));
    const bone = this.solid('#d9dde2');
    const ROBOT_SKULL = [
      '...#########...',
      '...#.......#...',
      '...#.@@.@@.#...',
      '...#.......#...',
      '...#.#.#.#.#...',
      '...#########...',
      '.#...........#.',
      '..##.......##..',
      '....##...##....',
      '......###......',
      '....##...##....',
    ];
    ROBOT_SKULL.forEach((row, r) =>
      [...row].forEach((c, col) => {
        if (c === '.') return;
        for (const side of [-1, 1]) flag.add(this.box(0.008, u, u, c === '@' ? glow : bone, side * 0.017, (10 - r) * u, col * u + u / 2));
      }),
    );
    g.add(flag);
    g.userData.flag = flag; // balança ao vento (Stage3D)
    return g;
  }

  /**
   * Bote dos robôs: lancha-submarino de metal, com casco arredondado, para-brisa de vidro na frente, hélice atrás,
   * faixa e luzes na cor da família. Cabem 2 robôs sentados no meio (cabine aberta).
   */
  robotBoat(player: number): THREE.Group {
    const f = robotFamily(player)!;
    const g = new THREE.Group();
    const plate = this.solid('#6b747d');
    const plateD = this.solid('#3e454c');
    const T = this.solid(f.color);
    const glow = this.solid(f.glow, 1.3);
    const L = 1.0;
    g.add(this.box(L * 0.9, 0.08, 0.32, plateD, 0, -0.02, 0)); // quilha
    g.add(this.box(L, 0.12, 0.4, plate, 0, 0.04, 0)); // casco
    g.add(this.box(0.16, 0.1, 0.3, plate, L / 2 + 0.06, 0.05, 0)); // proa arredondada
    g.add(this.box(0.08, 0.08, 0.2, plate, L / 2 + 0.16, 0.06, 0));
    g.add(this.box(L + 0.04, 0.05, 0.42, T, 0, 0.14, 0)); // faixa da família (borda)
    g.add(this.box(0.06, 0.16, 0.32, this.glass('#bfeaff', 0.45), L / 2 - 0.05, 0.19, 0)); // para-brisa
    for (const z of [-0.21, 0.21]) for (const x of [-0.3, 0, 0.3]) g.add(this.box(0.05, 0.04, 0.012, glow, x, 0.08, z)); // luzes no casco
    // popa com hélice e antena
    g.add(this.box(0.1, 0.14, 0.24, plateD, -L / 2 - 0.04, 0.04, 0));
    g.add(this.box(0.03, 0.18, 0.04, plateD, -L / 2 - 0.12, -0.02, 0)); // hélice (pás)
    g.add(this.box(0.03, 0.04, 0.18, plateD, -L / 2 - 0.12, 0.05, 0));
    g.add(this.box(0.02, 0.22, 0.02, plateD, -L / 2 + 0.02, 0.18, 0.14));
    g.add(this.box(0.04, 0.04, 0.04, glow, -L / 2 + 0.02, 0.4, 0.14));
    return g;
  }

  /** Navio pirata do time: casco escuro, convés, dois mastros com velas na cor do time e a bandeira de caveira. */
  ship(player: number): THREE.Group {
    if (robotFamily(player)) return this.robotShip(player); // os bots navegam num navio de metal
    const g = new THREE.Group();
    const T = teamColor(player);
    const hull = '#4a2a16';
    const deck = '#a0703f';
    // casco em degraus (mais estreito embaixo), com a proa apontando para +x
    this.add(g, 1.3, 0.16, 0.44, '#2e1a0e', 0, 0, 0);
    this.add(g, 1.5, 0.2, 0.6, hull, 0, 0.14, 0);
    this.add(g, 0.3, 0.2, 0.42, hull, 0.86, 0.18, 0); // proa
    this.add(g, 0.18, 0.12, 0.26, hull, 1.04, 0.26, 0);
    this.add(g, 0.3, 0.34, 0.62, hull, -0.62, 0.3, 0); // castelo de popa (um pouco mais largo que o casco: sem faces coladas)
    this.add(g, 1.3, 0.04, 0.5, deck, 0.05, 0.34, 0); // convés
    this.add(g, 0.32, 0.04, 0.56, deck, -0.62, 0.64, 0);
    for (const x of [-0.3, 0.1, 0.5]) this.add(g, 0.06, 0.06, 0.04, '#111111', x, 0.24, 0.31); // portinholas dos canhões
    // mastros e velas
    // vela quadrada estufada (atravessada no casco) e vela comprida ao longo do casco: de qualquer ângulo uma aparece
    const mast = (x: number, h: number, w: number, along: boolean) => {
      this.add(g, 0.06, h, 0.06, '#5c3519', x, 0.36, 0);
      const y = 0.36 + h * 0.42;
      if (along) {
        this.add(g, w, w * 0.7, 0.08, '#f3ead2', x - w / 2 + 0.03, y - 0.05, 0);
        this.add(g, w + 0.03, 0.08, 0.11, T, x - w / 2 + 0.03, y + w * 0.62, 0);
      } else {
        this.add(g, 0.16, w * 0.75, w, '#f3ead2', x + 0.08, y, 0);
        this.add(g, 0.19, 0.08, w + 0.03, T, x + 0.08, y + w * 0.3, 0); // faixa um pouco maior que a vela em tudo: sem faces coladas (que piscam)
      }
    };
    mast(0.36, 0.95, 0.5, false); // as duas velas atravessadas: a vela comprida, vista de lado, parecia um defeito
    mast(-0.2, 1.2, 0.68, false);
    // bandeira pirata no topo do mastro maior: caveira e ossos cruzados em pixel, dos dois lados do pano
    const flag = new THREE.Group();
    flag.position.set(-0.2, 1.42, 0.03);
    const black = this.solid('#141414');
    const bone = this.solid('#f4efe1');
    const u = 0.026; // tamanho de um pixel da bandeira
    flag.add(this.box(0.02, 13 * u, 18 * u, black, 0, 0, 9 * u));
    const SKULL = [
      '......####......',
      '.....######.....',
      '....##.##.##....',
      '....##.##.##....',
      '.....######.....',
      '......#..#......',
      '.##..........##.',
      '...##......##...',
      '.....##..##.....',
      '.......##.......',
      '.....##..##.....',
      '...##......##...',
      '.##..........##.',
    ];
    SKULL.forEach((row, r) =>
      [...row].forEach((c, col) => {
        if (c !== '#') return;
        for (const side of [-1, 1]) flag.add(this.box(0.008, u, u, bone, side * 0.017, (12 - r) * u, (col + 1) * u + u / 2));
      }),
    );
    g.add(flag);
    g.userData.flag = flag; // balança ao vento (Stage3D)
    return g;
  }

  /** `awake`: só a Sentinela usa (olhos acesos quando há pirata perto). */
  creature(type: CreatureType, awake = false): THREE.Group {
    const g = new THREE.Group();
    if (type === 'octopus') {
      const purple = this.solid('#b0439a');
      const face = this.textured('octopusFace', 16, 16, (c) => {
        P(c, 0, 0, 16, 16, '#b0439a');
        P(c, 2, 5, 5, 6, '#fff7e0');
        P(c, 9, 5, 5, 6, '#fff7e0');
        P(c, 4, 6, 3, 4, '#16243f');
        P(c, 10, 6, 3, 4, '#16243f');
        P(c, 6, 13, 4, 1, '#7d2c6e');
      });
      g.add(this.box(0.5, 0.5, 0.5, [purple, purple, purple, purple, face, purple], 0, 0.3, 0));
      g.add(this.box(0.36, 0.14, 0.36, this.solid('#c95bb3'), 0, 0.8, 0));
      const arms = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const t = new THREE.Group();
        t.add(this.box(0.11, 0.3, 0.11, this.solid('#7d2c6e'), 0, 0, 0));
        t.add(this.box(0.1, 0.12, 0.1, this.solid('#b0439a'), 0.1, 0, 0));
        t.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
        t.rotation.y = -a;
        arms.add(t);
      }
      g.add(arms);
      g.userData.tentacles = arms.children; // para o Stage3D levantar os tentáculos de vez em quando
    } else if (type === 'leviathan') {
      // dragão-d'água roxo com listras lilás: corpo de serpente em ondas e cabeça de jacaré (focinho comprido, mandíbula com dentes, olhos no alto)
      const blue = this.solid('#6a2c9e'); // roxo: chama atenção e não se mistura com o azul da água
      const blueD = this.solid('#41186b');
      const light = this.solid('#d59cff', 0.2); // listras lilás claras, que brilham um pouco
      const red = this.solid('#d8232a');
      const cream = this.solid('#fff7e0');
      // o corpo fica enrolado atrás da cabeça, sem vãos: blocos grossos que se sobrepõem ao longo de uma curva
      const path: [number, number, number, number][] = [
        // [x, z, y, espessura]
        [0, 0.05, 0.0, 0.46],
        [-0.4, -0.1, 0.0, 0.44],
        [-0.62, -0.48, 0.03, 0.42],
        [-0.32, -0.84, 0.08, 0.4],
        [0.2, -0.88, 0.05, 0.36],
        [0.56, -0.58, 0.02, 0.3],
        [0.62, -0.18, 0.0, 0.24],
      ];
      // a ponta da cauda é um grupo à parte, que pode se levantar da água
      const tail = new THREE.Group();
      tail.position.set(0.2, 0.05, -0.88);
      const tailIn = new THREE.Group();
      tailIn.position.set(-0.2, -0.05, 0.88);
      tail.add(tailIn);
      let seg = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const part = i >= 3 ? tailIn : g;
        const [x0, z0, y0, s0] = path[i];
        const [x1, z1, y1, s1] = path[i + 1];
        const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.14);
        for (let k = 0; k < steps; k++, seg++) {
          const t = k / steps;
          const sz = s0 + (s1 - s0) * t;
          const x = x0 + (x1 - x0) * t;
          const y = y0 + (y1 - y0) * t;
          const z = z0 + (z1 - z0) * t;
          part.add(this.box(sz, sz, sz, Math.floor(seg / 2) % 2 ? light : blue, x, y, z));
          if (seg % 3 === 0) part.add(this.box(0.08, 0.13, 0.16, red, x, y + sz - 0.02, z)); // espinho nas costas
        }
      }
      // pescoço levantado, com espinhos até a cabeça
      g.add(this.box(0.4, 0.4, 0.4, blue, 0, 0.2, 0.24));
      g.add(this.box(0.34, 0.34, 0.34, light, 0, 0.42, 0.3));
      g.add(this.box(0.08, 0.13, 0.16, red, 0, 0.78, 0.2));
      g.add(this.box(0.08, 0.13, 0.16, red, 0, 0.98, 0.34));
      // nadadeira da cauda
      tailIn.add(this.box(0.16, 0.1, 0.4, red, 0.62, 0.0, 0.1));
      tailIn.add(this.box(0.16, 0.34, 0.1, red, 0.62, -0.06, 0.1));
      g.add(tail);
      // cabeça: grupo que balança, com a mandíbula num grupo próprio que abre e fecha
      const head = new THREE.Group();
      head.position.set(0, 0.5, 0.4);
      const hi = new THREE.Group();
      hi.position.set(0, -0.5, -0.4);
      head.add(hi);
      const jaw = new THREE.Group();
      jaw.position.set(0, 0.5, 0.68);
      const ji = new THREE.Group();
      ji.position.set(0, -0.5, -0.68);
      jaw.add(ji);
      hi.add(jaw);
      // cabeça de jacaré: crânio, focinho comprido, mandíbula e dentes
      const skull = this.textured('leviSkullRoxo', 16, 16, (c) => {
        P(c, 0, 0, 16, 16, '#6a2c9e');
        P(c, 0, 0, 16, 4, '#41186b');
        P(c, 3, 8, 3, 3, '#1e0833'); // narinas na ponta do focinho (a face da frente é a do focinho)
      });
      hi.add(this.box(0.52, 0.34, 0.44, [blue, blue, blueD, blueD, skull, blue], 0, 0.62, 0.56));
      const snout = this.textured('leviSnoutRoxo', 16, 16, (c) => {
        P(c, 0, 0, 16, 16, '#6a2c9e');
        P(c, 0, 0, 16, 5, '#41186b');
        P(c, 3, 3, 3, 3, '#1e0833'); // narinas
        P(c, 10, 3, 3, 3, '#1e0833');
        P(c, 0, 12, 16, 4, '#fff7e0'); // fileira de dentes de cima
        for (const x of [1, 4, 7, 10, 13]) P(c, x, 11, 2, 1, '#fff7e0');
      });
      hi.add(this.box(0.34, 0.2, 0.62, [blue, blue, blueD, blueD, snout, blue], 0, 0.62, 0.98)); // focinho (maxila)
      // mandíbula de baixo, mais clara, um pouco aberta
      ji.add(this.box(0.32, 0.09, 0.58, light, 0, 0.5, 0.96));
      // dentes dos lados (de cima e de baixo)
      for (const sx of [-0.18, 0.18])
        for (const z of [0.8, 0.94, 1.08, 1.22]) {
          ji.add(this.box(0.05, 0.09, 0.06, cream, sx, 0.54, z));
          hi.add(this.box(0.05, 0.07, 0.06, cream, sx * 0.9, 0.59, z + 0.05));
        }
      // olhos saltados no alto da cabeça, como os de um jacaré
      const eye = this.textured('leviEye', 16, 16, (c) => {
        P(c, 0, 0, 16, 16, '#f2c80f');
        P(c, 5, 3, 6, 10, '#1e0833'); // pupila vertical
      });
      for (const sx of [-0.19, 0.19]) {
        hi.add(this.box(0.16, 0.14, 0.16, [blue, blue, blue, blue, eye, blue], sx, 0.94, 0.52));
      }
      g.add(head);
      g.userData.levi = { head, jaw, tail };
      g.children.forEach((c) => (c.position.z -= 0.1)); // centra o monstro na casa
    } else {
      // Sentinela: troll de pedra com chifres, curvado, braços compridos até o chão. Parado, os olhos ficam apagados;
      // com um pirata a até 2 casas (awake), os olhos acendem em laranja.
      const stone = this.solid('#8f9a8a');
      const stoneD = this.solid('#6c7768');
      const stoneL = this.solid('#a9b3a2');
      const horn = this.solid('#e8dcc0');
      const hornD = this.solid('#c9b88f');
      const moss = this.solid('#5f8f4a');
      const eye = awake ? this.solid('#ff7a1a', 1.6) : this.solid('#2b2f2b');
      // pernas curtas e grossas
      for (const sx of [-0.15, 0.15]) {
        g.add(this.box(0.2, 0.22, 0.24, stoneD, sx, 0, 0));
        g.add(this.box(0.22, 0.06, 0.28, stoneD, sx, 0, 0.03)); // pé largo
      }
      // tronco largo e curvado para a frente, com corcunda
      g.add(this.box(0.56, 0.4, 0.36, stone, 0, 0.2, 0));
      g.add(this.box(0.46, 0.18, 0.3, stoneL, 0, 0.32, 0.06)); // peito
      g.add(this.box(0.44, 0.16, 0.3, stone, 0, 0.58, -0.06)); // corcunda
      g.add(this.box(0.3, 0.05, 0.22, moss, -0.06, 0.74, -0.08)); // limo nas costas
      // braços compridos com punhos enormes quase no chão
      for (const sx of [-0.36, 0.36]) {
        g.add(this.box(0.18, 0.2, 0.2, stone, sx, 0.46, 0.02)); // ombro
        g.add(this.box(0.14, 0.26, 0.16, stoneD, sx * 1.05, 0.2, 0.06)); // braço
        g.add(this.box(0.2, 0.16, 0.2, stoneL, sx * 1.07, 0.04, 0.1)); // punho
      }
      // cabeça pequena, projetada para a frente, com sobrancelha pesada e presas
      const hz = 0.18;
      g.add(this.box(0.32, 0.26, 0.28, stone, 0, 0.62, hz));
      g.add(this.box(0.34, 0.06, 0.08, stoneD, 0, 0.8, hz + 0.12)); // sobrancelha
      for (const sx of [-0.08, 0.08]) g.add(this.box(0.07, 0.05, 0.02, eye, sx, 0.74, hz + 0.145)); // olhos
      g.add(this.box(0.08, 0.06, 0.06, stoneL, 0, 0.68, hz + 0.16)); // nariz
      g.add(this.box(0.26, 0.07, 0.04, stoneD, 0, 0.62, hz + 0.14)); // mandíbula
      for (const sx of [-0.09, 0.09]) g.add(this.box(0.04, 0.08, 0.03, horn, sx, 0.66, hz + 0.16)); // presas
      // chifres curvos: saem dos lados da cabeça, sobem e se curvam para trás
      for (const sx of [-1, 1]) {
        g.add(this.box(0.08, 0.08, 0.08, hornD, sx * 0.19, 0.78, hz));
        g.add(this.box(0.07, 0.1, 0.07, horn, sx * 0.25, 0.84, hz - 0.02));
        g.add(this.box(0.06, 0.1, 0.06, horn, sx * 0.28, 0.93, hz - 0.06));
        g.add(this.box(0.05, 0.07, 0.05, horn, sx * 0.27, 1.02, hz - 0.12));
        g.add(this.box(0.04, 0.05, 0.04, hornD, sx * 0.24, 1.07, hz - 0.18));
      }
    }
    return g;
  }

  dispose() {
    this.texs.forEach((t) => t.dispose());
    this.mats.forEach((m) => m.dispose());
    this.hexGeos.forEach((g) => g.dispose());
    this.unit.dispose();
  }
}
