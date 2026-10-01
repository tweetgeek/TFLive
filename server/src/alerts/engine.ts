import type { Alert, AlertCategory, AlertType, EntityType, Meta, Mute, Severity, Snapshot } from '@tflive/shared';
import type { AlertConfig } from '../config';
import type { RuleBuffers } from './buffers';

export interface AlertCandidate {
  type: AlertType;
  category: AlertCategory;
  severity: Severity;
  entityType: EntityType;
  entityId: number | null;
  subKey?: string;
  title: string;
  detail: string;
  minDurationMs?: number;
}

export interface RuleContext {
  snap: Snapshot & { meta: Meta };
  gameTime: number;
  dayMs: number;
  config: AlertConfig;
  buffers: RuleBuffers;
}

export type Rule = (ctx: RuleContext) => AlertCandidate[];

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

export function alertId(c: Pick<AlertCandidate, 'type' | 'entityId' | 'subKey'>): string {
  return `${c.type}:${c.entityId ?? 'company'}${c.subKey ? `:${c.subKey}` : ''}`;
}

export class AlertEngine {
  private since = new Map<string, number>();

  constructor(private readonly rules: Rule[]) {}

  evaluate(ctx: RuleContext, mutes: Mute[]): Alert[] {
    const seen = new Set<string>();
    const out: Alert[] = [];
    for (const c of this.rules.flatMap((r) => r(ctx))) {
      const id = alertId(c);
      seen.add(id);
      const since = this.since.get(id) ?? ctx.gameTime;
      this.since.set(id, since);
      if (ctx.gameTime - since < (c.minDurationMs ?? 0)) continue;
      const mute = mutes.find(
        (m) => m.alertType === c.type && m.entityId === c.entityId && (m.kind === 'ignore' || (m.untilGameTime !== null && m.untilGameTime > ctx.gameTime)),
      );
      out.push({
        id,
        type: c.type,
        category: c.category,
        severity: c.severity,
        entityType: c.entityType,
        entityId: c.entityId,
        title: c.title,
        detail: c.detail,
        firstSeenGameTime: since,
        muted: mute ? { kind: mute.kind, untilGameTime: mute.untilGameTime } : null,
      });
    }
    for (const id of [...this.since.keys()]) if (!seen.has(id)) this.since.delete(id);
    return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.firstSeenGameTime - b.firstSeenGameTime);
  }

  reset(): void {
    this.since.clear();
  }
}
