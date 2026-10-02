import type { Rule } from './engine';
import { lowReserve, negativeOperatingResult } from './finance';
import { lineWithoutVehicles, lowLineLoad, overloadedStop, unprofitableLine } from './lines';
import { closureThreat, missingInput, stalledOutput } from './supply';
import { supplyDrop } from './towns';
import { vehicleIdle, vehicleLowCondition, vehicleNoPath, vehicleOld, vehicleWaiting } from './vehicles';

export const ALL_RULES: Rule[] = [
  lowReserve,
  negativeOperatingResult,
  unprofitableLine,
  lowLineLoad,
  lineWithoutVehicles,
  overloadedStop,
  vehicleNoPath,
  vehicleWaiting,
  vehicleIdle,
  vehicleOld,
  vehicleLowCondition,
  missingInput,
  stalledOutput,
  closureThreat,
  supplyDrop,
];
