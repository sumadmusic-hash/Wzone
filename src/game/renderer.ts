// Iron Horizon - Isometric Renderer (Warzone 2100 Style)
import { GameState, Unit, Building, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, BUILDING_STATS } from './types';

// Isometric conversion
function toIso(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: (x - y) * (TILE_SIZE * 0.5),
    sy: (x + y) * (TILE_SIZE * 0.25),
  };
}

const TERRAIN_COLORS: Record<string, { base: string; dark: string; light: string }> = {
  plain: { base: '#4a5a3a', dark: '#3a4a2a', light: '#5a6a4a' },
  rock: { base: '#5a5a5a', dark: '#3a3a3a', light: '#7a7a7a' },
  forest: { base: '#2a4a2a', dark: '#1a3a1a', light: '#3a5a3a' },
  road: { base: '#6a6a5a', dark: '#4a4a3a', light: '#8a8a7a' },
  resource: { base: '#7a6a2a', dark: '#5a4a1a', light: '#9a8a4a' },
  water: { base: '#2a3a5a', dark: '#1a2a4a', light: '#3a4a6a' },
  rubble: { base: '#5a4a3a', dark: '#3a2a1a', light: '#7a6a5a' },
};

const PLAYER_COLORS = {
  0: { main: '#3366aa', dark: '#224488', light: '#4488cc', accent: '#88bbee' },
  1: { main: '#aa3333', dark: '#882222', light: '#cc4444', accent: '#ee8888' },
};

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasWidth: number,
  canvasHeight: number
) {
  const { camera } = state;
  const zoom = camera.zoom;

  // Disable image smoothing for pixel-art look
  ctx.imageSmoothingEnabled = false;

  // Dark background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 3);
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x, -camera.y);

  // Calculate visible tile range (approximate for iso)
  const invZoom = 1 / zoom;
  const viewTilesX = canvasWidth * invZoom / TILE_SIZE;
  const viewTilesY = canvasHeight * invZoom / TILE_SIZE;
  
  // Convert camera center to tile coords
  const centerIsoX = camera.x;
  const centerIsoY = camera.y;
  
  const startX = Math.max(0, Math.floor(centerIsoX / TILE_SIZE - viewTilesX));
  const startY = Math.max(0, Math.floor(centerIsoY / TILE_SIZE - viewTilesY));
  const endX = Math.min(MAP_WIDTH, Math.ceil(centerIsoX / TILE_SIZE + viewTilesX));
  const endY = Math.min(MAP_HEIGHT, Math.ceil(centerIsoY / TILE_SIZE + viewTilesY));

  // Draw terrain (back to front for proper overlap)
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = state.tiles[y][x];
      
      if (tile.visible[0]) {
        drawTerrainTile(ctx, tile, x, y);
      } else if (tile.explored[0]) {
        drawTerrainTile(ctx, tile, x, y);
        const iso = toIso(x, y);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        drawIsoDiamond(ctx, iso.sx, iso.sy, TILE_SIZE);
      } else {
        const iso = toIso(x, y);
        ctx.fillStyle = '#050505';
        drawIsoDiamond(ctx, iso.sx, iso.sy, TILE_SIZE);
      }
    }
  }

  // Collect all renderable objects and sort by depth
  const renderables: { depth: number; draw: () => void }[] = [];

  // Buildings
  for (const building of state.buildings) {
    if (building.state === 'destroyed') continue;
    const stats = BUILDING_STATS[building.type];
    const midX = building.x + stats.width / 2;
    const midY = building.y + stats.height / 2;
    if (midX >= 0 && midX < MAP_WIDTH && midY >= 0 && midY < MAP_HEIGHT) {
      if (!state.tiles[Math.floor(midY)][Math.floor(midX)].visible[0] && 
          !state.tiles[Math.floor(midY)][Math.floor(midX)].explored[0]) continue;
      const isFogged = !state.tiles[Math.floor(midY)][Math.floor(midX)].visible[0];
      const depth = midX + midY;
      renderables.push({
        depth,
        draw: () => drawBuilding(ctx, building, state.selection.includes(building.id), isFogged),
      });
    }
  }

  // Units
  for (const unit of state.units) {
    if (unit.state === 'dead') continue;
    const tileX = Math.floor(unit.x);
    const tileY = Math.floor(unit.y);
    if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
      const isVisible = state.tiles[tileY][tileX].visible[0];
      const isExplored = state.tiles[tileY][tileX].explored[0];
      if (!isVisible && !isExplored) continue;
      if (!isVisible && unit.owner === 1) continue;
      const depth = unit.x + unit.y;
      renderables.push({
        depth,
        draw: () => drawUnit(ctx, unit, isVisible),
      });
    }
  }

  // Sort by depth (back to front)
  renderables.sort((a, b) => a.depth - b.depth);
  for (const r of renderables) {
    r.draw();
  }

  // Draw projectiles
  for (const proj of state.projectiles) {
    const iso = toIso(proj.x, proj.y);
    const size = proj.type === 'shell' ? 4 : proj.type === 'missile' ? 3 : 2;
    
    // Glow
    ctx.fillStyle = proj.type === 'missile' ? 'rgba(255,100,0,0.5)' : 'rgba(255,200,0,0.4)';
    ctx.beginPath();
    ctx.arc(iso.sx, iso.sy - 4, size + 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = proj.type === 'missile' ? '#ff6600' : proj.type === 'shell' ? '#ffcc00' : '#ffff88';
    ctx.beginPath();
    ctx.arc(iso.sx, iso.sy - 4, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw particles
  for (const particle of state.particles) {
    const iso = toIso(particle.x, particle.y);
    const alpha = particle.life / particle.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(iso.sx, iso.sy - 2, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Selection box
  if (state.selectionBox) {
    const { x1, y1, x2, y2 } = state.selectionBox;
    const corners = [
      toIso(Math.min(x1, x2), Math.min(y1, y2)),
      toIso(Math.max(x1, x2), Math.min(y1, y2)),
      toIso(Math.max(x1, x2), Math.max(y1, y2)),
      toIso(Math.min(x1, x2), Math.max(y1, y2)),
    ];
    ctx.strokeStyle = '#00ff44';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(corners[0].sx, corners[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0, 255, 68, 0.08)';
    ctx.fill();
  }

  // Building placement preview
  if (state.placingBuilding && (state as any)._previewX !== undefined) {
    const stats = BUILDING_STATS[state.placingBuilding];
    const canPlace = (state as any)._canPlace;
    const px = (state as any)._previewX;
    const py = (state as any)._previewY;
    
    for (let dy = 0; dy < stats.height; dy++) {
      for (let dx = 0; dx < stats.width; dx++) {
        const iso = toIso(px + dx, py + dy);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = canPlace ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.4)';
        drawIsoDiamond(ctx, iso.sx, iso.sy, TILE_SIZE);
        ctx.strokeStyle = canPlace ? '#00ff44' : '#ff2222';
        ctx.lineWidth = 2;
        drawIsoDiamondStroke(ctx, iso.sx, iso.sy, TILE_SIZE);
      }
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Vignette effect (post-apocalyptic atmosphere)
  const gradient = ctx.createRadialGradient(
    canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.3,
    canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.8
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Subtle scan line effect
  ctx.fillStyle = 'rgba(0,0,0,0.03)';
  for (let y = 0; y < canvasHeight; y += 3) {
    ctx.fillRect(0, y, canvasWidth, 1);
  }
}

function drawIsoDiamond(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number) {
  const hw = size * 0.5;
  const hh = size * 0.25;
  ctx.beginPath();
  ctx.moveTo(sx, sy - hh);
  ctx.lineTo(sx + hw, sy);
  ctx.lineTo(sx, sy + hh);
  ctx.lineTo(sx - hw, sy);
  ctx.closePath();
  ctx.fill();
}

function drawIsoDiamondStroke(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number) {
  const hw = size * 0.5;
  const hh = size * 0.25;
  ctx.beginPath();
  ctx.moveTo(sx, sy - hh);
  ctx.lineTo(sx + hw, sy);
  ctx.lineTo(sx, sy + hh);
  ctx.lineTo(sx - hw, sy);
  ctx.closePath();
  ctx.stroke();
}

function drawTerrainTile(ctx: CanvasRenderingContext2D, tile: any, x: number, y: number) {
  const iso = toIso(x, y);
  const colors = TERRAIN_COLORS[tile.terrain] || TERRAIN_COLORS.plain;
  const hw = TILE_SIZE * 0.5;
  const hh = TILE_SIZE * 0.25;

  // Base diamond
  ctx.fillStyle = colors.base;
  drawIsoDiamond(ctx, iso.sx, iso.sy, TILE_SIZE);

  // Add texture/detail based on terrain type
  if (tile.terrain === 'plain') {
    // Subtle grass texture
    ctx.fillStyle = colors.dark;
    for (let i = 0; i < 3; i++) {
      const ox = ((x * 7 + y * 13 + i * 5) % 11 - 5) * 1.5;
      const oy = ((x * 11 + y * 7 + i * 3) % 9 - 4) * 0.8;
      ctx.fillRect(iso.sx + ox - 1, iso.sy + oy - 0.5, 2, 1);
    }
  } else if (tile.terrain === 'rock') {
    // Rocky texture with highlights
    ctx.fillStyle = colors.light;
    ctx.beginPath();
    ctx.arc(iso.sx - 4, iso.sy - 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.dark;
    ctx.beginPath();
    ctx.arc(iso.sx + 3, iso.sy + 1, 4, 0, Math.PI * 2);
    ctx.fill();
    // Small rock
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath();
    ctx.arc(iso.sx + 6, iso.sy - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile.terrain === 'forest') {
    // Tree
    const treeX = iso.sx + ((x * 3 + y * 7) % 5 - 2);
    const treeY = iso.sy + ((x * 7 + y * 3) % 3 - 1);
    // Trunk
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(treeX - 1, treeY - 4, 2, 5);
    // Canopy
    ctx.fillStyle = '#1a4a1a';
    ctx.beginPath();
    ctx.arc(treeX, treeY - 6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a5a2a';
    ctx.beginPath();
    ctx.arc(treeX - 1, treeY - 7, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile.terrain === 'road') {
    // Road markings
    ctx.fillStyle = colors.light;
    ctx.fillRect(iso.sx - 1, iso.sy - 1, 2, 2);
    // Edges
    ctx.strokeStyle = colors.dark;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(iso.sx - hw * 0.8, iso.sy);
    ctx.lineTo(iso.sx + hw * 0.8, iso.sy);
    ctx.stroke();
  } else if (tile.terrain === 'resource') {
    // Ore/metal deposit
    if (tile.resourceAmount && tile.resourceAmount > 0) {
      ctx.fillStyle = '#aa8833';
      ctx.beginPath();
      ctx.arc(iso.sx, iso.sy - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ccaa44';
      ctx.beginPath();
      ctx.arc(iso.sx - 2, iso.sy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eedd66';
      ctx.beginPath();
      ctx.arc(iso.sx + 2, iso.sy - 1, 2, 0, Math.PI * 2);
      ctx.fill();
      // Sparkle
      if (Math.random() < 0.02) {
        ctx.fillStyle = '#ffff88';
        ctx.fillRect(iso.sx + (Math.random() - 0.5) * 8, iso.sy + (Math.random() - 0.5) * 4, 1, 1);
      }
    }
  } else if (tile.terrain === 'rubble') {
    // Rubble/debris
    ctx.fillStyle = colors.dark;
    const seed = (x * 7 + y * 13) % 17;
    ctx.fillRect(iso.sx - 3 + seed % 3, iso.sy - 1, 3, 2);
    ctx.fillRect(iso.sx + 2 - seed % 4, iso.sy + 1, 2, 2);
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(iso.sx - 1, iso.sy - 2, 4, 2);
    // Rebar/metal piece
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(iso.sx - 2, iso.sy);
    ctx.lineTo(iso.sx + 3, iso.sy - 3);
    ctx.stroke();
  }

  // Tile border (subtle)
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.5;
  drawIsoDiamondStroke(ctx, iso.sx, iso.sy, TILE_SIZE);
}

function drawBuilding(ctx: CanvasRenderingContext2D, building: Building, selected: boolean, fogged: boolean) {
  const stats = BUILDING_STATS[building.type];
  const colors = PLAYER_COLORS[building.owner as 0 | 1];
  
  ctx.globalAlpha = fogged ? 0.5 : 1;

  // Get isometric position for building center
  const centerX = building.x + stats.width / 2;
  const centerY = building.y + stats.height / 2;
  const iso = toIso(centerX, centerY);
  const baseWidth = stats.width * TILE_SIZE * 0.5;
  const baseHeight = stats.height * TILE_SIZE * 0.25;
  const buildingHeight = Math.max(stats.width, stats.height) * 12;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(iso.sx + 4, iso.sy + 4, baseWidth * 0.8, baseHeight * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  switch (building.type) {
    case 'command_center':
      drawCommandCenter(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors);
      break;
    case 'factory':
      drawFactory(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors);
      break;
    case 'research_lab':
      drawResearchLab(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors);
      break;
    case 'power_plant':
      drawPowerPlant(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors);
      break;
    case 'repair_bay':
      drawRepairBay(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors);
      break;
    case 'radar_station':
      drawRadarStation(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors);
      break;
    case 'defense_tower':
      drawDefenseTower(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors);
      break;
    case 'wall':
      drawWall(ctx, iso.sx, iso.sy, baseWidth, baseHeight, colors);
      break;
  }

  // Construction progress
  if (building.state === 'constructing') {
    ctx.globalAlpha = 0.7;
    // Scaffolding effect
    ctx.strokeStyle = '#888866';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = iso.sy - buildingHeight * building.buildProgress * (0.3 + i * 0.3);
      ctx.beginPath();
      ctx.moveTo(iso.sx - baseWidth * 0.5, y);
      ctx.lineTo(iso.sx + baseWidth * 0.5, y);
      ctx.stroke();
    }
    ctx.globalAlpha = fogged ? 0.5 : 1;
    
    // Progress bar
    const barW = baseWidth * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(iso.sx - barW / 2, iso.sy + 8, barW, 5);
    ctx.fillStyle = '#44cc44';
    ctx.fillRect(iso.sx - barW / 2 + 1, iso.sy + 9, (barW - 2) * building.buildProgress, 3);
  }

  // Health bar (only when damaged)
  if (building.state === 'active' && building.hp < building.maxHp) {
    const barW = baseWidth * 1.2;
    const hpRatio = building.hp / building.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(iso.sx - barW / 2, iso.sy - buildingHeight - 8, barW, 4);
    ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ffaa00' : '#ff2222';
    ctx.fillRect(iso.sx - barW / 2 + 1, iso.sy - buildingHeight - 7, (barW - 2) * hpRatio, 2);
  }

  // Selection highlight
  if (selected) {
    ctx.strokeStyle = '#00ff44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(iso.sx, iso.sy - baseHeight - 2);
    ctx.lineTo(iso.sx + baseWidth + 2, iso.sy);
    ctx.lineTo(iso.sx, iso.sy + baseHeight + 2);
    ctx.lineTo(iso.sx - baseWidth - 2, iso.sy);
    ctx.closePath();
    ctx.stroke();
    
    // Pulsing glow
    ctx.strokeStyle = 'rgba(0, 255, 68, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawCommandCenter(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any) {
  // Base platform
  ctx.fillStyle = '#3a3a3a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 6);
  
  // Main structure
  ctx.fillStyle = colors.dark;
  drawIsoBlock(ctx, sx, sy - 6, bw * 0.9, bh * 0.9, height * 0.6);
  
  // Upper section
  ctx.fillStyle = colors.main;
  drawIsoBlock(ctx, sx, sy - 6 - height * 0.6, bw * 0.7, bh * 0.7, height * 0.3);
  
  // Windows (glowing)
  ctx.fillStyle = '#aaddff';
  ctx.fillRect(sx - 8, sy - height * 0.5, 4, 3);
  ctx.fillRect(sx + 4, sy - height * 0.5, 4, 3);
  ctx.fillRect(sx - 3, sy - height * 0.7, 6, 3);
  
  // Antenna array
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height);
  ctx.lineTo(sx, sy - height - 15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 6, sy - height - 12);
  ctx.lineTo(sx + 6, sy - height - 12);
  ctx.stroke();
  
  // Red beacon
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(sx, sy - height - 15, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(sx, sy - height - 15, 4, 0, Math.PI * 2);
  ctx.fill();
  
  // Details
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(sx - bw * 0.3, sy - 4, bw * 0.2, 4);
  ctx.fillRect(sx + bw * 0.1, sy - 4, bw * 0.2, 4);
}

function drawFactory(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any) {
  // Foundation
  ctx.fillStyle = '#2a2a2a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 4);
  
  // Main building
  ctx.fillStyle = '#4a4a4a';
  drawIsoBlock(ctx, sx, sy - 4, bw * 0.95, bh * 0.95, height * 0.7);
  
  // Roof
  ctx.fillStyle = '#3a3a3a';
  drawIsoBlock(ctx, sx, sy - 4 - height * 0.7, bw * 0.95, bh * 0.95, 4);
  
  // Chimney
  ctx.fillStyle = '#333333';
  ctx.fillRect(sx + bw * 0.3, sy - height - 10, 6, 14);
  ctx.fillStyle = '#222222';
  ctx.fillRect(sx + bw * 0.3 - 1, sy - height - 12, 8, 3);
  
  // Smoke
  ctx.fillStyle = 'rgba(80,80,80,0.4)';
  ctx.beginPath();
  ctx.arc(sx + bw * 0.33 + 3, sy - height - 16, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + bw * 0.33 + 5, sy - height - 22, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Bay door
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(sx + bw * 0.2, sy - height * 0.4, bw * 0.4, height * 0.35);
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.4, sy - height * 0.5, bw * 0.15, 3);
  ctx.fillRect(sx + bw * 0.25, sy - height * 0.5, bw * 0.15, 3);
  
  // Warning stripes
  ctx.fillStyle = '#ccaa00';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(sx + bw * 0.2 + i * 4, sy - height * 0.4 - 2, 2, 2);
  }
}

function drawResearchLab(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any) {
  // Base
  ctx.fillStyle = '#3a3a4a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 4);
  
  // Main structure
  ctx.fillStyle = '#4a4a5a';
  drawIsoBlock(ctx, sx, sy - 4, bw * 0.85, bh * 0.85, height * 0.6);
  
  // Dome
  ctx.fillStyle = '#5a6a7a';
  ctx.beginPath();
  ctx.ellipse(sx, sy - height * 0.7, bw * 0.35, bh * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a8a9a';
  ctx.beginPath();
  ctx.ellipse(sx - 2, sy - height * 0.75, bw * 0.2, bh * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Glowing windows
  ctx.fillStyle = '#44aaff';
  ctx.fillRect(sx - 6, sy - height * 0.3, 3, 4);
  ctx.fillRect(sx + 3, sy - height * 0.3, 3, 4);
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.35, sy - 3, bw * 0.7, 2);
  
  // Antenna
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height * 0.9);
  ctx.lineTo(sx, sy - height - 5);
  ctx.stroke();
}

function drawPowerPlant(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any) {
  // Base
  ctx.fillStyle = '#3a3a2a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 4);
  
  // Main structure
  ctx.fillStyle = '#4a4a3a';
  drawIsoBlock(ctx, sx, sy - 4, bw * 0.9, bh * 0.9, height * 0.5);
  
  // Cooling towers
  ctx.fillStyle = '#5a5a4a';
  ctx.beginPath();
  ctx.moveTo(sx - bw * 0.3, sy - height * 0.5);
  ctx.lineTo(sx - bw * 0.25, sy - height);
  ctx.lineTo(sx - bw * 0.15, sy - height);
  ctx.lineTo(sx - bw * 0.1, sy - height * 0.5);
  ctx.fill();
  
  ctx.beginPath();
  ctx.moveTo(sx + bw * 0.1, sy - height * 0.5);
  ctx.lineTo(sx + bw * 0.15, sy - height);
  ctx.lineTo(sx + bw * 0.25, sy - height);
  ctx.lineTo(sx + bw * 0.3, sy - height * 0.5);
  ctx.fill();
  
  // Steam
  ctx.fillStyle = 'rgba(150,150,150,0.3)';
  ctx.beginPath();
  ctx.arc(sx - bw * 0.2, sy - height - 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + bw * 0.2, sy - height - 4, 4, 0, Math.PI * 2);
  ctx.fill();
  
  // Lightning symbol
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.moveTo(sx - 2, sy - height * 0.35);
  ctx.lineTo(sx + 2, sy - height * 0.25);
  ctx.lineTo(sx, sy - height * 0.25);
  ctx.lineTo(sx + 2, sy - height * 0.15);
  ctx.lineTo(sx - 2, sy - height * 0.25);
  ctx.lineTo(sx, sy - height * 0.25);
  ctx.closePath();
  ctx.fill();
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.4, sy - 3, bw * 0.8, 2);
}

function drawRepairBay(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any) {
  // Base
  ctx.fillStyle = '#2a3a2a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 4);
  
  // Main structure (open bay)
  ctx.fillStyle = '#3a4a3a';
  drawIsoBlock(ctx, sx, sy - 4, bw * 0.9, bh * 0.9, height * 0.5);
  
  // Open front
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(sx - bw * 0.3, sy - height * 0.4, bw * 0.6, height * 0.35);
  
  // Crane arm
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height * 0.5);
  ctx.lineTo(sx, sy - height * 0.8);
  ctx.lineTo(sx + bw * 0.3, sy - height * 0.8);
  ctx.stroke();
  
  // Green cross
  ctx.fillStyle = '#00cc44';
  ctx.fillRect(sx - 2, sy - height * 0.6, 4, 10);
  ctx.fillRect(sx - 5, sy - height * 0.55, 10, 4);
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.4, sy - 3, bw * 0.8, 2);
}

function drawRadarStation(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any) {
  // Base
  ctx.fillStyle = '#3a3a4a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 4);
  
  // Main structure
  ctx.fillStyle = '#4a4a5a';
  drawIsoBlock(ctx, sx, sy - 4, bw * 0.8, bh * 0.8, height * 0.4);
  
  // Radar dish
  ctx.fillStyle = '#6a6a7a';
  ctx.beginPath();
  ctx.ellipse(sx, sy - height * 0.7, bw * 0.4, bh * 0.3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a8a9a';
  ctx.beginPath();
  ctx.ellipse(sx - 2, sy - height * 0.72, bw * 0.25, bh * 0.18, -0.3, 0, Math.PI * 2);
  ctx.fill();
  
  // Dish support
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height * 0.4);
  ctx.lineTo(sx, sy - height * 0.65);
  ctx.stroke();
  
  // Signal waves
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.7, bw * 0.5, -0.8, 0.3);
  ctx.stroke();
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.35, sy - 3, bw * 0.7, 2);
}

function drawDefenseTower(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any) {
  // Base
  ctx.fillStyle = '#3a3a3a';
  drawIsoBlock(ctx, sx, sy, bw * 0.8, bh * 0.8, 4);
  
  // Tower body
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(sx - 5, sy - height * 0.7, 10, height * 0.7);
  
  // Turret
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.75, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.main;
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.75, 5, 0, Math.PI * 2);
  ctx.fill();
  
  // Barrel
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(sx, sy - height * 0.78, 12, 3);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(sx + 10, sy - height * 0.79, 3, 5);
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - 6, sy - 3, 12, 2);
}

function drawWall(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, colors: any) {
  // Wall block
  ctx.fillStyle = '#5a5a5a';
  drawIsoBlock(ctx, sx, sy, bw * 0.7, bh * 0.7, 10);
  
  // Top
  ctx.fillStyle = '#6a6a6a';
  drawIsoBlock(ctx, sx, sy - 10, bw * 0.6, bh * 0.6, 3);
  
  // Color accent
  ctx.fillStyle = colors.dark;
  ctx.fillRect(sx - 4, sy - 8, 8, 2);
}

function drawIsoBlock(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number) {
  // Top face
  ctx.beginPath();
  ctx.moveTo(sx, sy - height - bh);
  ctx.lineTo(sx + bw, sy - height);
  ctx.lineTo(sx, sy - height + bh);
  ctx.lineTo(sx - bw, sy - height);
  ctx.closePath();
  ctx.fill();
  
  // Left face (darker)
  const leftColor = ctx.fillStyle as string;
  ctx.fillStyle = darkenColor(leftColor, 0.7);
  ctx.beginPath();
  ctx.moveTo(sx - bw, sy - height);
  ctx.lineTo(sx, sy - height + bh);
  ctx.lineTo(sx, sy + bh);
  ctx.lineTo(sx - bw, sy);
  ctx.closePath();
  ctx.fill();
  
  // Right face (medium)
  ctx.fillStyle = darkenColor(leftColor, 0.85);
  ctx.beginPath();
  ctx.moveTo(sx + bw, sy - height);
  ctx.lineTo(sx, sy - height + bh);
  ctx.lineTo(sx, sy + bh);
  ctx.lineTo(sx + bw, sy);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = leftColor;
}

function darkenColor(color: string, factor: number): string {
  // Simple color darkening
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
  }
  return color;
}

function drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, visible: boolean) {
  const iso = toIso(unit.x, unit.y);
  const colors = PLAYER_COLORS[unit.owner as 0 | 1];
  const size = unit.stats.size * TILE_SIZE * 0.4;
  
  ctx.globalAlpha = visible ? 1 : 0.6;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(iso.sx + 2, iso.sy + 2, size * 0.8, size * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Convert angle to iso direction
  const dirX = Math.cos(unit.angle);
  const dirY = Math.sin(unit.angle);
  const isoDirX = (dirX - dirY) * 0.5;
  const isoDirY = (dirX + dirY) * 0.25;
  const isoAngle = Math.atan2(isoDirY, isoDirX);

  ctx.save();
  ctx.translate(iso.sx, iso.sy);

  switch (unit.type) {
    case 'scout':
      drawScoutVehicle(ctx, size, colors, isoAngle);
      break;
    case 'buggy':
      drawBuggyVehicle(ctx, size, colors, isoAngle);
      break;
    case 'medium_tank':
      drawMediumTank(ctx, size, colors, isoAngle);
      break;
    case 'heavy_tank':
      drawHeavyTank(ctx, size, colors, isoAngle);
      break;
    case 'artillery':
      drawArtillery(ctx, size, colors, isoAngle);
      break;
    case 'missile':
      drawMissileVehicle(ctx, size, colors, isoAngle);
      break;
    case 'aa_vehicle':
      drawAAVehicle(ctx, size, colors, isoAngle);
      break;
    case 'repair':
      drawRepairUnit(ctx, size, colors, isoAngle);
      break;
    case 'harvester':
      drawHarvester(ctx, size, colors, isoAngle, unit.harvestAmount);
      break;
  }

  ctx.restore();

  // Health bar
  if (unit.hp < unit.maxHp) {
    const barW = size * 1.8;
    const hpRatio = unit.hp / unit.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(iso.sx - barW / 2, iso.sy - size - 10, barW, 3);
    ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ffaa00' : '#ff2222';
    ctx.fillRect(iso.sx - barW / 2 + 0.5, iso.sy - size - 9.5, (barW - 1) * hpRatio, 2);
  }

  // Selection indicator
  if (unit.selected) {
    ctx.strokeStyle = '#00ff44';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(iso.sx, iso.sy + 2, size + 3, size * 0.5 + 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 255, 68, 0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawScoutVehicle(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3); // Slight rotation for iso feel
  
  // Body
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.6, -size * 0.3, size * 1.2, size * 0.6);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.5, -size * 0.25, size * 1.0, size * 0.5);
  
  // Wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.5, -size * 0.35, size * 0.2, size * 0.1);
  ctx.fillRect(-size * 0.5, size * 0.25, size * 0.2, size * 0.1);
  ctx.fillRect(size * 0.3, -size * 0.35, size * 0.2, size * 0.1);
  ctx.fillRect(size * 0.3, size * 0.25, size * 0.2, size * 0.1);
  
  // Turret/gun
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.2, -1.5, size * 0.5, 3);
  
  // Highlight
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.3, -size * 0.15, size * 0.3, size * 0.1);
  
  ctx.restore();
}

function drawBuggyVehicle(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Body
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.7, -size * 0.4, size * 1.4, size * 0.8);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);
  
  // Wheels (larger)
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(-size * 0.45, -size * 0.35, 3, 0, Math.PI * 2);
  ctx.arc(-size * 0.45, size * 0.35, 3, 0, Math.PI * 2);
  ctx.arc(size * 0.45, -size * 0.35, 3, 0, Math.PI * 2);
  ctx.arc(size * 0.45, size * 0.35, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Gun mount
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.1, -2, size * 0.6, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 0.6, -2.5, 3, 5);
  
  // Armor detail
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.4, -size * 0.2, size * 0.2, size * 0.15);
  
  ctx.restore();
}

