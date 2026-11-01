export const ARENA = { halfX: 43, halfZ: 59 };
export const GATES = [
  { x: -32, z: -46, name: 'A01', destination: 'TOKYO', color: 0x9be8ca },
  { x: 32, z: -46, name: 'A02', destination: 'PARIS', color: 0x9be8ca },
  { x: 32, z: 46, name: 'B01', destination: 'NEW YORK', color: 0x9be8ca },
  { x: -32, z: 46, name: 'B02', destination: 'STOCKHOLM', color: 0x9be8ca }
];
export const OBSTACLES = [
  { x: -16, z: -19, w: 12, d: 9, type: 'seating' },
  { x: 16, z: -19, w: 12, d: 9, type: 'seating' },
  { x: -16, z: 19, w: 12, d: 9, type: 'seating' },
  { x: 16, z: 19, w: 12, d: 9, type: 'seating' },
  { x: -38, z: 0, w: 6, d: 20, type: 'cafe' },
  { x: 38, z: 0, w: 6, d: 20, type: 'checkin' },
  { x: 0, z: 0, r: 4, type: 'planter' },
  { x: -30, z: -29, r: 0.85, type: 'column' },
  { x: 30, z: -29, r: 0.85, type: 'column' },
  { x: -30, z: 29, r: 0.85, type: 'column' },
  { x: 30, z: 29, r: 0.85, type: 'column' }
];
export const CONVEYORS = [
  { x: -24, z: 0, w: 4, d: 24, direction: -1 },
  { x: 24, z: 0, w: 4, d: 24, direction: 1 }
];
export const RAMPS = [
  { x: 0, z: -33, w: 8, d: 7, direction: -1 },
  { x: 0, z: 33, w: 8, d: 7, direction: 1 }
];
export const PALETTES = [
  { name: 'Tangerine', color: '#ff754c', hex: 0xff754c, unlock: 0 },
  { name: 'Glacier', color: '#8fd9e8', hex: 0x8fd9e8, unlock: 800 },
  { name: 'Matcha', color: '#b1cd8b', hex: 0xb1cd8b, unlock: 2000 },
  { name: 'Midnight', color: '#8a85c9', hex: 0x8a85c9, unlock: 4000 },
  { name: 'First class', color: '#edce79', hex: 0xedce79, unlock: 7000 }
];
