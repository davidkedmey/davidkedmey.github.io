// Gallery bridge: reads breeder gallery + collected specimens from localStorage,
// converts to farm organisms

import { createOrganism, randomFarmGenes } from './organisms.js';
import { generateName } from './naming.js';
import { loadCollection } from '../shared/collection.js';

const GALLERY_KEY = 'biomorph-gallery';

export function loadBreederGallery() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (!raw) return [];
    const gallery = JSON.parse(raw);
    // Filter out mode 0 (peppering) specimens
    return gallery.filter(spec => spec.mode >= 1 && spec.mode <= 5);
  } catch {
    return [];
  }
}

// Load specimens collected from the 3D gallery (and any other source)
export function loadCollectedSpecimens() {
  return loadCollection().filter(spec => spec.mode >= 1 && spec.mode <= 5);
}

// Combined: all importable specimens from both breeder and collected
export function loadAllImportable() {
  const breeder = loadBreederGallery().map(s => ({ ...s, _source: 'breeder' }));
  const collected = loadCollectedSpecimens().map(s => ({ ...s, _source: s.source || '3d-gallery' }));
  return [...breeder, ...collected];
}

// Convert a breeder gallery specimen into a fresh farm organism
// Each call creates a new organism with a new id and random farm genes
export function breederToOrganism(specimen) {
  const genes = specimen.genes.slice();
  const mode = specimen.mode;
  const colorGenes = specimen.colorGenes
    ? { hue: specimen.colorGenes.hue, spread: specimen.colorGenes.spread }
    : undefined;
  const farmGenes = randomFarmGenes();
  const org = createOrganism(genes, mode, colorGenes, farmGenes);
  // Preserve symmetry from breeder
  if (specimen.symmetry) org.symmetry = specimen.symmetry;
  // Use breeder name if available, otherwise auto-generate
  org.nickname = specimen.name || generateName(genes, mode, colorGenes || org.colorGenes);
  return org;
}

// Get gallery import cost (half the buy price for equivalent depth/mode)
export function galleryImportCost(specimen) {
  const depth = specimen.genes[8];
  const modeFactor = { 1: 1, 2: 1.2, 3: 1.5, 4: 2, 5: 2.5 };
  const base = Math.pow(2, depth) * 5;
  const mf = modeFactor[specimen.mode] || 1;
  return Math.floor(base * mf); // half of buy price (buy = sell * 2, this = sell * 1)
}
