import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GameState, UnitType, BuildingType, UNIT_STATS, BUILDING_STATS,
  RESEARCH_TREE, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE
} from './game/types';
import {
  createGameState, updateGame, commandMove, commandAttack,
  commandHarvest, commandRepair, placeBuilding, canPlaceBuilding,
  startProduction, cancelProduction, startResearch, saveGame, loadGame, resetAI
} from './game/engine';
import { renderGame, renderMinimap } from './game/renderer';
import { setAudioEnabled, isAudioEnabled, playClick } from './game/audio';

type Screen = 'menu' | 'game' | 'research' | 'victory' | 'defeat';

// Convert screen coordinates to world tile coordinates (isometric)
function screenToWorld(screenX: number, screenY: number, canvasWidth: number, canvasHeight: number, camera: { x: number; y: number; zoom: number }): { x: number; y: number } {
  // Remove canvas center offset and zoom
  const isoX = (screenX - canvasWidth / 2) / camera.zoom + camera.x;
  const isoY = (screenY - canvasHeight / 3) / camera.zoom + camera.y;
  
  // Convert iso to tile coordinates
  const hw = TILE_SIZE * 0.5;
  const hh = TILE_SIZE * 0.25;
  const tileX = (isoX / hw + isoY / hh) / 2;
  const tileY = (isoY / hh - isoX / hw) / 2;
  
  return { x: tileX, y: tileY };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseRef = useRef<{ x: number; y: number; down: boolean; button: number; startX: number; startY: number }>
    ({ x: 0, y: 0, down: false, button: 0, startX: 0, startY: 0 });
  const [, forceUpdate] = useState(0);

  const startGame = useCallback((diff: 'easy' | 'normal' | 'hard') => {
    resetAI();
    const state = createGameState(diff);
    gameStateRef.current = state;
    setGameState(state);
    setScreen('game');
  }, []);

  // Game loop
  useEffect(() => {
    if (screen !== 'game') return;

    let lastSimTime = 0;
    const SIM_STEP = 1 / 20; // 20 ticks per second

    const gameLoop = (timestamp: number) => {
      if (!gameStateRef.current) return;
      const state = gameStateRef.current;

      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = timestamp;

      // Camera movement (isometric-aware)
      const camSpeed = 400 / state.camera.zoom;
      if (keysRef.current.has('w') || keysRef.current.has('arrowup')) {
        state.camera.x -= camSpeed * dt * 0.5;
        state.camera.y -= camSpeed * dt * 0.5;
      }
      if (keysRef.current.has('s') || keysRef.current.has('arrowdown')) {
        state.camera.x += camSpeed * dt * 0.5;
        state.camera.y += camSpeed * dt * 0.5;
      }
      if (keysRef.current.has('a') || keysRef.current.has('arrowleft')) {
        state.camera.x -= camSpeed * dt * 0.5;
        state.camera.y += camSpeed * dt * 0.5;
      }
      if (keysRef.current.has('d') || keysRef.current.has('arrowright')) {
        state.camera.x += camSpeed * dt * 0.5;
        state.camera.y -= camSpeed * dt * 0.5;
      }

      // Edge scrolling (isometric-aware)
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;
        const edgeSize = 30;
        if (mx < edgeSize) {
          state.camera.x -= camSpeed * dt * 0.3;
          state.camera.y += camSpeed * dt * 0.3;
        }
        if (mx > rect.width - edgeSize) {
          state.camera.x += camSpeed * dt * 0.3;
          state.camera.y -= camSpeed * dt * 0.3;
        }
        if (my < edgeSize) {
          state.camera.x -= camSpeed * dt * 0.3;
          state.camera.y -= camSpeed * dt * 0.3;
        }
        if (my > rect.height - edgeSize) {
          state.camera.x += camSpeed * dt * 0.3;
          state.camera.y += camSpeed * dt * 0.3;
        }
      }

      // Clamp camera (isometric bounds)
      const maxIsoX = MAP_WIDTH * TILE_SIZE * 0.5;
      const maxIsoY = MAP_HEIGHT * TILE_SIZE * 0.25;
      state.camera.x = Math.max(-maxIsoX, Math.min(maxIsoX, state.camera.x));
      state.camera.y = Math.max(-100, Math.min(maxIsoY * 2, state.camera.y));

      // Fixed timestep simulation
      lastSimTime += dt;
      while (lastSimTime >= SIM_STEP) {
        updateGame(state, SIM_STEP);
        lastSimTime -= SIM_STEP;
      }

      // Check game over
      if (state.gameOver) {
        if (state.winner === 0) setScreen('victory');
        else setScreen('defeat');
      }

      // Render
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvas) {
        renderGame(ctx, state, canvas.width, canvas.height);
      }

      // Render minimap
      const mctx = minimapRef.current?.getContext('2d');
      if (mctx) {
        renderMinimap(mctx, state, 200, 200);
      }

      // Update UI periodically
      forceUpdate(v => v + 1);

      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = 0;
    };
  }, [screen]);

  // Input handlers
  useEffect(() => {
    if (screen !== 'game') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());

      const state = gameStateRef.current;
      if (!state) return;

      // Pause / Cancel placement
      if (e.key === 'Escape') {
        if (state.placingBuilding) {
          state.placingBuilding = null;
        } else {
          state.paused = !state.paused;
        }
        forceUpdate(v => v + 1);
      }

      // Speed controls
      if (e.key === '+' || e.key === '=') state.speed = Math.min(3, state.speed + 0.5);
      if (e.key === '-') state.speed = Math.max(0.5, state.speed - 0.5);

      // Group commands
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const groupNum = parseInt(e.key);
        const selectedIds = state.selection;
        if (selectedIds.length > 0) {
          state.groups.set(`group_${groupNum}`, [...selectedIds]);
        }
      }
      if (!e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const groupNum = parseInt(e.key);
        const group = state.groups.get(`group_${groupNum}`);
        if (group) {
          // Deselect all
          state.units.forEach(u => u.selected = false);
          state.selection = [];
          // Select group
          for (const id of group) {
            const unit = state.units.find(u => u.id === id);
            if (unit && unit.state !== 'dead') {
              unit.selected = true;
              state.selection.push(id);
            }
          }
        }
      }

      // Select all combat units
      if (e.key === 'q') {
        state.units.forEach(u => u.selected = false);
        state.selection = [];
        for (const unit of state.units) {
          if (unit.owner === 0 && unit.type !== 'harvester' && unit.type !== 'repair' && unit.state !== 'dead') {
            unit.selected = true;
            state.selection.push(unit.id);
          }
        }
      }

      forceUpdate(v => v + 1);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;

      const state = gameStateRef.current;
      if (!state) return;

      // Update selection box
      if (mouseRef.current.down && mouseRef.current.button === 0) {
        const world1 = screenToWorld(mouseRef.current.startX, mouseRef.current.startY, canvas.width, canvas.height, state.camera);
        const world2 = screenToWorld(mouseRef.current.x, mouseRef.current.y, canvas.width, canvas.height, state.camera);
        state.selectionBox = { x1: world1.x, y1: world1.y, x2: world2.x, y2: world2.y };
      }

      // Update building placement preview
      if (state.placingBuilding) {
        const world = screenToWorld(mouseRef.current.x, mouseRef.current.y, canvas.width, canvas.height, state.camera);
        (state as any)._previewX = Math.floor(world.x);
        (state as any)._previewY = Math.floor(world.y);
        (state as any)._canPlace = canPlaceBuilding(state, state.placingBuilding, Math.floor(world.x), Math.floor(world.y), 0);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.down = true;
      mouseRef.current.button = e.button;
      mouseRef.current.startX = mouseRef.current.x;
      mouseRef.current.startY = mouseRef.current.y;

      const state = gameStateRef.current;
      if (!state || state.paused) return;

      if (e.button === 0) {
        // Left click - start selection or select single unit (or place building)
        const world = screenToWorld(mouseRef.current.x, mouseRef.current.y, canvas.width, canvas.height, state.camera);
        const worldX = world.x;
        const worldY = world.y;

        if (state.placingBuilding) {
          // Don't select anything when placing buildings
          mouseRef.current.down = false;
          return;
        }

        if (!e.shiftKey && !e.ctrlKey) {
          state.units.forEach(u => u.selected = false);
          state.buildings.forEach(b => { /* deselect handled by selection array */ });
          state.selection = [];
        }

        // Check if clicking on a unit
        let clickedUnit = false;
        for (const unit of state.units) {
          if (unit.state === 'dead' || unit.owner !== 0) continue;
          const dx = unit.x - worldX;
          const dy = unit.y - worldY;
          if (Math.sqrt(dx * dx + dy * dy) < unit.stats.size) {
            unit.selected = true;
            if (!state.selection.includes(unit.id)) state.selection.push(unit.id);
            clickedUnit = true;
          }
        }

        // Check if clicking on a building
        if (!clickedUnit) {
          for (const building of state.buildings) {
            if (building.state === 'destroyed' || building.owner !== 0) continue;
            const stats = BUILDING_STATS[building.type];
            if (worldX >= building.x && worldX <= building.x + stats.width &&
                worldY >= building.y && worldY <= building.y + stats.height) {
              state.selection = [building.id];
              clickedUnit = true;
            }
          }
        }

        if (!clickedUnit && !e.shiftKey && !e.ctrlKey) {
          state.selection = [];
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const state = gameStateRef.current;
      if (!state) { mouseRef.current.down = false; return; }

      const canvas = canvasRef.current;
      if (!canvas) { mouseRef.current.down = false; return; }

      const world = screenToWorld(mouseRef.current.x, mouseRef.current.y, canvas.width, canvas.height, state.camera);
      const worldX = world.x;
      const worldY = world.y;

      if (e.button === 0) {
        // Left click release - box selection or building placement
        if (state.placingBuilding) {
          // Place building on left click
          const tileX = Math.floor(worldX);
          const tileY = Math.floor(worldY);
          if (canPlaceBuilding(state, state.placingBuilding, tileX, tileY, 0)) {
            placeBuilding(state, state.placingBuilding, tileX, tileY, 0);
          }
          state.placingBuilding = null;
        } else if (mouseRef.current.down && state.selectionBox) {
          const { x1, y1, x2, y2 } = state.selectionBox;
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          const minY = Math.min(y1, y2);
          const maxY = Math.max(y1, y2);

          if (Math.abs(maxX - minX) > 0.5 || Math.abs(maxY - minY) > 0.5) {
            if (!e.shiftKey && !e.ctrlKey) {
              state.units.forEach(u => u.selected = false);
              state.selection = [];
            }
            for (const unit of state.units) {
              if (unit.state === 'dead' || unit.owner !== 0) continue;
              if (unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY) {
                unit.selected = true;
                if (!state.selection.includes(unit.id)) state.selection.push(unit.id);
              }
            }
          }
          state.selectionBox = null;
        }
      }

      if (e.button === 2) {
        // Right click - command
        if (state.selection.length > 0) {
          // Check if right-clicking on enemy
          let targetEnemy: string | null = null;
          for (const unit of state.units) {
            if (unit.state === 'dead' || unit.owner === 0) continue;
            const dx = unit.x - worldX;
            const dy = unit.y - worldY;
            if (Math.sqrt(dx * dx + dy * dy) < unit.stats.size * 1.5) {
              targetEnemy = unit.id;
              break;
            }
          }
          if (!targetEnemy) {
            for (const building of state.buildings) {
              if (building.state === 'destroyed' || building.owner === 0) continue;
              const stats = BUILDING_STATS[building.type];
              const bx = building.x + stats.width / 2;
              const by = building.y + stats.height / 2;
              const dx = bx - worldX;
              const dy = by - worldY;
              if (Math.sqrt(dx * dx + dy * dy) < Math.max(stats.width, stats.height)) {
                targetEnemy = building.id;
                break;
              }
            }
          }

          if (targetEnemy) {
            commandAttack(state, state.selection, targetEnemy);
          } else {
            // Check if right-clicking on resource
            const tileX = Math.floor(worldX);
            const tileY = Math.floor(worldY);
            if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
              const tile = state.tiles[tileY][tileX];
              if (tile.terrain === 'resource') {
                commandHarvest(state, state.selection);
              } else {
                commandMove(state, state.selection, worldX, worldY);
              }
            }
          }
        }
      }

      mouseRef.current.down = false;
      forceUpdate(v => v + 1);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = gameStateRef.current;
      if (!state) return;
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      state.camera.zoom = Math.max(0.4, Math.min(2.5, state.camera.zoom + zoomDelta));
    };

    const handleContextMenu = (e: Event) => e.preventDefault();

    const handleMinimapClick = (e: MouseEvent) => {
      const mcanvas = minimapRef.current;
      if (!mcanvas) return;
      const rect = mcanvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const state = gameStateRef.current;
      if (!state) return;
      // Convert minimap click to tile coordinates, then to iso
      const tileX = mx * MAP_WIDTH;
      const tileY = my * MAP_HEIGHT;
      const isoX = (tileX - tileY) * (TILE_SIZE * 0.5);
      const isoY = (tileX + tileY) * (TILE_SIZE * 0.25);
      state.camera.x = isoX;
      state.camera.y = isoY;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvasRef.current?.addEventListener('mousemove', handleMouseMove);
    canvasRef.current?.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvasRef.current?.addEventListener('wheel', handleWheel, { passive: false });
    canvasRef.current?.addEventListener('contextmenu', handleContextMenu);
    minimapRef.current?.addEventListener('click', handleMinimapClick);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvasRef.current?.removeEventListener('mousemove', handleMouseMove);
      canvasRef.current?.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvasRef.current?.removeEventListener('wheel', handleWheel);
      canvasRef.current?.removeEventListener('contextmenu', handleContextMenu);
      minimapRef.current?.removeEventListener('click', handleMinimapClick);
    };
  }, [screen]);

  // Resize canvas
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [screen]);

  const state = gameStateRef.current;

  // Get selected unit/building info
  const getSelectedInfo = () => {
    if (!state) return null;
    if (state.selection.length === 0) return null;

    // Check if it's a building
    const building = state.buildings.find(b => b.id === state.selection[0] && b.owner === 0);
    if (building) return { type: 'building' as const, building };

    // Units
    const units = state.units.filter(u => state.selection.includes(u.id) && u.owner === 0);
    if (units.length > 0) return { type: 'units' as const, units };
    return null;
  };

  const handleSave = () => {
    if (!state) return;
    const json = saveGame(state);
    localStorage.setItem('ironhorizon_save', json);
    state.messages.push({ text: 'Game saved!', time: state.time, type: 'info' });
  };

  const handleLoad = () => {
    const json = localStorage.getItem('ironhorizon_save');
    if (!json) return;
    const loaded = loadGame(json);
    if (loaded) {
      gameStateRef.current = loaded;
      setGameState(loaded);
      setScreen('game');
    }
  };

  // MAIN MENU
  if (screen === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black flex flex-col items-center justify-center text-white">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-amber-500 tracking-wider mb-2" style={{ textShadow: '0 0 20px rgba(200,150,0,0.5)' }}>
            IRON HORIZON
          </h1>
          <p className="text-gray-400 text-lg tracking-wide">POST-APOCALYPTIC REAL-TIME STRATEGY</p>
        </div>

        <div className="flex flex-col gap-3 w-72">
          <button
            onClick={() => startGame(difficulty)}
            className="bg-amber-700 hover:bg-amber-600 text-white py-3 px-6 rounded font-bold text-lg transition-colors border border-amber-500"
          >
            ⚔️ New Battle ({difficulty})
          </button>

          <div className="flex gap-2">
            {(['easy', 'normal', 'hard'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 px-3 rounded text-sm font-bold transition-colors border ${
                  difficulty === d
                    ? 'bg-amber-700 border-amber-400 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={handleLoad}
            className="bg-gray-700 hover:bg-gray-600 text-white py-3 px-6 rounded font-bold transition-colors border border-gray-500"
          >
            📂 Load Game
          </button>

          <div className="mt-8 p-4 bg-gray-800/50 rounded border border-gray-700 text-sm text-gray-300">
            <h3 className="text-amber-400 font-bold mb-2">Controls:</h3>
            <p>• Left Click: Select units / Place buildings</p>
            <p>• Drag: Box selection</p>
            <p>• Right Click: Move / Attack / Harvest</p>
            <p>• WASD/Arrows: Move camera</p>
            <p>• Scroll: Zoom in/out</p>
            <p>• Ctrl+1-9: Set group</p>
            <p>• 1-9: Select group</p>
            <p>• Q: Select all combat units</p>
            <p>• ESC: Cancel/Pause</p>
            <p>• +/-: Speed up/down</p>
          </div>
        </div>
      </div>
    );
  }

  // VICTORY / DEFEAT
  if (screen === 'victory' || screen === 'defeat') {
    const player = state?.players[0];
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center text-white">
        <h1 className={`text-5xl font-bold mb-4 ${screen === 'victory' ? 'text-green-400' : 'text-red-400'}`}>
          {screen === 'victory' ? '🏆 VICTORY!' : '💀 DEFEAT'}
        </h1>
        <div className="bg-gray-800/80 p-6 rounded-lg border border-gray-600 mb-6">
          <h3 className="text-amber-400 font-bold mb-3">Battle Statistics</h3>
          <p>Units Built: {player?.unitsBuilt || 0}</p>
          <p>Buildings Built: {player?.buildingsBuilt || 0}</p>
          <p>Enemies Destroyed: {player?.enemiesDestroyed || 0}</p>
          <p>Technologies Researched: {player?.researchCompleted.length || 0}</p>
          <p>Battle Duration: {Math.floor((state?.time || 0) / 60)}m {Math.floor((state?.time || 0) % 60)}s</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => startGame(difficulty)}
            className="bg-amber-700 hover:bg-amber-600 text-white py-3 px-6 rounded font-bold transition-colors"
          >
            Play Again
          </button>
          <button
            onClick={() => setScreen('menu')}
            className="bg-gray-700 hover:bg-gray-600 text-white py-3 px-6 rounded font-bold transition-colors"
          >
            Main Menu
          </button>
        </div>
      </div>
    );
  }

  // GAME SCREEN
  const selectedInfo = getSelectedInfo();
  const hasFactory = state?.buildings.some(b => b.owner === 0 && b.type === 'factory' && b.state === 'active');
  const hasResearchLab = state?.buildings.some(b => b.owner === 0 && b.type === 'research_lab' && b.state === 'active');
  const factory = state?.buildings.find(b => b.owner === 0 && b.type === 'factory' && b.state === 'active');
  const selectedFactory = selectedInfo?.type === 'building' && selectedInfo.building.type === 'factory' ? selectedInfo.building : null;

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative select-none">
      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
      />

      {/* Top HUD Bar */}
      <div className="absolute top-0 left-0 right-0 h-10 bg-gray-900/90 border-b border-gray-700 flex items-center px-4 gap-6 text-sm z-10">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">⛏️</span>
          <span className="text-amber-300 font-bold">{Math.floor(state?.players[0].metal || 0)}</span>
          <span className="text-gray-400">Metal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-yellow-400">⚡</span>
          <span className={`font-bold ${(state?.players[0].energy || 0) < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
            {state?.players[0].energy || 0}/{state?.players[0].maxEnergy || 0}
          </span>
          <span className="text-gray-400">Power</span>
        </div>
        <div className="text-gray-300">
          ⏱️ {Math.floor((state?.time || 0) / 60)}:{String(Math.floor((state?.time || 0) % 60)).padStart(2, '0')}
        </div>
        <div className="text-gray-300">
          🎯 Speed: {state?.speed || 1}x
        </div>
        {state?.paused && <span className="text-red-400 font-bold animate-pulse">⏸ PAUSED</span>}
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setAudioEnabled(!isAudioEnabled()); forceUpdate(v => v + 1); }}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">
            {isAudioEnabled() ? '🔊' : '🔇'}
          </button>
          <button onClick={() => { if (state) state.paused = !state.paused; forceUpdate(v => v + 1); }}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">
            {state?.paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button onClick={handleSave} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">💾 Save</button>
          <button onClick={() => setScreen('menu')} className="px-2 py-1 bg-red-800 hover:bg-red-700 rounded text-xs">🚪 Exit</button>
        </div>
      </div>

      {/* Minimap */}
      <div className="absolute bottom-2 left-2 z-10">
        <canvas
          ref={minimapRef}
          width={200}
          height={200}
          className="border border-gray-600 rounded cursor-pointer bg-black"
        />
      </div>

      {/* Selection / Info Panel */}
      <div className="absolute bottom-2 right-2 w-72 bg-gray-900/90 border border-gray-700 rounded p-3 z-10">
        {!selectedInfo && (
          <p className="text-gray-500 text-sm">No selection</p>
        )}

        {selectedInfo?.type === 'units' && (
          <div>
            <h3 className="text-amber-400 font-bold text-sm mb-1">
              {selectedInfo.units.length > 1
                ? `${selectedInfo.units.length} Units Selected`
                : UNIT_STATS[selectedInfo.units[0].type].name}
            </h3>
            {selectedInfo.units.length === 1 && (
              <div className="text-xs text-gray-300 space-y-1">
                <div className="flex justify-between">
                  <span>HP:</span>
                  <span className={selectedInfo.units[0].hp < selectedInfo.units[0].maxHp * 0.3 ? 'text-red-400' : 'text-green-400'}>
                    {Math.floor(selectedInfo.units[0].hp)}/{selectedInfo.units[0].maxHp}
                  </span>
                </div>
                <div className="flex justify-between"><span>Damage:</span><span>{Math.floor(selectedInfo.units[0].stats.damage)}</span></div>
                <div className="flex justify-between"><span>Armor:</span><span>{Math.floor(selectedInfo.units[0].stats.armor)}</span></div>
                <div className="flex justify-between"><span>Range:</span><span>{selectedInfo.units[0].stats.range}</span></div>
                <div className="flex justify-between"><span>Speed:</span><span>{selectedInfo.units[0].stats.speed.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>Status:</span><span className="text-blue-300">{selectedInfo.units[0].state}</span></div>
              </div>
            )}
            {selectedInfo.units.length > 1 && (
              <div className="text-xs text-gray-400">
                {Object.entries(
                  selectedInfo.units.reduce((acc, u) => { acc[u.type] = (acc[u.type] || 0) + 1; return acc; }, {} as Record<string, number>)
                ).map(([type, count]) => (
                  <div key={type}>{UNIT_STATS[type as UnitType].name}: {count}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedInfo?.type === 'building' && (
          <div>
            <h3 className="text-amber-400 font-bold text-sm mb-1">
              {BUILDING_STATS[selectedInfo.building.type].name}
            </h3>
            <div className="text-xs text-gray-300 space-y-1">
              <div className="flex justify-between">
                <span>HP:</span>
                <span className="text-green-400">{Math.floor(selectedInfo.building.hp)}/{selectedInfo.building.maxHp}</span>
              </div>
              <div className="text-gray-400">{BUILDING_STATS[selectedInfo.building.type].description}</div>
              {selectedInfo.building.state === 'constructing' && (
                <div>
                  <div className="text-yellow-400">Building... {Math.floor(selectedInfo.building.buildProgress * 100)}%</div>
                  <div className="w-full h-2 bg-gray-700 rounded mt-1">
                    <div className="h-full bg-yellow-500 rounded" style={{ width: `${selectedInfo.building.buildProgress * 100}%` }} />
                  </div>
                </div>
              )}
              {selectedInfo.building.type === 'factory' && selectedInfo.building.productionQueue.length > 0 && (
                <div className="mt-2">
                  <div className="text-blue-300 font-bold">Production Queue:</div>
                  {selectedInfo.building.productionQueue.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 mt-1">
                      <span className="text-xs">{UNIT_STATS[item.type].name}</span>
                      <div className="flex-1 h-2 bg-gray-700 rounded">
                        <div className="h-full bg-blue-500 rounded" style={{ width: `${item.progress * 100}%` }} />
                      </div>
                      <button
                        onClick={() => { if (state && factory) cancelProduction(state, factory.id, idx); }}
                        className="text-red-400 text-xs hover:text-red-300"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Build Menu */}
      <div className="absolute bottom-2 left-56 right-76 bg-gray-900/90 border border-gray-700 rounded p-2 z-10" style={{ left: '220px', right: '300px' }}>
        <div className="flex gap-1 flex-wrap">
          {/* Building buttons */}
          <BuildButton
            label="🏭 Factory"
            cost={500}
            canAfford={(state?.players[0].metal || 0) >= 500}
            onClick={() => { if (state) state.placingBuilding = state.placingBuilding === 'factory' ? null : 'factory'; }}
            active={state?.placingBuilding === 'factory'}
          />
          <BuildButton
            label="🔬 Lab"
            cost={400}
            canAfford={(state?.players[0].metal || 0) >= 400}
            onClick={() => { if (state) state.placingBuilding = state.placingBuilding === 'research_lab' ? null : 'research_lab'; }}
            active={state?.placingBuilding === 'research_lab'}
          />
          <BuildButton
            label="⚡ Power"
            cost={300}
            canAfford={(state?.players[0].metal || 0) >= 300}
            onClick={() => { if (state) state.placingBuilding = state.placingBuilding === 'power_plant' ? null : 'power_plant'; }}
            active={state?.placingBuilding === 'power_plant'}
          />
          <BuildButton
            label="🔧 Repair"
            cost={350}
            canAfford={(state?.players[0].metal || 0) >= 350}
            onClick={() => { if (state) state.placingBuilding = state.placingBuilding === 'repair_bay' ? null : 'repair_bay'; }}
            active={state?.placingBuilding === 'repair_bay'}
          />
          <BuildButton
            label="📡 Radar"
            cost={250}
            canAfford={(state?.players[0].metal || 0) >= 250}
            onClick={() => { if (state) state.placingBuilding = state.placingBuilding === 'radar_station' ? null : 'radar_station'; }}
            active={state?.placingBuilding === 'radar_station'}
          />
          <BuildButton
            label="🗼 Tower"
            cost={200}
            canAfford={(state?.players[0].metal || 0) >= 200}
            onClick={() => { if (state) state.placingBuilding = state.placingBuilding === 'defense_tower' ? null : 'defense_tower'; }}
            active={state?.placingBuilding === 'defense_tower'}
          />
          <BuildButton
            label="🧱 Wall"
            cost={50}
            canAfford={(state?.players[0].metal || 0) >= 50}
            onClick={() => { if (state) state.placingBuilding = state.placingBuilding === 'wall' ? null : 'wall'; }}
            active={state?.placingBuilding === 'wall'}
          />

          {/* Separator */}
          <div className="w-px bg-gray-600 mx-1" />

          {/* Unit production (when factory selected or has factory) */}
          {(selectedFactory || hasFactory) && (
            <>
              <UnitButton label="🏎️ Scout" cost={100} metal={state?.players[0].metal || 0}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'scout'); }} />
              <UnitButton label="🚗 Buggy" cost={200} metal={state?.players[0].metal || 0}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'buggy'); }} />
              <UnitButton label="🔫 Tank" cost={400} metal={state?.players[0].metal || 0}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'medium_tank'); }} />
              <UnitButton label="🛡️ Heavy" cost={700} metal={state?.players[0].metal || 0}
                unlocked={(state?.players[0].researchCompleted.includes('adv1')) || false}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'heavy_tank'); }} />
              <UnitButton label="🎯 Artillery" cost={500} metal={state?.players[0].metal || 0}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'artillery'); }} />
              <UnitButton label="🚀 Missile" cost={550} metal={state?.players[0].metal || 0}
                unlocked={(state?.players[0].researchCompleted.includes('adv2')) || false}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'missile'); }} />
              <UnitButton label="🔭 AA" cost={350} metal={state?.players[0].metal || 0}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'aa_vehicle'); }} />
              <UnitButton label="🔧 Repair" cost={250} metal={state?.players[0].metal || 0}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'repair'); }} />
              <UnitButton label="⛏️ Harvest" cost={300} metal={state?.players[0].metal || 0}
                onClick={() => { if (state && factory) startProduction(state, factory.id, 'harvester'); }} />
            </>
          )}

          {/* Research button */}
          {hasResearchLab && (
            <>
              <div className="w-px bg-gray-600 mx-1" />
              <button
                onClick={() => setScreen(screen === 'research' ? 'game' : 'research')}
                className="px-2 py-1 bg-purple-800 hover:bg-purple-700 rounded text-xs text-white font-bold"
              >
                🔬 Research
              </button>
            </>
          )}
        </div>
        {state?.placingBuilding && (
          <div className="text-xs text-yellow-400 mt-1">
            Left-click to place {BUILDING_STATS[state.placingBuilding].name} (ESC to cancel)
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="absolute top-12 left-2 w-64 z-10">
        {state?.messages.slice(-5).map((msg, i) => (
          <div key={i} className={`text-xs p-1 mb-0.5 rounded ${
            msg.type === 'danger' ? 'bg-red-900/80 text-red-200' :
            msg.type === 'warning' ? 'bg-yellow-900/80 text-yellow-200' :
            'bg-gray-800/80 text-gray-300'
          }`}>
            {msg.text}
          </div>
        ))}
      </div>

      {/* Research Panel */}
      {screen === 'research' && state && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-600 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-amber-400">🔬 Research Lab</h2>
              <button onClick={() => setScreen('game')} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {state.players[0].researchActive && (
              <div className="mb-4 p-3 bg-gray-800 rounded border border-purple-700">
                <div className="text-purple-300 font-bold text-sm">
                  Researching: {RESEARCH_TREE.find(r => r.id === state.players[0].researchActive)?.name}
                </div>
                <div className="w-full h-3 bg-gray-700 rounded mt-2">
                  <div className="h-full bg-purple-500 rounded transition-all" style={{
                    width: `${(state.players[0].researchProgress / (RESEARCH_TREE.find(r => r.id === state.players[0].researchActive)?.researchTime || 1)) * 100}%`
                  }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {RESEARCH_TREE.map(node => {
                const completed = state.players[0].researchCompleted.includes(node.id);
                const available = !completed &&
                  node.prerequisites.every(p => state.players[0].researchCompleted.includes(p)) &&
                  !state.players[0].researchActive;
                const canAfford = state.players[0].metal >= node.cost;

                return (
                  <div key={node.id} className={`p-3 rounded border ${
                    completed ? 'bg-green-900/30 border-green-700' :
                    available && canAfford ? 'bg-gray-800 border-purple-600 cursor-pointer hover:bg-gray-700' :
                    'bg-gray-800/50 border-gray-700 opacity-60'
                  }`}
                    onClick={() => { if (available && canAfford) startResearch(state, node.id); }}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-bold text-white">{node.name}</span>
                      {completed && <span className="text-green-400 text-xs">✓ Done</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{node.description}</p>
                    <div className="text-xs text-amber-400 mt-1">Cost: {node.cost} | Time: {node.researchTime}s</div>
                    {!completed && !available && node.prerequisites.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Requires: {node.prerequisites.map(p => RESEARCH_TREE.find(r => r.id === p)?.name).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pause overlay */}
      {state?.paused && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white mb-4">⏸ PAUSED</h2>
            <button onClick={() => { if (state) state.paused = false; }}
              className="bg-amber-700 hover:bg-amber-600 text-white py-2 px-6 rounded font-bold">
              Resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components
function BuildButton({ label, cost, canAfford, onClick, active }: {
  label: string; cost: number; canAfford: boolean; onClick: () => void; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
        active ? 'bg-amber-600 text-white' :
        canAfford ? 'bg-gray-700 hover:bg-gray-600 text-white' :
        'bg-gray-800 text-gray-500 cursor-not-allowed'
      }`}
      disabled={!canAfford}
      title={`${label} - Cost: ${cost}`}
    >
      {label} <span className="text-amber-400 text-[10px]">${cost}</span>
    </button>
  );
}

function UnitButton({ label, cost, metal, onClick, unlocked }: {
  label: string; cost: number; metal: number; onClick: () => void; unlocked?: boolean;
}) {
  const canAfford = metal >= cost && (unlocked === undefined || unlocked);
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
        canAfford ? 'bg-gray-700 hover:bg-gray-600 text-white' :
        unlocked === false ? 'bg-gray-800 text-gray-600 cursor-not-allowed' :
        'bg-gray-800 text-gray-500 cursor-not-allowed'
      }`}
      disabled={!canAfford}
      title={`${label} - Cost: ${cost}${unlocked === false ? ' (Locked)' : ''}`}
    >
      {label} <span className="text-amber-400 text-[10px]">${cost}</span>
      {unlocked === false && <span className="text-red-400 text-[10px]"> 🔒</span>}
    </button>
  );
}
