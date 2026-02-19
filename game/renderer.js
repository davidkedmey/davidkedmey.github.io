// All canvas drawing: tiles, organisms, player, HUD, menus, overlays

import { TILE, COLS, ROWS, TILE_SIZE, BUILDINGS, ZONE_SIGNS } from './world.js';
import { facingTile } from './player.js';
import { getSprite } from './organisms.js';
import { sellPrice, buyPrice } from './economy.js';
import { NPCS } from './npcs.js';
import { MATERIAL_TYPES, analyzeBiomorph } from './materials.js';
import { RECIPES, canCraft } from './crafting.js';
import { getCurrentLine } from './dawkins.js';
import { PROPERTIES, getOwner } from './property.js';
import { getTaskLabel } from './ai.js';
import { RARITY_COLORS, RARITY_LABELS, getLeaderboardRanked, getRarityBreakdown, getMorphospaceData } from './discovery.js';
import { galleryImportCost } from './gallery-bridge.js';

export const CANVAS_W = 960;
export const CANVAS_H = 768;
const VIEW_H = CANVAS_H - TILE_SIZE; // 720 — viewport above HUD
const HUD_Y = VIEW_H;
const INV_SLOT = 38;
let WORLD_W = COLS * TILE_SIZE;
let WORLD_H = ROWS * TILE_SIZE;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Module-level mouse position for hover highlights (set each frame in render())
let _mx = 0, _my = 0;
function _hitRect(rx, ry, rw, rh) { return _mx >= rx && _mx < rx + rw && _my >= ry && _my < ry + rh; }

function grassColor(col, row) {
  const h = ((col * 7 + row * 13) % 5);
  return `rgb(60, ${0x70 + h * 3}, 50)`;
}

// ── Camera ──

export function updateCamera(cam, player, dt, worldW, worldH, zoom) {
  const z = zoom || 1;
  const ww = worldW || WORLD_W;
  const wh = worldH || WORLD_H;
  const viewW = CANVAS_W / z;
  const viewH = VIEW_H / z;
  const tx = player.x - viewW / 2;
  const ty = player.y - viewH / 2;
  cam.x += (tx - cam.x) * Math.min(1, 6 * dt); // smooth follow
  cam.y += (ty - cam.y) * Math.min(1, 6 * dt);
  cam.x = clamp(cam.x, 0, Math.max(0, ww - viewW));
  cam.y = clamp(cam.y, 0, Math.max(0, wh - viewH));
}

export function snapCamera(cam, player, worldW, worldH, zoom) {
  const z = zoom || 1;
  const ww = worldW || WORLD_W;
  const wh = worldH || WORLD_H;
  const viewW = CANVAS_W / z;
  const viewH = VIEW_H / z;
  cam.x = clamp(player.x - viewW / 2, 0, Math.max(0, ww - viewW));
  cam.y = clamp(player.y - viewH / 2, 0, Math.max(0, wh - viewH));
}

// ── Main render ──

