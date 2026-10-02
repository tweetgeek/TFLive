export const SCHEMA_VERSION = 1;
export const LINE_ANCHOR = ']  [TFLIVE] ';

export const SECTIONS = ['meta', 'finance', 'lines', 'vehicles', 'industries', 'towns', 'stops', 'backfill'] as const;
export type SectionName = (typeof SECTIONS)[number];

export interface LineHeader {
  schemaVersion: number;
  saveId: string;
  sessionId: string;
  seq: number;
  gameTime: number;
  section: SectionName;
  part: number;
  parts: number;
}

export interface ParsedLine {
  header: LineHeader;
  payload: unknown;
}

export type ParseFailure = 'not-tflive' | 'bad-header' | 'unknown-section' | 'bad-json' | 'unsupported-version';
export type ParseResult = { ok: true; line: ParsedLine } | { ok: false; reason: ParseFailure; version?: number };

const HEADER_RE = /^(\d+) (\S+) (\S+) (\d+) (\d+) ([a-z]+) (\d+)\/(\d+) (.*)$/s;

function isSection(s: string): s is SectionName {
  return (SECTIONS as readonly string[]).includes(s);
}

export function parseLine(raw: string): ParseResult {
  const at = raw.indexOf(LINE_ANCHOR);
  if (at < 0) return { ok: false, reason: 'not-tflive' };
  const rest = raw.slice(at + LINE_ANCHOR.length).replace(/\r$/, '');
  const version = /^(\d+) /.exec(rest);
  if (!version) return { ok: false, reason: 'bad-header' };
  const schemaVersion = Number(version[1]);
  if (schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: 'unsupported-version', version: schemaVersion };
  const m = HEADER_RE.exec(rest);
  if (!m) return { ok: false, reason: 'bad-header' };
  const [, , saveId, sessionId, seq, gameTime, section, part, parts, json] = m;
  if (!isSection(section)) return { ok: false, reason: 'unknown-section' };
  const partN = Number(part);
  const partsN = Number(parts);
  if (partN < 1 || partsN < 1 || partN > partsN) return { ok: false, reason: 'bad-header' };
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'bad-json' };
  }
  return {
    ok: true,
    line: {
      header: { schemaVersion, saveId, sessionId, seq: Number(seq), gameTime: Number(gameTime), section, part: partN, parts: partsN },
      payload,
    },
  };
}

export function formatLine(h: Omit<LineHeader, 'schemaVersion'>, payload: unknown): string {
  return `[TFLIVE] ${SCHEMA_VERSION} ${h.saveId} ${h.sessionId} ${h.seq} ${h.gameTime} ${h.section} ${h.part}/${h.parts} ${JSON.stringify(payload)}`;
}
