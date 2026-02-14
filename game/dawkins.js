// Dawkins dialogue engine — progressive 10-visit system

export async function loadDawkinsDialogue() {
  const resp = await fetch('./dawkins-dialogue.json');
  return resp.json();
}

export function createDawkinsState() {
  return {
    dialogueData: null,
    completedVisits: 0,
    currentVisit: null,
    lineIdx: 0,
    choiceActive: false,
    choiceCursor: 0,
    choiceLineIdx: -1,     // index of the player_choice line
    resumeAfterIdx: null,  // index to jump to after showing a response
  };
}

export function canStartVisit(state) {
  return state.dialogueData && state.completedVisits < 10;
}

export function startVisit(state) {
  if (!state.dialogueData) return;
  const visits = state.dialogueData.visits;
  if (state.completedVisits >= visits.length) return;
  state.currentVisit = visits[state.completedVisits];
  state.lineIdx = 0;
  state.choiceActive = false;
  state.choiceCursor = 0;
  state.choiceLineIdx = -1;
  state.resumeAfterIdx = null;

  // Check if first line is a choice (shouldn't be, but handle gracefully)
  const line = state.currentVisit.lines[0];
  if (line && line.speaker === 'player_choice') {
    state.choiceActive = true;
    state.choiceCursor = 0;
    state.choiceLineIdx = 0;
  }
}

export function advanceLine(state) {
  if (!state.currentVisit) return;

  if (state.resumeAfterIdx != null) {
    state.lineIdx = state.resumeAfterIdx;
    state.resumeAfterIdx = null;
  } else {
    state.lineIdx++;
  }

  const line = getCurrentLine(state);
  if (line && line.speaker === 'player_choice') {
    state.choiceActive = true;
    state.choiceCursor = 0;
    state.choiceLineIdx = state.lineIdx;
  } else if (line && line.interactive) {
    // Interactive placeholder — just display it, player advances with Space
  }
}

export function selectChoice(state, optionIdx) {
  if (!state.currentVisit || state.choiceLineIdx < 0) return;

  const choiceLine = state.currentVisit.lines[state.choiceLineIdx];
  if (!choiceLine || !choiceLine.options) return;
  if (optionIdx >= choiceLine.options.length) return;

  const option = choiceLine.options[optionIdx];
  const responseId = option.response;

  // Collect all response IDs from this choice
  const allResponseIds = new Set(choiceLine.options.map(o => o.response));

  // Find indices of response lines
  const lines = state.currentVisit.lines;
  let selectedIdx = -1;
  let maxResponseIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (allResponseIds.has(lines[i].id)) {
      if (lines[i].id === responseId) selectedIdx = i;
      if (i > maxResponseIdx) maxResponseIdx = i;
    }
  }

  if (selectedIdx < 0) return; // response not found

  state.lineIdx = selectedIdx;
  state.resumeAfterIdx = maxResponseIdx + 1;
  state.choiceActive = false;
  state.choiceCursor = 0;
  state.choiceLineIdx = -1;
}

export function getCurrentLine(state) {
  if (!state.currentVisit) return null;
  if (state.lineIdx >= state.currentVisit.lines.length) return null;
  return state.currentVisit.lines[state.lineIdx];
}

export function completeVisit(state) {
  state.completedVisits++;
  state.currentVisit = null;
  state.lineIdx = 0;
  state.choiceActive = false;
  state.choiceCursor = 0;
  state.choiceLineIdx = -1;
  state.resumeAfterIdx = null;
}
