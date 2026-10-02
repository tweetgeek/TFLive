import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeSection, parseLine, SECTIONS } from '@tflive/shared';

const file = fileURLToPath(new URL('../../mod/test/golden.log', import.meta.url));

describe('kontrakt mod → serwer (golden.log)', () => {
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.length > 0);

  it('każda linia parsuje się i dekoduje', () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const raw of lines) {
      const r = parseLine(raw);
      expect(r.ok, raw.slice(0, 120)).toBe(true);
      if (!r.ok) continue;
      if (r.line.header.parts === 1) expect(() => decodeSection(r.line.header.section, r.line.payload), raw.slice(0, 120)).not.toThrow();
    }
  });

  it('obejmuje wszystkie sekcje i zaczyna się od meta', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok ? [r.line] : []));
    expect(parsed[0].header.section).toBe('meta');
    expect(new Set(parsed.map((p) => p.header.section))).toEqual(new Set(SECTIONS));
  });

  it('części jednej partii mają ten sam seq i sklejone dekodują się', () => {
    const veh = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'vehicles' ? [r.line] : []));
    expect(veh.length).toBeGreaterThanOrEqual(2);
    expect(new Set(veh.map((v) => v.header.seq)).size).toBe(1);
    const rows = veh.sort((a, b) => a.header.part - b.header.part).flatMap((v) => v.payload as unknown[]);
    expect(() => decodeSection('vehicles', rows)).not.toThrow();
  });
});
