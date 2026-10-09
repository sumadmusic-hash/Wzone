// Iron Horizon - Type Definitions

export type TerrainType = 'plain' | 'rock' | 'forest' | 'road' | 'resource' | 'water' | 'rubble';
export type PlayerId = 0 | 1; // 0 = human, 1 = AI

export interface Position {
  x: number;
  y: number;
}

export interface Tile {
  terrain: TerrainType;
  explored: boolean[];
  visible: boolean[];
  buildingId?: string;
  resourceAmount?: number;
}

export type UnitState = 'idle' | 'moving' | 'attacking' | 'harvesting' | 'returning' | 'repairing' | 'dead';
export type BuildingState = 'constructing' | 'active' | 'destroyed';

export type UnitType = 'scout' | 'buggy' | 'medium_tank' | 'heavy_tank' | 'artillery' | 'missile' | 'aa_vehicle' | 'repair' | 'harvester';
export type BuildingType = 'command_center' | 'factory' | 'research_lab' | 'power_plant' | 'repair_bay' | 'radar_station' | 'defense_tower' | 'wall';

export interface UnitStats {
  name: string;
  type: UnitType;
  maxHp: number;
  speed: number;
  armor: number;
  damage: number;
  range: number;
  fireRate: number; // shots per second
  sight: number;
  cost: number;
  buildTime: number; // seconds
  size: number;
  projectileSpeed: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  owner: PlayerId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: UnitState;
  targetX?: number;
  targetY?: number;
  targetId?: string;
  path?: Position[];
  pathIndex?: number;
  lastFireTime: number;
  angle: number;
  selected: boolean;
  group?: number;
  harvestAmount: number;
  stats: UnitStats;
}

export interface BuildingStats {
  name: string;
  type: BuildingType;
  maxHp: number;
  cost: number;
  buildTime: number;
  width: number;
  height: number;
  powerUsage: number;
  powerGeneration: number;
  description: string;
}

export interface Building {
  id: string;
  type: BuildingType;
  owner: PlayerId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: BuildingState;
  buildProgress: number;
  productionQueue: { type: UnitType; progress: number }[];
  researchQueue: { id: string; progress: number }[];
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  targetId?: string;
  speed: number;
  damage: number;
  owner: PlayerId;
  type: 'bullet' | 'shell' | 'missile' | 'rocket';
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  researchTime: number;
  prerequisites: string[];
  effects: ResearchEffect[];
  branch: 'weapons' | 'armor' | 'engines' | 'radar' | 'economy' | 'artillery' | 'advanced';
}

export interface ResearchEffect {
  type: 'damage_bonus' | 'armor_bonus' | 'speed_bonus' | 'range_bonus' | 'sight_bonus' | 'production_speed' | 'harvest_speed' | 'unlock_unit' | 'unlock_building';
  value: number;
  target?: string;
}

export interface PlayerState {
  id: PlayerId;
  metal: number;
  energy: number;
  maxEnergy: number;
  energyUsed: number;
  researchCompleted: string[];
  researchActive: string | null;
  researchProgress: number;
  unitsBuilt: number;
  buildingsBuilt: number;
  enemiesDestroyed: number;
}

