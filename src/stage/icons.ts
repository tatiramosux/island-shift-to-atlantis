/**
 * Ícones dos personagens para a interface (dados, convocações): cada modelo 3D é fotografado uma vez por um
 * renderizador escondido e vira uma imagem pequena com fundo transparente.
 */
import * as THREE from 'three';
import { Models } from './models';
import { buildSummon } from './summons';
import { buildNereus } from './legends';

export type IconName = 'octopus' | 'leviathan' | 'guardian' | 'surge' | 'lull' | 'triton' | 'lasso' | 'siren' | 'colossus';

let cache: Record<IconName, string> | null = null;

export const icons = (): Record<IconName, string> => {
  if (cache) return cache;
  const SIZE = 192;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  const models = new Models();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  const shoot = (obj: THREE.Object3D): string => {
    scene.add(obj);
    obj.rotation.y = -0.55;
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const half = Math.max(size.x, size.y * 1.15, size.z) * 0.62 + 0.1;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
    cam.position.set(c.x + 9 * Math.cos(Math.PI / 6) * Math.cos(Math.PI / 2 - 0.1), c.y + 9 * Math.sin(Math.PI / 6) + 1, c.z + 9 * Math.cos(Math.PI / 6));
    cam.lookAt(c);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(obj);
    return url;
  };

  // Mar parado: três ondas calmas desenhadas em SVG
  const lullIcon =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><g fill="none" stroke="#9fe3ff" stroke-width="7" stroke-linecap="round">' +
        '<path d="M14 32q11-12 22 0t22 0t22 0"/><path d="M14 52q11-12 22 0t22 0t22 0"/><path d="M14 72q11-12 22 0t22 0t22 0"/></g></svg>',
    );
  const crystal = models.decor('crystal');
  crystal.scale.setScalar(2.4);
  cache = {
    octopus: shoot(models.creature('octopus')),
    leviathan: shoot(models.creature('leviathan')),
    guardian: shoot(buildNereus(models).root), // a face da Sentinela agora é o Nereu
    surge: shoot(crystal),
    lull: lullIcon,
    triton: shoot(buildSummon(models, 'triton')),
    lasso: shoot(buildSummon(models, 'lasso')),
    siren: shoot(buildSummon(models, 'siren')),
    colossus: shoot(buildSummon(models, 'colossus')),
  };
  for (let p = 0; p < 4; p++) for (let i = 0; i < 2; i++) builderCache[`${p}-${i}`] = shoot(models.builder(p, i));
  renderer.dispose();
  return cache;
};

const builderCache: Record<string, string> = {};
/** Retrato do pirata (jogador, número 0 ou 1) para a barra de ações. */
export const builderIcon = (player: number, index: number): string => {
  icons();
  return builderCache[`${player}-${index}`];
};

/** Retratos novos dos dois piratas de um time (com a aparência atual: piratas ou robôs), para o aviso de fim de partida. */
export const teamIcons = (player: number): string[] => {
  const SIZE = 192;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  const models = new Models();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const out = [0, 1].map((i) => {
    const obj = models.builder(player, i);
    scene.add(obj);
    obj.rotation.y = -0.55;
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const half = Math.max(size.x, size.y * 1.15, size.z) * 0.62 + 0.1;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
    cam.position.set(c.x + 9 * Math.cos(Math.PI / 6) * Math.cos(Math.PI / 2 - 0.1), c.y + 9 * Math.sin(Math.PI / 6) + 1, c.z + 9 * Math.cos(Math.PI / 6));
    cam.lookAt(c);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(obj);
    return url;
  });
  renderer.dispose();
  return out;
};
