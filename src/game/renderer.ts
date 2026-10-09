// Iron Horizon - Enhanced Isometric Renderer (Warzone 2100 Style)
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
  0: { main: '#3366aa', dark: '#224488', light: '#4488cc', accent: '#88bbee', glow: '#66aaff' },
  1: { main: '#aa3333', dark: '#882222', light: '#cc4444', accent: '#ee8888', glow: '#ff6666' },
};

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasWidth: number,
  canvasHeight: number
) {
  const { camera } = state;
  const zoom = camera.zoom;

  ctx.imageSmoothingEnabled = false;

  // Sky gradient background
  const skyGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  skyGradient.addColorStop(0, '#1a1a2a');
  skyGradient.addColorStop(0.5, '#2a2a3a');
  skyGradient.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 3);
  ctx.scale(zoom, zoom);
  ctx.translate(-camera.x, -camera.y);

  // Calculate visible tile range
  const invZoom = 1 / zoom;
  const viewTilesX = canvasWidth * invZoom / TILE_SIZE;
  const viewTilesY = canvasHeight * invZoom / TILE_SIZE;
  
  const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE - viewTilesX));
  const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE - viewTilesY));
  const endX = Math.min(MAP_WIDTH, Math.ceil(camera.x / TILE_SIZE + viewTilesX));
  const endY = Math.min(MAP_HEIGHT, Math.ceil(camera.y / TILE_SIZE + viewTilesY));

  // Draw terrain with enhanced details
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = state.tiles[y][x];
      
      if (tile.visible[0]) {
        drawTerrainTile(ctx, tile, x, y, state.time);
      } else if (tile.explored[0]) {
        drawTerrainTile(ctx, tile, x, y, state.time);
        const iso = toIso(x, y);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        drawIsoDiamond(ctx, iso.sx, iso.sy, TILE_SIZE);
      } else {
        const iso = toIso(x, y);
        ctx.fillStyle = '#050508';
        drawIsoDiamond(ctx, iso.sx, iso.sy, TILE_SIZE);
      }
    }
  }

  // Collect renderables and sort by depth
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
        draw: () => drawBuilding(ctx, building, state.selection.includes(building.id), isFogged, state.time),
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
        draw: () => drawUnit(ctx, unit, isVisible, state.time),
      });
    }
  }

  renderables.sort((a, b) => a.depth - b.depth);
  for (const r of renderables) {
    r.draw();
  }

  // Draw projectiles with enhanced effects
  for (const proj of state.projectiles) {
    const iso = toIso(proj.x, proj.y);
    drawProjectile(ctx, proj, iso.sx, iso.sy);
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
    
    // Glow effect for bright particles
    if (particle.color.includes('ff') || particle.color.includes('FF')) {
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(iso.sx, iso.sy - 2, particle.size * 2, 0, Math.PI * 2);
      ctx.fill();
    }
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
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(corners[0].sx, corners[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0, 255, 68, 0.1)';
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
        ctx.globalAlpha = 0.7;
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

  // Atmospheric fog overlay
  const fogGradient = ctx.createRadialGradient(
    canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.2,
    canvasWidth / 2, canvasHeight / 2, canvasHeight * 0.9
  );
  fogGradient.addColorStop(0, 'rgba(0,0,0,0)');
  fogGradient.addColorStop(0.7, 'rgba(20,20,30,0.2)');
  fogGradient.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = fogGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Subtle scan lines
  ctx.fillStyle = 'rgba(0,0,0,0.02)';
  for (let y = 0; y < canvasHeight; y += 4) {
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

function drawTerrainTile(ctx: CanvasRenderingContext2D, tile: any, x: number, y: number, time: number) {
  const iso = toIso(x, y);
  const colors = TERRAIN_COLORS[tile.terrain] || TERRAIN_COLORS.plain;
  const hw = TILE_SIZE * 0.5;
  const hh = TILE_SIZE * 0.25;

  // Base diamond
  ctx.fillStyle = colors.base;
  drawIsoDiamond(ctx, iso.sx, iso.sy, TILE_SIZE);

  // Enhanced terrain details
  const seed = (x * 7 + y * 13) % 100;
  
  if (tile.terrain === 'plain') {
    // Grass tufts
    ctx.fillStyle = colors.dark;
    for (let i = 0; i < 4; i++) {
      const ox = ((seed + i * 17) % 11 - 5) * 1.8;
      const oy = ((seed + i * 23) % 9 - 4) * 0.9;
      ctx.fillRect(iso.sx + ox - 1, iso.sy + oy - 0.5, 2, 1);
    }
    // Small stones
    if (seed % 7 === 0) {
      ctx.fillStyle = '#6a6a5a';
      ctx.beginPath();
      ctx.arc(iso.sx + (seed % 5 - 2) * 2, iso.sy + (seed % 3 - 1), 1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tile.terrain === 'rock') {
    // Rocky texture with cracks
    ctx.fillStyle = colors.light;
    ctx.beginPath();
    ctx.arc(iso.sx - 4, iso.sy - 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.dark;
    ctx.beginPath();
    ctx.arc(iso.sx + 3, iso.sy + 1, 4, 0, Math.PI * 2);
    ctx.fill();
    // Cracks
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(iso.sx - 3, iso.sy);
    ctx.lineTo(iso.sx + 2, iso.sy + 2);
    ctx.stroke();
  } else if (tile.terrain === 'forest') {
    // Dead/damaged trees
    const treeX = iso.sx + ((seed * 3) % 5 - 2);
    const treeY = iso.sy + ((seed * 7) % 3 - 1);
    // Trunk
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(treeX - 1, treeY - 5, 2, 6);
    // Canopy (darker, dead-looking)
    ctx.fillStyle = '#1a3a1a';
    ctx.beginPath();
    ctx.arc(treeX, treeY - 7, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a4a2a';
    ctx.beginPath();
    ctx.arc(treeX - 1, treeY - 8, 3, 0, Math.PI * 2);
    ctx.fill();
    // Dead branches
    if (seed % 3 === 0) {
      ctx.strokeStyle = '#2a1a0a';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(treeX, treeY - 6);
      ctx.lineTo(treeX + 3, treeY - 8);
      ctx.stroke();
    }
  } else if (tile.terrain === 'road') {
    // Road with cracks and markings
    ctx.fillStyle = colors.light;
    ctx.fillRect(iso.sx - 1, iso.sy - 1, 2, 2);
    // Cracks
    ctx.strokeStyle = colors.dark;
    ctx.lineWidth = 0.5;
    if (seed % 5 === 0) {
      ctx.beginPath();
      ctx.moveTo(iso.sx - 4, iso.sy);
      ctx.lineTo(iso.sx + 3, iso.sy + 1);
      ctx.stroke();
    }
    // Edge markings
    ctx.strokeStyle = '#5a5a4a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(iso.sx - hw * 0.8, iso.sy);
    ctx.lineTo(iso.sx + hw * 0.8, iso.sy);
    ctx.stroke();
  } else if (tile.terrain === 'resource') {
    // Ore/metal deposit with glow
    if (tile.resourceAmount && tile.resourceAmount > 0) {
      const glowIntensity = 0.3 + Math.sin(time * 2 + seed) * 0.1;
      // Glow
      ctx.fillStyle = `rgba(255, 200, 50, ${glowIntensity})`;
      ctx.beginPath();
      ctx.arc(iso.sx, iso.sy - 2, 7, 0, Math.PI * 2);
      ctx.fill();
      // Ore chunks
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
      // Sparkles
      if (Math.random() < 0.05) {
        ctx.fillStyle = '#ffff88';
        ctx.fillRect(iso.sx + (Math.random() - 0.5) * 10, iso.sy + (Math.random() - 0.5) * 5, 1, 1);
      }
    }
  } else if (tile.terrain === 'rubble') {
    // Rubble with debris
    ctx.fillStyle = colors.dark;
    ctx.fillRect(iso.sx - 3 + seed % 3, iso.sy - 1, 3, 2);
    ctx.fillRect(iso.sx + 2 - seed % 4, iso.sy + 1, 2, 2);
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(iso.sx - 1, iso.sy - 2, 4, 2);
    // Rebar/metal
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(iso.sx - 2, iso.sy);
    ctx.lineTo(iso.sx + 3, iso.sy - 3);
    ctx.stroke();
    // Concrete chunks
    ctx.fillStyle = '#6a6a5a';
    ctx.fillRect(iso.sx + 1, iso.sy, 2, 2);
  }

  // Tile border (subtle)
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 0.5;
  drawIsoDiamondStroke(ctx, iso.sx, iso.sy, TILE_SIZE);
}

function drawBuilding(ctx: CanvasRenderingContext2D, building: Building, selected: boolean, fogged: boolean, time: number) {
  const stats = BUILDING_STATS[building.type];
  const colors = PLAYER_COLORS[building.owner as 0 | 1];
  
  ctx.globalAlpha = fogged ? 0.5 : 1;

  const centerX = building.x + stats.width / 2;
  const centerY = building.y + stats.height / 2;
  const iso = toIso(centerX, centerY);
  const baseWidth = stats.width * TILE_SIZE * 0.5;
  const baseHeight = stats.height * TILE_SIZE * 0.25;
  const buildingHeight = Math.max(stats.width, stats.height) * 14;

  // Dynamic shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(iso.sx + 5, iso.sy + 5, baseWidth * 0.85, baseHeight * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  switch (building.type) {
    case 'command_center':
      drawCommandCenter(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors, time);
      break;
    case 'factory':
      drawFactory(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors, time);
      break;
    case 'research_lab':
      drawResearchLab(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors, time);
      break;
    case 'power_plant':
      drawPowerPlant(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors, time);
      break;
    case 'repair_bay':
      drawRepairBay(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors);
      break;
    case 'radar_station':
      drawRadarStation(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors, time);
      break;
    case 'defense_tower':
      drawDefenseTower(ctx, iso.sx, iso.sy, baseWidth, baseHeight, buildingHeight, colors, time);
      break;
    case 'wall':
      drawWall(ctx, iso.sx, iso.sy, baseWidth, baseHeight, colors);
      break;
  }

  // Construction scaffolding
  if (building.state === 'constructing') {
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#888866';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = iso.sy - buildingHeight * building.buildProgress * (0.25 + i * 0.25);
      ctx.beginPath();
      ctx.moveTo(iso.sx - baseWidth * 0.5, y);
      ctx.lineTo(iso.sx + baseWidth * 0.5, y);
      ctx.stroke();
    }
    // Vertical supports
    ctx.beginPath();
    ctx.moveTo(iso.sx - baseWidth * 0.4, iso.sy);
    ctx.lineTo(iso.sx - baseWidth * 0.4, iso.sy - buildingHeight * building.buildProgress);
    ctx.moveTo(iso.sx + baseWidth * 0.4, iso.sy);
    ctx.lineTo(iso.sx + baseWidth * 0.4, iso.sy - buildingHeight * building.buildProgress);
    ctx.stroke();
    ctx.globalAlpha = fogged ? 0.5 : 1;
    
    // Progress bar
    const barW = baseWidth * 1.3;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(iso.sx - barW / 2, iso.sy + 10, barW, 6);
    ctx.fillStyle = '#44cc44';
    ctx.fillRect(iso.sx - barW / 2 + 1, iso.sy + 11, (barW - 2) * building.buildProgress, 4);
  }

  // Health bar
  if (building.state === 'active' && building.hp < building.maxHp) {
    const barW = baseWidth * 1.3;
    const hpRatio = building.hp / building.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(iso.sx - barW / 2, iso.sy - buildingHeight - 10, barW, 5);
    ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ffaa00' : '#ff2222';
    ctx.fillRect(iso.sx - barW / 2 + 1, iso.sy - buildingHeight - 9, (barW - 2) * hpRatio, 3);
  }

  // Selection highlight with glow
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
    
    // Glow effect
    ctx.strokeStyle = 'rgba(0, 255, 68, 0.3)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawCommandCenter(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any, time: number) {
  // Base platform with details
  ctx.fillStyle = '#3a3a3a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 8);
  
  // Platform details
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(sx - bw * 0.3, sy - 6, bw * 0.15, 4);
  ctx.fillRect(sx + bw * 0.15, sy - 6, bw * 0.15, 4);
  
  // Main structure
  ctx.fillStyle = colors.dark;
  drawIsoBlock(ctx, sx, sy - 8, bw * 0.9, bh * 0.9, height * 0.6);
  
  // Upper section
  ctx.fillStyle = colors.main;
  drawIsoBlock(ctx, sx, sy - 8 - height * 0.6, bw * 0.7, bh * 0.7, height * 0.3);
  
  // Windows with glow
  const windowGlow = 0.7 + Math.sin(time * 3) * 0.3;
  ctx.fillStyle = `rgba(170, 221, 255, ${windowGlow})`;
  ctx.fillRect(sx - 9, sy - height * 0.5, 5, 4);
  ctx.fillRect(sx + 4, sy - height * 0.5, 5, 4);
  ctx.fillRect(sx - 4, sy - height * 0.7, 8, 4);
  
  // Window glow effect
  ctx.fillStyle = `rgba(170, 221, 255, ${windowGlow * 0.3})`;
  ctx.beginPath();
  ctx.arc(sx - 7, sy - height * 0.5 + 2, 6, 0, Math.PI * 2);
  ctx.arc(sx + 6, sy - height * 0.5 + 2, 6, 0, Math.PI * 2);
  ctx.fill();
  
  // Antenna array
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height);
  ctx.lineTo(sx, sy - height - 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - 8, sy - height - 14);
  ctx.lineTo(sx + 8, sy - height - 14);
  ctx.stroke();
  
  // Red beacon with pulse
  const beaconPulse = 0.5 + Math.sin(time * 4) * 0.5;
  ctx.fillStyle = `rgba(255, 0, 0, ${beaconPulse})`;
  ctx.beginPath();
  ctx.arc(sx, sy - height - 18, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 0, 0, ${beaconPulse * 0.3})`;
  ctx.beginPath();
  ctx.arc(sx, sy - height - 18, 6, 0, Math.PI * 2);
  ctx.fill();
  
  // Armor plates
  ctx.fillStyle = colors.dark;
  ctx.fillRect(sx - bw * 0.35, sy - height * 0.4, bw * 0.1, height * 0.3);
  ctx.fillRect(sx + bw * 0.25, sy - height * 0.4, bw * 0.1, height * 0.3);
}

function drawFactory(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any, time: number) {
  // Foundation
  ctx.fillStyle = '#2a2a2a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 5);
  
  // Main building
  ctx.fillStyle = '#4a4a4a';
  drawIsoBlock(ctx, sx, sy - 5, bw * 0.95, bh * 0.95, height * 0.7);
  
  // Roof
  ctx.fillStyle = '#3a3a3a';
  drawIsoBlock(ctx, sx, sy - 5 - height * 0.7, bw * 0.95, bh * 0.95, 5);
  
  // Chimney with animated smoke
  ctx.fillStyle = '#333333';
  ctx.fillRect(sx + bw * 0.3, sy - height - 12, 7, 16);
  ctx.fillStyle = '#222222';
  ctx.fillRect(sx + bw * 0.3 - 1, sy - height - 14, 9, 3);
  
  // Animated smoke
  for (let i = 0; i < 3; i++) {
    const smokeY = sy - height - 16 - i * 6;
    const smokeX = sx + bw * 0.33 + 3 + Math.sin(time * 2 + i) * 2;
    const smokeAlpha = 0.4 - i * 0.1;
    ctx.fillStyle = `rgba(80,80,80,${smokeAlpha})`;
    ctx.beginPath();
    ctx.arc(smokeX, smokeY, 4 + i, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Bay door with warning lights
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(sx + bw * 0.2, sy - height * 0.4, bw * 0.4, height * 0.35);
  
  // Warning stripes
  ctx.fillStyle = '#ccaa00';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(sx + bw * 0.2 + i * 5, sy - height * 0.4 - 3, 3, 3);
  }
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.4, sy - height * 0.5, bw * 0.18, 4);
  ctx.fillRect(sx + bw * 0.22, sy - height * 0.5, bw * 0.18, 4);
  
  // Rivets
  ctx.fillStyle = '#5a5a5a';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(sx - bw * 0.35 + i * 8, sy - height * 0.3, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawResearchLab(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any, time: number) {
  // Base
  ctx.fillStyle = '#3a3a4a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 5);
  
  // Main structure
  ctx.fillStyle = '#4a4a5a';
  drawIsoBlock(ctx, sx, sy - 5, bw * 0.85, bh * 0.85, height * 0.6);
  
  // Dome with energy field
  ctx.fillStyle = '#5a6a7a';
  ctx.beginPath();
  ctx.ellipse(sx, sy - height * 0.7, bw * 0.38, bh * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a8a9a';
  ctx.beginPath();
  ctx.ellipse(sx - 2, sy - height * 0.75, bw * 0.22, bh * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Energy field effect
  const energyPulse = 0.3 + Math.sin(time * 5) * 0.2;
  ctx.strokeStyle = `rgba(68, 170, 255, ${energyPulse})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(sx, sy - height * 0.7, bw * 0.42, bh * 0.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  
  // Glowing windows
  ctx.fillStyle = '#44aaff';
  ctx.fillRect(sx - 7, sy - height * 0.3, 4, 5);
  ctx.fillRect(sx + 3, sy - height * 0.3, 4, 5);
  
  // Window glow
  ctx.fillStyle = 'rgba(68, 170, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(sx - 5, sy - height * 0.3 + 2, 5, 0, Math.PI * 2);
  ctx.arc(sx + 5, sy - height * 0.3 + 2, 5, 0, Math.PI * 2);
  ctx.fill();
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.38, sy - 4, bw * 0.76, 3);
  
  // Antenna
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height * 0.9);
  ctx.lineTo(sx, sy - height - 7);
  ctx.stroke();
  
  // Antenna tip
  ctx.fillStyle = '#44aaff';
  ctx.beginPath();
  ctx.arc(sx, sy - height - 7, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerPlant(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any, time: number) {
  // Base
  ctx.fillStyle = '#3a3a2a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 5);
  
  // Main structure
  ctx.fillStyle = '#4a4a3a';
  drawIsoBlock(ctx, sx, sy - 5, bw * 0.9, bh * 0.9, height * 0.5);
  
  // Cooling towers with steam
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
  
  // Animated steam
  for (let i = 0; i < 2; i++) {
    const towerX = sx + (i === 0 ? -bw * 0.2 : bw * 0.2);
    for (let j = 0; j < 3; j++) {
      const steamY = sy - height - 5 - j * 5;
      const steamX = towerX + Math.sin(time * 3 + i + j) * 2;
      const steamAlpha = 0.3 - j * 0.08;
      ctx.fillStyle = `rgba(150,150,150,${steamAlpha})`;
      ctx.beginPath();
      ctx.arc(steamX, steamY, 4 + j, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Lightning symbol with glow
  const lightningGlow = 0.7 + Math.sin(time * 6) * 0.3;
  ctx.fillStyle = `rgba(255, 204, 0, ${lightningGlow})`;
  ctx.beginPath();
  ctx.moveTo(sx - 2, sy - height * 0.35);
  ctx.lineTo(sx + 2, sy - height * 0.25);
  ctx.lineTo(sx, sy - height * 0.25);
  ctx.lineTo(sx + 2, sy - height * 0.15);
  ctx.lineTo(sx - 2, sy - height * 0.25);
  ctx.lineTo(sx, sy - height * 0.25);
  ctx.closePath();
  ctx.fill();
  
  // Lightning glow effect
  ctx.fillStyle = `rgba(255, 204, 0, ${lightningGlow * 0.3})`;
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.25, 8, 0, Math.PI * 2);
  ctx.fill();
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.42, sy - 4, bw * 0.84, 3);
  
  // Pipes
  ctx.strokeStyle = '#6a6a5a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - bw * 0.35, sy - height * 0.3);
  ctx.lineTo(sx - bw * 0.35, sy - 5);
  ctx.stroke();
}

function drawRepairBay(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any) {
  // Base
  ctx.fillStyle = '#2a3a2a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 5);
  
  // Main structure
  ctx.fillStyle = '#3a4a3a';
  drawIsoBlock(ctx, sx, sy - 5, bw * 0.9, bh * 0.9, height * 0.5);
  
  // Open front
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(sx - bw * 0.3, sy - height * 0.4, bw * 0.6, height * 0.35);
  
  // Crane arm with details
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height * 0.5);
  ctx.lineTo(sx, sy - height * 0.8);
  ctx.lineTo(sx + bw * 0.3, sy - height * 0.8);
  ctx.stroke();
  
  // Crane hook
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx + bw * 0.3, sy - height * 0.8);
  ctx.lineTo(sx + bw * 0.3, sy - height * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx + bw * 0.3, sy - height * 0.7, 2, 0, Math.PI * 2);
  ctx.stroke();
  
  // Green cross with glow
  ctx.fillStyle = '#00cc44';
  ctx.fillRect(sx - 2.5, sy - height * 0.6, 5, 12);
  ctx.fillRect(sx - 6, sy - height * 0.55, 12, 5);
  
  // Cross glow
  ctx.fillStyle = 'rgba(0, 204, 68, 0.3)';
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.55, 8, 0, Math.PI * 2);
  ctx.fill();
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.42, sy - 4, bw * 0.84, 3);
  
  // Tools on wall
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(sx - bw * 0.25, sy - height * 0.35, 2, 8);
  ctx.fillRect(sx + bw * 0.2, sy - height * 0.35, 2, 8);
}

function drawRadarStation(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any, time: number) {
  // Base
  ctx.fillStyle = '#3a3a4a';
  drawIsoBlock(ctx, sx, sy, bw, bh, 5);
  
  // Main structure
  ctx.fillStyle = '#4a4a5a';
  drawIsoBlock(ctx, sx, sy - 5, bw * 0.8, bh * 0.8, height * 0.4);
  
  // Rotating radar dish
  const dishAngle = time * 2;
  ctx.save();
  ctx.translate(sx, sy - height * 0.7);
  ctx.rotate(dishAngle * 0.1);
  
  ctx.fillStyle = '#6a6a7a';
  ctx.beginPath();
  ctx.ellipse(0, 0, bw * 0.42, bh * 0.32, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a8a9a';
  ctx.beginPath();
  ctx.ellipse(-2, -2, bw * 0.27, bh * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
  
  // Dish support
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - height * 0.4);
  ctx.lineTo(sx, sy - height * 0.65);
  ctx.stroke();
  
  // Signal waves (animated)
  const waveAlpha = 0.3 + Math.sin(time * 4) * 0.2;
  ctx.strokeStyle = `rgba(100, 200, 255, ${waveAlpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.7, bw * 0.5, -0.8, 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.7, bw * 0.6, -0.6, 0.2);
  ctx.stroke();
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - bw * 0.38, sy - 4, bw * 0.76, 3);
  
  // Control panel
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(sx - bw * 0.2, sy - height * 0.3, bw * 0.4, height * 0.15);
  ctx.fillStyle = '#44aaff';
  ctx.fillRect(sx - bw * 0.15, sy - height * 0.28, 3, 3);
  ctx.fillRect(sx + bw * 0.1, sy - height * 0.28, 3, 3);
}

function drawDefenseTower(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, height: number, colors: any, time: number) {
  // Base
  ctx.fillStyle = '#3a3a3a';
  drawIsoBlock(ctx, sx, sy, bw * 0.8, bh * 0.8, 5);
  
  // Tower body with details
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(sx - 6, sy - height * 0.7, 12, height * 0.7);
  
  // Rivets
  ctx.fillStyle = '#5a5a5a';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(sx - 4, sy - height * 0.6 + i * 8, 1, 0, Math.PI * 2);
    ctx.arc(sx + 4, sy - height * 0.6 + i * 8, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Turret
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.75, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.main;
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.75, 6, 0, Math.PI * 2);
  ctx.fill();
  
  // Barrel
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(sx, sy - height * 0.78, 14, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(sx + 12, sy - height * 0.79, 4, 6);
  
  // Muzzle brake
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(sx + 13, sy - height * 0.8, 2, 8);
  
  // Color accent
  ctx.fillStyle = colors.main;
  ctx.fillRect(sx - 7, sy - 4, 14, 3);
  
  // Targeting light
  const targetPulse = 0.5 + Math.sin(time * 5) * 0.5;
  ctx.fillStyle = `rgba(255, 0, 0, ${targetPulse})`;
  ctx.beginPath();
  ctx.arc(sx, sy - height * 0.75, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawWall(ctx: CanvasRenderingContext2D, sx: number, sy: number, bw: number, bh: number, colors: any) {
  // Wall block with texture
  ctx.fillStyle = '#5a5a5a';
  drawIsoBlock(ctx, sx, sy, bw * 0.7, bh * 0.7, 12);
  
  // Top
  ctx.fillStyle = '#6a6a6a';
  drawIsoBlock(ctx, sx, sy - 12, bw * 0.6, bh * 0.6, 3);
  
  // Cracks
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(sx - 3, sy - 8);
  ctx.lineTo(sx + 2, sy - 6);
  ctx.stroke();
  
  // Color accent
  ctx.fillStyle = colors.dark;
  ctx.fillRect(sx - 5, sy - 10, 10, 2);
  
  // Reinforcement bars
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(sx - bw * 0.25, sy - 11, 2, 10);
  ctx.fillRect(sx + bw * 0.2, sy - 11, 2, 10);
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
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
  }
  return color;
}

function drawUnit(ctx: CanvasRenderingContext2D, unit: Unit, visible: boolean, time: number) {
  const iso = toIso(unit.x, unit.y);
  const colors = PLAYER_COLORS[unit.owner as 0 | 1];
  const size = unit.stats.size * TILE_SIZE * 0.4;
  
  ctx.globalAlpha = visible ? 1 : 0.6;

  // Dynamic shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(iso.sx + 2, iso.sy + 3, size * 0.85, size * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Convert angle to iso direction
  const dirX = Math.cos(unit.angle);
  const dirY = Math.sin(unit.angle);
  const isoDirX = (dirX - dirY) * 0.5;
  const isoDirY = (dirX + dirY) * 0.25;
  const isoAngle = Math.atan2(isoDirY, isoDirX);

  ctx.save();
  ctx.translate(iso.sx, iso.sy);

  // Dust trail when moving
  if (unit.state === 'moving' && Math.random() < 0.3) {
    ctx.fillStyle = 'rgba(100, 90, 70, 0.3)';
    ctx.beginPath();
    ctx.arc(-size * 0.5, size * 0.3, 2, 0, Math.PI * 2);
    ctx.fill();
  }

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

  // Health bar with glow
  if (unit.hp < unit.maxHp) {
    const barW = size * 2;
    const hpRatio = unit.hp / unit.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(iso.sx - barW / 2, iso.sy - size - 12, barW, 4);
    ctx.fillStyle = hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ffaa00' : '#ff2222';
    ctx.fillRect(iso.sx - barW / 2 + 0.5, iso.sy - size - 11.5, (barW - 1) * hpRatio, 3);
    
    // Health bar glow
    ctx.fillStyle = hpRatio > 0.5 ? 'rgba(68, 255, 68, 0.3)' : hpRatio > 0.25 ? 'rgba(255, 170, 0, 0.3)' : 'rgba(255, 34, 34, 0.3)';
    ctx.fillRect(iso.sx - barW / 2, iso.sy - size - 12, barW * hpRatio, 4);
  }

  // Selection indicator with glow
  if (unit.selected) {
    ctx.strokeStyle = '#00ff44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(iso.sx, iso.sy + 2, size + 4, size * 0.5 + 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 255, 68, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawScoutVehicle(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Body with armor plates
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.65, -size * 0.32, size * 1.3, size * 0.64);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.55, -size * 0.27, size * 1.1, size * 0.54);
  
  // Wheels with detail
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.55, -size * 0.37, size * 0.22, size * 0.12);
  ctx.fillRect(-size * 0.55, size * 0.25, size * 0.22, size * 0.12);
  ctx.fillRect(size * 0.33, -size * 0.37, size * 0.22, size * 0.12);
  ctx.fillRect(size * 0.33, size * 0.25, size * 0.22, size * 0.12);
  
  // Wheel hubs
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.arc(-size * 0.44, -size * 0.31, 1.5, 0, Math.PI * 2);
  ctx.arc(-size * 0.44, size * 0.31, 1.5, 0, Math.PI * 2);
  ctx.arc(size * 0.44, -size * 0.31, 1.5, 0, Math.PI * 2);
  ctx.arc(size * 0.44, size * 0.31, 1.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Turret/gun
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.2, -2, size * 0.55, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 0.7, -2.5, 3, 5);
  
  // Highlight
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.35, -size * 0.17, size * 0.35, size * 0.12);
  
  // Rivets
  ctx.fillStyle = '#5a5a5a';
  ctx.beginPath();
  ctx.arc(-size * 0.4, 0, 1, 0, Math.PI * 2);
  ctx.arc(size * 0.1, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawBuggyVehicle(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Body with armor
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.75, -size * 0.42, size * 1.5, size * 0.84);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.65, -size * 0.37, size * 1.3, size * 0.74);
  
  // Large wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(-size * 0.5, -size * 0.37, 3.5, 0, Math.PI * 2);
  ctx.arc(-size * 0.5, size * 0.37, 3.5, 0, Math.PI * 2);
  ctx.arc(size * 0.5, -size * 0.37, 3.5, 0, Math.PI * 2);
  ctx.arc(size * 0.5, size * 0.37, 3.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Wheel detail
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.arc(-size * 0.5, -size * 0.37, 2, 0, Math.PI * 2);
  ctx.arc(-size * 0.5, size * 0.37, 2, 0, Math.PI * 2);
  ctx.arc(size * 0.5, -size * 0.37, 2, 0, Math.PI * 2);
  ctx.arc(size * 0.5, size * 0.37, 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Gun mount
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.1, -2.5, size * 0.65, 5);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 0.7, -3, 4, 6);
  
  // Armor detail
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.45, -size * 0.22, size * 0.25, size * 0.17);
  
  // Armor plates
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.6, -size * 0.15, size * 0.1, size * 0.3);
  ctx.fillRect(size * 0.5, -size * 0.15, size * 0.1, size * 0.3);
  
  ctx.restore();
}

function drawMediumTank(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks with detail
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.85, -size * 0.58, size * 1.7, size * 0.17);
  ctx.fillRect(-size * 0.85, size * 0.41, size * 1.7, size * 0.17);
  // Track segments
  ctx.fillStyle = '#2a2a2a';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(-size * 0.8 + i * size * 0.27, -size * 0.58, 2, size * 0.17);
    ctx.fillRect(-size * 0.8 + i * size * 0.27, size * 0.41, 2, size * 0.17);
  }
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.75, -size * 0.42, size * 1.5, size * 0.84);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.65, -size * 0.37, size * 1.3, size * 0.74);
  
  // Turret
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.main;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.27, 0, Math.PI * 2);
  ctx.fill();
  
  // Barrel
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.22, -3, size * 0.75, 6);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 0.9, -3.5, 5, 7);
  // Muzzle brake
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(size * 0.95, -4, 2, 8);
  
  // Details
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.45, -size * 0.22, size * 0.18, size * 0.12);
  ctx.fillRect(-size * 0.45, size * 0.1, size * 0.18, size * 0.12);
  
  // Rivets
  ctx.fillStyle = '#5a5a5a';
  ctx.beginPath();
  ctx.arc(-size * 0.5, -size * 0.1, 1, 0, Math.PI * 2);
  ctx.arc(-size * 0.5, size * 0.1, 1, 0, Math.PI * 2);
  ctx.arc(size * 0.1, -size * 0.3, 1, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawHeavyTank(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Heavy tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.95, -size * 0.68, size * 1.9, size * 0.22);
  ctx.fillRect(-size * 0.95, size * 0.46, size * 1.9, size * 0.22);
  ctx.fillStyle = '#2a2a2a';
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(-size * 0.9 + i * size * 0.26, -size * 0.68, 2, size * 0.22);
    ctx.fillRect(-size * 0.9 + i * size * 0.26, size * 0.46, 2, size * 0.22);
  }
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.85, -size * 0.52, size * 1.7, size * 1.04);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.75, -size * 0.47, size * 1.5, size * 0.94);
  
  // Extra armor plates
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.9, -size * 0.32, size * 0.17, size * 0.64);
  ctx.fillRect(size * 0.73, -size * 0.32, size * 0.17, size * 0.64);
  
  // Large turret
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.main;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.37, 0, Math.PI * 2);
  ctx.fill();
  
  // Heavy barrel
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.27, -4, size * 0.95, 8);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 1.1, -4.5, 6, 9);
  // Muzzle brake
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(size * 1.15, -5.5, 2, 11);
  
  // Details
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.55, -size * 0.27, size * 0.22, size * 0.14);
  ctx.fillRect(-size * 0.55, size * 0.13, size * 0.22, size * 0.14);
  
  // Rivets
  ctx.fillStyle = '#5a5a5a';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-size * 0.6 + i * size * 0.2, -size * 0.15, 1, 0, Math.PI * 2);
    ctx.arc(-size * 0.6 + i * size * 0.2, size * 0.15, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

function drawArtillery(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.75, -size * 0.48, size * 1.5, size * 0.17);
  ctx.fillRect(-size * 0.75, size * 0.31, size * 1.5, size * 0.17);
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.65, -size * 0.38, size * 1.3, size * 0.76);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.55, -size * 0.33, size * 1.1, size * 0.66);
  
  // Long barrel
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(size * 0.1, -2.5, size * 1.4, 5);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(size * 1.4, -3, 5, 6);
  
  // Base plate
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(-size * 0.75, -size * 0.17, size * 0.22, size * 0.34);
  
  // Turret housing
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(-size * 0.1, 0, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  
  // Details
  ctx.fillStyle = colors.light;
  ctx.fillRect(-size * 0.4, -size * 0.2, size * 0.15, size * 0.1);
  
  ctx.restore();
}

function drawMissileVehicle(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.75, -size * 0.48, size * 1.5, size * 0.17);
  ctx.fillRect(-size * 0.75, size * 0.31, size * 1.5, size * 0.17);
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.65, -size * 0.38, size * 1.3, size * 0.76);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.55, -size * 0.33, size * 1.1, size * 0.66);
  
  // Missile pods
  ctx.fillStyle = '#3a3a3a';
  ctx.save();
  ctx.rotate(-0.3);
  ctx.fillRect(-size * 0.22, -size * 0.52, size * 0.55, size * 0.17);
  ctx.fillRect(-size * 0.22, size * 0.35, size * 0.55, size * 0.17);
  // Missiles
  ctx.fillStyle = '#aa2222';
  ctx.fillRect(-size * 0.12, -size * 0.5, size * 0.4, size * 0.1);
  ctx.fillRect(-size * 0.12, size * 0.4, size * 0.4, size * 0.1);
  // Missile tips
  ctx.fillStyle = '#ffaa00';
  ctx.fillRect(size * 0.25, -size * 0.49, size * 0.05, size * 0.08);
  ctx.fillRect(size * 0.25, size * 0.41, size * 0.05, size * 0.08);
  ctx.restore();
  
  // Launcher housing
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawAAVehicle(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.75, -size * 0.48, size * 1.5, size * 0.17);
  ctx.fillRect(-size * 0.75, size * 0.31, size * 1.5, size * 0.17);
  
  // Hull
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-size * 0.65, -size * 0.38, size * 1.3, size * 0.76);
  ctx.fillStyle = colors.main;
  ctx.fillRect(-size * 0.55, -size * 0.33, size * 1.1, size * 0.66);
  
  // Twin AA guns
  ctx.fillStyle = '#2a2a2a';
  ctx.save();
  ctx.rotate(-0.4);
  ctx.fillRect(size * 0.1, -4.5, size * 0.65, 3.5);
  ctx.fillRect(size * 0.1, 1, size * 0.65, 3.5);
  ctx.restore();
  
  // Radar dish
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, -size * 0.22, size * 0.22, -Math.PI * 0.7, Math.PI * 0.2);
  ctx.stroke();
  
  // Turret base
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawRepairUnit(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Body
  ctx.fillStyle = '#2a4a2a';
  ctx.fillRect(-size * 0.65, -size * 0.38, size * 1.3, size * 0.76);
  ctx.fillStyle = '#3a6a3a';
  ctx.fillRect(-size * 0.55, -size * 0.33, size * 1.1, size * 0.66);
  
  // Wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.55, -size * 0.43, size * 0.22, size * 0.12);
  ctx.fillRect(-size * 0.55, size * 0.31, size * 0.22, size * 0.12);
  ctx.fillRect(size * 0.33, -size * 0.43, size * 0.22, size * 0.12);
  ctx.fillRect(size * 0.33, size * 0.31, size * 0.22, size * 0.12);
  
  // Crane arm
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(size * 0.2, 0);
  ctx.lineTo(size * 0.55, -size * 0.32);
  ctx.lineTo(size * 0.65, -size * 0.22);
  ctx.stroke();
  
  // Green cross with glow
  ctx.fillStyle = '#00cc44';
  ctx.fillRect(-2.5, -size * 0.22, 5, size * 0.44);
  ctx.fillRect(-size * 0.22, -2.5, size * 0.44, 5);
  
  // Cross glow
  ctx.fillStyle = 'rgba(0, 204, 68, 0.3)';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawHarvester(ctx: CanvasRenderingContext2D, size: number, colors: any, angle: number, harvestAmount: number) {
  ctx.save();
  ctx.rotate(angle * 0.3);
  
  // Tracks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-size * 0.85, -size * 0.53, size * 1.7, size * 0.17);
  ctx.fillRect(-size * 0.85, size * 0.36, size * 1.7, size * 0.17);
  
  // Hull
  ctx.fillStyle = '#4a3a1a';
  ctx.fillRect(-size * 0.75, -size * 0.43, size * 1.5, size * 0.86);
  ctx.fillStyle = '#6a5a2a';
  ctx.fillRect(-size * 0.65, -size * 0.38, size * 1.3, size * 0.76);
  
  // Cargo bed
  ctx.fillStyle = '#5a4a1a';
  ctx.fillRect(-size * 0.55, -size * 0.28, size * 0.75, size * 0.56);
  
  // Cargo fill
  if (harvestAmount > 0) {
    const fill = harvestAmount / 50;
    ctx.fillStyle = '#aa8833';
    ctx.fillRect(-size * 0.5, -size * 0.23, size * 0.65 * fill, size * 0.46);
    ctx.fillStyle = '#ccaa44';
    ctx.fillRect(-size * 0.45, -size * 0.18, size * 0.55 * fill, size * 0.18);
  }
  
  // Bucket/scoop
  ctx.fillStyle = '#7a6a3a';
  ctx.fillRect(size * 0.55, -size * 0.33, size * 0.33, size * 0.66);
  ctx.fillStyle = '#8a7a4a';
  ctx.fillRect(size * 0.65, -size * 0.28, size * 0.22, size * 0.56);
  
  // Details
  ctx.fillStyle = '#3a2a0a';
  ctx.fillRect(-size * 0.65, -size * 0.33, size * 0.12, size * 0.66);
  
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, proj: any, sx: number, sy: number) {
  const size = proj.type === 'shell' ? 5 : proj.type === 'missile' ? 4 : 3;
  
  // Glow
  const glowColor = proj.type === 'missile' ? 'rgba(255,100,0,0.6)' : 'rgba(255,200,0,0.5)';
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.arc(sx, sy - 5, size + 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Core
  ctx.fillStyle = proj.type === 'missile' ? '#ff6600' : proj.type === 'shell' ? '#ffcc00' : '#ffff88';
  ctx.beginPath();
  ctx.arc(sx, sy - 5, size, 0, Math.PI * 2);
  ctx.fill();
  
  // Trail
  const dx = proj.targetX - proj.x;
  const dy = proj.targetY - proj.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 0) {
    const trailLength = proj.type === 'missile' ? 12 : 8;
    const trailColor = proj.type === 'missile' ? 'rgba(255,100,0,0.4)' : 'rgba(255,255,0,0.3)';
    ctx.strokeStyle = trailColor;
    ctx.lineWidth = proj.type === 'missile' ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 5);
    ctx.lineTo(sx - (dx / d) * trailLength, sy - 5 - (dy / d) * trailLength);
    ctx.stroke();
  }
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

  // Camera viewport
  const cam = state.camera;
  const hw = TILE_SIZE * 0.5;
  const hh = TILE_SIZE * 0.25;
  const camTileX = (cam.x / hw + cam.y / hh) / 2;
  const camTileY = (cam.y / hh - cam.x / hw) / 2;
  const viewW = (window.innerWidth / cam.zoom) / TILE_SIZE;
  const viewH = (window.innerHeight / cam.zoom) / TILE_SIZE;
  
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    Math.max(0, (camTileX - viewW / 2)) * scaleX,
    Math.max(0, (camTileY - viewH / 2)) * scaleY,
    Math.min(viewW, MAP_WIDTH - camTileX + viewW / 2) * scaleX,
    Math.min(viewH, MAP_HEIGHT - camTileY + viewH / 2) * scaleY
  );
  
  // Border
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, width, height);
}
