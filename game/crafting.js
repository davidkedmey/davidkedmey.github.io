// Crafting system — turn materials into tools and products

export const RECIPES = [
  {
    id: 'hoe',
    name: 'Hoe',
    desc: 'Plow 2 tiles at once',
    inputs: [{ type: 'wood', qty: 3 }, { type: 'fiber', qty: 2 }],
    qualityGate: null,
    outputKind: 'tool',
    toolType: 'hoe',
    productType: null,
    productQty: 0,
  },
  {
    id: 'spear',
    name: 'Spear',
    desc: 'Forage materials from wild trees',
    inputs: [{ type: 'wood', qty: 3 }, { type: 'fiber', qty: 1 }],
    qualityGate: { material: 'wood', trait: 'sourceHardness', min: 0.3 },
    outputKind: 'tool',
    toolType: 'spear',
    productType: null,
    productQty: 0,
  },
  {
    id: 'axe',
    name: 'Axe',
    desc: 'Chop wild trees for 2x materials',
    inputs: [{ type: 'wood', qty: 5 }, { type: 'resin', qty: 2 }],
    qualityGate: { material: 'wood', trait: 'sourceHardness', min: 0.5 },
    outputKind: 'tool',
    toolType: 'axe',
    productType: null,
    productQty: 0,
  },
  {
    id: 'fence',
    name: 'Fence',
    desc: 'Placeable barrier tile',
    inputs: [{ type: 'wood', qty: 2 }, { type: 'fiber', qty: 1 }],
    qualityGate: null,
    outputKind: 'product',
    toolType: null,
    productType: 'fence',
    productQty: 2,
  },
  {
    id: 'preserves',
    name: 'Preserves',
    desc: 'High sell value trade good (30g each)',
    inputs: [{ type: 'fruit', qty: 5 }, { type: 'resin', qty: 1 }],
    qualityGate: null,
    outputKind: 'product',
    toolType: null,
    productType: 'preserves',
    productQty: 1,
  },
];

// Check if a recipe can be crafted with the current inventory
export function canCraft(recipe, inventory) {
  for (const req of recipe.inputs) {
    const mat = inventory.find(i => i.kind === 'material' && i.materialType === req.type);
    if (!mat || mat.quantity < req.qty) return false;
  }
  if (recipe.qualityGate) {
    const gate = recipe.qualityGate;
    const mat = inventory.find(i => i.kind === 'material' && i.materialType === gate.material);
    if (!mat || mat[gate.trait] < gate.min) return false;
  }
  return true;
}

// Remove material from inventory, subtracting quantity and removing slot if empty
export function removeMaterialFromInventory(inventory, type, qty) {
  const idx = inventory.findIndex(i => i.kind === 'material' && i.materialType === type);
  if (idx === -1) return;
  const mat = inventory[idx];
  mat.quantity -= qty;
  if (mat.quantity <= 0) inventory.splice(idx, 1);
}

// Create a tool item
const BASE_DURABILITY = { hoe: 15, spear: 12, axe: 8 };

export function createTool(toolType, avgHardness) {
  const base = BASE_DURABILITY[toolType] || 10;
  const durability = base + Math.floor(avgHardness * 10);
  return {
    kind: 'tool',
    toolType,
    durability,
    maxDurability: durability,
  };
}

// Create a product item
export function createProduct(productType, quantity) {
  return {
    kind: 'product',
    productType,
    quantity,
  };
}

// Execute a craft: remove materials, return new tool/product
export function executeCraft(recipe, inventory) {
  // Collect average hardness from wood inputs (for tool durability)
  let avgHardness = 0;
  const woodMat = inventory.find(i => i.kind === 'material' && i.materialType === 'wood');
  if (woodMat) avgHardness = woodMat.sourceHardness || 0;

  // Remove materials
  for (const req of recipe.inputs) {
    removeMaterialFromInventory(inventory, req.type, req.qty);
  }

  // Create output
  if (recipe.outputKind === 'tool') {
    return createTool(recipe.toolType, avgHardness);
  } else {
    return createProduct(recipe.productType, recipe.productQty);
  }
}

// Use a tool — decrement durability, return false if broken
export function useTool(tool) {
  tool.durability--;
  return tool.durability > 0;
}

// Add product to inventory with auto-stacking
export function addProductToInventory(inventory, product) {
  const existing = inventory.find(
    i => i.kind === 'product' && i.productType === product.productType
  );
  if (existing) {
    existing.quantity += product.quantity;
  } else {
    inventory.push({ ...product });
  }
}

// Sell prices
export function toolSellPrice(tool) {
  const BASE = { hoe: 20, spear: 30, axe: 45 };
  const base = BASE[tool.toolType] || 15;
  const ratio = tool.durability / tool.maxDurability;
  return Math.max(1, Math.floor(base * ratio));
}

export function productSellPrice(product) {
  const BASE = { fence: 8, preserves: 30 };
  const rate = BASE[product.productType] || 10;
  return rate * product.quantity;
}
