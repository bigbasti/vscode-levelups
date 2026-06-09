import type * as vscode from "vscode";
import { PropertyIndex } from "./propertyIndex";

/**
 * If the given offset is inside a ${...} placeholder, return the property key
 * (without any :default suffix). Otherwise undefined.
 */
export function extractPropertyKeyAt(
  text: string,
  offset: number
): string | undefined {
  const open = text.lastIndexOf("${", offset);
  if (open === -1) return undefined;
  const close = text.indexOf("}", open);
  if (close === -1 || offset > close) return undefined;
  const inner = text.slice(open + 2, close);
  const key = inner.split(":")[0].trim();
  return key.length ? key : undefined;
}

export class ValueDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly properties: PropertyIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const key = extractPropertyKeyAt(text, offset);
    if (!key) return undefined;

    const locs = this.properties.get(key);
    if (!locs.length) return undefined;

    // vscode is only available in the extension host, so it is required lazily
    // here. This keeps the module (and the pure extractPropertyKeyAt logic it
    // exports) loadable in plain Node unit tests where vscode is absent.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vs: typeof import("vscode") = require("vscode");
    return locs.map(
      (l) =>
        new vs.Location(
          vs.Uri.file(l.filePath),
          new vs.Position(l.line, l.column)
        )
    );
  }
}
