import { flattenYaml } from "./yamlResolver";

export interface PropertyLocation {
  filePath: string;
  line: number; // 0-based
  column: number; // 0-based
}

export class PropertyIndex {
  private byKey = new Map<string, PropertyLocation[]>();
  private byFile = new Map<string, string[]>();

  get(key: string): PropertyLocation[] {
    return this.byKey.get(key) ?? [];
  }

  updateFromSource(filePath: string, source: string): void {
    this.removeFile(filePath);
    const keys: string[] = [];
    const isYaml = /\.ya?ml$/i.test(filePath);
    const locs = isYaml
      ? parsePropertiesFromYaml(filePath, source)
      : parsePropertiesFile(filePath, source);

    for (const { key, loc } of locs) {
      const arr = this.byKey.get(key) ?? [];
      arr.push(loc);
      this.byKey.set(key, arr);
      keys.push(key);
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

function parsePropertiesFile(
  filePath: string,
  source: string
): { key: string; loc: PropertyLocation }[] {
  const out: { key: string; loc: PropertyLocation }[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const eq = line.search(/[=:]/);
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    out.push({
      key,
      loc: { filePath, line: i, column: line.indexOf(key) },
    });
  }
  return out;
}

function parsePropertiesFromYaml(
  filePath: string,
  source: string
): { key: string; loc: PropertyLocation }[] {
  return flattenYaml(source).map((e) => ({
    key: e.key,
    loc: { filePath, line: e.line, column: e.column },
  }));
}