export function render(ctx, world, player, gs, planted, collection, lab, npcStates, cam, wilds, exhibits, registry) {
  _mx = gs._mouseX || 0; _my = gs._mouseY || 0;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  if (gs.phase === 'title') { drawTitle(ctx, gs); return; }
  if (gs.phase === 'intro') { drawIntro(ctx, gs); return; }
  if (gs.overlay === 'inventory') { drawInventoryOverlay(ctx, gs, player); return; }

  const zoom = gs.sandboxZoom || 1;
  const cx = cam.x, cy = cam.y;

  // Clip viewport (don't draw into HUD)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_W, VIEW_H);
  ctx.clip();

  // Apply zoom
  if (zoom !== 1) {
    ctx.scale(zoom, zoom);
  }

  drawTiles(ctx, world, cx, cy, gs.sandboxMode ? null : wilds, zoom);
  if (!gs.sandboxMode) {
    drawPropertyBorders(ctx, cx, cy);
    drawBuildings(ctx, collection, cx, cy, gs.dawkinsState);
    drawZoneSigns(ctx, cx, cy);
  }

  // World exhibits (curated permanent specimens — skip in sandbox)
  if (exhibits && !gs.sandboxMode) {
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (const ex of exhibits) {
      if (ex.col == null) continue;
      const sx = ex.col * TILE_SIZE - cx;
      const sy = ex.row * TILE_SIZE - cy;
      if (sx < -TILE_SIZE * 2 || sx > CANVAS_W + TILE_SIZE || sy < -TILE_SIZE * 2 || sy > VIEW_H + TILE_SIZE) continue;
      // Decorative plinth/border
      ctx.fillStyle = 'rgba(160,140,100,0.35)';
      ctx.fillRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.strokeStyle = 'rgba(200,180,140,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      // Draw the organism
      if (ex.organism) {
        ctx.drawImage(getSprite(ex.organism, TILE_SIZE - 8), sx + 4, sy + 4);
      }
      // Label below the plinth
      if (ex.label) {
        ctx.fillStyle = 'rgba(220,210,180,0.9)';
        ctx.fillText(ex.label, sx + TILE_SIZE / 2, sy + TILE_SIZE + 10);
      }
    }
    ctx.textAlign = 'left';
  }

  // Visible world-space viewport bounds (accounts for zoom)
  const viewW = CANVAS_W / zoom, viewH_z = VIEW_H / zoom;

  // NPC planted organisms (skip in sandbox)
  if (npcStates && !gs.sandboxMode) {
    for (const ns of npcStates) {
      for (const org of ns.planted) {
        if (org.tileCol == null) continue;
        const sx = org.tileCol * TILE_SIZE - cx + 2;
        const sy = org.tileRow * TILE_SIZE - cy + 2;
        if (sx > -TILE_SIZE && sx < viewW && sy > -TILE_SIZE && sy < viewH_z) {
          ctx.drawImage(getSprite(org, TILE_SIZE - 4), sx, sy);
        }
      }
    }
  }

  // Player planted organisms
  if (planted) {
    for (const org of planted) {
      if (org.tileCol == null) continue;
      const sx = org.tileCol * TILE_SIZE - cx + 2;
      const sy = org.tileRow * TILE_SIZE - cy + 2;
      if (sx > -TILE_SIZE && sx < viewW && sy > -TILE_SIZE && sy < viewH_z) {
        ctx.drawImage(getSprite(org, TILE_SIZE - 4), sx, sy);
        if (org.stage === 'mature') {
          const hasOffspring = org.offspring && org.offspring.length > 0;
          ctx.fillStyle = hasOffspring ? 'rgba(80,220,80,0.8)' : 'rgba(255,220,50,0.8)';
          ctx.beginPath();
          ctx.arc(sx + TILE_SIZE - 8, sy - 2 + 4, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Offspring phantoms (sandbox only)
  if (planted && gs.sandboxMode) {
    const pulse = 0.35 + 0.2 * Math.sin(performance.now() / 400);
    for (const org of planted) {
      if (!org.offspring) continue;
      for (const child of org.offspring) {
        const sx = child.col * TILE_SIZE - cx;
        const sy = child.row * TILE_SIZE - cy;
        if (sx < -TILE_SIZE || sx > viewW || sy < -TILE_SIZE || sy > viewH_z) continue;
        // Cyan ring
        ctx.strokeStyle = `rgba(0,220,240,${pulse + 0.15})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, TILE_SIZE / 2 - 2, 0, Math.PI * 2);
        ctx.stroke();
        // Semi-transparent sprite
        ctx.globalAlpha = pulse;
        ctx.drawImage(getSprite(child.organism, TILE_SIZE - 4), sx + 2, sy + 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Facing tile highlight
  if (!gs.overlay) {
    const ft = facingTile(player);
    if (ft.col >= 0 && ft.col < world[0].length && ft.row >= 0 && ft.row < world.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(ft.col * TILE_SIZE - cx + 2, ft.row * TILE_SIZE - cy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
  }

  // NPCs (skip in sandbox)
  if (npcStates && !gs.sandboxMode) drawNPCs(ctx, npcStates, cx, cy);

  // Player
  drawPlayer(ctx, player, cx, cy, gs);

  // Sandbox cursor highlight (drawn inside zoom transform so it aligns with tiles)
  if (gs.sandboxMode && !gs.overlay) {
    drawSandboxCursor(ctx, gs, cam.x, cam.y);
  }

  // Day/night tint (skip in sandbox)
  if (!gs.sandboxMode) drawDayNight(ctx, gs);

  ctx.restore(); // unclip

  // Tutorial speech bubble (above Sage, in world space — skip in sandbox)
  if (gs.currentTutorialSpeech && npcStates && !gs.sandboxMode) {
    const sageState = npcStates.find(s => s.id === 'sage');
    if (sageState) {
      drawSpeechBubble(ctx, gs.currentTutorialSpeech, sageState.x - cx, sageState.y - cy);
    }
  }

  // Follow mode narration bubble (above followed NPC, in world space)
  if (gs.followNarration && gs.followNpcIdx >= 0 && npcStates) {
    const followState = npcStates[gs.followNpcIdx];
    if (followState) {
      drawSpeechBubble(ctx, gs.followNarration.text, followState.x - cx, followState.y - cy);
    }
  }

  // Walk-target label
  if (gs.walkTarget && gs.walkTarget.label) {
    const wx = gs.walkTarget.x - cx, wy = gs.walkTarget.y - cy - 20;
    const label = `\u2192 ${gs.walkTarget.label}`;
    ctx.font = 'bold 10px monospace';
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(wx - lw / 2 - 4, wy - 7, lw + 8, 16);
    ctx.fillStyle = '#aad4ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, wx, wy);
  }

  // Prompts (above HUD, in world space — skip in sandbox)
  if (!gs.overlay && !gs.sandboxMode) {
    drawBuildingPrompt(ctx, player, collection, cx, cy);
    drawNPCPrompt(ctx, player, npcStates, cx, cy, gs);
  }

  // HUD (screen space)
  if (gs.sandboxMode) {
    drawSandboxHUD(ctx, gs, player);
  } else {
    drawHUD(ctx, gs, player, collection);
  }

  // Hover preview on planted biomorphs (sandbox, screen space)
  if (gs.sandboxMode && !gs.overlay) {
    drawHoverPreview(ctx, gs, planted, cam.x, cam.y);
  }

  // Command bar (above HUD)
  drawCommandBar(ctx, gs);

  // Overlays — swap player/lab for spectator actor/lab when spectating
  const overlayPlayer = gs.spectator ? gs.spectator.actor : player;
  const overlayLab = gs.spectator ? gs.spectator.lab : lab;
  if (gs.overlay === 'shop') drawShopOverlay(ctx, gs, overlayPlayer);
  if (gs.overlay === 'lab') drawLabOverlay(ctx, overlayLab || lab, overlayPlayer, gs);
  if (gs.overlay === 'museum') drawMuseumOverlay(ctx, collection, gs);
  if (gs.overlay === 'trade') drawTradeOverlay(ctx, gs, player, npcStates);
  if (gs.overlay === 'crafting') drawCraftingOverlay(ctx, gs, overlayPlayer);
  if (gs.overlay === 'dawkins') drawDawkinsOverlay(ctx, gs);
  if (gs.overlay === 'study-info') drawStudyInfoOverlay(ctx, gs, collection);
  if (gs.overlay === 'examine') drawExamineOverlay(ctx, gs);
  if (gs.overlay === 'exhibit') drawExhibitOverlay(ctx, gs);
  if (gs.overlay === 'gallery') drawGalleryOverlay(ctx, gs);
  if (gs.overlay === 'help') drawHelpOverlay(ctx);
  if (gs.overlay === 'codex') drawCodexOverlay(ctx, gs, registry);

  // Spectator banner (skip in sandbox)
  if (gs.spectator && !gs.sandboxMode) drawSpectatorBanner(ctx, gs);

  // Pause overlay (above everything)
  if (gs.paused) drawPauseOverlay(ctx);

  // Settings indicators (above overlays so they're visible)
  if (!gs.overlay || gs.overlay === 'dawkins') {
    drawSettingsIndicators(ctx, gs);
  }

  if (gs.message) {
    let lines = gs.message.lines || [gs.message.text];
    // Pulsing dots for AI thinking indicator
    if (gs.aiThinking && lines.length === 1 && lines[0] === 'Thinking...') {
      const dots = '.'.repeat(1 + Math.floor(Date.now() / 400) % 3);
      lines = ['Thinking' + dots];
    }
    drawMessage(ctx, lines);
  }
}

// ── Intro ──

function drawTitle(ctx, gs) {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c8e6c8';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.fillText('Biomorph Farm', CANVAS_W / 2, CANVAS_H / 2 - 100);

  ctx.fillStyle = '#8a9a7a';
  ctx.font = 'italic 14px Georgia, serif';
  ctx.fillText('Inspired by Richard Dawkins\' "The Evolution of Evolvability" (1988)', CANVAS_W / 2, CANVAS_H / 2 - 60);

  // Menu options
  const options = ['New Game'];
  if (gs.hasSave) options.push('Continue');
  const startY = CANVAS_H / 2 + 10;

  for (let i = 0; i < options.length; i++) {
    const y = startY + i * 44;
    const selected = i === gs.titleCursor;
    ctx.font = selected ? 'bold 20px monospace' : '18px monospace';
    ctx.fillStyle = selected ? '#fff' : '#666';
    const arrow = selected ? '\u25b6  ' : '   ';
    ctx.fillText(arrow + options[i], CANVAS_W / 2, y);
  }

  // Hint
  ctx.font = '11px monospace';
  ctx.fillStyle = '#555';
  ctx.fillText('[Up/Down] select   [Space] confirm', CANVAS_W / 2, CANVAS_H / 2 + 120);

  // Level picker submenu
  if (gs.titleSubmenu === 'level-pick') {
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c8e6c8'; ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText('Choose Level', CANVAS_W / 2, CANVAS_H / 2 - 90);

    const levels = [
      { label: '1. Canvas',    desc: 'Flat world, paint terrain, plant biomorphs freely' },
      { label: '2. World',     desc: 'Pre-built island, no NPCs, creative mode' },
      { label: '3. Populated', desc: 'Island with NPCs and shops, creative mode' },
      { label: '4. Adventure', desc: 'Full experience: intro, tutorial, earn gold' },
    ];
    for (let i = 0; i < levels.length; i++) {
      const y = CANVAS_H / 2 - 50 + i * 50;
      const sel = i === gs.titleModeCursor;
      ctx.font = sel ? 'bold 18px monospace' : '16px monospace';
      ctx.fillStyle = sel ? '#fff' : '#666';
      const arrow = sel ? '\u25b6  ' : '   ';
      ctx.fillText(arrow + levels[i].label, CANVAS_W / 2, y);
      ctx.font = '12px monospace';
      ctx.fillStyle = sel ? '#aaa' : '#444';
      ctx.fillText(levels[i].desc, CANVAS_W / 2, y + 22);
    }

    ctx.font = '11px monospace'; ctx.fillStyle = '#555';
    ctx.fillText('[Up/Down] select   [Space] confirm   [Esc] back', CANVAS_W / 2, CANVAS_H / 2 + 170);
  }

  // Sandbox continue/new submenu
  if (gs.titleSubmenu === 'sandbox-pick') {
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#60c0ff'; ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText('Sandbox Mode', CANVAS_W / 2, CANVAS_H / 2 - 70);

    const opts = [
      { label: 'Continue', desc: 'Resume your saved sandbox world' },
      { label: 'New World', desc: 'Start fresh with a blank canvas' },
    ];
    for (let i = 0; i < opts.length; i++) {
      const y = CANVAS_H / 2 - 10 + i * 56;
      const sel = i === (gs.titleSandboxCursor || 0);
      ctx.font = sel ? 'bold 18px monospace' : '16px monospace';
      ctx.fillStyle = sel ? '#fff' : '#666';
      const arrow = sel ? '\u25b6  ' : '   ';
      ctx.fillText(arrow + opts[i].label, CANVAS_W / 2, y);
      ctx.font = '12px monospace';
      ctx.fillStyle = sel ? '#aaa' : '#444';
      ctx.fillText(opts[i].desc, CANVAS_W / 2, y + 22);
    }

    ctx.font = '11px monospace'; ctx.fillStyle = '#555';
    ctx.fillText('[Up/Down] select   [Space] confirm   [Esc] back', CANVAS_W / 2, CANVAS_H / 2 + 120);
  }

  // What's New overlay
  if (gs.showWhatsNew) {
    drawWhatsNew(ctx);
  }
}

function drawWhatsNew(ctx) {
  const w = 500, h = 280;
  const x = (CANVAS_W - w) / 2, y = (CANVAS_H - h) / 2;

  // Backdrop
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a6a4a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // Header
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c8e6c8';
  ctx.font = 'bold 18px Georgia, serif';
  ctx.fillText("What's New — v10", CANVAS_W / 2, y + 30);

  // Bullet points
  ctx.textAlign = 'left';
  ctx.font = '13px monospace';
  ctx.fillStyle = '#aac8aa';
  const lines = [
    "Breeder Gallery: /gallery imports your saved specimens",
    "Creative Mode: infinite gold, plant anywhere, all access",
    "New Game lets you pick Survival or Creative",
    "Auto-generated names for all biomorphs",
    "/creative toggles mode on existing saves",
    "Import the same specimen multiple times as seeds",
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = '#6a9a6a';
    ctx.fillText('\u2022', x + 24, y + 70 + i * 28);
    ctx.fillStyle = '#aac8aa';
    ctx.fillText(lines[i], x + 40, y + 70 + i * 28);
  }

  // Dismiss hint
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(200,200,200,${0.4 + Math.sin(Date.now() / 500) * 0.3})`;
  ctx.font = '12px monospace';
  ctx.fillText('[Space] dismiss', CANVAS_W / 2, y + h - 20);
}

function drawIntro(ctx, gs) {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const pw = 560, ph = 340;
  const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2 - 20;
  const alpha = Math.min(1, gs.introFade);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#f5e6c8'; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#c4a87a'; ctx.lineWidth = 3; ctx.strokeRect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(180,150,100,0.3)';
  ctx.fillRect(px, py, pw, 4); ctx.fillRect(px, py + ph - 4, pw, 4);

  const pages = [
    ["An old letter, folded many times..."],
    ['"Dear friend,', '', "If you're reading this, it means my", 'research station on Biomorph Island', 'is finally in your hands."'],
    ['"For decades, I studied the creatures here \u2014', 'biomorphs, we call them. They grow from', 'seeds, shaped by invisible genes.', '', 'Each generation, they change. Sometimes', 'beautifully. Sometimes strangely.', 'Always surprisingly."'],
    ['"The farm is modest. The shop will buy', 'what you grow. The museum awaits your', "discoveries. And when you're ready, the", 'breeding lab will unlock possibilities', 'I only dreamed of."'],
    ['"Your neighbors Fern and Moss are good', "folk \u2014 they've been tending biomorphs", 'here for years. Watch what they grow.', "Trade with them. You'll learn a lot.\""],
    ['"Your task is simple:', 'grow, discover, evolve."', '', '', 'With great anticipation,', 'Professor R. Dawkins'],
  ];
  const page = Math.min(gs.introPage, pages.length - 1);
  const lines = pages[page];
  ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.font = (page === 0 || (page === 5 && i >= 4)) ? 'italic 16px Georgia, serif' : '15px Georgia, serif';
    ctx.fillText(lines[i], CANVAS_W / 2, py + 40 + i * 34);
  }
  ctx.fillStyle = '#8a7a5a'; ctx.font = '12px monospace';
  ctx.fillText(`${page + 1} / ${pages.length}`, CANVAS_W / 2, py + ph - 30);
  ctx.globalAlpha = 1;
  const isLast = page === pages.length - 1;
  ctx.fillStyle = `rgba(200,200,200,${0.4 + Math.sin(Date.now() / 500) * 0.3})`;
  ctx.font = '13px monospace';
  ctx.fillText(isLast ? '[Space] Begin your journey' : '[Space] Continue  \u00B7  [Esc] Skip', CANVAS_W / 2, py + ph + 30);
}

// ── Day/Night tint ──

function drawDayNight(ctx, gs) {
  const t = gs.dayTimer / gs.DAY_LENGTH; // 0..1
  // Dawn (0-0.15), Day (0.15-0.6), Dusk (0.6-0.8), Night (0.8-1.0)
  let alpha = 0, r = 0, g = 0, b = 20;
  if (t < 0.1) {
    // Dawn — orange tint fading
    alpha = 0.15 * (1 - t / 0.1);
    r = 80; g = 40; b = 10;
  } else if (t < 0.6) {
    alpha = 0; // full daylight
  } else if (t < 0.8) {
    // Dusk — warm then dark
    const d = (t - 0.6) / 0.2;
    alpha = d * 0.25;
    r = Math.floor(60 * (1 - d)); g = Math.floor(20 * (1 - d)); b = Math.floor(40 * d + 20);
  } else {
    // Night
    const n = (t - 0.8) / 0.2;
    alpha = 0.25 + n * 0.15;
    r = 0; g = 0; b = 30;
  }
  if (alpha > 0) {
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fillRect(0, 0, CANVAS_W, VIEW_H);
  }
}

// ── Tiles ──

function drawTiles(ctx, world, cx, cy, wilds, zoom) {
  const z = zoom || 1;
  const viewW = CANVAS_W / z, viewH_z = VIEW_H / z;
  const worldCols = world[0].length, worldRows = world.length;
  const startCol = Math.max(0, Math.floor(cx / TILE_SIZE));
  const endCol = Math.min(worldCols, Math.ceil((cx + viewW) / TILE_SIZE) + 1);
  const startRow = Math.max(0, Math.floor(cy / TILE_SIZE));
  const endRow = Math.min(worldRows, Math.ceil((cy + viewH_z) / TILE_SIZE) + 1);

  // Level-of-detail: skip decorative details when tiles are small on screen
  const screenTile = TILE_SIZE * z; // pixel size of a tile on screen
  const detailed = screenTile >= 24;  // full detail at ≥24px
  const minimal = screenTile < 12;    // bare minimum at <12px

  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const tile = world[row][col];
      const x = col * TILE_SIZE - cx, y = row * TILE_SIZE - cy;
      switch (tile) {
        case TILE.GRASS:
          ctx.fillStyle = grassColor(col, row);
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          if (detailed) {
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fillRect(x + ((col*3+row*7)%12)+6, y + ((col*11+row*5)%16)+4, 2, 4);
            ctx.fillRect(x + ((col*9+row*3)%20)+16, y + ((col*5+row*11)%20)+14, 2, 3);
          }
          break;
        case TILE.DIRT:
          ctx.fillStyle = '#7a6340';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          if (detailed) {
            ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
            for (let ly = 6; ly < TILE_SIZE; ly += 8) {
              ctx.beginPath(); ctx.moveTo(x+4, y+ly); ctx.lineTo(x+TILE_SIZE-4, y+ly); ctx.stroke();
            }
          }
          break;
        case TILE.PATH:
          ctx.fillStyle = '#c4a87a';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          if (detailed) {
            ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
            ctx.strokeRect(x+0.5, y+0.5, TILE_SIZE-1, TILE_SIZE-1);
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.beginPath();
            ctx.moveTo(x+TILE_SIZE/2, y); ctx.lineTo(x+TILE_SIZE/2, y+TILE_SIZE);
            ctx.moveTo(x, y+TILE_SIZE/2); ctx.lineTo(x+TILE_SIZE, y+TILE_SIZE/2);
            ctx.stroke();
          }
          break;
        case TILE.WATER:
          ctx.fillStyle = '#2a5a8a';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          if (detailed) {
            ctx.fillStyle = 'rgba(100,180,255,0.15)';
            const wx = (col*17+row*11)%20, wy = (col*7+row*19)%16;
            ctx.fillRect(x+wx+4, y+wy+6, 14, 2);
            ctx.fillRect(x+((wx+22)%30)+2, y+((wy+18)%28)+4, 10, 2);
          }
          break;
        case TILE.BUILDING:
          ctx.fillStyle = '#555';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          break;
        case TILE.FENCE: {
          ctx.fillStyle = grassColor(col, row);
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          if (minimal) {
            // Just a brown dot at very low zoom
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(x + 8, y + 8, TILE_SIZE - 16, TILE_SIZE - 16);
          } else {
            ctx.fillStyle = '#8B6914';
            ctx.fillRect(x + 6, y + 8, 6, TILE_SIZE - 12);
            ctx.fillRect(x + TILE_SIZE - 12, y + 8, 6, TILE_SIZE - 12);
            ctx.fillStyle = '#a07818';
            ctx.fillRect(x + 4, y + 14, TILE_SIZE - 8, 4);
            ctx.fillRect(x + 4, y + TILE_SIZE - 18, TILE_SIZE - 8, 4);
          }
          break;
        }
        case TILE.TREE: {
          ctx.fillStyle = grassColor(col, row);
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          if (minimal) {
            // Simple green square at very low zoom
            ctx.fillStyle = '#3a6a2a';
            ctx.fillRect(x + 8, y + 6, TILE_SIZE - 16, TILE_SIZE - 12);
          } else {
            const wildOrg = wilds && wilds.get(`${col},${row}`);
            if (wildOrg) {
              ctx.drawImage(getSprite(wildOrg, TILE_SIZE - 4), x + 2, y + 2);
            } else {
              ctx.fillStyle = '#6a5030';
              ctx.fillRect(x + 20, y + 28, 8, 18);
              ctx.fillStyle = '#3a6a2a';
              ctx.beginPath();
              ctx.arc(x + 24, y + 20, 16, 0, Math.PI * 2);
              ctx.fill();
              if (detailed) {
                ctx.fillStyle = '#4a7a3a';
                ctx.beginPath();
                ctx.arc(x + 20, y + 16, 10, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
          break;
        }
      }
      // Property tint overlay (skip at minimal zoom — too small to see)
      if (!minimal) {
        const owner = getOwner(col, row);
        if (owner) {
          const prop = PROPERTIES.find(p => p.id === owner);
          if (prop) {
            ctx.fillStyle = prop.tint;
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }
  }
}

// ── Property borders ──

function drawPropertyBorders(ctx, cx, cy) {
  for (const prop of PROPERTIES) {
    const b = prop.bounds;
    const x = b.minCol * TILE_SIZE - cx;
    const y = b.minRow * TILE_SIZE - cy;
    const w = (b.maxCol - b.minCol + 1) * TILE_SIZE;
    const h = (b.maxRow - b.minRow + 1) * TILE_SIZE;
    ctx.strokeStyle = prop.borderColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

// ── Buildings ──

function drawBuildings(ctx, collection, cx, cy, dawkinsState) {
  for (const b of BUILDINGS) {
    const bx = b.x * TILE_SIZE - cx, by = b.y * TILE_SIZE - cy;
    const bw = b.w * TILE_SIZE, bh = b.h * TILE_SIZE;
    if (bx + bw < 0 || bx > CANVAS_W || by + bh < 0 || by > VIEW_H) continue;
    ctx.fillStyle = b.color; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx, by, bw, 6);
    const dw = 14, dh = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    if (b.doorSide === 'bottom') ctx.fillRect(bx+bw/2-dw/2, by+bh-dh, dw, dh);
    else ctx.fillRect(bx+bw/2-dw/2, by, dw, dh);
    // Study gets shorter name to fit
    const displayName = b.id === 'study' ? 'Study' : b.name;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(displayName, bx+bw/2, by+bh/2);
    if (b.id === 'lab' && collection && !collection.labUnlocked) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#f66'; ctx.font = '12px monospace';
      ctx.fillText('LOCKED', bx+bw/2, by+bh/2+14);
    }
    // Dawkins visit-available indicator
    if (b.id === 'study' && dawkinsState && dawkinsState.completedVisits < 10) {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('!', bx + bw/2, by - 2);
    }
  }
}

// ── Zone Signs ──

function drawZoneSigns(ctx, cx, cy) {
  for (const sign of ZONE_SIGNS) {
    const sx = sign.col * TILE_SIZE - cx;
    const sy = sign.row * TILE_SIZE - cy;
    if (sx < -100 || sx > CANVAS_W + 100 || sy < -30 || sy > VIEW_H + 30) continue;

    // Small wooden sign post
    ctx.fillStyle = 'rgba(60,40,20,0.8)';
    const tw = ctx.measureText(sign.text).width || 80;
    ctx.font = 'bold 11px monospace';
    const textW = ctx.measureText(sign.text).width;
    ctx.fillStyle = 'rgba(60,40,20,0.85)';
    ctx.fillRect(sx - textW / 2 - 6, sy - 4, textW + 12, 18);
    ctx.strokeStyle = 'rgba(100,80,50,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - textW / 2 - 6, sy - 4, textW + 12, 18);

    ctx.fillStyle = '#e8d8b8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sign.text, sx, sy + 5);
  }
}

// ── NPCs ──

function drawNPCs(ctx, npcStates, cx, cy) {
  for (let i = 0; i < npcStates.length; i++) {
    const s = npcStates[i]; const npc = NPCS[i];
    const size = 24, half = size / 2;
    const sx = s.x - cx, sy = s.y - cy;
    if (sx < -30 || sx > CANVAS_W + 30 || sy < -30 || sy > VIEW_H + 30) continue;
    const x = sx - half, y = sy - half;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(sx, sy+half+2, half*0.7, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = npc.color; ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = npc.accent; ctx.lineWidth = 2; ctx.strokeRect(x, y, size, size);
    // Eyes
    ctx.fillStyle = '#222'; const ec = 3;
    switch (s.facing) {
      case 'down':  ctx.fillRect(sx-ec-1,sy+1,3,3); ctx.fillRect(sx+ec-1,sy+1,3,3); break;
      case 'up':    ctx.fillRect(sx-ec-1,sy-4,3,3); ctx.fillRect(sx+ec-1,sy-4,3,3); break;
      case 'left':  ctx.fillRect(sx-5,sy-ec,3,3); ctx.fillRect(sx-5,sy+ec,3,3); break;
      case 'right': ctx.fillRect(sx+3,sy-ec,3,3); ctx.fillRect(sx+3,sy+ec,3,3); break;
    }
    // Name tag with wallet
    ctx.font = '9px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const nameStr = s.wallet > 0 ? `${npc.name} ${s.wallet}g` : npc.name;
    const nw = ctx.measureText(nameStr).width;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(sx-nw/2-3, y-14, nw+6, 13);
    ctx.fillStyle = npc.color; ctx.fillText(npc.name, sx - (s.wallet > 0 ? ctx.measureText(` ${s.wallet}g`).width/2 : 0), y-3);
    if (s.wallet > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.fillText(` ${s.wallet}g`, sx + ctx.measureText(npc.name).width/2, y-3);
    }
    // Task indicator
    const taskLabel = getTaskLabel(s.task);
    if (taskLabel) {
      const arrow = `\u2192 ${taskLabel}`;
      const tw = ctx.measureText(arrow).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx-tw/2-3, y-26, tw+6, 12);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'bottom';
      ctx.fillText(arrow, sx, y-15);
    }
  }
}

function drawNPCPrompt(ctx, player, npcStates, cx, cy, gs) {
  if (!npcStates) return;
  for (let i = 0; i < npcStates.length; i++) {
    const s = npcStates[i]; const npc = NPCS[i];
    // Skip prompts for the NPC we're currently following (HUD already shows controls)
    if (gs && gs.followNpcIdx === i) continue;

    const dist = Math.hypot(player.x - s.x, player.y - s.y);
    if (dist < TILE_SIZE * 2.5) {
      const tx = s.x - cx;
      let ty = s.y - cy - 30;

      // Main interaction prompt (Space)
      if (dist < TILE_SIZE * 1.8) {
        const label = npc.role === 'farmer' && s.inventory.length > 0 ? `Trade with ${npc.name}` : `Talk to ${npc.name}`;
        const text = `[Space] ${label}`;
        ctx.font = 'bold 10px monospace'; const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(tx-tw/2-5, ty-8, tw+10, 18);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, tx, ty);
        ty -= 20;
      }

      // Follow prompt (Q) — farmers only, not already following anyone
      if (npc.role === 'farmer' && gs && gs.followNpcIdx < 0) {
        const followText = `[Q] Follow ${npc.name}`;
        ctx.font = 'bold 10px monospace'; const fw = ctx.measureText(followText).width;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(tx-fw/2-5, ty-8, fw+10, 18);
        ctx.fillStyle = '#aad4ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(followText, tx, ty);
      }
    }
  }
}

// ── Player ──

function drawPlayer(ctx, p, cx, cy, gs) {
  const size = 28, half = size / 2;
  const sx = p.x - cx, sy = p.y - cy;
  const x = sx - half, y = sy - half;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(sx, sy+half+2, half*0.8, 4, 0, 0, Math.PI*2); ctx.fill();
  // Dance spin
  const spinning = gs && gs.playerSpin > 0;
  if (spinning) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(gs.playerSpin * Math.PI * 4);
    ctx.translate(-sx, -sy);
  }
  ctx.fillStyle = '#e8c170'; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#b8914a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, size, size);
  ctx.fillStyle = '#d44'; ctx.beginPath();
  switch (p.facing) {
    case 'up':    ctx.moveTo(sx,y-4); ctx.lineTo(sx-5,y+2); ctx.lineTo(sx+5,y+2); break;
    case 'down':  ctx.moveTo(sx,y+size+4); ctx.lineTo(sx-5,y+size-2); ctx.lineTo(sx+5,y+size-2); break;
    case 'left':  ctx.moveTo(x-4,sy); ctx.lineTo(x+2,sy-5); ctx.lineTo(x+2,sy+5); break;
    case 'right': ctx.moveTo(x+size+4,sy); ctx.lineTo(x+size-2,sy-5); ctx.lineTo(x+size-2,sy+5); break;
  }
  ctx.closePath(); ctx.fill();
  if (spinning) ctx.restore();
}

// ── Building prompt ──

function drawBuildingPrompt(ctx, player, collection, cx, cy) {
  for (const b of BUILDINGS) {
    const bcx = (b.x + b.w/2) * TILE_SIZE, bcy = (b.y + b.h/2) * TILE_SIZE;
    if (Math.hypot(player.x - bcx, player.y - bcy) < TILE_SIZE * 2.5) {
      let label = b.name;
      if (b.id === 'lab' && collection && !collection.labUnlocked) label = 'Lab (Locked)';
      if (b.id === 'house') label = 'Craft';
      if (b.id === 'study') label = "Dawkins' Study";
      if (b.id === 'fern_house') label = "Fern's Cottage";
      if (b.id === 'moss_house') label = "Moss's Cottage";
      const text = (b.id === 'fern_house' || b.id === 'moss_house') ? label : `[Space] ${label}`;
      const tx = bcx - cx, ty = b.y * TILE_SIZE - cy - 12;
      ctx.font = 'bold 11px monospace'; const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(tx-tw/2-6, ty-9, tw+12, 20);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, tx, ty);
    }
  }
}

// ── HUD ──

function drawHUD(ctx, gs, player, collection) {
  ctx.fillStyle = '#12122a'; ctx.fillRect(0, HUD_Y, CANVAS_W, TILE_SIZE);
  ctx.fillStyle = '#2a2a4a'; ctx.fillRect(0, HUD_Y, CANVAS_W, 2);
  const midY = HUD_Y + TILE_SIZE / 2;

  // Day + bar
  ctx.fillStyle = '#ccc'; ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`Day ${gs.day}`, 8, midY - 10);
  ctx.fillStyle = '#2a2a3a'; ctx.fillRect(8, midY+2, 50, 5);
  ctx.fillStyle = '#e8b030'; ctx.fillRect(8, midY+2, 50*(gs.dayTimer/gs.DAY_LENGTH), 5);
  // Time-skip indicator
  if (gs.timeSkip) {
    ctx.fillStyle = '#ffa'; ctx.font = 'bold 9px monospace';
    ctx.fillText('>>>', 62, midY + 2);
  }
  // Creative mode badge
  if (gs.creativeMode) {
    ctx.fillStyle = '#ff69b4'; ctx.font = 'bold 9px monospace';
    ctx.fillText('CREATIVE', 8, HUD_Y + TILE_SIZE - 18);
  }

  // Wallet
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 16px monospace';
  ctx.fillText(`${player.wallet}g`, 68, midY);

  // Inventory
  const inv = player.inventory;
  const maxSlots = 9;
  const totalW = maxSlots * (INV_SLOT + 2);
  const slotX0 = (CANVAS_W - totalW) / 2;
  const slotY = HUD_Y + 5;
  for (let i = 0; i < maxSlots; i++) {
    const sx = slotX0 + i * (INV_SLOT + 2);
    const sel = i === player.selectedSlot;
    ctx.fillStyle = sel ? 'rgba(255,220,50,0.15)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(sx, slotY, INV_SLOT, INV_SLOT);
    ctx.strokeStyle = sel ? '#ffd700' : '#3a3a5a';
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(sx, slotY, INV_SLOT, INV_SLOT);
    ctx.fillStyle = sel ? '#ffd700' : '#555';
    ctx.font = '8px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(String(i + 1), sx + 2, slotY + 1);
    if (i < inv.length) {
      const item = inv[i];
      if (item.kind === 'material') {
        drawMaterialSlot(ctx, item, sx, slotY, INV_SLOT);
      } else if (item.kind === 'tool') {
        drawToolSlot(ctx, item, sx, slotY, INV_SLOT);
      } else if (item.kind === 'product') {
        drawProductSlot(ctx, item, sx, slotY, INV_SLOT);
      } else {
        ctx.drawImage(getSprite(item, 28), sx + 5, slotY + 7);
      }
    }
  }

  // Selected item info
  if (player.selectedSlot < inv.length) {
    const item = inv[player.selectedSlot];
    if (item.kind === 'material') {
      drawMaterialHUDInfo(ctx, item, midY);
    } else if (item.kind === 'tool') {
      drawToolHUDInfo(ctx, item, midY);
    } else if (item.kind === 'product') {
      drawProductHUDInfo(ctx, item, midY);
    } else {
      const fg = item.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#aaa'; ctx.font = '11px monospace';
      const hudLabel = item.nickname ? `"${item.nickname}"` : `M${item.mode} D${item.genes[8]}`;
      ctx.fillText(hudLabel, CANVAS_W - 100, midY - 12);
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 11px monospace';
      ctx.fillText(`~${sellPrice(item)}g`, CANVAS_W - 100, midY + 1);
      ctx.fillStyle = '#888'; ctx.font = '10px monospace';
      ctx.fillText(item.stage, CANVAS_W - 100, midY + 13);
      ctx.fillStyle = '#7c7'; ctx.font = '10px monospace';
      ctx.fillText(`F${fg.fertility} L${fg.longevity} V${fg.vigor}`, CANVAS_W - 10, midY - 12);
      ctx.fillStyle = '#666'; ctx.font = '9px monospace';
      ctx.fillText(farmLabel(fg), CANVAS_W - 10, midY + 1);
      ctx.fillStyle = '#555'; ctx.font = '9px monospace';
      ctx.fillText('[I] inventory', CANVAS_W - 10, midY + 13);
    }
  } else {
    ctx.fillStyle = '#444'; ctx.font = '10px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('empty', CANVAS_W - 10, midY);
  }

  if (collection && collection.discovered.size > 0) {
    ctx.fillStyle = '#6af'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`${collection.discovered.size} spp`, 8, midY + 14);
  }

  // Zoom indicator (show when not default 1x)
  const zoom = gs.sandboxZoom || 1;
  if (zoom !== 1) {
    ctx.fillStyle = '#60c0ff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${zoom}x`, CANVAS_W / 2, HUD_Y + TILE_SIZE - 8);
  }

  // Help / Pause hints
  ctx.fillStyle = '#555'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
  ctx.fillText('[H] Help  [P] Pause  [+/-] Zoom', 8, HUD_Y + TILE_SIZE - 8);
}

function drawSandboxCursor(ctx, gs, cx, cy) {
  if (gs._mouseX == null) return;
  const zoom = gs.sandboxZoom || 1;
  const col = Math.floor((gs._mouseX / zoom + cx) / TILE_SIZE);
  const row = Math.floor((gs._mouseY / zoom + cy) / TILE_SIZE);
  if (col < 0 || row < 0) return;
  const x = col * TILE_SIZE - cx;
  const y = row * TILE_SIZE - cy;
  if (gs.sandboxTool >= 0) {
    ctx.strokeStyle = SANDBOX_PALETTE_COLORS[gs.sandboxTool] || '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  } else {
    ctx.strokeStyle = '#60ff90';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }
}

const SANDBOX_PALETTE_COLORS = ['#4a7a3a', '#7a6340', '#c4a87a', '#2a5a8a', '#555', '#3a6a2a', '#8B6914'];
const SANDBOX_PALETTE_LABELS = ['Grass', 'Soil', 'Path', 'Water', 'Stone', 'Tree', 'Fence'];

function drawSandboxSidebar(ctx, gs) {
  const SB_X = 8, SB_Y = 40, SB_W = 114, SB_ROW_H = 36;
  const totalRows = 8; // 7 terrain + 1 biomorph brush + gap
  const SB_H = 8 + totalRows * SB_ROW_H + 16;
  const mx = gs._mouseX || 0, my = gs._mouseY || 0;

  // Background
  ctx.fillStyle = 'rgba(18,18,42,0.85)';
  ctx.beginPath();
  ctx.roundRect(SB_X, SB_Y, SB_W, SB_H, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,100,140,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(SB_X, SB_Y, SB_W, SB_H, 6);
  ctx.stroke();

  // Terrain tools
  for (let i = 0; i < 7; i++) {
    const y = SB_Y + 8 + i * SB_ROW_H;
    const sel = gs.sandboxTool === i;
    const hov = !sel && mx >= SB_X && mx < SB_X + SB_W && my >= y && my < y + SB_ROW_H - 2;

    // Row background
    if (sel) {
      ctx.fillStyle = 'rgba(255,220,50,0.15)';
      ctx.fillRect(SB_X + 4, y, SB_W - 8, SB_ROW_H - 2);
    } else if (hov) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(SB_X + 4, y, SB_W - 8, SB_ROW_H - 2);
    }

    // Color swatch
    ctx.fillStyle = SANDBOX_PALETTE_COLORS[i];
    ctx.fillRect(SB_X + 10, y + 6, 22, 22);
    ctx.strokeStyle = sel ? '#ffd700' : '#3a3a5a';
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(SB_X + 10, y + 6, 22, 22);

    // Label
    ctx.fillStyle = sel ? '#ffd700' : hov ? '#ccc' : '#999';
    ctx.font = sel ? 'bold 11px monospace' : '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(SANDBOX_PALETTE_LABELS[i], SB_X + 38, y + 21);

    // Shortcut
    ctx.fillStyle = sel ? '#ffd700' : '#555';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(i + 1), SB_X + SB_W - 10, y + 21);
  }

  // Biomorph brush button
  const bY = SB_Y + 8 + 7 * SB_ROW_H + 8;
  const bSel = gs.sandboxTool === -1;
  const bHov = !bSel && mx >= SB_X && mx < SB_X + SB_W && my >= bY && my < bY + SB_ROW_H - 2;

  if (bSel) {
    ctx.fillStyle = 'rgba(96,255,144,0.15)';
    ctx.fillRect(SB_X + 4, bY, SB_W - 8, SB_ROW_H - 2);
  } else if (bHov) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(SB_X + 4, bY, SB_W - 8, SB_ROW_H - 2);
  }

  // Biomorph icon (small diamond)
  ctx.fillStyle = bSel ? '#60ff90' : '#4a8a5a';
  ctx.beginPath();
  ctx.moveTo(SB_X + 21, bY + 6);
  ctx.lineTo(SB_X + 32, bY + 17);
  ctx.lineTo(SB_X + 21, bY + 28);
  ctx.lineTo(SB_X + 10, bY + 17);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = bSel ? '#60ff90' : bHov ? '#ccc' : '#999';
  ctx.font = bSel ? 'bold 10px monospace' : '10px monospace';
  ctx.textAlign = 'left';
  const bLabel = gs.sandboxBiomorph ? (gs.sandboxBiomorph.name || 'Biomorph').slice(0, 8) : 'Biomorph';
  ctx.fillText(bLabel, SB_X + 38, bY + 17);

  ctx.fillStyle = bSel ? '#60ff90' : '#555';
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('I', SB_X + SB_W - 10, bY + 17);

  // Preview panel (when a biomorph is selected)
  if (gs.sandboxBiomorph) {
    const pY = bY + SB_ROW_H + 8;
    const pW = SB_W;
    const pH = 170;

    // Background
    ctx.fillStyle = 'rgba(18,18,42,0.85)';
    ctx.beginPath();
    ctx.roundRect(SB_X, pY, pW, pH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,100,140,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(SB_X, pY, pW, pH, 6);
    ctx.stroke();

    // Sprite preview (100px centered)
    const spec = gs.sandboxBiomorph;
    const spriteSize = 100;
    const tmpOrg = {
      genes: spec.genes,
      mode: spec.mode,
      colorGenes: spec.colorGenes || { hue: 0, spread: 3 },
      symmetry: spec.symmetry || 'left-right',
    };
    ctx.drawImage(getSprite(tmpOrg, spriteSize), SB_X + (pW - spriteSize) / 2, pY + 4);

    // Name
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const displayName = (spec.name || 'Unnamed').slice(0, 14);
    ctx.fillText(displayName, SB_X + pW / 2, pY + spriteSize + 12);

    // Mode/depth
    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.fillText(`Mode ${spec.mode}  Depth ${spec.genes[8]}`, SB_X + pW / 2, pY + spriteSize + 24);

    // Palette counter
    const palette = gs.sandboxPalette || [];
    if (palette.length > 0) {
      const idx = (gs.sandboxPaletteIdx || 0) + 1;
      ctx.fillStyle = '#666';
      ctx.fillText(`${idx} / ${palette.length}`, SB_X + pW / 2, pY + spriteSize + 36);
    }

    // Scroll hint
    ctx.fillStyle = '#555';
    ctx.font = '8px monospace';
    ctx.fillText('\u2195 Scroll to browse', SB_X + pW / 2, pY + pH - 6);
  }
}

function drawHoverPreview(ctx, gs, planted, cx, cy) {
  if (!gs._mouseX && gs._mouseX !== 0) return;
  const zoom = gs.sandboxZoom || 1;
  const mx = gs._mouseX, my = gs._mouseY;
  // Skip if mouse is over sidebar or HUD
  if (mx < 140 && my >= 40) return;
  if (my >= VIEW_H) return;

  const col = Math.floor((mx / zoom + cx) / TILE_SIZE);
  const row = Math.floor((my / zoom + cy) / TILE_SIZE);

  // Find organism at this tile (parent or offspring)
  let org = null;
  for (const p of planted) {
    if (p.tileCol === col && p.tileRow === row) { org = p; break; }
    if (p.offspring) {
      for (const c of p.offspring) {
        if (c.col === col && c.row === row) { org = c.organism || p; break; }
      }
      if (org) break;
    }
  }
  if (!org) return;

  // Tooltip dimensions
  const TW = 150, spriteSize = 110;
  const name = org.nickname || org.name || 'Biomorph';
  const modeLine = `Mode ${org.mode}  Depth ${org.genes[8]}`;
  const TH = spriteSize + 44;

  // Position near mouse, clamped on-screen
  let tx = mx + 16, ty = my - TH / 2;
  if (tx + TW > CANVAS_W - 4) tx = mx - TW - 16;
  if (ty < 4) ty = 4;
  if (ty + TH > VIEW_H - 4) ty = VIEW_H - TH - 4;

  // Background
  ctx.fillStyle = 'rgba(12,12,36,0.92)';
  ctx.beginPath();
  ctx.roundRect(tx, ty, TW, TH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96,255,144,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tx, ty, TW, TH, 8);
  ctx.stroke();

  // Sprite
  const tmpOrg = {
    genes: org.genes,
    mode: org.mode,
    colorGenes: org.colorGenes || { hue: 0, spread: 3 },
    symmetry: org.symmetry || 'left-right',
  };
  ctx.drawImage(getSprite(tmpOrg, spriteSize), tx + (TW - spriteSize) / 2, ty + 4);

  // Name
  ctx.fillStyle = '#ddd';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name.slice(0, 18), tx + TW / 2, ty + spriteSize + 16);

  // Mode/depth
  ctx.fillStyle = '#888';
  ctx.font = '9px monospace';
  ctx.fillText(modeLine, tx + TW / 2, ty + spriteSize + 30);
}

function drawSandboxHUD(ctx, gs, player) {
  ctx.fillStyle = '#12122a'; ctx.fillRect(0, HUD_Y, CANVAS_W, TILE_SIZE);
  ctx.fillStyle = '#2a2a4a'; ctx.fillRect(0, HUD_Y, CANVAS_W, 2);

  // SANDBOX badge
  ctx.fillStyle = '#60c0ff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
  ctx.fillText('SANDBOX', 8, HUD_Y + 12);

  // Player position
  const col = Math.floor(player.x / TILE_SIZE);
  const row = Math.floor(player.y / TILE_SIZE);
  ctx.fillStyle = '#888'; ctx.font = '10px monospace';
  ctx.fillText(`(${col}, ${row})`, 8, HUD_Y + TILE_SIZE - 10);

  // Zoom indicator
  const zoom = gs.sandboxZoom || 1;
  ctx.fillStyle = zoom !== 1 ? '#60c0ff' : '#555';
  ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`${zoom}x`, CANVAS_W / 2, HUD_Y + 14);

  // Current tool label
  ctx.fillStyle = '#ccc'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  if (gs.sandboxTool >= 0) {
    ctx.fillText(SANDBOX_PALETTE_LABELS[gs.sandboxTool], CANVAS_W / 2, HUD_Y + TILE_SIZE - 10);
  } else if (gs.sandboxTool === -1 && gs.sandboxBiomorph) {
    ctx.fillStyle = '#60ff90';
    ctx.fillText('Biomorph: ' + (gs.sandboxBiomorph.name || 'unnamed'), CANVAS_W / 2, HUD_Y + TILE_SIZE - 10);
  }

  // Hints
  ctx.fillStyle = '#555'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
  ctx.fillText('[E] Examine  [+/-] Zoom  [/zoom] Set  [Cmd+Z] Undo', CANVAS_W - 10, HUD_Y + TILE_SIZE - 6);

  // Draw sidebar (screen space, above HUD)
  drawSandboxSidebar(ctx, gs);
}

// Draw a material item in a HUD slot
function drawMaterialSlot(ctx, item, sx, sy, size) {
  const mt = MATERIAL_TYPES[item.materialType];
  if (!mt) return;
  // Colored background square
  ctx.fillStyle = mt.color;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(sx + 4, sy + 6, size - 8, size - 12);
  ctx.globalAlpha = 1;
  // Icon letter
  ctx.fillStyle = mt.color;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(mt.icon, sx + size / 2, sy + size / 2 - 1);
  // Quantity
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(String(item.quantity), sx + size - 3, sy + size - 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
}

// Draw material info in the right side of HUD
function drawMaterialHUDInfo(ctx, item, midY) {
  const mt = MATERIAL_TYPES[item.materialType];
  if (!mt) return;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle = mt.color; ctx.font = 'bold 11px monospace';
  ctx.fillText(`${mt.name} x${item.quantity}`, CANVAS_W - 100, midY - 12);
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 11px monospace';
  ctx.fillText(`~${sellPrice(item)}g`, CANVAS_W - 100, midY + 1);
  ctx.fillStyle = '#888'; ctx.font = '9px monospace';
  ctx.fillText(`H:${item.sourceHardness} F:${item.sourceFlexibility}`, CANVAS_W - 10, midY - 12);
  ctx.fillStyle = '#555'; ctx.font = '9px monospace';
  ctx.fillText('[I] inventory', CANVAS_W - 10, midY + 13);
}

// ── Inventory overlay ──

function drawInventoryOverlay(ctx, gs, player) {
  ctx.fillStyle = '#0a0a18'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const ox = 60, oy = 40, ow = 840, oh = 680;
  ctx.fillStyle = '#14142a'; ctx.fillRect(ox, oy, ow, oh);
  ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, ow, oh);
  // Title bar
  ctx.fillStyle = '#1e1e3e'; ctx.fillRect(ox, oy, ow, 38);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Inventory', ox + ow/2, oy + 19);
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'right';
  ctx.fillText(`${player.wallet}g`, ox + ow - 14, oy + 19);

  // Grid on left
  const gridX = ox + 24, gridY = oy + 58;
  const CELL = 68, cols = 3;
  const specColor = gs.spectator ? gs.spectator.npcColor : null;
  drawItemCells(ctx, player.inventory, 9, cols, CELL, gridX, gridY, player.selectedSlot, true, specColor);

  // Detail panel on right
  const detX = gridX + cols * (CELL + 4) + 24;
  const detY = oy + 56;
  const detW = ox + ow - detX - 20;
  const detH = oh - 100;
  ctx.fillStyle = '#0e0e1e'; ctx.fillRect(detX, detY, detW, detH);
  ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1; ctx.strokeRect(detX, detY, detW, detH);

  if (player.selectedSlot < player.inventory.length) {
    const item = player.inventory[player.selectedSlot];
    if (item.kind === 'material') {
      drawMaterialDetail(ctx, item, detX, detY, detW, detH);
    } else if (item.kind === 'tool') {
      drawToolDetail(ctx, item, detX, detY, detW, detH);
    } else if (item.kind === 'product') {
      drawProductDetail(ctx, item, detX, detY, detW, detH);
    } else {
      drawOrganismDetail(ctx, item, detX, detY, detW, detH);
    }
  } else {
    ctx.fillStyle = '#444'; ctx.font = '14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(player.inventory.length === 0 ? 'Inventory empty' : 'Select an item', detX + detW/2, detY + detH/2);
  }
  // Footer
  ctx.fillStyle = '#555'; ctx.font = '11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(spectatorFooter(gs) || '[Arrows] navigate  [Esc] close', ox + ow/2, oy + oh - 10);
}

// Draw organism detail in inventory overlay
function drawOrganismDetail(ctx, item, detX, detY, detW, detH) {
  const fg = item.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
  // Large sprite
  const spriteSize = Math.min(180, detW - 40);
  ctx.drawImage(getSprite(item, spriteSize), detX + (detW - spriteSize) / 2, detY + 12);
  let iy = detY + spriteSize + 24;
  // Title
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const title = item.nickname ? `"${item.nickname}" (M${item.mode})` : `Mode ${item.mode} Biomorph`;
  ctx.fillText(title, detX + detW/2, iy); iy += 24;
  ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
  ctx.fillText(`Depth ${item.genes[8]}  \u2022  ${item.stage}`, detX + detW/2, iy); iy += 26;
  // Farm traits
  ctx.textAlign = 'left';
  const traitX = detX + 16;
  ctx.fillStyle = '#7c7'; ctx.font = '12px monospace';
  ctx.fillText(`Fertility: ${fg.fertility}  (${fg.fertility === 1 ? 'rare' : fg.fertility >= 3 ? 'abundant' : 'normal'})`, traitX, iy); iy += 18;
  ctx.fillText(`Longevity: ${fg.longevity}  (${fg.longevity === 1 ? 'annual' : fg.longevity === 3 ? 'perennial' : 'biennial'})`, traitX, iy); iy += 18;
  ctx.fillText(`Vigor: ${fg.vigor}  (${fg.vigor === 1 ? 'slow' : fg.vigor === 3 ? 'fast' : 'normal'})`, traitX, iy); iy += 22;
  // Color
  ctx.fillStyle = '#888';
  ctx.fillText(`Hue: ${item.colorGenes?.hue ?? '?'}  Spread: ${item.colorGenes?.spread ?? '?'}`, traitX, iy); iy += 22;
  // Yields preview
  const analysis = analyzeBiomorph(item.genes);
  ctx.fillStyle = '#b8a040'; ctx.font = 'bold 11px monospace';
  ctx.fillText('Yields:', traitX, iy); iy += 16;
  ctx.font = '11px monospace';
  const yields = [];
  if (analysis.wood > 0) yields.push(`${analysis.wood} wood`);
  if (analysis.fiber > 0) yields.push(`${analysis.fiber} fiber`);
  if (analysis.fruit > 0) yields.push(`${analysis.fruit} fruit`);
  if (analysis.resin > 0) yields.push(`${analysis.resin} resin`);
  ctx.fillStyle = '#998';
  ctx.fillText(yields.length > 0 ? yields.join(', ') : 'none', traitX, iy); iy += 16;
  ctx.fillStyle = '#776'; ctx.font = '9px monospace';
  ctx.fillText(`hardness: ${analysis.hardness}  flex: ${analysis.flexibility}`, traitX, iy); iy += 20;
  // Genes
  ctx.fillStyle = '#666'; ctx.font = '10px monospace';
  const geneStr = item.genes.slice(0, 9).map((g, i) => `g${i+1}:${g}`).join(' ');
  ctx.fillText(geneStr, traitX, iy); iy += 22;
  // Value
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 16px monospace';
  ctx.fillText(`~${sellPrice(item)}g`, traitX, iy);
  ctx.fillStyle = '#888'; ctx.font = '11px monospace';
  ctx.fillText(`  (buy: ${buyPrice(item)}g)`, traitX + 90, iy + 2);
}

// Draw material detail in inventory overlay
function drawMaterialDetail(ctx, item, detX, detY, detW, detH) {
  const mt = MATERIAL_TYPES[item.materialType];
  if (!mt) return;

  // Large icon
  ctx.fillStyle = mt.color;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(detX + detW/2 - 60, detY + 20, 120, 120);
  ctx.globalAlpha = 1;
  ctx.fillStyle = mt.color;
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(mt.icon, detX + detW/2, detY + 80);

  let iy = detY + 160;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`${mt.name} x${item.quantity}`, detX + detW/2, iy); iy += 30;

  ctx.textAlign = 'left';
  const traitX = detX + 16;
  ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
  ctx.fillText(`Hardness: ${item.sourceHardness}`, traitX, iy); iy += 20;
  ctx.fillText(`Flexibility: ${item.sourceFlexibility}`, traitX, iy); iy += 30;

  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 18px monospace';
  ctx.fillText(`~${sellPrice(item)}g`, traitX, iy);
}

// ── Item Grid Helper ──

function drawItemCells(ctx, items, maxSlots, cols, cellSize, x, y, selectedIdx, isActive, highlightColor) {
  const hc = highlightColor || '#ffd700';
  // Build a faint version for background highlight
  const hcFaint = highlightColor
    ? highlightColor + '1f' // ~12% opacity hex suffix
    : 'rgba(255,220,50,0.12)';
  for (let i = 0; i < maxSlots; i++) {
    const gc = i % cols, gr = Math.floor(i / cols);
    const cx = x + gc * (cellSize + 4);
    const cy = y + gr * (cellSize + 4);
    const sel = i === selectedIdx;
    const hov = !sel && i < items.length && _hitRect(cx, cy, cellSize, cellSize);
    ctx.fillStyle = sel && isActive ? hcFaint : hov ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(cx, cy, cellSize, cellSize);
    ctx.strokeStyle = sel && isActive ? hc : hov ? '#555' : '#2a2a3a';
    ctx.lineWidth = sel && isActive ? 2 : 1;
    ctx.strokeRect(cx, cy, cellSize, cellSize);
    ctx.fillStyle = '#444'; ctx.font = '9px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(String(i + 1), cx + 3, cy + 2);
    if (i < items.length) {
      const item = items[i];
      if (item.kind === 'material') {
        drawMaterialSlot(ctx, item, cx, cy, cellSize);
      } else if (item.kind === 'tool') {
        drawToolSlot(ctx, item, cx, cy, cellSize);
      } else if (item.kind === 'product') {
        drawProductSlot(ctx, item, cx, cy, cellSize);
      } else {
        const spriteSize = cellSize - 20;
        ctx.drawImage(getSprite(item, spriteSize), cx + 10, cy + 4);
      }
      ctx.fillStyle = '#aaa'; ctx.font = '9px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${sellPrice(item)}g`, cx + cellSize/2, cy + cellSize - 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
  }
}

// ── Shop ──

function drawShopOverlay(ctx, gs, player) {
  overlayBg(ctx);
  const ox = 50, oy = 50, ow = 860, oh = 640;
  drawPanel(ctx, ox, oy, ow, oh, "Chip's Shop");
  // Wallet
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(`${player.wallet}g`, ox + ow - 14, oy + 17);

  const midX = ox + ow / 2;
  const panelTop = oy + 48;
  const CELL = 68, cols = 3;
  const side = gs.shopSide || 0;

  // Left: FOR SALE
  ctx.fillStyle = side === 0 ? '#ffd700' : '#888';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(side === 0 ? '\u25B8 FOR SALE' : '  FOR SALE', ox + 24, panelTop);
  const shopGridX = ox + 34, shopGridY = panelTop + 24;
  const specColor = gs.spectator ? gs.spectator.npcColor : null;
  drawItemCells(ctx, gs.shopStock, Math.max(gs.shopStock.length, 3), cols, CELL,
    shopGridX, shopGridY, side === 0 ? gs.shopCursor : -1, side === 0, specColor);

  // Right: YOUR ITEMS
  ctx.fillStyle = side === 1 ? '#ffd700' : '#888';
  ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
  ctx.fillText(side === 1 ? '\u25B8 YOUR ITEMS' : '  YOUR ITEMS', midX + 24, panelTop);
  const invGridX = midX + 34, invGridY = panelTop + 24;
  drawItemCells(ctx, player.inventory, 9, cols, CELL,
    invGridX, invGridY, side === 1 ? gs.shopCursor : -1, side === 1, specColor);

  // Divider
  ctx.fillStyle = '#2a2a4a'; ctx.fillRect(midX - 1, panelTop - 4, 2, 260);

  // Detail area
  const detY = panelTop + 270;
  ctx.fillStyle = '#0e0e1e'; ctx.fillRect(ox + 12, detY, ow - 24, 140);
  ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1; ctx.strokeRect(ox + 12, detY, ow - 24, 140);

  const items = side === 0 ? gs.shopStock : player.inventory;
  const idx = gs.shopCursor;
  if (idx >= 0 && idx < items.length) {
    const item = items[idx];
    if (item.kind === 'material') {
      // Material detail in shop
      const mt = MATERIAL_TYPES[item.materialType];
      if (mt) {
        ctx.fillStyle = mt.color; ctx.font = 'bold 40px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mt.icon, ox + 80, detY + 70);
        const infoX = ox + 160;
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`${mt.name} x${item.quantity}`, infoX, detY + 14);
        ctx.fillStyle = '#888'; ctx.font = '11px monospace';
        ctx.fillText(`Hardness: ${item.sourceHardness}  Flex: ${item.sourceFlexibility}`, infoX, detY + 36);
        const priceX = ox + ow - 200;
        const price = sellPrice(item);
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`SELL ${price}g`, priceX, detY + 30);
      }
    } else if (item.kind === 'tool') {
      // Tool detail in shop
      const names = { hoe: 'Hoe', spear: 'Spear', axe: 'Axe' };
      const color = TOOL_COLORS[item.toolType] || '#888';
      ctx.fillStyle = color; ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(TOOL_LETTERS[item.toolType] || '?', ox + 80, detY + 70);
      const infoX = ox + 160;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(names[item.toolType] || item.toolType, infoX, detY + 14);
      ctx.fillStyle = '#888'; ctx.font = '11px monospace';
      ctx.fillText(`Durability: ${item.durability}/${item.maxDurability}`, infoX, detY + 36);
      const priceX = ox + ow - 200;
      const price = sellPrice(item);
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`SELL ${price}g`, priceX, detY + 30);
    } else if (item.kind === 'product') {
      // Product detail in shop
      const names = { fence: 'Fence', preserves: 'Preserves' };
      const color = PRODUCT_COLORS[item.productType] || '#888';
      ctx.fillStyle = color; ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(PRODUCT_ICONS[item.productType] || '?', ox + 80, detY + 70);
      const infoX = ox + 160;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${names[item.productType] || item.productType} x${item.quantity}`, infoX, detY + 14);
      const priceX = ox + ow - 200;
      const price = sellPrice(item);
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`SELL ${price}g`, priceX, detY + 30);
    } else {
      const fg = item.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
      ctx.drawImage(getSprite(item, 110), ox + 28, detY + 12);
      const infoX = ox + 160;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`Mode ${item.mode}  Depth ${item.genes[8]}`, infoX, detY + 14);
      ctx.fillStyle = '#7c7'; ctx.font = '12px monospace';
      ctx.fillText(`F${fg.fertility} L${fg.longevity} V${fg.vigor}  \u2014  ${farmLabel(fg)}`, infoX, detY + 36);
      ctx.fillStyle = '#888'; ctx.font = '11px monospace';
      ctx.fillText(`Hue: ${item.colorGenes?.hue ?? '?'}  Spread: ${item.colorGenes?.spread ?? '?'}`, infoX, detY + 56);
      // Price + action
      const priceX = ox + ow - 200;
      if (side === 0) {
        const price = buyPrice(item);
        ctx.fillStyle = player.wallet >= price ? '#ffd700' : '#f66';
        ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`BUY ${price}g`, priceX, detY + 30);
        if (player.wallet < price) {
          ctx.fillStyle = '#f66'; ctx.font = '11px monospace';
          ctx.fillText('Not enough gold', priceX, detY + 56);
        }
      } else {
        const price = sellPrice(item);
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`SELL ${price}g`, priceX, detY + 30);
      }
    }
  } else {
    ctx.fillStyle = '#444'; ctx.font = '13px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(
      items.length === 0 ? (side === 0 ? 'Sold out! Come back tomorrow.' : 'Inventory empty') : 'Select an item',
      ox + ow/2, detY + 70
    );
  }
  // Footer
  ctx.fillStyle = '#555'; ctx.font = '11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(spectatorFooter(gs) || '[Left/Right] switch  [Up/Down] select  [Space] buy/sell  [Esc] close', ox+ow/2, oy+oh-10);
}

// ── Lab ──

function drawLabOverlay(ctx, lab, player, gs) {
  overlayBg(ctx);
  const ox = 100, oy = 50, ow = 760, oh = 620;
  drawPanel(ctx, ox, oy, ow, oh, 'Breeding Lab');
  const cy = oy + 50;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  if (lab.step === 'select1') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
    ctx.fillText('Select Parent 1  [press 1-9]', ox+20, cy);
    drawInvGrid(ctx, player.inventory, player.selectedSlot, ox+20, cy+30, null, null);
  } else if (lab.step === 'select2') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
    ctx.fillText('Select Parent 2  [must be same mode]', ox+20, cy);
    drawInvGrid(ctx, player.inventory, player.selectedSlot, ox+20, cy+30, lab.parent1Idx, '#58a6ff');
  } else if (lab.step === 'offspring') {
    ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.fillText('Parents:', ox+20, cy);
    if (lab.parent1Idx < player.inventory.length) ctx.drawImage(getSprite(player.inventory[lab.parent1Idx], 52), ox+20, cy+18);
    ctx.fillStyle = '#888'; ctx.font = '18px monospace'; ctx.fillText('\u00D7', ox+78, cy+34);
    if (lab.parent2Idx < player.inventory.length) ctx.drawImage(getSprite(player.inventory[lab.parent2Idx], 52), ox+96, cy+18);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace';
    ctx.fillText('Pick 1-2 offspring, then [Space] to keep:', ox+20, cy+82);
    for (let i = 0; i < lab.offspring.length; i++) {
      const cx2 = ox + 20 + i * 175, cy2 = cy + 108;
      const picked = lab.selectedOffspring.includes(i);
      if (picked) {
        ctx.fillStyle = 'rgba(80,200,80,0.12)'; ctx.fillRect(cx2-4, cy2-4, 164, 150);
        ctx.strokeStyle = '#5c5'; ctx.lineWidth = 2; ctx.strokeRect(cx2-4, cy2-4, 164, 150);
      }
      ctx.drawImage(getSprite(lab.offspring[i], 100), cx2+28, cy2);
      ctx.fillStyle = '#e0e0e0'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`[${i+1}] D${lab.offspring[i].genes[8]} ${farmTraitLine(lab.offspring[i])}`, cx2+78, cy2+106);
      ctx.fillStyle = '#7c7'; ctx.font = '9px monospace';
      ctx.fillText(farmLabel(lab.offspring[i].farmGenes), cx2+78, cy2+120);
      ctx.textAlign = 'left';
    }
  }
  ctx.fillStyle = '#666'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(spectatorFooter(gs) || '[Esc] close', ox+ow/2, oy+oh-18);
}

// ── Museum ──

function drawMuseumOverlay(ctx, collection, gs) {
  overlayBg(ctx);
  const ox = 100, oy = 50, ow = 760, oh = 620;
  drawPanel(ctx, ox, oy, ow, oh, 'Museum');
  const cy = oy + 45;
  ctx.fillStyle = '#aaa'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`${collection.donated.length} specimens  \u00B7  ${collection.discovered.size} species`, ox+20, cy);
  ctx.fillStyle = '#8af';
  ctx.fillText(`Modes: ${collection.unlockedModes.join(', ')}  \u00B7  Sold: ${collection.totalSold}  \u00B7  Bred: ${collection.totalBred}`, ox+20, cy+18);
  const gridX = ox + 20, gridY = cy + 44, cell = 68, cols = 9;
  const scroll = gs.museumScroll || 0;
  for (let i = scroll * cols; i < Math.min(collection.donated.length, (scroll + 7) * cols); i++) {
    const d = collection.donated[i];
    const gi = i - scroll * cols;
    const gc = gi % cols, gr = Math.floor(gi / cols);
    const cx2 = gridX + gc * (cell+3), cy2 = gridY + gr * (cell+3);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(cx2, cy2, cell, cell);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(cx2, cy2, cell, cell);
    const fake = { kind:'organism', id:`m${i}`, genes:d.genes, mode:d.mode, colorGenes:d.colorGenes, farmGenes:d.farmGenes, stage:'mature', growthProgress:d.genes[8], matureDays:d.genes[8] };
    ctx.drawImage(getSprite(fake, cell - 8), cx2 + 4, cy2 + 4);
  }
  if (collection.donated.length === 0) {
    ctx.fillStyle = '#555'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
    ctx.fillText('No specimens. [Space] to donate selected item.', ox+ow/2, gridY+50);
  }
  ctx.fillStyle = '#666'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(spectatorFooter(gs) || '[Space] donate  [Up/Down] scroll  [Esc] close', ox+ow/2, oy+oh-18);
}

// ── Trade ──

function drawTradeOverlay(ctx, gs, player, npcStates) {
  overlayBg(ctx);
  const ns = npcStates[gs.tradeNpcIdx]; const npc = NPCS[gs.tradeNpcIdx];
  if (!ns || !npc) return;
  const ox = 140, oy = 80, ow = 680, oh = 520;
  drawPanel(ctx, ox, oy, ow, oh, `Trade with ${npc.name}`);
  const colW = (ow - 60) / 2;
  const leftX = ox + 20, rightX = ox + ow/2 + 10, topY = oy + 50;

  ctx.fillStyle = npc.color; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`${npc.name}'s Items`, leftX, topY);
  const npcSel = gs.tradeCursor === 0;
  for (let i = 0; i < ns.inventory.length; i++) {
    const iy = topY + 24 + i * 64;
    const sel = npcSel && gs.tradeNpcSlot === i;
    const thov = !sel && _hitRect(leftX - 4, iy - 2, colW, 60);
    if (sel) { ctx.fillStyle = 'rgba(255,220,50,0.1)'; ctx.fillRect(leftX-4, iy-2, colW, 60); }
    else if (thov) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(leftX-4, iy-2, colW, 60); }
    ctx.drawImage(getSprite(ns.inventory[i], 44), leftX, iy);
    ctx.fillStyle = '#e0e0e0'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`M${ns.inventory[i].mode} D${ns.inventory[i].genes[8]} ${farmTraitLine(ns.inventory[i])}`, leftX+50, iy+8);
    ctx.fillStyle = '#7c7'; ctx.font = '9px monospace'; ctx.fillText(farmLabel(ns.inventory[i].farmGenes), leftX+50, iy+22);
    ctx.fillStyle = '#ffd700'; ctx.font = '11px monospace'; ctx.fillText(`~${sellPrice(ns.inventory[i])}g`, leftX+50, iy+36);
    if (sel) { ctx.fillStyle = '#ffd700'; ctx.fillText('\u25B6', leftX-12, iy+14); }
  }
  if (ns.inventory.length === 0) { ctx.fillStyle = '#555'; ctx.font = '12px monospace'; ctx.fillText('Nothing to trade', leftX, topY+30); }

  ctx.fillStyle = '#888'; ctx.font = '24px monospace'; ctx.textAlign = 'center'; ctx.fillText('\u21C4', ox+ow/2, topY+100);

  ctx.fillStyle = '#e8c170'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
  ctx.fillText('Your Items', rightX, topY);
  const plSel = gs.tradeCursor === 1;
  for (let i = 0; i < Math.min(player.inventory.length, 7); i++) {
    const iy = topY + 24 + i * 64;
    const sel = plSel && gs.tradePlayerSlot === i;
    const thov2 = !sel && _hitRect(rightX - 4, iy - 2, colW, 60);
    if (sel) { ctx.fillStyle = 'rgba(255,220,50,0.1)'; ctx.fillRect(rightX-4, iy-2, colW, 60); }
    else if (thov2) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(rightX-4, iy-2, colW, 60); }
    const item = player.inventory[i];
    if (item.kind === 'material') {
      const mt = MATERIAL_TYPES[item.materialType];
      if (mt) {
        ctx.fillStyle = mt.color; ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mt.icon, rightX + 22, iy + 22);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#e0e0e0'; ctx.font = '11px monospace';
        ctx.fillText(`${mt.name} x${item.quantity}`, rightX+50, iy+8);
        ctx.fillStyle = '#ffd700'; ctx.font = '11px monospace';
        ctx.fillText(`~${sellPrice(item)}g`, rightX+50, iy+22);
      }
    } else if (item.kind === 'tool') {
      const names = { hoe: 'Hoe', spear: 'Spear', axe: 'Axe' };
      ctx.fillStyle = TOOL_COLORS[item.toolType] || '#888'; ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(TOOL_LETTERS[item.toolType] || '?', rightX + 22, iy + 22);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#e0e0e0'; ctx.font = '11px monospace';
      ctx.fillText(names[item.toolType] || item.toolType, rightX+50, iy+8);
      ctx.fillStyle = '#888'; ctx.font = '9px monospace';
      ctx.fillText(`${item.durability}/${item.maxDurability}`, rightX+50, iy+22);
      ctx.fillStyle = '#ffd700'; ctx.font = '11px monospace';
      ctx.fillText(`~${sellPrice(item)}g`, rightX+50, iy+36);
    } else if (item.kind === 'product') {
      const names = { fence: 'Fence', preserves: 'Preserves' };
      ctx.fillStyle = PRODUCT_COLORS[item.productType] || '#888'; ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(PRODUCT_ICONS[item.productType] || '?', rightX + 22, iy + 22);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#e0e0e0'; ctx.font = '11px monospace';
      ctx.fillText(`${names[item.productType]} x${item.quantity}`, rightX+50, iy+8);
      ctx.fillStyle = '#ffd700'; ctx.font = '11px monospace';
      ctx.fillText(`~${sellPrice(item)}g`, rightX+50, iy+22);
    } else {
      ctx.drawImage(getSprite(item, 44), rightX, iy);
      ctx.fillStyle = '#e0e0e0'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`M${item.mode} D${item.genes[8]} ${farmTraitLine(item)}`, rightX+50, iy+8);
      ctx.fillStyle = '#7c7'; ctx.font = '9px monospace'; ctx.fillText(farmLabel(item.farmGenes), rightX+50, iy+22);
      ctx.fillStyle = '#ffd700'; ctx.font = '11px monospace'; ctx.fillText(`~${sellPrice(item)}g`, rightX+50, iy+36);
    }
    if (sel) { ctx.fillStyle = '#ffd700'; ctx.fillText('\u25B6', rightX-12, iy+14); }
  }
  if (player.inventory.length === 0) { ctx.fillStyle = '#555'; ctx.font = '12px monospace'; ctx.fillText('Inventory empty', rightX, topY+30); }

  ctx.fillStyle = '#666'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(spectatorFooter(gs) || '[L/R] side  [U/D] select  [Space] swap  [Esc] close', ox+ow/2, oy+oh-18);
}

