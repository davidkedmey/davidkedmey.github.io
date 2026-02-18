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

// ── Wind system (Crysis-style two-layer: main bending + detail flutter) ──
// ── Locomotion system (vertex shader wiggle/crawl/pulse) ──

const windUniforms = {
  uTime:         { value: 0 },
  uWindStrength: { value: 1.0 },
  uLocomotion:   { value: 0 },   // 0=none, 1=wiggle, 2=crawl, 3=pulse
};

treeMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = windUniforms.uTime;
  shader.uniforms.uWindStrength = windUniforms.uWindStrength;
  shader.uniforms.uLocomotion = windUniforms.uLocomotion;

  // Declare uniforms + attribute + helper functions
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
     uniform float uTime;
     uniform float uWindStrength;
     uniform int uLocomotion;  // 0=none, 1=wiggle, 2=crawl, 3=pulse
     attribute vec4 aWind; // x=flexibility, y=phase, z=normalizedY, w=branchSide

     // GPU Gems smoothed triangle wave — cheaper than sin, snappier feel
     float triWave(float x) {
       return abs(fract(x + 0.5) * 2.0 - 1.0);
     }
     float smoothTriWave(float x) {
       float t = triWave(x);
       return t * t * (3.0 - 2.0 * t);
     }`
  );

  // Vertex displacement after begin_vertex sets up 'transformed'
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>

     float flex = aWind.x;
     float phase = aWind.y;
     float normY = aWind.z;
     float side = aWind.w;
     float h = max(transformed.y, 0.0);

     // ── Wind ──
     // Layer 1: Main bending — slow whole-tree lean, height-scaled
     float mainBend = (smoothTriWave(uTime * 0.08) * 2.0 - 1.0) * h * 0.012 * uWindStrength;

     // Layer 2: Detail flutter — fast per-branch, flexibility-scaled
     float flutter1 = (smoothTriWave(uTime * 0.35 + phase) * 2.0 - 1.0);
     float flutter2 = (smoothTriWave(uTime * 0.47 + phase * 1.3 + 0.7) * 2.0 - 1.0);
     float flutter3 = (smoothTriWave(uTime * 0.62 + phase * 0.8 + 1.4) * 2.0 - 1.0);
     float detailScale = flex * flex * uWindStrength * 0.4;

     transformed.x += mainBend + flutter1 * detailScale;
     transformed.z += mainBend * 0.6 + flutter2 * detailScale * 0.7;
     transformed.y += flutter3 * detailScale * 0.2;

     // ── Locomotion ──
     if (uLocomotion == 1) {
       // Wiggle/Swim: lateral sine wave traveling down the body
       float wave = sin(normY * 8.0 - uTime * 3.0) * flex * 0.5;
       transformed.x += wave;
       transformed.z += wave * 0.3;
     } else if (uLocomotion == 2) {
       // Crawl: alternating compression wave + side-to-side legs
       float stride = sin(normY * 6.28 - uTime * 2.5);
       transformed.y += stride * flex * 0.3;
       transformed.x += side * stride * flex * 0.2;
     } else if (uLocomotion == 3) {
       // Pulse/Breathe: radial expansion/contraction
       float pulse = sin(uTime * 2.0) * flex * 0.3;
       transformed.x *= 1.0 + pulse;
       transformed.z *= 1.0 + pulse;
       transformed.y += sin(uTime * 2.0 + normY * 3.14) * flex * 0.1;
     }`
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
 * Bakes per-vertex wind data: aWind = vec4(flexibility, phase, normalizedY, branchSide).
 * normalizedY is initially set to midpoint Y (normalized in post-pass by createTree).
 * branchSide is set from the branch direction index.
 */
function createBranchGeo(start, end, depth, maxDepth, scale, branchIndex) {
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

  // Bake wind + locomotion data as vec4(flexibility, phase, midY, branchSide)
  // midY stored raw here — normalized to [0,1] in createTree post-pass
  const flexibility = maxDepth > 1 ? (maxDepth - depth) / (maxDepth - 1) : 0;
  const phase = (mid.x * 12.9898 + mid.y * 78.233 + mid.z * 45.164) % 6.2832;
  // branchSide: left branches (i<4) → -1, right (i>4) → +1, center (4) → 0
  const bSide = branchIndex < 4 ? -1.0 : branchIndex > 4 ? 1.0 : 0.0;
  const windArr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    windArr[i * 4]     = flexibility;
    windArr[i * 4 + 1] = phase;
    windArr[i * 4 + 2] = mid.y;   // raw Y, normalized later
    windArr[i * 4 + 3] = bSide;
  }
  geo.setAttribute('aWind', new THREE.BufferAttribute(windArr, 4));

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

    const branchGeo = createBranchGeo(origin, end, c, maxDepth, scale, i);
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
    // Post-pass: normalize midY stored in aWind.z to [0,1] range
    let yMin = Infinity, yMax = -Infinity;
    for (const g of geos) {
      const wind = g.attributes.aWind;
      for (let i = 0; i < wind.count; i++) {
        const rawY = wind.getZ(i);
        if (rawY < yMin) yMin = rawY;
        if (rawY > yMax) yMax = rawY;
      }
    }
    const yRange = yMax - yMin || 1;
    for (const g of geos) {
      const wind = g.attributes.aWind;
      for (let i = 0; i < wind.count; i++) {
        wind.setZ(i, (wind.getZ(i) - yMin) / yRange);
      }
    }

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
 * Create per-body THREE.Groups for locomotion physics.
 * Each body gets its own Group containing cylinder meshes for its branches.
 * Unlike createTree(), geometries are NOT merged (each body moves independently).
 * Branch positions are offset into body-local space so each Group can be positioned
 * at the CANNON.Body's world position/quaternion directly.
 *
 * @param {number[]} genes - Genotype array
 * @param {{ bodyBranches: Map, bodies: CANNON.Body[] }} skeleton - from extractSkeleton()
 * @returns {Map<number, THREE.Group>} bodyId → THREE.Group with branch meshes in body-local space
 */
export function createTreeBodies(genes, skeleton) {
  const bodyGroups = new Map();

  // Shared material for locomotion bodies (simpler, no wind shader needed)
  const locoMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.05,
  });

  // Build a lookup from bodyIndex → initial body position
  const bodyPositions = new Map();
  for (const body of skeleton.bodies) {
    bodyPositions.set(body.bodyIndex, {
      x: body.position.x,
      y: body.position.y,
      z: body.position.z,
    });
  }

  for (const [bodyIndex, branches] of skeleton.bodyBranches) {
    const group = new THREE.Group();
    group.userData.bodyIndex = bodyIndex;

    // Get this body's initial world position to offset branches into local space
    const bp = bodyPositions.get(bodyIndex) || { x: 0, y: 0, z: 0 };

    for (const branch of branches) {
      const { start, end, depth, maxDepth, branchIndex } = branch;
      // Offset into body-local coordinates
      const geo = createBranchGeo(
        new THREE.Vector3(start.x - bp.x, start.y - bp.y, start.z - bp.z),
        new THREE.Vector3(end.x - bp.x, end.y - bp.y, end.z - bp.z),
        depth, maxDepth, 1.0, branchIndex
      );
      if (geo) {
        const mesh = new THREE.Mesh(geo, locoMaterial);
        mesh.castShadow = true;
        group.add(mesh);
      }
    }

    bodyGroups.set(bodyIndex, group);
  }

  return bodyGroups;
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
