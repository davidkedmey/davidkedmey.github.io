// Turing Machine Simulator
// Interactive widget for "On Computable Numbers" interactive paper
// Renders a visual tape, head, state display, and step controls

class TuringMachine {
  constructor(config) {
    this.name = config.name || 'Machine';
    this.description = config.description || '';
    this.states = config.states; // array of state objects
    this.initialState = config.initialState;
    this.blankSymbol = config.blankSymbol || ' ';
    this.tapeInit = config.tapeInit || [];
    this.reset();
  }

  reset() {
    this.tape = {};
    this.headPos = 0;
    this.state = this.initialState;
    this.stepCount = 0;
    this.halted = false;
    this.history = [];
    // Initialize tape
    this.tapeInit.forEach((sym, i) => { this.tape[i] = sym; });
  }

  read() {
    return this.tape[this.headPos] || this.blankSymbol;
  }

  write(sym) {
    if (sym === this.blankSymbol) {
      delete this.tape[this.headPos];
    } else {
      this.tape[this.headPos] = sym;
    }
  }

  // Find matching rule for current state + symbol
  // Priority: exact match > None (blank) > Any (non-blank) > wildcard patterns
  findRule() {
    const sym = this.read();
    const isBlank = sym === this.blankSymbol;
    let anyMatch = null;
    let noneMatch = null;
    let wildcardMatch = null;

    for (const rule of this.states) {
      if (rule.state !== this.state) continue;
      // Exact symbol match — highest priority
      if (rule.symbol === sym) return rule;
      // 'None' matches only blank
      if (rule.symbol === 'None' && isBlank) noneMatch = noneMatch || rule;
      // 'Any' matches any non-blank symbol
      if (rule.symbol === 'Any' && !isBlank) anyMatch = anyMatch || rule;
      // Wildcard patterns
      if (rule.symbol === 'Not0' && sym !== '0' && !isBlank) wildcardMatch = wildcardMatch || rule;
      if (rule.symbol === 'Not1' && sym !== '1' && !isBlank) wildcardMatch = wildcardMatch || rule;
    }
    return noneMatch || anyMatch || wildcardMatch || null;
  }

  step() {
    if (this.halted) return null;
    const rule = this.findRule();
    if (!rule) {
      this.halted = true;
      return null;
    }
    // Save history for undo
    this.history.push({
      tape: { ...this.tape },
      headPos: this.headPos,
      state: this.state,
      stepCount: this.stepCount
    });

    // Execute operations
    for (const op of rule.operations) {
      if (op === 'R') this.headPos++;
      else if (op === 'L') this.headPos--;
      else if (op === 'E') this.write(this.blankSymbol);
      else if (op.startsWith('P')) this.write(op.slice(1));
    }
    this.state = rule.nextState;
    this.stepCount++;
    return rule;
  }

  undo() {
    if (this.history.length === 0) return;
    const prev = this.history.pop();
    this.tape = prev.tape;
    this.headPos = prev.headPos;
    this.state = prev.state;
    this.stepCount = prev.stepCount;
    this.halted = false;
  }

  // Get tape bounds for display
  getBounds() {
    const positions = Object.keys(this.tape).map(Number);
    positions.push(this.headPos);
    if (positions.length === 0) return { min: -5, max: 5 };
    const min = Math.min(...positions) - 3;
    const max = Math.max(...positions) + 3;
    return { min: Math.min(min, -3), max: Math.max(max, 3) };
  }

  // Get the computed output sequence (F-squares only for computing machines)
  getOutput() {
    const positions = Object.keys(this.tape).map(Number).sort((a, b) => a - b);
    let output = '';
    for (const pos of positions) {
      // F-squares are even-indexed positions
      if (pos % 2 === 0) {
        const sym = this.tape[pos];
        if (sym === '0' || sym === '1') output += sym;
      }
    }
    return output;
  }
}


// ─── Visual Renderer ────────────────────────────────────────

class TuringMachineWidget {
  constructor(container, machine, options = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container) : container;
    this.machine = machine;
    this.autoRunInterval = null;
    this.autoRunSpeed = options.speed || 400;
    this.showFSquares = options.showFSquares !== false;
    this.maxAutoSteps = options.maxAutoSteps || 200;
    this.onStep = options.onStep || null;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    this.container.classList.add('tm-widget');

