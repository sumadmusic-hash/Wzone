// Iron Horizon - Core Game Engine
import {
  GameState, Unit, Building, Projectile, Particle, Tile, Position,
  PlayerState, UnitType, BuildingType, PlayerId, TerrainType,
  UNIT_STATS, BUILDING_STATS, RESEARCH_TREE, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE,
  ResearchNode, UnitState, BuildingState
} from './types';
import { findPath, separateUnits } from './pathfinding';
import { playShot, playExplosion } from './audio';

let nextId = 1;
function genId(): string { return `id_${nextId++}`; }

// Map Generation
function generateMap(): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    tiles[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      tiles[y][x] = {
        terrain: 'plain',
        explored: [false, false],
        visible: [false, false],
      };
    }
  }

  // Generate terrain with noise-like patterns
  // Add some forests (dead/damaged trees for post-apocalyptic feel)
  for (let i = 0; i < 25; i++) {
    const cx = Math.floor(Math.random() * MAP_WIDTH);
    const cy = Math.floor(Math.random() * MAP_HEIGHT);
    const radius = 3 + Math.floor(Math.random() * 6);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
          if (dx * dx + dy * dy < radius * radius * 0.8 && Math.random() < 0.7) {
            tiles[ny][nx].terrain = 'forest';
          }
        }
      }
    }
  }

  // Add rubble/debris scattered around
  for (let i = 0; i < 30; i++) {
    const cx = Math.floor(Math.random() * MAP_WIDTH);
    const cy = Math.floor(Math.random() * MAP_HEIGHT);
    const radius = 1 + Math.floor(Math.random() * 3);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
          if (Math.random() < 0.5 && tiles[ny][nx].terrain === 'plain') {
            tiles[ny][nx].terrain = 'rubble';
          }
        }
      }
    }
  }

  // Add rock formations
  for (let i = 0; i < 15; i++) {
    const cx = Math.floor(Math.random() * MAP_WIDTH);
    const cy = Math.floor(Math.random() * MAP_HEIGHT);
    const radius = 2 + Math.floor(Math.random() * 3);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
          if (Math.random() < 0.6 && dx * dx + dy * dy < radius * radius) {
            tiles[ny][nx].terrain = 'rock';
          }
        }
      }
    }
  }

  // Add roads connecting start areas
  const roadY = Math.floor(MAP_HEIGHT / 2);
  for (let x = 0; x < MAP_WIDTH; x++) {
    if (tiles[roadY][x].terrain === 'plain' || tiles[roadY][x].terrain === 'forest') {
      tiles[roadY][x].terrain = 'road';
      if (roadY + 1 < MAP_HEIGHT) tiles[roadY + 1][x].terrain = 'road';
    }
  }

  // Add resource deposits
  const resourcePositions = [
    { x: 20, y: 20 }, { x: 35, y: 15 }, { x: 15, y: 40 },
    { x: MAP_WIDTH - 20, y: MAP_HEIGHT - 20 }, { x: MAP_WIDTH - 35, y: MAP_HEIGHT - 15 },
    { x: MAP_WIDTH - 15, y: MAP_HEIGHT - 40 },
    { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 - 10 }, { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 + 10 },
    { x: 50, y: MAP_HEIGHT / 2 }, { x: MAP_WIDTH - 50, y: MAP_HEIGHT / 2 },
  ];

  for (const pos of resourcePositions) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = pos.x + dx;
        const ny = pos.y + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
          if (Math.random() < 0.7) {
            tiles[ny][nx].terrain = 'resource';
            tiles[ny][nx].resourceAmount = 500 + Math.floor(Math.random() * 500);
          }
        }
      }
    }
  }

  // Clear starting areas
  clearArea(tiles, 5, 5, 12, 12);
  clearArea(tiles, MAP_WIDTH - 17, MAP_HEIGHT - 17, 12, 12);

  return tiles;
}

function clearArea(tiles: Tile[][], startX: number, startY: number, width: number, height: number) {
  for (let y = startY; y < startY + height && y < MAP_HEIGHT; y++) {
    for (let x = startX; x < startX + width && x < MAP_WIDTH; x++) {
      if (x >= 0 && y >= 0) {
        tiles[y][x].terrain = 'plain';
        tiles[y][x].buildingId = undefined;
      }
    }
  }
}