function drawMediumTank(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.8, -size * 0.55, size * 1.6, size * 0.15);
  ctx.fillRect(-size * 0.8, size * 0.4, size * 1.6, size * 0.15);
  // Track detail
  ctx.fillStyle = '#2a2a2a';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(-size * 0.7 + i * size * 0.3, -size * 0.55, 2, size * 0.15);
    ctx.fillRect(-size * 0.7 + i * size * 0.3, size * 0.4, 2, size * 0.15);
  }
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.7, -size * 0.4, size * 1.4, size * 0.8);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);
  
  // Turret
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.main;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
  ctx.fill();
  
  // Barrel
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.2, -2.5, size * 0.7, 5);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 0.8, -3, 4, 6);
  
  // Details
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.4, -size * 0.2, size * 0.15, size * 0.1);
  ctx.fillRect(-size * 0.4, size * 0.1, size * 0.15, size * 0.1);
  
  ctx.restore();
}

function drawHeavyTank(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Heavy tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.9, -size * 0.65, size * 1.8, size * 0.2);
  ctx.fillRect(-size * 0.9, size * 0.45, size * 1.8, size * 0.2);
  ctx.fillStyle = '#2a2a2a';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(-size * 0.85 + i * size * 0.28, -size * 0.65, 2, size * 0.2);
    ctx.fillRect(-size * 0.85 + i * size * 0.28, size * 0.45, 2, size * 0.2);
  }
  
  // Hull (wider)
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.8, -size * 0.5, size * 1.6, size);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.7, -size * 0.45, size * 1.4, size * 0.9);
  
  // Extra armor plates
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.85, -size * 0.3, size * 0.15, size * 0.6);
  ctx.fillRect(size * 0.7, -size * 0.3, size * 0.15, size * 0.6);
  
  // Large turret
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.main;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  
  // Heavy barrel
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.25, -3.5, size * 0.9, 7);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 1.0, -4, 5, 8);
  // Muzzle brake
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(size * 1.05, -5, 2, 10);
  
  // Details
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.5, -size * 0.25, size * 0.2, size * 0.12);
  ctx.fillRect(-size * 0.5, size * 0.13, size * 0.2, size * 0.12);
  
  ctx.restore();
}

