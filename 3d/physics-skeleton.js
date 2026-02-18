/**
 * Genotype → articulated rigid-body hierarchy for cannon-es physics.
 *
 * Based on the proven cannon-es ragdoll/hinge patterns:
 * - HingeConstraint for all driven joints (only type with motor support)
 * - collideConnected: false to prevent self-collision
 * - Low motor forces (5-10) relative to body mass (~1)
 * - All bodies uniform mass for stability
 */

import * as CANNON from 'cannon-es';
import { defineVectors } from '../shared/genotype.js';

const VECTOR_ANGLES = [
  null,
  -135 * Math.PI / 180,
  -90  * Math.PI / 180,
  -45  * Math.PI / 180,
  0,
  45   * Math.PI / 180,
  90   * Math.PI / 180,
  135  * Math.PI / 180,
  Math.PI,
];

const GROUP_GROUND = 1;
const GROUP_CREATURE = 2;

function vectorTo3D(index, dx, dy) {
  const angle = VECTOR_ANGLES[index];
  if (angle === undefined || angle === null) return { x: 0, y: 1, z: 0 };
  if (index === 4 || index === 8) return { x: 0, y: dy, z: 0 };
  const spread = Math.abs(dx);
  return {
    x: spread * Math.sin(angle),
    y: dy,
    z: spread * Math.cos(angle),
  };
}

/**
 * Configure the cannon-es world for stable articulated bodies.
 * Call this once after creating the world.
 */
export function configureWorld(world) {
  world.gravity.set(0, -7, 0);  // Slightly reduced gravity for stability
  world.solver.iterations = 30;
  world.solver.tolerance = 1e-7;
  world.quatNormalizeFast = false;
  world.quatNormalizeSkip = 0;
  world.defaultContactMaterial.contactEquationStiffness = 1e8;
  world.defaultContactMaterial.contactEquationRelaxation = 4;
}

/**
 * Extract an articulated skeleton from a genotype.
 */
/**
 * Pre-compute the bounding extent of a tree (no physics, just positions).
 * Used to derive a normalization scale so any genotype fits within a target size.
 */
function computeTreeExtent(genes) {
  const vectors = defineVectors(genes);
  const treeDepth = genes[8];
  const segs = Math.min(genes.length > 9 ? Math.max(1, genes[9]) : 1, 4);
  const segDist = genes.length > 10 ? genes[10] : 4;
  const effectiveDepth = segs > 1 ? Math.min(treeDepth, 6) : treeDepth;
  const grad1 = genes.length > 11 ? genes[11] : 0;
  const grad2 = genes.length > 12 ? genes[12] : 0;

  let maxExtent = 0;

  function recurse(i, c, ox, oy, oz, sf1, sf2) {
    if (i === 0) i = 8; else if (i === 9) i = 1;
    const v = vectors[i];
    let sf = 1;
    if (i === 3 || i === 5) sf = sf1;
    else if (i === 1 || i === 7) sf = sf2;
    const dir = vectorTo3D(i, v[0] * sf, v[1] * sf);
    const ex = ox + dir.x * c;
    const ey = oy + dir.y * c;
    const ez = oz + dir.z * c;
    maxExtent = Math.max(maxExtent, Math.abs(ex), Math.abs(ey), Math.abs(ez));
    if (c > 1) {
      recurse(i - 1, c - 1, ex, ey, ez, sf1, sf2);
      recurse(i + 1, c - 1, ex, ey, ez, sf1, sf2);
    }
  }

  for (let s = 0; s < segs; s++) {
    const oy = s * segDist;
    const f1 = 1 + (grad1 * s) / Math.max(segs, 1);
    const f2 = 1 + (grad2 * s) / Math.max(segs, 1);
    recurse(4, effectiveDepth, 0, oy, 0, f1, f2);
    maxExtent = Math.max(maxExtent, Math.abs(oy));
  }

  return maxExtent || 1;
}

