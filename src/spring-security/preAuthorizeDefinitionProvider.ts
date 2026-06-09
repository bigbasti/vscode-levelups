import type * as vscode from "vscode";
import { BeanIndex } from "./beanIndex";
import { parseSpel, SpelTokenKind, tokenAtOffset } from "./spelParser";
import { findMethodLocation } from "../java/javaMethodResolver";

export interface TargetLocation {
  filePath: string;
  line: number;
  column: number;
}

export type TypeResolver = (simpleName: string) => TargetLocation | undefined;

/** Pure resolution: given a SpEL expression and an offset into it, find target. */
export function resolveSpelTarget(
  expr: string,
  offset: number,
  beans: BeanIndex,
  resolveType: TypeResolver
): TargetLocation | undefined {
  const tokens = parseSpel(expr);
  const token = tokenAtOffset(tokens, offset);
  if (!token) return undefined;

  if (token.kind === SpelTokenKind.Bean && token.beanName) {
    const bean = beans.get(token.beanName);
    if (!bean) return undefined;
    return { filePath: bean.filePath, line: bean.classLine, column: bean.classColumn };
  }

  if (token.kind === SpelTokenKind.Method && token.beanName && token.methodName) {
    const bean = beans.get(token.beanName);
    if (!bean) return undefined;
    const method = findMethodLocation(bean, token.methodName);
    if (!method) return undefined;
    return { filePath: method.filePath, line: method.line, column: method.column };
  }

  if (token.kind === SpelTokenKind.Type && token.simpleName) {
    return resolveType(token.simpleName);
  }

  return undefined;
}

const PREAUTH_RE = /@PreAuthorize\s*\(/;

/**
 * Finds the @PreAuthorize string region the cursor sits inside and returns the
 * concatenated literal contents plus the offset of the cursor within it.
 */
export function extractPreAuthorizeContext(
  fullText: string,
  cursorOffset: number
): { expr: string; offsetInExpr: number } | undefined {
  const annoIdx = fullText.lastIndexOf("@PreAuthorize", cursorOffset);
  if (annoIdx === -1) return undefined;
  if (!PREAUTH_RE.test(fullText.slice(annoIdx, annoIdx + 20))) return undefined;

  // Find the closing paren of the annotation from annoIdx.
  const open = fullText.indexOf("(", annoIdx);
  if (open === -1 || cursorOffset < open) return undefined;
  let depth = 0;
  let close = -1;
  for (let i = open; i < fullText.length; i++) {
    const c = fullText[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1 || cursorOffset > close) return undefined;

  // Concatenate string literals within (open, close), tracking mapping back to
  // source offsets so we can translate cursor position.
  const region = fullText.slice(open + 1, close);
  const literalRe = /"((?:[^"\\]|\\.)*)"/g;
  let expr = "";
  let offsetInExpr = -1;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(region)) !== null) {
    const contentStartInSource = open + 1 + m.index + 1;
    const content = m[1];
    if (
      cursorOffset >= contentStartInSource &&
      cursorOffset <= contentStartInSource + content.length
    ) {
      offsetInExpr = expr.length + (cursorOffset - contentStartInSource);
    }
    expr += content;
  }
  if (offsetInExpr === -1) return undefined;
  return { expr, offsetInExpr };
}

export class PreAuthorizeDefinitionProvider
  implements vscode.DefinitionProvider
{
  constructor(
    private readonly beans: BeanIndex,
    private readonly resolveType: TypeResolver
  ) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const ctx = extractPreAuthorizeContext(text, offset);
    if (!ctx) return undefined;

    const target = resolveSpelTarget(
      ctx.expr,
      ctx.offsetInExpr,
      this.beans,
      this.resolveType
    );
    if (!target) return undefined;

    // vscode is only available in the extension host, so it is required lazily
    // here. This keeps the module (and the pure resolveSpelTarget logic it
    // exports) loadable in plain Node unit tests where vscode is absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vs: typeof import("vscode") = require("vscode");
    return new vs.Location(
      vs.Uri.file(target.filePath),
      new vs.Position(target.line, target.column)
    );
  }
}
