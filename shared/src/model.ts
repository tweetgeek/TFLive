export interface GameDate { y: number; m: number; d: number }

export interface MetaPayload {
  date: GameDate;
  dayMs: number;
  paused: boolean;
  speed: number | null;
  mapName: string | null;
  bytesWritten: number;
  errors: string[];
}

export interface Meta extends MetaPayload {
  saveId: string;
  sessionId: string;
  gameTime: number;
}

export interface MonthValue { month: number; value: number }

export interface Finance {
  balance: number;
  loan: number;
  operatingResult12m: number;
  runningCosts12m: number;
  investments12m: number | null;
  operatingResultByMonth: MonthValue[];
}

export interface DepartureLoad { stopIndex: number; load: number; capacity: number; time: number }

export interface Line {
  id: number;
  name: string;
  mode: string;
  color: string | null;
  stopIds: number[];
  vehicleIds: number[];
  firstLedgerTime: number | null;
  operatingResult12m: number;
  investments12m: number | null;
  departureLoads: DepartureLoad[];
  /** Miesięczne Wyniki operacyjne (ostatnie 3 miesiące); 11. pole krotki. */
  operatingResultByMonth: MonthValue[];
}

export const VEHICLE_STATES = ['IN_DEPOT', 'EN_ROUTE', 'AT_TERMINAL', 'GOING_TO_DEPOT'] as const;
export type VehicleState = (typeof VEHICLE_STATES)[number];

export interface VehiclePart { model: string; purchaseTime: number; lifespanSec: number; maintenanceState: number }

export interface Vehicle {
  id: number;
  name: string;
  lineId: number | null;
  mode: string;
  state: VehicleState;
  userStopped: boolean;
  noPath: boolean;
  daysAtTerminal: number;
  daysInDepot: number;
  load: number;
  capacity: number;
  operatingResult12m: number | null;
  parts: VehiclePart[];
}

export interface IndustryInput { cargo: string; stock: number; lastReceivedTime: number | null }
export interface IndustryOutput { cargo: string; stock: number; capacity: number }

export interface Industry {
  id: number;
  name: string;
  type: string;
  level: number;
  maxLevel: number;
  closureTime: number | null;
  upgradeProgress: number;
  inputs: IndustryInput[];
  outputs: IndustryOutput[];
  lastServedTime: number | null;
}

export const DISTRICTS = ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL'] as const;
export type District = (typeof DISTRICTS)[number];

export interface TownNeed { district: District; cargo: string; demand: number; supplied: number | null }

export interface Town {
  id: number;
  name: string;
  population: number;
  developmentActive: boolean;
  noise: number;
  pollution: number;
  needs: TownNeed[];
  lastServedTime: number | null;
}

export interface Stop {
  id: number;
  name: string;
  waiting: { cargo: string; count: number }[];
  longestWaitStartTime: number | null;
}

export interface Backfill { scope: 'global' | 'line'; entityId: number | null; months: MonthValue[] }

export interface Snapshot {
  meta: Meta | null;
  finance: Finance | null;
  lines: Line[];
  vehicles: Vehicle[];
  industries: Industry[];
  towns: Town[];
  stops: Stop[];
}

export function emptySnapshot(): Snapshot {
  return { meta: null, finance: null, lines: [], vehicles: [], industries: [], towns: [], stops: [] };
}
