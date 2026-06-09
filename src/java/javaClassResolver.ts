export interface MethodInfo {
  name: string;
  filePath: string;
  line: number; // 0-based
  column: number; // 0-based, points at method name
}

export interface BeanInfo {
  beanName: string;
  className: string;
  filePath: string;
  classLine: number;
  classColumn: number;
  methods: MethodInfo[];
}

const STEREOTYPES = [
  "Service",
  "Component",
  "Repository",
  "Controller",
  "RestController",
];

export function defaultBeanName(className: string): string {
  if (!className) return className;
  return className.charAt(0).toLowerCase() + className.slice(1);
}

const STEREOTYPE_RE = new RegExp(
  `@(${STEREOTYPES.join("|")})\\b(?:\\s*\\(\\s*(?:value\\s*=\\s*)?"([^"]+)"\\s*\\))?`
);
const CLASS_RE = /\b(?:public\s+|final\s+|abstract\s+)*class\s+([A-Za-z_$][\w$]*)/;
const ENUM_RE = /\b(?:public\s+)?enum\s+([A-Za-z_$][\w$]*)/;
const METHOD_RE =
  /(?:public|protected|private)\s+(?:static\s+)?[\w<>[\],?.\s]+?\s+([A-Za-z_$][\w$]*)\s*\(/;

export function detectBeansInSource(
  source: string,
  filePath: string
): BeanInfo[] {
  const lines = source.split(/\r?\n/);
  const beans: BeanInfo[] = [];

  let pendingName: string | undefined;
  let pendingStereotype = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const st = STEREOTYPE_RE.exec(line);
    if (st) {
      pendingStereotype = true;
      pendingName = st[2];
      continue;
    }
    const cls = CLASS_RE.exec(line);
    if (cls && pendingStereotype) {
      const className = cls[1];
      const methods = collectMethods(lines, i, filePath);
      beans.push({
        beanName: pendingName ?? defaultBeanName(className),
        className,
        filePath,
        classLine: i,
        classColumn: line.indexOf(className),
        methods,
      });
      pendingStereotype = false;
      pendingName = undefined;
    } else if (cls) {
      // class without stereotype on the preceding line resets pending
      pendingStereotype = false;
      pendingName = undefined;
    }
  }
  return beans;
}

function collectMethods(
  lines: string[],
  classLine: number,
  filePath: string
): MethodInfo[] {
  const methods: MethodInfo[] = [];
  for (let i = classLine + 1; i < lines.length; i++) {
    const m = METHOD_RE.exec(lines[i]);
    if (m && !lines[i].includes("class ") && !lines[i].includes("=")) {
      const name = m[1];
      methods.push({
        name,
        filePath,
        line: i,
        column: lines[i].indexOf(name),
      });
    }
  }
  return methods;
}

export interface TypeLocation {
  filePath: string;
  line: number;
  column: number;
}

export function findTypeInSource(
  source: string,
  filePath: string,
  simpleName: string
): TypeLocation | undefined {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cls = CLASS_RE.exec(lines[i]);
    const en = ENUM_RE.exec(lines[i]);
    if ((cls && cls[1] === simpleName) || (en && en[1] === simpleName)) {
      const col = lines[i].indexOf(simpleName);
      return { filePath, line: i, column: col };
    }
  }
  return undefined;
}
