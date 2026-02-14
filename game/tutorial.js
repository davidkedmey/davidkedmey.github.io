// Tutorial step definitions and state machine for Sage NPC guide

import { TILE_SIZE } from './world.js';

const NPC_SPEED = 60;

export const TUTORIAL_STEPS = [
  {
    id: 'greet',
    targetCol: 15, targetRow: 8,
    speech: [
      "Welcome to Biomorph Island!",
      "I'm Sage \u2014 I'll show you around.",
      "Follow me!",
    ],
    waitForPlayer: false,
    pauseAfter: 1,
  },
  {
    id: 'walk_to_dirt',
    targetCol: 13, targetRow: 8,
    speech: [
      "See this dirt? You can plant seeds here.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'explain_planting',
    targetCol: 13, targetRow: 8,
    speech: [
      "Select a seed with keys 1\u20139.",
      "Face the dirt tile, then press Space to plant.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'walk_to_shop',
    targetCol: 27, targetRow: 5,
    speech: [
      "Follow me to the Shop!",
    ],
    waitForPlayer: true,
  },
  {
    id: 'explain_shop',
    targetCol: 27, targetRow: 5,
    speech: [
      "Press Space near the Shop to enter.",
      "Buy seeds, sell organisms for gold.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'walk_to_fern',
    targetCol: 8, targetRow: 10,
    speech: [
      "Let's visit Fern! She's a farmer.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'explain_trading',
    targetCol: 8, targetRow: 10,
    speech: [
      "Farmers grow their own biomorphs.",
      "Press Space near a farmer to trade 1-for-1.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'walk_to_museum',
    targetCol: 27, targetRow: 18,
    speech: [
      "The Museum is down here.",
      "Donate 5 specimens to unlock the Lab!",
    ],
    waitForPlayer: true,
  },
  {
    id: 'explain_museum',
    targetCol: 27, targetRow: 18,
    speech: [
      "Each species gets recorded in the Museum.",
      "The Lab lets you cross-breed two biomorphs.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'walk_to_lab',
    targetCol: 3, targetRow: 18,
    speech: [
      "And here's the Lab!",
    ],
    waitForPlayer: true,
  },
  {
    id: 'explain_lab',
    targetCol: 3, targetRow: 18,
    speech: [
      "Once the Museum is unlocked, breed two biomorphs here.",
      "Cross-breeding creates unique offspring!",
    ],
    waitForPlayer: true,
  },
  {
    id: 'walk_to_trees',
    targetCol: 11, targetRow: 14,
    speech: [
      "Wild trees are biomorphs too!",
    ],
    waitForPlayer: true,
  },
  {
    id: 'explain_trees',
    targetCol: 11, targetRow: 14,
    speech: [
      "Craft tools at your House to forage or chop.",
      "Spear forages, Axe chops for double materials.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'walk_home',
    targetCol: 3, targetRow: 5,
    speech: [
      "Your House is a crafting table.",
      "Press Space near it to craft tools and items.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'walk_to_study',
    targetCol: 15, targetRow: 4,
    speech: [
      "This is Dawkins' Study.",
    ],
    waitForPlayer: true,
  },
  {
    id: 'explain_study',
    targetCol: 15, targetRow: 4,
    speech: [
      "Visit Professor Dawkins to learn the science behind biomorphs.",
      "He has 10 conversations waiting for you!",
    ],
    waitForPlayer: true,
  },
  {
    id: 'farewell',
    targetCol: 15, targetRow: 8,
    speech: [
      "That's the basics!",
      "Hold T to fast-forward through the day.",
      "Press H for help, I for inventory. Good luck!",
    ],
    waitForPlayer: false,
  },
];

export function createTutorialState() {
  return {
    active: true,
    stepIdx: 0,
    phase: 'walking', // 'walking' | 'speaking' | 'waiting' | 'pausing'
    speechIdx: 0,
    speechTimer: 0,
    pauseTimer: 0,
    completed: false,
  };
}

export function updateTutorial(tutState, sageState, playerX, playerY, dt, autoFollow) {
  if (!tutState.active || tutState.completed) return;
  if (!sageState) return;

  const step = TUTORIAL_STEPS[tutState.stepIdx];
  if (!step) { tutState.completed = true; tutState.active = false; return; }

  const targetX = step.targetCol * TILE_SIZE + TILE_SIZE / 2;
  const targetY = step.targetRow * TILE_SIZE + TILE_SIZE / 2;

  if (tutState.phase === 'walking') {
    const dx = targetX - sageState.x;
    const dy = targetY - sageState.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) {
      sageState.x = targetX;
      sageState.y = targetY;
      sageState.moving = false;
      tutState.phase = 'speaking';
      tutState.speechIdx = 0;
      tutState.speechTimer = 0;
    } else {
      sageState.moving = true;
      const speed = NPC_SPEED * dt;
      sageState.x += (dx / dist) * speed;
      sageState.y += (dy / dist) * speed;
      if (Math.abs(dx) > Math.abs(dy)) {
        sageState.facing = dx > 0 ? 'right' : 'left';
      } else {
        sageState.facing = dy > 0 ? 'down' : 'up';
      }
    }
  } else if (tutState.phase === 'speaking') {
    tutState.speechTimer += dt;
    if (tutState.speechTimer >= 3.5) {
      tutState.speechTimer = 0;
      tutState.speechIdx++;
      if (tutState.speechIdx >= step.speech.length) {
        if (step.waitForPlayer && !autoFollow) {
          tutState.phase = 'waiting';
        } else if (step.waitForPlayer && autoFollow) {
          // Auto-follow: brief pause instead of waiting for player
          tutState.phase = 'pausing';
          tutState.pauseTimer = 1.5;
        } else if (step.pauseAfter) {
          tutState.phase = 'pausing';
          tutState.pauseTimer = step.pauseAfter;
        } else {
          advanceStep(tutState, sageState);
        }
      }
    }
  } else if (tutState.phase === 'waiting') {
    const dist = Math.hypot(playerX - sageState.x, playerY - sageState.y);
    if (dist < TILE_SIZE * 4) {
      advanceStep(tutState, sageState);
    }
  } else if (tutState.phase === 'pausing') {
    tutState.pauseTimer -= dt;
    if (tutState.pauseTimer <= 0) {
      advanceStep(tutState, sageState);
    }
  }
}

function advanceStep(tutState, sageState) {
  tutState.stepIdx++;
  if (tutState.stepIdx >= TUTORIAL_STEPS.length) {
    tutState.completed = true;
    tutState.active = false;
    sageState.wanderRadius = 3;
  } else {
    tutState.phase = 'walking';
    tutState.speechIdx = 0;
    tutState.speechTimer = 0;
  }
}

export function getTutorialSpeech(tutState) {
  if (!tutState || !tutState.active || tutState.completed) return null;
  if (tutState.phase !== 'speaking') return null;
  const step = TUTORIAL_STEPS[tutState.stepIdx];
  if (!step || tutState.speechIdx >= step.speech.length) return null;
  return step.speech[tutState.speechIdx];
}

// ── Post-tutorial: Sage "show me" tips ──

export const SAGE_TIPS = [
  {
    tip: "Plant deeper biomorphs \u2014 they sell for more!",
    targetCol: 13, targetRow: 8,
    arrival: "Try planting here! Deeper seeds fetch better prices.",
  },
  {
    tip: "Craft a spear at your House to forage wild trees.",
    targetCol: 3, targetRow: 5,
    arrival: "Press Space here to open the crafting table!",
  },
  {
    tip: "The Museum unlocks the Lab after 5 donations.",
    targetCol: 27, targetRow: 18,
    arrival: "Press Space to enter the Museum. Donate specimens!",
  },
  {
    tip: "Try breeding in the Lab for unique offspring!",
    targetCol: 3, targetRow: 20,
    arrival: "Breed two organisms here once it's unlocked!",
  },
  {
    tip: "Hold T to fast-forward through the day.",
    targetCol: null,
    arrival: null,
  },
];

export function createSageShowState() {
  return { phase: 'idle', tipIdx: -1, timer: 0 };
}

export function updateSageShow(state, sageState, dt) {
  if (state.phase === 'idle' || !sageState) return;

  if (state.phase === 'tip') {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.phase = 'offered';
      state.timer = 6;
    }
  } else if (state.phase === 'offered') {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.phase = 'idle';
    }
  } else if (state.phase === 'walking') {
    const tip = SAGE_TIPS[state.tipIdx];
    if (!tip || tip.targetCol == null) { state.phase = 'idle'; return; }
    const targetX = tip.targetCol * TILE_SIZE + TILE_SIZE / 2;
    const targetY = tip.targetRow * TILE_SIZE + TILE_SIZE / 2;
    const dx = targetX - sageState.x;
    const dy = targetY - sageState.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) {
      sageState.x = targetX;
      sageState.y = targetY;
      sageState.moving = false;
      state.phase = 'arrived';
      state.timer = 4;
    } else {
      sageState.moving = true;
      const speed = NPC_SPEED * dt;
      sageState.x += (dx / dist) * speed;
      sageState.y += (dy / dist) * speed;
      if (Math.abs(dx) > Math.abs(dy)) {
        sageState.facing = dx > 0 ? 'right' : 'left';
      } else {
        sageState.facing = dy > 0 ? 'down' : 'up';
      }
    }
  } else if (state.phase === 'arrived') {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.phase = 'idle';
    }
  }
}

export function getSageShowSpeech(state) {
  if (state.phase === 'idle') return null;
  const tip = SAGE_TIPS[state.tipIdx];
  if (!tip) return null;
  if (state.phase === 'tip') return tip.tip;
  if (state.phase === 'offered') return 'Want me to show you? [Space]';
  if (state.phase === 'walking') return 'Follow me!';
  if (state.phase === 'arrived') return tip.arrival;
  return null;
}
