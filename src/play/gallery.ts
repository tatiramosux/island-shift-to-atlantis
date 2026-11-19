/** Galeria de personagens (só para desenvolvimento): todos os modelos em tamanho grande, para ajustar o visual. */
import * as THREE from 'three';
import { Models } from '../stage/models';
import { buildSummon } from '../stage/summons';

const host = document.getElementById('v')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x2a6fba);
renderer.shadowMap.enabled = true;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.position.set(6, 12, 8);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
scene.add(sun);
const m = new Models();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xecd48e }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const put = (o: THREE.Object3D, x: number, z: number, s = 1) => {
  o.scale.setScalar(s);
  o.position.set(x, 0, z);
  scene.add(o);
};
for (let p = 0; p < 4; p++) {
  put(m.builder(p, 0), p * 1.3 - 2, 1.2, 1.8);
  put(m.builder(p, 1), p * 1.3 - 2, 0, 1.8);
}
(['triton', 'dolphin', 'siren', 'colossus'] as const).forEach((k, i) => put(buildSummon(m, k), i * 1.8 - 2.4, -1.8, 1.2));
(['octopus', 'leviathan', 'guardian'] as const).forEach((k, i) => put(m.creature(k), i * 2 - 2.4, -3.6, 1.4));
// fontes e ruínas: cada casa sorteia um desenho um pouco diferente
([['fountain', 0.12], ['fountain', 0.55], ['fountain', 0.9], ['ruin', 0.2], ['ruin', 0.6], ['ruin', 0.85]] as const).forEach(([k, v], i) => put(m.decor(k, v), (i % 3) * 1.8 - 1.8, -5.6 - Math.floor(i / 3) * 1.6, 1));

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
let az = Math.PI / 2 - 0.5;
let zoom = 1;
const place = () => {
  const e = Math.PI / 6;
  cam.position.set(Math.cos(e) * Math.cos(az) * 40, Math.sin(e) * 40, Math.cos(e) * Math.sin(az) * 40).add(new THREE.Vector3(0.4, 0, -1));
  cam.lookAt(0.4, 0.6, -1);
};
const resize = () => {
  const w = host.clientWidth;
  const h = host.clientHeight;
  renderer.setSize(w, h);
  cam.left = (-5 * w) / h;
  cam.right = (5 * w) / h;
  cam.top = 5;
  cam.bottom = -5;
  cam.zoom = zoom;
  cam.updateProjectionMatrix();
  place();
};
addEventListener('resize', resize);
resize();
let down: { x: number; az: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, az }));
addEventListener('pointerup', () => (down = null));
addEventListener('pointermove', (e) => {
  if (down) {
    az = down.az - (e.clientX - down.x) * 0.009;
    place();
  }
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = Math.max(0.5, Math.min(4, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
  cam.zoom = zoom;
  cam.updateProjectionMatrix();
});
(window as unknown as Record<string, unknown>).__gal = { turn: (a: number) => ((az = a), place()), zoomTo: (z: number) => ((zoom = z), (cam.zoom = z), cam.updateProjectionMatrix()) };
const tick = () => {
  requestAnimationFrame(tick);
  renderer.render(scene, cam);
};
tick();
