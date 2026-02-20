// Planet biomes — definitions, adjacency, fitness functions

export const BIOMES = {
  shallows: {
    id: 'shallows',
    name: 'Shallows',
    description: 'Warm, shallow waters favor simple forms. Depth 1-3 thrive here.',
    color: '#0a1a2a',
    colorLight: '#153040',
    selectionLabel: 'Favors depth 1-3',
    adjacent: ['canopy', 'steppe', 'depths', 'fringe'],
  },
  canopy: {
    id: 'canopy',
    name: 'Canopy',
    description: 'Dense canopy overhead. Complex branching (depth 6-8) catches the light.',
    color: '#0d2a18',
    colorLight: '#1a4028',
    selectionLabel: 'Favors depth 6-8',
    adjacent: ['shallows', 'steppe', 'fringe'],
  },
  steppe: {
    id: 'steppe',
    name: 'Steppe',
    description: 'Open grasslands reward wide horizontal spread.',
    color: '#2a200a',
    colorLight: '#403018',
    selectionLabel: 'Favors wide spread (|g1|+|g3|)',
    adjacent: ['shallows', 'canopy', 'depths'],
  },
  depths: {
    id: 'depths',
    name: 'Depths',
    description: 'Deep ocean trenches. Tall vertical forms reach the nutrients above.',
    color: '#0a0a2a',
    colorLight: '#181840',
    selectionLabel: 'Favors tall reach (|g5|+|g7|)',
    adjacent: ['shallows', 'steppe', 'fringe'],
  },
  fringe: {
    id: 'fringe',
    name: 'Fringe',
    description: 'The borderlands — no selection pressure. A neutral mixing ground.',
    color: '#1a1a28',
    colorLight: '#282838',
    selectionLabel: 'No selection pressure',
    adjacent: ['shallows', 'canopy', 'depths'],
  },
};

// Biome layout on the planet disc:
// Center circle = Shallows (r < 0.42)
// Top arc (315°-45°) = Canopy
// Right arc (45°-135°) = Steppe
// Bottom arc (135°-225°) = Depths
// Left arc (225°-315°) = Fringe

export const BIOME_SECTORS = {
  shallows: { type: 'center', maxR: 0.42 },
  canopy:   { type: 'arc', startAngle: -Math.PI/4,   endAngle: Math.PI/4,   minR: 0.42, maxR: 1.0 },
  steppe:   { type: 'arc', startAngle: Math.PI/4,     endAngle: 3*Math.PI/4, minR: 0.42, maxR: 1.0 },
  depths:   { type: 'arc', startAngle: 3*Math.PI/4,   endAngle: 5*Math.PI/4, minR: 0.42, maxR: 1.0 },
  fringe:   { type: 'arc', startAngle: 5*Math.PI/4,   endAngle: 7*Math.PI/4, minR: 0.42, maxR: 1.0 },
};

// Fitness modifier: returns death probability multiplier
// < 1.0 = creature is well-adapted (less likely to die)
// > 1.0 = creature is poorly adapted (more likely to die)
export function fitnessModifier(biomeId, genes) {
  const depth = genes[8] || 1;

  switch (biomeId) {
    case 'shallows':
      // Favors depth 1-3
      return depth <= 3 ? 0.6 : 1 + (depth - 3) * 0.25;

    case 'canopy':
      // Favors depth 6-8
      return depth >= 6 ? 0.6 : 1 + (6 - depth) * 0.3;

    case 'steppe': {
      // Favors wide horizontal spread: |g1| + |g3| (genes[0] + genes[2])
      const spread = (Math.abs(genes[0]) + Math.abs(genes[2])) / 18; // 0-1
      return 1.5 - spread * 0.8; // range 0.7-1.5
    }

    case 'depths': {
      // Favors tall vertical reach: |g5| + |g7| (genes[4] + genes[6])
      const reach = (Math.abs(genes[4]) + Math.abs(genes[6])) / 18;
      return 1.5 - reach * 0.8;
    }

    case 'fringe':
      return 1.0;

    default:
      return 1.0;
  }
}