export function extractSkeleton(genes, maxPhysicsDepth = 2) {
  const vectors = defineVectors(genes);
  const treeDepth = genes[8];
  const physDepth = Math.min(treeDepth, maxPhysicsDepth);
  const segs = Math.min(genes.length > 9 ? Math.max(1, genes[9]) : 1, 4);
  const segDist = genes.length > 10 ? genes[10] : 4;

  // Normalize scale so creature fits within ~3 units
  const extent = computeTreeExtent(genes);
  const targetSize = 3.0;
  const scale = targetSize / extent;

  const effectiveDepth = segs > 1 ? Math.min(treeDepth, 6) : treeDepth;

  const bodies = [];
  const constraints = [];
  const jointMeta = [];
  const bodyBranches = new Map();

  let bodyId = 0;

  // Grad factors for segments
  const grad1 = genes.length > 11 ? genes[11] : 0;
  const grad2 = genes.length > 12 ? genes[12] : 0;

  function makeBody(position, halfExtents) {
    const shape = new CANNON.Box(new CANNON.Vec3(
      Math.max(halfExtents.x, 0.05),
      Math.max(halfExtents.y, 0.05),
      Math.max(halfExtents.z, 0.05),
    ));
    const body = new CANNON.Body({
      mass: 1, // Uniform mass for all parts (proven stable)
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.4,
      angularDamping: 0.5,
      collisionFilterGroup: GROUP_CREATURE,
      collisionFilterMask: GROUP_GROUND,
    });
    body.addShape(shape);
    body.bodyIndex = bodyId++;
    bodyBranches.set(body.bodyIndex, []);
    bodies.push(body);
    return body;
  }

  function makeHinge(bodyA, bodyB, pivotA, pivotB, axisLocal) {
    const axis = new CANNON.Vec3(axisLocal.x, axisLocal.y, axisLocal.z);
    const c = new CANNON.HingeConstraint(bodyA, bodyB, {
      pivotA: new CANNON.Vec3(pivotA.x, pivotA.y, pivotA.z),
      pivotB: new CANNON.Vec3(pivotB.x, pivotB.y, pivotB.z),
      axisA: axis,
      axisB: axis,
      collideConnected: false,
      maxForce: 1e6,
    });
    // Tune constraint equation stiffness for rigidity
    for (const eq of c.equations) {
      eq.stiffness = 1e7;
      eq.relaxation = 10;
    }
    return c;
  }

  // Create spine bodies (one per segment)
  const spineBodies = [];
  let prevSpineBody = null;

  for (let s = 0; s < segs; s++) {
    const sy = s * segDist * scale;
    const spineBody = makeBody(
      { x: 0, y: sy + 3.0, z: 0 },
      { x: 0.2, y: 0.15, z: 0.2 }
    );
    spineBody.mass = 2; // Spine is heavier for stability
    spineBody.updateMassProperties();
    spineBodies.push(spineBody);

    if (prevSpineBody) {
      const dist = segDist * scale;
      const c = makeHinge(
        prevSpineBody, spineBody,
        { x: 0, y: dist / 2, z: 0 },
        { x: 0, y: -dist / 2, z: 0 },
        { x: 1, y: 0, z: 0 }
      );
      constraints.push(c);
      c.enableMotor();
      c.setMotorMaxForce(12);
      jointMeta.push({
        constraint: c,
        bodyA: prevSpineBody,
        bodyB: spineBody,
        normY: s / segs,
        side: 0,
        isSpine: true,
        segIndex: s,
        flexibility: 0.5,
      });
    }
    prevSpineBody = spineBody;
  }

  // Recurse branches for each segment
  for (let s = 0; s < segs; s++) {
    const segOrigin = { x: 0, y: s * segDist * scale + 3.0, z: 0 };
    const factor1 = 1 + (grad1 * s) / Math.max(segs, 1);
    const factor2 = 1 + (grad2 * s) / Math.max(segs, 1);
    const parentBody = spineBodies[s];

    recurseBranch(4, effectiveDepth, segOrigin, factor1, factor2, parentBody, s);
  }

  function recurseBranch(i, c, origin, sf1, sf2, parentBody, segIndex) {
    if (i === 0) i = 8;
    else if (i === 9) i = 1;

    const v = vectors[i];
    let sf = 1;
    if (i === 3 || i === 5) sf = sf1;
    else if (i === 1 || i === 7) sf = sf2;

    const dir = vectorTo3D(i, v[0] * sf, v[1] * sf);
    const end = {
      x: origin.x + dir.x * c * scale,
      y: origin.y + dir.y * c * scale,
      z: origin.z + dir.z * c * scale,
    };

    const dx = end.x - origin.x;
    const dy = end.y - origin.y;
    const dz = end.z - origin.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (length < 0.001) return;

    const baseRadius = 0.15;
    const depthRatio = c / effectiveDepth;
    const radius = Math.max(baseRadius * depthRatio, 0.03);

    // Physics body if within physics depth
    if (c > effectiveDepth - physDepth) {
      const mid = {
        x: (origin.x + end.x) / 2,
        y: (origin.y + end.y) / 2,
        z: (origin.z + end.z) / 2,
      };

      const halfLen = Math.max(length / 2, 0.1);
      const halfRad = Math.max(radius, 0.06);
      const branchBody = makeBody(mid, { x: halfRad, y: halfLen, z: halfRad });

      // Store visual branch
      bodyBranches.get(branchBody.bodyIndex).push({
        start: { ...origin },
        end: { ...end },
        depth: c,
        maxDepth: effectiveDepth,
        branchIndex: i,
      });

      // Hinge axis: perpendicular to branch in the horizontal plane
      let ax = -dz, az = dx;
      const axLen = Math.sqrt(ax * ax + az * az);
      if (axLen > 0.001) { ax /= axLen; az /= axLen; }
      else { ax = 1; az = 0; }

      const pivotA = {
        x: origin.x - parentBody.position.x,
        y: origin.y - parentBody.position.y,
        z: origin.z - parentBody.position.z,
      };
      const pivotB = {
        x: origin.x - mid.x,
        y: origin.y - mid.y,
        z: origin.z - mid.z,
      };

      const con = makeHinge(parentBody, branchBody, pivotA, pivotB, { x: ax, y: 0, z: az });
      constraints.push(con);
      con.enableMotor();
      con.setMotorMaxForce(10);

      const side = i < 4 ? -1 : i > 4 ? 1 : 0;
      const totalHeight = Math.max(segs * segDist * scale, 1);
      const normY = Math.max(0, Math.min(1, mid.y / totalHeight));

      jointMeta.push({
        constraint: con,
        bodyA: parentBody,
        bodyB: branchBody,
        normY,
        side,
        isSpine: false,
        segIndex,
        depth: c,
        flexibility: effectiveDepth > 1 ? (effectiveDepth - c) / (effectiveDepth - 1) : 0,
      });

      if (c > 1) {
        recurseBranch(i - 1, c - 1, end, sf1, sf2, branchBody, segIndex);
        recurseBranch(i + 1, c - 1, end, sf1, sf2, branchBody, segIndex);
      }
    } else {
      // Visual only
      bodyBranches.get(parentBody.bodyIndex).push({
        start: { ...origin },
        end: { ...end },
        depth: c,
        maxDepth: effectiveDepth,
        branchIndex: i,
      });

      if (c > 1) {
        recurseBranch(i - 1, c - 1, end, sf1, sf2, parentBody, segIndex);
        recurseBranch(i + 1, c - 1, end, sf1, sf2, parentBody, segIndex);
      }
    }
  }

  // Add collision spheres along every branch so the full visual geometry
  // collides with the ground. Without this, only the small central box
  // of each physics body touches the ground and branches phase through.
  const COLLIDER_SPACING = 0.3; // Place a sphere every ~0.3 units along each branch
  const COLLIDER_RADIUS = 0.1;

  for (const body of bodies) {
    const branches = bodyBranches.get(body.bodyIndex);
    if (!branches || branches.length === 0) continue;

    const added = new Set(); // Avoid duplicate colliders at same position

    for (const b of branches) {
      const dx = b.end.x - b.start.x;
      const dy = b.end.y - b.start.y;
      const dz = b.end.z - b.start.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.01) continue;

      // Place colliders at regular intervals along the branch, including the endpoint
      const steps = Math.max(1, Math.ceil(len / COLLIDER_SPACING));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const px = b.start.x + dx * t;
        const py = b.start.y + dy * t;
        const pz = b.start.z + dz * t;

        // Quantize position to avoid near-duplicates
        const key = `${(px * 10) | 0},${(py * 10) | 0},${(pz * 10) | 0}`;
        if (added.has(key)) continue;
        added.add(key);

        // Offset relative to body center (body-local space at spawn)
        const ox = px - body.position.x;
        const oy = py - body.position.y;
        const oz = pz - body.position.z;
        body.addShape(
          new CANNON.Sphere(COLLIDER_RADIUS),
          new CANNON.Vec3(ox, oy, oz)
        );
      }
    }
  }

  return {
    bodies,
    constraints,
    rootBody: spineBodies[0],
    bodyBranches,
    jointMeta,
    spineBodies,
    segCount: segs,
  };
}

export { GROUP_GROUND, GROUP_CREATURE };

/**
 * Analyze morphology to auto-select gait.
 */
export function analyzeGait(genes, skeleton) {
  const segs = skeleton.segCount;
  const { bodies } = skeleton;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const body of bodies) {
    const p = body.position;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const aspectRatio = height / width;

  if (segs > 2) return 'crawl';
  if (aspectRatio < 0.5 && segs <= 2) return 'wiggle';
  if (aspectRatio > 1.5) return 'crawl';
  return 'pulse';
}
