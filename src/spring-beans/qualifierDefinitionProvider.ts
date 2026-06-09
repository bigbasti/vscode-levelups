import type * as vscode from "vscode";
import { BeanIndex } from "../spring-security/beanIndex";

export interface QualifierReference {
  name: string;
  start: number; // document offset of the value's first character
  end: number; // document offset just past the value's last character
}

const QUALIFIER_RE = /@Qualifier\s*\(\s*"([^"]*)"/g;

/**
 * If `offset` is inside the string value of an @Qualifier("...") annotation,
 * return the referenced bean name and its value range. Pure: no vscode access.
 */
export function extractQualifierBeanAt(
  text: string,
  offset: number
): QualifierReference | undefined {
  QUALIFIER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUALIFIER_RE.exec(text)) !== null) {
    const quoteIdx = m[0].indexOf('"');
    const start = m.index + quoteIdx + 1;
    const end = start + m[1].length;
    if (offset >= start && offset <= end) {
      return { name: m[1], start, end };
    }
  }
  return undefined;
}

/**
 * Navigates from @Qualifier("beanName") to the bean (a @Bean factory method or
 * a @Service/@Component/etc. class) registered under that name.
 */
export class QualifierDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly beans: BeanIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.LocationLink[] | undefined {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vs: typeof import("vscode") = require("vscode");

    const text = document.getText();
    const offset = document.offsetAt(position);
    const ref = extractQualifierBeanAt(text, offset);
    if (!ref) return undefined;

    const bean = this.beans.get(ref.name);
    if (!bean) return undefined;

    const originSelectionRange = new vs.Range(
      document.positionAt(ref.start),
      document.positionAt(ref.end)
    );
    const targetPos = new vs.Position(bean.classLine, bean.classColumn);

    return [
      {
        originSelectionRange,
        targetUri: vs.Uri.file(bean.filePath),
        targetRange: new vs.Range(targetPos, targetPos),
      },
    ];
  }
}