// ── Crafting Overlay ──

function drawCraftingOverlay(ctx, gs, player) {
  overlayBg(ctx);
  const ox = 80, oy = 50, ow = 800, oh = 650;
  drawPanel(ctx, ox, oy, ow, oh, 'Crafting Table');

  const leftW = 280;
  const listX = ox + 16, listY = oy + 50;
  const rightX = ox + leftW + 24;
  const rightW = ow - leftW - 48;

  // Left panel: recipe list
  ctx.fillStyle = '#0e0e1e';
  ctx.fillRect(listX, listY, leftW, oh - 80);
  ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1;
  ctx.strokeRect(listX, listY, leftW, oh - 80);

  for (let i = 0; i < RECIPES.length; i++) {
    const recipe = RECIPES[i];
    const craftable = canCraft(recipe, player.inventory);
    const sel = i === gs.craftCursor;
    const ry = listY + 8 + i * 56;

    const chov = !sel && _hitRect(listX + 2, ry - 4, leftW - 4, 52);
    if (sel) {
      ctx.fillStyle = 'rgba(255,220,50,0.1)';
      ctx.fillRect(listX + 2, ry - 4, leftW - 4, 52);
    } else if (chov) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(listX + 2, ry - 4, leftW - 4, 52);
    }

    ctx.fillStyle = sel ? '#ffd700' : chov ? '#eee' : (craftable ? '#ccc' : '#555');
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(recipe.name, listX + 12, ry);

    ctx.fillStyle = sel ? '#aaa' : (craftable ? '#888' : '#444');
    ctx.font = '10px monospace';
    ctx.fillText(recipe.desc, listX + 12, ry + 18);

    // Craftable indicator
    if (craftable) {
      ctx.fillStyle = '#5c5'; ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('READY', listX + leftW - 10, ry + 4);
      ctx.textAlign = 'left';
    }

    // Output kind
    ctx.fillStyle = recipe.outputKind === 'tool' ? '#6af' : '#fa6';
    ctx.font = '9px monospace';
    ctx.fillText(recipe.outputKind === 'tool' ? 'TOOL' : `PRODUCT x${recipe.productQty}`, listX + 12, ry + 34);
  }

  // Right panel: selected recipe detail
  const recipe = RECIPES[gs.craftCursor];
  if (recipe) {
    ctx.fillStyle = '#0e0e1e';
    ctx.fillRect(rightX, listY, rightW, oh - 80);
    ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1;
    ctx.strokeRect(rightX, listY, rightW, oh - 80);

    let iy = listY + 16;
    const cx = rightX + 20;

    // Recipe name
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(recipe.name, cx, iy); iy += 30;

    // Description
    ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
    ctx.fillText(recipe.desc, cx, iy); iy += 28;

    // Output type
    const outputLabel = recipe.outputKind === 'tool'
      ? `Creates: ${recipe.toolType} (tool)`
      : `Creates: ${recipe.productType} x${recipe.productQty}`;
    ctx.fillStyle = recipe.outputKind === 'tool' ? '#6af' : '#fa6';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(outputLabel, cx, iy); iy += 32;

    // Inputs header
    ctx.fillStyle = '#ccc'; ctx.font = 'bold 13px monospace';
    ctx.fillText('Materials needed:', cx, iy); iy += 22;

    for (const req of recipe.inputs) {
      const mat = player.inventory.find(item => item.kind === 'material' && item.materialType === req.type);
      const have = mat ? mat.quantity : 0;
      const met = have >= req.qty;
      ctx.fillStyle = met ? '#5c5' : '#f55';
      ctx.font = '12px monospace';
      const NAMES = { wood: 'Wood', fiber: 'Fiber', fruit: 'Fruit', resin: 'Resin' };
      ctx.fillText(`${met ? '\u2713' : '\u2717'} ${NAMES[req.type] || req.type}: ${have}/${req.qty}`, cx + 8, iy);
      iy += 20;
    }

    // Quality gate
    if (recipe.qualityGate) {
      iy += 8;
      const gate = recipe.qualityGate;
      const mat = player.inventory.find(item => item.kind === 'material' && item.materialType === gate.material);
      const val = mat ? (mat[gate.trait] || 0) : 0;
      const met = val >= gate.min;
      const NAMES = { wood: 'Wood', fiber: 'Fiber', fruit: 'Fruit', resin: 'Resin' };
      const traitName = gate.trait === 'sourceHardness' ? 'hardness' : 'flexibility';
      ctx.fillStyle = met ? '#5c5' : '#f55';
      ctx.font = '12px monospace';
      ctx.fillText(`${met ? '\u2713' : '\u2717'} ${NAMES[gate.material]} ${traitName}: ${val.toFixed(2)} (need ${gate.min})`, cx + 8, iy);
      iy += 20;
    }

    // Tool durability preview
    if (recipe.outputKind === 'tool') {
      iy += 16;
      const woodMat = player.inventory.find(item => item.kind === 'material' && item.materialType === 'wood');
      const h = woodMat ? (woodMat.sourceHardness || 0) : 0;
      const BASE_DUR = { hoe: 15, spear: 12, axe: 8 };
      const dur = (BASE_DUR[recipe.toolType] || 10) + Math.floor(h * 10);
      ctx.fillStyle = '#888'; ctx.font = '11px monospace';
      ctx.fillText(`Durability: ${dur} uses`, cx, iy); iy += 16;
      ctx.fillStyle = '#666'; ctx.font = '9px monospace';
      ctx.fillText(`(base ${BASE_DUR[recipe.toolType]} + hardness bonus)`, cx, iy);
    }
  }

  // Footer
  ctx.fillStyle = '#555'; ctx.font = '11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(spectatorFooter(gs) || '[Up/Down] select  [Space] craft  [S] save  [Esc] close', ox + ow/2, oy + oh - 10);
}