// Create initial game state
export function createGameState(difficulty: 'easy' | 'normal' | 'hard' = 'normal'): GameState {
  nextId = 1;
  const tiles = generateMap();

  const players: PlayerState[] = [
    { id: 0, metal: 1000, energy: 50, maxEnergy: 50, energyUsed: 0, researchCompleted: [], researchActive: null, researchProgress: 0, unitsBuilt: 0, buildingsBuilt: 0, enemiesDestroyed: 0 },
    { id: 1, metal: 1000, energy: 50, maxEnergy: 50, energyUsed: 0, researchCompleted: [], researchActive: null, researchProgress: 0, unitsBuilt: 0, buildingsBuilt: 0, enemiesDestroyed: 0 },
  ];

  const buildings: Building[] = [];

  // Player 0 Command Center
  const cc1: Building = {
    id: genId(), type: 'command_center', owner: 0,
    x: 8, y: 8, hp: 2000, maxHp: 2000,
    state: 'active', buildProgress: 1,
    productionQueue: [], researchQueue: [],
  };
  buildings.push(cc1);
  markBuildingTiles(tiles, cc1);

  // AI Command Center
  const cc2: Building = {
    id: genId(), type: 'command_center', owner: 1,
    x: MAP_WIDTH - 11, y: MAP_HEIGHT - 11, hp: 2000, maxHp: 2000,
    state: 'active', buildProgress: 1,
    productionQueue: [], researchQueue: [],
  };
  buildings.push(cc2);
  markBuildingTiles(tiles, cc2);

  // Starting units for player
  const units: Unit[] = [];
  const startUnits0: UnitType[] = ['scout', 'medium_tank', 'harvester'];
  for (let i = 0; i < startUnits0.length; i++) {
    const type = startUnits0[i];
    const stats = { ...UNIT_STATS[type] };
    const unit: Unit = {
      id: genId(), type, owner: 0,
      x: 10 + i * 2, y: 12,
      hp: stats.maxHp, maxHp: stats.maxHp,
      state: type === 'harvester' ? 'harvesting' : 'idle',
      lastFireTime: 0, angle: 0,
      selected: false, harvestAmount: 0, stats,
    };
    units.push(unit);
  }

  // Starting units for AI
  const startUnits1: UnitType[] = ['scout', 'medium_tank', 'harvester'];
  for (let i = 0; i < startUnits1.length; i++) {
    const type = startUnits1[i];
    const stats = { ...UNIT_STATS[type] };
    const unit: Unit = {
      id: genId(), type, owner: 1,
      x: MAP_WIDTH - 10 - i * 2, y: MAP_HEIGHT - 12,
      hp: stats.maxHp, maxHp: stats.maxHp,
      state: type === 'harvester' ? 'harvesting' : 'idle',
      lastFireTime: 0, angle: 0,
      selected: false, harvestAmount: 0, stats,
    };
    units.push(unit);
  }

  // Reveal starting areas
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      tiles[y][x].explored[0] = true;
      tiles[y][x].visible[0] = true;
    }
  }
  for (let y = MAP_HEIGHT - 20; y < MAP_HEIGHT; y++) {
    for (let x = MAP_WIDTH - 20; x < MAP_WIDTH; x++) {
      tiles[y][x].explored[1] = true;
      tiles[y][x].visible[1] = true;
    }
  }

  return {
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    tileSize: TILE_SIZE,
    tiles,
    units,
    buildings,
    projectiles: [],
    particles: [],
    players,
    time: 0,
    speed: 1,
    paused: false,
    gameOver: false,
    winner: null,
    difficulty,
    camera: { x: (8 - 8) * TILE_SIZE * 0.5, y: (8 + 8) * TILE_SIZE * 0.25, zoom: 1 },
    selection: [],
    selectionBox: null,
    placingBuilding: null,
    groups: new Map(),
    messages: [{ text: 'Welcome to Iron Horizon. Build your base and destroy the enemy!', time: 0, type: 'info' }],
  };
}

function markBuildingTiles(tiles: Tile[][], building: Building) {
  const stats = BUILDING_STATS[building.type];
  for (let dy = 0; dy < stats.height; dy++) {
    for (let dx = 0; dx < stats.width; dx++) {
      const tx = building.x + dx;
      const ty = building.y + dy;
      if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
        tiles[ty][tx].buildingId = building.id;
      }
    }
  }
}

function unmarkBuildingTiles(tiles: Tile[][], building: Building) {
  const stats = BUILDING_STATS[building.type];
  for (let dy = 0; dy < stats.height; dy++) {
    for (let dx = 0; dx < stats.width; dx++) {
      const tx = building.x + dx;
      const ty = building.y + dy;
      if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
        tiles[ty][tx].buildingId = undefined;
      }
    }
  }
}

export function canPlaceBuilding(state: GameState, type: BuildingType, x: number, y: number, owner: PlayerId): boolean {
  const stats = BUILDING_STATS[type];
  for (let dy = 0; dy < stats.height; dy++) {
    for (let dx = 0; dx < stats.width; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return false;
      const tile = state.tiles[ty][tx];
      if (tile.terrain === 'rock' || tile.terrain === 'water' || tile.terrain === 'resource') return false;
      if (tile.buildingId) return false;
    }
  }
  // Check cost
  if (state.players[owner].metal < stats.cost) return false;
  return true;
}

export function placeBuilding(state: GameState, type: BuildingType, x: number, y: number, owner: PlayerId): Building | null {
  if (!canPlaceBuilding(state, type, x, y, owner)) return null;
  const stats = BUILDING_STATS[type];
  state.players[owner].metal -= stats.cost;

  const building: Building = {
    id: genId(), type, owner, x, y,
    hp: stats.maxHp * 0.1, maxHp: stats.maxHp,
    state: 'constructing', buildProgress: 0,
    productionQueue: [], researchQueue: [],
  };
  state.buildings.push(building);
  markBuildingTiles(state.tiles, building);
  state.players[owner].buildingsBuilt++;
  return building;
}

