/**
 * Shared collection store — any experience can save/load specimens.
 * Used by the 3D gallery "collect" feature and readable by the game's gallery bridge.
 *
 * Specimens are stored in the same format as the breeder gallery so
 * gallery-bridge.js can import them without conversion.
 *
 * Format: { genes: number[], mode: number, name?: string, symmetry?: string,
 *           colorGenes?: { hue, spread }, source: string, id: number }
 */

const COLLECTION_KEY = 'biomorph-collected';

export function loadCollection() {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToCollection(specimen) {
  const collection = loadCollection();
  const entry = {
    id: Date.now(),
    genes: specimen.genes.slice(),
    mode: specimen.mode,
    name: specimen.name || null,
    symmetry: specimen.symmetry || null,
    colorGenes: specimen.colorGenes || null,
    source: specimen.source || 'unknown',
  };
  collection.push(entry);
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  return entry;
}

export function removeFromCollection(id) {
  const collection = loadCollection().filter(s => s.id !== id);
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
}

export function isInCollection(genes, mode) {
  const key = genes.join(',') + ':' + mode;
  return loadCollection().some(s => s.genes.join(',') + ':' + s.mode === key);
}
