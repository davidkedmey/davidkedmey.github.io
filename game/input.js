// Keyboard + mouse state tracking

export function createInput(canvas) {
  const keys = {};
  const pressed = {};
  let textMode = false;
  const charBuffer = [];

  // Paste support for command bar
  window.addEventListener('paste', e => {
    if (!textMode) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    for (const ch of text) {
      if (ch === '\n' || ch === '\r') continue;
      charBuffer.push(ch);
    }
  });

  window.addEventListener('keydown', e => {
    if (textMode) {
      // Allow Cmd/Ctrl+V to reach the paste handler
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') return;
      e.preventDefault();
      if (e.key === 'Backspace') {
        charBuffer.push('\b'); // backspace sentinel
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        // Let these through as justPressed for main.js to handle
        if (!keys[e.key]) pressed[e.key] = true;
        keys[e.key] = true;
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        charBuffer.push(e.key);
      }
      return;
    }
    if (!keys[e.key]) pressed[e.key] = true;
    keys[e.key] = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', e => {
    keys[e.key] = false;
  });

  // ── Mouse state (right-click drag for camera panning) ──
  const mouse = {
    rightDown: false,
    dragging: false,
    deltaX: 0,
    deltaY: 0,
    lastX: 0,
    lastY: 0,
    justReleased: false,
  };

  if (canvas) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', e => {
      if (e.button === 2) { // right click
        mouse.rightDown = true;
        mouse.dragging = false;
        mouse.lastX = e.clientX;
        mouse.lastY = e.clientY;
        mouse.deltaX = 0;
        mouse.deltaY = 0;
      }
    });

    window.addEventListener('mousemove', e => {
      if (mouse.rightDown) {
        mouse.dragging = true;
        mouse.deltaX += e.clientX - mouse.lastX;
        mouse.deltaY += e.clientY - mouse.lastY;
        mouse.lastX = e.clientX;
        mouse.lastY = e.clientY;
      }
    });

    window.addEventListener('mouseup', e => {
      if (e.button === 2 && mouse.rightDown) {
        mouse.rightDown = false;
        if (mouse.dragging) mouse.justReleased = true;
        mouse.dragging = false;
      }
    });
  }

  return {
    isDown(key) { return !!keys[key]; },
    justPressed(key) {
      if (pressed[key]) { pressed[key] = false; return true; }
      return false;
    },
    get ArrowLeft()  { return !!keys['ArrowLeft']; },
    get ArrowRight() { return !!keys['ArrowRight']; },
    get ArrowUp()    { return !!keys['ArrowUp']; },
    get ArrowDown()  { return !!keys['ArrowDown']; },
    // Mouse panning API
    get mouseDragging() { return mouse.dragging; },
    consumeDragDelta() {
      const dx = mouse.deltaX, dy = mouse.deltaY;
      mouse.deltaX = 0;
      mouse.deltaY = 0;
      return { dx, dy };
    },
    consumeMouseRelease() {
      if (mouse.justReleased) { mouse.justReleased = false; return true; }
      return false;
    },
    // Text mode for command bar
    setTextMode(on) { textMode = on; },
    drainCharBuffer() {
      const chars = charBuffer.slice();
      charBuffer.length = 0;
      return chars;
    },
  };
}