// Visibility system
export function updateVisibility(state: GameState) {
  // Clear current visibility
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      state.tiles[y][x].visible[0] = false;
      state.tiles[y][x].visible[1] = false;
    }
  }

  // Reveal from units
  for (const unit of state.units) {
    if (unit.state === 'dead') continue;
    const sight = unit.stats.sight;
    const owner = unit.owner;
    const ux = Math.floor(unit.x);
    const uy = Math.floor(unit.y);
    for (let dy = -sight; dy <= sight; dy++) {
      for (let dx = -sight; dx <= sight; dx++) {
        if (dx * dx + dy * dy <= sight * sight) {
          const nx = ux + dx;
          const ny = uy + dy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
            state.tiles[ny][nx].visible[owner] = true;
            state.tiles[ny][nx].explored[owner] = true;
          }
        }
      }
    }
  }

  // Reveal from buildings
  for (const building of state.buildings) {
    if (building.state === 'destroyed') continue;
    const sight = building.type === 'radar_station' ? 12 : 8;
    const owner = building.owner;
    const stats = BUILDING_STATS[building.type];
    const bx = building.x + Math.floor(stats.width / 2);
    const by = building.y + Math.floor(stats.height / 2);
    for (let dy = -sight; dy <= sight; dy++) {
      for (let dx = -sight; dx <= sight; dx++) {
        if (dx * dx + dy * dy <= sight * sight) {
          const nx = bx + dx;
          const ny = by + dy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
            state.tiles[ny][nx].visible[owner] = true;
            state.tiles[ny][nx].explored[owner] = true;
          }
        }
      }
    }
  }
}

// Energy calculation
function updateEnergy(state: GameState) {
  for (let p = 0; p < 2; p++) {
    let generation = 0;
    let usage = 0;
    for (const b of state.buildings) {
      if (b.owner !== p || b.state === 'destroyed') continue;
      const stats = BUILDING_STATS[b.type];
      generation += stats.powerGeneration;
      usage += stats.powerUsage;
    }
    state.players[p].maxEnergy = generation;
    state.players[p].energyUsed = usage;
    state.players[p].energy = generation - usage;
  }
}

// Combat system
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function findTarget(state: GameState, unit: Unit): Unit | Building | null {
  let bestTarget: Unit | Building | null = null;
  let bestDist = Infinity;

  // Find nearest enemy unit
  for (const other of state.units) {
    if (other.owner === unit.owner || other.state === 'dead') continue;
    const d = dist(unit, other);
    if (d <= unit.stats.range && d < bestDist) {
      bestDist = d;
      bestTarget = other;
    }
  }

  // Also check enemy buildings
  for (const building of state.buildings) {
    if (building.owner === unit.owner || building.state === 'destroyed') continue;
    const stats = BUILDING_STATS[building.type];
    const bx = building.x + stats.width / 2;
    const by = building.y + stats.height / 2;
    const d = dist(unit, { x: bx, y: by });
    if (d <= unit.stats.range && d < bestDist) {
      bestDist = d;
      bestTarget = building;
    }
  }

  return bestTarget;
}

function fireProjectile(state: GameState, unit: Unit, target: Unit | Building) {
  const targetX = 'type' in target && target.type in BUILDING_STATS
    ? (target as Building).x + BUILDING_STATS[(target as Building).type].width / 2
    : (target as Unit).x;
  const targetY = 'type' in target && target.type in BUILDING_STATS
    ? (target as Building).y + BUILDING_STATS[(target as Building).type].height / 2
    : (target as Unit).y;

  let projType: 'bullet' | 'shell' | 'missile' | 'rocket' = 'bullet';
  if (unit.type === 'artillery') projType = 'shell';
  else if (unit.type === 'missile') projType = 'missile';
  else if (unit.type === 'aa_vehicle') projType = 'rocket';

  state.projectiles.push({
    id: genId(),
    x: unit.x, y: unit.y,
    targetX, targetY,
    targetId: target.id,
    speed: unit.stats.projectileSpeed,
    damage: unit.stats.damage,
    owner: unit.owner,
    type: projType,
  });

  // Muzzle flash particle
  for (let i = 0; i < 3; i++) {
    state.particles.push({
      x: unit.x, y: unit.y,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      life: 0.3, maxLife: 0.3,
      color: '#ffaa00', size: 3,
    });
  }

  // Sound effect (only for player units to avoid too many sounds)
  if (unit.owner === 0) playShot();
}

function applyDamage(state: GameState, target: Unit | Building, damage: number, attacker: PlayerId) {
  const armor = 'stats' in target ? target.stats.armor : 5;
  const actualDamage = Math.max(1, damage - armor * 0.5);

  if ('stats' in target) {
    (target as Unit).hp -= actualDamage;
    if ((target as Unit).hp <= 0) {
      (target as Unit).state = 'dead';
      spawnExplosion(state, (target as Unit).x, (target as Unit).y);
      state.players[attacker].enemiesDestroyed++;
    }
  } else {
    (target as Building).hp -= actualDamage;
    if ((target as Building).hp <= 0) {
      (target as Building).state = 'destroyed';
      unmarkBuildingTiles(state.tiles, target as Building);
      spawnExplosion(state, (target as Building).x + 1, (target as Building).y + 1);
      state.players[attacker].enemiesDestroyed++;
    }
  }
}

