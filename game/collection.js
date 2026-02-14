// Museum tracking, discovery hashing, progression unlocks

// Hash a genotype to a "species-level" identifier
// Groups similar organisms: round genes to nearest 2 and include mode
export function genotypeHash(genes, mode) {
  const rounded = genes.map(g => Math.round(g / 2) * 2);
  return `m${mode}:${rounded.join(',')}`;
}

export function createCollection() {
  return {
    // Museum: donated organisms stored for display
    donated: [],      // array of { genes, mode, colorGenes, hash, donatedDay }
    // Discovery set: unique hashes seen
    discovered: new Set(),
    // Stats for progression
    totalSold: 0,
    totalDonated: 0,
    totalBred: 0,
    maxDepthSold: 0,
    // Unlocked modes
    unlockedModes: [1],
    // Unlocked buildings
    labUnlocked: false,
    // Notifications queue
    notifications: [],
  };
}

export function donate(collection, org, day) {
  const hash = genotypeHash(org.genes, org.mode);
  const isNew = !collection.discovered.has(hash);

  collection.donated.push({
    genes: org.genes.slice(),
    mode: org.mode,
    colorGenes: { ...org.colorGenes },
    hash,
    donatedDay: day,
  });
  collection.discovered.add(hash);
  collection.totalDonated++;

  if (isNew) {
    collection.notifications.push(`New species discovered!`);
  }

  checkProgressionUnlocks(collection);
  return isNew;
}

export function recordSale(collection, org) {
  collection.totalSold++;
  collection.maxDepthSold = Math.max(collection.maxDepthSold, org.genes[8]);

  const hash = genotypeHash(org.genes, org.mode);
  const isNew = !collection.discovered.has(hash);
  collection.discovered.add(hash);

  checkProgressionUnlocks(collection);
  return isNew; // novelty bonus if new
}

export function recordBreed(collection) {
  collection.totalBred++;
  checkProgressionUnlocks(collection);
}

function checkProgressionUnlocks(col) {
  // Sell 10 → unlock mode 2
  if (col.totalSold >= 10 && !col.unlockedModes.includes(2)) {
    col.unlockedModes.push(2);
    col.notifications.push('Mode 2 unlocked! New biomorph species available.');
  }
  // Donate 5 → unlock breeding lab
  if (col.totalDonated >= 5 && !col.labUnlocked) {
    col.labUnlocked = true;
    col.notifications.push('Breeding Lab unlocked!');
  }
  // Breed 5 → unlock mode 3
  if (col.totalBred >= 5 && !col.unlockedModes.includes(3)) {
    col.unlockedModes.push(3);
    col.notifications.push('Mode 3 unlocked! Segmented biomorphs available.');
  }
  // Sell depth 8 → unlock modes 4-5
  if (col.maxDepthSold >= 8 && !col.unlockedModes.includes(4)) {
    col.unlockedModes.push(4, 5);
    col.notifications.push('Modes 4 & 5 unlocked! Advanced biomorphs available.');
  }
}

// Serialize for save/load
export function serializeCollection(col) {
  return {
    donated: col.donated,
    discovered: [...col.discovered],
    totalSold: col.totalSold,
    totalDonated: col.totalDonated,
    totalBred: col.totalBred,
    maxDepthSold: col.maxDepthSold,
    unlockedModes: col.unlockedModes,
    labUnlocked: col.labUnlocked,
  };
}

export function deserializeCollection(data) {
  const col = createCollection();
  if (!data) return col;
  col.donated = data.donated || [];
  col.discovered = new Set(data.discovered || []);
  col.totalSold = data.totalSold || 0;
  col.totalDonated = data.totalDonated || 0;
  col.totalBred = data.totalBred || 0;
  col.maxDepthSold = data.maxDepthSold || 0;
  col.unlockedModes = data.unlockedModes || [1];
  col.labUnlocked = data.labUnlocked || false;
  return col;
}
