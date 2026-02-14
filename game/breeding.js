// Breeding lab UI + wiring to shared/breeding.js

import { crossoverMulti, crossoverColorMulti, mutateColor } from '../shared/breeding.js';
import { mutate } from '../shared/genotype.js';
import { createOrganism, crossoverFarmGenes, mutateFarmGenes } from './organisms.js';

// Generate offspring from two parents
export function breed(parent1, parent2) {
  if (parent1.mode !== parent2.mode) return [];
  const mode = parent1.mode;

  const offspring = [];
  for (let i = 0; i < 4; i++) {
    // Crossover structural genes
    const { genes } = crossoverMulti([parent1.genes, parent2.genes], mode);
    // Crossover color genes
    let colorGenes = crossoverColorMulti([parent1.colorGenes, parent2.colorGenes]);
    // Crossover farm genes
    let farmGenes = crossoverFarmGenes(parent1.farmGenes, parent2.farmGenes);
    // Apply mutation (50% chance each for structure, color, and farm)
    const mutatedGenes = Math.random() < 0.5 ? mutate(genes, mode, 1) : genes;
    if (Math.random() < 0.5) colorGenes = mutateColor(colorGenes);
    if (Math.random() < 0.5) farmGenes = mutateFarmGenes(farmGenes);
    offspring.push(createOrganism(mutatedGenes, mode, colorGenes, farmGenes));
  }
  return offspring;
}

// Breeding lab state machine
export function createBreedingLab() {
  return {
    active: false,
    step: 'select1',  // select1 → select2 → offspring → done
    parent1Idx: null,
    parent2Idx: null,
    offspring: [],
    selectedOffspring: [],
    maxKeep: 2,
  };
}

export function labSelectParent(lab, player, slotIdx) {
  if (slotIdx >= player.inventory.length) return;

  if (lab.step === 'select1') {
    lab.parent1Idx = slotIdx;
    lab.step = 'select2';
  } else if (lab.step === 'select2') {
    if (slotIdx === lab.parent1Idx) return; // can't breed with self
    const p1 = player.inventory[lab.parent1Idx];
    const p2 = player.inventory[slotIdx];
    if (p1.mode !== p2.mode) return; // must be same mode
    lab.parent2Idx = slotIdx;
    lab.offspring = breed(p1, p2);
    lab.selectedOffspring = [];
    lab.step = 'offspring';
  }
}

export function labSelectOffspring(lab, idx) {
  if (lab.step !== 'offspring') return;
  if (idx >= lab.offspring.length) return;

  const pos = lab.selectedOffspring.indexOf(idx);
  if (pos >= 0) {
    lab.selectedOffspring.splice(pos, 1); // deselect
  } else if (lab.selectedOffspring.length < lab.maxKeep) {
    lab.selectedOffspring.push(idx); // select
  }
}

export function labConfirm(lab, player) {
  if (lab.step !== 'offspring' || lab.selectedOffspring.length === 0) return false;

  // Remove parents from inventory (higher index first to avoid shifting)
  const indices = [lab.parent1Idx, lab.parent2Idx].sort((a, b) => b - a);
  for (const idx of indices) {
    player.inventory.splice(idx, 1);
  }

  // Add selected offspring as seeds
  for (const i of lab.selectedOffspring) {
    player.inventory.push(lab.offspring[i]);
  }

  // Reset lab
  lab.step = 'select1';
  lab.parent1Idx = null;
  lab.parent2Idx = null;
  lab.offspring = [];
  lab.selectedOffspring = [];

  return true;
}

export function labReset(lab) {
  lab.active = false;
  lab.step = 'select1';
  lab.parent1Idx = null;
  lab.parent2Idx = null;
  lab.offspring = [];
  lab.selectedOffspring = [];
}