function spawnExplosion(state: GameState, x: number, y: number, playSound = true) {
  if (playSound) playExplosion();
  for (let i = 0; i < 15; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1,
      color: Math.random() > 0.5 ? '#ff4400' : '#ffaa00',
      size: 2 + Math.random() * 4,
    });
  }
  // Smoke
  for (let i = 0; i < 5; i++) {
    state.particles.push({
      x: x + (Math.random() - 0.5), y: y + (Math.random() - 0.5),
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.5 - Math.random() * 0.5,
      life: 1 + Math.random(), maxLife: 2,
      color: '#555555', size: 4 + Math.random() * 4,
    });
  }
}

// Unit movement and behavior
function updateUnit(state: GameState, unit: Unit, dt: number) {
  if (unit.state === 'dead') return;

  const speed = unit.stats.speed * dt;

  // Check for enemies in range (auto-attack)
  if (unit.state === 'idle' || unit.state === 'moving') {
    const target = findTarget(state, unit);
    if (target && unit.stats.damage > 0) {
      unit.state = 'attacking';
      unit.targetId = target.id;
    }
  }

  switch (unit.state) {
    case 'idle':
      break;

    case 'moving': {
      if (unit.path && unit.pathIndex !== undefined && unit.pathIndex < unit.path.length) {
        const waypoint = unit.path[unit.pathIndex];
        const dx = waypoint.x - unit.x;
        const dy = waypoint.y - unit.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < 0.3) {
          unit.pathIndex++;
          if (unit.pathIndex >= unit.path.length) {
            unit.state = 'idle';
            unit.path = undefined;
          }
        } else {
          unit.x += (dx / d) * speed;
          unit.y += (dy / d) * speed;
          unit.angle = Math.atan2(dy, dx);
        }
      } else if (unit.targetX !== undefined && unit.targetY !== undefined) {
        const dx = unit.targetX - unit.x;
        const dy = unit.targetY - unit.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.5) {
          unit.state = 'idle';
        } else {
          unit.x += (dx / d) * speed;
          unit.y += (dy / d) * speed;
          unit.angle = Math.atan2(dy, dx);
        }
      } else {
        unit.state = 'idle';
      }
      break;
    }

    case 'attacking': {
      let target: Unit | Building | null = null;
      if (unit.targetId) {
        target = state.units.find(u => u.id === unit.targetId && u.state !== 'dead') ||
                 state.buildings.find(b => b.id === unit.targetId && b.state !== 'destroyed') || null;
      }
      if (!target) {
        unit.state = 'idle';
        unit.targetId = undefined;
        break;
      }

      const tx = 'stats' in target ? target.x : (target as Building).x + BUILDING_STATS[(target as Building).type].width / 2;
      const ty = 'stats' in target ? target.y : (target as Building).y + BUILDING_STATS[(target as Building).type].height / 2;
      const d = dist(unit, { x: tx, y: ty });

      unit.angle = Math.atan2(ty - unit.y, tx - unit.x);

      if (d > unit.stats.range) {
        // Move towards target
        unit.x += (tx - unit.x) / d * speed;
        unit.y += (ty - unit.y) / d * speed;
      } else {
        // Fire at target
        const fireInterval = 1 / unit.stats.fireRate;
        if (state.time - unit.lastFireTime >= fireInterval) {
          fireProjectile(state, unit, target);
          unit.lastFireTime = state.time;
        }
      }
      break;
    }

    case 'harvesting': {
      // Find nearest resource
      const ux = Math.floor(unit.x);
      const uy = Math.floor(unit.y);
      let nearestResource: Position | null = null;
      let nearestDist = Infinity;

      for (let dy = -10; dy <= 10; dy++) {
        for (let dx = -10; dx <= 10; dx++) {
          const nx = ux + dx;
          const ny = uy + dy;
          if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
            if (state.tiles[ny][nx].terrain === 'resource' && state.tiles[ny][nx].resourceAmount && state.tiles[ny][nx].resourceAmount! > 0) {
              const d = Math.abs(dx) + Math.abs(dy);
              if (d < nearestDist) {
                nearestDist = d;
                nearestResource = { x: nx, y: ny };
              }
            }
          }
        }
      }

      if (nearestResource) {
        const d = dist(unit, { x: nearestResource.x + 0.5, y: nearestResource.y + 0.5 });
        if (d < 1.5) {
          // Harvest
          const tile = state.tiles[nearestResource.y][nearestResource.x];
          if (tile.resourceAmount && tile.resourceAmount > 0) {
            unit.harvestAmount += 2 * dt;
            tile.resourceAmount -= 2 * dt;
            if (unit.harvestAmount >= 50) {
              unit.state = 'returning';
            }
          }
        } else {
          // Move to resource
          const dx = nearestResource.x + 0.5 - unit.x;
          const dy = nearestResource.y + 0.5 - unit.y;
          unit.x += (dx / d) * speed;
          unit.y += (dy / d) * speed;
          unit.angle = Math.atan2(dy, dx);
        }
      } else {
        unit.state = 'idle';
      }
      break;
    }

    case 'returning': {
      // Return to command center
      const cc = state.buildings.find(b => b.type === 'command_center' && b.owner === unit.owner && b.state !== 'destroyed');
      if (cc) {
        const stats = BUILDING_STATS[cc.type];
        const tx = cc.x + stats.width / 2;
        const ty = cc.y + stats.height / 2;
        const d = dist(unit, { x: tx, y: ty });
        if (d < 3) {
          state.players[unit.owner].metal += unit.harvestAmount;
          unit.harvestAmount = 0;
          unit.state = 'harvesting';
        } else {
          unit.x += (tx - unit.x) / d * speed;
          unit.y += (ty - unit.y) / d * speed;
          unit.angle = Math.atan2(ty - unit.y, tx - unit.x);
        }
      } else {
        unit.state = 'idle';
      }
      break;
    }

    case 'repairing': {
      // Find nearest damaged friendly unit
      let target: Unit | null = null;
      let bestDist = Infinity;
      for (const other of state.units) {
        if (other.owner !== unit.owner || other.id === unit.id || other.state === 'dead') continue;
        if (other.hp < other.maxHp) {
          const d = dist(unit, other);
          if (d < bestDist) {
            bestDist = d;
            target = other;
          }
        }
      }
      if (target && bestDist < 2) {
        target.hp = Math.min(target.maxHp, target.hp + 10 * dt);
      } else if (target) {
        const d = dist(unit, target);
        unit.x += (target.x - unit.x) / d * speed;
        unit.y += (target.y - unit.y) / d * speed;
        unit.angle = Math.atan2(target.y - unit.y, target.x - unit.x);
      } else {
        unit.state = 'idle';
      }
      break;
    }
  }

  // Separation from other units
  const aliveUnits = state.units.filter(u => u.state !== 'dead');
  const unitIndex = aliveUnits.indexOf(unit);
  const sep = separateUnits(aliveUnits.map(u => ({ x: u.x, y: u.y, size: u.stats.size })), unitIndex, 1.2);
  unit.x += sep.dx * 0.3;
  unit.y += sep.dy * 0.3;

  // Clamp to map bounds
  unit.x = Math.max(0.5, Math.min(MAP_WIDTH - 0.5, unit.x));
  unit.y = Math.max(0.5, Math.min(MAP_HEIGHT - 0.5, unit.y));
}

