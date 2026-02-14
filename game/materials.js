// Materials system — derives wood, fiber, fruit, resin from biomorph genetics
// Every material property comes from drawTree() line segments, not arbitrary numbers.

import { drawTree } from '../shared/genotype.js';

export const MATERIAL_TYPES = {
  wood:  { name: 'Wood',  icon: '=', color: '#8B6914' },
  fiber: { name: 'Fiber', icon: '~', color: '#7BA05B' },
  fruit: { name: 'Fruit', icon: 'o', color: '#E84040' },
  resin: { name: 'Resin', icon: '*', color: '#D4A040' },
};

// Analyze a biomorph's genetics to determine what materials it produces.
// Returns { wood, fiber, fruit, resin, hardness, flexibility }
export function analyzeBiomorph(genes) {
  const lines = drawTree(genes);
  const depth = genes[8];

  let wood = 0;
  let fiber = 0;
  let fruit = 0;
  let trunkDepthLength = 0;
  let trunkCount = 0;
  let thinCount = 0;

  for (const seg of lines) {
    const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);

    // Wood: sum of length * depth for deep segments (depth >= 3)
    if (seg.depth >= 3) {
      wood += len * seg.depth;
      trunkDepthLength += seg.depth * len;
      trunkCount++;
    }

    // Fiber: count of shallow segments (depth <= 2)
    if (seg.depth <= 2) {
      fiber++;
      thinCount++;
    }

    // Fruit: count of terminal segments (depth === 1)
    if (seg.depth === 1) {
      fruit++;
    }
  }

  // Resin: total complexity / 10
  const resin = lines.length / 10;

  // Normalize to reasonable harvest quantities
  const woodYield = Math.max(0, Math.floor(wood / 200));
  const fiberYield = Math.max(0, Math.floor(fiber / 4));
  const fruitYield = Math.max(0, Math.floor(fruit / 4));
  const resinYield = Math.max(0, Math.floor(resin));

  // Quality traits for Phase 2 crafting
  const hardness = trunkCount > 0
    ? Math.min(1, trunkDepthLength / (trunkCount * depth * 10))
    : 0;
  const flexibility = lines.length > 0
    ? Math.min(1, thinCount / lines.length)
    : 0;

  return {
    wood: woodYield,
    fiber: fiberYield,
    fruit: fruitYield,
    resin: resinYield,
    hardness: Math.round(hardness * 100) / 100,
    flexibility: Math.round(flexibility * 100) / 100,
  };
}

// Create a material inventory item
export function createMaterial(materialType, quantity, hardness, flexibility) {
  return {
    kind: 'material',
    materialType,
    quantity,
    sourceHardness: hardness || 0,
    sourceFlexibility: flexibility || 0,
  };
}

// Harvest materials from a mature organism.
// Returns array of material items (one per type that has yield > 0).
export function harvestMaterials(org) {
  const analysis = analyzeBiomorph(org.genes);
  const materials = [];

  if (analysis.wood > 0) {
    materials.push(createMaterial('wood', analysis.wood, analysis.hardness, analysis.flexibility));
  }
  if (analysis.fiber > 0) {
    materials.push(createMaterial('fiber', analysis.fiber, analysis.hardness, analysis.flexibility));
  }
  if (analysis.fruit > 0) {
    materials.push(createMaterial('fruit', analysis.fruit, analysis.hardness, analysis.flexibility));
  }
  if (analysis.resin > 0) {
    materials.push(createMaterial('resin', analysis.resin, analysis.hardness, analysis.flexibility));
  }

  return materials;
}

// Add materials to inventory with auto-stacking.
// Same material type combines into one slot.
export function addMaterialToInventory(inventory, material) {
  const existing = inventory.find(
    item => item.kind === 'material' && item.materialType === material.materialType
  );
  if (existing) {
    existing.quantity += material.quantity;
    // Average the quality traits when stacking
    const total = existing.quantity;
    const added = material.quantity;
    existing.sourceHardness = (existing.sourceHardness * (total - added) + material.sourceHardness * added) / total;
    existing.sourceFlexibility = (existing.sourceFlexibility * (total - added) + material.sourceFlexibility * added) / total;
    existing.sourceHardness = Math.round(existing.sourceHardness * 100) / 100;
    existing.sourceFlexibility = Math.round(existing.sourceFlexibility * 100) / 100;
  } else {
    inventory.push({ ...material });
  }
}

// Sell price for materials
export function materialSellPrice(item) {
  const BASE = { wood: 3, fiber: 2, fruit: 4, resin: 5 };
  const base = BASE[item.materialType] || 2;
  const qualityBonus = 1 + (item.sourceHardness + item.sourceFlexibility) * 0.25;
  return Math.floor(base * item.quantity * qualityBonus);
}