    // Header
    const header = el('div', 'tm-header');
    header.innerHTML = `<span class="tm-name">${this.machine.name}</span>
      <span class="tm-desc">${this.machine.description}</span>`;
    this.container.appendChild(header);

    // State display
    this.stateEl = el('div', 'tm-state-display');
    this.container.appendChild(this.stateEl);

    // Tape
    this.tapeEl = el('div', 'tm-tape-container');
    this.container.appendChild(this.tapeEl);

    // Output
    this.outputEl = el('div', 'tm-output');
    this.container.appendChild(this.outputEl);

    // Controls
    const controls = el('div', 'tm-controls');
    this.btnReset = btn('Reset', () => this.doReset());
    this.btnUndo = btn('Undo', () => this.doUndo());
    this.btnStep = btn('Step', () => this.doStep());
    this.btnRun = btn('Run', () => this.toggleRun());
    this.btnFast = btn('Fast', () => this.toggleRun(60));

    controls.append(this.btnReset, this.btnUndo, this.btnStep, this.btnRun, this.btnFast);
    this.container.appendChild(controls);

    // Step counter
    this.counterEl = el('div', 'tm-counter');
    this.container.appendChild(this.counterEl);

    this.updateDisplay();
  }

  doStep() {
    const rule = this.machine.step();
    this.updateDisplay();
    if (this.onStep) this.onStep(this.machine, rule);
    if (this.machine.halted) this.stopRun();
  }

  doReset() {
    this.stopRun();
    this.machine.reset();
    this.updateDisplay();
  }

  doUndo() {
    this.machine.undo();
    this.updateDisplay();
  }

  toggleRun(speed) {
    if (this.autoRunInterval) {
      this.stopRun();
    } else {
      const ms = speed || this.autoRunSpeed;
      this.btnRun.classList.add('tm-active');
      if (speed) this.btnFast.classList.add('tm-active');
      this.autoRunInterval = setInterval(() => {
        if (this.machine.halted || this.machine.stepCount >= this.maxAutoSteps) {
          this.stopRun();
          return;
        }
        this.doStep();
      }, ms);
    }
  }

  stopRun() {
    if (this.autoRunInterval) {
      clearInterval(this.autoRunInterval);
      this.autoRunInterval = null;
    }
    this.btnRun.classList.remove('tm-active');
    this.btnFast.classList.remove('tm-active');
  }

  updateDisplay() {
    const m = this.machine;
    // State
    this.stateEl.innerHTML = `<span class="tm-label">m-configuration:</span>
      <span class="tm-state-value">${m.state}</span>
      <span class="tm-label" style="margin-left:1.5em">scanned symbol:</span>
      <span class="tm-symbol-value">${m.read() === ' ' ? '□' : m.read()}</span>`;

    // Tape
    this.renderTape();

    // Output
    const output = m.getOutput();
    if (output) {
      this.outputEl.innerHTML = `<span class="tm-label">Computed sequence:</span>
        <span class="tm-output-value">0.${output}${m.halted ? '' : '…'}</span>`;
      this.outputEl.style.display = '';
    } else {
      this.outputEl.style.display = 'none';
    }

    // Counter
    this.counterEl.textContent = `Step ${m.stepCount}${m.halted ? ' — halted' : ''}`;

    // Button states
    this.btnUndo.disabled = m.history.length === 0;
    this.btnStep.disabled = m.halted;
  }

  renderTape() {
    const m = this.machine;
    const bounds = m.getBounds();
    // Ensure we show enough context
    const min = Math.min(bounds.min, m.headPos - 6);
    const max = Math.max(bounds.max, m.headPos + 6);

    this.tapeEl.innerHTML = '';
    const tape = el('div', 'tm-tape');
    const headMarker = el('div', 'tm-head-row');

    for (let i = min; i <= max; i++) {
      const sym = m.tape[i] || '';
      const cell = el('div', 'tm-cell');
      cell.textContent = sym || '';

      // F-square / E-square distinction
      if (this.showFSquares) {
        cell.classList.add(i % 2 === 0 ? 'tm-f-square' : 'tm-e-square');
      }
      if (i === m.headPos) {
        cell.classList.add('tm-head');
      }
      tape.appendChild(cell);

      // Head marker row
      const marker = el('div', 'tm-marker');
      if (i === m.headPos) {
        marker.textContent = '▲';
        marker.classList.add('tm-head-marker');
      }
      headMarker.appendChild(marker);
    }

    this.tapeEl.appendChild(tape);
    this.tapeEl.appendChild(headMarker);

    // Auto-scroll to keep head visible
    const headCell = tape.querySelector('.tm-head');
    if (headCell) {
      headCell.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }
}

