// Iron Horizon - Canvas Renderer
import { GameState, Unit, Building, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, BUILDING_STATS, UNIT_STATS } from './types';

const TERRAIN_COLORS: Record<string, string> = {
  plain: '#4a5c3a',
  rock: '#6b6b6b',
  forest: '#2d4a2d',
  road: '#7a7a6a',
  resource: '#8b7a2a',
  water: '#2a4a6b',
  rubble: '#5a5a4a',
};

const FOG_COLOR = 'rgba(0, 0, 0, 0.7)';
const EXPLORED_COLOR = 'rgba(0, 0, 0, 0.4)';

const PLAYER_COLORS = ['#4488ff', '#ff4444'];
const PLAYER_COLORS_DARK = ['#2255aa', '#aa2222'];

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasWidth: number,
  canvasHeight: number
) {
  const { camera } = state;
  const zoom = camera.zoom;
  const tileSize = TILE_SIZE * zoom;

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.translate(-camera.x * zoom, -camera.y * zoom);
  ctx.scale(zoom, zoom);

  // Calculate visible tile range
  const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - 1);
  const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - 1);
  const endX = Math.min(MAP_WIDTH, Math.ceil((camera.x + canvasWidth / zoom) / TILE_SIZE) + 1);
  const endY = Math.min(MAP_HEIGHT, Math.ceil((camera.y + canvasHeight / zoom) / TILE_SIZE) + 1);

  // Draw terrain
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = state.tiles[y][x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      if (tile.visible[0]) {
        ctx.fillStyle = TERRAIN_COLORS[tile.terrain] || TERRAIN_COLORS.plain;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Resource sparkle
        if (tile.terrain === 'resource' && tile.resourceAmount && tile.resourceAmount > 0) {
          ctx.fillStyle = '#ccaa33';
          ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          ctx.fillStyle = '#eedd55';
          ctx.fillRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        }

        // Forest trees
        if (tile.terrain === 'forest') {
          ctx.fillStyle = '#1a3a1a';
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3a6a3a';
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2 - 3, py + TILE_SIZE / 2 - 3, TILE_SIZE * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }

        // Rock texture
        if (tile.terrain === 'rock') {
          ctx.fillStyle = '#555555';
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE * 0.3, py + TILE_SIZE * 0.4, TILE_SIZE * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#777777';
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE * 0.6, py + TILE_SIZE * 0.6, TILE_SIZE * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Grid lines (subtle)
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
      } else if (tile.explored[0]) {
        ctx.fillStyle = TERRAIN_COLORS[tile.terrain] || TERRAIN_COLORS.plain;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = EXPLORED_COLOR;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = '#111111';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Draw buildings
  for (const building of state.buildings) {
    if (building.state === 'destroyed') continue;
    const stats = BUILDING_STATS[building.type];
    const bx = building.x * TILE_SIZE;
    const by = building.y * TILE_SIZE;
    const bw = stats.width * TILE_SIZE;
    const bh = stats.height * TILE_SIZE;

    // Check visibility
    const midX = building.x + Math.floor(stats.width / 2);
    const midY = building.y + Math.floor(stats.height / 2);
    if (midX >= 0 && midX < MAP_WIDTH && midY >= 0 && midY < MAP_HEIGHT) {
      if (!state.tiles[midY][midX].visible[0] && !state.tiles[midY][midX].explored[0]) continue;
      const isFogged = !state.tiles[midY][midX].visible[0];

      drawBuilding(ctx, building, bx, by, bw, bh, isFogged, state.selection.includes(building.id));
    }
  }

  // Draw units
  for (const unit of state.units) {
    if (unit.state === 'dead') continue;
    const ux = unit.x * TILE_SIZE;
    const uy = unit.y * TILE_SIZE;

    // Check visibility
    const tileX = Math.floor(unit.x);
    const tileY = Math.floor(unit.y);
    if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
      const isVisible = state.tiles[tileY][tileX].visible[0];
      const isExplored = state.tiles[tileY][tileX].explored[0];

      if (!isVisible && !isExplored) continue;
      if (!isVisible && unit.owner === 1) continue; // Can't see enemy in fog

      drawUnit(ctx, unit, ux, uy, isVisible);
    }
  }

  // Draw projectiles
  for (const proj of state.projectiles) {
    const px = proj.x * TILE_SIZE;
    const py = proj.y * TILE_SIZE;

    ctx.fillStyle = proj.type === 'missile' ? '#ff6600' : proj.type === 'shell' ? '#ffaa00' : '#ffff00';
    const size = proj.type === 'shell' ? 4 : proj.type === 'missile' ? 3 : 2;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();

    // Trail
    ctx.strokeStyle = proj.type === 'missile' ? 'rgba(255,100,0,0.5)' : 'rgba(255,255,0,0.3)';
    ctx.lineWidth = 1;
    const dx = proj.targetX - proj.x;
    const dy = proj.targetY - proj.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - (dx / d) * 8, py - (dy / d) * 8);
      ctx.stroke();
    }
  }

  // Draw particles
  for (const particle of state.particles) {
    const px = particle.x * TILE_SIZE;
    const py = particle.y * TILE_SIZE;
    const alpha = particle.life / particle.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(px, py, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Draw selection box
  if (state.selectionBox) {
    const { x1, y1, x2, y2 } = state.selectionBox;
    const sx = Math.min(x1, x2) * TILE_SIZE;
    const sy = Math.min(y1, y2) * TILE_SIZE;
    const sw = Math.abs(x2 - x1) * TILE_SIZE;
    const sh = Math.abs(y2 - y1) * TILE_SIZE;
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(sx, sy, sw, sh);
  }

  // Draw building placement preview (using a stored position from input)
  if (state.placingBuilding && (state as any)._previewX !== undefined) {
    const stats = BUILDING_STATS[state.placingBuilding];
    const px = (state as any)._previewX * TILE_SIZE;
    const py = (state as any)._previewY * TILE_SIZE;
    const pw = stats.width * TILE_SIZE;
    const ph = stats.height * TILE_SIZE;
    const canPlace = (state as any)._canPlace;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = canPlace ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = canPlace ? '#00ff00' : '#ff0000';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
    ctx.globalAlpha = 1;
  }

  // Fog of war overlay for non-visible areas
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = state.tiles[y][x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      if (!tile.visible[0] && tile.explored[0]) {
        ctx.fillStyle = EXPLORED_COLOR;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      } else if (!tile.explored[0]) {
        ctx.fillStyle = FOG_COLOR;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, building: Building, x: number, y: number, w: number, h: number, fogged: boolean, selected: boolean) {
  const color = PLAYER_COLORS[building.owner];
  const darkColor = PLAYER_COLORS_DARK[building.owner];

  ctx.globalAlpha = fogged ? 0.5 : 1;

  switch (building.type) {
    case 'command_center':
      // Large base structure
      ctx.fillStyle = darkColor;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
      // Antenna
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 8);
      ctx.lineTo(x + w / 2, y - 5);
      ctx.stroke();
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(x + w / 2, y - 5, 3, 0, Math.PI * 2);
      ctx.fill();
      // Windows
      ctx.fillStyle = '#aaddff';
      ctx.fillRect(x + 15, y + 20, 8, 6);
      ctx.fillRect(x + w - 23, y + 20, 8, 6);
      break;

    case 'factory':
      ctx.fillStyle = '#555555';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      // Chimney
      ctx.fillStyle = '#444444';
      ctx.fillRect(x + w - 20, y - 8, 10, 16);
      // Door
      ctx.fillStyle = '#333333';
      ctx.fillRect(x + w - 12, y + h / 2 - 10, 12, 20);
      break;

    case 'research_lab':
      ctx.fillStyle = '#445566';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      // Dome
      ctx.fillStyle = '#88aacc';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'power_plant':
      ctx.fillStyle = '#555544';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      // Lightning bolt
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 4, y + 8);
      ctx.lineTo(x + w / 2 + 2, y + h / 2);
      ctx.lineTo(x + w / 2 - 2, y + h / 2);
      ctx.lineTo(x + w / 2 + 4, y + h - 8);
      ctx.lineTo(x + w / 2 - 2, y + h / 2);
      ctx.lineTo(x + w / 2 + 2, y + h / 2);
      ctx.closePath();
      ctx.fill();
      break;

    case 'repair_bay':
      ctx.fillStyle = '#445544';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      // Cross
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(x + w / 2 - 2, y + 10, 4, h - 20);
      ctx.fillRect(x + 10, y + h / 2 - 2, w - 20, 4);
      break;

    case 'radar_station':
      ctx.fillStyle = '#444455';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      // Dish
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.3, -Math.PI * 0.7, Math.PI * 0.2);
      ctx.stroke();
      break;

    case 'defense_tower':
      ctx.fillStyle = '#555555';
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Barrel
      ctx.fillStyle = '#333333';
      ctx.fillRect(x + w / 2 - 2, y + 2, 4, h / 2);
      break;

    case 'wall':
      ctx.fillStyle = '#666666';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = color;
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      break;
  }

  // Construction progress
  if (building.state === 'constructing') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y + h - 8, w, 6);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(x, y + h - 8, w * building.buildProgress, 6);
  }

  // Health bar
  if (building.state === 'active' && building.hp < building.maxHp) {
    const barWidth = w - 4;
    const hpRatio = building.hp / building.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x + 2, y - 6, barWidth, 4);
    ctx.fillStyle = hpRatio > 0.5 ? '#00ff00' : hpRatio > 0.25 ? '#ffaa00' : '#ff0000';
    ctx.fillRect(x + 2, y - 6, barWidth * hpRatio, 4);
  }

  // Selection indicator
  if (selected) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }

  ctx.globalAlpha = 1;
}

function drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, x: number, y: number, visible: boolean) {
  ctx.globalAlpha = visible ? 1 : 0.6;
  const color = PLAYER_COLORS[unit.owner];
  const darkColor = PLAYER_COLORS_DARK[unit.owner];
  const size = unit.stats.size * TILE_SIZE * 0.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(unit.angle);

  switch (unit.type) {
    case 'scout':
      // Small fast vehicle
      ctx.fillStyle = darkColor;
      ctx.fillRect(-size * 0.7, -size * 0.4, size * 1.4, size * 0.8);
      ctx.fillStyle = color;
      ctx.fillRect(-size * 0.5, -size * 0.3, size * 1.0, size * 0.6);
      // Gun
      ctx.fillStyle = '#333';
      ctx.fillRect(size * 0.3, -1.5, size * 0.5, 3);
      break;

    case 'buggy':
      ctx.fillStyle = darkColor;
      ctx.fillRect(-size * 0.8, -size * 0.5, size * 1.6, size);
      ctx.fillStyle = color;
      ctx.fillRect(-size * 0.6, -size * 0.4, size * 1.2, size * 0.8);
      ctx.fillStyle = '#333';
      ctx.fillRect(size * 0.4, -2, size * 0.6, 4);
      // Wheels
      ctx.fillStyle = '#222';
      ctx.fillRect(-size * 0.7, -size * 0.55, size * 0.3, size * 0.1);
      ctx.fillRect(-size * 0.7, size * 0.45, size * 0.3, size * 0.1);
      ctx.fillRect(size * 0.4, -size * 0.55, size * 0.3, size * 0.1);
      ctx.fillRect(size * 0.4, size * 0.45, size * 0.3, size * 0.1);
      break;

    case 'medium_tank':
      // Tank body
      ctx.fillStyle = darkColor;
      ctx.fillRect(-size * 0.9, -size * 0.6, size * 1.8, size * 1.2);
      ctx.fillStyle = color;
      ctx.fillRect(-size * 0.7, -size * 0.5, size * 1.4, size);
      // Turret
      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Barrel
      ctx.fillStyle = '#333';
      ctx.fillRect(size * 0.3, -2.5, size * 0.8, 5);
      // Tracks
      ctx.fillStyle = '#222';
      ctx.fillRect(-size * 0.85, -size * 0.65, size * 1.7, size * 0.12);
      ctx.fillRect(-size * 0.85, size * 0.53, size * 1.7, size * 0.12);
      break;

    case 'heavy_tank':
      // Larger tank
      ctx.fillStyle = darkColor;
      ctx.fillRect(-size, -size * 0.7, size * 2, size * 1.4);
      ctx.fillStyle = color;
      ctx.fillRect(-size * 0.8, -size * 0.6, size * 1.6, size * 1.2);
      // Large turret
      ctx.fillStyle = darkColor;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      // Heavy barrel
      ctx.fillStyle = '#333';
      ctx.fillRect(size * 0.3, -3.5, size * 1.0, 7);
      // Extra armor
      ctx.fillStyle = '#555';
      ctx.fillRect(-size * 0.9, -size * 0.3, size * 0.2, size * 0.6);
      // Tracks
      ctx.fillStyle = '#222';
      ctx.fillRect(-size * 0.95, -size * 0.75, size * 1.9, size * 0.15);
      ctx.fillRect(-size * 0.95, size * 0.6, size * 1.9, size * 0.15);
      break;

    case 'artillery':
      ctx.fillStyle = darkColor;
      ctx.fillRect(-size * 0.8, -size * 0.5, size * 1.6, size);
      ctx.fillStyle = color;
      ctx.fillRect(-size * 0.6, -size * 0.4, size * 1.2, size * 0.8);
      // Long barrel
      ctx.fillStyle = '#333';
      ctx.fillRect(size * 0.2, -2, size * 1.4, 4);
      // Base plate
      ctx.fillStyle = '#555';
      ctx.fillRect(-size * 0.9, -size * 0.2, size * 0.3, size * 0.4);
      break;

    case 'missile':
      ctx.fillStyle = darkColor;
      ctx.fillRect(-size * 0.8, -size * 0.5, size * 1.6, size);
      ctx.fillStyle = color;
      ctx.fillRect(-size * 0.6, -size * 0.4, size * 1.2, size * 0.8);
      // Missile pods
      ctx.fillStyle = '#555';
      ctx.fillRect(-size * 0.3, -size * 0.6, size * 0.6, size * 0.2);
      ctx.fillRect(-size * 0.3, size * 0.4, size * 0.6, size * 0.2);
      // Missiles
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(-size * 0.2, -size * 0.55, size * 0.4, size * 0.1);
      ctx.fillRect(-size * 0.2, size * 0.45, size * 0.4, size * 0.1);
      break;

    case 'aa_vehicle':
      ctx.fillStyle = darkColor;
      ctx.fillRect(-size * 0.8, -size * 0.5, size * 1.6, size);
      ctx.fillStyle = color;
      ctx.fillRect(-size * 0.6, -size * 0.4, size * 1.2, size * 0.8);
      // Twin barrels (angled up)
      ctx.fillStyle = '#333';
      ctx.fillRect(size * 0.2, -4, size * 0.7, 3);
      ctx.fillRect(size * 0.2, 1, size * 0.7, 3);
      // Radar dish
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -size * 0.3, size * 0.2, -Math.PI * 0.8, Math.PI * 0.3);
      ctx.stroke();
      break;

    case 'repair':
      ctx.fillStyle = '#336633';
      ctx.fillRect(-size * 0.7, -size * 0.5, size * 1.4, size);
      ctx.fillStyle = '#44aa44';
      ctx.fillRect(-size * 0.5, -size * 0.4, size, size * 0.8);
      // Crane arm
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(size * 0.3, 0);
      ctx.lineTo(size * 0.7, -size * 0.3);
      ctx.stroke();
      // Cross
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(-3, -size * 0.25, 6, size * 0.5);
      ctx.fillRect(-size * 0.25, -3, size * 0.5, 6);
      break;

    case 'harvester':
      ctx.fillStyle = '#665522';
      ctx.fillRect(-size * 0.9, -size * 0.6, size * 1.8, size * 1.2);
      ctx.fillStyle = '#887733';
      ctx.fillRect(-size * 0.7, -size * 0.5, size * 1.4, size);
      // Bucket
      ctx.fillStyle = '#aa8833';
      ctx.fillRect(size * 0.5, -size * 0.4, size * 0.4, size * 0.8);
      // Cargo indicator
      if (unit.harvestAmount > 0) {
        ctx.fillStyle = '#ccaa33';
        const fill = unit.harvestAmount / 50;
        ctx.fillRect(-size * 0.5, -size * 0.3, size * 0.8 * fill, size * 0.6);
      }
      break;
  }

  ctx.restore();

  // Health bar
  if (unit.hp < unit.maxHp) {
    const barWidth = size * 1.5;
    const hpRatio = unit.hp / unit.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - barWidth / 2, y - size - 6, barWidth, 3);
    ctx.fillStyle = hpRatio > 0.5 ? '#00ff00' : hpRatio > 0.25 ? '#ffaa00' : '#ff0000';
    ctx.fillRect(x - barWidth / 2, y - size - 6, barWidth * hpRatio, 3);
  }

  // Selection circle
  if (unit.selected) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, size + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