// Building updates
function updateBuilding(state: GameState, building: Building, dt: number) {
  if (building.state === 'destroyed') return;

  if (building.state === 'constructing') {
    building.buildProgress += dt / BUILDING_STATS[building.type].buildTime;
    building.hp = Math.min(building.maxHp, building.buildProgress * building.maxHp);
    if (building.buildProgress >= 1) {
      building.state = 'active';
      building.buildProgress = 1;
      building.hp = building.maxHp;
    }
    return;
  }

  // Production queue
  if (building.productionQueue.length > 0 && building.type === 'factory') {
    const item = building.productionQueue[0];
    const prodSpeed = getProductionSpeed(state, building.owner);
    item.progress += dt * prodSpeed / UNIT_STATS[item.type].buildTime;
    if (item.progress >= 1) {
      // Spawn unit
      const stats = { ...UNIT_STATS[item.type] };
      applyResearchBonuses(state, building.owner, stats);
      const spawnX = building.x + BUILDING_STATS[building.type].width + 1;
      const spawnY = building.y + Math.floor(BUILDING_STATS[building.type].height / 2);
      state.units.push({
        id: genId(), type: item.type, owner: building.owner,
        x: spawnX, y: spawnY,
        hp: stats.maxHp, maxHp: stats.maxHp,
        state: 'idle', lastFireTime: 0, angle: 0,
        selected: false, harvestAmount: 0, stats,
      });
      state.players[building.owner].unitsBuilt++;
      building.productionQueue.shift();
    }
  }

  // Defense tower auto-attack
  if (building.type === 'defense_tower' && building.state === 'active') {
    const bx = building.x + 0.5;
    const by = building.y + 0.5;
    let target: Unit | null = null;
    let bestDist = Infinity;
    for (const unit of state.units) {
      if (unit.owner === building.owner || unit.state === 'dead') continue;
      const d = dist({ x: bx, y: by }, unit);
      if (d < 6 && d < bestDist) {
        bestDist = d;
        target = unit;
      }
    }
    if (target) {
      // Fire (simplified - direct damage with cooldown)
      if (!building.researchQueue.length) {
        // Use researchQueue[0].progress as cooldown tracker for towers
      }
      // Simple: deal damage directly every 1 second
      const lastFire = (building as any)._lastFire || 0;
      if (state.time - lastFire >= 1) {
        (building as any)._lastFire = state.time;
        const damage = 15;
        const actualDamage = Math.max(1, damage - target.stats.armor * 0.5);
        target.hp -= actualDamage;
        if (target.hp <= 0) {
          target.state = 'dead';
          spawnExplosion(state, target.x, target.y);
          state.players[building.owner].enemiesDestroyed++;
        }
        // Visual projectile
        state.projectiles.push({
          id: genId(), x: bx, y: by,
          targetX: target.x, targetY: target.y,
          speed: 15, damage: 0, owner: building.owner, type: 'bullet',
        });
      }
    }
  }
}

function getProductionSpeed(state: GameState, player: PlayerId): number {
  let speed = 1;
  for (const researchId of state.players[player].researchCompleted) {
    const node = RESEARCH_TREE.find(r => r.id === researchId);
    if (node) {
      for (const effect of node.effects) {
        if (effect.type === 'production_speed') speed += effect.value;
      }
    }
  }
  return speed;
}

