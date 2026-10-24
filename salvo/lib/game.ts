/** Shared, deterministic Salvo rules. No presentation or network dependencies. */
export type Player = 0 | 1;
export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';
export type Difficulty = 'Beginner' | 'Easy' | 'Medium' | 'Hard' | 'Expert';
export interface Cell { x: number; y: number }
export interface Placement extends Cell { id: ShipId; horizontal: boolean }
export type Fleet = Placement[];
export interface Shot extends Cell {
  result: 'miss' | 'hit' | 'sunk';
  /** Revealed only after this entire ship has been hit. */
  sunk?: { id: ShipId; cells: Cell[] };
}
export interface GameState {
  phase: 'placement' | 'battle' | 'finished';
  fleets: [Fleet | null, Fleet | null];
  /** shots[p] contains shots FIRED BY player p, not incoming shots. */
  shots: [Shot[], Shot[]];
  turn: Player;
  winner: Player | null;
}

export const SHIPS: ReadonlyArray<{ id: ShipId; name: string; length: number }> = [
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Dreadnought', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
];
export const DIFFICULTIES: ReadonlyArray<Difficulty> = ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert'];
export const GRID_SIZE = 10;

const shipLength = (id: ShipId): number => SHIPS.find(s => s.id === id)?.length ?? 0;
const index = ({ x, y }: Cell): number => y * GRID_SIZE + x;
const cell = (i: number): Cell => ({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) });
const validCell = (x: unknown, y: unknown): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && Number(x) >= 0 && Number(x) < GRID_SIZE && Number(y) >= 0 && Number(y) < GRID_SIZE;
const validPlayer = (p: unknown): p is Player => p === 0 || p === 1;

export function newGame(): GameState {
  return { phase: 'placement', fleets: [null, null], shots: [[], []], turn: 0, winner: null };
}

export function cellsFor(ship: Placement): Cell[] {
  const length = shipLength(ship.id);
  if (!length) throw new Error('Unknown ship.');
  return Array.from({ length }, (_, i) => ({
    x: ship.x + (ship.horizontal ? i : 0),
    y: ship.y + (ship.horizontal ? 0 : i),
  }));
}

export function isValidPlacement(fleet: Fleet, ship: Placement): boolean {
  if (!ship || !shipLength(ship.id) || typeof ship.horizontal !== 'boolean' || !validCell(ship.x, ship.y)) return false;
  const cells = cellsFor(ship);
  if (cells.some(c => !validCell(c.x, c.y))) return false;
  // Moving a ship is checked against every OTHER ship, never its old position.
  const occupied = new Set(fleet.filter(s => s.id !== ship.id).flatMap(cellsFor).map(index));
  return cells.every(c => !occupied.has(index(c)));
}

export function validateFleet(input: unknown): Fleet {
  if (!Array.isArray(input) || input.length !== SHIPS.length) throw new Error('Place all five ships.');
  const fleet: Fleet = [];
  const ids = new Set<ShipId>();
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid ship placement.');
    const { id, x, y, horizontal } = value as Partial<Placement>;
    if (!SHIPS.some(s => s.id === id) || ids.has(id as ShipId)) throw new Error('Each ship must appear exactly once.');
    if (!validCell(x, y) || typeof horizontal !== 'boolean') throw new Error('Invalid ship coordinates.');
    const ship: Placement = { id: id as ShipId, x: x as number, y: y as number, horizontal };
    if (!isValidPlacement(fleet, ship)) throw new Error('Ships must stay on the grid and cannot overlap.');
    ids.add(ship.id);
    fleet.push(ship);
  }
  // Rebuild canonical values so untrusted clients cannot persist additional fields.
  return SHIPS.map(s => fleet.find(p => p.id === s.id)!);
}

export function randomFleet(): Fleet {
  const fleet: Fleet = [];
  for (const ship of SHIPS) {
    const available: Placement[] = [];
    for (const horizontal of [true, false]) {
      for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
        const p: Placement = { id: ship.id, x, y, horizontal };
        if (isValidPlacement(fleet, p)) available.push(p);
      }
    }
    // With only 17 occupied cells and this largest-first order, a placement always exists.
    if (!available.length) return randomFleet();
    fleet.push(available[Math.floor(Math.random() * available.length)]);
  }
  return fleet;
}