// ── Tool/Product Slot Renderers ──

const TOOL_COLORS = { hoe: '#8B6914', spear: '#708090', axe: '#B0B0B0' };
const TOOL_LETTERS = { hoe: 'H', spear: 'S', axe: 'A' };

function drawToolSlot(ctx, tool, sx, sy, size) {
  const color = TOOL_COLORS[tool.toolType] || '#888';
  // Background
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(sx + 4, sy + 4, size - 8, size - 14);
  ctx.globalAlpha = 1;
  // Letter icon
  ctx.fillStyle = color;
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(TOOL_LETTERS[tool.toolType] || '?', sx + size / 2, sy + size / 2 - 4);
  // Durability bar
  const barX = sx + 4, barY = sy + size - 7, barW = size - 8, barH = 3;
  const ratio = tool.durability / tool.maxDurability;
  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = ratio > 0.5 ? '#5c5' : ratio > 0.2 ? '#cc5' : '#f55';
  ctx.fillRect(barX, barY, barW * ratio, barH);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
}

const PRODUCT_COLORS = { fence: '#8B6914', preserves: '#B03030' };
const PRODUCT_ICONS = { fence: '#', preserves: 'P' };

function drawProductSlot(ctx, product, sx, sy, size) {
  const color = PRODUCT_COLORS[product.productType] || '#888';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(sx + 4, sy + 6, size - 8, size - 12);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(PRODUCT_ICONS[product.productType] || '?', sx + size / 2, sy + size / 2 - 1);
  // Quantity
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(String(product.quantity), sx + size - 3, sy + size - 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
}

// ── Tool/Product HUD Info ──

function drawToolHUDInfo(ctx, tool, midY) {
  const names = { hoe: 'Hoe', spear: 'Spear', axe: 'Axe' };
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle = TOOL_COLORS[tool.toolType] || '#888';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(names[tool.toolType] || tool.toolType, CANVAS_W - 100, midY - 12);
  // Durability bar text
  const ratio = tool.durability / tool.maxDurability;
  const filled = Math.round(ratio * 8);
  const bar = '[' + '|'.repeat(filled) + '.'.repeat(8 - filled) + ']';
  ctx.fillStyle = ratio > 0.5 ? '#5c5' : ratio > 0.2 ? '#cc5' : '#f55';
  ctx.font = '11px monospace';
  ctx.fillText(bar, CANVAS_W - 10, midY - 12);
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 11px monospace';
  ctx.fillText(`~${sellPrice(tool)}g`, CANVAS_W - 100, midY + 1);
  ctx.fillStyle = '#888'; ctx.font = '9px monospace';
  ctx.fillText(`${tool.durability}/${tool.maxDurability}`, CANVAS_W - 10, midY + 1);
  ctx.fillStyle = '#555'; ctx.font = '9px monospace';
  ctx.fillText('[I] inventory', CANVAS_W - 10, midY + 13);
}

function drawProductHUDInfo(ctx, product, midY) {
  const names = { fence: 'Fence', preserves: 'Preserves' };
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle = PRODUCT_COLORS[product.productType] || '#888';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`${names[product.productType] || product.productType} x${product.quantity}`, CANVAS_W - 100, midY - 12);
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 11px monospace';
  ctx.fillText(`~${sellPrice(product)}g`, CANVAS_W - 100, midY + 1);
  ctx.fillStyle = '#555'; ctx.font = '9px monospace';
  ctx.fillText('[I] inventory', CANVAS_W - 10, midY + 13);
}

