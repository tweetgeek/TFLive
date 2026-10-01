import type { DecodedSection } from './decode';

const b = (v: boolean) => (v ? 1 : 0);

export function encodeSection(s: DecodedSection): unknown {
  switch (s.section) {
    case 'meta': {
      const m = s.data;
      return { date: [m.date.y, m.date.m, m.date.d], dayMs: m.dayMs, paused: b(m.paused), speed: m.speed, map: m.mapName, bytes: m.bytesWritten, errors: m.errors };
    }
    case 'finance': {
      const f = s.data;
      return { bal: f.balance, loan: f.loan, ops12: f.operatingResult12m, run12: f.runningCosts12m, inv12: f.investments12m, opsM: f.operatingResultByMonth.map((x) => [x.month, x.value]) };
    }
    case 'lines':
      return s.data.map((l) => [l.id, l.name, l.mode, l.color, l.stopIds, l.vehicleIds, l.firstLedgerTime, l.operatingResult12m, l.investments12m, l.departureLoads.map((d) => [d.stopIndex, d.load, d.capacity, d.time])]);
    case 'vehicles':
      return s.data.map((v) => [v.id, v.name, v.lineId, v.mode, v.state, b(v.userStopped), b(v.noPath), v.daysAtTerminal, v.daysInDepot, v.load, v.capacity, v.operatingResult12m, v.parts.map((p) => [p.model, p.purchaseTime, p.lifespanSec, p.maintenanceState])]);
    case 'industries':
      return s.data.map((i) => [i.id, i.name, i.type, i.level, i.maxLevel, i.closureTime, i.upgradeProgress, i.inputs.map((x) => [x.cargo, x.stock, x.lastReceivedTime]), i.outputs.map((x) => [x.cargo, x.stock, x.capacity]), i.lastServedTime]);
    case 'towns':
      return s.data.map((t) => [t.id, t.name, t.population, b(t.developmentActive), t.noise, t.pollution, t.needs.map((n) => [n.district, n.cargo, n.demand, n.supplied]), t.lastServedTime]);
    case 'stops':
      return s.data.map((st) => [st.id, st.name, st.waiting.map((w) => [w.cargo, w.count]), st.longestWaitStartTime]);
    case 'backfill':
      return { scope: s.data.scope, id: s.data.entityId, months: s.data.months.map((x) => [x.month, x.value]) };
  }
}
