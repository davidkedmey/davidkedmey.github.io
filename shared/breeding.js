// Breeding functions extracted from biomorph.js — pure functions

import { MODE_CONFIGS } from './genotype.js';

// Multi-parent crossover: for each gene, randomly pick from one parent
export function crossoverMulti(parentsList, mode) {
  const config = MODE_CONFIGS[mode] || MODE_CONFIGS[1];
  const child = new Array(config.geneCount);
  const sources = new Array(config.geneCount);
  for (let i = 0; i < config.geneCount; i++) {
    const srcIdx = Math.floor(Math.random() * parentsList.length);
    child[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], parentsList[srcIdx][i]));
    sources[i] = srcIdx + 1; // 1-indexed
  }
  return { genes: child, sources };
}

// Color gene crossover: each property independently random from parents
export function crossoverColorMulti(colorGenesList) {
  return {
    hue: colorGenesList[Math.floor(Math.random() * colorGenesList.length)].hue,
    spread: colorGenesList[Math.floor(Math.random() * colorGenesList.length)].spread,
  };
}

// Single-step color mutation
export function mutateColor(cGenes) {
  const child = { hue: cGenes.hue, spread: cGenes.spread };
  if (Math.random() < 0.5) {
    child.hue = ((child.hue + (Math.random() < 0.5 ? 1 : -1)) % 12 + 12) % 12;
  } else {
    child.spread = Math.max(-6, Math.min(6, child.spread + (Math.random() < 0.5 ? 1 : -1)));
  }
  return child;
}
