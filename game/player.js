// Player position, movement, facing, inventory, wallet

import { TILE_SIZE, COLS, ROWS, tileAt, isSolid } from './world.js';

const PLAYER_SIZE = 28;
const SPEED = 180; // pixels per second

export function createPlayer() {
  return {
    x: 15 * TILE_SIZE + TILE_SIZE / 2,   // on center path
    y: 8 * TILE_SIZE + TILE_SIZE / 2,
    facing: 'down',
    inventory: [],
    wallet: 100,
    selectedSlot: 0,
  };
}

export function updatePlayer(player, input, grid, dt) {
  let dx = 0, dy = 0;
  if (input.ArrowLeft)  dx -= 1;
  if (input.ArrowRight) dx += 1;
  if (input.ArrowUp)    dy -= 1;
  if (input.ArrowDown)  dy += 1;

  if (dx === 0 && dy === 0) return;

  // Update facing
  if (Math.abs(dx) >= Math.abs(dy)) {
    player.facing = dx < 0 ? 'left' : 'right';
  } else {
    player.facing = dy < 0 ? 'up' : 'down';
  }

  // Normalize diagonal movement
  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

  const moveX = dx * SPEED * dt;
  const moveY = dy * SPEED * dt;

  // Try X and Y independently (allows wall sliding)
  if (canMoveTo(player.x + moveX, player.y, grid)) player.x += moveX;
  if (canMoveTo(player.x, player.y + moveY, grid)) player.y += moveY;
}

function canMoveTo(x, y, grid) {
  const half = PLAYER_SIZE / 2;
  return !isSolid(tileAtPixel(x - half, y - half, grid))
      && !isSolid(tileAtPixel(x + half - 1, y - half, grid))
      && !isSolid(tileAtPixel(x - half, y + half - 1, grid))
      && !isSolid(tileAtPixel(x + half - 1, y + half - 1, grid));
}

function tileAtPixel(px, py, grid) {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  return tileAt(grid, col, row);
}

export function facingTile(player) {
  const col = Math.floor(player.x / TILE_SIZE);
  const row = Math.floor(player.y / TILE_SIZE);
  switch (player.facing) {
    case 'up':    return { col, row: row - 1 };
    case 'down':  return { col, row: row + 1 };
    case 'left':  return { col: col - 1, row };
    case 'right': return { col: col + 1, row };
  }
}

export function playerTile(player) {
  return {
    col: Math.floor(player.x / TILE_SIZE),
    row: Math.floor(player.y / TILE_SIZE),
  };
}
