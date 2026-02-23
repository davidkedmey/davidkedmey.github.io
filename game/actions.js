// Composable multi-step action system for LLM command bar
// Parses DO:/SAY:/ASK:/SUGGEST: lines and executes them sequentially

/**
 * Parse an LLM response into structured actions.
 * Supports two formats:
 *   1. Multi-step: lines starting with DO:, SAY:, ASK:, SUGGEST:
 *   2. Single command: plain text (backward compat)
 *
 * Returns { actions: [{type, content}], say: string|null }
 */
export function parseActions(llmResponse) {
  const lines = llmResponse.split('\n').map(l => l.trim()).filter(Boolean);

  const actions = [];
  let say = null;

  // Check if any line starts with DO: — that's the multi-step signal
  const hasDoLines = lines.some(l => l.startsWith('DO:'));

  if (!hasDoLines) {
    // Single command format — return as-is for backward compat
    return { actions: [{ type: 'raw', content: llmResponse }], say: null };
  }

  for (const line of lines) {
    if (line.startsWith('DO:')) {
      actions.push({ type: 'do', content: line.slice(3).trim() });
    } else if (line.startsWith('SAY:')) {
      say = line.slice(4).trim();
    } else if (line.startsWith('ASK:')) {
      actions.push({ type: 'ask', content: line.slice(4).trim() });
    } else if (line.startsWith('SUGGEST:')) {
      actions.push({ type: 'suggest', content: line.slice(8).trim() });
    }
    // Ignore unrecognized lines in multi-step mode
  }

  return { actions, say };
}

/**
 * Create an action runner that executes DO: steps sequentially.
 *
 * @param {Function} executeCommandFn - the game's executeCommand()
 * @param {Object} gameState - game state (for walkTarget polling)
 * @param {Object} player - player object (for inventory tracking)
 * @param {Function} showMessageFn - showMessage(text, duration)
 * @returns {{ run(actions, say), cancel(), isRunning }}
 */
export function createActionRunner(executeCommandFn, gameState, player, showMessageFn) {
  let running = false;
  let cancelled = false;
  let currentStep = 0;
  let totalSteps = 0;

  function resolveLast(content, lastSlot) {
    if (lastSlot === null) return content;
    return content.replace(/\$last/g, String(lastSlot));
  }

  async function waitForWalk() {
    // Poll until walkTarget clears (walk-based commands finished)
    while (gameState.walkTarget && !cancelled) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  async function run(actions, say) {
    const doActions = actions.filter(a => a.type === 'do');
    if (doActions.length === 0) return;

    running = true;
    cancelled = false;
    currentStep = 0;
    totalSteps = doActions.length;
    gameState.actionRunner = { step: 0, total: totalSteps, label: '' };

    let lastSlot = null; // tracks $last = slot of most recently created item

    for (let i = 0; i < doActions.length; i++) {
      if (cancelled) break;

      currentStep = i + 1;
      let cmd = resolveLast(doActions[i].content, lastSlot);

      // Update runner state for renderer
      gameState.actionRunner = { step: currentStep, total: totalSteps, label: cmd };
      showMessageFn(`[${currentStep}/${totalSteps}] ${cmd}`, 2);

      // Snapshot inventory length before execution
      const invBefore = player.inventory.length;

      // Execute the command
      executeCommandFn(cmd);

      // Wait for walk-based commands to finish
      await waitForWalk();

      // Check if inventory grew — update $last
      if (player.inventory.length > invBefore) {
        lastSlot = player.inventory.length; // 1-indexed slot number
      }

      // Delay between steps (unless last step or cancelled)
      if (i < doActions.length - 1 && !cancelled) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // Handle non-DO actions (ASK/SUGGEST) — only the last one matters
    const otherAction = actions.find(a => a.type === 'ask' || a.type === 'suggest');
    if (otherAction && !cancelled) {
      // Return it so caller can handle
      gameState.actionRunner = null;
      running = false;
      return otherAction;
    }

    // Show SAY summary
    if (say && !cancelled) {
      showMessageFn(say, 5);
    } else if (cancelled) {
      showMessageFn('Sequence cancelled.', 2);
    }

    gameState.actionRunner = null;
    running = false;
    return null;
  }

  function cancel() {
    if (running) {
      cancelled = true;
      gameState.walkTarget = null; // stop any in-progress walk
    }
  }

  return {
    run,
    cancel,
    get isRunning() { return running; },
  };
}
