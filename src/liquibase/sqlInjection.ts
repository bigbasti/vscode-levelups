export interface SqlBlock {
  sql: string;
  innerStart: number; // offset in document of inner content start
  innerEnd: number; // offset of inner content end
}

const OPEN_TAG_RE = /<sql\b[^>]*>/g;
const CLOSE_TAG = "</sql>";

/**
 * Find the <sql>...</sql> block that encloses the given offset, if any. The
 * whole element counts as "inside" — from the start of the opening <sql> tag
 * through the end of the closing </sql> tag — so positions on either tag (such
 * as the CodeLens anchor at the opening tag) resolve correctly. Ignores
 * self-closing <sqlFile .../> tags. The returned `sql` is the inner content.
 */
export function findEnclosingSqlBlock(
  xml: string,
  offset: number
): SqlBlock | undefined {
  OPEN_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_TAG_RE.exec(xml)) !== null) {
    if (m[0].endsWith("/>")) continue;
    const blockStart = m.index;
    const innerStart = m.index + m[0].length;
    const closeIdx = xml.indexOf(CLOSE_TAG, innerStart);
    if (closeIdx === -1) continue;
    const blockEnd = closeIdx + CLOSE_TAG.length;
    if (offset >= blockStart && offset <= blockEnd) {
      return {
        sql: xml.slice(innerStart, closeIdx).trim(),
        innerStart,
        innerEnd: closeIdx,
      };
    }
  }
  return undefined;
}
