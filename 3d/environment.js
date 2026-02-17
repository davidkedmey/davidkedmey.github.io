/**
 * 3D scene environment — switchable presets with lighting, backgrounds, and fog.
 */

import * as THREE from 'three';

// ── Preset definitions ──────────────────────────────────────

const PRESETS = {
  museum: {
    label: 'Museum',
    bg: '#0a0e14',
    skyLight: '#6688aa', groundLight: '#334422', hemiIntensity: 1.0,
    ambientColor: '#606080', ambientIntensity: 0.6,
    sunColor: '#ffeedd', sunIntensity: 2.5, sunPos: [10, 20, 8],
    fog: null,
    pedestalColor: '#2a2a30',
  },
  garden: {
    label: 'Garden',
    bg: 'gradient', gradTop: '#87ceeb', gradBottom: '#d4eac8',
    skyLight: '#87ceeb', groundLight: '#4a7c3f', hemiIntensity: 1.2,
    ambientColor: '#8faf6f', ambientIntensity: 0.5,
    sunColor: '#fff5e0', sunIntensity: 3.0, sunPos: [8, 18, 6],
    fog: { color: '#c8deb8', near: 30, far: 80 },
    pedestalColor: '#7a6b55',
  },
  ocean: {
    label: 'Ocean',
    bg: 'gradient', gradTop: '#0a2848', gradBottom: '#020810',
    skyLight: '#1a3a5c', groundLight: '#0a1628', hemiIntensity: 0.8,
    ambientColor: '#1a3050', ambientIntensity: 0.7,
    sunColor: '#88bbdd', sunIntensity: 1.8, sunPos: [5, 15, 10],
    fog: { color: '#0a2040', near: 15, far: 50 },
    pedestalColor: '#1a2a3a',
  },
  sunset: {
    label: 'Sunset',
    bg: 'gradient', gradTop: '#ff6633', gradBottom: '#2a1040',
    skyLight: '#ff8844', groundLight: '#442244', hemiIntensity: 1.0,
    ambientColor: '#884444', ambientIntensity: 0.5,
    sunColor: '#ffaa55', sunIntensity: 3.0, sunPos: [15, 6, 10],
    fog: { color: '#553322', near: 25, far: 70 },
    pedestalColor: '#3a2a20',
  },
  void: {
    label: 'Void',
    bg: '#f0f0f0',
    skyLight: '#ffffff', groundLight: '#cccccc', hemiIntensity: 1.0,
    ambientColor: '#e0e0e0', ambientIntensity: 0.8,
    sunColor: '#ffffff', sunIntensity: 2.0, sunPos: [10, 20, 8],
    fog: null,
    pedestalColor: '#c0c0c8',
  },
  starfield: {
    label: 'Starfield',
    bg: '#020208',
    skyLight: '#111133', groundLight: '#000000', hemiIntensity: 0.4,
    ambientColor: '#222244', ambientIntensity: 0.3,
    sunColor: '#aabbff', sunIntensity: 1.5, sunPos: [5, 25, 5],
    fog: null,
    pedestalColor: '#1a1a2a',
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
export const PRESET_LABELS = Object.fromEntries(
  Object.entries(PRESETS).map(([k, v]) => [k, v.label])
);

// ── Gradient background helper ──────────────────────────────

function createGradientTexture(topHex, bottomHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, topHex);
  grad.addColorStop(1, bottomHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Starfield helper ────────────────────────────────────────

let _stars = null;

function getStars() {
  if (_stars) return _stars;
  const count = 600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Distribute on a large sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 60 + Math.random() * 30;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, sizeAttenuation: true });
  _stars = new THREE.Points(geo, mat);
  _stars.name = '_stars';
  return _stars;
}

// ── Create environment (called once at startup) ─────────────

export function createEnvironment(scene) {
  scene.background = new THREE.Color(0x0a0e14);

  const hemi = new THREE.HemisphereLight(0x6688aa, 0x334422, 1.0);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0x606080, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffeedd, 2.5);
  sun.position.set(10, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  return { sun, ambient, hemi };
}

// ── Switch environment preset ───────────────────────────────

let _gradientTexture = null;

export function switchEnvironment(scene, name, lights, pedestalMat) {
  const p = PRESETS[name];
  if (!p) return;

  // Background
  if (p.bg === 'gradient') {
    if (_gradientTexture) _gradientTexture.dispose();
    _gradientTexture = createGradientTexture(p.gradTop, p.gradBottom);
    scene.background = _gradientTexture;
  } else {
    if (_gradientTexture) { _gradientTexture.dispose(); _gradientTexture = null; }
    scene.background = new THREE.Color(p.bg);
  }

  // Lights
  lights.hemi.color.set(p.skyLight);
  lights.hemi.groundColor.set(p.groundLight);
  lights.hemi.intensity = p.hemiIntensity;

  lights.ambient.color.set(p.ambientColor);
  lights.ambient.intensity = p.ambientIntensity;

  lights.sun.color.set(p.sunColor);
  lights.sun.intensity = p.sunIntensity;
  lights.sun.position.set(...p.sunPos);

  // Fog
  if (p.fog) {
    scene.fog = new THREE.Fog(p.fog.color, p.fog.near, p.fog.far);
  } else {
    scene.fog = null;
  }

  // Starfield
  const existingStars = scene.getObjectByName('_stars');
  if (name === 'starfield') {
    if (!existingStars) scene.add(getStars());
  } else if (existingStars) {
    scene.remove(existingStars);
  }

  // Pedestal
  if (pedestalMat) {
    pedestalMat.color.set(p.pedestalColor);
  }
}