// ── Tool/Product Detail Panels ──

function drawToolDetail(ctx, tool, detX, detY, detW, detH) {
  const names = { hoe: 'Hoe', spear: 'Spear', axe: 'Axe' };
  const descs = {
    hoe: 'Plows 2 tiles at once',
    spear: 'Forages materials from wild trees',
    axe: 'Chops wild trees for 2x materials',
  };
  const color = TOOL_COLORS[tool.toolType] || '#888';

  // Large icon
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(detX + detW/2 - 60, detY + 20, 120, 120);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(TOOL_LETTERS[tool.toolType] || '?', detX + detW/2, detY + 80);

  let iy = detY + 160;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(names[tool.toolType] || tool.toolType, detX + detW/2, iy); iy += 26;

  ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
  ctx.fillText(descs[tool.toolType] || '', detX + detW/2, iy); iy += 30;

  // Durability bar
  ctx.textAlign = 'left';
  const traitX = detX + 16;
  ctx.fillStyle = '#ccc'; ctx.font = '12px monospace';
  ctx.fillText(`Durability: ${tool.durability} / ${tool.maxDurability}`, traitX, iy); iy += 20;

  const barX = traitX, barW = detW - 32, barH = 8;
  const ratio = tool.durability / tool.maxDurability;
  ctx.fillStyle = '#333'; ctx.fillRect(barX, iy, barW, barH);
  ctx.fillStyle = ratio > 0.5 ? '#5c5' : ratio > 0.2 ? '#cc5' : '#f55';
  ctx.fillRect(barX, iy, barW * ratio, barH);
  iy += 24;

  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 18px monospace';
  ctx.fillText(`~${sellPrice(tool)}g`, traitX, iy);
}

