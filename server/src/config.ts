import { existsSync, readFileSync } from 'node:fs';

export interface ServerConfig {
  port: number;
  host: string;
  logPath: string | null;
  dataDir: string;
  pollMs: number;
  staleMs: number;
}

export const DEFAULT_CONFIG: ServerConfig = {
  port: 8787,
  host: '0.0.0.0',
  logPath: null,
  dataDir: 'server/data',
  pollMs: 1000,
  staleMs: 15000,
};

export interface AlertConfig {
  reserveWarnMonths: number;
  reserveCriticalMonths: number;
  rampUpMonths: number;
  lowLoadRatio: number;
  lowLoadWindowMonths: number;
  overloadedBadRatio: number;
  overloadedMinWaiting: number;
  waitingDays: number;
  idleDays: number;
  lowConditionRatio: number;
  missingInputMonths: number;
  stalledOutputRatio: number;
  stalledOutputMonths: number;
  supplyLowRatio: number;
  supplyDropRatio: number;
  supplyDropWindowMonths: number;
  servedWindowMonths: number;
  snoozeMonths: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  reserveWarnMonths: 3,
  reserveCriticalMonths: 1,
  rampUpMonths: 6,
  lowLoadRatio: 0.25,
  lowLoadWindowMonths: 3,
  overloadedBadRatio: 0.25,
  overloadedMinWaiting: 10,
  waitingDays: 30,
  idleDays: 30,
  lowConditionRatio: 0.5,
  missingInputMonths: 2,
  stalledOutputRatio: 0.8,
  stalledOutputMonths: 1,
  supplyLowRatio: 0.5,
  supplyDropRatio: 0.3,
  supplyDropWindowMonths: 3,
  servedWindowMonths: 12,
  snoozeMonths: 3,
};

function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Niepoprawny JSON w ${file}: ${(e as Error).message}`);
  }
}

export function loadConfig(file: string): ServerConfig {
  return { ...DEFAULT_CONFIG, ...readJson(file) } as ServerConfig;
}

export function loadAlertConfig(file: string): AlertConfig {
  return { ...DEFAULT_ALERT_CONFIG, ...readJson(file) } as AlertConfig;
}
