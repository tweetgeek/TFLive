import type { Vehicle } from '@tflive/shared';
import { maxLifespanUsage, vehicleCondition } from '../derive';
import type { AlertCandidate, Rule } from './engine';

function candidate(v: Vehicle, type: AlertCandidate['type'], severity: AlertCandidate['severity'], title: string, detail: string, minDurationMs?: number): AlertCandidate {
  return { type, category: 'vehicles', severity, entityType: 'vehicle', entityId: v.id, title: `${title}: ${v.name}`, detail, ...(minDurationMs !== undefined ? { minDurationMs } : {}) };
}

export const vehicleNoPath: Rule = ({ snap }) =>
  snap.vehicles.filter((v) => v.noPath).map((v) => candidate(v, 'vehicle-no-path', 'critical', 'Pojazd bez trasy', 'Gra nie potrafi wyznaczyć drogi do następnego celu'));

export const vehicleWaiting: Rule = ({ snap, config }) =>
  snap.vehicles
    .filter((v) => !v.userStopped && v.daysAtTerminal > config.waitingDays)
    .map((v) => candidate(v, 'vehicle-waiting', 'warn', 'Pojazd czekający', `Stoi na przystanku od ${v.daysAtTerminal} dni`));

export const vehicleIdle: Rule = ({ snap, config, dayMs }) =>
  snap.vehicles.flatMap((v) => {
    if (v.userStopped) return [];
    if (v.daysInDepot > config.idleDays) return [candidate(v, 'vehicle-idle', 'warn', 'Bezczynny pojazd', `W zajezdni od ${v.daysInDepot} dni`)];
    if (v.lineId === null) return [candidate(v, 'vehicle-idle', 'warn', 'Bezczynny pojazd', 'Pojazd bez Linii', config.idleDays * dayMs)];
    return [];
  });

export const vehicleOld: Rule = ({ snap, gameTime }) =>
  snap.vehicles.flatMap((v) => {
    const usage = maxLifespanUsage(v, gameTime);
    if (usage === null || usage < 1) return [];
    return [candidate(v, 'vehicle-old', 'warn', 'Stary pojazd', `Wykorzystanie żywotności: ${Math.round(usage * 100)}%`)];
  });

export const vehicleLowCondition: Rule = ({ snap, config }) =>
  snap.vehicles.flatMap((v) => {
    const c = vehicleCondition(v);
    if (c === null || c >= config.lowConditionRatio) return [];
    return [candidate(v, 'vehicle-low-condition', 'warn', 'Niski stan pojazdu', `Stan pojazdu: ${Math.round(c * 100)}%`)];
  });
