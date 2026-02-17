/**
 * 3D Biomorph Gallery — keyboard-controlled walk through five exhibit
 * zones, each showcasing a different Dawkins biomorph mode.
 */

import * as THREE from 'three';
import { createEnvironment } from './environment.js';
import { createTree, disposeTree, clearMaterialCache } from './tree-renderer.js';
import { randomInteresting, MODE_CONFIGS } from '../shared/genotype.js';
import { saveToCollection, isInCollection } from '../shared/collection.js';

// ── Renderer ────────────────────────────────────────────────

const container = document.getElementById('scene-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
container.appendChild(renderer.domElement);

// ── Scene ───────────────────────────────────────────────────

const scene = new THREE.Scene();
const { sun, ambient, hemi } = createEnvironment(scene);

// ── Camera ──────────────────────────────────────────────────

const camera = new THREE.PerspectiveCamera(
  70,
  container.clientWidth / container.clientHeight,
  0.1,
  500
);
camera.position.set(0, 1.7, -155);
camera.rotation.order = 'YXZ';

let yaw = Math.PI;   // face +z
let pitch = 0;

// ── DOM refs ────────────────────────────────────────────────

const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const geneOverlay = document.getElementById('gene-overlay');
const geneDisplay = document.getElementById('gene-display');
const zoneNameEl = document.getElementById('zone-name');
const collectPromptEl = document.getElementById('collect-prompt');

// ── Activation (no pointer lock) ────────────────────────────

let active = false;

overlay.addEventListener('click', () => {
  active = true;
  overlay.style.display = 'none';
  hud.style.display = 'flex';
});

// ── Input ───────────────────────────────────────────────────

const WALK_SPEED = 8;
const RUN_SPEED = 16;
const FLY_SPEED = 6;
const TURN_SPEED = 2.0;
const PITCH_SPEED = 1.5;
const MAX_PITCH = Math.PI / 3;
const EYE_HEIGHT = 1.7;

const keys = new Set();

const GAME_KEYS = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyC', 'ShiftLeft', 'ShiftRight', 'KeyF',
  'KeyQ', 'KeyE',
]);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (active) {
      active = false;
      keys.clear();
      overlay.style.display = 'flex';
      hud.style.display = 'none';
      geneOverlay.style.display = 'none';
    }
    return;
  }
  if (active) {
    keys.add(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => keys.delete(e.code));

// ── Movement ────────────────────────────────────────────────

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

function updateMovement(delta) {
  if (!active) return;

  // Look
  if (keys.has('ArrowLeft'))  yaw += TURN_SPEED * delta;
  if (keys.has('ArrowRight')) yaw -= TURN_SPEED * delta;
  if (keys.has('ArrowUp'))    pitch = Math.min(MAX_PITCH, pitch + PITCH_SPEED * delta);
  if (keys.has('ArrowDown'))  pitch = Math.max(-MAX_PITCH, pitch - PITCH_SPEED * delta);

  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // Move
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? RUN_SPEED : WALK_SPEED;

  _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw));

  if (keys.has('KeyW')) camera.position.addScaledVector(_fwd, speed * delta);
  if (keys.has('KeyS')) camera.position.addScaledVector(_fwd, -speed * delta);
  if (keys.has('KeyA')) camera.position.addScaledVector(_right, -speed * delta);
  if (keys.has('KeyD')) camera.position.addScaledVector(_right, speed * delta);

  // Vertical
  if (keys.has('Space')) camera.position.y += FLY_SPEED * delta;
  if (keys.has('KeyC'))  camera.position.y -= FLY_SPEED * delta;
  if (camera.position.y < EYE_HEIGHT) camera.position.y = EYE_HEIGHT;
}

// ── Zones ───────────────────────────────────────────────────

const ZONES = [
  { name: 'Basic',        mode: 1, zMin: -150, zMax: -90, color: 0x4488ff },
  { name: 'Symmetry',     mode: 2, zMin: -90,  zMax: -30, color: 0x44ff88 },
  { name: 'Segments',     mode: 3, zMin: -30,  zMax: 30,  color: 0xff8844 },
  { name: 'Gradients',    mode: 4, zMin: 30,   zMax: 90,  color: 0xff44aa },
  { name: 'Full Dawkins', mode: 5, zMin: 90,   zMax: 150, color: 0xaa44ff },
];

const PATH_HALF_WIDTH = 3;

let currentZone = null;

function getZoneAt(z) {
  for (const zone of ZONES) {
    if (z >= zone.zMin && z < zone.zMax) return zone;
  }
  return null;
}