function drawProductDetail(ctx, product, detX, detY, detW, detH) {
  const names = { fence: 'Fence', preserves: 'Preserves' };
  const descs = {
    fence: 'Placeable barrier tile',
    preserves: 'High sell value trade good',
  };
  const color = PRODUCT_COLORS[product.productType] || '#888';

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(detX + detW/2 - 60, detY + 20, 120, 120);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = 'bold 64px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(PRODUCT_ICONS[product.productType] || '?', detX + detW/2, detY + 80);

  let iy = detY + 160;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`${names[product.productType] || product.productType} x${product.quantity}`, detX + detW/2, iy); iy += 26;

  ctx.fillStyle = '#aaa'; ctx.font = '12px monospace';
  ctx.fillText(descs[product.productType] || '', detX + detW/2, iy); iy += 30;

  ctx.textAlign = 'left';
  const traitX = detX + 16;
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 18px monospace';
  ctx.fillText(`~${sellPrice(product)}g`, traitX, iy);
}

// ── Speech Bubble ──

function drawSpeechBubble(ctx, text, screenX, screenY) {
  ctx.font = '12px monospace';
  // Word-wrap to ~200px
  const maxW = 200;
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    if (ctx.measureText(test).width > maxW) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const lineH = 16;
  const pad = 10;
  const bubbleW = Math.min(maxW + pad * 2, Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2);
  const bubbleH = lines.length * lineH + pad * 2;
  const bx = screenX - bubbleW / 2;
  const by = screenY - 30 - bubbleH;

  // Background
  ctx.fillStyle = 'rgba(34, 34, 34, 0.88)';
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bubbleW - r, by);
  ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + r);
  ctx.lineTo(bx + bubbleW, by + bubbleH - r);
  ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - r, by + bubbleH);
  ctx.lineTo(bx + r, by + bubbleH);
  ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();

  // Triangle pointer
  ctx.beginPath();
  ctx.moveTo(screenX - 6, by + bubbleH);
  ctx.lineTo(screenX, by + bubbleH + 8);
  ctx.lineTo(screenX + 6, by + bubbleH);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], screenX, by + pad + i * lineH);
  }
}

// ── Dawkins Overlay ──

function drawDawkinsOverlay(ctx, gs) {
  const ds = gs.dawkinsState;
  if (!ds || !ds.currentVisit) return;

  overlayBg(ctx);

  const ox = 120, oy = 60, ow = 720, oh = 600;

  // Background — warm study tones
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(ox, oy, ow, oh);
  ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, ow, oh);

  // Header bar
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(ox, oy, ow, 40);
  ctx.fillStyle = '#f0e8d8'; ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const visitNum = ds.completedVisits + 1;
  ctx.fillText(`Visit ${visitNum}: ${ds.currentVisit.title}`, ox + ow / 2, oy + 20);

  const line = getCurrentLine(ds);
  const contentY = oy + 56;
  const contentH = oh - 56 - 40; // minus header and footer

  if (!line) return;

  if (ds.choiceActive && line.speaker === 'player_choice' && line.options) {
    // Player choice mode
    ctx.fillStyle = '#d4c8a8'; ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('Choose your response:', ox + 40, contentY + 20);

    for (let i = 0; i < line.options.length; i++) {
      const optY = contentY + 60 + i * 40;
      const sel = i === ds.choiceCursor;
      if (sel) {
        ctx.fillStyle = 'rgba(240,232,216,0.1)';
        ctx.fillRect(ox + 30, optY - 4, ow - 60, 32);
      }
      ctx.fillStyle = sel ? '#ffd700' : '#d4c8a8';
      ctx.font = sel ? 'bold 14px monospace' : '14px monospace';
      ctx.fillText(sel ? '\u25B8 ' + line.options[i].label : '  ' + line.options[i].label, ox + 40, optY + 4);
    }

    // Footer
    ctx.fillStyle = '#8a7a5a'; ctx.font = '11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('[Up/Down] select  [Space] choose  [Esc] close', ox + ow / 2, oy + oh - 12);
  } else if (line.interactive) {
    // Interactive placeholder
    ctx.fillStyle = '#d4c8a8'; ctx.font = '14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Dawkins invites you to try the Mac...', ox + ow / 2, oy + oh / 2 - 30);
    ctx.fillStyle = '#8a7a5a'; ctx.font = 'italic 12px monospace';
    ctx.fillText(line.interactive.prompt || '[Coming soon]', ox + ow / 2, oy + oh / 2 + 10);
    ctx.fillStyle = '#6a5a3a';
    ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 1;
    ctx.strokeRect(ox + ow / 2 - 120, oy + oh / 2 - 50, 240, 80);

    // Footer
    ctx.fillStyle = '#8a7a5a'; ctx.font = '11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('[Space] continue  [Esc] close', ox + ow / 2, oy + oh - 12);
  } else {
    // Normal dialogue line
    // Speaker label
    ctx.fillStyle = '#b0a080'; ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const speaker = line.speaker === 'dawkins' ? 'R. Dawkins' : line.speaker;
    ctx.fillText(speaker, ox + 40, contentY + 16);

    // Main text — word-wrap
    ctx.fillStyle = '#f0e8d8'; ctx.font = '15px Georgia, serif';
    const textLines = wrapText(ctx, line.text || '', ow - 100);
    for (let i = 0; i < textLines.length; i++) {
      ctx.fillText(textLines[i], ox + 40, contentY + 44 + i * 24);
    }

    // Tone/gesture
    const metaY = contentY + 44 + textLines.length * 24 + 16;
    if (line.tone || line.gesture) {
      ctx.fillStyle = '#7a6a4a'; ctx.font = 'italic 11px monospace';
      const meta = [line.tone, line.gesture].filter(Boolean).join(' \u2014 ');
      ctx.fillText(meta, ox + 40, metaY);
    }

    // Progress indicator
    ctx.fillStyle = '#6a5a3a'; ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${ds.lineIdx + 1} / ${ds.currentVisit.lines.length}`, ox + ow - 20, contentY + 16);

    // Footer
    ctx.fillStyle = '#8a7a5a'; ctx.font = '11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('[Space] continue  [Esc] close', ox + ow / 2, oy + oh - 12);
  }
}

function drawExamineOverlay(ctx, gs) {
  const org = gs.examineTarget;
  if (!org) return;

  const w = 400, h = 440;
  const x = (CANVAS_W - w) / 2, y = (CANVAS_H - h) / 2;

  // Backdrop
  overlayBg(ctx);

  // Panel
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#6a8a6a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // Title (nickname or fallback)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c8e6c8';
  ctx.font = 'bold 16px Georgia, serif';
  const title = org.nickname || `Biomorph M${org.mode}`;
  ctx.fillText(title, x + w / 2, y + 24);

  // Large sprite
  const spriteSize = 200;
  ctx.drawImage(getSprite(org, spriteSize), x + (w - spriteSize) / 2, y + 42);

  // Stats area
  const statsY = y + 42 + spriteSize + 14;
  ctx.font = '11px monospace';
  ctx.fillStyle = '#8ab88a';
  const modeNames = ['Peppering', 'Basic', 'Symmetry', 'Segments', 'Gradients', 'Full Dawkins'];
  ctx.fillText(`Mode: ${modeNames[org.mode] || org.mode}  |  Depth: ${org.genes[8]}`, x + w / 2, statsY);

  // Farm traits
  const fg = org.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
  ctx.fillText(`Fertility: ${fg.fertility}  Longevity: ${fg.longevity}  Vigor: ${fg.vigor}  (${farmLabel(fg)})`, x + w / 2, statsY + 17);

  // Growth stage
  let stageStr = org.stage || 'seed';
  if (org.stage === 'growing') {
    const left = (org.matureDays || org.genes[8]) - (org.growthProgress || 0);
    stageStr = `growing (${left} day${left !== 1 ? 's' : ''} left)`;
  }
  ctx.fillText(`Stage: ${stageStr}`, x + w / 2, statsY + 34);

  // Genes
  ctx.fillStyle = '#7a9a9a';
  ctx.fillText(`Genes: [${org.genes.join(', ')}]`, x + w / 2, statsY + 54);

  // Footer
  ctx.fillStyle = '#668866';
  ctx.fillText('[E / Esc] Close', x + w / 2, y + h - 14);

  ctx.textAlign = 'left';
}

function drawExhibitOverlay(ctx, gs) {
  const data = gs.exhibitData;
  if (!data || !data.exhibit) return;
  const ex = data.exhibit;
  const org = ex.organism;

  const w = 360, h = 280;
  const x = (CANVAS_W - w) / 2, y = (CANVAS_H - h) / 2;

  // Backdrop
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Panel
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#6a8a6a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c8e6c8';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText(ex.label || 'Exhibit', x + w / 2, y + 24);

  // Organism sprite
  if (org) {
    const spriteSize = 120;
    ctx.drawImage(getSprite(org, spriteSize), x + (w - spriteSize) / 2, y + 44);

    // Mode and genes info
    ctx.font = '11px monospace';
    ctx.fillStyle = '#8ab88a';
    const modeNames = ['Peppering', 'Basic', 'Symmetry', 'Segments', 'Gradients', 'Full Dawkins'];
    ctx.fillText(`Mode: ${modeNames[org.mode] || org.mode}`, x + w / 2, y + 175);
    ctx.fillText(`Genes: [${org.genes.join(', ')}]`, x + w / 2, y + 192);
    if (org.symmetry && org.symmetry !== 'left-right') {
      ctx.fillText(`Symmetry: ${org.symmetry}`, x + w / 2, y + 209);
    }
  }

  // Breeder link
  ctx.fillStyle = '#aac8ee';
  ctx.font = '12px monospace';
  ctx.fillText('[B] Open in Breeder', x + w / 2, y + h - 38);

  // Close hint
  ctx.fillStyle = '#668866';
  ctx.font = '11px monospace';
  ctx.fillText('[Space/Esc] Close', x + w / 2, y + h - 16);

  ctx.textAlign = 'left';
}

function drawStudyInfoOverlay(ctx, gs, collection) {
  const pages = gs.studyInfoPages;
  if (!pages) return;
  const pageIdx = gs.studyInfoPage || 0;
  const page = pages[Math.min(pageIdx, pages.length - 1)];
  if (!page) return;

  overlayBg(ctx);

  const ox = 120, oy = 60, ow = 720, oh = 600;

  // Background — warm study tones (matches Dawkins overlay)
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(ox, oy, ow, oh);
  ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, ow, oh);

  // Header bar
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(ox, oy, ow, 40);
  ctx.fillStyle = '#f0e8d8'; ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(page.title || 'The Study', ox + ow / 2, oy + 20);

  const contentY = oy + 56;

  if (page.dynamic && collection) {
    // Dynamic stats page
    ctx.fillStyle = '#d4c8a8'; ctx.font = '15px Georgia, serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    const speciesFound = collection.discovered.size;
    const totalBred = collection.totalBred;
    const totalSold = collection.totalSold;
    const totalDonated = collection.totalDonated;
    const modes = collection.unlockedModes;
    // Rough morphospace estimate based on unlocked modes
    let totalGenotypes = 0;
    let estimatedSpecies = 0;
    for (const m of modes) {
      if (m <= 2) { totalGenotypes += 46e6; estimatedSpecies += 3000; }
      else if (m === 3) { totalGenotypes += 2e9; estimatedSpecies += 15000; }
      else { totalGenotypes += 5e9; estimatedSpecies += 30000; }
    }
    const pctExplored = estimatedSpecies > 0 ? (speciesFound / estimatedSpecies * 100) : 0;

    const stats = [
      `Species discovered: ${speciesFound}`,
      `Total bred: ${totalBred}`,
      `Total sold: ${totalSold}`,
      `Total donated: ${totalDonated}`,
      `Modes unlocked: ${modes.join(', ')}`,
      '',
      `Estimated distinct species (unlocked modes): ~${estimatedSpecies.toLocaleString()}`,
      `Your exploration: ${pctExplored < 0.01 ? '<0.01' : pctExplored.toFixed(2)}%`,
      '',
      'The vast majority of morphospace remains unexplored.',
      'Every breeding session is a chance to find something',
      'no one has ever seen before.',
    ];

    for (let i = 0; i < stats.length; i++) {
      ctx.fillStyle = i < 5 ? '#e8d8b8' : '#d4c8a8';
      ctx.font = i < 5 ? 'bold 15px Georgia, serif' : '15px Georgia, serif';
      ctx.fillText(stats[i], ox + 40, contentY + 16 + i * 28);
    }
  } else if (page.lines) {
    // Static text page
    ctx.fillStyle = '#f0e8d8'; ctx.font = '15px Georgia, serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let i = 0; i < page.lines.length; i++) {
      ctx.fillText(page.lines[i], ox + 40, contentY + 16 + i * 28);
    }
  }

  // Page indicator
  ctx.fillStyle = '#6a5a3a'; ctx.font = '11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${pageIdx + 1} / ${pages.length}`, ox + ow / 2, oy + oh - 30);

  // Footer
  ctx.fillStyle = '#8a7a5a'; ctx.font = '11px monospace';
  const isLast = pageIdx >= pages.length - 1;
  ctx.fillText(
    isLast ? '[Space] close  [Left] back  [Esc] close' : '[Space/Right] next  [Left] back  [Esc] close',
    ox + ow / 2, oy + oh - 12
  );
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── Gallery Overlay ──

