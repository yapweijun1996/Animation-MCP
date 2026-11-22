import * as THREE from 'three';
import type { ThreeScene } from './three-preview.js';

function positionAt(frames: ThreeScene['spheres'][number]['keyframes'], time: number): THREE.Vector3 {
  const index = frames.findIndex((frame) => frame.time >= time);
  const end = frames[index < 0 ? frames.length - 1 : index];
  const position = new THREE.Vector3(end.x, end.y, end.z);
  if (index <= 0) return position;
  const start = frames[index - 1];
  const progress = (time - start.time) / (end.time - start.time);
  return new THREE.Vector3(start.x, start.y, start.z).lerp(position, progress);
}

export function renderStill(input: ThreeScene, time: number): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(input.background);
  scene.fog = new THREE.Fog(input.background, 13, 32);

  const aspect = input.width / input.height;
  const halfHeight = Math.max(3.2625, 5.8 / aspect);
  const halfWidth = halfHeight * aspect;
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 50);
  camera.position.set(0, 3.1, 12);
  camera.lookAt(0, 1.55, 0);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 65),
    new THREE.MeshStandardMaterial({ color: '#213b53', roughness: 0.86 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  for (const sphere of input.spheres) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(sphere.radius, 48, 32),
      new THREE.MeshStandardMaterial({ color: sphere.color, roughness: 0.29, metalness: 0.16 }),
    );
    ball.castShadow = true;
    ball.position.copy(positionAt(sphere.keyframes, time));
    scene.add(ball);
  }

  scene.add(new THREE.HemisphereLight('#d9ecff', '#26344e', 2));
  const key = new THREE.DirectionalLight('#fff0d6', 3);
  key.position.set(-3.8, 7.8, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -7, right: 7, bottom: -5, top: 5, near: 0.5, far: 22 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.012;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fcfff', 1.4);
  rim.position.set(3, 3, -6);
  scene.add(rim);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(input.width, input.height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  document.body.append(renderer.domElement);
  renderer.render(scene, camera);
}
