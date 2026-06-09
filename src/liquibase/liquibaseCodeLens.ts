import type * as vscode from "vscode";
import { isLiquibaseChangelog } from "./liquibaseDetector";

const OPEN_SQL_RE = /<sql\b[^>]*>/g;

/**
 * Surfaces an "Execute SQL Block" CodeLens above each non-self-closing <sql>
 * element in a Liquibase changelog.
 */
export class LiquibaseCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.CodeLens[] | undefined {
    // vscode is only available in the extension host, so it is required lazily.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vs: typeof import("vscode") = require("vscode");
    const text = document.getText();
    if (!isLiquibaseChangelog(text)) return undefined;

    const lenses: vscode.CodeLens[] = [];
    let m: RegExpExecArray | null;
    OPEN_SQL_RE.lastIndex = 0;
    while ((m = OPEN_SQL_RE.exec(text)) !== null) {
      if (m[0].endsWith("/>")) continue;
      const pos = document.positionAt(m.index);
      lenses.push(
        new vs.CodeLens(new vs.Range(pos, pos), {
          title: "Execute SQL Block",
          command: "vscodeLevelups.executeSql",
          arguments: [pos],
        })
      );
    }
    return lenses;
  }
}