export interface GameState {
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  tiles: Tile[][];
  units: Unit[];
  buildings: Building[];
  projectiles: Projectile[];
  particles: Particle[];
  players: PlayerState[];
  time: number;
  speed: number;
  paused: boolean;
  gameOver: boolean;
  winner: PlayerId | null;
  difficulty: 'easy' | 'normal' | 'hard';
  camera: { x: number; y: number; zoom: number };
  selection: string[];
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null;
  placingBuilding: BuildingType | null;
  groups: Map<string, string[]>;
  messages: { text: string; time: number; type: 'info' | 'warning' | 'danger' }[];
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  scout: {
    name: 'Recon Scout',
    type: 'scout',
    maxHp: 80,
    speed: 3.5,
    armor: 2,
    damage: 5,
    range: 4,
    fireRate: 2,
    sight: 8,
    cost: 100,
    buildTime: 8,
    size: 0.6,
    projectileSpeed: 12,
  },
  buggy: {
    name: 'Storm Buggy',
    type: 'buggy',
    maxHp: 120,
    speed: 3.0,
    armor: 4,
    damage: 10,
    range: 5,
    fireRate: 2.5,
    sight: 6,
    cost: 200,
    buildTime: 12,
    size: 0.7,
    projectileSpeed: 10,
  },
  medium_tank: {
    name: 'Vanguard Tank',
    type: 'medium_tank',
    maxHp: 300,
    speed: 1.8,
    armor: 10,
    damage: 25,
    range: 6,
    fireRate: 1.2,
    sight: 6,
    cost: 400,
    buildTime: 18,
    size: 0.9,
    projectileSpeed: 8,
  },
  heavy_tank: {
    name: 'Titan Fortress',
    type: 'heavy_tank',
    maxHp: 500,
    speed: 1.2,
    armor: 18,
    damage: 40,
    range: 6,
    fireRate: 0.8,
    sight: 5,
    cost: 700,
    buildTime: 25,
    size: 1.1,
    projectileSpeed: 7,
  },
  artillery: {
    name: 'Thunder Cannon',
    type: 'artillery',
    maxHp: 150,
    speed: 1.0,
    armor: 5,
    damage: 60,
    range: 14,
    fireRate: 0.4,
    sight: 5,
    cost: 500,
    buildTime: 20,
    size: 1.0,
    projectileSpeed: 5,
  },
  missile: {
    name: 'Viper Launcher',
    type: 'missile',
    maxHp: 180,
    speed: 1.5,
    armor: 6,
    damage: 45,
    range: 10,
    fireRate: 0.6,
    sight: 6,
    cost: 550,
    buildTime: 20,
    size: 0.9,
    projectileSpeed: 9,
  },
  aa_vehicle: {
    name: 'Skyguard',
    type: 'aa_vehicle',
    maxHp: 200,
    speed: 1.6,
    armor: 7,
    damage: 15,
    range: 8,
    fireRate: 4,
    sight: 7,
    cost: 350,
    buildTime: 15,
    size: 0.85,
    projectileSpeed: 15,
  },
  repair: {
    name: 'Mechanic Unit',
    type: 'repair',
    maxHp: 100,
    speed: 2.0,
    armor: 3,
    damage: 0,
    range: 3,
    fireRate: 0,
    sight: 5,
    cost: 250,
    buildTime: 12,
    size: 0.7,
    projectileSpeed: 0,
  },
  harvester: {
    name: 'Ore Collector',
    type: 'harvester',
    maxHp: 200,
    speed: 1.5,
    armor: 5,
    damage: 0,
    range: 0,
    fireRate: 0,
    sight: 4,
    cost: 300,
    buildTime: 15,
    size: 0.9,
    projectileSpeed: 0,
  },
};

export const BUILDING_STATS: Record<BuildingType, BuildingStats> = {
  command_center: {
    name: 'Command Center',
    type: 'command_center',
    maxHp: 2000,
    cost: 0,
    buildTime: 0,
    width: 3,
    height: 3,
    powerUsage: 0,
    powerGeneration: 50,
    description: 'Main base of operations. Lost = defeat.',
  },
  factory: {
    name: 'Vehicle Factory',
    type: 'factory',
    maxHp: 1500,
    cost: 500,
    buildTime: 30,
    width: 3,
    height: 3,
    powerUsage: 20,
    powerGeneration: 0,
    description: 'Produces combat vehicles.',
  },
  research_lab: {
    name: 'Research Lab',
    type: 'research_lab',
    maxHp: 800,
    cost: 400,
    buildTime: 25,
    width: 2,
    height: 2,
    powerUsage: 30,
    powerGeneration: 0,
    description: 'Enables technology research.',
  },
  power_plant: {
    name: 'Power Plant',
    type: 'power_plant',
    maxHp: 600,
    cost: 300,
    buildTime: 20,
    width: 2,
    height: 2,
    powerUsage: 0,
    powerGeneration: 100,
    description: 'Generates power for base operations.',
  },
  repair_bay: {
    name: 'Repair Bay',
    type: 'repair_bay',
    maxHp: 800,
    cost: 350,
    buildTime: 20,
    width: 2,
    height: 2,
    powerUsage: 15,
    powerGeneration: 0,
    description: 'Repairs damaged vehicles.',
  },
  radar_station: {
    name: 'Radar Station',
    type: 'radar_station',
    maxHp: 500,
    cost: 250,
    buildTime: 15,
    width: 2,
    height: 2,
    powerUsage: 25,
    powerGeneration: 0,
    description: 'Reveals larger area on minimap.',
  },
  defense_tower: {
    name: 'Defense Tower',
    type: 'defense_tower',
    maxHp: 800,
    cost: 200,
    buildTime: 15,
    width: 1,
    height: 1,
    powerUsage: 10,
    powerGeneration: 0,
    description: 'Automated defensive turret.',
  },
  wall: {
    name: 'Barrier Wall',
    type: 'wall',
    maxHp: 1000,
    cost: 50,
    buildTime: 5,
    width: 1,
    height: 1,
    powerUsage: 0,
    powerGeneration: 0,
    description: 'Blocks enemy movement.',
  },
};

