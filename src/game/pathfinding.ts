// A* Pathfinding for Iron Horizon
import { Position, Tile, MAP_WIDTH, MAP_HEIGHT } from './types';

interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isWalkable(tiles: Tile[][], x: number, y: number): boolean {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
  const tile = tiles[y][x];
  if (tile.terrain === 'rock' || tile.terrain === 'water') return false;
  if (tile.buildingId) return false;
  return true;
}

export function findPath(
  tiles: Tile[][],
  start: Position,
  end: Position,
  maxIterations: number = 2000
): Position[] | null {
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const ex = Math.floor(end.x);
  const ey = Math.floor(end.y);

  if (sx === ex && sy === ey) return [];

  // If end is not walkable, find nearest walkable tile
  let targetX = ex;
  let targetY = ey;
  if (!isWalkable(tiles, ex, ey)) {
    let bestDist = Infinity;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = ex + dx;
        const ny = ey + dy;
        if (isWalkable(tiles, nx, ny)) {
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist < bestDist) {
            bestDist = dist;
            targetX = nx;
            targetY = ny;
          }
        }
      }
    }
    if (bestDist === Infinity) return null;
  }

  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();
  const nodeMap = new Map<string, PathNode>();

  const startNode: PathNode = {
    x: sx, y: sy,
    g: 0,
    h: heuristic({ x: sx, y: sy }, { x: targetX, y: targetY }),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  openSet.push(startNode);
  nodeMap.set(`${sx},${sy}`, startNode);

  const directions = [
    { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
  ];

  let iterations = 0;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // Find node with lowest f
    let lowestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
    }
    const current = openSet[lowestIdx];

    if (current.x === targetX && current.y === targetY) {
      // Reconstruct path
      const path: Position[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift({ x: node.x + 0.5, y: node.y + 0.5 });
        node = node.parent;
      }
      return path;
    }

    openSet.splice(lowestIdx, 1);
    const key = `${current.x},${current.y}`;
    closedSet.add(key);

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const nKey = `${nx},${ny}`;

      if (closedSet.has(nKey)) continue;
      if (!isWalkable(tiles, nx, ny)) continue;

      // For diagonal movement, check both adjacent tiles
      if (dir.dx !== 0 && dir.dy !== 0) {
        if (!isWalkable(tiles, current.x + dir.dx, current.y) ||
            !isWalkable(tiles, current.x, current.y + dir.dy)) {
          continue;
        }
      }

      const moveCost = (dir.dx !== 0 && dir.dy !== 0) ? 1.414 : 1;
      const terrainCost = tiles[ny]?.[nx]?.terrain === 'forest' ? 1.5 : 1;
      const newG = current.g + moveCost * terrainCost;

      const existing = nodeMap.get(nKey);
      if (existing && newG >= existing.g) continue;

      const node: PathNode = {
        x: nx, y: ny,
        g: newG,
        h: heuristic({ x: nx, y: ny }, { x: targetX, y: targetY }),
        f: 0,
        parent: current,
      };
      node.f = node.g + node.h;

      if (existing) {
        existing.g = newG;
        existing.f = node.f;
        existing.parent = current;
      } else {
        openSet.push(node);
        nodeMap.set(nKey, node);
      }
    }
  }

  return null; // No path found
}

// Simple collision avoidance between units
export function separateUnits(
  units: { x: number; y: number; size: number }[],
  index: number,
  minDist: number
): { dx: number; dy: number } {
  let dx = 0, dy = 0;
  const unit = units[index];

  for (let i = 0; i < units.length; i++) {
    if (i === index) continue;
    const other = units[i];
    const distX = unit.x - other.x;
    const distY = unit.y - other.y;
    const dist = Math.sqrt(distX * distX + distY * distY);

    if (dist < minDist && dist > 0.01) {
      const force = (minDist - dist) / minDist;
      dx += (distX / dist) * force;
      dy += (distY / dist) * force;
    }
  }

  return { dx, dy };
}
