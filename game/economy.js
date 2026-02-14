// Pricing formula, shop seed generation, buy/sell

import { randomInteresting } from '../shared/genotype.js';
import { createOrganism, randomColorGenes, randomFarmGenes } from './organisms.js';
import { materialSellPrice } from './materials.js';
import { toolSellPrice, productSellPrice } from './crafting.js';

const MODE_FACTOR = { 1: 1, 2: 1.2, 3: 1.5, 4: 2, 5: 2.5 };

// Fertility affects rarity: low fertility = rarer = more valuable
const FERTILITY_FACTOR = { 1: 1.5, 2: 1.0, 3: 0.8, 4: 0.6 };

// Longevity adds value: perennials are worth more
const LONGEVITY_FACTOR = { 1: 1.0, 2: 1.3, 3: 1.6 };

// Vigor adds a small premium for fast growers
const VIGOR_FACTOR = { 1: 0.9, 2: 1.0, 3: 1.15 };

// Unified sell price — dispatches on item.kind
export function sellPrice(item) {
  if (item.kind === 'material') return materialSellPrice(item);
  if (item.kind === 'tool') return toolSellPrice(item);
  if (item.kind === 'product') return productSellPrice(item);
  // Default: organism
  const depth = item.genes[8];
  const base = Math.pow(2, depth) * 5;
  const mode = MODE_FACTOR[item.mode] || 1;
  const fg = item.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
  const fert = FERTILITY_FACTOR[fg.fertility] || 1;
  const lon = LONGEVITY_FACTOR[fg.longevity] || 1;
  const vig = VIGOR_FACTOR[fg.vigor] || 1;
  return Math.floor(base * mode * fert * lon * vig);
}

export function buyPrice(org) {
  return sellPrice(org) * 2;
}

export function generateShopStock(unlockedModes) {
  const count = 3 + Math.floor(Math.random() * 3);
  const stock = [];
  for (let i = 0; i < count; i++) {
    const mode = unlockedModes[Math.floor(Math.random() * unlockedModes.length)];
    const genes = randomInteresting(mode);
    const org = createOrganism(genes, mode, randomColorGenes(), randomFarmGenes());
    stock.push(org);
  }
  return stock;
}