function updateZoneDisplay() {
  const zone = getZoneAt(camera.position.z);
  if (zone !== currentZone) {
    currentZone = zone;
    if (zoneNameEl) {
      zoneNameEl.textContent = zone ? zone.name : '—';
      zoneNameEl.style.color = zone
        ? '#' + zone.color.toString(16).padStart(6, '0')
        : '#8b949e';
    }
  }
}

// ── Zone markers + labels ───────────────────────────────────

function createZoneMarkers() {
  for (const zone of ZONES) {
    const z = zone.zMin;
    const color = zone.color;

    const geo = new THREE.CylinderGeometry(0.12, 0.12, 4, 8);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
    });

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(geo, mat);
      pillar.position.set(side * PATH_HALF_WIDTH, 2, z);
      pillar.castShadow = true;
      scene.add(pillar);
    }

    const label = createTextSprite(zone.name, color);
    label.position.set(0, 5, z + 3);
    scene.add(label);
  }
}

function createTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(10, 2.5, 1);
  return sprite;
}

// ── Day/Night Cycle ─────────────────────────────────────────

const CYCLE_DURATION = 90;

let timeOfDay = 0.3;

const COLOR_MIDNIGHT = new THREE.Color(0x020408);
const COLOR_DAWN = new THREE.Color(0x4a3020);
const COLOR_NOON = new THREE.Color(0x6a8aaa);
const COLOR_SUN_WARM = new THREE.Color(0xff8844);
const COLOR_SUN_NEUTRAL = new THREE.Color(0xffeedd);

const skyColor = new THREE.Color();

function updateDayNight(delta) {
  timeOfDay += delta / CYCLE_DURATION;
  if (timeOfDay >= 1) timeOfDay -= 1;

  const sunAngle = timeOfDay * Math.PI * 2;
  const sunHeight = Math.sin(sunAngle);

  const px = camera.position.x;
  const pz = camera.position.z;
  sun.position.set(
    px + Math.cos(sunAngle) * 40,
    Math.sin(sunAngle) * 35,
    pz + 10
  );
  sun.target.position.set(px, 0, pz);

  const dayFactor = Math.max(0, Math.sin(timeOfDay * Math.PI));
  sun.intensity = dayFactor * 3.5;
  sun.visible = dayFactor > 0.01;
  ambient.intensity = 0.1 + dayFactor * 0.9;
  hemi.intensity = 0.15 + dayFactor * 1.2;

  if (sunHeight < 0) {
    skyColor.copy(COLOR_MIDNIGHT);
  } else if (sunHeight < 0.3) {
    skyColor.lerpColors(COLOR_MIDNIGHT, COLOR_DAWN, sunHeight / 0.3);
  } else if (sunHeight < 0.6) {
    skyColor.lerpColors(COLOR_DAWN, COLOR_NOON, (sunHeight - 0.3) / 0.3);
  } else {
    skyColor.copy(COLOR_NOON);
  }
  scene.background.copy(skyColor);
  scene.fog.color.copy(skyColor);

  const warmth = 1 - Math.min(1, Math.max(0, sunHeight) * 2);
  sun.color.lerpColors(COLOR_SUN_NEUTRAL, COLOR_SUN_WARM, warmth);
}

// ── Showcase pedestal gallery ────────────────────────────────

const SPECIMENS_PER_ZONE = 4;
const PEDESTAL_X = 6;
const BACKDROP_OFFSET = 3;
const ROTATE_SPEED = 0.3;
const GENE_APPROACH_DIST = 8;

const backdropMat = new THREE.MeshStandardMaterial({
  color: 0x12141a,
  roughness: 0.95,
  metalness: 0.0,
});
const pedestalGeo = new THREE.CylinderGeometry(1.5, 1.8, 0.4, 12);
const pedestalMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a30,
  roughness: 0.8,
  metalness: 0.1,
});
const backWallGeo = new THREE.BoxGeometry(0.3, 14, 10);

const counterEl = document.getElementById('specimen-counter');

const zoneExhibits = ZONES.map((zone, i) => ({
  zone,
  specimens: [],
  currentIndex: 0,
  side: (i % 2 === 0) ? -1 : 1,
  centerZ: (zone.zMin + zone.zMax) / 2,
  treeGroup: null,
  pedestal: null,
  backWall: null,
}));

function showSpecimen(zoneIdx, specimenIdx) {
  const ze = zoneExhibits[zoneIdx];
  // Dispose old tree
  if (ze.treeGroup) {
    disposeTree(ze.treeGroup);
    scene.remove(ze.treeGroup);
    ze.treeGroup = null;
  }
  ze.currentIndex = specimenIdx;
  const specimen = ze.specimens[specimenIdx];
  const tree = createTree(specimen.genes);
  tree.position.set(ze.side * PEDESTAL_X, 0.4, ze.centerZ);
  scene.add(tree);
  ze.treeGroup = tree;
}

