// Keyboard + mouse state tracking

export function createInput(canvas) {
  const keys = {};
  const pressed = {};

  window.addEventListener('keydown', e => {
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
  };
}