export function placeFleet(game: GameState, player: Player, input: Fleet): GameState {
  if (!validPlayer(player)) throw new Error('Invalid player.');
  if (game.phase !== 'placement') throw new Error('The battle has already started.');
  const fleet = validateFleet(input);
  const fleets: GameState['fleets'] = [...game.fleets];
  fleets[player] = fleet;
  return { ...game, fleets, phase: fleets[0] && fleets[1] ? 'battle' : 'placement' };
}

export function fleetRemaining(fleet: Fleet, enemyShots: Shot[]): number {
  const hit = new Set(enemyShots.filter(s => s.result !== 'miss').map(index));
  return fleet.filter(ship => !cellsFor(ship).every(c => hit.has(index(c)))).length;
}

export function fireShot(game: GameState, player: Player, x: number, y: number): { game: GameState; shot: Shot } {
  if (!validPlayer(player)) throw new Error('Invalid player.');
  if (game.phase !== 'battle') throw new Error(game.phase === 'finished' ? 'This battle is over.' : 'Both fleets must be ready.');
  if (game.turn !== player) throw new Error('Wait for your turn.');
  if (!validCell(x, y)) throw new Error('Choose a cell on the grid.');
  if (game.shots[player].some(s => s.x === x && s.y === y)) throw new Error('That cell has already been targeted.');
  const opponent: Player = player === 0 ? 1 : 0;
  const fleet = game.fleets[opponent];
  if (!fleet || !game.fleets[player]) throw new Error('Both fleets must be ready.');
  const target = fleet.find(ship => cellsFor(ship).some(c => c.x === x && c.y === y));
  const shot: Shot = { x, y, result: target ? 'hit' : 'miss' };
  if (target) {
    const hit = new Set(game.shots[player].filter(s => s.result !== 'miss').map(index));
    hit.add(index(shot));
    const cells = cellsFor(target);
    if (cells.every(c => hit.has(index(c)))) {
      shot.result = 'sunk';
      shot.sunk = { id: target.id, cells };
    }
  }
  const shots: GameState['shots'] = [...game.shots];
  shots[player] = [...shots[player], shot];
  const won = fleetRemaining(fleet, shots[player]) === 0;
  return {
    shot,
    game: {
      ...game,
      shots,
      // Standard alternating turns, including after hits and sinking a ship.
      turn: won ? player : opponent,
      phase: won ? 'finished' : 'battle',
      winner: won ? player : null,
    },
  };
}

type Candidate = { cells: number[]; unknown: number[]; hits: number[] };
type ShipOptions = { length: number; candidates: Candidate[] };

function choose<T>(values: T[], rng: () => number): T {
  if (!values.length) throw new Error('No untried cells remain.');
  const roll = Math.max(0, Math.min(0.999999999, Number(rng()) || 0));
  return values[Math.floor(roll * values.length)];
}

