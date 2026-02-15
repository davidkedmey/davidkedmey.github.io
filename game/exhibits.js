// World exhibits: curated permanent specimens demonstrating morphospace properties
// These are separate from NPC gardens — they're the "museum" part of the world.

import { EXHIBITS } from './world.js';
import { createOrganism, randomColorGenes } from './organisms.js';

// Generate the exhibit state array from EXHIBITS specs.
// Each entry: { col, row, label, organism, spec }
export function initExhibits() {
  return EXHIBITS.map(ex => {
    const org = createOrganism(
      ex.spec.genes.slice(), // clone genes
      ex.spec.mode,
      randomColorGenes(),
    );
    org.stage = 'mature';
    org.growthProgress = org.matureDays;
    // Store symmetry type if specified (for rendering)
    if (ex.spec.symmetry) org.symmetry = ex.spec.symmetry;
    return {
      col: ex.col,
      row: ex.row,
      label: ex.label,
      organism: org,
    };
  });
}

// Serialize for save
export function serializeExhibits(exhibits) {
  return exhibits.map(ex => ({
    col: ex.col,
    row: ex.row,
    label: ex.label,
    organism: ex.organism ? {
      kind: ex.organism.kind || 'organism',
      id: ex.organism.id,
      genes: ex.organism.genes,
      mode: ex.organism.mode,
      colorGenes: ex.organism.colorGenes,
      farmGenes: ex.organism.farmGenes,
      stage: ex.organism.stage,
      growthProgress: ex.organism.growthProgress,
      matureDays: ex.organism.matureDays,
      symmetry: ex.organism.symmetry || null,
    } : null,
  }));
}

// Deserialize from save
export function deserializeExhibits(data) {
  if (!data || !Array.isArray(data)) return initExhibits();
  // If exhibit count changed (new version added exhibits), reinit
  if (data.length !== EXHIBITS.length) return initExhibits();
  return data.map((ex, i) => ({
    col: ex.col,
    row: ex.row,
    label: ex.label || EXHIBITS[i].label,
    organism: ex.organism ? { ...ex.organism, kind: ex.organism.kind || 'organism' } : null,
  }));
}

// Generate breeder URL for an exhibit organism
export function exhibitBreederURL(exhibit) {
  if (!exhibit || !exhibit.organism) return null;
  const org = exhibit.organism;
  const genes = org.genes.join(',');
  const sym = org.symmetry || 'left-right';
  const symCode = { 'left-right': 'lr', 'up-down': 'ud', 'four-way': 'fw', 'asymmetric': 'as' }[sym] || 'lr';
  return `https://biomorphbuilder.com/#m=${org.mode}&g=${genes}&s=${symCode}&cm=depth&cg=${org.colorGenes.hue},${org.colorGenes.spread}&gen=0`;
}
