export interface SqlBlock {
  sql: string;
  innerStart: number; // offset in document of inner content start
  innerEnd: number; // offset of inner content end
}

const OPEN_TAG_RE = /<sql\b[^>]*>/g;

/**
 * Find the <sql>...</sql> block that encloses the given offset, if any.
 * Ignores self-closing <sqlFile .../> tags.
 */
export function findEnclosingSqlBlock(
  xml: string,
  offset: number
): SqlBlock | undefined {
  OPEN_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_TAG_RE.exec(xml)) !== null) {
    if (m[0].endsWith("/>")) continue;
    const innerStart = m.index + m[0].length;
    const closeIdx = xml.indexOf("</sql>", innerStart);
    if (closeIdx === -1) continue;
    if (offset >= innerStart && offset <= closeIdx) {
      return {
        sql: xml.slice(innerStart, closeIdx).trim(),
        innerStart,
        innerEnd: closeIdx,
      };
    }
  }
  return undefined;
}
