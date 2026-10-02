import type { GameDate } from './model';

export const MONTH_DAYS = 30;
export const YEAR_DAYS = 365;

export function monthIndex(date: GameDate): number {
  return date.y * 12 + (date.m - 1);
}

export function monthMs(dayMs: number): number {
  return MONTH_DAYS * dayMs;
}

export function yearMs(dayMs: number): number {
  return YEAR_DAYS * dayMs;
}