function generateGallery() {
  // Dispose everything
  for (const ze of zoneExhibits) {
    if (ze.treeGroup) { disposeTree(ze.treeGroup); scene.remove(ze.treeGroup); ze.treeGroup = null; }
    if (ze.pedestal) { scene.remove(ze.pedestal); ze.pedestal = null; }
    if (ze.backWall) { scene.remove(ze.backWall); ze.backWall = null; }
    ze.specimens = [];
    ze.currentIndex = 0;
  }
  clearMaterialCache();

  for (let i = 0; i < zoneExhibits.length; i++) {
    const ze = zoneExhibits[i];
    // Generate specimen data
    for (let j = 0; j < SPECIMENS_PER_ZONE; j++) {
      ze.specimens.push({ genes: randomInteresting(ze.zone.mode), mode: ze.zone.mode });
    }
    // Pedestal
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.set(ze.side * PEDESTAL_X, 0.2, ze.centerZ);
    pedestal.receiveShadow = true;
    scene.add(pedestal);
    ze.pedestal = pedestal;
    // Back wall
    const wall = new THREE.Mesh(backWallGeo, backdropMat);
    wall.position.set(ze.side * (PEDESTAL_X + BACKDROP_OFFSET), 7, ze.centerZ);
    wall.receiveShadow = true;
    scene.add(wall);
    ze.backWall = wall;
    // Show first specimen
    showSpecimen(i, 0);
  }
}

// ── Gene display on approach ────────────────────────────────

let nearestZoneIdx = -1;

function checkProximity() {
  if (!active) return;

  const cx = camera.position.x;
  const cz = camera.position.z;
  let closestIdx = -1;
  let closestDist = GENE_APPROACH_DIST;

  for (let i = 0; i < zoneExhibits.length; i++) {
    const ze = zoneExhibits[i];
    if (!ze.pedestal) continue;
    const dx = ze.side * PEDESTAL_X - cx;
    const dz = ze.centerZ - cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }

  if (closestIdx >= 0) {
    const ze = zoneExhibits[closestIdx];
    const specimen = ze.specimens[ze.currentIndex];

    // Update gene display when zone or specimen changes
    if (closestIdx !== nearestZoneIdx) {
      nearestZoneIdx = closestIdx;
    }
    const config = MODE_CONFIGS[specimen.mode] || MODE_CONFIGS[1];
    const chips = [];
    for (let i = 0; i < config.geneCount && i < specimen.genes.length; i++) {
      chips.push(`${config.geneLabels[i]}=${specimen.genes[i]}`);
    }
    geneDisplay.textContent = chips.join('  ');

    // Counter
    counterEl.textContent = `${ze.currentIndex + 1} / ${ze.specimens.length}`;

    // Collect prompt
    if (isInCollection(specimen.genes, specimen.mode)) {
      collectPromptEl.textContent = '\u2713 Collected';
      collectPromptEl.style.color = '#4c4';
    } else {
      collectPromptEl.textContent = 'Press F to collect';
      collectPromptEl.style.color = '#8b949e';
    }

    // Q/E cycling
    if (keys.has('KeyQ')) {
      keys.delete('KeyQ');
      const newIdx = (ze.currentIndex - 1 + ze.specimens.length) % ze.specimens.length;
      showSpecimen(closestIdx, newIdx);
    }
    if (keys.has('KeyE')) {
      keys.delete('KeyE');
      const newIdx = (ze.currentIndex + 1) % ze.specimens.length;
      showSpecimen(closestIdx, newIdx);
    }

    // F to collect
    if (keys.has('KeyF')) {
      keys.delete('KeyF');
      if (!isInCollection(specimen.genes, specimen.mode)) {
        saveToCollection({
          genes: specimen.genes,
          mode: specimen.mode,
          source: '3d-gallery',
        });
        collectPromptEl.textContent = '\u2713 Collected';
        collectPromptEl.style.color = '#4c4';
      }
    }

    geneOverlay.style.display = 'block';
  } else {
    nearestZoneIdx = -1;
    geneOverlay.style.display = 'none';
  }
}

// ── Controls ────────────────────────────────────────────────

document.getElementById('btn-regenerate').addEventListener('click', () => {
  generateGallery();
});

// ── Resize ──────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// ── Init ────────────────────────────────────────────────────

const clock = new THREE.Clock();
createZoneMarkers();
generateGallery();

// ── Render loop ─────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  updateMovement(delta);
  updateDayNight(delta);

  // Auto-rotate specimens
  for (const ze of zoneExhibits) {
    if (ze.treeGroup) ze.treeGroup.rotation.y += ROTATE_SPEED * delta;
  }

  checkProximity();
  updateZoneDisplay();
  renderer.render(scene, camera);
}

animate();