function drawGalleryOverlay(ctx, gs) {
  overlayBg(ctx);
  const pw = 700, ph = 500;
  const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
  drawPanel(ctx, px, py, pw, ph, 'Specimen Gallery');

  const items = gs.galleryItems || [];
  if (items.length === 0) {
    ctx.fillStyle = '#888'; ctx.font = '14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No specimens in gallery.', px + pw / 2, py + ph / 2);
    ctx.fillText('[Esc] Close', px + pw / 2, py + ph - 20);
    return;
  }

  const cursor = gs.galleryCursor || 0;
  const visibleRows = 8;
  // Auto-scroll to keep cursor visible
  let scroll = gs.galleryScroll || 0;
  if (cursor < scroll) scroll = cursor;
  if (cursor >= scroll + visibleRows) scroll = cursor - visibleRows + 1;
  gs.galleryScroll = scroll;

  const listX = px + 16;
  const listY = py + 48;
  const rowH = 52;
  const listW = 340;

  // Draw list
  ctx.save();
  ctx.beginPath();
  ctx.rect(listX, listY, listW, visibleRows * rowH);
  ctx.clip();

  for (let i = scroll; i < Math.min(items.length, scroll + visibleRows); i++) {
    const spec = items[i];
    const y = listY + (i - scroll) * rowH;
    const sel = i === cursor;

    // Row background
    const hov = !sel && _hitRect(listX, y, listW, rowH - 2);
    ctx.fillStyle = sel ? 'rgba(255,220,50,0.12)' : hov ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(listX, y, listW, rowH - 2);
    if (sel) {
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
      ctx.strokeRect(listX, y, listW, rowH - 2);
    } else if (hov) {
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
      ctx.strokeRect(listX, y, listW, rowH - 2);
    }

    // Thumbnail sprite — create temporary organism for rendering
    const tmpOrg = {
      genes: spec.genes,
      mode: spec.mode,
      colorGenes: spec.colorGenes || { hue: 0, spread: 0 },
      symmetry: spec.symmetry || 'left-right',
      id: `gallery-${spec.id || i}`,
      stage: 'mature',
      farmGenes: { fertility: 2, longevity: 1, vigor: 2 },
    };
    ctx.drawImage(getSprite(tmpOrg, 40), listX + 4, y + 5);

    // Name
    ctx.fillStyle = sel ? '#fff' : '#ccc'; ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(spec.name || `Specimen ${i + 1}`, listX + 50, y + 6);

    // Mode + depth info
    ctx.fillStyle = '#888'; ctx.font = '10px monospace';
    ctx.fillText(`Mode ${spec.mode}  D${spec.genes[8]}`, listX + 50, y + 22);

    // Cost
    const cost = galleryImportCost(spec);
    if (gs.creativeMode) {
      ctx.fillStyle = '#7c7'; ctx.font = 'bold 10px monospace';
      ctx.fillText('FREE', listX + 50, y + 36);
    } else {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 10px monospace';
      ctx.fillText(`${cost}g`, listX + 50, y + 36);
    }
  }
  ctx.restore();

  // Scrollbar
  if (items.length > visibleRows) {
    const sbX = listX + listW + 4;
    const sbH = visibleRows * rowH;
    const thumbH = Math.max(20, sbH * visibleRows / items.length);
    const thumbY = listY + (sbH - thumbH) * scroll / Math.max(1, items.length - visibleRows);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(sbX, listY, 4, sbH);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(sbX, thumbY, 4, thumbH);
  }

  // Detail panel (right side)
  const detailX = px + 380;
  const detailY = py + 48;
  const detailW = pw - 400;
  const detailH = ph - 80;

  if (cursor < items.length) {
    const spec = items[cursor];
    const tmpOrg = {
      genes: spec.genes,
      mode: spec.mode,
      colorGenes: spec.colorGenes || { hue: 0, spread: 0 },
      symmetry: spec.symmetry || 'left-right',
      id: `gallery-detail-${spec.id || cursor}`,
      stage: 'mature',
      farmGenes: { fertility: 2, longevity: 1, vigor: 2 },
    };

    // Large sprite
    const spriteSize = 120;
    const sx = detailX + (detailW - spriteSize) / 2;
    ctx.drawImage(getSprite(tmpOrg, spriteSize), sx, detailY + 10);

    // Name
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(spec.name || `Specimen ${cursor + 1}`, detailX + detailW / 2, detailY + spriteSize + 20);

    // Mode, depth, symmetry
    ctx.fillStyle = '#aaa'; ctx.font = '11px monospace';
    ctx.fillText(`Mode ${spec.mode}   Depth ${spec.genes[8]}`, detailX + detailW / 2, detailY + spriteSize + 42);
    if (spec.symmetry && spec.symmetry !== 'left-right') {
      ctx.fillText(`Sym: ${spec.symmetry}`, detailX + detailW / 2, detailY + spriteSize + 58);
    }

    // Genes
    ctx.fillStyle = '#666'; ctx.font = '9px monospace';
    const geneStr = spec.genes.slice(0, 8).join(', ');
    ctx.fillText(`[${geneStr}]`, detailX + detailW / 2, detailY + spriteSize + 78);

    // Generation info
    if (spec.generation != null) {
      ctx.fillStyle = '#777'; ctx.font = '10px monospace';
      ctx.fillText(`Gen ${spec.generation}`, detailX + detailW / 2, detailY + spriteSize + 96);
    }
  }

  // Footer
  ctx.fillStyle = '#888'; ctx.font = '11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('[Space] Import   [Up/Down] Navigate   [Esc] Close', px + pw / 2, py + ph - 12);
  ctx.fillText(`${items.length} specimen${items.length !== 1 ? 's' : ''} in gallery`, px + pw / 2, py + ph - 28);
}

// ── Help Overlay ──

function drawHelpOverlay(ctx) {
  overlayBg(ctx);
  const pw = 700, ph = 746;
  const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2 - 10;
  drawPanel(ctx, px, py, pw, ph, 'Help');

  // Left column: Keyboard commands
  const keyCommands = [
    ['Arrow Keys', 'Move'],
    ['Space', 'Interact / Plant / Harvest'],
    ['I / Enter', 'Open Inventory'],
    ['1\u20139', 'Select inventory slot'],
    ['Escape', 'Close menu'],
    ['T (hold)', 'Fast-forward time'],
    ['H', 'Toggle help'],
    ['M / V', 'Music / Voice toggle'],
    ['P / Esc', 'Pause / Resume'],
    ['Q', 'Follow nearby NPC'],
    ['F', 'Auto-follow toggle'],
    ['Right-drag', 'Pan camera'],
    ['C', 'Open Codex'],
  ];

  const col1 = px + 20;
  const col2 = px + 140;
  let startY = py + 52;
  const rowH = 22;

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c8e6c8'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
  ctx.fillText('Keyboard', col1, startY); startY += 6;

  for (let i = 0; i < keyCommands.length; i++) {
    const y = startY + i * rowH;
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#8ab4f8';
    ctx.fillText(keyCommands[i][0], col1, y + rowH / 2);
    ctx.font = '11px monospace'; ctx.fillStyle = '#bbb';
    ctx.fillText(keyCommands[i][1], col2, y + rowH / 2);
  }

  // Right column: Slash commands
  const slashCmds = [
    ['/go <place>', 'Walk to location'],
    ['/warp <place>', 'Teleport instantly'],
    ['/follow <npc>', 'Follow a farmer'],
    ['/stop', 'Stop following/walking'],
    ['/trade <npc>', 'Walk to NPC & trade'],
    ['/talk <npc>', 'Walk to NPC & chat'],
    ['/plant [slot]', 'Plant on facing tile'],
    ['/harvest', 'Harvest facing crop'],
    ['/plow', 'Plow facing grass'],
    ['/stats', 'Show game stats'],
    ['/who', 'NPC status list'],
    ['/look', 'Inspect surroundings'],
    ['/peek <npc>', 'Spy on NPC stats'],
    ['/appraise [slot]', 'Item details & price'],
    ['/rank', 'Top 3 valuable items'],
    ['/best', 'Select best item'],
    ['/compare <s1> <s2>', 'Compare two slots'],
    ['/name <text>', 'Nickname an organism'],
    ['/save', 'Save game'],
    ['/skip', 'Skip to next morning'],
    ['/speed', 'Toggle fast-forward'],
    ['/pause', 'Pause/resume'],
    ['/music / /voice', 'Toggle audio'],
    ['/fortune', 'Random Sage tip'],
    ['/dance', 'Spin!'],
    ['/wave', 'Wave at NPCs'],
    ['/yell', 'Shout at NPCs'],
    ['/gallery', 'Import breeder specimens'],
    ['/creative', 'Toggle creative mode'],
    ['/ai', 'AI settings & status'],
    ['/ai on|off', 'Enable/disable AI'],
    ['/ai key <key>', 'Set API key'],
  ];

  const col3 = px + 330;
  const col4 = px + 510;
  let startY2 = py + 52;

  ctx.fillStyle = '#c8e6c8'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
  ctx.fillText('/ Commands', col3, startY2); startY2 += 6;

  for (let i = 0; i < slashCmds.length; i++) {
    const y = startY2 + i * rowH;
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#f8d48a';
    ctx.fillText(slashCmds[i][0], col3, y + rowH / 2);
    ctx.font = '10px monospace'; ctx.fillStyle = '#aaa';
    ctx.fillText(slashCmds[i][1], col4, y + rowH / 2);
  }

  // Footer
  ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#888';
  ctx.fillText('[H] or [Esc] to close  \u2022  Press / to open command bar', px + pw / 2, py + ph - 18);
}

// ── Codex Overlay ──

const DISCOVERER_COLORS = {
  player: '#e8c170',
  fern: '#7c7',
  moss: '#7af',
  dawkins: '#ccc',
};
const DISCOVERER_NAMES = {
  player: 'You',
  fern: 'Fern',
  moss: 'Moss',
  dawkins: 'Dawkins',
};

function drawCodexOverlay(ctx, gs, registry) {
  if (!registry) return;
  overlayBg(ctx);
  const pw = 760, ph = 620;
  const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
  drawPanel(ctx, px, py, pw, ph, 'Codex');

  // Tabs
  const tabNames = ['Leaderboard', 'Discovery Log', 'Morphospace'];
  const tabW = 200, tabH = 28, tabY = py + 38;
  for (let i = 0; i < 3; i++) {
    const tx = px + 20 + i * (tabW + 8);
    const active = gs.codexTab === i;
    ctx.fillStyle = active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(tx, tabY, tabW, tabH);
    ctx.strokeStyle = active ? '#8ab4f8' : '#3a3a5a';
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(tx, tabY, tabW, tabH);
    ctx.fillStyle = active ? '#fff' : '#888';
    ctx.font = active ? 'bold 12px monospace' : '12px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tabNames[i], tx + tabW / 2, tabY + tabH / 2);
  }

  const contentY = tabY + tabH + 16;
  const contentH = ph - (contentY - py) - 30;

  if (gs.codexTab === 0) drawCodexLeaderboard(ctx, px, contentY, pw, contentH, registry);
  else if (gs.codexTab === 1) drawCodexLog(ctx, px, contentY, pw, contentH, registry, gs);
  else drawCodexMorphospace(ctx, px, contentY, pw, contentH, registry);

  // Footer
  ctx.fillStyle = '#666'; ctx.font = '11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('[L/R] tab  [U/D] scroll  [C] or [Esc] close', px + pw / 2, py + ph - 14);
}