function applyResearchBonuses(state: GameState, player: PlayerId, stats: typeof UNIT_STATS[UnitType]) {
  for (const researchId of state.players[player].researchCompleted) {
    const node = RESEARCH_TREE.find(r => r.id === researchId);
    if (!node) continue;
    for (const effect of node.effects) {
      switch (effect.type) {
        case 'damage_bonus': stats.damage *= (1 + effect.value); break;
        case 'armor_bonus': stats.armor *= (1 + effect.value); break;
        case 'speed_bonus': stats.speed *= (1 + effect.value); break;
        case 'range_bonus':
          if (!effect.target || effect.target === stats.type) stats.range *= (1 + effect.value);
          break;
        case 'sight_bonus': stats.sight *= (1 + effect.value); break;
      }
    }
  }
}

// Projectile updates
function updateProjectiles(state: GameState, dt: number) {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    const dx = proj.targetX - proj.x;
    const dy = proj.targetY - proj.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d < 0.5) {
      // Hit
      if (proj.damage > 0 && proj.targetId) {
        const target = state.units.find(u => u.id === proj.targetId) ||
                       state.buildings.find(b => b.id === proj.targetId);
        if (target) {
          applyDamage(state, target, proj.damage, proj.owner);
        }
      }
      // Impact particles
      for (let j = 0; j < 5; j++) {
        state.particles.push({
          x: proj.x, y: proj.y,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          life: 0.3, maxLife: 0.3,
          color: '#ffcc00', size: 2,
        });
      }
      state.projectiles.splice(i, 1);
    } else {
      proj.x += (dx / d) * proj.speed * dt;
      proj.y += (dy / d) * proj.speed * dt;
    }
  }
}

// Particle updates
function updateParticles(state: GameState, dt: number) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
  // Limit particles
  if (state.particles.length > 500) {
    state.particles.splice(0, state.particles.length - 500);
  }
}

// AI System
interface AIState {
  phase: 'build' | 'attack' | 'defend';
  attackTimer: number;
  buildTimer: number;
  scoutTimer: number;
}

let aiState: AIState = { phase: 'build', attackTimer: 0, buildTimer: 0, scoutTimer: 0 };

export function resetAI() {
  aiState = { phase: 'build', attackTimer: 0, buildTimer: 0, scoutTimer: 0 };
}

function updateAI(state: GameState, dt: number) {
  const player = state.players[1];
  const aiUnits = state.units.filter(u => u.owner === 1 && u.state !== 'dead');
  const aiBuildings = state.buildings.filter(b => b.owner === 1 && b.state !== 'destroyed');
  const factory = aiBuildings.find(b => b.type === 'factory' && b.state === 'active');
  const hasResearchLab = aiBuildings.some(b => b.type === 'research_lab' && b.state === 'active');
  const hasPowerPlant = aiBuildings.some(b => b.type === 'power_plant' && b.state === 'active');

  const difficultyMult = state.difficulty === 'easy' ? 0.5 : state.difficulty === 'hard' ? 1.5 : 1;

  aiState.buildTimer -= dt;
  aiState.attackTimer -= dt;
  aiState.scoutTimer -= dt;

  // Build phase
  if (aiState.buildTimer <= 0 && aiState.phase === 'build') {
    aiState.buildTimer = 5 / difficultyMult;

    // Build power plant if needed
    if (!hasPowerPlant && player.metal >= 300) {
      tryBuildNear(state, 'power_plant', 1, aiBuildings[0]);
    }

    // Build factory
    if (!factory && player.metal >= 500 && hasPowerPlant) {
      tryBuildNear(state, 'factory', 1, aiBuildings[0]);
    }

    // Build research lab
    if (!hasResearchLab && player.metal >= 400 && factory) {
      tryBuildNear(state, 'research_lab', 1, aiBuildings[0]);
    }

    // Build defense towers
    const towerCount = aiBuildings.filter(b => b.type === 'defense_tower').length;
    if (towerCount < 4 && player.metal >= 200) {
      tryBuildNear(state, 'defense_tower', 1, aiBuildings[0]);
    }

    // Research
    if (hasResearchLab && !player.researchActive) {
      const available = RESEARCH_TREE.filter(r =>
        !player.researchCompleted.includes(r.id) &&
        r.prerequisites.every(p => player.researchCompleted.includes(p)) &&
        player.metal >= r.cost
      );
      if (available.length > 0) {
        const research = available[Math.floor(Math.random() * available.length)];
        player.researchActive = research.id;
        player.researchProgress = 0;
        player.metal -= research.cost;
      }
    }

    // Produce units
    if (factory && factory.productionQueue.length < 3 && player.metal >= 200) {
      const unitTypes: UnitType[] = ['scout', 'buggy', 'medium_tank'];
      if (player.researchCompleted.includes('adv1')) unitTypes.push('heavy_tank');
      if (player.researchCompleted.includes('adv2')) unitTypes.push('missile');

      const type = unitTypes[Math.floor(Math.random() * unitTypes.length)];
      if (player.metal >= UNIT_STATS[type].cost) {
        factory.productionQueue.push({ type, progress: 0 });
        player.metal -= UNIT_STATS[type].cost;
      }
    }

    // Produce harvester if needed
    const harvesters = aiUnits.filter(u => u.type === 'harvester');
    if (harvesters.length < 2 && factory && player.metal >= 300) {
      factory.productionQueue.push({ type: 'harvester', progress: 0 });
      player.metal -= 300;
    }
  }

  // Research progress
  if (player.researchActive) {
    player.researchProgress += dt * difficultyMult;
    const node = RESEARCH_TREE.find(r => r.id === player.researchActive);
    if (node && player.researchProgress >= node.researchTime) {
      player.researchCompleted.push(player.researchActive);
      player.researchActive = null;
      player.researchProgress = 0;
    }
  }

  // Set harvester units to harvest
  for (const unit of aiUnits) {
    if (unit.type === 'harvester' && unit.state === 'idle') {
      unit.state = 'harvesting';
    }
    if (unit.type === 'repair' && unit.state === 'idle') {
      unit.state = 'repairing';
    }
  }

  // Attack phase
  const combatUnits = aiUnits.filter(u => u.type !== 'harvester' && u.type !== 'repair' && u.state !== 'dead');
  if (combatUnits.length >= 4 * difficultyMult && aiState.attackTimer <= 0) {
    aiState.phase = 'attack';
    aiState.attackTimer = 30 / difficultyMult;

    // Find player command center or nearest building
    const playerBuildings = state.buildings.filter(b => b.owner === 0 && b.state !== 'destroyed');
    const target = playerBuildings.find(b => b.type === 'command_center') || playerBuildings[0];
    if (target) {
      const tx = target.x + BUILDING_STATS[target.type].width / 2;
      const ty = target.y + BUILDING_STATS[target.type].height / 2;
      for (const unit of combatUnits) {
        if (unit.state === 'idle') {
          const path = findPath(state.tiles, { x: Math.floor(unit.x), y: Math.floor(unit.y) }, { x: Math.floor(tx), y: Math.floor(ty) });
          if (path) {
            unit.path = path;
            unit.pathIndex = 0;
            unit.state = 'moving';
          }
        }
      }
    }
  }

  // Scout
  if (aiState.scoutTimer <= 0) {
    aiState.scoutTimer = 20;
    const scouts = aiUnits.filter(u => u.type === 'scout' && u.state === 'idle');
    if (scouts.length > 0) {
      const scout = scouts[0];
      const tx = 20 + Math.random() * (MAP_WIDTH - 40);
      const ty = 20 + Math.random() * (MAP_HEIGHT - 40);
      const path = findPath(state.tiles, { x: Math.floor(scout.x), y: Math.floor(scout.y) }, { x: Math.floor(tx), y: Math.floor(ty) });
      if (path) {
        scout.path = path;
        scout.pathIndex = 0;
        scout.state = 'moving';
      }
    }
  }
}