export const RESEARCH_TREE: ResearchNode[] = [
  // Weapons branch
  { id: 'w1', name: 'Improved Ammunition', description: '+15% weapon damage', cost: 300, researchTime: 30, prerequisites: [], effects: [{ type: 'damage_bonus', value: 0.15 }], branch: 'weapons' },
  { id: 'w2', name: 'Advanced Ballistics', description: '+25% weapon damage', cost: 600, researchTime: 45, prerequisites: ['w1'], effects: [{ type: 'damage_bonus', value: 0.25 }], branch: 'weapons' },
  { id: 'w3', name: 'Depleted Uranium Rounds', description: '+40% weapon damage', cost: 1000, researchTime: 60, prerequisites: ['w2'], effects: [{ type: 'damage_bonus', value: 0.4 }], branch: 'weapons' },
  // Armor branch
  { id: 'a1', name: 'Reinforced Plating', description: '+20% armor', cost: 300, researchTime: 30, prerequisites: [], effects: [{ type: 'armor_bonus', value: 0.2 }], branch: 'armor' },
  { id: 'a2', name: 'Composite Armor', description: '+35% armor', cost: 600, researchTime: 45, prerequisites: ['a1'], effects: [{ type: 'armor_bonus', value: 0.35 }], branch: 'armor' },
  { id: 'a3', name: 'Reactive Armor', description: '+50% armor', cost: 1000, researchTime: 60, prerequisites: ['a2'], effects: [{ type: 'armor_bonus', value: 0.5 }], branch: 'armor' },
  // Engines branch
  { id: 'e1', name: 'Enhanced Engines', description: '+15% speed', cost: 250, researchTime: 25, prerequisites: [], effects: [{ type: 'speed_bonus', value: 0.15 }], branch: 'engines' },
  { id: 'e2', name: 'Turbo Drives', description: '+30% speed', cost: 500, researchTime: 40, prerequisites: ['e1'], effects: [{ type: 'speed_bonus', value: 0.3 }], branch: 'engines' },
  // Radar branch
  { id: 'r1', name: 'Extended Sensors', description: '+25% sight range', cost: 200, researchTime: 20, prerequisites: [], effects: [{ type: 'sight_bonus', value: 0.25 }], branch: 'radar' },
  { id: 'r2', name: 'Advanced Radar', description: '+50% sight range', cost: 450, researchTime: 35, prerequisites: ['r1'], effects: [{ type: 'sight_bonus', value: 0.5 }], branch: 'radar' },
  // Economy branch
  { id: 'eco1', name: 'Efficient Mining', description: '+30% harvest speed', cost: 300, researchTime: 30, prerequisites: [], effects: [{ type: 'harvest_speed', value: 0.3 }], branch: 'economy' },
  { id: 'eco2', name: 'Automated Logistics', description: '+50% harvest speed', cost: 600, researchTime: 45, prerequisites: ['eco1'], effects: [{ type: 'harvest_speed', value: 0.5 }], branch: 'economy' },
  { id: 'eco3', name: 'Factory Optimization', description: '+25% production speed', cost: 500, researchTime: 40, prerequisites: ['eco1'], effects: [{ type: 'production_speed', value: 0.25 }], branch: 'economy' },
  // Artillery branch
  { id: 'art1', name: 'Extended Barrels', description: '+20% range for artillery', cost: 400, researchTime: 35, prerequisites: ['w1'], effects: [{ type: 'range_bonus', value: 0.2, target: 'artillery' }], branch: 'artillery' },
  { id: 'art2', name: 'Guided Munitions', description: '+35% range for all long-range', cost: 700, researchTime: 50, prerequisites: ['art1'], effects: [{ type: 'range_bonus', value: 0.35 }], branch: 'artillery' },
  // Advanced branch
  { id: 'adv1', name: 'Titan Protocol', description: 'Unlock Heavy Tank', cost: 800, researchTime: 60, prerequisites: ['a2', 'w2'], effects: [{ type: 'unlock_unit', value: 1, target: 'heavy_tank' }], branch: 'advanced' },
  { id: 'adv2', name: 'Missile Systems', description: 'Unlock Missile Vehicle', cost: 700, researchTime: 50, prerequisites: ['w2', 'r1'], effects: [{ type: 'unlock_unit', value: 1, target: 'missile' }], branch: 'advanced' },
];

export const MAP_WIDTH = 128;
export const MAP_HEIGHT = 128;
export const TILE_SIZE = 32;
