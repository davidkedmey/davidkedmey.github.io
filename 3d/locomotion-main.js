/**
 * Locomotion Arena — physics-based biomorph movement.
 *
 * Sets up Three.js scene + cannon-es physics world, spawns an articulated
 * biomorph, drives joint motors via MuscleSystem, camera follows creature.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment, switchEnvironment } from './environment.js';
import { createTreeBodies } from './tree-renderer.js';
import { randomInteresting } from '../shared/genotype.js';
import { extractSkeleton, analyzeGait, configureWorld, GROUP_GROUND, GROUP_CREATURE } from './physics-skeleton.js';
import { MuscleSystem } from './muscle-system.js';

// ── Renderer ──────────────────────────────────────────────────

const container = document.getElementById('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
container.appendChild(renderer.domElement);

// ── Scene + environment ───────────────────────────────────────

const scene = new THREE.Scene();
const lights = createEnvironment(scene);
switchEnvironment(scene, 'garden', lights, null);

// ── Camera ────────────────────────────────────────────────────

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 4, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.target.set(0, 1.5, 0);
controls.minDistance = 3;
controls.maxDistance = 60;

// ── Ground plane ──────────────────────────────────────────────

const groundSize = 200;
const checkSize = 2;
const cvs = document.createElement('canvas');
cvs.width = 512;
cvs.height = 512;
const ctx = cvs.getContext('2d');
const tileCount = 32;
const tileSize = cvs.width / tileCount;
for (let r = 0; r < tileCount; r++) {
  for (let c = 0; c < tileCount; c++) {
    ctx.fillStyle = (r + c) % 2 === 0 ? '#5a7a5a' : '#4a6a4a';
    ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
  }
}
const groundTex = new THREE.CanvasTexture(cvs);
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(groundSize / checkSize, groundSize / checkSize);
groundTex.colorSpace = THREE.SRGBColorSpace;

const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// ── Physics world ─────────────────────────────────────────────

const world = new CANNON.World();
configureWorld(world);

// Ground body
const groundMat = new CANNON.Material('ground');
const groundBody = new CANNON.Body({
  mass: 0,
  shape: new CANNON.Plane(),
  material: groundMat,
  collisionFilterGroup: GROUP_GROUND,
  collisionFilterMask: GROUP_CREATURE,
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Contact material
const creatureMat = new CANNON.Material('creature');
world.addContactMaterial(new CANNON.ContactMaterial(groundMat, creatureMat, {
  friction: 0.7,
  restitution: 0.05,
}));

// ── Locomotion Presets ────────────────────────────────────────
// Hand-designed genotypes optimized for different movement styles.
// Each preset specifies genes, mode, recommended gait, and tuning.

const LOCOMOTION_PRESETS = {
  table: {
    name: 'Table (Quadruped)',
    // Wide outward spread (g1-g3 positive), downward legs (g5-g7 negative),
    // short trunk (g4=2), no tail (g8=0), depth 4 for branching legs
    genes: [4, 6, 4, 2, -5, -7, -5, 0, 4],
    mode: 1,
    gait: 'crawl',
    physDepth: 3,
    description: 'Four wide legs pointing down. The simplest walker.',
  },
  spider: {
    name: 'Spider',
    // Wide sprawl, tiny trunk (g4=1), downward legs, depth 5
    // More depth = more branching = more leg segments
    genes: [6, 4, 6, 1, -3, -5, -3, 0, 5],
    mode: 1,
    gait: 'crawl',
    physDepth: 3,
    description: 'Eight sprawling legs with low body. Scuttles.',
  },
  snake: {
    name: 'Snake',
    // Mode 3 with many segments, small lateral + downward spread
    // g4=1 gives minimal trunk so recursion doesn't die at root
    genes: [2, 1, 0, 1, -1, -1, 0, 0, 2, 6, 3],
    mode: 3,
    gait: 'wiggle',
    physDepth: 2,
    description: 'Long segmented body, lateral undulation.',
  },
  caterpillar: {
    name: 'Caterpillar',
    // Mode 3, 4 segments with downward legs on each, short spacing
    genes: [3, 4, 2, 1, -4, -5, -3, 0, 3, 4, 3],
    mode: 3,
    gait: 'crawl',
    physDepth: 2,
    description: 'Segmented body with stubby legs. Crawls in waves.',
  },
  jellyfish: {
    name: 'Jellyfish',
    // Branches spread outward and slightly down — like an umbrella
    // Pulse pushes against ground to hop/bounce
    genes: [5, 7, 5, 3, -2, -3, -2, -3, 4],
    mode: 1,
    gait: 'pulse',
    physDepth: 3,
    description: 'Umbrella shape. Pulses to push off ground.',
  },
  crab: {
    name: 'Crab',
    // Very wide lateral spread (g2/g6 dominant), downward legs,
    // g4=1 so trunk exists (g4=0 kills recursion!), depth 4
    genes: [3, 9, 4, 1, -2, -6, -3, 0, 4],
    mode: 1,
    gait: 'wiggle',
    physDepth: 3,
    description: 'Wide flat body with lateral legs. Scuttles sideways.',
  },
};

// ── State ─────────────────────────────────────────────────────

let currentMode = 3;
let currentGenes = null;
let activeBodies = [];
let activeConstraints = [];
let activeJointMeta = [];
let activeGroups = new Map();  // bodyIndex → THREE.Group
let activeRootBody = null;
let muscleSystem = null;
let debugWireframes = [];
let showDebug = false;
let startPos = new CANNON.Vec3(0, 0, 0);
let elapsedTime = 0;
let cameraFollowTarget = new THREE.Vector3(0, 2, 0);
let useTestCreature = false; // Toggle for test mode

// ── Clear / spawn ─────────────────────────────────────────────

function clearCreature() {
  for (const c of activeConstraints) world.removeConstraint(c);
  for (const b of activeBodies) world.removeBody(b);
  for (const [, group] of activeGroups) {
    group.traverse(child => { if (child.isMesh) child.geometry.dispose(); });
    scene.remove(group);
  }
  clearDebugWireframes();
  if (muscleSystem) muscleSystem.dispose();

  activeBodies = [];
  activeConstraints = [];
  activeJointMeta = [];
  activeGroups = new Map();
  activeRootBody = null;
  muscleSystem = null;
  elapsedTime = 0;
}

// ── Test creature (hardcoded torso + 4 legs) ──────────────────

function spawnTestCreature() {
  clearCreature();
  useTestCreature = true;

  function makeBox(pos, half, mass, color) {
    const shape = new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z));
    const body = new CANNON.Body({
      mass,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.4,
      angularDamping: 0.5,
      material: creatureMat,
      collisionFilterGroup: GROUP_CREATURE,
      collisionFilterMask: GROUP_GROUND,
    });
    body.addShape(shape);
    body.bodyIndex = activeBodies.length;
    activeBodies.push(body);
    world.addBody(body);

    const geo = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    const group = new THREE.Group();
    group.add(mesh);
    scene.add(group);
    activeGroups.set(body.bodyIndex, group);

    return body;
  }

  // Torso: heavy, flat box — raised so legs have room to hang
  const torsoY = 2.0;
  const torsoHalfY = 0.12;
  const torso = makeBox({ x: 0, y: torsoY, z: 0 }, { x: 0.6, y: torsoHalfY, z: 0.25 }, 5, 0x8b6914);
  activeRootBody = torso;

  // 4 legs — positions calculated so pivots align exactly
  const upperHalfY = 0.3;
  const lowerHalfY = 0.3;
  const upperY = torsoY - torsoHalfY - upperHalfY; // top of upper meets bottom of torso
  const lowerY = upperY - upperHalfY - lowerHalfY; // top of lower meets bottom of upper

  const legs = [
    { ax:  0.5, az:  0.2, phase: 0 },             // front-left
    { ax:  0.5, az: -0.2, phase: Math.PI },        // front-right
    { ax: -0.5, az:  0.2, phase: Math.PI / 2 },    // back-left
    { ax: -0.5, az: -0.2, phase: 3 * Math.PI / 2 },// back-right
  ];

  for (const leg of legs) {
    const upper = makeBox(
      { x: leg.ax, y: upperY, z: leg.az },
      { x: 0.06, y: upperHalfY, z: 0.06 },
      1, 0x3cb371
    );
    const lower = makeBox(
      { x: leg.ax, y: lowerY, z: leg.az },
      { x: 0.05, y: lowerHalfY, z: 0.05 },
      0.5, 0x2d8b57
    );

    // Hip: pivot at bottom of torso / top of upper leg
    const hipWorldY = torsoY - torsoHalfY;
    const hip = new CANNON.HingeConstraint(torso, upper, {
      pivotA: new CANNON.Vec3(leg.ax, -torsoHalfY, leg.az),
      pivotB: new CANNON.Vec3(0, upperHalfY, 0),
      axisA: new CANNON.Vec3(0, 0, 1), // Swing forward/back (around Z)
      axisB: new CANNON.Vec3(0, 0, 1),
      collideConnected: false,
    });
    world.addConstraint(hip);
    activeConstraints.push(hip);
    hip.enableMotor();
    hip.setMotorMaxForce(15);

    // Knee: pivot at bottom of upper / top of lower
    const knee = new CANNON.HingeConstraint(upper, lower, {
      pivotA: new CANNON.Vec3(0, -upperHalfY, 0),
      pivotB: new CANNON.Vec3(0, lowerHalfY, 0),
      axisA: new CANNON.Vec3(0, 0, 1),
      axisB: new CANNON.Vec3(0, 0, 1),
      collideConnected: false,
    });
    world.addConstraint(knee);
    activeConstraints.push(knee);
    knee.enableMotor();
    knee.setMotorMaxForce(10);

    activeJointMeta.push(
      { constraint: hip, phase: leg.phase, isHip: true },
      { constraint: knee, phase: leg.phase, isHip: false }
    );
  }

  startPos.copy(torso.position);
  document.getElementById('gait-label').textContent = 'test-walk';
  document.getElementById('body-count').textContent = activeBodies.length;
  cameraFollowTarget.set(0, 1.5, 0);

  if (showDebug) createDebugWireframes();
}

function updateTestGait(elapsed) {
  if (elapsed < 0.8) return; // settle time
  const t = elapsed - 0.8;
  const amp = parseFloat(document.getElementById('amp-slider').value) / 10; // 3-8 rad/s
  const freq = parseFloat(document.getElementById('freq-slider').value) / 10; // 0.5-5 Hz

  for (const jm of activeJointMeta) {
    const phase = freq * Math.PI * 2 * t + jm.phase;
    if (jm.isHip) {
      // Hip swings forward/back
      jm.constraint.setMotorSpeed(Math.sin(phase) * amp);
    } else {
      // Knee lifts during forward swing (phase-shifted)
      jm.constraint.setMotorSpeed(Math.sin(phase + Math.PI / 3) * amp * 0.8);
    }
  }
}

// ── Genotype creature ─────────────────────────────────────────

function spawnCreature(genes, gaitOverride, physDepth = 2) {
  clearCreature();
  useTestCreature = false;
  currentGenes = genes;

  const skeleton = extractSkeleton(genes, physDepth);

  // Create visual meshes per body
  const bodyGroups = createTreeBodies(genes, skeleton);

  for (const [bodyIdx, group] of bodyGroups) {
    scene.add(group);
    activeGroups.set(bodyIdx, group);
  }

  for (const body of skeleton.bodies) {
    body.material = creatureMat;
    world.addBody(body);
  }
  activeBodies = skeleton.bodies;

  for (const c of skeleton.constraints) {
    world.addConstraint(c);
  }
  activeConstraints = skeleton.constraints;
  activeJointMeta = skeleton.jointMeta;
  activeRootBody = skeleton.rootBody;

  const autoGait = analyzeGait(genes, skeleton);
  const gait = gaitOverride === 'auto' ? autoGait : (gaitOverride || autoGait);

  muscleSystem = new MuscleSystem(skeleton, gait, {
    amplitude: parseFloat(document.getElementById('amp-slider').value) / 10,
    frequency: parseFloat(document.getElementById('freq-slider').value) / 10,
    phaseSpread: parseFloat(document.getElementById('phase-slider').value) / 10,
    asymmetry: parseFloat(document.getElementById('asym-slider').value) / 10,
    spineGain: parseFloat(document.getElementById('spine-slider').value) / 10,
    legGain: parseFloat(document.getElementById('leg-slider').value) / 10,
    depthFalloff: parseFloat(document.getElementById('falloff-slider').value) / 10,
  });

  startPos.copy(skeleton.rootBody.position);
  document.getElementById('gait-label').textContent = gait;
  document.getElementById('body-count').textContent = skeleton.bodies.length;
  document.getElementById('genes-display').textContent = genes.join(', ');
  cameraFollowTarget.set(
    skeleton.rootBody.position.x,
    skeleton.rootBody.position.y,
    skeleton.rootBody.position.z
  );

  if (showDebug) createDebugWireframes();
}

// ── Debug wireframes ──────────────────────────────────────────

function createDebugWireframes() {
  clearDebugWireframes();
  for (const body of activeBodies) {
    for (let si = 0; si < body.shapes.length; si++) {
      const shape = body.shapes[si];
      const offset = body.shapeOffsets[si];
      let geo;
      if (shape instanceof CANNON.Box) {
        const he = shape.halfExtents;
        geo = new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2);
      } else if (shape instanceof CANNON.Sphere) {
        geo = new THREE.SphereGeometry(shape.radius, 6, 4);
      } else {
        geo = new THREE.SphereGeometry(0.1, 6, 4);
      }
      const color = shape instanceof CANNON.Sphere ? 0x00ffff : 0xff00ff;
      const wf = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.6 })
      );
      wf.userData.cannonBody = body;
      wf.userData.shapeOffset = offset ? new THREE.Vector3(offset.x, offset.y, offset.z) : null;
      scene.add(wf);
      debugWireframes.push(wf);
    }
  }
}

function clearDebugWireframes() {
  for (const wf of debugWireframes) {
    wf.geometry.dispose();
    scene.remove(wf);
  }
  debugWireframes = [];
}

// ── Sync physics → visuals ────────────────────────────────────

function syncAll() {
  for (const body of activeBodies) {
    const group = activeGroups.get(body.bodyIndex);
    if (group) {
      group.position.copy(body.position);
      group.quaternion.copy(body.quaternion);
    }
  }
  for (const wf of debugWireframes) {
    const body = wf.userData.cannonBody;
    const offset = wf.userData.shapeOffset;
    if (offset) {
      // Rotate offset by body quaternion to get world-space position
      const worldOffset = offset.clone().applyQuaternion(
        new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
      );
      wf.position.set(
        body.position.x + worldOffset.x,
        body.position.y + worldOffset.y,
        body.position.z + worldOffset.z
      );
    } else {
      wf.position.copy(body.position);
    }
    wf.quaternion.copy(body.quaternion);
  }
}

// ── Center of mass ────────────────────────────────────────────

function getCenterOfMass() {
  if (activeBodies.length === 0) return new THREE.Vector3(0, 2, 0);
  let totalMass = 0, cx = 0, cy = 0, cz = 0;
  for (const body of activeBodies) {
    const m = body.mass;
    cx += body.position.x * m;
    cy += body.position.y * m;
    cz += body.position.z * m;
    totalMass += m;
  }
  if (totalMass > 0) { cx /= totalMass; cy /= totalMass; cz /= totalMass; }
  return new THREE.Vector3(cx, cy, cz);
}

// ── Fitness ───────────────────────────────────────────────────

function updateFitness(dt) {
  if (!activeRootBody) return;
  elapsedTime += dt;
  const pos = activeRootBody.position;
  const dx = pos.x - startPos.x;
  const dz = pos.z - startPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const speed = elapsedTime > 0 ? dist / elapsedTime : 0;
  document.getElementById('speed-value').textContent = speed.toFixed(2);
  document.getElementById('dist-value').textContent = dist.toFixed(2);
  document.getElementById('time-value').textContent = elapsedTime.toFixed(1);
}

// ── Render loop ───────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  world.step(1 / 60, dt, 3);

  if (useTestCreature) {
    updateTestGait(clock.elapsedTime);
  } else if (muscleSystem) {
    muscleSystem.update(clock.elapsedTime);
  }

  syncAll();

  // Camera follow
  const com = getCenterOfMass();
  cameraFollowTarget.lerp(com, 0.05);
  controls.target.lerp(cameraFollowTarget, 0.08);
  controls.update();

  updateFitness(dt);
  renderer.render(scene, camera);
}

// ── Window resize ─────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── UI Controls ───────────────────────────────────────────────

function getSelectedGait() {
  return document.getElementById('gait-select').value;
}

document.getElementById('preset-select').addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === 'random') {
    const genes = randomInteresting(currentMode);
    spawnCreature(genes, getSelectedGait());
    document.getElementById('preset-label').textContent = 'Random';
  } else {
    const preset = LOCOMOTION_PRESETS[val];
    if (preset) {
      currentMode = preset.mode;
      document.getElementById('mode-select').value = preset.mode;
      document.getElementById('gait-select').value = preset.gait;
      spawnCreature([...preset.genes], preset.gait, preset.physDepth || 2);
      document.getElementById('preset-label').textContent = preset.name;
    }
  }
});

document.getElementById('btn-regenerate').addEventListener('click', () => {
  document.getElementById('preset-select').value = 'random';
  const genes = randomInteresting(currentMode);
  spawnCreature(genes, getSelectedGait());
  document.getElementById('preset-label').textContent = 'Random';
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (useTestCreature) spawnTestCreature();
  else if (currentGenes) spawnCreature(currentGenes, getSelectedGait());
});

document.getElementById('btn-debug').addEventListener('click', () => {
  showDebug = !showDebug;
  if (showDebug) createDebugWireframes();
  else clearDebugWireframes();
  document.getElementById('btn-debug').style.borderColor = showDebug ? '#58a6ff' : '#30363d';
});

document.getElementById('mode-select').addEventListener('change', (e) => {
  currentMode = parseInt(e.target.value);
  const genes = randomInteresting(currentMode);
  spawnCreature(genes, getSelectedGait());
});

document.getElementById('gait-select').addEventListener('change', () => {
  if (currentGenes) spawnCreature(currentGenes, getSelectedGait());
});

document.getElementById('env-select').addEventListener('change', (e) => {
  switchEnvironment(scene, e.target.value, lights, null);
});

document.getElementById('amp-slider').addEventListener('input', (e) => {
  if (muscleSystem) muscleSystem.amplitude = parseFloat(e.target.value) / 10;
});

document.getElementById('freq-slider').addEventListener('input', (e) => {
  if (muscleSystem) muscleSystem.frequency = parseFloat(e.target.value) / 10;
});

document.getElementById('phase-slider').addEventListener('input', (e) => {
  if (muscleSystem) muscleSystem.phaseSpread = parseFloat(e.target.value) / 10;
});

document.getElementById('asym-slider').addEventListener('input', (e) => {
  if (muscleSystem) muscleSystem.asymmetry = parseFloat(e.target.value) / 10;
});

document.getElementById('spine-slider').addEventListener('input', (e) => {
  if (muscleSystem) muscleSystem.spineGain = parseFloat(e.target.value) / 10;
});

document.getElementById('leg-slider').addEventListener('input', (e) => {
  if (muscleSystem) muscleSystem.legGain = parseFloat(e.target.value) / 10;
});

document.getElementById('falloff-slider').addEventListener('input', (e) => {
  if (muscleSystem) muscleSystem.depthFalloff = parseFloat(e.target.value) / 10;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'r': case 'R': {
      const genes = randomInteresting(currentMode);
      spawnCreature(genes, getSelectedGait());
      break;
    }
    case 't': case 'T':
      spawnTestCreature();
      break;
    case 'd': case 'D':
      document.getElementById('btn-debug').click();
      break;
    case ' ':
      if (useTestCreature) spawnTestCreature();
      else if (currentGenes) spawnCreature(currentGenes, getSelectedGait());
      e.preventDefault();
      break;
  }
});

// ── Initial spawn ─────────────────────────────────────────────

// Check URL for genes
const params = new URLSearchParams(window.location.search);
const genesParam = params.get('genes');
const modeParam = params.get('mode');
if (modeParam) currentMode = parseInt(modeParam);
document.getElementById('mode-select').value = currentMode;

if (genesParam) {
  spawnCreature(genesParam.split(',').map(Number), getSelectedGait());
} else {
  // Start with genotype creature. Press T for test creature.
  spawnCreature(randomInteresting(currentMode), getSelectedGait());
}
animate();