function tryBuildNear(state: GameState, type: BuildingType, owner: PlayerId, reference: Building) {
  const stats = BUILDING_STATS[type];
  const cx = reference.x + Math.floor(BUILDING_STATS[reference.type].width / 2);
  const cy = reference.y + Math.floor(BUILDING_STATS[reference.type].height / 2);

  for (let radius = 4; radius < 15; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (canPlaceBuilding(state, type, x, y, owner)) {
          placeBuilding(state, type, x, y, owner);
          return;
        }
      }
    }
  }
}

// Win/lose check
function checkWinCondition(state: GameState) {
  const p0Buildings = state.buildings.filter(b => b.owner === 0 && b.state !== 'destroyed');
  const p1Buildings = state.buildings.filter(b => b.owner === 1 && b.state !== 'destroyed');

  const p0CC = p0Buildings.some(b => b.type === 'command_center');
  const p1CC = p1Buildings.some(b => b.type === 'command_center');

  if (!p1CC) {
    state.gameOver = true;
    state.winner = 0;
    addMessage(state, 'Victory! Enemy Command Center destroyed!', 'info');
  } else if (!p0CC) {
    state.gameOver = true;
    state.winner = 1;
    addMessage(state, 'Defeat! Your Command Center was destroyed!', 'danger');
  }
}

function addMessage(state: GameState, text: string, type: 'info' | 'warning' | 'danger') {
  state.messages.push({ text, time: state.time, type });
  if (state.messages.length > 20) state.messages.shift();
}

// Player commands
export function commandMove(state: GameState, unitIds: string[], x: number, y: number) {
  for (const id of unitIds) {
    const unit = state.units.find(u => u.id === id);
    if (!unit || unit.state === 'dead') continue;
    const path = findPath(state.tiles, { x: Math.floor(unit.x), y: Math.floor(unit.y) }, { x: Math.floor(x), y: Math.floor(y) });
    if (path && path.length > 0) {
      unit.path = path;
      unit.pathIndex = 0;
      unit.state = 'moving';
      unit.targetId = undefined;
    } else {
      unit.targetX = x;
      unit.targetY = y;
      unit.state = 'moving';
      unit.targetId = undefined;
    }
  }
}

export function commandAttack(state: GameState, unitIds: string[], targetId: string) {
  for (const id of unitIds) {
    const unit = state.units.find(u => u.id === id);
    if (!unit || unit.state === 'dead') continue;
    unit.targetId = targetId;
    unit.state = 'attacking';
  }
}

export function commandHarvest(state: GameState, unitIds: string[]) {
  for (const id of unitIds) {
    const unit = state.units.find(u => u.id === id);
    if (!unit || unit.state === 'dead' || unit.type !== 'harvester') continue;
    unit.state = 'harvesting';
  }
}

