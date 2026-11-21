/**
 * Palco 3D de Atlântida (Three.js, câmera ortográfica isométrica, tudo em blocos com textura de pixel),
 * Só desenha e avisa qual casa foi tocada; não conhece as regras.
 */
import { lookKey } from '../game/players';
import * as THREE from 'three';
import { hexDisk, hexDistance, hexKey, hexToWorld, type Hex } from '../engine/hex';
import { buildNereus, buildPrincess } from './legends';
import { ISLAND_RADIUS, ORIGIN, WORLD_RADIUS, isWater, islandProgress, sentinelAlert, templeAwake, type Cell, type GameState } from '../engine/atlantida';
import { FLOOR_H, HEX_R, buildCastle, buildCastleTier, buildLevel, buildMarbleBase } from './structures';
import { Models } from './models';
import { buildSummon } from './summons';

/** Pose isométrica: personagens, criaturas e navios ficam a 45° da câmera, mostrando a frente e um lado, como o tabuleiro. */
const ISO_TURN = -Math.PI / 4;
export type Highlight = 'move' | 'flood' | 'build' | 'push' | 'treasure' | 'wave' | 'both';
export interface StageScene {
  state: GameState;
  highlights: Map<string, Highlight>;
  selectedBuilder: string | null;
}

/** Ângulo isométrico: 45° de azimute e 30° de elevação (isométrica); a tela inicial usa 135°. */
export const FRONT_AZ = 2.62; // visão inicial fixa (≈150°): navio cinza no alto à esquerda, marrom embaixo à direita
export const HOME_AZ = (3 * Math.PI) / 4;
const ELEV = Math.PI / 6;

const baseHeight = (c: Cell) => (c.temple ? 0.95 : c.state === 'island' ? [0, 0.8, 0.65, 0.5, 0.35][c.ring] : 0.2);
const topOf = (c: Cell) => baseHeight(c) + c.floors * FLOOR_H;
const worldOf = (h: Hex) => hexToWorld(h, 1);

interface Entity {
  id: string;
  kind: string; // muda quando o construtor passa de em pé para boiando
  group: THREE.Group;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  floating: boolean;
  phase: number;
  turns: boolean; // usa a pose isométrica padrão (em vez de ficar sempre do jeito que o modelo foi montado)
  armR?: THREE.Object3D;
  armL?: THREE.Object3D;
  swingAt?: number; // quando começou a martelada
  faceTo?: THREE.Vector3; // bote: vira a pose isométrica para o lado da tela onde está o navio do time
  /** Cena roteirizada (agarrado por tentáculo ou cauda): o roteiro manda na posição em vez de a casa nova. */
  script?: { t0: number; dur: number; step: (p: number, pos: THREE.Vector3) => void };
  spinZ?: number;
  zzz?: THREE.Group; // os Z de quando o personagem dorme
  bubble?: THREE.Sprite; // balão "homem ao mar!" de quem boia
  idle?: { kind: 'look' | 'scratch' | 'spy' | 'watch'; t0: number; dur: number }; // movimento de espera em andamento
  idleNext?: number;
  cparts?: { tentacles?: THREE.Object3D[]; flag?: THREE.Object3D; levi?: { head: THREE.Object3D; jaw: THREE.Object3D; tail: THREE.Object3D } } | null; // partes animáveis do Polvo e do Leviatã
  props?: { spy: THREE.Group; watch: THREE.Group }; // luneta e relógio de bolso, que aparecem na mão esquerda
  shouting?: boolean;
}

