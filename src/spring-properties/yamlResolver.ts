import { parseAllDocuments, isMap, isPair } from "yaml";

export interface YamlEntry {
  key: string;
  line: number; // 0-based
  column: number; // 0-based
}

export function flattenYaml(text: string): YamlEntry[] {
  // Spring config files may bundle several profile documents separated by
  // `---`; parse every document, not just the first.
  const docs = parseAllDocuments(text);
  const entries: YamlEntry[] = [];

  // Offsets are absolute across the whole text, so a single map serves every
  // document.
  const offsetToPos = makeOffsetToPos(text);

  function walk(node: unknown, prefix: string): void {
    if (isMap(node)) {
      for (const item of node.items) {
        if (!isPair(item)) continue;
        const keyNode: any = item.key;
        const keyStr = String(keyNode?.value ?? "");
        const full = prefix ? `${prefix}.${keyStr}` : keyStr;
        const range = keyNode?.range as [number, number] | undefined;
        if (isMap(item.value)) {
          walk(item.value, full);
        } else {
          if (range) {
            const pos = offsetToPos(range[0]);
            entries.push({ key: full, line: pos.line, column: pos.column });
          } else {
            entries.push({ key: full, line: 0, column: 0 });
          }
        }
      }
    }
  }

  for (const doc of docs) {
    walk(doc.contents, "");
  }
  return entries;
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
