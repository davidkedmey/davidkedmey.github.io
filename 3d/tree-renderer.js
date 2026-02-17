/**
 * Genotype → 3D tree mesh (merged geometry for performance).
 *
 * All branches of a tree are merged into a single BufferGeometry with
 * vertex colors, yielding 1 draw call per tree instead of ~255.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { defineVectors } from '../shared/genotype.js';

const VECTOR_ANGLES = [
  null,
  -135 * Math.PI / 180, // v1
  -90  * Math.PI / 180, // v2
  -45  * Math.PI / 180, // v3
  0,                     // v4 (straight up)
  45   * Math.PI / 180,  // v5
  90   * Math.PI / 180,  // v6
  135  * Math.PI / 180,  // v7
  Math.PI,               // v8 (straight down)
];

// Shared material for all trees — vertex colors provide per-branch tinting
const treeMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.6,
  metalness: 0.05,
});

// Wind sway uniforms — updated each frame from main.js
const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.6 },
};

treeMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = windUniforms.uTime;
  shader.uniforms.uWindStrength = windUniforms.uWindStrength;

  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
     uniform float uTime;
     uniform float uWindStrength;`
  );

  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     float height = transformed.y;
     float swayAmount = height * uWindStrength * 0.1;
     float phase = transformed.x * 0.5 + transformed.z * 0.3;
     transformed.x += sin(uTime * 1.2 + phase) * swayAmount;
     transformed.z += sin(uTime * 0.9 + phase + 2.0) * swayAmount * 0.6;`
  );
};

// Reusable objects to avoid per-call allocation
const _up = new THREE.Vector3(0, 1, 0);
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _brown = new THREE.Color(0x8b6914);
const _green = new THREE.Color(0x3cb371);
const _color = new THREE.Color();

function vectorTo3D(index, dx, dy) {
  const angle = VECTOR_ANGLES[index];
  if (angle === undefined || angle === null) return new THREE.Vector3(0, 1, 0);
  if (index === 4 || index === 8) return new THREE.Vector3(0, dy, 0);
  const spread = Math.abs(dx);
  return new THREE.Vector3(
    spread * Math.sin(angle),
    dy,
    spread * Math.cos(angle)
  );
}

/**
 * Create a positioned + colored cylinder geometry for one branch.
 */
function createBranchGeo(start, end, depth, maxDepth, scale) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  if (length < 0.001) return null;

  const baseRadius = 0.18 * scale;
  const depthRatio = depth / maxDepth;
  const radiusBottom = Math.max(baseRadius * depthRatio, 0.02);
  const radiusTop = Math.max(radiusBottom * 0.6, 0.01);

  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 5, 1);

  // Transform geometry in-place to final position + orientation
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  _quat.setFromUnitVectors(_up, dir.clone().normalize());
  _matrix.compose(mid, _quat, _scale);
  geo.applyMatrix4(_matrix);

  // Bake vertex colors (brown trunk → green tips)
  const t = maxDepth > 1 ? (maxDepth - depth) / (maxDepth - 1) : 0;
  _color.copy(_brown).lerp(_green, t);

  const count = geo.attributes.position.count;
  const colorArr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colorArr[i * 3]     = _color.r;
    colorArr[i * 3 + 1] = _color.g;
    colorArr[i * 3 + 2] = _color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));

  return geo;
}

/**
 * Create a 3D tree Group from a genotype.
 * Returns a THREE.Group with a single merged mesh (1 draw call).
 */
export function createTree(genes) {
  const vectors = defineVectors(genes);
  const maxDepth = genes[8];
  const group = new THREE.Group();
  const scale = 1.0;

  // Segment + gradient support for modes 3-5
  const segs = genes.length > 9 ? Math.max(1, genes[9]) : 1;
  const segDist = genes.length > 10 ? genes[10] : 4;
  const grad1 = genes.length > 11 ? genes[11] : 0;
  const grad2 = genes.length > 12 ? genes[12] : 0;

  const geos = [];

  function recurse(i, c, origin, sf1, sf2) {
    if (i === 0) i = 8;
    else if (i === 9) i = 1;

    const v = vectors[i];
    let sf = 1;
    if (i === 3 || i === 5) sf = sf1;
    else if (i === 1 || i === 7) sf = sf2;

    const dir3d = vectorTo3D(i, v[0] * sf, v[1] * sf);
    const end = origin.clone().add(dir3d.multiplyScalar(c * scale));

    const branchGeo = createBranchGeo(origin, end, c, maxDepth, scale);
    if (branchGeo) geos.push(branchGeo);

    if (c > 1) {
      recurse(i - 1, c - 1, end, sf1, sf2);
      recurse(i + 1, c - 1, end, sf1, sf2);
    }
  }

  const effectiveDepth = segs > 1 ? Math.min(maxDepth, 6) : maxDepth;

  for (let s = 0; s < segs; s++) {
    const segOrigin = new THREE.Vector3(0, s * segDist * scale, 0);
    const factor1 = 1 + (grad1 * s) / Math.max(segs, 1);
    const factor2 = 1 + (grad2 * s) / Math.max(segs, 1);
    recurse(4, effectiveDepth, segOrigin, factor1, factor2);
  }

  if (geos.length > 0) {
    const merged = mergeGeometries(geos, false);
    const mesh = new THREE.Mesh(merged, treeMaterial);
    mesh.castShadow = true;
    group.add(mesh);
    // Dispose temp geometries (data is now in merged)
    for (const g of geos) g.dispose();
  } else {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3cb371 })
    );
    marker.castShadow = true;
    marker.position.set(0, 0.3, 0);
    group.add(marker);
  }

  // Shift children so the lowest point sits at y = 0
  const box = new THREE.Box3().setFromObject(group);
  if (box.min.y !== Infinity && box.min.y < 0) {
    const offset = -box.min.y;
    for (const child of group.children) {
      child.position.y += offset;
    }
  }

  return group;
}

/**
 * Dispose a tree's geometry (safe with shared material).
 */
export function disposeTree(treeGroup) {
  treeGroup.traverse(child => {
    if (child.isMesh) child.geometry.dispose();
  });
}

/**
 * No-op — kept for API compatibility. Material is shared, not cached.
 */
export function clearMaterialCache() {}

export { windUniforms };
