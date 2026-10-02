import type { Alert, Snapshot } from '@tflive/shared';

export interface HubStatus {
  logPath: string | null;
  logState: 'missing' | 'ok';
  live: boolean;
  lastLineWallMs: number | null;
  paused: boolean | null;
  diskMBPerHour: number | null;
  saveId: string | null;
  lastError: string | null;
}

export interface HubState {
  snapshot: Snapshot;
  alerts: Alert[];
  status: HubStatus;
}

export interface WireMessage extends HubState {
  type: 'state';
}