// ─── Helper functions ────────────────────────────────────────

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function btn(text, onclick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = 'tm-btn';
  b.addEventListener('click', onclick);
  return b;
}


// ─── Turing's Example Machines ──────────────────────────────

const MACHINES = {
  // Machine I (p.233): computes 0 1 0 1 0 1 ...
  machine1: {
    name: 'Machine I',
    description: 'Computes the sequence 0 1 0 1 0 1 …',
    initialState: 'b',
    blankSymbol: ' ',
    states: [
      { state: 'b', symbol: 'None', operations: ['P0', 'R'],      nextState: 'c' },
      { state: 'c', symbol: 'None', operations: ['R'],             nextState: 'e' },
      { state: 'e', symbol: 'None', operations: ['P1', 'R'],      nextState: 'f' },
      { state: 'f', symbol: 'None', operations: ['R'],             nextState: 'b' },
    ]
  },

  // Machine I simplified (p.234): same sequence, fewer states
  machine1s: {
    name: 'Machine I (simplified)',
    description: 'Computes 0 1 0 1 … with a single m-configuration',
    initialState: 'b',
    blankSymbol: ' ',
    states: [
      { state: 'b', symbol: 'None', operations: ['P0'],           nextState: 'b' },
      { state: 'b', symbol: '0',    operations: ['R', 'R', 'P1'], nextState: 'b' },
      { state: 'b', symbol: '1',    operations: ['R', 'R', 'P0'], nextState: 'b' },
    ]
  },

  // Machine II (p.234): computes 0 0 1 0 1 1 0 1 1 1 0 1 1 1 1 ...
  machine2: {
    name: 'Machine II',
    description: 'Computes the sequence 0 0 1 0 1 1 0 1 1 1 0 1 1 1 1 …',
    initialState: 'b',
    blankSymbol: ' ',
    states: [
      // b: initial setup - print əə0 on first 3 squares, then alternate
      { state: 'b', symbol: 'None', operations: ['Pə', 'R', 'Pə', 'R', 'P0', 'R', 'R', 'P0', 'L', 'L'], nextState: 'o' },
      // o: found 0, move right to find 1 or handle
      { state: 'o', symbol: '1',    operations: ['R', 'Px', 'L', 'L', 'L'],  nextState: 'o' },
      { state: 'o', symbol: '0',    operations: [],                           nextState: 'q' },
      // q: skip over pairs
      { state: 'q', symbol: 'Any',  operations: ['R', 'R'],                   nextState: 'q' },
      { state: 'q', symbol: 'None', operations: ['P1', 'L'],                  nextState: 'p' },
      // p: move left, handle x markers
      { state: 'p', symbol: 'x',    operations: ['E', 'R'],                   nextState: 'q' },
      { state: 'p', symbol: 'ə',    operations: ['R'],                        nextState: 'f' },
      { state: 'p', symbol: 'None', operations: ['L', 'L'],                   nextState: 'p' },
      // f: move right to end
      { state: 'f', symbol: 'Any',  operations: ['R', 'R'],                   nextState: 'f' },
      { state: 'f', symbol: 'None', operations: ['P0', 'L', 'L'],            nextState: 'o' },
    ]
  },
};

// Export for use in interactive paper
if (typeof window !== 'undefined') {
  window.TuringMachine = TuringMachine;
  window.TuringMachineWidget = TuringMachineWidget;
  window.MACHINES = MACHINES;
}
