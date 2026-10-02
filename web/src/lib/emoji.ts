import type { AlertCategory, AlertType, District, VehicleState } from '@tflive/shared';

const MODES: Record<string, { emoji: string; label: string }> = {
  RAIL: { emoji: '🚆', label: 'KOLEJ' },
  ROAD: { emoji: '🚌', label: 'DROGA' },
  TRAM: { emoji: '🚋', label: 'TRAMWAJ' },
  AIR: { emoji: '✈️', label: 'LOTNICTWO' },
  WATER: { emoji: '🚢', label: 'WODA' },
};
export const modeEmoji = (mode: string) => MODES[mode]?.emoji ?? '🚗';
export const modeLabel = (mode: string) => MODES[mode]?.label ?? 'INNE';

export const CATEGORY: Record<AlertCategory, { emoji: string; label: string }> = {
  finance: { emoji: '💰', label: 'Finanse' },
  lines: { emoji: '🛤️', label: 'Linie' },
  vehicles: { emoji: '🚆', label: 'Pojazdy' },
  supply: { emoji: '🏭', label: 'Dostawy' },
  towns: { emoji: '🏙️', label: 'Miasta' },
};

const ALERT_EMOJI: Record<AlertType, string> = {
  'low-reserve': '🛟',
  'negative-operating-result': '📉',
  'unprofitable-line': '🛤️',
  'low-line-load': '💺',
  'line-without-vehicles': '🚫',
  'overloaded-stop': '🚏',
  'vehicle-no-path': '⛔',
  'vehicle-waiting': '⏳',
  'vehicle-idle': '😴',
  'vehicle-old': '👴',
  'vehicle-low-condition': '🔧',
  'missing-input': '⚙️',
  'stalled-output': '📦',
  'closure-threat': '🚨',
  'supply-drop': '📉',
};
export const alertEmoji = (type: AlertType) => ALERT_EMOJI[type] ?? '🔔';

export const VEHICLE_STATE: Record<VehicleState, { emoji: string; label: string }> = {
  EN_ROUTE: { emoji: '🛤️', label: 'w trasie' },
  AT_TERMINAL: { emoji: '⏳', label: 'na przystanku' },
  IN_DEPOT: { emoji: '🅿️', label: 'w zajezdni' },
  GOING_TO_DEPOT: { emoji: '↩️', label: 'do zajezdni' },
};

export const DISTRICT: Record<District, { emoji: string; label: string }> = {
  RESIDENTIAL: { emoji: '🏠', label: 'Mieszkalna' },
  COMMERCIAL: { emoji: '🛍️', label: 'Handlowa' },
  INDUSTRIAL: { emoji: '🏗️', label: 'Przemysłowa' },
};

const CARGO: Record<string, string> = {
  passengers: '👥', mail: '✉️', logs: '🪵', planks: '🪵', wood: '🪵', fish: '🐟', crude_oil: '🛢️', oil: '🛢️',
  fuel: '⛽', machines: '⚙️', tools: '🔧', vegetables: '🥬', grain: '🌾', food: '🍞', meat: '🥩', livestock: '🐄',
  coal: '⛏️', iron_ore: '⛏️', stone: '🪨', steel: '🔩', goods: '📦', construction_materials: '🧱', plastic: '🧴',
  marble: '🪨', silver: '🥈', gold: '🥇', paper: '📄', cotton: '🧶', textiles: '🧵',
};
export const cargoEmoji = (cargo: string) => {
  const k = cargo.toLowerCase();
  return Object.hasOwn(CARGO, k) ? CARGO[k] : '📦';
};
export const cargoLabel = (cargo: string) => cargo.toLowerCase().replaceAll('_', ' ');

const INDUSTRY: [RegExp, string][] = [
  [/oil|refin/, '🛢️'], [/forest|saw|wood|lumber/, '🪓'], [/fish/, '🎣'], [/farm|crop|grain/, '🌾'],
  [/mine|quarry|coal|ore/, '⛏️'], [/steel|metal/, '🔩'], [/food/, '🍞'], [/chemic|plastic/, '🧪'],
];
export const industryEmoji = (type: string) => INDUSTRY.find(([re]) => re.test(type))?.[1] ?? '🏭';
