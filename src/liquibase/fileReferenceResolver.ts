import * as path from "path";

export type FileRefTag = "include" | "includeAll" | "sqlFile";
export type FileRefAttr = "file" | "path";

export interface FileReference {
  tag: FileRefTag;
  attr: FileRefAttr;
  value: string;
  relativeToChangelogFile: boolean;
  valueStart: number; // document offset of the value's first character
  valueEnd: number; // document offset just past the value's last character
}

/** Each navigable tag and the attribute that carries its file/dir path. */
const TAG_ATTR: Record<FileRefTag, FileRefAttr> = {
  include: "file",
  includeAll: "path",
  sqlFile: "path",
};

const TAG_RE = /<(include|includeAll|sqlFile)\b([^>]*)>/g;

/**
 * If `offset` sits inside the path value of an <include file>, <includeAll path>
 * or <sqlFile path> element, return the parsed reference. Otherwise undefined.
 * Pure: no vscode or filesystem access.
 */
export function findFileReferenceAtOffset(
  text: string,
  offset: number
): FileReference | undefined {
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text)) !== null) {
    const tag = m[1] as FileRefTag;
    const attrsText = m[2];
    const attrsStart = m.index + m[0].indexOf(attrsText, m[1].length + 1);

    const attr = TAG_ATTR[tag];
    const valueRange = findAttributeValueRange(attrsText, attr);
    if (!valueRange) continue;

    const valueStart = attrsStart + valueRange.start;
    const valueEnd = attrsStart + valueRange.end;
    if (offset < valueStart || offset > valueEnd) continue;

    return {
      tag,
      attr,
      value: attrsText.slice(valueRange.start, valueRange.end),
      relativeToChangelogFile: parseRelativeFlag(attrsText),
      valueStart,
      valueEnd,
    };
  }
  return undefined;
}

interface Range {
  start: number;
  end: number;
}

/** Locate the quoted value of `attr` within an element's attribute text. */
function findAttributeValueRange(
  attrsText: string,
  attr: string
): Range | undefined {
  const re = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`);
  const m = re.exec(attrsText);
  if (!m) return undefined;
  const valueStart = m.index + m[0].indexOf('"') + 1;
  return { start: valueStart, end: valueStart + m[1].length };
}

function parseRelativeFlag(attrsText: string): boolean {
  const m = /\brelativeToChangelogFile\s*=\s*"([^"]*)"/.exec(attrsText);
  return m ? m[1].trim().toLowerCase() === "true" : false;
}

/**
 * Produce ordered, de-duplicated absolute candidate paths for a reference.
 * The changelog-relative location is always tried first (the common case). When
 * the reference is not changelog-relative, the resource roots are also tried,
 * matching how Liquibase resolves classpath-relative paths. Pure: no filesystem
 * access — callers decide which candidates actually exist.
 */
export function resolveReferencePaths(
  ref: FileReference,
  changelogDir: string,
  resourceRoots: string[]
): string[] {
  const candidates: string[] = [path.resolve(changelogDir, ref.value)];

  if (!ref.relativeToChangelogFile) {
    for (const root of resourceRoots) {
      candidates.push(path.resolve(root, ref.value));
    }
  }

  return [...new Set(candidates)];
}