export function commandRepair(state: GameState, unitIds: string[]) {
  for (const id of unitIds) {
    const unit = state.units.find(u => u.id === id);
    if (!unit || unit.state === 'dead' || unit.type !== 'repair') continue;
    unit.state = 'repairing';
  }
}

export function startProduction(state: GameState, buildingId: string, unitType: UnitType): boolean {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || building.state !== 'active' || building.type !== 'factory') return false;

  const cost = UNIT_STATS[unitType].cost;
  if (state.players[building.owner].metal < cost) return false;

  // Check if unit is unlocked
  if (unitType === 'heavy_tank' && !state.players[building.owner].researchCompleted.includes('adv1')) return false;
  if (unitType === 'missile' && !state.players[building.owner].researchCompleted.includes('adv2')) return false;

  state.players[building.owner].metal -= cost;
  building.productionQueue.push({ type: unitType, progress: 0 });
  return true;
}

export function cancelProduction(state: GameState, buildingId: string, index: number): boolean {
  const building = state.buildings.find(b => b.id === buildingId);
  if (!building || index >= building.productionQueue.length) return false;

  const item = building.productionQueue[index];
  state.players[building.owner].metal += UNIT_STATS[item.type].cost * (1 - item.progress);
  building.productionQueue.splice(index, 1);
  return true;
}

export function startResearch(state: GameState, researchId: string): boolean {
  const player = state.players[0];
  const node = RESEARCH_TREE.find(r => r.id === researchId);
  if (!node) return false;
  if (player.researchCompleted.includes(researchId)) return false;
  if (player.researchActive) return false;
  if (player.metal < node.cost) return false;
  if (!node.prerequisites.every(p => player.researchCompleted.includes(p))) return false;

  // Check if has research lab
  const hasLab = state.buildings.some(b => b.owner === 0 && b.type === 'research_lab' && b.state === 'active');
  if (!hasLab) return false;

  player.metal -= node.cost;
  player.researchActive = researchId;
  player.researchProgress = 0;
  return true;
}

// Main game update
export function updateGame(state: GameState, dt: number) {
  if (state.paused || state.gameOver) return;

  const gameDt = dt * state.speed;
  state.time += gameDt;

  // Update buildings
  for (const building of state.buildings) {
    updateBuilding(state, building, gameDt);
  }

  // Player research
  const player = state.players[0];
  if (player.researchActive) {
    player.researchProgress += gameDt;
    const node = RESEARCH_TREE.find(r => r.id === player.researchActive);
    if (node && player.researchProgress >= node.researchTime) {
      player.researchCompleted.push(player.researchActive);
      player.researchActive = null;
      player.researchProgress = 0;
      addMessage(state, `Research complete: ${node.name}`, 'info');
    }
  }

  // Update units
  for (const unit of state.units) {
    updateUnit(state, unit, gameDt);
  }

  // Update projectiles
  updateProjectiles(state, gameDt);

  // Update particles
  updateParticles(state, gameDt);

  // Ambient dust particles (post-apocalyptic atmosphere)
  if (Math.random() < 0.3) {
    const camCenterX = state.camera.x / (TILE_SIZE * 0.5);
    const camCenterY = state.camera.y / (TILE_SIZE * 0.25);
    state.particles.push({
      x: camCenterX + (Math.random() - 0.5) * 40,
      y: camCenterY + (Math.random() - 0.5) * 40,
      vx: 0.3 + Math.random() * 0.5,
      vy: -0.1 + Math.random() * 0.2,
      life: 2 + Math.random() * 3,
      maxLife: 5,
      color: Math.random() > 0.5 ? '#8a7a5a' : '#6a5a3a',
      size: 1 + Math.random() * 1.5,
    });
  }

  // Remove dead units
  state.units = state.units.filter(u => u.state !== 'dead');

  // Update visibility
  updateVisibility(state);

  // Update energy
  updateEnergy(state);

  // AI update (less frequent)
  updateAI(state, gameDt);

  // Check win condition
  checkWinCondition(state);
}

// Save/Load
export function saveGame(state: GameState): string {
  const saveData = {
    version: 1,
    units: state.units.map(u => ({ ...u, path: undefined })),
    buildings: state.buildings,
    players: state.players,
    time: state.time,
    difficulty: state.difficulty,
    tiles: state.tiles.map(row => row.map(t => ({
      terrain: t.terrain,
      explored: t.explored,
      buildingId: t.buildingId,
      resourceAmount: t.resourceAmount,
    }))),
  };
  return JSON.stringify(saveData);
}

export function loadGame(json: string): GameState | null {
  try {
    const data = JSON.parse(json);
    if (data.version !== 1) return null;

    const state = createGameState(data.difficulty);
    state.units = data.units;
    state.buildings = data.buildings;
    state.players = data.players;
    state.time = data.time;

    // Restore tiles
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (data.tiles[y] && data.tiles[y][x]) {
          state.tiles[y][x].terrain = data.tiles[y][x].terrain;
          state.tiles[y][x].explored = data.tiles[y][x].explored;
          state.tiles[y][x].buildingId = data.tiles[y][x].buildingId;
          state.tiles[y][x].resourceAmount = data.tiles[y][x].resourceAmount;
        }
      }
    }

    updateVisibility(state);
    return state;
  } catch {
    return null;
  }
}