// Minimap renderer
export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number
) {
  const scaleX = width / MAP_WIDTH;
  const scaleY = height / MAP_HEIGHT;

  // Background
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);

  // Terrain (simplified)
  for (let y = 0; y < MAP_HEIGHT; y += 2) {
    for (let x = 0; x < MAP_WIDTH; x += 2) {
      const tile = state.tiles[y][x];
      if (tile.explored[0]) {
        switch (tile.terrain) {
          case 'plain': ctx.fillStyle = '#3a4a2a'; break;
          case 'rock': ctx.fillStyle = '#555'; break;
          case 'forest': ctx.fillStyle = '#1a3a1a'; break;
          case 'road': ctx.fillStyle = '#5a5a4a'; break;
          case 'resource': ctx.fillStyle = '#8a7a2a'; break;
          case 'water': ctx.fillStyle = '#1a3a5a'; break;
          default: ctx.fillStyle = '#3a4a2a';
        }
        ctx.fillRect(x * scaleX, y * scaleY, scaleX * 2 + 1, scaleY * 2 + 1);
      }
    }
  }

  // Buildings
  for (const building of state.buildings) {
    if (building.state === 'destroyed') continue;
    const stats = BUILDING_STATS[building.type];
    ctx.fillStyle = PLAYER_COLORS[building.owner];
    ctx.fillRect(
      building.x * scaleX,
      building.y * scaleY,
      stats.width * scaleX + 1,
      stats.height * scaleY + 1
    );
  }

  // Units
  for (const unit of state.units) {
    if (unit.state === 'dead') continue;
    const tileX = Math.floor(unit.x);
    const tileY = Math.floor(unit.y);
    if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
      if (state.tiles[tileY][tileX].visible[0] || unit.owner === 0) {
        ctx.fillStyle = PLAYER_COLORS[unit.owner];
        ctx.fillRect(unit.x * scaleX - 1, unit.y * scaleY - 1, 3, 3);
      }
    }
  }

  // Camera viewport
  const cam = state.camera;
  const viewW = (window.innerWidth / cam.zoom) / TILE_SIZE;
  const viewH = (window.innerHeight / cam.zoom) / TILE_SIZE;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    cam.x / TILE_SIZE * scaleX,
    cam.y / TILE_SIZE * scaleY,
    viewW * scaleX,
    viewH * scaleY
  );
}