function shuffled<T>(values: T[], rng: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.max(0, Math.min(0.999999999, Number(rng()) || 0)) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function neighbors(i: number): number[] {
  const { x, y } = cell(i);
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    .filter(([a, b]) => validCell(a, b)).map(([a, b]) => b * GRID_SIZE + a);
}

function topScore(available: number[], scores: Float64Array, rng: () => number): number {
  let best = -Infinity;
  const bestCells: number[] = [];
  for (const i of available) {
    if (scores[i] > best + 1e-9) { best = scores[i]; bestCells.length = 0; bestCells.push(i); }
    else if (Math.abs(scores[i] - best) <= 1e-9) bestCells.push(i);
  }
  return choose(bestCells, rng);
}

/**
 * Builds every still-legal position from public evidence only. Adjacent ships are
 * permitted, so neighboring water is never inferred from a sinking.
 */
function possibilities(shots: Shot[], hits: Set<number>, fired: Set<number>, sunk: Set<number>): ShipOptions[] {
  const sunkIds = new Set(shots.flatMap(s => s.sunk ? [s.sunk.id] : []));
  const blocked = new Set([...shots.filter(s => s.result === 'miss').map(index), ...sunk]);
  return SHIPS.filter(s => !sunkIds.has(s.id)).map(ship => {
    const candidates: Candidate[] = [];
    for (const horizontal of [true, false]) {
      for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
        if (x + (horizontal ? ship.length : 1) > GRID_SIZE || y + (horizontal ? 1 : ship.length) > GRID_SIZE) continue;
        const cells = Array.from({ length: ship.length }, (_, k) => (y + (horizontal ? 0 : k)) * GRID_SIZE + x + (horizontal ? k : 0));
        if (cells.some(i => blocked.has(i))) continue;
        const unknown = cells.filter(i => !fired.has(i));
        // An entirely struck unsunk ship is inconsistent with the public result.
        if (!unknown.length) continue;
        candidates.push({ cells, unknown, hits: cells.filter(i => hits.has(i)) });
      }
    }
    return { length: ship.length, candidates };
  });
}

/**
 * Samples whole nonoverlapping fleets consistent with every public hit/miss.
 * Bounded work keeps Expert responsive on mobile. This is an approximate
 * posterior, not a claim of an optimal or uniform solver.
 */
function expertTargetScores(options: ShipOptions[], hits: Set<number>, rng: () => number): Float64Array | null {
  const scores = new Float64Array(100);
  let samples = 0;
  let totalNodes = 0;
  const maxNodes = 12000;
  for (let attempt = 0; attempt < 64 && samples < 32 && totalNodes < maxNodes; attempt++) {
    let nodes = 0;
    const search = (remaining: ShipOptions[], occupied: Set<number>, uncovered: Set<number>, chosen: Candidate[]): Candidate[] | null => {
      nodes++; totalNodes++;
      if (nodes > 260 || totalNodes > maxNodes) return null;
      if (!remaining.length) return uncovered.size ? null : chosen;
      if (remaining.reduce((sum, s) => sum + s.length, 0) < uncovered.size) return null;
      if (uncovered.size) {
        // Assign the most constrained known hit first; touching hits may belong
        // to different ships, and the solver explicitly allows that.
        let branches: { ship: number; candidate: Candidate }[] | null = null;
        for (const hit of uncovered) {
          const matches: { ship: number; candidate: Candidate }[] = [];
          remaining.forEach((ship, si) => {
            ship.candidates.forEach(candidate => {
              if (candidate.hits.includes(hit) && !candidate.cells.some(i => occupied.has(i))) matches.push({ ship: si, candidate });
            });
          });
          if (!matches.length) return null;
          if (!branches || matches.length < branches.length) branches = matches;
        }
        for (const { ship, candidate } of shuffled(branches!, rng)) {
          const nextOccupied = new Set([...occupied, ...candidate.cells]);
          const nextUncovered = new Set([...uncovered].filter(i => !candidate.hits.includes(i)));
          const solution = search(remaining.filter((_, i) => i !== ship), nextOccupied, nextUncovered, [...chosen, candidate]);
          if (solution) return solution;
          if (nodes > 260 || totalNodes > maxNodes) return null;
        }
      } else {
        // Once all hits are explained, place the remaining vessels to reject
        // impossible overlapping explanations before counting a sample.
        let bestIndex = 0;
        let candidates = remaining[0].candidates.filter(c => !c.cells.some(i => occupied.has(i)));
        for (let si = 1; si < remaining.length; si++) {
          const legal = remaining[si].candidates.filter(c => !c.cells.some(i => occupied.has(i)));
          if (legal.length < candidates.length) { candidates = legal; bestIndex = si; }
        }
        if (!candidates.length) return null;
        for (const candidate of shuffled(candidates, rng)) {
          const solution = search(remaining.filter((_, i) => i !== bestIndex), new Set([...occupied, ...candidate.cells]), uncovered, [...chosen, candidate]);
          if (solution) return solution;
          if (nodes > 260 || totalNodes > maxNodes) return null;
        }
      }
      return null;
    };
    const sample = search(options, new Set(), new Set(hits), []);
    if (sample) {
      samples++;
      for (const candidate of sample) {
        for (const i of candidate.unknown) scores[i] += candidate.hits.length ? 1 + candidate.hits.length * 0.45 : 0.015;
      }
    }
  }
  return samples >= 4 ? scores : null;
}