function drawCodexLeaderboard(ctx, px, cy, pw, ch, registry) {
  const ranked = getLeaderboardRanked(registry);
  const centerX = px + pw / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';

  // Total discoveries
  ctx.fillStyle = '#aaa'; ctx.font = '13px monospace';
  ctx.fillText(`${registry.totalDiscoveries} total species discovered`, centerX, cy);

  // Leaderboard bars
  const barW = 400, barH = 36, barX = centerX - barW / 2;
  let y = cy + 30;
  const maxCount = Math.max(1, ...ranked.map(([, c]) => c));

  for (let i = 0; i < ranked.length; i++) {
    const [id, count] = ranked[i];
    const name = DISCOVERER_NAMES[id] || id;
    const color = DISCOVERER_COLORS[id] || '#888';
    const fill = Math.max(4, (count / maxCount) * (barW - 80));

    // Medal
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    ctx.font = '18px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(i < 3 ? medals[i] : ' ', barX - 30, y + 6);

    // Bar bg
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(barX, y, barW, barH);

    // Bar fill
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(barX, y, fill, barH);
    ctx.globalAlpha = 1;

    // Name + count
    ctx.fillStyle = color; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
    ctx.fillText(name, barX + 8, y + 8);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'right';
    ctx.fillText(`${count}`, barX + barW - 8, y + 10);

    y += barH + 6;
  }

  // Rarity breakdown for player
  y += 16;
  ctx.fillStyle = '#888'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
  ctx.fillText('Your Rarity Breakdown', centerX, y);
  y += 22;

  const breakdown = getRarityBreakdown(registry, 'player');
  const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const tierX = centerX - 200;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const tx = tierX + i * 82;
    ctx.fillStyle = RARITY_COLORS[t]; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(RARITY_LABELS[t], tx + 36, y);
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
    ctx.fillText(String(breakdown[t]), tx + 36, y + 16);
  }
}

function drawCodexLog(ctx, px, cy, pw, ch, registry, gs) {
  const log = registry.log;
  const scroll = gs.codexScroll || 0;
  const rowH = 42;
  const visibleRows = Math.floor(ch / rowH);
  const maxScroll = Math.max(0, log.length - visibleRows);
  if (gs.codexScroll > maxScroll) gs.codexScroll = maxScroll;

  ctx.textBaseline = 'top';
  if (log.length === 0) {
    ctx.fillStyle = '#555'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
    ctx.fillText('No discoveries yet. Go explore!', px + pw / 2, cy + 40);
    return;
  }

  // Header
  ctx.fillStyle = '#888'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
  ctx.fillText('DAY', px + 24, cy - 2);
  ctx.fillText('DISCOVERER', px + 80, cy - 2);
  ctx.fillText('RARITY', px + 220, cy - 2);
  ctx.fillText('MODE', px + 340, cy - 2);
  ctx.fillText('HASH', px + 410, cy - 2);

  // Rows — show newest first
  const startIdx = Math.max(0, log.length - 1 - scroll);
  for (let vi = 0; vi < visibleRows && (startIdx - vi) >= 0; vi++) {
    const entry = log[startIdx - vi];
    const y = cy + 14 + vi * rowH;

    // Alternating row bg
    if (vi % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(px + 16, y - 2, pw - 32, rowH - 2);
    }

    // Biomorph sprite
    const regEntry = registry.entries[entry.hash];
    const fakeOrg = {
      kind: 'organism', id: `log-${vi}`,
      genes: (regEntry && regEntry.genes) || [],
      mode: entry.mode,
      colorGenes: (regEntry && regEntry.colorGenes) || { hue: 4, spread: 0 },
      stage: 'mature', growthProgress: 8, matureDays: 8,
    };
    if (fakeOrg.genes.length > 0) {
      ctx.drawImage(getSprite(fakeOrg, 32), px + 640, y - 2);
    }

    // Day
    ctx.fillStyle = '#aaa'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`D${entry.day}`, px + 24, y + 6);

    // Discoverer
    const dName = DISCOVERER_NAMES[entry.discoverer] || entry.discoverer;
    ctx.fillStyle = DISCOVERER_COLORS[entry.discoverer] || '#888';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(dName, px + 80, y + 6);

    // Rarity badge
    ctx.fillStyle = RARITY_COLORS[entry.rarity] || '#aaa';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(RARITY_LABELS[entry.rarity] || entry.rarity, px + 220, y + 6);

    // Mode
    ctx.fillStyle = '#aaa'; ctx.font = '11px monospace';
    ctx.fillText(`M${entry.mode}`, px + 340, y + 6);

    // Hash (truncated)
    ctx.fillStyle = '#555'; ctx.font = '9px monospace';
    const hashStr = entry.hash || '';
    ctx.fillText(hashStr.length > 30 ? hashStr.slice(0, 30) + '...' : hashStr, px + 410, y + 6);
  }

  // Scroll indicator
  if (log.length > visibleRows) {
    ctx.fillStyle = '#555'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
    ctx.fillText(`${Math.min(scroll + 1, log.length)}-${Math.min(scroll + visibleRows, log.length)} of ${log.length}`, px + pw - 20, cy - 2);
  }
}

function drawCodexMorphospace(ctx, px, cy, pw, ch, registry) {
  const grid = getMorphospaceData(registry);
  const centerX = px + pw / 2;

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#aaa'; ctx.font = '13px monospace';
  ctx.fillText('Morphospace Heatmap', centerX, cy);
  ctx.fillStyle = '#666'; ctx.font = '10px monospace';
  ctx.fillText('Brightness = discovery density. Dark = unexplored.', centerX, cy + 18);

  // Grid: 5 modes (x) × 8 depths (y)
  const cellW = 70, cellH = 50;
  const gridW = 5 * cellW, gridH = 8 * cellH;
  const gridX = centerX - gridW / 2;
  const gridY = cy + 44;

  // Find max for normalization
  let maxVal = 1;
  for (let m = 0; m < 5; m++)
    for (let d = 0; d < 8; d++)
      if (grid[m][d] > maxVal) maxVal = grid[m][d];

  // Column headers (modes)
  ctx.fillStyle = '#888'; ctx.font = 'bold 10px monospace'; ctx.textBaseline = 'bottom';
  for (let m = 0; m < 5; m++) {
    ctx.fillText(`Mode ${m + 1}`, gridX + m * cellW + cellW / 2, gridY - 4);
  }

  // Row labels (depths)
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let d = 0; d < 8; d++) {
    ctx.fillStyle = '#666'; ctx.font = '10px monospace';
    ctx.fillText(`D${d + 1}`, gridX - 6, gridY + d * cellH + cellH / 2);
  }

  // Cells
  for (let m = 0; m < 5; m++) {
    for (let d = 0; d < 8; d++) {
      const val = grid[m][d];
      const intensity = val / maxVal;
      const cx = gridX + m * cellW;
      const cy2 = gridY + d * cellH;

      // Heatmap color: dark blue → bright cyan/white
      const r = Math.floor(20 + intensity * 80);
      const g = Math.floor(20 + intensity * 180);
      const b = Math.floor(40 + intensity * 200);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(cx + 1, cy2 + 1, cellW - 2, cellH - 2);

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 1, cy2 + 1, cellW - 2, cellH - 2);

      // Count label
      if (val > 0) {
        ctx.fillStyle = intensity > 0.5 ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.font = intensity > 0.3 ? 'bold 12px monospace' : '10px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(val), cx + cellW / 2, cy2 + cellH / 2);
      }
    }
  }
}

// ── Pause Overlay ──

function drawPauseOverlay(ctx) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e0e0e0';
  ctx.font = 'bold 40px monospace';
  ctx.fillText('PAUSED', CANVAS_W / 2, CANVAS_H / 2 - 20);
  ctx.fillStyle = '#888';
  ctx.font = '14px monospace';
  ctx.fillText('[P] Resume', CANVAS_W / 2, CANVAS_H / 2 + 24);
}

// ── Settings Indicators ──

function drawSettingsIndicators(ctx, gs) {
  const s = gs.audioSettings;
  if (!s) return;
  const tutActive = gs.tutorialState && gs.tutorialState.active && !gs.tutorialState.completed;

  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';

  let x = CANVAS_W - 8;
  const y = 6;

  // Music toggle
  ctx.fillStyle = s.musicEnabled ? 'rgba(100,200,100,0.7)' : 'rgba(120,120,120,0.5)';
  ctx.fillText(`[M] Music ${s.musicEnabled ? 'ON' : 'OFF'}`, x, y);

  // Voice toggle
  x -= 110;
  ctx.fillStyle = s.voiceEnabled ? 'rgba(100,200,100,0.7)' : 'rgba(120,120,120,0.5)';
  ctx.fillText(`[V] Voice ${s.voiceEnabled ? 'ON' : 'OFF'}`, x, y);

  // Auto-follow toggle (always shown, not just during tutorial)
  x -= 110;
  ctx.fillStyle = s.autoFollow ? 'rgba(100,200,100,0.7)' : 'rgba(120,120,120,0.5)';
  ctx.fillText(`[F] Follow ${s.autoFollow ? 'ON' : 'OFF'}`, x, y);

  // Follow NPC indicator
  if (gs.followNpcIdx >= 0) {
    const npc = NPCS[gs.followNpcIdx];
    if (npc) {
      const followText = `Following ${npc.name}`;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,215,0,0.85)';
      ctx.fillText(followText, CANVAS_W / 2, 6);
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(200,200,200,0.6)';
      ctx.fillText('[Q] or [Esc] to stop', CANVAS_W / 2, 20);
    }
  }
}

// ── Helpers ──

function overlayBg(ctx) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }

function drawPanel(ctx, x, y, w, h, title) {
  ctx.fillStyle = '#14142a'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#1e1e3e'; ctx.fillRect(x, y, w, 34);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(title, x+w/2, y+17);
}

function drawInvGrid(ctx, inv, selectedSlot, x, y, highlightIdx, hlColor) {
  const cell = 56, cols = 9;
  for (let i = 0; i < Math.max(inv.length, 1); i++) {
    const gc = i%cols, gr = Math.floor(i/cols);
    const cx = x + gc*(cell+4), cy = y + gr*(cell+14);
    ctx.fillStyle = i===selectedSlot ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(cx, cy, cell, cell);
    if (i === highlightIdx) { ctx.strokeStyle = hlColor; ctx.lineWidth = 3; ctx.strokeRect(cx-1,cy-1,cell+2,cell+2); }
    else { ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 1; ctx.strokeRect(cx,cy,cell,cell); }
    ctx.fillStyle = '#555'; ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(String(i+1), cx+2, cy+1);
    if (i < inv.length) {
      const item = inv[i];
      if (item.kind === 'material') {
        drawMaterialSlot(ctx, item, cx, cy, cell);
      } else if (item.kind === 'tool') {
        drawToolSlot(ctx, item, cx, cy, cell);
      } else if (item.kind === 'product') {
        drawProductSlot(ctx, item, cx, cy, cell);
      } else {
        ctx.drawImage(getSprite(item, 42), cx+7, cy+9);
      }
      ctx.fillStyle = '#888'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`${sellPrice(item)}g`, cx+cell/2, cy+cell+1); ctx.textAlign = 'left';
    }
  }
}

function farmLabel(fg) {
  if (!fg) return 'common';
  const parts = [];
  if (fg.fertility >= 3) parts.push('fertile');
  else if (fg.fertility === 1) parts.push('rare');
  if (fg.longevity >= 2) parts.push(fg.longevity === 3 ? 'perennial' : 'hardy');
  if (fg.vigor === 3) parts.push('fast');
  else if (fg.vigor === 1) parts.push('slow');
  return parts.length ? parts.join(', ') : 'common';
}

function farmTraitLine(org) {
  const fg = org.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
  return `F${fg.fertility} L${fg.longevity} V${fg.vigor}`;
}

function spectatorFooter(gs) {
  if (!gs.spectator) return null;
  const s = gs.spectator;
  const step = `${s.stepIdx + 1}/${s.steps.length}`;
  return s.done
    ? `[Space] Done  \u00B7  [Esc] Stop watching`
    : `[Space] Next step (${step})  \u00B7  [Esc] Stop watching`;
}

function drawSpectatorBanner(ctx, gs) {
  const spec = gs.spectator;
  if (!spec) return;
  // Draw over the panel header area (y=50) — canvas top may be clipped by viewport
  const bx = 50, by = 50, bw = 860;
  const hasLabel = !!gs.spectatorLabel;
  const bannerH = hasLabel ? 46 : 34;
  const npcCol = spec.npcColor || '#8ab4f8';
  // Banner background
  ctx.fillStyle = '#1a1a3a';
  ctx.fillRect(bx, by, bw, bannerH);
  ctx.strokeStyle = npcCol;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bannerH);
  // Bottom accent line
  ctx.beginPath(); ctx.moveTo(bx, by + bannerH); ctx.lineTo(bx + bw, by + bannerH); ctx.stroke();

  // Step counter
  const stepStr = `(${spec.stepIdx + 1}/${spec.steps.length})`;

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = npcCol; ctx.font = 'bold 14px monospace';
  const titleY = hasLabel ? by + 14 : by + bannerH / 2;
  ctx.fillText(`Watching ${spec.npcName} \u2014 ${spec.actionLabel}  ${stepStr}`, bx + bw / 2, titleY);

  // Step label (narration text set by apply)
  if (hasLabel) {
    ctx.fillStyle = '#ffd700'; ctx.font = '12px monospace';
    ctx.fillText(gs.spectatorLabel, bx + bw / 2, by + 34);
  }

  // Hints
  ctx.fillStyle = '#7aa8d4'; ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(spec.done ? '[Space] Done' : '[Space] Next', bx + 12, titleY);
  ctx.textAlign = 'right';
  ctx.fillText('[Esc] Stop', bx + bw - 12, titleY);
  ctx.textAlign = 'left';
}

function drawCommandBar(ctx, gs) {
  const bar = gs.commandBar;
  if (!bar || !bar.active) return;
  const barH = 30;
  const barY = HUD_Y - barH - 6;
  const barX = 120;
  const barW = CANVAS_W - 240;
  // Dark background
  ctx.fillStyle = 'rgba(10, 10, 30, 0.92)';
  ctx.beginPath();
  const r = 6;
  ctx.moveTo(barX + r, barY);
  ctx.lineTo(barX + barW - r, barY);
  ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + r);
  ctx.lineTo(barX + barW, barY + barH - r);
  ctx.quadraticCurveTo(barX + barW, barY + barH, barX + barW - r, barY + barH);
  ctx.lineTo(barX + r, barY + barH);
  ctx.quadraticCurveTo(barX, barY + barH, barX, barY + barH - r);
  ctx.lineTo(barX, barY + r);
  ctx.quadraticCurveTo(barX, barY, barX + r, barY);
  ctx.closePath();
  ctx.fill();
  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Prompt + text
  ctx.font = '14px monospace';
  ctx.fillStyle = '#888';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textY = barY + barH / 2;
  if (bar.suggestion) {
    // AI suggestion mode: different prompt and hint
    ctx.fillStyle = '#f8d48a';
    ctx.fillText('AI\u2192', barX + 6, textY);
    ctx.fillStyle = '#fff';
    ctx.fillText(bar.text, barX + 38, textY);
    // Hint on right side
    ctx.fillStyle = '#666';
    ctx.textAlign = 'right';
    ctx.fillText('[Enter] run \u2022 [Esc] cancel', barX + barW - 10, textY);
    ctx.textAlign = 'left';
  } else {
    ctx.fillText('>', barX + 10, textY);
    ctx.fillStyle = '#fff';
    ctx.fillText(bar.text, barX + 24, textY);
  }
  // Blinking cursor
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    const xOff = bar.suggestion ? 38 : 24;
    const tw = ctx.measureText(bar.text).width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(barX + xOff + tw + 1, textY - 7, 2, 14);
  }
}

function drawMessage(ctx, lines) {
  ctx.font = 'bold 14px monospace';
  const lineH = 20;
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = maxW + 28;
  const boxH = lines.length * lineH + 14;
  const mx = CANVAS_W / 2;
  const boxY = HUD_Y - boxH - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(mx - boxW / 2, boxY, boxW, boxH);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  ctx.strokeRect(mx - boxW / 2, boxY, boxW, boxH);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], mx, boxY + 7 + lineH / 2 + i * lineH);
  }
}
