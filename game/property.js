// Property ownership — defines regions each entity controls

import { COLS, ROWS } from './world.js';

export const PROPERTIES = [
  {
    id: 'player',
    name: "Your Farm",
    bounds: { minCol: 2, maxCol: 6, minRow: 2, maxRow: 5 },
    tint: 'rgba(255, 220, 100, 0.06)',
    borderColor: 'rgba(255, 220, 100, 0.25)',
  },
  {
    id: 'fern',
    name: "Fern's Farm",
    npcId: 'fern',
    bounds: { minCol: 6, maxCol: 10, minRow: 7, maxRow: 13 },
    tint: 'rgba(100, 200, 100, 0.06)',
    borderColor: 'rgba(100, 200, 100, 0.25)',
  },
  {
    id: 'moss',
    name: "Moss's Farm",
    npcId: 'moss',
    bounds: { minCol: 21, maxCol: 25, minRow: 7, maxRow: 13 },
    tint: 'rgba(100, 160, 220, 0.06)',
    borderColor: 'rgba(100, 160, 220, 0.25)',
  },
];

// O(1) lookup grid: ownerGrid[row][col] = property id or null
let ownerGrid = null;

export function buildOwnershipGrid() {
  ownerGrid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  for (const prop of PROPERTIES) {
    const b = prop.bounds;
    for (let row = b.minRow; row <= b.maxRow; row++) {
      for (let col = b.minCol; col <= b.maxCol; col++) {
        if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
          ownerGrid[row][col] = prop.id;
        }
      }
    }
  }
}

export function getOwner(col, row) {
  if (!ownerGrid || row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
  return ownerGrid[row][col];
}

export function getProperty(id) {
  return PROPERTIES.find(p => p.id === id) || null;
}

// Returns true if the tile is player-owned or communal (null) — i.e. the player can act here
export function isPlayerProperty(col, row) {
  const owner = getOwner(col, row);
  return owner === 'player' || owner === null;
}