/**
 * The ONLY AI input is its public shot history. Hidden fleets are neither
 * accepted nor referenced. Difficulty changes inference, never information.
 */
export function chooseAIShot(shots: Shot[], difficulty: Difficulty, rng: () => number = Math.random): Cell {
  const fired = new Set(shots.map(index));
  const available = Array.from({ length: 100 }, (_, i) => i).filter(i => !fired.has(i));
  if (!available.length) throw new Error('No untried cells remain.');
  const sunk = new Set(shots.flatMap(s => s.sunk ? s.sunk.cells.map(index) : []));
  const hits = new Set(shots.filter(s => s.result !== 'miss').map(index).filter(i => !sunk.has(i)));
  const adjacent = [...new Set([...hits].flatMap(neighbors))].filter(i => !fired.has(i));

  // Beginner occasionally follows a hit, but often loses the trail.
  if (difficulty === 'Beginner') return cell(choose(adjacent.length && rng() < 0.18 ? adjacent : available, rng));
  // Easy remembers hits but sometimes explores prematurely.
  if (difficulty === 'Easy') return cell(choose(adjacent.length && rng() < 0.78 ? adjacent : available, rng));

  const options = possibilities(shots, hits, fired, sunk);
  const hunt = new Float64Array(100);
  const target = new Float64Array(100);
  let maxCoveredHits = 0;
  for (const ship of options) {
    for (const candidate of ship.candidates) {
      maxCoveredHits = Math.max(maxCoveredHits, candidate.hits.length);
      for (const i of candidate.unknown) {
        hunt[i] += 1;
        if (candidate.hits.length) target[i] += candidate.hits.length ** 3;
      }
    }
  }

  if (difficulty === 'Medium') {
    if (adjacent.length) {
      // Hunt/target: pursue straight lines and bridge gaps between known hits.
      const scores = new Float64Array(100);
      for (const i of adjacent) {
        const c = cell(i);
        scores[i] = neighbors(i).filter(j => hits.has(j)).length;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = { x: c.x + dx, y: c.y + dy };
          const b = { x: c.x + dx * 2, y: c.y + dy * 2 };
          if (validCell(a.x, a.y) && validCell(b.x, b.y) && hits.has(index(a)) && hits.has(index(b))) scores[i] += 4;
        }
      }
      return cell(topScore(adjacent, scores, rng));
    }
    const checkerboard = available.filter(i => (i % 10 + Math.floor(i / 10)) % 2 === 0);
    return cell(choose(checkerboard.length ? checkerboard : available, rng));
  }

  if (hits.size && maxCoveredHits) {
    if (difficulty === 'Expert') {
      const sampled = expertTargetScores(options, hits, rng);
      if (sampled) {
        // A small exact-density prior stabilizes ties in the bounded samples.
        const normalizer = Math.max(...target, 1);
        for (const i of available) sampled[i] += target[i] / normalizer * 0.15;
        return cell(topScore(available, sampled, rng));
      }
    }
    return cell(topScore(available, target, rng));
  }

  // Hard hunts by placement density. Expert additionally uses a dynamic
  // smallest-remaining-ship lattice, which intersects every legal placement.
  if (difficulty === 'Expert') {
    const minimum = options.length ? Math.min(...options.map(o => o.length)) : 2;
    const lattice = available.filter(i => (i % 10 + Math.floor(i / 10)) % minimum === 0 && hunt[i] > 0);
    if (lattice.length) return cell(topScore(lattice, hunt, rng));
  }
  return cell(topScore(available, hunt, rng));
}
