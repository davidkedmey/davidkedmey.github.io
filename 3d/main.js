/**
 * 3D Biomorph Viewer — single specimen on a pedestal with orbit controls.
 * Mode selector, prev/next cycling, auto-rotation, collect.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment } from './environment.js';
import { createTree, disposeTree, clearMaterialCache } from './tree-renderer.js';
import { randomInteresting, MODE_CONFIGS } from '../shared/genotype.js';
import { saveToCollection, isInCollection } from '../shared/collection.js';

// ── Constants ──────────────────────────────────────────────

const SPECIMENS_PER_MODE = 4;
const ROTATE_SPEED = 0.3;

// ── Renderer ───────────────────────────────────────────────

const container = document.getElementById('scene-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
container.appendChild(renderer.domElement);

// ── Scene ──────────────────────────────────────────────────

const scene = new THREE.Scene();
createEnvironment(scene);

// ── Camera + OrbitControls ─────────────────────────────────

const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.1,
  200
);
camera.position.set(0, 8, 22);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 25;
controls.update();

// ── Pedestal ───────────────────────────────────────────────

const pedestalGeo = new THREE.CylinderGeometry(1.5, 1.8, 0.4, 12);
const pedestalMat = new THREE.MeshStandardMaterial({
  color: 0x2a2a30,
  roughness: 0.8,
  metalness: 0.1,
});
const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
pedestal.position.set(0, 0.2, 0);
pedestal.receiveShadow = true;
scene.add(pedestal);

// ── State ──────────────────────────────────────────────────

let currentMode = 1;
let specimens = [];       // { genes, mode }[]
let currentIndex = 0;
let treeGroup = null;
let autoRotate = true;

// ── DOM refs ───────────────────────────────────────────────

const geneDisplay = document.getElementById('gene-display');
const collectPromptEl = document.getElementById('collect-prompt');
const counterEl = document.getElementById('specimen-counter');
const counterLabel = document.getElementById('counter-label');
const modeSelect = document.getElementById('mode-select');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnPause = document.getElementById('btn-pause');
const btnRegen = document.getElementById('btn-regenerate');
const btnCollect = document.getElementById('btn-collect');

// ── Specimen management ────────────────────────────────────

function generateSpecimens(mode) {
  specimens = [];
  for (let i = 0; i < SPECIMENS_PER_MODE; i++) {
    specimens.push({ genes: randomInteresting(mode), mode });
  }
  currentIndex = 0;
}

function showSpecimen(idx) {
  // Dispose old tree
  if (treeGroup) {
    disposeTree(treeGroup);
    scene.remove(treeGroup);
    treeGroup = null;
  }

  currentIndex = idx;
  const specimen = specimens[currentIndex];
  const tree = createTree(specimen.genes);
  tree.position.set(0, 0.4, 0);
  scene.add(tree);
  treeGroup = tree;

  updateGeneDisplay();
  updateCounter();
  updateCollectPrompt();
}

function setMode(mode) {
  currentMode = mode;
  clearMaterialCache();
  generateSpecimens(mode);
  showSpecimen(0);
}

// ── Display updates ────────────────────────────────────────

function updateGeneDisplay() {
  const specimen = specimens[currentIndex];
  const config = MODE_CONFIGS[specimen.mode] || MODE_CONFIGS[1];
  const chips = [];
  for (let i = 0; i < config.geneCount && i < specimen.genes.length; i++) {
    chips.push(`${config.geneLabels[i]}=${specimen.genes[i]}`);
  }
  geneDisplay.textContent = chips.join('  ');
}

function updateCounter() {
  const text = `${currentIndex + 1} / ${specimens.length}`;
  counterLabel.textContent = text;
  counterEl.textContent = text;
}

function updateCollectPrompt() {
  const specimen = specimens[currentIndex];
  if (isInCollection(specimen.genes, specimen.mode)) {
    collectPromptEl.textContent = '\u2713 Collected';
    collectPromptEl.style.color = '#4c4';
    btnCollect.textContent = '\u2713 Collected';
    btnCollect.style.borderColor = '#4c4';
  } else {
    collectPromptEl.textContent = '';
    collectPromptEl.style.color = '#8b949e';
    btnCollect.textContent = 'Collect';
    btnCollect.style.borderColor = '';
  }
}

// ── HUD wiring ─────────────────────────────────────────────

modeSelect.addEventListener('change', () => {
  setMode(parseInt(modeSelect.value, 10));
});

btnPrev.addEventListener('click', () => {
  const idx = (currentIndex - 1 + specimens.length) % specimens.length;
  showSpecimen(idx);
});

btnNext.addEventListener('click', () => {
  const idx = (currentIndex + 1) % specimens.length;
  showSpecimen(idx);
});

btnPause.addEventListener('click', () => {
  autoRotate = !autoRotate;
  btnPause.textContent = autoRotate ? '\u23F8' : '\u25B6';
});

btnRegen.addEventListener('click', () => {
  clearMaterialCache();
  generateSpecimens(currentMode);
  showSpecimen(0);
});

btnCollect.addEventListener('click', () => {
  const specimen = specimens[currentIndex];
  if (!isInCollection(specimen.genes, specimen.mode)) {
    saveToCollection({
      genes: specimen.genes,
      mode: specimen.mode,
      source: '3d-gallery',
    });
    updateCollectPrompt();
  }
});

// ── WASD movement ──────────────────────────────────────────

const WALK_SPEED = 8;
const RUN_SPEED = 16;
const FLY_SPEED = 6;

const keys = new Set();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

const MOVE_KEYS = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD',
  'Space', 'KeyC', 'ShiftLeft', 'ShiftRight',
]);

function updateMovement(delta) {
  if (keys.size === 0) return;

  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? RUN_SPEED : WALK_SPEED;

  // Forward/back based on camera facing (flattened to XZ)
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  _fwd.normalize();
  _right.crossVectors(_fwd, camera.up).normalize();

  _move.set(0, 0, 0);
  if (keys.has('KeyW')) _move.addScaledVector(_fwd, speed * delta);
  if (keys.has('KeyS')) _move.addScaledVector(_fwd, -speed * delta);
  if (keys.has('KeyA')) _move.addScaledVector(_right, -speed * delta);
  if (keys.has('KeyD')) _move.addScaledVector(_right, speed * delta);
  if (keys.has('Space')) _move.y += FLY_SPEED * delta;
  if (keys.has('KeyC'))  _move.y -= FLY_SPEED * delta;

  // Move camera and orbit target together
  camera.position.add(_move);
  controls.target.add(_move);
}

// ── Keyboard shortcuts ─────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Don't capture when select is focused
  if (e.target === modeSelect) return;

  // Track movement keys
  if (MOVE_KEYS.has(e.code)) {
    keys.add(e.code);
    e.preventDefault();
    return;
  }

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault();
      btnPrev.click();
      break;
    case 'ArrowRight':
      e.preventDefault();
      btnNext.click();
      break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      e.preventDefault();
      const mode = parseInt(e.code.charAt(5), 10);
      modeSelect.value = mode;
      setMode(mode);
      break;
    case 'KeyF':
      e.preventDefault();
      btnCollect.click();
      break;
    case 'KeyR':
      e.preventDefault();
      btnRegen.click();
      break;
    case 'KeyP':
      e.preventDefault();
      btnPause.click();
      break;
  }
});

document.addEventListener('keyup', (e) => keys.delete(e.code));

// ── Resize ─────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// ── Init ───────────────────────────────────────────────────

const clock = new THREE.Clock();
generateSpecimens(currentMode);
showSpecimen(0);

// ── Render loop ────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  updateMovement(delta);
  controls.update();

  if (autoRotate && treeGroup) {
    treeGroup.rotation.y += ROTATE_SPEED * delta;
  }

  renderer.render(scene, camera);
}

animate();