function drawArtillery(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.7, -size * 0.45, size * 1.4, size * 0.15);
  ctx.fillRect(-size * 0.7, size * 0.3, size * 1.4, size * 0.15);
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.5, -size * 0.3, size * 1.0, size * 0.6);
  
  // Long barrel
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.1, -2, size * 1.3, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 1.3, -2.5, 4, 5);
  
  // Base plate
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(-size * 0.7, -size * 0.15, size * 0.2, size * 0.3);
  
  // Turret housing
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(-size * 0.1, 0, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawMissileVehicle(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.7, -size * 0.45, size * 1.4, size * 0.15);
  ctx.fillRect(-size * 0.7, size * 0.3, size * 1.4, size * 0.15);
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.5, -size * 0.3, size * 1.0, size * 0.6);
  
  // Missile pods (angled up)
  ctx.fillStyle = '#3a3a3a';
  ctx.save();
  ctx.rotate(-0.3);
  ctx.fillRect(-size * 0.2, -size * 0.5, size * 0.5, size * 0.15);
  ctx.fillRect(-size * 0.2, size * 0.35, size * 0.5, size * 0.15);
  // Missiles
  ctx.fillStyle = '#aa2222';
  ctx.fillRect(-size * 0.1, -size * 0.48, size * 0.35, size * 0.08);
  ctx.fillRect(-size * 0.1, size * 0.38, size * 0.35, size * 0.08);
  ctx.restore();
  
  // Launcher housing
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawAAVehicle(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.7, -size * 0.45, size * 1.4, size * 0.15);
  ctx.fillRect(-size * 0.7, size * 0.3, size * 1.4, size * 0.15);
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.5, -size * 0.3, size * 1.0, size * 0.6);
  
  // Twin AA guns (angled up)
  ctx.fillStyle = '#2a2a2a';
  ctx.save();
  ctx.rotate(-0.4);
  ctx.fillRect(size * 0.1, -4, size * 0.6, 3);
  ctx.fillRect(size * 0.1, 1, size * 0.6, 3);
  ctx.restore();
  
  // Radar dish
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -size * 0.2, size * 0.2, -Math.PI * 0.7, Math.PI * 0.2);
  ctx.stroke();
  
  // Turret base
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawRepairUnit(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Body
  ctx.fillStyle = '#2a4a2a';
  ctx.fillRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);
  ctx.fillStyle = '#3a6a3a';
  ctx.fillRect(-size * 0.5, -size * 0.3, size * 1.0, size * 0.6);
  
  // Wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.5, -size * 0.4, size * 0.2, size * 0.1);
  ctx.fillRect(-size * 0.5, size * 0.3, size * 0.2, size * 0.1);
  ctx.fillRect(size * 0.3, -size * 0.4, size * 0.2, size * 0.1);
  ctx.fillRect(size * 0.3, size * 0.3, size * 0.2, size * 0.1);
  
  // Crane arm
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size * 0.2, 0);
  ctx.lineTo(size * 0.5, -size * 0.3);
  ctx.lineTo(size * 0.6, -size * 0.2);
  ctx.stroke();
  
  // Green cross
  ctx.fillStyle = '#00cc44';
  ctx.fillRect(-2, -size * 0.2, 4, size * 0.4);
  ctx.fillRect(-size * 0.2, -2, size * 0.4, 4);
  
  ctx.restore();
}

