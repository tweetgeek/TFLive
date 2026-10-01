export interface LogReadResult {
  lines: string[];
  reset: boolean;
  missing: boolean;
}

export interface LineSource {
  readonly path: string | null;
  read(): LogReadResult;
}
