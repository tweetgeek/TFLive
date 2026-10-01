export type AlertType =
  | 'low-reserve'
  | 'negative-operating-result'
  | 'unprofitable-line'
  | 'low-line-load'
  | 'line-without-vehicles'
  | 'overloaded-stop'
  | 'vehicle-no-path'
  | 'vehicle-waiting'
  | 'vehicle-idle'
  | 'vehicle-old'
  | 'vehicle-low-condition'
  | 'missing-input'
  | 'stalled-output'
  | 'closure-threat'
  | 'supply-drop';

export type Severity = 'info' | 'warn' | 'critical';
export type AlertCategory = 'finance' | 'lines' | 'vehicles' | 'supply' | 'towns';
export type EntityType = 'company' | 'line' | 'stop' | 'vehicle' | 'industry' | 'town';
export type MuteKind = 'ignore' | 'snooze';

export interface Mute {
  id: number;
  saveId: string;
  alertType: AlertType;
  entityId: number | null;
  kind: MuteKind;
  untilGameTime: number | null;
}

export interface Alert {
  id: string;
  type: AlertType;
  category: AlertCategory;
  severity: Severity;
  entityType: EntityType;
  entityId: number | null;
  title: string;
  detail: string;
  firstSeenGameTime: number;
  muted: { kind: MuteKind; untilGameTime: number | null } | null;
}
