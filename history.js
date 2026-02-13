/**
 * Evolution History — Tree-based undo/branching + genealogy visualization
 */

class EvolutionHistory {
  constructor() {
    this.nodes = new Map();
    this.currentId = null;
    this.nextId = 0;
    this.imageCache = new Map(); // id -> preloaded Image
  }

  push(genes, mode, symmetry, altAsym, radialSym, generation) {
    const id = this.nextId++;
    const node = {
      id,
      genes: genes.slice(),
      mode,
      symmetry,
      alternatingAsym: altAsym,
      radialSym: radialSym,
      generation,
      parentId: this.currentId,
      childIds: [],
      thumbnail: null,
    };
    this.nodes.set(id, node);
    if (this.currentId !== null) {
      const parent = this.nodes.get(this.currentId);
      if (parent) parent.childIds.push(id);
    }
    this.currentId = id;
    return node;
  }

  undo() {
    if (this.currentId === null) return null;
    const current = this.nodes.get(this.currentId);
    if (!current || current.parentId === null) return null;
    this.currentId = current.parentId;
    return this.nodes.get(this.currentId);
  }

  jumpTo(id) {
    if (!this.nodes.has(id)) return null;
    this.currentId = id;
    return this.nodes.get(id);
  }

  getCurrent() {
    return this.currentId !== null ? this.nodes.get(this.currentId) : null;
  }

  getAncestors(maxCount) {
    const ancestors = [];
    let id = this.currentId;
    while (id !== null && (!maxCount || ancestors.length < maxCount)) {
      const node = this.nodes.get(id);
      if (!node) break;
      ancestors.unshift(node);
      id = node.parentId;
    }
    return ancestors;
  }

  reset() {
    this.nodes.clear();
    this.imageCache.clear();
    this.currentId = null;
    this.nextId = 0;
  }

  getAllNodes() {
    return Array.from(this.nodes.values());
  }
}

// ── Thumbnail capture ───────────────────────────────────────

function captureNodeThumbnail(history, node) {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;

  // Temporarily swap global render state
  const prevMode = currentMode;
  const prevSym = symmetryType;
  const prevAlt = alternatingAsymmetry;
  const prevRad = radialSymmetry;

  currentMode = node.mode;
  symmetryType = node.symmetry;
  alternatingAsymmetry = node.alternatingAsym;
  radialSymmetry = node.radialSym;

  if (node.mode === 0) {
    renderPeppering(canvas, node.genes);
  } else {
    const opts = node.colorEnabled && node.colorGenes
      ? { colorEnabled: true, colorGenes: node.colorGenes }
      : undefined;
    renderBiomorph(canvas, node.genes, opts);
  }

  currentMode = prevMode;
  symmetryType = prevSym;
  alternatingAsymmetry = prevAlt;
  radialSymmetry = prevRad;

  const dataUrl = canvas.toDataURL('image/png');
  node.thumbnail = dataUrl;

  const img = new Image();
  img.src = dataUrl;
  history.imageCache.set(node.id, img);

  return dataUrl;
}

// ── Genealogy tree layout ───────────────────────────────────

function layoutGenealogy(history) {
  const allNodes = history.getAllNodes();
  if (allNodes.length === 0) return { positions: new Map(), width: 0, height: 0, nodeW: 100, nodeH: 100 };

  const NODE_W = 100;
  const NODE_H = 100;
  const GAP_X = 28;
  const GAP_Y = 16;

  const positions = new Map();
  const depths = new Map();

  function assignDepth(nodeId, depth) {
    depths.set(nodeId, depth);
    const node = history.nodes.get(nodeId);
    if (node) node.childIds.forEach(cid => assignDepth(cid, depth + 1));
  }

  const roots = allNodes.filter(n => n.parentId === null);
  roots.forEach(r => assignDepth(r.id, 0));

  let nextY = 10;

  function assignPositions(nodeId) {
    const node = history.nodes.get(nodeId);
    if (!node) return;
    const x = 10 + depths.get(nodeId) * (NODE_W + GAP_X);

    if (node.childIds.length === 0) {
      positions.set(nodeId, { x, y: nextY });
      nextY += NODE_H + GAP_Y;
    } else {
      node.childIds.forEach(cid => assignPositions(cid));
      const first = positions.get(node.childIds[0]);
      const last = positions.get(node.childIds[node.childIds.length - 1]);
      positions.set(nodeId, { x, y: (first.y + last.y) / 2 });
    }
  }

  roots.forEach(r => assignPositions(r.id));

  let maxX = 0, maxY = 0;
  for (const pos of positions.values()) {
    maxX = Math.max(maxX, pos.x + NODE_W + 10);
    maxY = Math.max(maxY, pos.y + NODE_H + 10);
  }

  return { positions, width: maxX, height: maxY, nodeW: NODE_W, nodeH: NODE_H };
}

// ── Genealogy canvas rendering ──────────────────────────────

function renderGenealogy(history, onJump) {
  const panel = document.getElementById('genealogy-panel');
  if (!panel) return;

  const content = panel.querySelector('.panel-content');
  if (!content || content.style.display === 'none') return;

  const canvas = document.getElementById('genealogy-canvas');
  if (!canvas) return;

  const nodeCount = history.getAllNodes().length;

  // Manage hint element
  let hint = content.querySelector('.genealogy-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'genealogy-hint';
    content.appendChild(hint);
  }
  if (nodeCount === 0) {
    hint.textContent = 'Your evolutionary tree will appear here as you select offspring.';
    hint.style.display = '';
  } else if (nodeCount === 1) {
    hint.textContent = 'Select offspring to grow your evolutionary tree.';
    hint.style.display = '';
  } else {
    hint.style.display = 'none';
  }

  const { positions, width, height, nodeW, nodeH } = layoutGenealogy(history);
  if (positions.size === 0) return;

  canvas.width = Math.max(width, 200);
  canvas.height = Math.max(height, 80);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw edges
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1.5;
  for (const node of history.getAllNodes()) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    for (const cid of node.childIds) {
      const cp = positions.get(cid);
      if (!cp) continue;
      ctx.beginPath();
      ctx.moveTo(pos.x + nodeW, pos.y + nodeH / 2);
      const mx = (pos.x + nodeW + cp.x) / 2;
      ctx.bezierCurveTo(mx, pos.y + nodeH / 2, mx, cp.y + nodeH / 2, cp.x, cp.y + nodeH / 2);
      ctx.stroke();
    }
  }

  // Draw nodes
  for (const node of history.getAllNodes()) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const isCurrent = node.id === history.currentId;

    // Node background
    ctx.fillStyle = isCurrent ? '#1f6feb' : '#161b22';
    ctx.strokeStyle = isCurrent ? '#58a6ff' : '#30363d';
    ctx.lineWidth = isCurrent ? 2.5 : 1;
    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y, nodeW, nodeH, 6);
    ctx.fill();
    ctx.stroke();

    // Thumbnail
    const img = history.imageCache.get(node.id);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, pos.x + 6, pos.y + 4, nodeW - 12, nodeH - 22);
    }

    // Generation label
    ctx.fillStyle = isCurrent ? '#fff' : '#8b949e';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Gen ${node.generation}`, pos.x + nodeW / 2, pos.y + nodeH - 5);
  }

  // Click handler
  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * sx;
    const my = (e.clientY - rect.top) * sy;

    for (const node of history.getAllNodes()) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      if (mx >= pos.x && mx <= pos.x + nodeW && my >= pos.y && my <= pos.y + nodeH) {
        onJump(node.id);
        break;
      }
    }
  };
}
