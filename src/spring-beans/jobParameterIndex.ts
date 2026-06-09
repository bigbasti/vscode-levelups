export interface JobParameterLocation {
  filePath: string;
  line: number; // 0-based
  column: number; // 0-based, points at the key literal
}

export interface JobParameterDefinition {
  key: string;
  line: number;
  column: number;
}

// Matches JobParametersBuilder setters: .addString/.addLong/.addDate/.addDouble/
// .addParameter/.addJobParameter("KEY", ...). The captured group is the key.
const ADD_PARAM_RE =
  /\.add(?:String|Long|Date|Double|Parameter|JobParameter)\s*\(\s*"([^"]+)"/g;

/**
 * Find Spring Batch job-parameter definitions in a Java source file. Pure: no
 * vscode or filesystem access.
 */
export function detectJobParameterDefinitions(
  source: string,
  _filePath: string
): JobParameterDefinition[] {
  const offsetToPos = makeOffsetToPos(source);
  const defs: JobParameterDefinition[] = [];
  let m: RegExpExecArray | null;
  ADD_PARAM_RE.lastIndex = 0;
  while ((m = ADD_PARAM_RE.exec(source)) !== null) {
    const keyOffset = m.index + m[0].indexOf('"') + 1;
    const pos = offsetToPos(keyOffset);
    defs.push({ key: m[1], line: pos.line, column: pos.column });
  }
  return defs;
}

/** Index of job-parameter keys to the locations where they are set. */
export class JobParameterIndex {
  private byKey = new Map<string, JobParameterLocation[]>();
  private byFile = new Map<string, string[]>();

  get(key: string): JobParameterLocation[] {
    return this.byKey.get(key) ?? [];
  }

  updateFromSource(filePath: string, source: string): void {
    this.removeFile(filePath);
    const keys: string[] = [];
    for (const def of detectJobParameterDefinitions(source, filePath)) {
      const arr = this.byKey.get(def.key) ?? [];
      arr.push({ filePath, line: def.line, column: def.column });
      this.byKey.set(def.key, arr);
      keys.push(def.key);
    }
    this.byFile.set(filePath, keys);
  }

  removeFile(filePath: string): void {
    const keys = this.byFile.get(filePath);
    if (!keys) return;
    for (const key of keys) {
      const arr = this.byKey.get(key);
      if (!arr) continue;
      const filtered = arr.filter((l) => l.filePath !== filePath);
      if (filtered.length) this.byKey.set(key, filtered);
      else this.byKey.delete(key);
    }
    this.byFile.delete(filePath);
  }

  clear(): void {
    this.byKey.clear();
    this.byFile.clear();
  }
}

function makeOffsetToPos(text: string) {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  return (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, column: offset - lineStarts[lo] };
  };
}