export class Stage3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 250);
  private models = new Models();
  private cellsGroup = new THREE.Group();
  private cellObjs = new Map<string, { sig: string; group: THREE.Group; born: number; from: number }>();
  private entGroup = new THREE.Group();
  private ents = new Map<string, Entity>();
  private hlGroup = new THREE.Group();
  private hlMats: Record<string, THREE.MeshBasicMaterial> = {};
  private pickables: THREE.Object3D[] = [];
  private waterHits: THREE.Object3D[] = [];
  private spinners: THREE.Object3D[] = [];
  private az = HOME_AZ;
  private home = false; // tela inicial: o tabuleiro sobe e encolhe um pouco, para o logo e o painel ficarem embaixo
  private shift = 0;
  private water!: THREE.Texture;
  private seaTime = { value: 0 };
  private shimmers: { obj: THREE.Object3D; phase: number }[] = [];
  private azTarget: number | null = null; // a câmera gira sozinha até esse ângulo, pelo caminho mais curto
  private zoom = 1;
  private insetTop = 0; // altura da barra de cima e da de baixo (a partida enquadra o tabuleiro no espaço livre entre elas)
  private insetBottom = 0;
  private autoZoom = 0;
  /** Zoom de partida: no celular mais perto; no desktop cresce com o espaço livre entre as barras, para o tabuleiro e os navios aparecerem inteiros. */
  private gameZoomNow(): number {
    if (innerWidth < 760) return (this.autoZoom = 1.32);
    const h = this.host.clientHeight || 460;
    const free = Math.max(200, h - this.insetTop - this.insetBottom);
    return (this.autoZoom = Math.max(0.6, Math.min(1.25, 0.82 * 1.12 * (free / 650))));
  }
  /** As barras do jogo avisam a altura delas: o tabuleiro fica centralizado no espaço livre. */
  setInsets(top: number, bottom: number) {
    if (top === this.insetTop && bottom === this.insetBottom) return;
    this.insetTop = top;
    this.insetBottom = bottom;
    if (!this.home && Math.abs(this.zoom - this.autoZoom) < 0.001) this.zoom = this.gameZoomNow(); // quem não mexeu no zoom acompanha o enquadramento
    this.resize();
  }
  private raf = 0;
  private clock = new THREE.Clock();
  /** céu: 0 = dia, 0.5 = entardecer, 1 = noite. Segue a parte da ilha que já virou Atlântida (suavizado em `tick`). */
  private hemi!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private skyNow = 0;
  private skyTarget = 0;
  /** instante em que a ilha começou a sumir no mar (0 = ainda não sumiu). */
  private vanishAt = 0;
  private ro: ResizeObserver;
  private cleanups: (() => void)[] = [];

  constructor(
    private host: HTMLElement,
    private onPick: (h: Hex, clientX: number, clientY: number) => void,
  ) {
    void document.fonts?.load('68px Bangers'); // a letra dos balões chega antes do primeiro balão
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x2a6fba);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const cv = this.renderer.domElement;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:pointer';
    host.appendChild(cv);

    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x404060, 1.15);
    s.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    this.sunLight = sun;
    sun.position.set(10, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 80 });
    s.add(sun);

    // mar: um plano azul contínuo com textura de pixel que desliza devagar; só há água em volta da ilha
    this.water = this.models.noise('nWaterLimpo', [47, 127, 209], 0.1, 11); // sem os tracinhos brancos (viravam milhares de retângulos)
    this.water.wrapS = this.water.wrapT = THREE.RepeatWrapping;
    this.water.repeat.set(70, 70);
    const seaMat = new THREE.MeshStandardMaterial({ map: this.water, roughness: 1, metalness: 0 });
    // o mar se mexe de verdade: faixas de onda que andam e água rasa mais clara em volta da ilha
    seaMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.seaTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            vec2 p = vWPos.xz;
            float t = uTime;
            // distância "de hexágono" até o centro da ilha (a ilha tem raio 3)
            float fq = 0.57735 * p.x - 0.33333 * p.y;
            float fr = 0.66667 * p.y;
            float hd = max(abs(fq), max(abs(fr), abs(-fq - fr)));
            // ondas: três senos cruzados, em degraus (visual de pixel); as faixas claras andam pela água
            float a = (sin(p.x * 0.85 + t * 1.7) + sin(p.y * 1.05 - t * 1.4) + sin((p.x + p.y) * 0.55 + t * 1.1)) / 3.0;
            float band = floor((a * 0.5 + 0.5) * 5.0) / 5.0;
            diffuseColor.rgb *= 0.76 + band * 0.52;
            // água rasa: mais clara e mais verde-azulada perto da ilha
            float shallow = smoothstep(7.2, 4.7, hd);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.72, 0.80), shallow * 0.55);
          }`,
        );
    };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.02;
    sea.receiveShadow = true;
    s.add(sea);

    // brilho do mar: sobre cada casa de água, um hexágono ciano translúcido que pulsa e gira de leve, em ondas
    const shimmerMat = new THREE.MeshBasicMaterial({ color: 0x8be9ff, transparent: true, opacity: 0.2, depthWrite: false });
    const SHIMMER_ON = true;
    for (const h of SHIMMER_ON ? hexDisk(ORIGIN, WORLD_RADIUS + 3) : []) {
      if (hexDistance(ORIGIN, h) <= ISLAND_RADIUS) continue;
      const w = worldOf(h);
      const m = new THREE.Mesh(this.flat('fill', HEX_R * 0.76), shimmerMat.clone()); // cada casa com o seu brilho
      m.position.set(w.x, 0.012, w.z);
      m.renderOrder = 1;
      s.add(m);
      this.shimmers.push({ obj: m, phase: h.q * 0.61 + h.r * 0.97 });
    }

    // quadrados leves na água, por onde as criaturas e os náufragos andam
    const lines: number[] = [];
    for (const h of hexDisk(ORIGIN, WORLD_RADIUS)) {
      if (!isWater(h)) continue;
      const w = worldOf(h);
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i);
        const b = (Math.PI / 180) * (60 * (i + 1));
        lines.push(w.x + Math.sin(a) * HEX_R, 0.01, w.z + Math.cos(a) * HEX_R, w.x + Math.sin(b) * HEX_R, 0.01, w.z + Math.cos(b) * HEX_R);
      }
      const hit = new THREE.Mesh(this.models.hexGeo(HEX_R, 0.1), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(w.x, 0, w.z);
      hit.userData.hex = h;
      this.waterHits.push(hit);
      s.add(hit);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    s.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09 }))); // contorno discreto

    s.add(this.cellsGroup, this.entGroup, this.hlGroup, this.fxGroup);
    this.hlMats = {
      move: new THREE.MeshBasicMaterial({ color: 0xffe21a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
      moveEdge: new THREE.MeshBasicMaterial({ color: 0xffee3c, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
      both: new THREE.MeshBasicMaterial({ color: 0xffe21a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
      bothEdge: new THREE.MeshBasicMaterial({ color: 0x35b8ff, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }),
      build: new THREE.MeshBasicMaterial({ color: 0x35b8ff, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
      treasure: new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      treasureEdge: new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }),
      // aviso de onda: espuma branco-azulada nas casas que a onda vai varrer
      wave: new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
      waveEdge: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      digEdge: new THREE.MeshBasicMaterial({ color: 0xa6f5c4, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
      buildEdge: new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
      push: new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
      pushEdge: new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
      flood: new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
      floodEdge: new THREE.MeshBasicMaterial({ color: 0xff7b6b, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
      select: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
    };

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindInput(cv);
    this.raf = requestAnimationFrame(this.tick);
  }

  /* ---------- câmera ---------- */

  private placeCamera() {
    const dir = new THREE.Vector3(Math.cos(ELEV) * Math.cos(this.az), Math.sin(ELEV), Math.cos(ELEV) * Math.sin(this.az));
    this.cam.position.set(this.target.x, 0.6, this.target.z).add(dir.multiplyScalar(70));
    this.cam.lookAt(this.target.x, 0.6, this.target.z);
  }
  /** Ponto do tabuleiro para onde a câmera olha (move com dois dedos, botão direito/do meio ou Shift+arrastar). */
  private target = new THREE.Vector3();
  private panBy(dxPx: number, dyPx: number) {
    const h = this.host.clientHeight || 460;
    const upp = (this.cam.top - this.cam.bottom) / this.cam.zoom / h; // unidades do mundo por pixel
    this.cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0);
    const fwd = new THREE.Vector3(-Math.cos(this.az), 0, -Math.sin(this.az)); // para dentro da tela, no chão
    const lim = 11;
    this.target.addScaledVector(right, -dxPx * upp).addScaledVector(fwd, dyPx * upp / Math.sin(ELEV));
    this.target.y = 0;
    this.target.x = Math.max(-lim, Math.min(lim, this.target.x));
    this.target.z = Math.max(-lim, Math.min(lim, this.target.z));
    this.placeCamera();
  }
  private resize() {
    const w = this.host.clientWidth || 640;
    const h = this.host.clientHeight || 460;
    this.renderer.setSize(w, h, false);
    const half = Math.max(8.2, 9.8 / (w / h)); // em tela estreita, a ilha ocupa a largura
    if (this.home) {
      // tela inicial: a ilha cabe inteira no espaço livre acima do logo e do painel (que ficam embaixo)
      // espaço livre = tudo que está acima do logo (medido na tela; se ainda não existir, estimativa)
      const lg = document.querySelector('.home .logo');
      const above = lg ? lg.getBoundingClientRect().top - 8 : h - (500 + (h > 820 ? 70 : 0));
      const free = Math.max(100, above);
      const ppu = h / 2 / half; // pixels por unidade do mundo com zoom 1
      this.zoom = Math.max(0.28, Math.min(1.15, (free * (w / h > 1.2 ? 0.48 : 0.6)) / (4.4 * ppu))); // no desktop a ilha pode ser maior
      this.shift = Math.max(0.12, Math.min(0.42, (h / 2 - free / 2) / h));
    } else this.shift = w < 760 ? 0.06 : (this.insetBottom - this.insetTop) / (2 * h) + 0.02; // desktop: centralizado entre as barras (com um respiro para o aviso de baixo)
    this.cam.left = -half * (w / h);
    this.cam.right = half * (w / h);
    this.cam.top = half;
    this.cam.bottom = -half;
    this.cam.zoom = this.zoom;
    if (this.shift) this.cam.setViewOffset(w, h, 0, this.shift * h, w, h);
    else this.cam.clearViewOffset();
    this.cam.updateProjectionMatrix();
    this.placeCamera();
  }
  /** Onde uma casa aparece na tela inicial (0 a 1 na largura e na altura), já com a câmera na posição de repouso. */
  homeScreenOf(h: Hex): { x: number; y: number } {
    const az = this.az;
    this.az = HOME_AZ;
    this.placeCamera();
    this.cam.updateMatrixWorld();
    const w = worldOf(h);
    const v = new THREE.Vector3(w.x, 0, w.z).project(this.cam);
    this.az = az;
    this.placeCamera();
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }
  /** Tela inicial: o tabuleiro sobe na tela e fica um pouco menor, para o logo e o painel ficarem embaixo. */
  setHomeMode(on: boolean) {
    this.home = on;
    this.zoom = on ? 0.8 : this.gameZoomNow();
    if (on) {
      // volta ao centro: o arrastar/zoom de uma partida anterior não pode deixar a ilha torta, nem o céu de entardecer
      this.target.set(0, 0, 0);
      this.skyNow = 0;
      this.skyTarget = 0;
      this.applySky(0);
    }
    this.resize();
  }
  zoomBy(f: number) {
    this.zoom = Math.max(0.25, Math.min(6, this.zoom * f));
    this.cam.zoom = this.zoom;
    this.cam.updateProjectionMatrix();
  }
  rotateBy(rad: number) {
    this.azTarget = null;
    this.az += rad;
    this.placeCamera();
  }
  resetView() {
    this.azTarget = FRONT_AZ;
    this.zoom = this.gameZoomNow();
    this.target.set(0, 0, 0);
    this.resize();
  }
  /** Gira (devagar, pelo caminho mais curto) até o azimute pedido. */
  turnTo(az: number) {
    this.azTarget = az;
  }
  /** Gira até o lado do tabuleiro onde estão essas casas (a vez de quem joga fica "perto" da tela). */
  faceSide(hexes: Hex[]) {
    if (!hexes.length) return;
    let x = 0;
    let z = 0;
    for (const h of hexes) {
      const w = worldOf(h);
      x += w.x;
      z += w.z;
    }
    this.azTarget = Math.atan2(z, x);
  }

  /* ---------- entrada: arrastar gira, tocar escolhe ---------- */

  private bindInput(cv: HTMLCanvasElement) {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; az: number; pan: boolean } | null = null;
    let dragged = false;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null;
    const spread = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (e: PointerEvent) => {
      if (this.home) return; // tela inicial: câmera fixa (sem girar, arrastar nem zoom)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { cv.setPointerCapture(e.pointerId); } catch { /* sem captura, segue */ }
      if (pts.size === 1) {
        down = { x: e.clientX, y: e.clientY, az: this.az, pan: e.button === 1 || e.button === 2 || e.shiftKey };
        dragged = false;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { dist: Math.max(1, spread()), zoom: this.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        dragged = true;
        down = null;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId)!;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.zoom = Math.max(0.25, Math.min(6, pinch.zoom * (spread() / pinch.dist)));
        this.cam.zoom = this.zoom;
        this.cam.updateProjectionMatrix();
        this.panBy(cx - pinch.cx, cy - pinch.cy);
        pinch.cx = cx;
        pinch.cy = cy;
        return;
      }
      if (!down) return;
      const dx = e.clientX - down.x;
      if (down.pan) {
        dragged = true;
        this.panBy(e.clientX - prev.x, e.clientY - prev.y);
        return;
      }
      if (Math.abs(dx) > 6 || dragged) {
        dragged = true;
        this.azTarget = null;
        this.az = down.az - dx * 0.009;
        this.placeCamera();
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size > 0) return; // ainda há um dedo apoiado: não é um toque
      const was = dragged;
      const wasPan = down?.pan;
      down = null;
      dragged = false;
      if (was || wasPan) return;
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.cam);
      const hit = ray.intersectObjects([...this.pickables, ...this.waterHits], false)[0];
      if (hit) this.onPick(hit.object.userData.hex as Hex, e.clientX, e.clientY);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (this.home) return;
      this.zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    const onCancel = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        down = null;
        pinch = null;
        dragged = false;
      }
    };
    const onMenu = (e: Event) => e.preventDefault();
    cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('contextmenu', onMenu);
    cv.addEventListener('wheel', onWheel, { passive: false });
    this.cleanups.push(() => {
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('pointercancel', onCancel);
      cv.removeEventListener('contextmenu', onMenu);
    });
  }

  /* ---------- montar a cena a partir do estado ---------- */

  update(sc: StageScene) {
    this.skyTarget = this.home ? 0 : sc.state.vanished ? 1 : islandProgress(sc.state);
    if (sc.state.vanished && !this.vanishAt) {
      this.vanishAt = performance.now();
      // se a princesa ainda esperava no Castelo, ela pula e o Nereu a pega
      const c0 = this.princessObj?.visible ? sc.state.cells['0,0'] : undefined;
      this.playNereus(c0 ? topOf(c0) + 0.05 : null);
    }
    if (!sc.state.vanished && this.vanishAt) {
      this.vanishAt = 0; // nova partida: a ilha volta ao lugar
      this.cellsGroup.position.set(0, 0, 0);
      this.resetSink();
    }
    this.syncCells(sc.state);
    this.syncEntities(sc.state);
    this.syncPrincess(sc.state);
    this.syncHighlights(sc);
  }

  /* ---------- a princesa espera no topo do Castelo até alguém chegar lá ---------- */

  private princessObj: THREE.Group | null = null;
  private princessParts: ReturnType<typeof buildPrincess> | null = null;
  private princessBubble: THREE.Sprite | null = null;
  /** Fala de quem está boiando (o idioma vem de fora). */
  overboardLine = 'MAN OVERBOARD!';
  private lastOverboard = -9;
  private lastHelp = -99;
  /** Balão de fala (letras brancas num balão colorido) que aparece sobre um personagem. */
  private makeBubble(text: string, color: string): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 220; // sobra espaço embaixo para o rabinho comprido: o balão fica longe do personagem
    const g = c.getContext('2d')!;
    // letra de quadrinhos (Bangers, com alternativas parecidas caso a fonte ainda não tenha chegado)
    const FONT = '"Bangers", "Luckiest Guy", "Comic Sans MS", "Chalkboard SE", cursive, sans-serif';
    let px = 68;
    g.font = `${px}px ${FONT}`;
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '2px';
    while (g.measureText(text).width > 270 && px > 20) g.font = `${--px}px ${FONT}`; // textos longos encolhem para caber
    const bw = Math.min(304, Math.max(150, Math.ceil(g.measureText(text).width) + 56)); // o balão tem a largura do texto (com um respiro)
    // balão e rabinho são UM desenho só: primeiro os contornos (grossos), depois os dois preenchimentos por cima,
    // assim a linha de baixo do balão some onde o rabinho nasce e não há emenda
    const box = () => g.roundRect(8, 8, bw, 84, 22);
    const tail = () => {
      g.moveTo(64, 80);
      g.lineTo(46, 208);
      g.lineTo(108, 80);
      g.closePath();
    };
    g.strokeStyle = '#1b2a4a';
    g.lineWidth = 16; // metade fica por baixo do preenchimento: contorno de 8 px visível
    g.lineJoin = 'round';
    g.beginPath();
    box();
    g.stroke();
    g.beginPath();
    tail();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    box();
    g.fill();
    g.beginPath();
    tail();
    g.fill();
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 8 + bw / 2, 52);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    sp.center.set(46 / 320, 12 / 220); // a pontinha do rabinho fica no ponto da posição: ele sempre aponta para quem fala
    sp.scale.set(2.6, (2.6 * 220) / 320, 1);
    sp.renderOrder = 50; // por cima dos destaques de casas e dos efeitos
    sp.visible = false;
    return sp;
  }
  private princessCarry: THREE.Group | null = null;
  /** A princesa espera no topo do Castelo (com um facho de luz rosa para ser vista de longe) e, depois de resgatada, acompanha o pirata que a salvou. */
  private syncPrincess(s: GameState) {
    const t = s.cells['0,0'];
    const live = !s.vanished && s.phase !== 'ended';
    const waiting = !!t && t.floors >= 3 && s.castleTaken === null && live; // ela só surge quando o 3º andar do Castelo aparece
    if (!waiting) {
      if (this.princessObj) this.princessObj.visible = false;
    } else {
      if (!this.princessObj) {
        const g = new THREE.Group();
        const P = buildPrincess(this.models);
        P.root.scale.setScalar(1.25); // do tamanho dos piratas
        g.add(P.root);
        this.princessParts = P;
        this.princessBubble = this.makeBubble('HELP!', '#9e1218');
        this.princessBubble.position.set(0, 1.8, 0); // a pontinha toca acima da cabeça; o balão fica bem acima
        g.add(this.princessBubble);
        this.scene.add(g);
        this.princessObj = g;
      }
      const w = worldOf(t.hex);
      this.princessObj.visible = true;
      this.princessObj.position.set(w.x, topOf(t) + 0.05, w.z);
    }
    // depois do resgate: ela vai ao lado do pirata que a conduz (em terra, no bote ou na água) até o navio; lá chegando, fica no convés com o time
    const pr = s.princess;
    let host: Entity | undefined;
    let aboard = false;
    if (pr && live) {
      if (pr.safe) {
        host = this.ents.get(`ship${pr.by}`);
        aboard = true;
      } else {
        const onMap = (b: GameState['builders'][number]) => b.status === 'board' || b.status === 'boat' || b.status === 'floating';
        const carrier =
          s.builders.find((b) => b.id === pr.carrier && onMap(b)) ??
          s.builders.filter((b) => b.owner === pr.by && onMap(b)).sort((x, y) => (x.status === 'board' ? 0 : 1) - (y.status === 'board' ? 0 : 1))[0];
        host = carrier ? this.ents.get(carrier.id) : undefined;
      }
    }
    if (!host) {
      this.princessCarry?.removeFromParent();
      return;
    }
    if (!this.princessCarry) {
      const P = buildPrincess(this.models);
      this.princessCarry = P.root;
      this.princessCarryParts = P;
      this.princessCarry.scale.setScalar(1.25);
    }
    if (this.princessCarry.parent !== host.group) {
      this.princessCarry.removeFromParent();
      host.group.add(this.princessCarry);
    }
    this.princessAboard = aboard;
    if (aboard) this.princessCarry.position.set(0.1, 0.55, 0.0); // no convés do navio do time
    else this.princessCarry.position.set(0.5, 0, 0.1);
  }
  private princessCarryParts: ReturnType<typeof buildPrincess> | null = null;
  private princessAboard = false;

  /* ---------- Nereu: no fim, quando Atlântida afunda, o deus do mar surge, ruge e some ---------- */

  private shake = 0;
  private shakeOff = new THREE.Vector3();

  /** Nereu sobe do mar, ruge (balão + som + tremor), agarra o pirata com o punho e o arrasta para o fundo. Sem vítima (ninguém ao alcance), só aparece e ruge. */
  private playNereusPull(victimId: string | null) {
    const v = victimId ? this.ents.get(victimId) : undefined;
    if (victimId && !v) return;
    const start = v ? v.pos.clone() : new THREE.Vector3();
    const end = v ? v.target.clone() : (() => { const w = worldOf({ q: -6, r: 3 }); return new THREE.Vector3(w.x, 0, w.z); })();
    const N = buildNereus(this.models);
    const SC = 0.62;
    N.root.scale.setScalar(SC);
    N.root.position.set(end.x, 0, end.z);
    const yaw = Math.atan2(Math.cos(this.az), Math.sin(this.az));
    N.root.rotation.y = yaw;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
    const T = { rise: 0.9, roar: 1.0, grab: 1.7, lift: 2.2, throw: 2.65, land: 3.15, sink: 3.3 }; // marcos da cena (s)
    const dur = 4.3;
    const hand = new THREE.Object3D(); // o punho do braço direito: é nele que o pirata fica pendurado pela roupa
    hand.position.set(0, -2.7, 0.1);
    N.armR.add(hand);
    this.addFx(N.root, dur, 0, (p) => {
      const tt = p * dur;
      const rise = ease(clamp01(tt / T.rise));
      const sink = ease(clamp01((tt - T.sink) / 0.9));
      const roar = ease(clamp01((tt - T.roar) / 0.2)) * (1 - ease(clamp01((tt - (T.roar + 0.75)) / 0.3)));
      const reach = ease(clamp01((tt - (T.grab - 0.35)) / 0.35)); // o braço se estica para agarrar
      const lift = ease(clamp01((tt - T.grab) / (T.lift - T.grab))); // levanta o pirata
      const swing = ease(clamp01((tt - T.lift) / (T.throw - T.lift))); // arma o arremesso para trás
      const hurl = ease(clamp01((tt - T.throw) / 0.3)); // e joga
      N.body.position.y = -6 + 6 * rise - 6 * sink;
      N.body.position.x = Math.sin(tt * 55) * 0.03 * roar; // treme no urro
      N.head.rotation.x = -0.4 * roar;
      N.mouth.scale.y = N.mouth.userData.baseY * (1 + 4 * roar);
      N.mouth.position.y = N.mouth.userData.posY - 0.2 * roar;
      N.armL.rotation.z = 0.15 + 0.5 * roar;
      N.armR.rotation.x = -0.4 * roar - 0.9 * reach + 0.5 * lift - 1.2 * swing + 2.0 * hurl; // estica, ergue, arma e arremessa
      N.armR.rotation.z = 0.25 * reach;
      N.trident.position.y = 0.55 + 0.7 * roar;
      N.fin.rotation.z = Math.sin(tt * 5) * 0.25 + roar * 0.3;
    });
    for (let i = 0; i < 4; i++) this.burst(end.x + (Math.random() - 0.5) * 1.6, 0.2, end.z + (Math.random() - 0.5) * 1.6, '#dff6ff', 8, i * 0.15, 2.4); // água se abrindo
    const handAt = new THREE.Vector3();
    if (v) {
      // durante a cena o pirata aparece de pé, sem a boia (ela só surge quando ele cai no mar)
      const owner = Number(v.id.charAt(1));
      const idx = Number(v.id.slice(-1));
      const ghost = new THREE.Group();
      const fig = this.models.builder(owner, idx);
      fig.scale.setScalar(1.6);
      ghost.add(fig);
      let gArmL: THREE.Object3D | undefined;
      let gArmR: THREE.Object3D | undefined;
      ghost.traverse((o) => {
        if (o.userData.armR) {
          gArmR = o.userData.armR;
          gArmL = o.userData.armL;
        }
      });
      v.group.visible = false;
      const hold = T.land;
      v.script = {
        t0: this.clock.elapsedTime,
        dur: hold,
        step: (p, pos) => {
          const tt = p * hold;
          N.root.updateMatrixWorld(true);
          hand.getWorldPosition(handAt);
          const base = new THREE.Vector3(start.x, start.y + 0.9 * ease(clamp01((tt - T.roar) / 0.7)), start.z); // paralisado de medo, sobe um pouco
          const hung = new THREE.Vector3(handAt.x, handAt.y - 0.2, handAt.z); // pendurado pela roupa, logo abaixo do punho
          pos.copy(base);
          if (tt >= T.grab) pos.lerpVectors(base, hung, ease(clamp01((tt - T.grab) / 0.3)));
          if (tt >= T.throw) {
            // solto: voa em arco até a água, onde cai
            const u = clamp01((tt - T.throw) / (T.land - T.throw));
            const dest = new THREE.Vector3(end.x, 0.02, end.z);
            pos.lerpVectors(hung, dest, u);
            pos.y += Math.sin(u * Math.PI) * 1.6;
          }
          v.spinZ = tt < T.grab ? (tt < T.roar ? 0 : Math.sin(tt * 18) * 0.25) : tt < T.throw ? Math.sin(tt * 7) * 0.12 : (tt - T.throw) * 9; // balança pendurado; gira ao ser jogado
        },
      };
      // o pirata "de pé" acompanha o roteiro; ao pousar some e a figura boiando (com boia) aparece
      this.addFx(ghost, T.land, 0, (p) => {
        const tt = p * T.land;
        ghost.position.copy(v.group.position);
        ghost.rotation.set(v.group.rotation.x, v.group.rotation.y, v.group.rotation.z);
        const f = tt * 9;
        if (gArmL && gArmR) {
          const flail = tt >= T.roar;
          gArmL.rotation.x = flail ? -2.6 + Math.sin(f) * 0.5 : 0;
          gArmR.rotation.x = flail ? -2.6 + Math.sin(f + 2) * 0.5 : -0.25;
        }
      });
      this.later(T.land, () => {
        v.group.visible = true;
        this.burst(end.x, 0.3, end.z, '#bfe6f5', 18, 0, 2.6);
        this.burst(end.x, 0.3, end.z, '#ffffff', 8, 0.05, 1.8);
        this.sfx?.('bigSplash');
      });
      this.later(T.roar + 0.1, () => this.sfx?.('scream'));
      this.later(T.grab, () => this.sfx?.('whoosh'));
    }
    this.later(T.roar, () => {
      this.sfx?.('nereus');
      this.nereusBubble(end.x, 3.5, end.z, 1.3);
      this.shake = 0.9;
      for (let i = 0; i < 5; i++) this.burst(end.x + (Math.random() - 0.5) * 2.4, 0.3, end.z + (Math.random() - 0.5) * 2.4, '#bfe6f5', 8, i * 0.08, 3);
    });
  }

  private playNereus(princessY: number | null = null) {
    const N = buildNereus(this.models);
    const delay = 2.0;
    const dur = 4.4;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
    N.root.position.set(0, 0, 0);
    N.root.scale.setScalar(0.65); // grande, mas sem tomar a tela: o rei dos mares
    // de frente para a câmera
    N.root.rotation.y = Math.atan2(Math.cos(this.az), Math.sin(this.az));
    this.addFx(N.root, dur, delay, (p) => {
      const tt = p * dur;
      const rise = ease(clamp01(tt / 1.4));
      const sink = ease(clamp01((tt - 3.6) / 0.8));
      const roar = ease(clamp01((tt - 1.5) / 0.25)) * (1 - ease(clamp01((tt - 3.1) / 0.4)));
      N.body.position.y = -6 + 6 * rise - 6 * sink;
      const jitter = Math.sin(tt * 55) * 0.03 * roar;
      N.body.position.x = jitter;
      N.body.scale.setScalar(1 + 0.05 * roar);
      N.head.rotation.x = -0.4 * roar; // cabeça para trás no urro
      N.mouth.scale.y = N.mouth.userData.baseY * (1 + 4 * roar); // boca aberta no urro
      N.mouth.position.y = N.mouth.userData.posY - 0.2 * roar;
      N.armL.rotation.z = 0.15 + 0.5 * roar;
      N.armR.rotation.x = -0.5 * roar;
      N.trident.position.y = 0.65 + 0.7 * roar;
      N.fin.rotation.z = Math.sin(tt * 5) * 0.25 + roar * 0.3; // a nadadeira balança, e mais forte no urro
      N.trident.rotation.z = -0.05 * roar;
    });
    if (princessY !== null) {
      // a princesa, ainda no topo do Castelo que afunda, pula para a mão do Nereu e é levada com ele
      const P = buildPrincess(this.models);
      const root = new THREE.Group();
      P.root.scale.setScalar(1.25);
      root.add(P.root);
      const hand = new THREE.Vector3();
      const start = new THREE.Vector3();
      const jumpAt = 0.95;
      const landAt = 1.6;
      this.addFx(root, delay + dur, 0, (p) => {
        const tt = p * (delay + dur) - delay; // 0 = Nereu começa a subir; antes disso ela já espera no Castelo
        root.rotation.y = Math.atan2(Math.cos(this.az), Math.sin(this.az));
        N.armL.getWorldPosition(hand);
        hand.y += 0.35;
        const waiting = tt < jumpAt;
        P.armL.rotation.z = 0.55 + Math.sin(tt * 9) * 0.3;
        P.armR.rotation.z = -0.55 - Math.sin(tt * 9 + 1) * 0.3;
        if (waiting) {
          start.set(0, princessY + this.cellsGroup.position.y, 0); // acompanha o Castelo afundando
          root.position.copy(start);
          return;
        }
        const k = Math.min(1, (tt - jumpAt) / (landAt - jumpAt));
        root.position.lerpVectors(start, hand, k * k * (3 - 2 * k));
        root.position.y += Math.sin(k * Math.PI) * 1.2; // arco do pulo
      });
    }
    // água em volta quando surge e quando ruge; tremor de câmera durante o urro; o som sai junto
    for (let i = 0; i < 4; i++) this.burst((Math.random() - 0.5) * 2.4, 0.2, (Math.random() - 0.5) * 2.4, '#dff6ff', 8, delay + 0.2 + i * 0.2, 2.6);
    this.later(delay + 1.55, () => {
      this.sfx?.('nereus');
      this.nereusBubble(0, 3.2, 0, 1.8);
      this.shake = 1.5;
      for (let i = 0; i < 6; i++) this.burst((Math.random() - 0.5) * 3, 0.3, (Math.random() - 0.5) * 3, '#bfe6f5', 8, i * 0.08, 3.2);
    });
  }

  /* ---------- a ilha afunda ---------- */

  private sunk = new Set<THREE.Group>();
  private ripplesAt = 0;
  /** Volta cada casa ao lugar (nova partida depois de a ilha afundar). */
  private resetSink() {
    for (const rec of this.cellObjs.values()) {
      rec.group.position.y = 0;
      rec.group.rotation.set(0, 0, 0);
    }
    this.sunk.clear();
    this.ripplesAt = 0;
  }
  /** Casa por casa, da borda para o centro: racha, tomba, afunda com respingos; no fim, ondas se abrem no mar. */
  private sinkCells(ms: number) {
    for (const rec of this.cellObjs.values()) {
      const g = rec.group;
      const r = Math.hypot(g.position.x, g.position.z) / 1.73; // anel da casa
      const jitter = (Math.sin(g.position.x * 12.9 + g.position.z * 78.2) * 0.5 + 0.5) * 200;
      const delay = Math.max(0, 4.5 - r) * 300 + jitter;
      const p = Math.min(1, Math.max(0, (ms - delay) / 1500));
      if (p > 0 && !this.sunk.has(g)) {
        this.sunk.add(g);
        this.burst(g.position.x, 0.5, g.position.z, '#dff6ff', 5, 0, 1.6);
        this.burst(g.position.x, 0.4, g.position.z, '#7fc4e8', 3, 0.05, 1.1);
      }
      const e = p * p;
      g.position.y = -e * 9;
      const tilt = Math.sin(g.position.x * 3.1 + g.position.z * 1.7) * 0.45 * Math.min(1, p * 3);
      g.rotation.set(tilt, 0, -tilt * 0.8);
    }
    if (ms > 2300 && !this.ripplesAt) {
      this.ripplesAt = ms;
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 56), new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
        this.addFx(ring, 1.6, i * 0.35, (p) => {
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(0, 0.07, 0);
          ring.scale.setScalar(2 + p * 11);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - p);
        });
      }
      for (let i = 0; i < 4; i++) this.burst((Math.random() - 0.5) * 4, 0.1, (Math.random() - 0.5) * 4, '#bfe6f5', 6, i * 0.25, 1.0);
    }
  }

  private mark(o: THREE.Object3D, h: Hex) {
    o.traverse((x) => (x.userData.hex = h));
  }

  private syncCells(s: GameState) {
    const awake = templeAwake(s);
    const now = performance.now();
    this.pickables = this.pickables.filter((p) => p.userData.entity);
    this.spinners = [];
    // o Portal só funciona com 2 ou mais revelados (afundados); antes disso fica cinza e parado
    const portalsOn = Object.values(s.cells).filter((c) => c.state === 'atlantis' && c.tile === 'portal').length >= 2;
    this.portalsOn = portalsOn;
    for (const c of Object.values(s.cells)) {
      const k = hexKey(c.hex);
      const sig = `${c.state}${c.sunk ? 'S' : ''}|${c.floors}|${c.dome}|${c.tile}|${c.temple && awake}|${!!c.dug}|${!!c.taken}|${c.tile === 'portal' && portalsOn}|${!!c.relic}|${c.flora ?? ''}`;
      let rec = this.cellObjs.get(k);
      if (!rec || rec.sig !== sig) {
        if (rec) this.cellsGroup.remove(rec.group);
        const fromState = rec && rec.sig.split('|')[0] !== c.state;
        const group = this.buildCell(c, awake);
        this.cellsGroup.add(group);
        rec = { sig, group, born: rec ? now : -1e9, from: fromState ? 0.2 : 0.82 };
        this.cellObjs.set(k, rec);
      }
      rec.group.traverse((o) => {
        if (o.userData.pick) this.pickables.push(o);
        if (o.userData.spin !== undefined || o.userData.bob !== undefined || o.userData.pulse !== undefined || o.userData.twinkle !== undefined) this.spinners.push(o);
      });
    }
  }

  private portalsOn = false;
  private buildCell(c: Cell, awake: boolean): THREE.Group {
    const m = this.models;
    const g = new THREE.Group();
    const w = worldOf(c.hex);
    g.position.set(w.x, 0, w.z);
    if (c.sunk) return g; // desabou: sobra só o mar
    const base = baseHeight(c);
    // a superfície segue os anéis (borda mais clara, centro mais alto), mas cada partida mistura areia, grama e pedra
    const lk = c.look ?? 0.5;
    const surface = c.ground ?? (c.ring >= 3 ? (lk < 0.62 ? 'beach' : lk < 0.88 ? 'forest' : 'mountain') : c.ring === 2 ? (lk < 0.3 ? 'beach' : lk < 0.78 ? 'forest' : 'mountain') : lk < 0.2 ? 'beach' : lk < 0.5 ? 'forest' : 'mountain');
    const kind = c.temple ? (awake ? 'temple' : 'sealed') : c.state === 'atlantis' ? 'marble' : surface;
    const body = new THREE.Mesh(m.hexGeo(HEX_R, base + 0.3), m.terrain(kind));
    body.position.y = (base - 0.3) / 2;
    body.castShadow = body.receiveShadow = true;
    body.userData.pick = true;
    g.add(body);
    // cada andar é uma construção de verdade (escadaria, torre de vigia, farol); no centro, os salões do castelo
    if (c.temple) {
      const castle = buildCastle(m, awake); // fica no topo do bloco; a colunata desce pelos lados
      castle.position.y = base;
      g.add(castle);
    }
    for (let k = 0; k < c.floors; k++) {
      // casa de Atlântida com Coluna: o 1º andar é a base da coluna (laje de mármore), não uma escadaria
      const piece = c.temple ? buildCastleTier(m, k + 1) : c.state === 'atlantis' && c.tile === 'column' && k === 0 ? buildMarbleBase(m) : buildLevel(m, k + 1, c.ring === 1 ? Math.atan2(-w.x, -w.z) : null);
      piece.position.y = base + k * FLOOR_H;
      piece.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.userData.pick = true) : 0));
      g.add(piece);
    }
    if (c.temple) g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.userData.pick = true) : 0));
    const top = topOf(c);
    // enfeite da ilha (palmeira, arbusto, mato) enquanto a casa é superfície sem construção
    if (c.flora && c.state === 'island' && !c.dug && c.floors === 0 && !c.dome) {
      const f = this.models.flora(c.flora, c.look ?? 0.5);
      f.position.y = top;
      g.add(f);
    }
    if (c.dome) {
      [0.78, 0.6, 0.36].forEach((r, i) => {
        const d = new THREE.Mesh(m.hexGeo(r, 0.24), m.glass('#6fc3e8', 0.72));
        d.position.y = top + i * 0.24 + 0.12;
        d.userData.pick = true;
        g.add(d);
      });
      g.add(m.box(0.1, 0.1, 0.1, m.solid('#ffffff', 0.6), -0.2, top + 0.45, 0.2));
    } else if (c.state === 'atlantis' && !c.taken && c.tile && c.tile !== 'hidden' && (c.floors === 0 || (c.tile === 'column' && c.floors === 1))) {
      const d = m.decor(c.tile, c.look ?? 0.5, this.portalsOn, !!c.relic);
      d.position.y += top;
      g.add(d);
    } else if (c.state === 'island' && c.dug && !c.temple && c.floors === 0) {
      // casa descoberta: um buraco escuro com montinhos de terra; se a peça de baixo ficou, ela aparece pequena lá dentro
      g.add(m.box(0.62, 0.05, 0.62, m.solid('#2c1d12', 0.95), 0, top - 0.01, 0));
      g.add(m.box(0.14, 0.1, 0.14, m.solid('#8a6a3d', 0.9), 0.36, top, 0.2));
      g.add(m.box(0.12, 0.07, 0.12, m.solid('#a98550', 0.9), -0.34, top, -0.22));
      g.add(m.box(0.1, 0.06, 0.1, m.solid('#8a6a3d', 0.9), 0.1, top, -0.4));
      if (c.tile && c.tile !== 'hidden' && c.tile !== 'ruin') {
        const d = m.decor(c.tile, c.look ?? 0.5, this.portalsOn, !!c.relic);
        d.scale.setScalar(0.55);
        d.position.y += top + 0.03;
        g.add(d);
      }
    } else if (c.temple && awake && c.floors < 3) {
      // farol dourado: o objetivo
      const b = new THREE.Group();
      b.add(m.box(0.16, 0.16, 0.16, m.solid('#ffd84a', 0.8), 0, 0, 0));
      b.position.y = top + 0.7;
      b.userData.spin = 1.4;
      b.userData.bob = 0.08;
      b.userData.baseY = top + 0.7;
      g.add(b);
    }
    // decorações giratórias guardam a altura original para balançar
    g.traverse((o) => {
      if (o.userData.bob !== undefined && o.userData.baseY === undefined) o.userData.baseY = o.position.y;
    });
    this.mark(g, c.hex); // o clique precisa saber de qual casa é cada peça
    return g;
  }

  private syncEntities(s: GameState) {
    const live = new Set<string>();
    const place = (id: string, kind: string, hex: Hex, build: () => THREE.Group, floating: boolean, turns: boolean) => {
      live.add(id);
      const c = s.cells[hexKey(hex)];
      const w = worldOf(hex);
      const y = floating ? 0.02 : c ? topOf(c) : 0;
      let e = this.ents.get(id);
      if (e && e.kind !== kind) {
        const old = e;
        this.entGroup.remove(old.group);
        this.ents.delete(id);
        e = undefined;
        const g = build();
                e = { id, kind, group: g, pos: old.pos.clone(), target: new THREE.Vector3(w.x, y, w.z), floating, phase: Math.random() * 6, turns };
        this.entGroup.add(g);
        this.ents.set(id, e);
      } else if (!e) {
        const g = build();
        g.position.set(w.x, y, w.z);
        e = { id, kind, group: g, pos: new THREE.Vector3(w.x, y, w.z), target: new THREE.Vector3(w.x, y, w.z), floating, phase: Math.random() * 6, turns };
        this.entGroup.add(g);
        this.ents.set(id, e);
      }
      if (!e.armR) e.group.traverse((o) => { if (o.userData.armR) { e.armR = o.userData.armR; e.armL = o.userData.armL; } });
      e.target.set(w.x, y, w.z);
      e.floating = floating;
      e.group.userData.entity = true;
      this.mark(e.group, hex);
      e.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.userData.entity = true;
      });
    };
    for (const b of s.builders) {
      if ((b.status !== 'board' && b.status !== 'floating' && b.status !== 'boat') || !b.hex) continue;
      const floating = b.status === 'floating' || b.status === 'boat';
      const inBoat = b.status === 'boat';
      // bote com 2 lugares: o primeiro desenha o bote; cada um senta num banco
      const crew = inBoat ? s.builders.filter((m) => m.status === 'boat' && m.hex && hexKey(m.hex) === hexKey(b.hex!)).map((m) => m.id).sort() : [];
      const seat = crew.indexOf(b.id);
      place(
        b.id,
        `${b.owner}${lookKey(b.owner)}-${b.id.slice(-1)}-${b.status}${inBoat ? `-${seat}of${crew.length}` : ''}`,
        b.hex,
        () => {
          const g = new THREE.Group();
          const fig = this.models.builder(b.owner, Number(b.id.slice(-1)));
          fig.scale.setScalar(1.6);
          if (inBoat) {
            fig.position.y = 0.16;
            if (crew.length > 1) fig.position.z = seat === 0 ? 0.36 : -0.36; // um em cada banco (o bote aponta para a frente)
            if (seat === 0) {
              const boat = this.models.rowboat(b.owner);
              boat.scale.setScalar(1.5);
              boat.rotation.y = -Math.PI / 2; // proa na mesma direção para onde os personagens olham
              g.add(boat);
            }
          } else if (floating) {
            // náufrago: as pernas afundam e a boia fica na cintura
            fig.position.y = -0.3;
            const buoy = this.models.lifebuoy();
            buoy.scale.setScalar(1.2);
            buoy.position.y = 0.0;
            g.add(buoy);
          }
          g.add(fig);
          return g;
        },
        floating,
        true,
      );
      const ent = this.ents.get(b.id);
      const ship = s.ships?.[b.owner];
      if (ent) {
        if (inBoat && ship) {
          const sw = worldOf(ship);
          ent.faceTo = new THREE.Vector3(sw.x, 0, sw.z);
        } else ent.faceTo = undefined;
      }
    }
    // navio de cada time, ancorado desde o começo; quem já embarcou aparece no convés
    (s.ships ?? []).forEach((h, p) => {
      const aboard = s.builders.filter((b) => b.owner === p && b.status === 'aboard');
      place(
        `ship${p}`,
        `ship-${p}${lookKey(p)}-${aboard.map((b) => b.id).join('.')}`,
        h,
        () => {
          const g = new THREE.Group();
          const ship = this.models.ship(p);
          ship.scale.setScalar(2.3); // bem maior que uma casa, para ser visto de longe
          ship.rotation.y = -Math.PI / 2; // proa na mesma direção para onde os personagens olham
          g.add(ship);
          aboard.forEach((b, i) => {
            const fig = this.models.builder(b.owner, Number(b.id.slice(-1)));
            fig.scale.setScalar(1.4);
            // na proa, lado a lado: o meio do convés é ocupado pelas velas (barco) e pelas chaminés e luzes (robôs)
            fig.position.set(ship.position.x + (i - 0.5) * 0.5, 0.8, ship.position.z + 1.35);
            g.add(fig);
          });
          return g;
        },
        true,
        true, // gira com a câmera, na mesma pose isométrica dos personagens
      );
    });
    for (const cr of s.creatures) {
      if (!cr.hex) continue;
      const alert = cr.type === 'guardian' && sentinelAlert(s); // olhos acesos da Sentinela
      place(
        cr.id,
        `${cr.type}${alert ? '-alerta' : ''}`,
        cr.hex,
        () => {
          const g = new THREE.Group();
          const m = this.models.creature(cr.type, alert);
          m.scale.setScalar(cr.type === 'leviathan' ? 0.95 : 1.35); // o Leviatã cabe na própria casa, sem invadir as vizinhas
          g.add(m);
          return g;
        },
        isWater(cr.hex) || !s.cells[hexKey(cr.hex)] || !!s.cells[hexKey(cr.hex)]?.sunk, // na água (também onde não há casa, como na ilha menor da tela inicial): balança como os barcos
        true,
      );
    }
    for (const [id, e] of this.ents) {
      if (!live.has(id)) {
        this.entGroup.remove(e.group);
        this.ents.delete(id);
      }
    }
    // tudo que é entidade (caixas) pode ser tocado para escolher a casa em que está
    this.pickables = this.pickables.filter((p) => !p.userData.entity);
    this.entGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.pickables.push(o);
    });
  }

  private flatGeos = new Map<string, THREE.BufferGeometry>();
  private flat(kind: 'ring' | 'fill', r: number, w = 0): THREE.BufferGeometry {
    const k = `${kind}${r}${w}`;
    let g = this.flatGeos.get(k);
    if (!g) {
      g = kind === 'ring' ? new THREE.RingGeometry(r - w, r, 6) : new THREE.CircleGeometry(r, 6);
      g.rotateZ(Math.PI / 6);
      g.rotateX(-Math.PI / 2);
      this.flatGeos.set(k, g);
    }
    return g;
  }

  private syncHighlights(sc: StageScene) {
    this.hlGroup.clear();
    const s = sc.state;
    for (const [k, kind] of sc.highlights) {
      const [q, r] = k.split(',').map(Number);
      const c = s.cells[k];
      const w = worldOf({ q, r });
      const y = (c ? topOf(c) : 0) + 0.04;
      const fill = new THREE.Mesh(this.flat('fill', 0.86), this.hlMats[kind]);
      const edge = new THREE.Mesh(this.flat('ring', 0.9, 0.07), this.hlMats[kind + 'Edge']);
      fill.position.set(w.x, y, w.z);
      edge.position.set(w.x, y + 0.01, w.z);
      fill.renderOrder = edge.renderOrder = 3;
      this.hlGroup.add(fill, edge);
    }
    if (sc.selectedBuilder) {
      const b = s.builders.find((x) => x.id === sc.selectedBuilder);
      if (b?.hex && b.status !== 'dead') {
        const c = s.cells[hexKey(b.hex)];
        const w = worldOf(b.hex);
        const ring = new THREE.Mesh(this.flat('ring', 0.5, 0.07), this.hlMats.select);
        ring.position.set(w.x, (b.status === 'floating' ? 0 : c ? topOf(c) : 0) + 0.05, w.z);
        ring.renderOrder = 4;
        this.hlGroup.add(ring);
      }
    }
  }

  /* ---------- sono: ninguém joga há um tempo, todos cochilam com Z subindo ---------- */
  private sleeping = false;
  private zTex: THREE.CanvasTexture | null = null;

  setSleeping(on: boolean) {
    if (on === this.sleeping) return;
    this.sleeping = on;
    if (!on) return;
    if (!this.zTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.font = 'bold 52px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeStyle = '#1b2a4a';
      g.strokeText('Z', 32, 34);
      g.fillStyle = '#ffffff';
      g.fillText('Z', 32, 34);
      this.zTex = new THREE.CanvasTexture(c);
    }
    for (const e of this.ents.values()) {
      if (!e.armR || e.zzz) continue;
      const grp = new THREE.Group();
      for (let i = 0; i < 3; i++) grp.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: this.zTex, transparent: true, depthTest: false })));
      e.group.add(grp);
      e.zzz = grp;
    }
  }

  /* ---------- arremesso: tentáculo do Polvo e cauda do Leviatã agarram o pirata e jogam na água ---------- */

  /** Chamado nos instantes-chave da cena (o jogo liga isto aos sons). */
  sfx: ((name: string) => void) | null = null;
  /** O que Nereu grita no balão (traduzido por quem usa o palco). */
  nereusLine = 'MY PRINCESS!!';
  /** Balão de fala de Nereu, sobre a cabeça dele, enquanto ele ruge. */
  private nereusBubble(x: number, y: number, z: number, secs: number) {
    const b = this.makeBubble(this.nereusLine, '#0d2f6b');
    b.scale.set(3.6, (3.6 * 220) / 320, 1);
    b.position.set(x, y, z);
    this.addFx(b, secs, 0, () => {
      b.visible = true;
    });
  }

  private later(sec: number, fn: () => void) {
    let done = false;
    this.addFx(new THREE.Object3D(), sec + 0.3, 0, (p) => {
      if (!done && p * (sec + 0.3) >= sec) {
        done = true;
        fn();
      }
    });
  }

  /**
   * Membro comprido feito de cubinhos: sai do corpo, pode se levantar (rise), esticar como elástico (fica mais fino
   * quanto mais estica) e enrolar o pirata (wrap = quanto da ponta já está espiralada em volta dele).
   */
  private makeLimb(mats: THREE.Material[], base: number, tipSize: number, extra?: { stripes: boolean; spike: THREE.Material; tip: THREE.Material; tipCubes: number }) {
    const SEGS = extra ? 56 : 44;
    const COIL = Math.round(SEGS * 0.34); // cubos que podem virar a espiral
    const group = new THREE.Group();
    const cubes: THREE.Mesh[] = [];
    const spikes: THREE.Mesh[] = [];
    for (let i = 0; i < SEGS; i++) {
      const mat = extra
        ? i >= SEGS - extra.tipCubes
          ? extra.tip // nadadeira vermelha na ponta
          : mats[Math.floor(i / 2) % mats.length] // listras de dois em dois, como no corpo
        : mats[Math.min(mats.length - 1, Math.floor((i / SEGS) * mats.length * 0.999))];
      const m = new THREE.Mesh(this.bit, mat);
      group.add(m);
      cubes.push(m);
      if (extra && i % 3 === 0 && i < SEGS - COIL) {
        const sp = new THREE.Mesh(this.bit, extra.spike); // espinho vermelho nas costas
        group.add(sp);
        spikes.push(sp);
      }
    }
    const pts = cubes.map(() => new THREE.Vector3());
    const mid = new THREE.Vector3();
    const end = new THREE.Vector3();
    const zero = new THREE.Vector3();
    const update = (
      root: THREE.Vector3,
      tip: THREE.Vector3,
      t: number,
      o: { wrap?: number; rise?: number; away?: THREE.Vector3; rest?: number; radius?: number } = {},
    ) => {
      const wrap = o.wrap ?? 0;
      const rise = o.rise ?? 0;
      const radius = o.radius ?? 0.35;
      const len = root.distanceTo(tip);
      end.copy(tip);
      end.x += radius * wrap; // onde a espiral começa
      mid.copy(root).lerp(end, 0.5);
      mid.y += Math.min(1.1, len * 0.28) + Math.sin(t * 7) * 0.05;
      mid.addScaledVector(o.away ?? zero, rise * 1.5); // levantada, a cauda faz uma curva para trás
      const nb = Math.max(2, Math.floor(SEGS - COIL * wrap)); // cubos que ficam no corpo; o resto vira a espiral
      for (let i = 0; i < SEGS; i++) {
        const out = pts[i];
        if (i < nb) {
          const u = i / nb;
          const a = (1 - u) * (1 - u);
          const b = 2 * (1 - u) * u;
          const d = u * u;
          const wob = Math.sin(t * 8 + i * 0.7) * 0.06 * Math.sin(u * Math.PI);
          out.set(a * root.x + b * mid.x + d * end.x + wob, a * root.y + b * mid.y + d * end.y + Math.abs(wob) * 0.4, a * root.z + b * mid.z + d * end.z - wob);
        } else {
          const k = (i - nb) / Math.max(1, SEGS - nb - 1);
          const ang = k * Math.PI * 3.2; // uma volta e meia em volta do pirata
          const r = radius * wrap * (1 - k * 0.25);
          out.set(tip.x + Math.cos(ang) * r, tip.y - 0.3 * wrap + k * 0.75 * wrap, tip.z + Math.sin(ang) * r);
        }
      }
      // elástico: esticado fica fino; só encolhe até certo ponto
      const rest = o.rest ?? 1.5;
      const el = Math.min(1.15, Math.max(0.5, rest / Math.max(0.01, len)));
      const fade = Math.min(1, len / 0.9); // recolhido, some dentro do corpo
      cubes.forEach((c, i) => {
        const u = i / (SEGS - 1);
        const sp = i < SEGS - 1 ? pts[i].distanceTo(pts[i + 1]) : 0;
        const size = Math.max((base + (tipSize - base) * u) * el, sp * 1.02) * fade;
        c.position.copy(pts[i]);
        c.scale.setScalar(extra && i >= SEGS - extra.tipCubes ? size * 1.25 : size);
        if (extra && i % 3 === 0 && spikes[i / 3]) {
          const spk = spikes[i / 3];
          spk.position.set(pts[i].x, pts[i].y + size * 0.62, pts[i].z);
          spk.scale.set(size * 0.3, size * 0.45, size * 0.4);
        }
      });
    };
    return { group, update };
  }

  private playThrow(kind: 'octopus' | 'leviathan', creatureId: string, victimIds: string[]) {
    const c = this.ents.get(creatureId);
    const victims = victimIds.map((id) => this.ents.get(id)).filter((v): v is Entity => !!v);
    if (!c || !victims.length) return;
    const octo = kind === 'octopus';
    const T = octo ? { wait: 0.45, reach: 0.5, lift: 0.4, swing: 0.55, back: 0.45 } : { wait: 0.5, reach: 0.6, lift: 0.3, swing: 0.45, back: 0.55 };
    const hold = T.wait + T.reach + T.lift + T.swing; // quanto tempo o pirata fica nas mãos da criatura
    const total = hold + T.back;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
    const start = victims[0].pos.clone();
    const end = victims[0].target.clone();
    const body = c.target.clone();
    const toward = new THREE.Vector3(start.x - body.x, 0, start.z - body.z).normalize();
    const root = body.clone().addScaledVector(toward, octo ? 0.8 : 0.35).add(new THREE.Vector3(0, 0.05, 0));
    if (!octo) root.copy(body).add(new THREE.Vector3(0.62 * 0.95, 0.12, 0.0).applyQuaternion(c.group.quaternion)); // sai da ponta do rabo dele, onde fica a nadadeira
    const lift = start.clone().lerp(body, 0.25);
    lift.y = start.y + 1.6;
    const apex = lift.clone().lerp(end, 0.5);
    apex.y = Math.max(lift.y, end.y) + 1.2;
    const along = (a: THREE.Vector3, b: THREE.Vector3, m: THREE.Vector3, u: number, out: THREE.Vector3) => {
      const q = 1 - u;
      return out.set(q * q * a.x + 2 * q * u * m.x + u * u * b.x, q * q * a.y + 2 * q * u * m.y + u * u * b.y, q * q * a.z + 2 * q * u * m.z + u * u * b.z);
    };
    // posição do pirata (pés) em cada instante da cena; fora das mãos da criatura, ele fica onde estava até ser agarrado
    const base = (tt: number, out: THREE.Vector3) => {
      const t1 = T.wait + T.reach;
      if (tt < t1) return out.copy(start);
      if (tt < t1 + T.lift) return out.copy(start).lerp(lift, ease((tt - t1) / T.lift));
      if (tt < hold) return along(lift, end, apex, ease((tt - t1 - T.lift) / T.swing), out);
      return out.copy(end);
    };
    victims.forEach((v, i) => {
      const off = new THREE.Vector3(i * 0.35, 0, i * 0.2); // o segundo do bote vai um pouco ao lado

      v.script = {
        t0: this.clock.elapsedTime,
        dur: hold,
        step: (p, pos) => {
          const tt = p * hold;
          base(tt, pos);
          if (tt >= T.wait + T.reach) pos.add(off);
          const sw = clamp01((tt - T.wait - T.reach - T.lift) / T.swing);
          v.spinZ = tt > T.wait + T.reach + T.lift ? ease(sw) * Math.PI * (octo ? 2 : 3) : Math.sin(tt * 14) * 0.3;

        },
      };
    });
    // o membro: tentáculo roxo com ventosas claras, ou a cauda do Leviatã (roxa com listras lilás e a nadadeira vermelha na ponta)
    const mats = octo
      ? [this.models.solid('#7d2c6e'), this.models.solid('#b0439a'), this.models.solid('#c95bb3'), this.models.solid('#b0439a')]
      : [this.models.solid('#6a2c9e'), this.models.solid('#d59cff', 0.2)]; // roxo e lilás, como o corpo do Leviatã
    const limb = this.makeLimb(mats, octo ? 0.32 : 0.42, octo ? 0.09 : 0.17, octo ? undefined : { stripes: true, spike: this.models.solid('#d8232a'), tip: this.models.solid('#d8232a'), tipCubes: 3 });
    const tip = new THREE.Vector3();
    const vp = new THREE.Vector3();
    const raised = root.clone().add(new THREE.Vector3(0, octo ? 1.5 : 2.0, 0)); // cauda levantada, pronta para o golpe
    const away = toward.clone().multiplyScalar(-1);
    const backOut = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2); // passa um pouco do alvo e volta, como elástico
    const opt = { wrap: 0, rise: 0, away, rest: octo ? 1.3 : 1.8, radius: octo ? 0.3 : 0.42 };
    this.addFx(limb.group, total, 0, (p) => {
      const tt = p * total;
      const t1 = T.wait + T.reach;
      const grab = start.clone().add(new THREE.Vector3(0, 0.5, 0));
      if (tt < T.wait) {
        // 1) levanta devagar, curvando para trás
        const u = ease(tt / T.wait);
        tip.copy(root).lerp(raised, u);
        tip.addScaledVector(away, Math.sin(tt * 6) * 0.04);
        opt.rise = u;
        opt.wrap = 0;
      } else if (tt < t1) {
        // 2) dispara como elástico até o pirata e, perto do fim, se enrola nele
        const u = (tt - T.wait) / T.reach;
        tip.copy(raised).lerp(grab, backOut(ease(u)));
        opt.rise = 1 - ease(u);
        opt.wrap = clamp01((u - 0.5) / 0.5);
      } else if (tt < hold) {
        // 3) segura o pirata enrolado e o leva
        base(tt, vp);
        tip.copy(vp).add(new THREE.Vector3(0, 0.5, 0));
        opt.rise = 0;
        opt.wrap = 1;
      } else {
        // 4) solta (desenrola), chicoteia para cima e recolhe
        const u = (tt - hold) / T.back;
        if (u < 0.4) tip.copy(end).add(new THREE.Vector3(0, 0.5, 0)).lerp(raised, ease(u / 0.4));
        else tip.copy(raised).lerp(root, ease((u - 0.4) / 0.6));
        opt.rise = 0.5;
        opt.wrap = 1 - clamp01(u / 0.25);
      }
      limb.update(root, tip, tt, opt);
    });
    // sons e respingos nos instantes certos
    this.later(T.wait, () => this.sfx?.(octo ? 'tentacle' : 'tailWhip'));
    this.later(T.wait + T.reach, () => this.sfx?.(octo ? 'squeeze' : 'roar'));
    this.later(T.wait + T.reach + T.lift, () => this.sfx?.('whoosh'));
    this.later(T.wait + T.reach + 0.05, () => this.sfx?.('scream'));
    this.later(hold, () => {
      this.sfx?.('bigSplash');
      this.burst(end.x, 0.3, end.z, '#bfe6f5', 18, 0, 2.6);
      this.burst(end.x, 0.3, end.z, '#ffffff', 8, 0.05, 1.8);
    });
    this.burst(start.x, start.y + 0.4, start.z, '#bfe6f5', 6, T.wait + T.reach, 1.4);
  }

  /* ---------- convocações: o personagem entra em cena, age e some ---------- */

  private fxGroup = new THREE.Group();
  private fx: { obj: THREE.Object3D; t0: number; dur: number; step: (p: number) => void }[] = [];
  private bit = new THREE.BoxGeometry(1, 1, 1);

  private addFx(obj: THREE.Object3D, dur: number, delay: number, step: (p: number) => void) {
    obj.visible = false;
    this.fxGroup.add(obj);
    this.fx.push({ obj, t0: this.clock.elapsedTime + delay, dur, step });
  }

  /** Ícone do tesouro desenhado na hora (cristal, tridente ou maré calma). */
  private lootTexture(kind: 'crystal' | 'trident' | 'calm'): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (kind === 'crystal') {
      g.fillStyle = '#7fe8ff';
      g.strokeStyle = '#0d4f7a';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(48, 6); g.lineTo(80, 38); g.lineTo(48, 90); g.lineTo(16, 38);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ffffffcc';
      g.beginPath();
      g.moveTo(48, 14); g.lineTo(30, 38); g.lineTo(48, 38);
      g.closePath();
      g.fill();
    } else if (kind === 'trident') {
      g.strokeStyle = '#0d3a5c';
      g.lineWidth = 16;
      const draw = () => {
        g.beginPath(); g.moveTo(48, 92); g.lineTo(48, 24);
        g.moveTo(24, 30); g.lineTo(24, 12); g.moveTo(72, 30); g.lineTo(72, 12); g.moveTo(24, 34); g.quadraticCurveTo(48, 64, 72, 34);
        g.stroke();
      };
      draw();
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 8;
      draw();
    } else {
      g.fillStyle = '#bfeaff';
      g.strokeStyle = '#0d4f7a';
      g.lineWidth = 6;
      g.beginPath(); g.arc(48, 48, 38, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#2f8ad8';
      g.lineWidth = 7;
      for (const y of [38, 58]) {
        g.beginPath(); g.moveTo(20, y); g.quadraticCurveTo(34, y - 12, 48, y); g.quadraticCurveTo(62, y + 12, 76, y); g.stroke();
      }
    }
    return new THREE.CanvasTexture(c);
  }

  /** Quem pega um tesouro: o ícone pula sobre a cabeça do pirata, sobe e some (como nos jogos de plataforma). */
  playLoot(kind: 'crystal' | 'trident' | 'calm', hex: Hex, s: GameState) {
    const w = worldOf(hex);
    const y0 = this.ground(hex, s) + 1.5;
    const mat = new THREE.SpriteMaterial({ map: this.lootTexture(kind), transparent: true, depthTest: false, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 50;
    this.addFx(sp, 1.3, 0.12, (p) => {
      const hop = Math.sin(Math.min(1, p * 1.7) * Math.PI) * 0.55; // pulinho
      sp.position.set(w.x, y0 + hop + p * 0.9, w.z);
      const k = (0.55 + 0.45 * Math.min(1, p * 6)) * 0.95;
      sp.scale.set(k, k, 1);
      mat.opacity = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
    });
    this.burst(w.x, y0 - 0.3, w.z, kind === 'trident' ? '#ffd23f' : '#bff4ff', 6, 0.1, 1.6);
    // som junto com o pulinho: um tique agudo e, logo depois, a musiquinha do tesouro
    this.later(0.12, () => this.sfx?.('loot'));
    this.later(0.2, () => this.sfx?.(kind));
  }

  /** Jato de água da Sentinela: um feixe azul-claro sai dos olhos dela até o pirata, com respingos no fim. */
  playBlast(from: Hex, to: Hex, s: GameState) {
    const a = worldOf(from);
    const b = worldOf(to);
    const ya = this.ground(from, s) + 0.95;
    const yb = this.ground(to, s) + 0.55;
    const beam = new THREE.Mesh(this.bit, new THREE.MeshStandardMaterial({ color: 0x8fe8ff, emissive: 0x3fc6ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
    const dir = new THREE.Vector3(b.x - a.x, yb - ya, b.z - a.z);
    const len = dir.length();
    beam.position.set((a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2);
    beam.lookAt(b.x, yb, b.z);
    this.addFx(beam, 0.6, 0, (p) => {
      const grow = Math.min(1, p * 3);
      beam.scale.set(0.16 * (1 - p * 0.6), 0.16 * (1 - p * 0.6), len * grow);
      (beam.material as THREE.MeshStandardMaterial).opacity = 0.85 * (1 - Math.max(0, p - 0.6) / 0.4);
    });
    this.burst(b.x, yb, b.z, '#bff4ff', 10, 0.18, 2);
  }

  /** Onda gigante: uma parede de água com espuma entra pelo lado da ilha e passa por cima das duas fileiras de borda. */
  playWave(hexes: Hex[]) {
    if (!hexes.length) return;
    const c = hexes.reduce((acc, h) => {
      const w = worldOf(h);
      return { x: acc.x + w.x / hexes.length, z: acc.z + w.z / hexes.length };
    }, { x: 0, z: 0 });
    const len = Math.hypot(c.x, c.z) || 1;
    const dx = c.x / len;
    const dz = c.z / len;
    const wave = new THREE.Group();
    const water = new THREE.Mesh(this.bit, new THREE.MeshStandardMaterial({ color: 0x2f9be0, transparent: true, opacity: 0.75, roughness: 0.2 }));
    water.scale.set(9, 1.6, 0.9);
    water.position.y = 0.8;
    const foam = new THREE.Mesh(this.bit, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    foam.scale.set(9.2, 0.16, 0.5);
    foam.position.set(0, 1.62, -0.2); // crista de espuma inclinada para a frente
    wave.add(water, foam);
    wave.rotation.y = Math.atan2(dx, dz); // a parede fica de frente para a ilha, paralela ao lado
    const from = { x: c.x + dx * 4, z: c.z + dz * 4 };
    const to = { x: c.x - dx * 1.6, z: c.z - dz * 1.6 };
    this.addFx(wave, 1.3, 0, (p) => {
      wave.position.set(from.x + (to.x - from.x) * p, 0, from.z + (to.z - from.z) * p);
      const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      (water.material as THREE.MeshStandardMaterial).opacity = 0.75 * fade;
      (foam.material as THREE.MeshStandardMaterial).opacity = 0.9 * fade;
      wave.scale.y = 1 - p * 0.5;
    });
    for (const h of hexes) {
      const w = worldOf(h);
      this.burst(w.x, 0.9, w.z, '#e8fbff', 4, 0.45, 2);
    }
  }

  private ground(h: Hex, s: GameState) {
    const c = s.cells[hexKey(h)];
    return c && !c.sunk ? topOf(c) : 0.02;
  }

  /** Esguicho de cubinhos (água, brilho) que sobem e caem. */
  private burst(x: number, y: number, z: number, color: string, n: number, delay = 0, speed = 2.2) {
    const mat = this.models.solid(color, 0.5);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.bit, mat);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * (0.3 + Math.random() * 0.7), speed * (0.8 + Math.random()), Math.sin(a) * speed * (0.3 + Math.random() * 0.7));
      const size = 0.06 + Math.random() * 0.06;
      this.addFx(mesh, 0.85, delay, (p) => {
        const t = p * 0.85;
        mesh.position.set(x + v.x * t, y + v.y * t - 4.5 * t * t, z + v.z * t);
        mesh.scale.setScalar(size * (1 - p * p));
      });
    }
  }

  playEvents(events: { type: string; [k: string]: unknown }[], s: GameState) {
    // o Leviatã agarra com a cauda e joga: quem vai junto (os dois do bote) sai na mesma cena
    const flung = new Map<string, string[]>();
    for (const e of events) if (e.type === 'leviathanPush') flung.set(hexKey(e.from as Hex), [...(flung.get(hexKey(e.from as Hex)) ?? []), e.builderId as string]);
    for (const ids of flung.values()) this.playThrow('leviathan', 'leviathan', ids);
    for (const e of events) {
      if (e.type === 'summon') this.playSummon(e, s);
      if (e.type === 'flood') {
        // a ilha desmorona: torrões de areia, grama e pedra caem enquanto Atlântida sobe
        const w = worldOf(e.hex as Hex);
        this.burst(w.x, 0.6, w.z, '#d9c48a', 9, 0, 1.4);
        this.burst(w.x, 0.6, w.z, '#5d9a45', 5, 0.05, 1.2);
        this.burst(w.x, 0.6, w.z, '#8a8f99', 5, 0.1, 1.3);
      }
      if (e.type === 'sentinelWake') this.playBlast(e.at as Hex, e.pushFrom as Hex, s);
      if (e.type === 'octopusGrab') this.playThrow('octopus', 'octopus', [e.builderId as string]);
      if (e.type === 'nereusPull') this.playNereusPull(e.builderId as string);
      if (e.type === 'nereusSleeps') this.playNereusPull(null);
      if (e.type === 'leviathanGrab') this.playThrow('leviathan', 'leviathan', [e.builderId as string]);
      if (e.type === 'crumble') {
        const w = worldOf(e.hex as Hex);
        this.burst(w.x, 0.4, w.z, '#dff6ff', 12, 0, 2.4);
        this.burst(w.x, 0.3, w.z, '#9bd6f0', 8, 0.05, 1.6);
        this.sfx?.('crumble');
      }
      if (e.type === 'crystal') this.playLoot('crystal', e.hex as Hex, s);
      if (e.type === 'tridentTaken') this.playLoot('trident', e.hex as Hex, s);
      if (e.type === 'calmSea') this.playLoot('calm', e.hex as Hex, s);
      if (e.type === 'build' || e.type === 'unearth') {
        const b = this.ents.get(e.builderId as string);
        if (b) b.swingAt = this.clock.elapsedTime;
      }
    }
  }

  /** O Polvo levanta tentáculos aos poucos, cada um no seu ritmo; o Leviatã balança a cabeça, abre a boca e ergue o rabo da água, como um réptil. */
  private creatureIdle(e: Entity, t: number) {
    if (e.cparts === undefined) {
      let found: Entity['cparts'] = null;
      e.group.traverse((o) => {
        if (o.userData.flag) found = { flag: o.userData.flag as THREE.Object3D };
        else if (o.userData.tentacles) found = { tentacles: o.userData.tentacles as THREE.Object3D[] };
        else if (o.userData.levi) found = { levi: o.userData.levi as NonNullable<Entity['cparts']>['levi'] };
      });
      e.cparts = found;
    }
    const c = e.cparts;
    if (!c) return;
    const ph = e.phase;
    if (c.flag) {
      // a bandeira pirata tremula ao vento: balança de um lado para o outro e ondula um pouco
      const f = c.flag;
      f.rotation.y = Math.sin(t * 2.6 + ph) * 0.3 + Math.sin(t * 5.3 + ph * 2) * 0.08;
      f.rotation.x = Math.sin(t * 4.1 + ph) * 0.05;
      f.scale.z = 1 + Math.sin(t * 6.2 + ph) * 0.05;
    }
    if (c.tentacles) {
      c.tentacles.forEach((tn, i) => {
        const period = 3 + ((i * 0.73) % 2.5);
        const u = ((t + ph * (i + 1)) % period) / period;
        const env = u < 0.35 ? Math.sin((u / 0.35) * Math.PI) : 0; // de vez em quando este tentáculo se levanta
        tn.scale.y = 1 + 1.1 * env;
        tn.position.y = 0.16 * env;
        tn.rotation.z = (i % 2 ? 1 : -1) * 0.5 * env * Math.sin(t * 3 + i) + Math.sin(t * 1.4 + i) * 0.05;
      });
    }
    if (c.levi) {
      const { head, jaw, tail } = c.levi;
      head.rotation.y = Math.sin(t * 0.8 + ph) * 0.28; // olha de um lado para o outro
      head.rotation.x = -0.05 + Math.sin(t * 0.6 + ph * 2) * 0.08;
      const mu = (t + ph) % 6.5;
      const open = mu < 1.8 ? Math.pow(Math.sin((mu / 1.8) * Math.PI), 2) : 0; // abre e fecha a boca de vez em quando
      jaw.rotation.x = 0.5 * open;
      const tv = ((t + ph * 2) % 8) / 8;
      const lift = tv < 0.3 ? Math.sin((tv / 0.3) * Math.PI) : 0; // ergue o rabo da água e solta
      tail.rotation.z = 0.7 * lift + Math.sin(t * 1.2 + ph) * 0.05;
      tail.rotation.x = -0.3 * lift;
    }
  }

  private idleStop(e: Entity) {
    e.idle = undefined;
    e.group.rotation.x = e.group.rotation.z = 0;
    e.idleNext = this.clock.elapsedTime + 4 + Math.random() * 6;
    if (e.props) e.props.spy.visible = e.props.watch.visible = false;
  }

  /** Um movimento de espera suave de vez em quando, cada pirata no seu ritmo. */
  private idleStep(e: Entity, t: number) {
    if (!e.props) {
      const m = this.models;
      const gold = m.solid('#f2c80f', 0.35);
      const brown = m.solid('#6b3d1a');
      const spy = new THREE.Group(); // luneta: tubo de madeira com anéis dourados
      spy.position.set(0, -0.29, 0.02);
      spy.add(m.box(0.05, 0.2, 0.05, brown, 0, -0.1, 0), m.box(0.07, 0.05, 0.07, gold, 0, -0.22, 0), m.box(0.04, 0.04, 0.04, gold, 0, 0.0, 0));
      const watch = new THREE.Group(); // relógio de bolso: disco dourado com a correntinha
      watch.position.set(0, -0.31, 0.03);
      watch.add(m.box(0.09, 0.09, 0.02, gold, 0, 0, 0), m.box(0.06, 0.06, 0.025, m.solid('#fff7e0'), 0, 0, 0.004), m.box(0.012, 0.1, 0.012, gold, 0.03, 0.06, 0));
      spy.visible = watch.visible = false;
      e.armL!.add(spy, watch);
      e.props = { spy, watch };
    }
    if (e.idleNext === undefined) e.idleNext = t + 2 + Math.random() * 8;
    if (!e.idle && t >= e.idleNext) {
      const r = Math.random();
      const kind = r < 0.35 ? 'look' : r < 0.6 ? 'scratch' : r < 0.8 ? 'spy' : 'watch';
      e.idle = { kind, t0: t, dur: kind === 'look' ? 2.8 : kind === 'scratch' ? 2.2 : kind === 'spy' ? 3.4 : 3 };
    }
    const id = e.idle;
    if (!id) return;
    const u = (t - id.t0) / id.dur;
    if (u >= 1) return this.idleStop(e);
    const k = Math.min(1, Math.min(u, 1 - u) * 6); // entra, segura e sai com suavidade
    const kk = k * k * (3 - 2 * k);
    e.props.spy.visible = id.kind === 'spy';
    e.props.watch.visible = id.kind === 'watch';
    if (id.kind === 'look') {
      e.group.rotation.y += Math.sin(u * Math.PI * 2.4) * 0.7 * kk; // olha para um lado e para o outro
    } else if (id.kind === 'scratch') {
      e.armL!.rotation.x = -2.25 * kk;
      e.armL!.rotation.z = -0.15 * kk + Math.sin(t * 15) * 0.2 * kk; // coça a cabeça
      e.group.rotation.z = Math.sin(t * 15) * 0.02 * kk;
    } else if (id.kind === 'spy') {
      e.armL!.rotation.x = -1.9 * kk; // luneta no olho, varrendo o horizonte
      e.armL!.rotation.z = (-0.1 + Math.sin(u * Math.PI * 2) * 0.22) * kk;
      e.group.rotation.y += Math.sin(u * Math.PI * 2) * 0.3 * kk;
    } else {
      e.armL!.rotation.x = -1.0 * kk; // tira o relógio do bolso e olha
      e.armL!.rotation.z = -0.1 * kk;
      e.group.rotation.x = 0.12 * kk; // se inclina um pouco para olhar o relógio
    }
  }

  private playSummon(e: { [k: string]: unknown }, s: GameState) {
    const kind = e.kind as 'triton' | 'lasso' | 'siren' | 'colossus';
    const model = buildSummon(this.models, kind);
    const at = (h: Hex) => {
      const w = worldOf(h);
      return new THREE.Vector3(w.x, this.ground(h, s), w.z);
    };
    const place = (v: THREE.Vector3) => model.position.copy(v);
    if (kind === 'colossus') {
      const base = at(e.hex as Hex);
      model.scale.setScalar(1.2);
      this.addFx(model, 1.5, 0, (p) => {
        const rise = p < 0.25 ? p / 0.25 : p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
        place(base);
        model.position.y -= (1 - rise) * 1.8;
        model.rotation.y = this.az > 0 ? Math.PI / 2 - this.az : 0;
        model.scale.set(1.2, 1.2 * (0.7 + 0.3 * rise), 1.2);
      });
      this.burst(base.x, base.y + 0.2, base.z, '#f29ac2', 14, 0.15);
      return;
    }
    if (kind === 'lasso') {
      // a argola voa do pirata que laça até o pirata do time rival, aperta e volta trazendo a princesa
      const from = at(e.by as Hex).add(new THREE.Vector3(0, 1.0, 0));
      const to = at(e.at as Hex).add(new THREE.Vector3(0, 1.1, 0));
      const ease = (x: number) => x * x * (3 - 2 * x);
      const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
      this.addFx(model, 1.5, 0, (p) => {
        const out = ease(clamp01(p / 0.38));
        const back = ease(clamp01((p - 0.68) / 0.32));
        model.position.lerpVectors(from, to, out - back);
        model.position.y += Math.sin(clamp01(p / 0.38) * Math.PI) * 0.6;
        model.rotation.set(0, this.az > 0 ? Math.PI / 2 - this.az : 0, p * 16);
        model.scale.setScalar(p < 0.38 ? 1.1 : p < 0.68 ? 1.1 - 0.45 * ((p - 0.38) / 0.3) : 0.65 + 0.4 * back);
      });
      this.burst(to.x, to.y - 0.3, to.z, '#ffd23f', 12, 0.5, 1.8);
      this.burst(from.x, from.y - 0.4, from.z, '#ffd23f', 8, 1.1, 1.4);
      return;
    }
    // Tritão e Sereia aparecem ao lado do construtor, voltados para o alvo
    const by = at(e.by as Hex);
    const target = at((kind === 'triton' ? e.from : e.at) as Hex);
    const dir = new THREE.Vector3().subVectors(target, by).setY(0).normalize();
    const stand = by.clone().addScaledVector(dir, -0.75);
    stand.y = Math.max(by.y - 0.1, 0);
    model.scale.setScalar(1.3);
    const yaw = Math.atan2(dir.x, dir.z);
    this.addFx(model, 1.6, 0, (p) => {
      const rise = p < 0.2 ? p / 0.2 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      place(stand);
      model.position.y -= (1 - rise) * 1.6;
      if (kind === 'triton') {
        const lunge = p > 0.35 && p < 0.6 ? Math.sin(((p - 0.35) / 0.25) * Math.PI) * 0.5 : 0;
        model.position.addScaledVector(dir, lunge);
        model.rotation.set(-lunge * 0.5, yaw, 0);
      } else model.rotation.set(0, yaw, 0);
    });
    if (kind === 'triton') this.burst(target.x, target.y + 0.3, target.z, '#ffffff', 16, 0.6);
    else {
      // notas do canto: cubinhos que voam do alvo para a sereia
      for (let i = 0; i < 6; i++) {
        const note = new THREE.Mesh(this.bit, this.models.solid(i % 2 ? '#f29ac2' : '#4df0e0', 0.8));
        this.addFx(note, 0.9, 0.3 + i * 0.12, (p) => {
          note.position.lerpVectors(target, stand, p);
          note.position.y += 0.9 + Math.sin(p * Math.PI) * 0.6;
          note.position.x += Math.sin(p * 9 + i) * 0.08;
          note.scale.setScalar(0.1 * (1 - p * 0.4));
        });
      }
    }
  }

  private runFx(t: number) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      const p = (t - f.t0) / f.dur;
      if (p < 0) continue;
      if (p >= 1) {
        this.fxGroup.remove(f.obj);
        this.fx.splice(i, 1);
        continue;
      }
      f.obj.visible = true;
      f.step(p);
    }
  }

  /* ---------- animação ---------- */

  /** Cor e força da luz em três momentos: dia claro, entardecer alaranjado e noite azul com luar. */
  private static SKY = [
    { clear: 0x2a6fba, sky: 0xffffff, ground: 0x404060, hemi: 1.15, sun: 0xffffff, sunI: 1.35 },
    { clear: 0x8a5a7a, sky: 0xffc9a0, ground: 0x4a3a58, hemi: 0.95, sun: 0xff9a55, sunI: 1.15 },
    { clear: 0x0a1230, sky: 0x6f88d8, ground: 0x0c1226, hemi: 0.62, sun: 0x7f9cff, sunI: 0.6 },
  ];
  private skyTmp = new THREE.Color();
  private applySky(v: number) {
    const k = Math.min(1, Math.max(0, v)) * 2;
    const i = Math.min(1, Math.floor(k));
    const f = k - i;
    const a = Stage3D.SKY[i];
    const b = Stage3D.SKY[i + 1];
    const mix = (x: number, y: number) => this.skyTmp.set(x).lerp(new THREE.Color(y), f);
    this.renderer.setClearColor(mix(a.clear, b.clear));
    this.hemi.color.copy(mix(a.sky, b.sky));
    this.hemi.groundColor.copy(mix(a.ground, b.ground));
    this.hemi.intensity = a.hemi + (b.hemi - a.hemi) * f;
    this.sunLight.color.copy(mix(a.sun, b.sun));
    this.sunLight.intensity = a.sunI + (b.sunI - a.sunI) * f;
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.cam.position.sub(this.shakeOff);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = Math.min(1, this.shake / 0.5) * 0.35;
      this.shakeOff.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    } else this.shakeOff.set(0, 0, 0);
    this.cam.position.add(this.shakeOff);
    const now = performance.now();
    for (const o of this.spinners) {
      if (o.userData.spin) o.rotation.y += dt * o.userData.spin;
      if (o.userData.pulse) o.scale.setScalar(o.userData.pulse * (0.85 + 0.15 * Math.sin(t * 3)));
      if (o.userData.twinkle !== undefined) o.scale.setScalar(0.16 * Math.max(0, Math.sin(t * 2.6 + o.userData.twinkle)));
      if (o.userData.bob && o.userData.baseY !== undefined) o.position.y = o.userData.baseY + Math.sin(t * 2.2) * o.userData.bob;
    }
    for (const rec of this.cellObjs.values()) {
      const p = Math.min(1, (now - rec.born) / 550);
      const ease = 1 - Math.pow(1 - p, 3);
      rec.group.scale.y = rec.from + (1 - rec.from) * ease;
    }
    this.seaTime.value = t;
    if (this.princessCarry?.parent && this.princessCarryParts) {
      // conduzida: segura firme; a salvo no navio: acena feliz
      const P = this.princessCarryParts;
      const wave = this.princessAboard ? 0.9 : 0.15;
      P.armL.rotation.z = 0.5 + Math.sin(t * 8) * 0.3 * wave;
      P.armR.rotation.z = -0.5 - Math.sin(t * 8 + 1) * 0.3 * wave;
    }
    if (this.princessObj?.visible && this.princessParts) {
      this.princessObj.rotation.y = Math.atan2(Math.cos(this.az), Math.sin(this.az)) + Math.sin(t * 1.4) * 0.25; // olha para a câmera e balança
      const P = this.princessParts;
      P.armL.rotation.z = 0.55 + Math.sin(t * 9) * 0.3; // braços para o alto, acenando por socorro
      P.armR.rotation.z = -0.55 - Math.sin(t * 9 + 1) * 0.3;
      P.root.position.y = Math.abs(Math.sin(t * 7)) * 0.04;
      // a cada 7 s ela grita "HELP!" (balão + som)
      const cyc = (t - this.lastHelp) % 7;
      const shouting = t - this.lastHelp < 0 || t - this.lastHelp >= 7 ? false : cyc < 2;
      if (t - this.lastHelp >= 7) {
        this.lastHelp = t;
        this.sfx?.('help');
      }
      if (this.princessBubble) this.princessBubble.visible = shouting || t - this.lastHelp < 2;
      P.mouth.scale.y = P.mouth.userData.baseY * (t - this.lastHelp < 2 ? 1 + 0.7 * Math.abs(Math.sin(t * 14)) : 1);
    }
    // dia vira noite aos poucos, conforme Atlântida emerge (e a luz também segue devagar quando uma nova partida começa)
    if (Math.abs(this.skyTarget - this.skyNow) > 0.0005) {
      this.skyNow += (this.skyTarget - this.skyNow) * (1 - Math.exp(-dt * 1.4));
      this.applySky(this.skyNow);
    }
    // a ilha some: treme, afunda no mar e desaparece (os piratas ficam nas boias, que já estão na água)
    if (this.vanishAt) {
      const p = Math.min(1, (now - this.vanishAt) / 3400);
      const shake = (1 - p) * 0.05 * Math.sin(t * 38);
      this.cellsGroup.position.set(shake, 0, -shake);
      this.sinkCells(now - this.vanishAt);
    }
    for (const { obj, phase } of this.shimmers) {
      // a crista da onda passa em diagonal pelas casas: na crista o hexágono clareia, depois apaga
      const wave = Math.sin(t * 0.9 + phase);
      obj.position.y = 0.012 + wave * 0.008;
      obj.rotation.y = wave * 0.035;
      obj.scale.setScalar(0.96 + wave * 0.025);
      const crest = Math.max(0, wave);
      ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.06 + crest * crest * 0.3;
    }
    this.water.offset.x = (t * 0.004) % 1;
    this.water.offset.y = (t * 0.002) % 1;
    if (this.azTarget !== null) {
      const delta = ((this.azTarget - this.az + Math.PI * 3) % (Math.PI * 2)) - Math.PI; // caminho mais curto
      if (Math.abs(delta) < 0.004) {
        this.az = this.azTarget;
        this.azTarget = null;
      } else this.az += delta * (1 - Math.exp(-dt * 4));
      this.placeCamera();
    }
    const k = 1 - Math.exp(-dt * 9);
    // pose isométrica fixa: o personagem gira junto com o tabuleiro e olha para a câmera do momento (a da tela inicial é outra)
    const faceRy = Math.PI / 2 - (this.home ? HOME_AZ : FRONT_AZ);
    // lado direito da tela, no chão: decide para que lado o bote aponta (espelha a pose isométrica)
    const camRight = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0).setY(0).normalize();
    // de frente para a câmera do momento, virado 45° para a direita ou para a esquerda da tela
    const toCam = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 2);
    const ryCam = Math.atan2(toCam.x, toCam.z);
    const ryRight = [ryCam + ISO_TURN, ryCam - ISO_TURN].find((r) => Math.sin(r) * camRight.x + Math.cos(r) * camRight.z > 0) ?? ryCam + ISO_TURN;
    const ryLeft = ryRight === ryCam + ISO_TURN ? ryCam - ISO_TURN : ryCam + ISO_TURN;
    for (const e of this.ents.values()) {
      if (e.script) {
        const sp = (t - e.script.t0) / e.script.dur;
        if (sp >= 1) {
          e.script = undefined;
          e.spinZ = undefined;
          e.pos.copy(e.target);
        } else e.script.step(Math.max(0, sp), e.pos);
      }
      const dist = this.home || e.script ? 0 : e.pos.distanceTo(e.target);
      if (this.home) e.pos.copy(e.target); // tela inicial: nada desliza nem pula; os navios só boiam no lugar
      else if (!e.script) e.pos.lerp(e.target, k);
      const hop = Math.min(0.35, dist * 0.3);
      const bob = e.floating ? Math.sin(t * 1.6 + (e.kind.includes('-boat-') ? e.pos.x : e.phase)) * 0.08 : 0; // quem divide o bote balança junto
      e.group.position.set(e.pos.x, e.pos.y + hop + bob, e.pos.z);
      if (e.turns && e.faceTo) {
        const toShip = (e.faceTo.x - e.target.x) * camRight.x + (e.faceTo.z - e.target.z) * camRight.z;
        e.group.rotation.y = toShip >= 0 ? ryRight : ryLeft;
      } else if (e.turns) e.group.rotation.y = faceRy + ISO_TURN;
      // quem boia grita "homem ao mar!" de tempos em tempos (cada um no seu ritmo), no mesmo estilo da princesa
      if (e.kind.endsWith('-floating')) {
        if (!e.bubble) {
          e.bubble = this.makeBubble(this.overboardLine, '#0d2f6b');
          e.bubble.position.set(0, 1.6, 0);
          e.group.add(e.bubble);
        }
        const on = (t + e.phase * 1.7) % 6 < 2.2;
        if (on && !e.shouting && t - this.lastOverboard > 2.5) {
          this.lastOverboard = t;
          this.sfx?.('help');
        }
        e.shouting = on;
        e.bubble.visible = on;
      } else if (e.bubble) {
        e.group.remove(e.bubble);
        e.bubble = undefined;
      }
      if (e.armR && e.armL && e.kind.endsWith('-floating')) {
        // desespero: braços para cima, se debatendo, e o corpo balançando na boia
        const f = t * 9 + e.phase;
        e.armL.rotation.x = -2.95 + Math.sin(f) * 0.35;
        e.armR.rotation.x = -2.95 + Math.sin(f + Math.PI) * 0.35;
        e.armL.rotation.z = -0.6 - Math.sin(f * 0.5) * 0.2; // abertos em V, acenando
        e.armR.rotation.z = 0.6 + Math.sin(f * 0.5) * 0.2;
        e.group.rotation.z = Math.sin(t * 2.4 + e.phase) * 0.12;
        e.group.rotation.x = Math.sin(t * 1.9 + e.phase) * 0.08;
      } else if (e.armR && e.armL) {
        if (e.group.rotation.z) e.group.rotation.z = e.group.rotation.x = 0;
        e.armL.rotation.z = e.armR.rotation.z = 0;
        const sw = t - (e.swingAt ?? -9);
        e.armL.rotation.x = Math.sin(t * 2 + e.phase) * 0.06;
        e.armR.rotation.x = sw < 0.7 ? -1.5 + Math.sin((sw / 0.7) * Math.PI * 3) * 0.9 : -0.25 + Math.sin(t * 2 + e.phase + 2) * 0.06;
      }
      // movimentos de espera dos piratas em pé: olhar em volta, coçar a cabeça, luneta e relógio de bolso
      if (e.armL && e.armR && !this.sleeping && !e.script && !e.floating && !e.kind.includes('-boat') && dist < 0.05 && t - (e.swingAt ?? -9) > 0.8) this.idleStep(e, t);
      else if (e.idle) this.idleStop(e);
      if (!e.armL && !e.script && (!this.sleeping || e.id.startsWith('ship'))) this.creatureIdle(e, t); // a bandeira dos navios continua ao vento mesmo com todos dormindo
      if (this.sleeping && e.armR && e.armL && !e.script && !e.kind.endsWith('-floating')) {
        // dormindo: tombado de lado, cabeça caída, respirando devagar
        e.armL.rotation.x = e.armR.rotation.x = 0.12;
        e.armL.rotation.z = e.armR.rotation.z = 0;
        e.group.rotation.z = 0.24 + Math.sin(t * 1.3 + e.phase) * 0.025;
        e.group.rotation.x = 0.14 + Math.sin(t * 1.3 + e.phase) * 0.02;
      }
      if (e.zzz) {
        e.zzz.visible = this.sleeping && !e.script;
        e.zzz.children.forEach((z, i) => {
          const u = (t * 0.45 + i / 3 + e.phase * 0.1) % 1;
          z.position.set(0.1 + u * 0.35, 1.35 + u * 0.8, 0);
          z.scale.setScalar(0.22 + u * 0.3);
          ((z as THREE.Sprite).material as THREE.SpriteMaterial).opacity = Math.min(1, (1 - u) * 1.6);
        });
      }
      if (e.script && e.spinZ !== undefined) {
        // arremessado: gira no ar, esperneando e se debatendo (não duro nem quadrado)
        const f = t * 21 + e.phase;
        e.group.rotation.z = e.spinZ + Math.sin(f * 0.7) * 0.35;
        e.group.rotation.x = Math.sin(f * 0.5) * 0.5;
        if (e.armR && e.armL) {
          e.armL.rotation.x = -2.5 + Math.sin(f) * 0.8;
          e.armR.rotation.x = -2.5 + Math.sin(f + 2.4) * 0.8;
          e.armL.rotation.z = -1 - Math.sin(f * 1.3) * 0.5;
          e.armR.rotation.z = 1 + Math.sin(f * 1.1) * 0.5;
        }
      }
    }
    const pulse = 0.35 + 0.12 * Math.sin(t * 5);
    this.hlMats.move.opacity = pulse;
    this.hlMats.treasure.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 6)); // tesouro ao alcance: pisca mais forte
    this.hlMats.flood.opacity = pulse;
    this.runFx(t);
    this.renderer.render(this.scene, this.cam);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.cleanups.forEach((f) => f());
    this.ro.disconnect();
    this.models.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