function drawHarvester(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number, harvestAmount: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.8, -size * 0.5, size * 1.6, size * 0.15);
  ctx.fillRect(-size * 0.8, size * 0.35, size * 1.6, size * 0.15);
  
  // Hull
  ctx.fillStyle = '#4a3a1a';
  ctx.fillRect(-size * 0.7, -size * 0.4, size * 1.4, size * 0.8);
  ctx.fillStyle = '#6a5a2a';
  ctx.fillRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);
  
  // Cargo bed
  ctx.fillStyle = '#5a4a1a';
  ctx.fillRect(-size * 0.5, -size * 0.25, size * 0.7, size * 0.5);
  
  // Cargo fill
  if (harvestAmount > 0) {
    const fill = harvestAmount / 50;
    ctx.fillStyle = '#aa8833';
    ctx.fillRect(-size * 0.45, -size * 0.2, size * 0.6 * fill, size * 0.4);
    ctx.fillStyle = '#ccaa44';
    ctx.fillRect(-size * 0.4, -size * 0.15, size * 0.5 * fill, size * 0.15);
  }
  
  // Bucket/scoop at front
  ctx.fillStyle = '#7a6a3a';
  ctx.fillRect(size * 0.5, -size * 0.3, size * 0.3, size * 0.6);
  ctx.fillStyle = '#8a7a4a';
  ctx.fillRect(size * 0.6, -size * 0.25, size * 0.2, size * 0.5);
  
  // Details
  ctx.fillStyle = '#3a2a0a';
  ctx.fillRect(-size * 0.6, -size * 0.3, size * 0.1, size * 0.6);
  
  ctx.restore();
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

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  // Terrain
  for (let y = 0; y < MAP_HEIGHT; y += 2) {
    for (let x = 0; x < MAP_WIDTH; x += 2) {
      const tile = state.tiles[y][x];
      if (tile.explored[0]) {
        switch (tile.terrain) {
          case 'plain': ctx.fillStyle = '#3a4a2a'; break;
          case 'rock': ctx.fillStyle = '#4a4a4a'; break;
          case 'forest': ctx.fillStyle = '#1a3a1a'; break;
          case 'road': ctx.fillStyle = '#5a5a4a'; break;
          case 'resource': ctx.fillStyle = '#7a6a2a'; break;
          case 'water': ctx.fillStyle = '#1a2a4a'; break;
          case 'rubble': ctx.fillStyle = '#4a3a2a'; break;
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
    const colors = PLAYER_COLORS[building.owner as 0 | 1];
    ctx.fillStyle = colors.main;
    ctx.fillRect(
      building.x * scaleX,
      building.y * scaleY,
      Math.max(3, stats.width * scaleX + 1),
      Math.max(3, stats.height * scaleY + 1)
    );
  }

  // Units
  for (const unit of state.units) {
    if (unit.state === 'dead') continue;
    const tileX = Math.floor(unit.x);
    const tileY = Math.floor(unit.y);
    if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
      if (state.tiles[tileY][tileX].visible[0] || unit.owner === 0) {
        const colors = PLAYER_COLORS[unit.owner as 0 | 1];
        ctx.fillStyle = colors.light;
        ctx.fillRect(unit.x * scaleX - 1, unit.y * scaleY - 1, 3, 3);
      }
    }
  }

  // Camera viewport (convert iso camera position to tile coordinates)
  const cam = state.camera;
  const hw = TILE_SIZE * 0.5;
  const hh = TILE_SIZE * 0.25;
  const camTileX = (cam.x / hw + cam.y / hh) / 2;
  const camTileY = (cam.y / hh - cam.x / hw) / 2;
  const viewW = (window.innerWidth / cam.zoom) / TILE_SIZE * 1.5;
  const viewH = (window.innerHeight / cam.zoom) / TILE_SIZE * 1.5;
  
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    (camTileX - viewW / 2) * scaleX,
    (camTileY - viewH / 2) * scaleY,
    viewW * scaleX,
    viewH * scaleY
  );
  
  // Border
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, width, height);
}
