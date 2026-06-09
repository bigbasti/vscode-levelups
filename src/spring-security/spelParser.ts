export enum SpelTokenKind {
  Bean = "bean",
  Method = "method",
  Type = "type",
  Param = "param",
}

export interface SpelToken {
  kind: SpelTokenKind;
  start: number; // offset within expression of the navigable identifier
  end: number;
  beanName?: string;
  methodName?: string;
  fqcn?: string;
  simpleName?: string;
  paramName?: string;
}

const BEAN_RE = /@([a-zA-Z_$][\w$]*)(?:\s*\.\s*([a-zA-Z_$][\w$]*))?/g;
const TYPE_RE = /T\(\s*([\w.]+)\s*\)/g;
const PARAM_RE = /#([a-zA-Z_$][\w$]*)/g;

export function parseSpel(expr: string): SpelToken[] {
  const tokens: SpelToken[] = [];

  let m: RegExpExecArray | null;

  BEAN_RE.lastIndex = 0;
  while ((m = BEAN_RE.exec(expr)) !== null) {
    const beanName = m[1];
    const methodName = m[2];
    const beanStart = m.index + 1; // skip '@'
    tokens.push({
      kind: SpelTokenKind.Bean,
      start: beanStart,
      end: beanStart + beanName.length,
      beanName,
    });
    if (methodName) {
      const methodStart = expr.indexOf(methodName, beanStart + beanName.length);
      tokens.push({
        kind: SpelTokenKind.Method,
        start: methodStart,
        end: methodStart + methodName.length,
        beanName,
        methodName,
      });
    }
  }

  TYPE_RE.lastIndex = 0;
  while ((m = TYPE_RE.exec(expr)) !== null) {
    const fqcn = m[1];
    const simpleName = fqcn.split(".").pop()!;
    const simpleStart = expr.indexOf(simpleName, m.index);
    tokens.push({
      kind: SpelTokenKind.Type,
      start: simpleStart,
      end: simpleStart + simpleName.length,
      fqcn,
      simpleName,
    });
  }

  PARAM_RE.lastIndex = 0;
  while ((m = PARAM_RE.exec(expr)) !== null) {
    const paramName = m[1];
    const start = m.index + 1;
    tokens.push({
      kind: SpelTokenKind.Param,
      start,
      end: start + paramName.length,
      paramName,
    });
  }

  return tokens.sort((a, b) => a.start - b.start);
}

/** Returns the token whose identifier range contains the given offset. */
export function tokenAtOffset(
  tokens: SpelToken[],
  offset: number
): SpelToken | undefined {
  return tokens.find((t) => offset >= t.start && offset <= t.end);
}
